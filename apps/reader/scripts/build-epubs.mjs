/**
 * build-epubs.mjs — Build-time EPUB generation and catalog patching
 *
 * For each book-data/<category>/<slug>.json, generates a minimal EPUB 2.0
 * and writes it to public/book-data/<category>/<slug>.epub.
 * Then patches public/book-data/index.json with an `epubUrl` field.
 *
 * Usage: node scripts/build-epubs.mjs
 * Must be run from apps/reader/ as working directory.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import JSZip from 'jszip'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const BOOK_DATA_SRC = path.join(ROOT, 'book-data')
const BOOK_DATA_OUT = path.join(ROOT, 'public', 'book-data')
const INDEX_JSON = path.join(BOOK_DATA_OUT, 'index.json')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Decode common HTML entities to plain text (must run BEFORE xmlEscape to avoid double-encoding). */
function decodeHtmlEntities(str) {
  return str
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
}

/** Escape a string for safe inclusion in XML/XHTML. */
function xmlEscape(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Extract plain-text paragraphs from HTML content.
 * Mirrors the normalizeParagraphs logic from book.schema.ts.
 */
function extractParagraphs(htmlContent) {
  if (!htmlContent) return []
  // Split on closing block tags
  const parts = htmlContent
    .replace(/<br\s*\/?>/gi, '\n')
    .split(/<\/(?:p|div|li)>/gi)
  return parts
    .map((part) => decodeHtmlEntities(part.replace(/<[^>]*>/g, '').trim()))
    .filter((p) => p.length > 0)
}

/** Recursively collect all .json files under a directory. */
function collectJsonFiles(dir) {
  const results = []
  if (!fs.existsSync(dir)) return results
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      results.push(...collectJsonFiles(fullPath))
    } else if (entry.isFile() && entry.name.endsWith('.json')) {
      results.push(fullPath)
    }
  }
  return results
}

// ---------------------------------------------------------------------------
// EPUB generation
// ---------------------------------------------------------------------------

/**
 * Build a minimal EPUB 2.0 zip buffer for the given book JSON.
 * @param {{ book_name: string, chapters: Array<{ pages: Array<{ html_content: string }> }> }} book
 */
