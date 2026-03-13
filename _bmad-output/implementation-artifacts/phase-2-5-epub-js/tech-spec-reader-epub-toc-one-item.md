---
title: 'Reader: EPUB TOC shows only one item'
slug: 'reader-epub-toc-one-item'
created: '2026-03-13'
status: 'implementation-complete'
stepsCompleted: [1, 2, 3, 4]
tech_stack: ['React 18', 'Vite 7', 'TypeScript', 'epub.js 0.3.x', 'JSZip', 'Zod', 'TanStack React Query', 'VitePWA/Workbox', 'Vitest', 'Playwright']
files_to_modify: ['apps/reader/src/shared/types/global.types.ts', 'apps/reader/src/shared/schemas/book.schema.ts', 'apps/reader/src/shared/lib/bookToEpub.ts', 'apps/reader/src/shared/constants/storage.keys.ts', 'apps/reader/src/features/reader/useEpubFromBook.ts', 'apps/reader/scripts/build-epubs.mjs', 'apps/reader/scripts/mock-server.mjs', 'apps/reader/vite.config.ts']
code_patterns: ['ReaderPage chooses epubUrlFromCatalog vs useEpubFromBook(blob)', 'mock-server serves JSON only from ../../book-data (dev)', 'bookSchema currently flattens raw chapters into Book.content (loses chapter boundaries)', 'bookToEpubBuffer emits single content.xhtml and single ncx navPoint', 'useEpubReader.getToc consumes epub.js book.navigation.toc (already flattens subitems)', 'EPUB blob caching via storageService + epubBlobCacheKey(prefix versioning)', 'Workbox runtimeCaching: CacheFirst for /book-data/*.epub (prod/PWA)']
test_patterns: ['Vitest unit tests (schema + EPUB builder)', 'useEpubFromBook tests with StorageService mocks and cache hits', 'ReaderPage/ChromelessLayout tests via mocked hooks', 'Playwright smoke to assert TOC entries count > 1 for multi-chapter fixture']
---

# Tech-Spec: Reader: EPUB TOC shows only one item

**Created:** 2026-03-13

## Overview

### Problem Statement

Reader TOC UI currently shows only a single entry for many books, even though the underlying Buddhist texts have multiple logical chapters/sections. The TOC drawer implementation (ChromelessLayout + TocDrawer + TocList + useEpubReader.getToc) correctly renders whatever epub.js exposes via `book.navigation.toc`, but our EPUB generation pipeline produces NCX/nav structures with only one navPoint/content document, so epub.js only sees a single TOC entry. Additionally, for books loaded from JSON (no catalog `epubUrl`), the in-app EPUB builder mirrors the same “single document, single navPoint” shape, and cached blobs can mask changes to EPUB structure.

### Solution

Introduce a proper multi-entry TOC at the EPUB level by emitting one content document and matching NCX/navPoint per logical chapter (using the existing `chapters` structure in crawler book JSON) in the build-time script, and mirror this behavior in the in-app `bookToEpub` builder for JSON-only books, while bumping the EPUB blob cache prefix so existing cached single-TOC EPUBs are invalidated. Keep the reader-side TOC UI unchanged (it already flattens and displays all entries), and focus changes on EPUB generation and caching so that `book.navigation.toc` reliably contains all chapters for both static and on-the-fly EPUBs.

### Scope

**In Scope:**
- Analyze and adjust `apps/reader/scripts/build-epubs.mjs` so that it emits multiple `content-*.xhtml` files and NCX `<navPoint>` entries based on `book.chapters`, ensuring ordering and compatibility with epub.js `navigation.toc`.
- Align `apps/reader/src/shared/lib/bookToEpub.ts` with the same multi-document, multi-navPoint structure for in-app EPUBs built from `Book` content.
- Update EPUB blob caching keys in `apps/reader/src/shared/services/storage.keys.ts` so previously cached single-TOC EPUB blobs are invalidated when structure changes.
- Add or update unit tests to validate generated OPF/NCX for books with multiple chapters and confirm `useEpubReader.getToc()` returns multiple entries for those EPUBs.

**Out of Scope:**
- Changing reader TOC UI/UX (drawer behavior, layout, labels, keyboard handling) beyond what is already implemented.
- Inferring fine-grained sections within a single chapter (e.g. per heading) for TOC entries; we limit to chapter-level navPoints for now.
- Modifying crawler scraping logic or upstream JSON chapter semantics; we treat existing `chapters` arrays as the source of truth.

