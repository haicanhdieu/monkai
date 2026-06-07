# Story 2.3: Surface imported books and read them via epub.js

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a reader,
I want imported epub books to appear next to vnthuquan books and open in the existing reader,
so that every book I see is tappable and reads exactly like any other book.

## Acceptance Criteria

1. **Given** imported records in the merged Sách Truyện bucket (Story 2.2)
   **When** the browse list renders
   **Then** an imported book's card is visually **indistinguishable** from a vnthuquan card — same cover/title/author layout, no source badge, no "onedrive" text (FR4).

2. **Given** an imported book with an `epubUrl`
   **When** the user taps it
   **Then** `ReaderPage` resolves `epubUrl` from the catalog record and `useEpubReader` calls `ePub(resolvedUrl)` on a regular URL — the JSON→EPUB build path (`useEpubFromBook`/`bookToEpub`) is **never** exercised for onedrive books (FR7)
   **And** the book renders chapter by chapter with the same gestures, settings, pagination, and bookmark/shelf behaviour as existing books (NFR4).

3. **Given** the catalog stores `epubUrl` as a book-data-relative path (`onedrive/.../<basename>.epub`, per Story 1.6)
   **When** `ReaderPage` consumes it
   **Then** it is resolved to a fetchable URL via the book-data base (mirroring `resolveCoverUrl`), i.e. `{base}/book-data/{epubUrl}`, working in dev (`localhost:3001`) and prod (cloudflared tunnel).

4. **Given** a record whose `epubUrl` cannot be resolved on the Pi
   **When** the catalog is consumed
   **Then** that book is not surfaced (preserving the "every visible book is readable" guarantee) (NFR8) — primary enforcement is upstream (Story 1.7 sanity check), with the reader degrading gracefully (no crash) if a 404 still occurs.

## Tasks / Subtasks