async function buildEpub(book) {
  const title = xmlEscape(book.book_name ?? 'Untitled')

  const uid = book.id ?? `book-${Date.now()}`

  // --- mimetype (MUST be STORE, no compression) ---
  const mimetypeContent = 'application/epub+zip'

  // --- META-INF/container.xml ---
  const containerXml = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`

  // Collect paragraphs per chapter so we can create one content file (and TOC entry) per chapter.
  const rawChapters = Array.isArray(book.chapters) ? book.chapters : []
  const chapterParagraphs = rawChapters.map((chapter) => {
    const paras = []
    for (const page of chapter.pages ?? []) {
      paras.push(...extractParagraphs(page.html_content ?? ''))
    }
    return paras
  })

  // Filter out chapters that end up with no paragraphs
  const nonEmptyChapters = chapterParagraphs
    .map((paras, idx) => ({ index: idx, paragraphs: paras }))
    .filter((c) => c.paragraphs.length > 0)

  // Fallback: if everything is empty, create a single synthetic chapter so EPUB stays valid.
  const effectiveChapters =
    nonEmptyChapters.length > 0
      ? nonEmptyChapters
      : [{ index: 0, paragraphs: [`${title}`] }]

  // Build manifest & spine items for each chapter file (content-1.xhtml, content-2.xhtml, ...)
  const manifestItems = effectiveChapters
    .map(
      (c, i) =>
        `    <item id="content-${i + 1}" href="content-${i + 1}.xhtml" media-type="application/xhtml+xml"/>`,
    )
    .join('\n')

  const spineItems = effectiveChapters
    .map((_, i) => `    <itemref idref="content-${i + 1}"/>`)
    .join('\n')

  // --- OEBPS/content.opf ---
  const contentOpf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="BookId">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
    <dc:title>${title}</dc:title>
    <dc:identifier id="BookId" opf:scheme="UUID">${xmlEscape(uid)}</dc:identifier>
    <dc:language>vi</dc:language>
  </metadata>
  <manifest>
${manifestItems}
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
  </manifest>
  <spine toc="ncx">
${spineItems}
  </spine>
</package>`

  // --- OEBPS/content-*.xhtml ---
  const contentFiles = effectiveChapters.map((chapter, i) => {
    const chapterBody =
      chapter.paragraphs.length > 0
        ? chapter.paragraphs.map((p) => `    <p>${xmlEscape(p)}</p>`).join('\n')
        : `    <p></p>`

    const rawChapterName = (rawChapters[chapter.index]?.chapter_name ?? '').trim()
    const chapterTitle =
      effectiveChapters.length === 1 ? title : xmlEscape(rawChapterName || `Chương ${chapter.index + 1}`)

    const xhtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="vi">
  <head>
    <meta http-equiv="Content-Type" content="application/xhtml+xml; charset=utf-8"/>
    <title>${chapterTitle}</title>
  </head>
  <body>
    <h1>${chapterTitle}</h1>
${chapterBody}
  </body>
</html>`
    return { filename: `OEBPS/content-${i + 1}.xhtml`, xhtml }
  })

  // --- OEBPS/toc.ncx ---
  const navPoints = effectiveChapters
    .map((chapter, i) => {
      const playOrder = i + 1
      const rawChapterName = (rawChapters[chapter.index]?.chapter_name ?? '').trim()
      const labelText =
        effectiveChapters.length === 1 ? title : xmlEscape(rawChapterName || `Chương ${chapter.index + 1}`)
      const src = `content-${i + 1}.xhtml`
      return `    <navPoint id="navpoint-${playOrder}" playOrder="${playOrder}">
      <navLabel><text>${labelText}</text></navLabel>
      <content src="${src}"/>
    </navPoint>`
    })
    .join('\n')

  const tocNcx = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE ncx PUBLIC "-//NISO//DTD ncx 2005-1//EN" "http://www.daisy.org/z3986/2005/ncx-2005-1.dtd">
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="${xmlEscape(uid)}"/>
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle><text>${title}</text></docTitle>
  <navMap>
${navPoints}
  </navMap>
</ncx>`

  const zip = new JSZip()
  // mimetype MUST be first and MUST use STORE (no compression)
  zip.file('mimetype', mimetypeContent, { compression: 'STORE' })
  zip.file('META-INF/container.xml', containerXml)
  zip.file('OEBPS/content.opf', contentOpf)
  for (const file of contentFiles) {
    zip.file(file.filename, file.xhtml)
  }
  zip.file('OEBPS/toc.ncx', tocNcx)

  return zip.generateAsync({ type: 'nodebuffer' })
}

// ---------------------------------------------------------------------------
// Catalog patching
// ---------------------------------------------------------------------------

/** Patch index.json to add epubUrl on each book entry that has a corresponding EPUB. */
function patchCatalog(epubPaths) {
  if (!fs.existsSync(INDEX_JSON)) {
    console.log('[build-epubs] public/book-data/index.json not found — skipping catalog patch')
    return
  }

  const raw = JSON.parse(fs.readFileSync(INDEX_JSON, 'utf-8'))
  const books = raw.books ?? []
  let patched = 0

  for (const book of books) {
    const artifact = (book.artifacts ?? []).find((a) => a.format === 'json')
    if (!artifact) continue
    // artifact.path = e.g. "vbeta/some-sutra.json"
    const epubRelPath = artifact.path.replace(/\.json$/, '.epub')
    const epubAbsPath = path.join(BOOK_DATA_OUT, epubRelPath)
    if (epubPaths.has(epubAbsPath)) {
      book.epubUrl = `/book-data/${epubRelPath}`
      patched++
    }
  }

  fs.writeFileSync(INDEX_JSON, JSON.stringify(raw, null, 2), 'utf-8')
  console.log(`[build-epubs] Patched ${patched} catalog entries with epubUrl`)
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

try {
  const jsonFiles = collectJsonFiles(BOOK_DATA_SRC)

  if (jsonFiles.length === 0) {
    console.log('[build-epubs] No source JSON files found in book-data/ — nothing to do')
    process.exit(0)
  }

  console.log(`[build-epubs] Found ${jsonFiles.length} book JSON file(s)`)

  const generatedEpubs = new Set()

  for (const srcPath of jsonFiles) {
    const book = JSON.parse(fs.readFileSync(srcPath, 'utf-8'))

    // Derive output path: book-data/vbeta/foo.json → public/book-data/vbeta/foo.epub
    const rel = path.relative(BOOK_DATA_SRC, srcPath)
    const outPath = path.join(BOOK_DATA_OUT, rel.replace(/\.json$/, '.epub'))
    const outDir = path.dirname(outPath)

    fs.mkdirSync(outDir, { recursive: true })

    const epubBuffer = await buildEpub(book)
    fs.writeFileSync(outPath, epubBuffer)
    generatedEpubs.add(outPath)

    console.log(`[build-epubs] Generated: ${path.relative(ROOT, outPath)}`)
  }

  patchCatalog(generatedEpubs)
  console.log('[build-epubs] Done')
} catch (err) {
  console.error('[build-epubs] Fatal error:', err)
  process.exit(1)
}