## Context for Development

### Codebase Patterns

- Reader is a React 18 PWA using epub.js 0.3.x; all epub.js integration is encapsulated in `useEpubReader`, which already exposes `getToc()` and `navigateToTocEntry()` and flattens `book.navigation.toc` into `{ label, href }[]` consumed by TOC components.
- In **dev**, `pnpm dev` runs `scripts/mock-server.mjs` which serves **JSON only** from `apps/reader/book-data` (resolved as `../../book-data`) on `http://localhost:3001`. It does **not** serve `.epub` files; therefore `catalogBook.epubUrl` is typically absent and `ReaderPage` uses `useEpubFromBook` → `bookToEpubBuffer`.
- For books without `epubUrl`, `useEpubFromBook` caches the generated EPUB **Blob** under `epubBlobCacheKey(book.id)` and will reuse cached blobs unless `EPUB_BLOB_CACHE_PREFIX` is bumped.
- The current `bookSchema` transforms raw JSON `chapters[]` into a flat `Book.content: string[]`, discarding chapter boundaries and titles; `bookToEpubBuffer` mirrors the build-time script by emitting a single `content.xhtml` and a single NCX `<navPoint>`, which explains why epub.js `book.navigation.toc` (and therefore the TOC drawer) shows only one item in the UI.
- In **prod/PWA**, `.epub` URLs (when present in catalog) are additionally cached by Workbox (`CacheFirst` for `/book-data/*.epub`), so changes to prebuilt EPUBs may require cache-busting or strategy tweaks to ensure updated nav structures are fetched.
- `project-context.md` defines that `bookToEpub.ts` must “mirror the structure” of `build-epubs.mjs`, and that any change in EPUB generation logic must be accompanied by a bump of `EPUB_BLOB_CACHE_PREFIX` in `storage.keys.ts` so cached blobs don’t hide structural fixes.
- The reader TOC UI (ChromelessLayout + TocDrawer + TocList) already shows all entries returned by `getToc()` and is covered by unit tests for empty and non-empty TOCs; the symptom of “one item only” therefore indicates an upstream EPUB/nav issue, not a display bug.

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `apps/reader/src/features/reader/ReaderPage.tsx` | Chooses `epubUrlFromCatalog` vs `useEpubFromBook` and wires TOC hook into layout. |
| `apps/reader/src/features/reader/useEpubFromBook.ts` | Builds and caches in-memory EPUB blobs when catalog has no `epubUrl`. |
| `apps/reader/src/shared/schemas/book.schema.ts` | Parses raw book JSON; currently flattens chapters and loses TOC structure. |
| `apps/reader/src/shared/types/global.types.ts` | `Book` type currently lacks chapters; needs expansion if we want chapter-level TOC for JSON-built EPUBs. |
| `apps/reader/src/shared/lib/bookToEpub.ts` | In-app EPUB builder (currently single-file + single navPoint). |
| `apps/reader/src/shared/constants/storage.keys.ts` | Contains `EPUB_BLOB_CACHE_PREFIX` (must bump to invalidate cached EPUB blobs). |
| `apps/reader/scripts/mock-server.mjs` | Dev JSON server; serves from `../../book-data` and sets expectations for `epubUrl` availability. |
| `apps/reader/scripts/build-epubs.mjs` | Build-time JSON→EPUB generation (only applies if `book-data/` + `public/book-data/` are part of the build pipeline). |
| `apps/reader/vite.config.ts` | Workbox runtime caching (notably CacheFirst for `/book-data/*.epub`). |
| `apps/reader/src/features/reader/useEpubReader.ts` | Encapsulates epub.js integration and exposes `getToc()` and `navigateToTocEntry()` based on `book.navigation.toc`. |
| `apps/reader/src/features/reader/ChromelessLayout.tsx` | Reader chrome including TOC trigger and drawer; consumes `getToc` / `navigateToTocEntry`. |
| `_bmad-output/implementation-artifacts/phase-2-5-epub-js/1-1-epub-build-script-and-catalog-patching.md` | Earlier tech-spec describing the initial EPUB build script design and catalog patching behavior. |

### Technical Decisions

