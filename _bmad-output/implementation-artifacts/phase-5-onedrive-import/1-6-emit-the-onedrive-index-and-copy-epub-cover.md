# Story 1.6: Emit the onedrive index and copy epub + cover

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As the operator,
I want each kept book's epub and cover copied and an `onedrive/index.json` emitted with a resolvable `epubUrl`,
so that the served catalog conforms to the Sách Truyện contract and every record points at a real file.

## Acceptance Criteria

1. **Given** a kept, mapped book (post 1.3–1.5)
   **When** files are staged for publish
   **Then** its epub is copied into the publish payload at `onedrive/nhasachmienphi/<basename>.epub` and its `imageFile` (jpg) is copied **as-is** to `onedrive/cover/{id}.jpg` — no transcoding, no Pillow (AR10).

2. **Given** the existing per-source catalog contract (`{_meta, books[]}` root object, reader reads `books[]`)
   **When** `index.json` is emitted for the onedrive namespace
   **Then** each record carries `id`, `book_name`, `category_name` (mapped), optional `author`, `cover_image_url`, `source = "onedrive"`, and a resolvable `epubUrl` (FR15)
   **And** the carried original manifest `category` is preserved on the record for future taxonomy use (FR5).

3. **Given** the reader resolves `epubUrl` relative to the book-data base (see Dev Notes)
   **When** `epubUrl` is written
   **Then** it is the book-data-relative path `onedrive/nhasachmienphi/<basename>.epub` (the same shape `cover_image_url` uses), so the reader can fetch it from `{base}/book-data/onedrive/nhasachmienphi/<basename>.epub`.

4. **Given** a manifest entry that ever lacks title/author
   **When** metadata is resolved
   **Then** `extract.py` (stdlib `zipfile` + `lxml`) OPF-cracks the epub as a **defensive fallback only** — off the Phase-1 critical path, since the manifest supplies metadata for all 2,343 epub (AR11). A committed `fixtures/sample.epub` makes the OPF/cover tests hermetic.

5. **Given** `compose.py` merges the onedrive fragment
   **When** it runs
   **Then** the merge is namespace-scoped (only `onedrive:`-prefixed ids replaced/added), keyed by `id`, output `books[]` sorted by `id`, written atomically (temp file + `os.replace`); records outside the namespace are preserved untouched (FR19, AR8).

## Tasks / Subtasks

