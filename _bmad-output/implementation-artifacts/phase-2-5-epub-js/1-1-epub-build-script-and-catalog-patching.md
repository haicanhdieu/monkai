# Story 1.1: EPUB Build Script and Catalog Patching

Status: done

## Story

As a content maintainer,
I want each sutra's JSON file automatically converted to a valid EPUB at build time,
so that epub.js can load any sutra without runtime conversion.

## Acceptance Criteria

1. **Given** a `book-data/*.json` file exists (with `id`, `book_name`, and `chapters` array per Phase 1 schema)
   **When** `pnpm run build:epubs` is executed
   **Then** a valid `.epub` file is written to `public/book-data/` mirroring the JSON path structure (e.g. `book-data/vbeta/some-sutra.json` → `public/book-data/vbeta/some-sutra.epub`)
   **And** each generated EPUB contains the required EPUB 2.0 structure: `mimetype`, `META-INF/container.xml`, `OEBPS/content.opf`, `OEBPS/content.xhtml` (title + paragraphs rendered as `<p>` elements), `OEBPS/toc.ncx`

2. **Given** `build-epubs.mjs` has run
   **When** the script completes
   **Then** `public/book-data/index.json` is patched with an `epubUrl` field on each catalog entry (e.g. `"epubUrl": "/book-data/vbeta/some-sutra.epub"`)
   **And** entries without a corresponding JSON source are left unchanged

3. **Given** the `build:epubs` npm script is defined in `apps/reader/package.json`
   **When** the CI pipeline runs
   **Then** `pnpm run build:epubs` executes successfully before `vite build`
   **And** build failures (invalid JSON, write errors) cause the script to exit non-zero (`process.exit(1)`)

## Tasks / Subtasks

- [x] Add `jszip` dev dependency to `apps/reader/package.json` (AC: 1)
  - [x] Run `pnpm add -D jszip` in `apps/reader/`
  - [x] Verify `epubjs` (added in Story 2.1) will bring it as a runtime dep too — `jszip` for build script is dev-only
- [x] Add `build:epubs` script to `apps/reader/package.json` (AC: 3)
  - [x] `"build:epubs": "node scripts/build-epubs.mjs"`
- [x] Create `apps/reader/scripts/build-epubs.mjs` (AC: 1, 2, 3)
  - [x] Discover all `book-data/**/*.json` source files (use Node `fs.readdirSync` or `glob`)
  - [x] For each book JSON, generate a minimal EPUB 2.0 package using jszip:
    - `mimetype` (no compression, must be first file)
    - `META-INF/container.xml`
    - `OEBPS/content.opf` (title, single spine item)
    - `OEBPS/content.xhtml` (XHTML doc with `<h1>` title + `<p>` for each paragraph)
    - `OEBPS/toc.ncx` (minimal NCX with single navPoint)
  - [x] Write `.epub` files to `public/book-data/` mirroring the JSON path
  - [x] Patch `public/book-data/index.json` in-place to add `epubUrl` to each entry
  - [x] Exit non-zero on any unhandled error
- [x] Update CI / GitHub Actions pipeline (AC: 3)
  - [x] Add `pnpm run build:epubs` step after lint/typecheck and before `vite build`

## Dev Notes

### Codebase Context

**Source book data location:** The script reads from `book-data/` (relative to `apps/reader/` project root at build time). In CI, the working directory is `apps/reader/`. Each `book-data/<category>/<slug>.json` has this shape (from `book.schema.ts`):
```json
{
  "id": "uuid-...",
  "book_name": "Kinh ...",
  "category_name": "Nikaya",
  "author": "...",
  "chapters": [
    { "pages": [{ "html_content": "<p>...</p>", "original_html_content": "..." }] }
  ]
}
```

**catalog `index.json` location:** `public/book-data/index.json`. Shape (raw, before Zod transform):
```json
{
  "books": [
    {
      "id": "uuid-...",
      "book_name": "...",
      "category_name": "...",
      "artifacts": [{ "source": "...", "format": "json", "path": "vbeta/some-sutra.json" }]
    }
  ]
}
```

**Paragraph extraction:** The same logic used in `book.schema.ts#normalizeParagraphs` — strip HTML tags, split on `<br>`, `<p>`, `<div>`, `<li>` close tags, then trim. Reimplement or inline similar logic in the build script (the build script is Node.js ESM; it cannot import from `src/`).

**EPUB 2.0 minimal structure:**
```
mimetype                          (text/application/epub+zip, STORE compression)
META-INF/container.xml            (points to OEBPS/content.opf)
OEBPS/content.opf                 (OPF manifest, spine)
OEBPS/content.xhtml               (XHTML 1.1 with <h1> + <p> tags)
OEBPS/toc.ncx                     (minimal NCX navigation doc)
```