- **Root cause confirmed:** UI is correct; TOC count is determined by EPUB navigation. The current JSON→EPUB path (`useEpubFromBook` → `bookToEpubBuffer`) produces a single navPoint, so the TOC will always be one item in dev where `.epub` files are not served.
- To make TOC multi-entry for JSON-built EPUBs, we must **preserve chapter structure** in the reader data model (either extend `Book` to include chapters, or introduce a new `chaptersForEpub` shape specifically for EPUB generation). Otherwise, `bookToEpubBuffer` has no way to generate chapter-level navPoints.
- Any structural change to the in-app EPUB builder requires bumping `EPUB_BLOB_CACHE_PREFIX` so cached blobs don’t mask fixes.
- For catalog-provided `.epub` files (when present), account for Workbox CacheFirst caching; cache-busting (e.g., versioned filenames or query params) may be needed to ensure updated EPUB TOCs are fetched.

## Implementation Plan

### Tasks

- [x] Task 1: Extend Book type and schema to preserve chapter boundaries for EPUB generation  
  - File: `apps/reader/src/shared/types/global.types.ts`  
  - Action: Introduce an `EpubChapter` shape (e.g. `{ title: string; paragraphs: string[] }`) and a corresponding `chaptersForEpub?: EpubChapter[]` extension on the `Book`-derived type used by EPUB builders, so reader UI can continue to rely on flat `content` while EPUB builders consume structured chapters.  
  - Notes: Keep the existing `Book` contract stable for callers; treat `chaptersForEpub` as an internal extension used only by EPUB-related utilities and hooks.

- [x] Task 2: Expose chaptersForEpub from Zod book schema transform  
  - File: `apps/reader/src/shared/schemas/book.schema.ts`  
  - Action: Update `bookSchema` transform so it computes both `content` (as today) and `chaptersForEpub`, where each raw chapter becomes an `EpubChapter` with a synthetic title (e.g. `Chương N`) and `paragraphs` derived from the existing `normalizeParagraphs` logic grouped per chapter; ensure books with multiple chapters produce multiple entries in `chaptersForEpub` in the correct order.  
  - Notes: Add unit tests mirroring `normalizeParagraphs` tests but asserting chapter counts and paragraph membership per chapter.

- [x] Task 3: Refactor bookToEpubBuffer to emit one content document and navPoint per chapter  
  - File: `apps/reader/src/shared/lib/bookToEpub.ts`  
  - Action: Replace the single `content.xhtml` + single `navPoint` layout with a loop over `chaptersForEpub` (falling back to a synthetic single chapter when missing), generating `content-<index>.xhtml` files, OPF manifest/spine entries for each, and a matching NCX `<navPoint>` per chapter using chapter titles for `<navLabel>` and `content-<index>.xhtml` as `src`.  
  - Notes: Validate a multi-chapter fixture by loading the resulting EPUB in epub.js and confirming `book.navigation.toc` has one item per chapter in order.

- [x] Task 4: Bump EPUB_BLOB_CACHE_PREFIX to invalidate previously cached single-TOC blobs  
  - File: `apps/reader/src/shared/constants/storage.keys.ts`  
  - Action: Increment the `EPUB_BLOB_CACHE_PREFIX` suffix (e.g. `epub_blob_v2_` → `epub_blob_v3_`) with a short comment referencing the TOC structural change, so clients rebuild and cache new EPUB blobs with multi-entry TOCs.  
  - Notes: Update any tests that assert on the prefix value if present.

- [x] Task 5: Align build-epubs.mjs structure with updated bookToEpub chapters (prebuilt EPUBs)  
  - File: `apps/reader/scripts/build-epubs.mjs`  
  - Action: When `book.chapters` are available in crawler JSON, generate multiple `content-<index>.xhtml` files and NCX navPoints mirroring the `chaptersForEpub` strategy (titles and ordering), so prebuilt `.epub` files share the same TOC semantics as in-app generated ones.  
  - Notes: If the current CI pipeline does not yet run `build:epubs`, document that it must be added to get multi-entry TOCs for catalog `epubUrl` books.

- [x] Task 6: Ensure dev mock-server and PWA caching are compatible with updated EPUB flow  
  - File: `apps/reader/scripts/mock-server.mjs`  
  - Action: Document that mock-server serves JSON only and thus forces the JSON→EPUB path in dev; optionally extend it to serve `.epub` files if you want to test catalog `epubUrl` + Workbox caching locally.  
  - File: `apps/reader/vite.config.ts`  
  - Action: Confirm Workbox runtimeCaching rules (`CacheFirst` for `/book-data/*.epub`) match expectations; if prebuilt EPUBs are updated in place, define a cache-busting convention (versioned filenames or query params) and document it.