- [ ] **Task 1: Copy epub + cover into payload** (AC: #1, #3)
  - [ ] For each kept book, copy `staging/onedrive/nhasachmienphi/<basename>.epub` → `<publish>/onedrive/nhasachmienphi/<basename>.epub`.
  - [ ] Copy `staging/onedrive/nhasachmienphi/<basename of imageFile>` → `<publish>/onedrive/cover/{id}.jpg` (id is colon form; ensure filesystem-safe — colons are fine on macOS/ext4 but consider that the URL will contain them; see Dev Notes on id-in-filename).
  - [ ] No transcoding; keep original jpg bytes (AR10).
- [ ] **Task 2: Build index records** (AC: #2, #3)
  - [ ] Per book, build a record dict: `id`, `book_name` (title), `category_name` (mapped target), `author` (nullable), `cover_image_url` = `onedrive/cover/{id}.jpg`, `source = "onedrive"`, `epubUrl` = `onedrive/nhasachmienphi/<basename>.epub`, and a carried field for the original manifest `category` (e.g. `manifest_category` / `subcategory`) for FR5.
  - [ ] Wrap as `{ "_meta": {...}, "books": [...] }` root object to match the served per-source contract.
- [ ] **Task 3: `extract.py` OPF fallback (minimal)** (AC: #4)
  - [ ] Implement `from_opf(epub_path) -> (title, author)` and cover extraction using stdlib `zipfile` + `lxml.etree`: read `META-INF/container.xml` → OPF path → `dc:title`/`dc:creator`; cover via `<meta name="cover">` → manifest item href.
  - [ ] Use it ONLY when the manifest omits a field. Keep it small; the manifest always wins.
  - [ ] Commit `tests/fixtures/sample.epub` (valid container.xml + OPF + one cover image + one xhtml).
- [ ] **Task 4: `compose.py`** (AC: #5)
  - [ ] `compose(existing_index, onedrive_fragment) -> merged`: keep all records whose id is NOT `onedrive:`-prefixed; replace/add all `onedrive:` records from the fragment; sort `books[]` by `id`; write atomically (temp + `os.replace`).
  - [ ] Since onedrive ships as its own per-source `/book-data/onedrive/index.json`, the "existing" is the prior onedrive index (or empty) — compose still enforces namespace scoping in code (belt + suspenders).
- [ ] **Task 5: Wire `sync.py index`** end-to-end: filter → dedup → map/gate → copy payload → emit fragment → compose → write `<publish>/onedrive/index.json`.
- [ ] **Task 6: Tests**
  - [ ] Record shape: emitted record has all required keys, `source == "onedrive"`, `epubUrl` and `cover_image_url` are the expected relative paths, manifest category carried.
  - [ ] OPF fallback: given `sample.epub` + a manifest missing title/author, `from_opf` returns the OPF `dc:title`/`dc:creator`; cover extracted to `cover/{id}.jpg`.
  - [ ] Idempotent index: running `index` twice over same staging yields a byte-identical (sorted) `index.json`; ids do not duplicate.
  - [ ] compose non-destructive: composing an onedrive fragment over an index holding a crawler-style record preserves the crawler record and replaces only `onedrive:` ids.
  - [ ] `uv run pytest` green; `uv run ruff check .` clean.

## Dev Notes

- **Catalog contract (verified, do not guess):** the reader fetches per-source `/book-data/{source}/index.json` (`apps/reader/src/shared/services/data.service.ts:104`), each a root object `{_meta, books[]}`; `catalogSchema` reads `books[]` and ignores `_meta`. The reader's `rawCatalogBookSchema` already has `epubUrl: z.string().optional()` and `source` — so the **catalog needs no schema change**; just populate the fields. [Source: architecture-onedrive-import.md#Reality-check, apps/reader/src/shared/schemas/catalog.schema.ts]
- **Reader reads these catalog fields:** `id`, `book_name`, `author`, `category_name`, `cover_image_url`, `epubUrl`, `source` (+ optional `book_seo_name`, `category_seo_name`, `artifacts`). Match these names exactly (snake_case in JSON; the reader transforms to camelCase). [Source: apps/reader/src/shared/schemas/catalog.schema.ts]
- **epubUrl resolution decision (cross-cutting with Story 2.3):** the reader currently passes `catalogBook.epubUrl` **straight** into `ePub(epubUrl)` (`ReaderPage.tsx:39,46` → `useEpubReader.ts:49`) with no base-URL resolution. Covers, by contrast, go through `resolveCoverUrl` (`data.service.ts`). **Decision:** store `epubUrl` as a book-data-relative path (`onedrive/...epub`), and Story 2.3 adds reader-side resolution mirroring `resolveCoverUrl` (`{base}/book-data/{epubUrl}`). This keeps the URL stable across cloudflared tunnel changes (a full URL would rot). Document this contract in both stories. [Source: architecture-onedrive-import.md#Where-schema-change-needed, apps/reader/src/features/reader/ReaderPage.tsx, apps/reader/src/shared/services/data.service.ts]
- **id-in-filename / id-in-URL caution:** ids are `onedrive:nhasachmienphi:<slug>` (contain colons). Colons are legal in URLs in the path segment but can be awkward. The cover filename `cover/{id}.jpg` will contain colons. **Verify** the reader/Caddy serve a colon-containing path correctly; if problematic, sanitize the id for the *filename only* (e.g. replace `:` with `__`) while keeping the canonical colon id in the record's `id` field, and set `cover_image_url`/`epubUrl` to the sanitized filename. Decide and document; add a test. [Source: architecture-onedrive-import.md#Risks item 4]
- **Covers are jpg, copied as-is (AR10, resolves Risk #7):** source `imageFile` is jpg; no PNG transcoding, no Pillow. Name `cover/{id}.jpg`. [Source: architecture-onedrive-import.md#Cover]
- **OPF fallback is genuinely off the critical path (AR11/D6):** the manifest supplies title/author/cover/category for all 2,343 books. `extract.py` exists only as defensive fallback — keep it minimal, do not let it gate Phase 1. [Source: architecture-onedrive-import.md#AD-update, prd-onedrive-import.md#D6]
- **Compose isolation (AD-8/FR19):** because onedrive ships as its own `/book-data/onedrive/index.json` (a sibling of vnthuquan/vbeta), cross-source isolation is structural (separate files) AND enforced in code (namespace-scoped overwrite). Re-runs converge, never accumulate. Atomic write = temp + `os.replace`. [Source: architecture-onedrive-import.md#Index-Composition]

### Project Structure Notes

- Creates `compose.py`, `extract.py`, `tests/fixtures/sample.epub`, `tests/test_compose.py`, `tests/test_extract.py`. Extends `sync.py index`.
- Publish payload is assembled locally (e.g. under a build/output dir or directly in a `publish/` tree); Story 1.7 rsyncs it to the Pi. Decide the local publish dir and keep it gitignored if it holds book bytes.

### References

- [Source: architecture-onedrive-import.md#Data-Contract-Schema-Changes — Reality check]
- [Source: architecture-onedrive-import.md#Index-Composition — compose contract]
- [Source: architecture-onedrive-import.md#extract.py-design]
- [Source: architecture-onedrive-import.md#Cover, #AD-update]
- [Source: epics-onedrive-import.md#Story-1.6, AR8, AR10, AR11]
- [Source: prd-onedrive-import.md#FR5, FR15, FR19]
- [Source: apps/reader/src/shared/schemas/catalog.schema.ts — field names]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