**jszip usage pattern for EPUB (CRITICAL — mimetype must be STORED, not deflated):**
```js
import JSZip from 'jszip'

const zip = new JSZip()
// mimetype MUST be first and MUST use STORE (no compression)
zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' })
zip.file('META-INF/container.xml', containerXml)
zip.file('OEBPS/content.opf', contentOpf)
zip.file('OEBPS/content.xhtml', contentXhtml)
zip.file('OEBPS/toc.ncx', tocNcx)

const epubBuffer = await zip.generateAsync({ type: 'nodebuffer' })
fs.writeFileSync(outputPath, epubBuffer)
```

**EPUB output path pattern:**
- Input: `book-data/vbeta/bo-trung-quan.json`
- Output: `public/book-data/vbeta/bo-trung-quan.epub`
- `epubUrl` field: `/book-data/vbeta/bo-trung-quan.epub`

**Catalog patching:** Read `public/book-data/index.json`, find each book's artifact `path` field (JSON path like `vbeta/bo-trung-quan.json`), derive the EPUB path (replace `.json` → `.epub`), add `epubUrl: "/book-data/<derived-path>"` to the book entry, write back.

### Project Structure Notes

- New file: `apps/reader/scripts/build-epubs.mjs` — Node.js ESM script, no TypeScript, can use top-level await
- No changes to `src/` in this story
- The `scripts/` directory already has `mock-server.mjs`; follow the same ESM module style
- Use `node:fs`, `node:path`, `node:url` built-ins; avoid external deps beyond `jszip`

### Key Guardrails

- ❌ Do NOT write EPUBs to `src/` or `dist/` — output to `public/book-data/` only
- ❌ Do NOT use `require()` — this is ESM (`.mjs`)
- ❌ Do NOT import from `src/` — build script is standalone
- ✅ Paragraphs in the XHTML should be properly XML-escaped (use `&amp;`, `&lt;`, `&gt;`)
- ✅ XHTML content must be valid XML (self-close `<br/>`, use XHTML namespace)
- ✅ The `mimetype` entry must use `{ compression: 'STORE' }` in jszip — epub validators will reject DEFLATED mimetypes
- ✅ Exit with `process.exit(1)` in a top-level try/catch for CI failure

### Testing Standards

This story does not require Vitest unit tests. Verify manually:
1. `cd apps/reader && node scripts/build-epubs.mjs` produces `.epub` files in `public/book-data/`
2. Patch: `cat public/book-data/index.json | jq '.books[0].epubUrl'` returns a valid path
3. Validate an EPUB using `epubcheck` (optional) or open in epub.js directly (will be tested in Story 2.2)

### References

- EPUB build strategy: [Source: architecture-reader-ui-epubjs.md#Gap Analysis & Resolutions — Gap 1]
- jszip API: [Source: architecture-reader-ui-epubjs.md#Gap Analysis & Resolutions — Gap 1]
- Build pipeline: [Source: architecture-reader-ui-epubjs.md#Development & Deployment]
- Catalog patching: [Source: epics-reader-ui-epubjs.md#Story 1.1 Acceptance Criteria]
- Book JSON schema: [Source: apps/reader/src/shared/schemas/book.schema.ts]
- Catalog index schema: [Source: apps/reader/src/shared/schemas/catalog.schema.ts]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- Created `scripts/build-epubs.mjs`: Node.js ESM script using JSZip to generate EPUB 2.0 packages from book JSON files; gracefully exits 0 when no sources found, exits 1 on errors
- Added `"build:epubs": "node scripts/build-epubs.mjs"` to `package.json` scripts
- Added `jszip ^3.10.1` to devDependencies (pnpm add -D)
- Added `Build EPUBs` step in `.github/workflows/ci.yml` between unit tests and vite build
- Script handles: recursive JSON discovery, EPUB 2.0 structure (mimetype STORE, container.xml, content.opf, content.xhtml, toc.ncx), catalog patching with `epubUrl` field, XML escaping, paragraph extraction from HTML
- **Code review fix (2026-03-12):** Added `decodeHtmlEntities()` in `extractParagraphs` — HTML entities (`&amp;`, `&lt;`, etc.) are now decoded before `xmlEscape` runs, preventing double-encoding (e.g. `&amp;` → `&amp;amp;`) in generated EPUB XHTML

### File List

- apps/reader/scripts/build-epubs.mjs (new)
- apps/reader/package.json (modified)
- apps/reader/pnpm-lock.yaml (modified)
- .github/workflows/ci.yml (modified)