- [x] Task 7: Strengthen tests around EPUB TOC and caching  
  - File: `apps/reader/src/shared/lib/bookToEpub.test.ts`  
  - Action: Add a multi-chapter test that asserts the ZIP contains multiple `content-*.xhtml` and an NCX with matching `<navPoint>` elements.  
  - File: `apps/reader/src/shared/schemas/book.schema.test.ts`  
  - Action: Add tests for `chaptersForEpub` length and content per chapter.  
  - File: `apps/reader/src/features/reader/useEpubFromBook.test.ts`  
  - Action: Confirm that after bumping `EPUB_BLOB_CACHE_PREFIX`, the hook rebuilds and then reuses the new cached blob.  
  - File: `apps/reader/e2e/reader-layout.spec.ts` (or new e2e spec)  
  - Action: Add a Playwright smoke test that opens a known multi-chapter book, opens the TOC drawer, asserts more than one entry, and verifies navigation on click.

### Acceptance Criteria

- [x] AC 1: Given a book JSON with multiple chapters in `chapters[]`, when it is loaded in dev via `useEpubFromBook` and rendered by epub.js, then `book.navigation.toc` (and the TOC drawer UI) exposes one TOC entry per chapter in order.  
- [x] AC 2: Given a book JSON with a single chapter, when it is loaded in dev, then the EPUB still renders correctly and the TOC shows exactly one entry with the expected label.  
- [x] AC 3: Given a book JSON with empty or missing `chapters`, when it is loaded in dev, then EPUB generation still succeeds (using a synthetic single chapter) and the TOC drawer shows either a single entry or the existing “Không có mục lục” empty state without runtime errors.  
- [x] AC 4: Given a book that previously had a cached EPUB blob built with the old single-navPoint structure, when the app is updated with the new `EPUB_BLOB_CACHE_PREFIX` and the user opens the book, then `useEpubFromBook` rebuilds and caches a new EPUB blob and the TOC drawer reflects the new multi-entry structure.  
- [x] AC 5: Given a prebuilt `.epub` produced by `build-epubs.mjs` for a multi-chapter book, when it is loaded in prod/PWA via catalog `epubUrl`, then epub.js `book.navigation.toc` contains multiple entries and the TOC drawer shows them without requiring a manual cache clear (subject to any chosen cache-busting strategy).  
- [x] AC 6: Given the updated EPUB builders and cache prefix, when the full test suite and TOC e2e test are run, then all tests pass and TOC behavior remains correct for both single- and multi-chapter books.

## Additional Context

### Dependencies

- Runtime dependencies (React, epub.js, JSZip, Workbox) remain unchanged; changes are confined to how we structure OPF/NCX and feed data into the EPUB builders.  
- The presence and shape of `chapters[]` in crawler JSON is a prerequisite for high-fidelity chapter-level TOC; any upstream contract changes must be reflected in `bookSchema` and `chaptersForEpub` mapping.  
- PWA caching and any CDN-layer caching for `/book-data/*.epub` must be aligned with the chosen cache-busting strategy to ensure updated EPUB TOCs are visible to users.

### Testing Strategy

- **Unit tests:** Extend `bookToEpub.test.ts` for multi-chapter EPUB layout; extend `book.schema.test.ts` for `chaptersForEpub`; ensure `useEpubFromBook.test.ts` covers cache prefix bump behavior.  
- **Integration tests:** Use epub.js in a controlled test harness to load a generated multi-chapter EPUB and assert `book.navigation.toc` matches expected labels and hrefs.  
- **E2E tests:** Add/extend Playwright specs to verify TOC entry count and navigation for a multi-chapter book in both dev-like (JSON→EPUB) and prod-like (prebuilt `.epub`) scenarios.  
- **Manual QA:** Open at least one known multi-chapter sutra before and after the change to confirm TOC growth; validate that opening/closing the TOC drawer and selecting entries continues to behave as before for single-chapter books.

### Notes

- Introducing `chaptersForEpub` is a low-risk way to feed richer structure into EPUB builders without disrupting existing reader UI components.  
- Environment differences (dev JSON→EPUB vs prod `.epub` + Workbox caching) can make TOC regressions subtle; the spec explicitly calls out both paths to keep behavior aligned.  
- Future enhancements (e.g. nested section TOC, current-chapter highlighting) can build on the same chapter abstraction and NCX mapping without major architectural changes.