- [x] **Task 1: epubUrl resolution helper** (AC: #3)
  - [x] Add `resolveEpubUrl(path: string | null): string | null` in `data.service.ts` mirroring `resolveCoverUrl`: pass through absolute `http(s)` URLs; otherwise `{base}/book-data/{path-without-leading-slash}` using `resolveBookDataBaseUrl()`.
  - [x] Decide application point: either apply it in `toCatalogBook` so `CatalogBook.epubUrl` is already absolute, OR apply it in `ReaderPage` when reading `catalogBook.epubUrl`. **Prefer resolving in the catalog transform** so every consumer gets a ready URL — but verify no existing consumer assumes a relative epubUrl. Document choice. [Source: apps/reader/src/shared/services/data.service.ts, catalog.schema.ts]
- [x] **Task 2: ReaderPage uses resolved catalog epubUrl** (AC: #2)
  - [x] `ReaderPage.tsx:39` already does `epubUrlFromCatalog = catalogBook?.epubUrl ?? null` and `epubUrl = epubUrlFromCatalog ?? epubUrlFromBook` (`:46`), passing to `useEpubReader` (`:48`). Ensure the resolved (absolute) URL flows here.
  - [x] Confirm `useEpubFromBook(epubUrlFromCatalog ? null : book ?? null)` (`:44`) → when catalog has epubUrl, the JSON build path is skipped (passes `null`). This is already correct; add a test guarding it for onedrive. [Source: apps/reader/src/features/reader/ReaderPage.tsx]
- [x] **Task 3: useEpubReader regular-URL path** (AC: #2)
  - [x] `useEpubReader.ts:40-49`: `blob:` URLs are fetched→ArrayBuffer→`ePub(buffer)`; regular URLs call `ePub(url)` directly. Onedrive epubUrl is a regular URL → hits `ePub(url)` (`:49`). No change expected; verify epub.js can fetch the cross-origin Pi URL (Caddy sets `access-control-allow-origin: *`). [Source: apps/reader/src/features/reader/useEpubReader.ts]
- [x] **Task 4: book-detail route tolerates no-JSON-artifact onedrive books** (AC: #2)
  - [x] Coordinate with Story 2.2 Task 4: onedrive catalog entries have no `json` artifact. Ensure tapping an onedrive card routes to ReaderPage and renders from catalog `epubUrl` without requiring a `getBook` JSON fetch (or `getBook` returns a minimal Book for onedrive). Verify the existing flow: ReaderPage reads `catalogBook` (catalog) for `epubUrl` and `book` (detail) for JSON content — for onedrive, `book` may be absent/empty and that must be OK because `epubUrlFromCatalog` is present. Trace and test. [Source: apps/reader/src/features/reader/ReaderPage.tsx]
- [x] **Task 5: Card indistinguishability** (AC: #1)
  - [x] Verify `SutraListCard` renders cover/title/author identically for an onedrive book; the `SOURCES.find` badge lookup returns undefined → no badge (desired). No `onedrive` string anywhere. [Source: apps/reader/src/features/library/SutraListCard.tsx]
- [x] **Task 6: Tests** (AC: #1, #2, #3)
  - [x] `resolveEpubUrl`: relative path → `{base}/book-data/...`; absolute URL passthrough; null → null.
  - [x] ReaderPage with an onedrive catalogBook (epubUrl set, no chapters/json) → `useEpubReader` receives the resolved URL; `useEpubFromBook` is called with `null` (build path skipped).
  - [x] SutraListCard for an onedrive book renders no source badge and identical layout.
  - [x] `pnpm test` green; `pnpm lint` clean; strict `tsc`.

## Dev Notes

- **The EPUB-direct render path already exists and is the whole point of AD-1.** `ReaderPage.tsx:46` resolves `epubUrl = epubUrlFromCatalog ?? epubUrlFromBook`; `useEpubReader.ts:49` calls `ePub(epubUrl)` on a regular URL. For onedrive books this path is *reused verbatim*; the JSON→EPUB fallback (`useEpubFromBook` → `bookToEpub.ts`) is for crawler books with no epubUrl and is **never** exercised here. Do not modify the JSON build path. [Source: architecture-onedrive-import.md#AD-1, apps/reader/src/features/reader/ReaderPage.tsx, useEpubReader.ts]
- **The one real reader gap is URL resolution.** Catalog `epubUrl` is passed straight to `ePub()` with no base resolution today (unlike covers, which use `resolveCoverUrl`). Since Story 1.6 stores `epubUrl` as a book-data-relative path (stable across tunnel changes), the reader MUST resolve it. Add `resolveEpubUrl` mirroring `resolveCoverUrl`. [Source: apps/reader/src/shared/services/data.service.ts]
- **CORS / cross-origin:** epub.js will `fetch` the epub from the Pi tunnel. Caddy already serves `/book-data/*` with `access-control-allow-origin: *` (verified for crawler data). The same applies to `/book-data/onedrive/*`. [Source: project-context.md#Deployment, architecture-onedrive-import.md#Security-Auth]
- **NFR4 — identical reading experience:** gestures, settings, pagination, bookmark/shelf all come from the shared epub.js reader; nothing onedrive-specific is added to the reader UI. [Source: prd-onedrive-import.md#Reading-Experience, #NFR4]
- **NFR8 — every visible book readable:** enforcement is primarily upstream (Story 1.7: don't surface a book whose epub isn't on the Pi). The reader should still fail soft (existing error states) rather than crash on an unexpected 404. [Source: prd-onedrive-import.md#NFR8]
- **Storage rules still apply:** any blob caching only via `StorageService` + keys in `storage.keys.ts`; never `localStorage`/`indexedDB`/localforage directly. (Onedrive books use a regular URL, not a blob, so the `EPUB_BLOB_CACHE_PREFIX` path is not involved — but don't introduce direct storage.) [Source: project-context.md#Reader-specific]

### Project Structure Notes

- Touches: `data.service.ts` (`resolveEpubUrl`, maybe apply in `toCatalogBook` via `catalog.schema.ts`), `ReaderPage.tsx` (consume resolved URL), tests. Likely no change to `useEpubReader.ts` (verify only).
- Depends on Story 2.1 (schema), Story 2.2 (merged bucket + getBook handling), Story 1.6 (epubUrl path contract).

### References

- [Source: architecture-onedrive-import.md#AD-1 — serve raw epub, no transform]
- [Source: architecture-onedrive-import.md#Overview — ReaderPage/useEpubReader already wired]
- [Source: epics-onedrive-import.md#Story-2.3]
- [Source: prd-onedrive-import.md#FR4, FR7, NFR4, NFR8]
- [Source: apps/reader/src/features/reader/ReaderPage.tsx, useEpubReader.ts]
- [Source: apps/reader/src/shared/services/data.service.ts — resolveCoverUrl pattern]

## Dev Agent Record

### Agent Model Used
claude-sonnet-4-6

### Debug Log References
None

### Completion Notes List
- `resolveEpubUrl` added to `data.service.ts` (exported). Accepts optional `base` param so `StaticJsonDataService.resolveBookUrls` uses `this.baseUrl` rather than the global env function — this ensures tests with injected base URLs work correctly.
- Resolution applied in `StaticJsonDataService.resolveBookUrls` (private), called after every `getCatalog` fetch (single or merged). All `CatalogBook.epubUrl` values are absolute by the time they reach consumers.
- ReaderPage already correctly routes: `epubUrlFromCatalog` → `useEpubReader`, `useEpubFromBook(null)` when catalog has epubUrl. Verified with a new test case.
- `useEpubReader` regular-URL branch: no change needed. Onedrive URLs are regular https:// and hit `ePub(url)` directly.
- SutraListCard: `SOURCES.find(s => s.id === 'onedrive')` returns undefined → no badge rendered → no "onedrive" text visible (FR3 satisfied).

### File List
- apps/reader/src/shared/services/data.service.ts (modified — resolveEpubUrl exported, resolveBookUrls private method)
- apps/reader/src/shared/services/data.service.test.ts (modified — resolveEpubUrl tests)
- apps/reader/src/features/reader/ReaderPage.test.tsx (modified — onedrive guard test)
- apps/reader/src/features/library/SutraListCard.test.tsx (created)

### Change Log
- 2026-06-07: Implemented Story 2.3 — epubUrl resolution, ReaderPage guard test, SutraListCard indistinguishability test
