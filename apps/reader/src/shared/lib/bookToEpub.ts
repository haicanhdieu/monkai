/**
 * Build a minimal EPUB 2.0 in memory from Book (JSON) for use with epub.js.
 * Mirrors the structure produced by scripts/build-epubs.mjs.
 */

import JSZip from 'jszip'
import type { Book } from '@/shared/types/global.types'

function xmlEscape(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function sanitizeXml(text: string): string {
  return text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F\uFFFE\uFFFF]/g, '')
}

/**
 * Convert a Book (from JSON) into an EPUB 2.0 ArrayBuffer.
 * Used when the catalog has no epubUrl; the result can be cached and served to the reader via blob URL.
 */
export async function bookToEpubBuffer(book: Book): Promise<ArrayBuffer> {
  const rawTitle = book.title ?? 'Untitled'
  const title = xmlEscape(sanitizeXml(rawTitle)) // title and uid sanitized for consistency with paragraph content
  const rawUid = book.id ?? `book-${Date.now()}`
  const uid = sanitizeXml(rawUid)

  const mimetypeContent = 'application/epub+zip'

  const containerXml = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`

  const chaptersFromBook =
    Array.isArray(book.chaptersForEpub) && book.chaptersForEpub.length > 0
      ? book.chaptersForEpub
      : [
          {
            title,
            paragraphs: (book.content ?? []).map((p) => sanitizeXml(p)),
          },
        ]

  const effectiveChapters =
    chaptersFromBook.length > 0
      ? chaptersFromBook
      : [
          {
            title,
            paragraphs: [],
          },
        ]

  const manifestItems = effectiveChapters
    .map(
      (_chapter, index) =>
        `    <item id="content-${index + 1}" href="content-${index + 1}.xhtml" media-type="application/xhtml+xml"/>`,
    )
    .join('\n')

  const spineItems = effectiveChapters
    .map((_chapter, index) => `    <itemref idref="content-${index + 1}"/>`)
    .join('\n')

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

  const contentFiles = effectiveChapters.map((chapter, index) => {
    const bodyContent =
      chapter.paragraphs.length > 0
        ? chapter.paragraphs.map((p) => `    <p>${xmlEscape(sanitizeXml(p))}</p>`).join('\n')
        : `    <p></p>`

    const chapterTitle =
      effectiveChapters.length === 1 ? title : `${title} – Chương ${index + 1}`

    const contentXhtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="vi">
  <head>
    <meta http-equiv="Content-Type" content="application/xhtml+xml; charset=utf-8"/>
    <title>${chapterTitle}</title>
  </head>
  <body>
    <h1>${chapterTitle}</h1>
${bodyContent}
  </body>
</html>`

    return { filename: `OEBPS/content-${index + 1}.xhtml`, xhtml: contentXhtml }
  })

  const navPoints = effectiveChapters
    .map((chapter, index) => {
      const playOrder = index + 1
      const labelText =
        effectiveChapters.length === 1 ? title : chapter.title || `Chương ${index + 1}`
      const src = `content-${index + 1}.xhtml`
      return `    <navPoint id="navpoint-${playOrder}" playOrder="${playOrder}">
      <navLabel><text>${xmlEscape(sanitizeXml(labelText))}</text></navLabel>
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
  zip.file('mimetype', mimetypeContent, { compression: 'STORE' })
  zip.file('META-INF/container.xml', containerXml)
  zip.file('OEBPS/content.opf', contentOpf)
  for (const file of contentFiles) {
    zip.file(file.filename, file.xhtml)
  }
  zip.file('OEBPS/toc.ncx', tocNcx)

  return zip.generateAsync({ type: 'arraybuffer' })
}
