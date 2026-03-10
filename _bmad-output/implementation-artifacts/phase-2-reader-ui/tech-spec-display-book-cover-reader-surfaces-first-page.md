---
title: 'Display book cover across reader surfaces and as first page'
slug: 'display-book-cover-reader-surfaces-first-page'
created: '2026-03-08'
status: 'Completed'
stepsCompleted: [1, 2, 3, 4]
tech_stack: ['React 18', 'TypeScript', 'Zod', 'Zustand', 'Vite', 'Tailwind', 'Vitest', '@testing-library/react']
files_to_modify: ['apps/reader/src/shared/schemas/book.schema.ts', 'apps/reader/src/shared/types/global.types.ts', 'apps/reader/src/shared/services/data.service.ts', 'apps/reader/src/features/home/HomePage.tsx', 'apps/reader/src/features/library/SutraListCard.tsx', 'apps/reader/src/features/library/SearchResults.tsx', 'apps/reader/src/features/library/library.types.ts', 'apps/reader/src/features/library/library.utils.ts', 'apps/reader/src/features/bookmarks/BookmarkCard.tsx', 'apps/reader/src/features/reader/ReaderPage.tsx', 'apps/reader/src/features/reader/ReaderEngine.tsx', 'apps/reader/src/features/reader/ChromelessLayout.tsx']
code_patterns: ['Zod schema transform for API→app types', 'Zustand store with immer for bookmarks', 'Path alias @/* for src', 'StorageService only for persistence', 'data-testid for tests', 'Lora for titles/body in reader']
test_patterns: ['Vitest + @testing-library/react', 'colocated *.test.tsx', 'vi.mock for services', 'data-testid selectors', 'Router/provider wrappers in render']
---

# Tech-Spec: Display book cover across reader surfaces and as first page

**Created:** 2026-03-08

## Overview

### Problem Statement

Book data already includes a cover image (`cover_image_url` / `coverImageUrl`), but the reader app does not display it anywhere: not on the home page (Continue Reading), library (category/list), bookmark page, or inside the reader. Users miss the visual identity of books.

### Solution

Surface the cover everywhere we display a book: use `coverImageUrl` from catalog/book data on Home (Continue Reading card), Library (SutraListCard and search results), and Bookmarks (BookmarkCard). Resolve cover URLs via the existing book-data base URL (e.g. `/book-data/` + relative path). In the reader, add a dedicated first page: when a book has a cover, show it full-screen (or with minimal chrome); when there is no cover, show a placeholder (gradient + title) so page 0 remains a consistent "first page" before content.

### Scope

**In Scope:**
- Home: Continue Reading card shows book cover when available; fallback to current gradient when no cover.
- Library: Category list and search results show cover thumbnails on book cards (SutraListCard and any search result card).
- Bookmarks: Each BookmarkCard shows the book cover thumbnail (resolve via catalog by bookId).
- Reader: First page (page 0) is the cover page—cover image when present, otherwise gradient + title placeholder. Content starts at page 1. Pagination, last-read position, and bookmarks account for the extra page (page 0 = cover).
- Book type and schema: Expose `coverImageUrl` from full book JSON so the reader can show the cover page; crawler book.json already has `cover_image_url` / `cover_image_local_path`.

**Out of Scope:**
- Changing crawler output shape or index.json contract.
- PWA/cache strategy for cover images (use same book-data origin as today).
- User-uploaded or editable covers.

## Context for Development

### Codebase Patterns

- **Reader** (`apps/reader`): React 18, Vite 7, TypeScript (strict). Path alias `@/*` → `./src/*`. Zustand stores; catalog via `useCatalogIndex`, full book via `useBook(id)`; Zod in `shared/schemas/` (catalog has `coverImageUrl`; book schema does not).
- **Catalog:** `CatalogBook` and `catalog.schema.ts` already have `coverImageUrl`. Index/crawler write relative paths (e.g. `vbeta/kinh/slug/images/cover.jpg`). Resolve with `resolveBookDataBaseUrl()` from `data.service.ts` and path `/book-data/${relativePath}`.
- **Book (full):** `staticJsonDataService.getBook(id)` loads catalog, finds JSON artifact path, fetches `/book-data/${path}`; `book.schema.ts` validates and transforms. Raw crawler JSON has `cover_image_url` and `cover_image_local_path`; reader `rawBookSchema` and `Book` type currently omit both.
- **Reader flow:** ReaderPage loads book via useBook, passes `book` to ChromelessLayout and `book.content` (paragraphs) to ReaderEngine. ReaderEngine uses useDOMPagination(paragraphs, measureRef, options, fontsReady) → `pages: string[][]`, `boundaries`; syncs to reader store; renders `pages[currentPage]`. Store holds content pages only; currentPage 0 = first content page. ChromelessLayout shows `currentPage + 1 / pages.length`.
- **Home:** ContinueReadingCard uses `useReaderStore()` (bookId, bookTitle, currentPage) and `useBook(bookId)` when bookTitle empty; shows gradient div (h-36) + title + "Trang {currentPage + 1}" + link. `hasLastRead = bookId !== '' && currentPage > 0`.
- **Library:** CategoryPage maps category.books to SutraListCard(book); SearchResults maps results (SearchDocument) to a similar Link card. SearchDocument from `toSearchDocuments(catalog.books)` — id, bookId, title, category, subcategory, translator only (no cover yet).
- **Bookmarks:** BookmarkCard(bookmark: { bookId, bookTitle, page, timestamp }); no catalog in card. To show cover, card or parent must resolve bookId → cover (e.g. useCatalogIndex + find by id).
- **Tests:** Vitest; colocated `*.test.tsx`; `vi.mock` for storage/data; render with MemoryRouter/QueryClient where needed; `data-testid` for selectors. data.service.test.ts and component tests use mock book/catalog with `coverImageUrl: null` today.

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `apps/reader/src/shared/schemas/book.schema.ts` | Add `cover_image_url`, `cover_image_local_path` to rawBookSchema; add `coverImageUrl` to transform output (prefer local path when present). |
| `apps/reader/src/shared/types/global.types.ts` | Add `coverImageUrl: string \| null` to `Book`. |
| `apps/reader/src/shared/services/data.service.ts` | Export `resolveCoverUrl`: null/empty → null; absolute URL (http(s)) → return as-is; relative path → strip leading slash then base + `/book-data/` + path. |
| `apps/reader/src/features/home/HomePage.tsx` | ContinueReadingCard: when bookData?.coverImageUrl use &lt;img src={resolveCoverUrl(bookData.coverImageUrl)} /&gt; in place of gradient div; else keep gradient. useBook already used for title fallback. |
| `apps/reader/src/features/library/SutraListCard.tsx` | Accept `book: CatalogBook`; add cover area (img or gradient) using `resolveCoverUrl(book.coverImageUrl)`. |
| `apps/reader/src/features/library/library.types.ts` | Add `coverImageUrl: string \| null` to `SearchDocument`. |
| `apps/reader/src/features/library/library.utils.ts` | In `toSearchDocuments`, include `coverImageUrl: book.coverImageUrl`. |
| `apps/reader/src/features/library/SearchResults.tsx` | Add cover thumbnail for each result (same pattern as SutraListCard) using result.coverImageUrl. |
| `apps/reader/src/features/bookmarks/BookmarkCard.tsx` | Need cover: use `useCatalogIndex()` and find book by bookmark.bookId to get coverImageUrl; render thumbnail or gradient. |
| `apps/reader/src/features/reader/ReaderPage.tsx` | Pass `book` (now with coverImageUrl) to ChromelessLayout; pass `coverImageUrl={book.coverImageUrl ?? null}` (or equivalent) to ReaderEngine. |
| `apps/reader/src/features/reader/ReaderEngine.tsx` | New prop `coverImageUrl: string \| null`. When cover present or placeholder desired: totalDisplayPages = 1 + contentPages.length; if currentPage === 0 render cover (img) or placeholder (gradient + book title from parent); else render content at pages[currentPage - 1]. Sync store with content pages only; clamp currentPage to [0, totalDisplayPages-1]. Navigation and persist unchanged (page 0 = cover, 1+ = content). |
| `apps/reader/src/features/reader/ChromelessLayout.tsx` | Receives `book: Book`; bottom bar shows `currentPage + 1 / totalPages`. totalPages must account for cover: either pass totalPages from ReaderEngine or derive (e.g. pages.length + (book.coverImageUrl ? 1 : 1) for always-one cover page). ChromelessLayout reads pages from store — so store must expose total page count including cover. Prefer ReaderEngine setting pages in store as content-only and passing a separate totalDisplayPages to layout, or layout computes total as 1 + pages.length when book has cover. Easiest: ReaderEngine continues to setPages(contentPages); add a flag or have ChromelessLayout take totalPages from children/callback. Actually: ReaderEngine can set pages and setPageBoundaries as today; for display, totalPages = 1 + pages.length and currentPage 0 → show cover. So ChromelessLayout needs to show "1 / N" when currentPage===0 and N = 1 + pages.length. So layout must know "hasCoverPage". Pass from ReaderPage: hasCoverPage=true (always, per spec). Then totalPages = 1 + pages.length in layout. |
| `apps/reader/src/stores/reader.store.ts` | No schema change. Store still holds content pages; ReaderEngine and ChromelessLayout interpret currentPage 0 as cover when hasCoverPage. |
| `apps/crawler/models.py` | Reference only: BookData has cover_image_url, cover_image_local_path; indexer writes cover_image_local_path into index. |

### Technical Decisions

- **No cover:** Placeholder (gradient + title) as first page so every book has a consistent first page (option B).
- **Cover URL:** Export `resolveCoverUrl` from data.service: null/empty → null; absolute URL (http/https) → return as-is; relative path → strip leading slash, then `resolveBookDataBaseUrl()` + `/book-data/` + path. All surfaces use it for consistent behavior and to avoid double slashes or broken absolute URLs.
- **Reader page index:** Page 0 = cover (or placeholder), 1..N = content. Store keeps content pages only; total display pages = 1 + pages.length. Last-read and bookmarks persist currentPage (0 = cover, 1+ = content); no migration of stored positions (users may see cover once after deploy).
- **BookmarkCard cover:** Resolve cover via catalog lookup by bookId (useCatalogIndex in BookmarkCard or pass map from BookmarksPage).

## Implementation Plan

### Tasks

- [x] **Task 1: Add cover to book schema and Book type**
  - File: `apps/reader/src/shared/schemas/book.schema.ts`
  - Action: Add `cover_image_url` and `cover_image_local_path` (optional, nullable) to `rawBookSchema`. In the transform, set `coverImageUrl: raw.cover_image_local_path ?? raw.cover_image_url ?? null`.
  - File: `apps/reader/src/shared/types/global.types.ts`
  - Action: Add `coverImageUrl: string | null` to the `Book` interface.
  - Notes: Crawler book.json already has both fields; prefer local path for display.

- [x] **Task 2: Export cover URL resolver**
  - File: `apps/reader/src/shared/services/data.service.ts`
  - Action: Export `resolveCoverUrl(relativePath: string | null): string | null`. (1) Return `null` when relativePath is null or empty (after trim). (2) If relativePath is absolute (e.g. starts with `http://` or `https://`), return it unchanged (book.json can contain absolute URLs from crawler). (3) Otherwise: strip a leading slash from relativePath so concatenation never produces a double slash, then return `toAbsolutePath(resolveBookDataBaseUrl(), '/book-data/' + relativePath.replace(/^\/+/, ''))`.
  - Notes: Used by Home, Library, Bookmarks, and Reader for consistent cover URLs.

- [x] **Task 3: Home — show cover on Continue Reading card**
  - File: `apps/reader/src/features/home/HomePage.tsx`
  - Action: In ContinueReadingCard, when `bookData?.coverImageUrl` is truthy, render an `<img>` with `src={resolveCoverUrl(bookData.coverImageUrl)}` and `onError` handler that switches to the gradient placeholder (e.g. set local state or render gradient when image fails). Same container height/style as current h-36 div; use object-fit cover and rounded corners. When no cover or on load failure, show the existing gradient div.
  - Notes: Import `resolveCoverUrl` from data.service. useBook already provides bookData when hasLastRead.

- [x] **Task 4: Library — add cover to SearchDocument and toSearchDocuments**
  - File: `apps/reader/src/features/library/library.types.ts`
  - Action: Add `coverImageUrl: string | null` to `SearchDocument`.
  - File: `apps/reader/src/features/library/library.utils.ts`
  - Action: In `toSearchDocuments`, add `coverImageUrl: book.coverImageUrl` to each mapped object.
  - Notes: Enables SearchResults to show cover without extra lookup.

- [x] **Task 5: Library — SutraListCard with cover**
  - File: `apps/reader/src/features/library/SutraListCard.tsx`
  - Action: Add a left-side or top cover area: if `book.coverImageUrl` use `<img src={resolveCoverUrl(book.coverImageUrl)} alt="" onError={fallback to gradient} />` with fixed aspect ratio (e.g. 2:3 book spine) and consistent thumbnail size (e.g. ~48–64px height) so Library and SearchResults match; else a small gradient placeholder. Preserve existing title/subcategory/translator and link behavior.
  - Notes: Import `resolveCoverUrl` from data.service. Keep card accessible (aria-label, link unchanged). On image load failure, show gradient placeholder.

- [x] **Task 6: Library — SearchResults with cover**
  - File: `apps/reader/src/features/library/SearchResults.tsx`
  - Action: Add cover thumbnail per result using `result.coverImageUrl` and `resolveCoverUrl`, same visual pattern and size as SutraListCard (2:3 aspect, ~48–64px height; img with onError → gradient placeholder).
  - Notes: SearchDocument now has coverImageUrl from Task 4.

- [x] **Task 7: Bookmarks — BookmarkCard with cover**
  - File: `apps/reader/src/features/bookmarks/BookmarkCard.tsx`
  - Action: Use `useCatalogIndex()` and find the book by `bookmark.bookId` to get `coverImageUrl`. Render a small cover thumbnail (img with onError → gradient, or gradient when no cover). When the book is not in the catalog (stale bookmark), still show the card using `bookmark.bookTitle` and show the gradient placeholder for the cover. Handle loading/empty catalog (show gradient until resolved).
  - Notes: Catalog may still be loading; show placeholder until resolved. No change to Bookmark type or BookmarksPage list structure.

- [x] **Task 8: Reader — pass cover and hasCoverPage to layout and engine**
  - File: `apps/reader/src/features/reader/ReaderPage.tsx`
  - Action: Pass `book` (now with coverImageUrl) to ChromelessLayout. Pass `coverImageUrl={book.coverImageUrl ?? null}` and `bookTitle={book.title}` to ReaderEngine. Pass `hasCoverPage={true}` to ChromelessLayout so it can compute totalPages as `1 + pages.length`.
  - Notes: ReaderEngine needs bookTitle for placeholder page when no cover.

- [x] **Task 9: Reader — cover as first page in ReaderEngine**
  - File: `apps/reader/src/features/reader/ReaderEngine.tsx`
  - Action: Add props `coverImageUrl: string | null` and `bookTitle: string`. Compute `totalDisplayPages = 1 + pages.length`. When `currentPage === 0`: render cover page—if coverImageUrl use a **contained** img (object-fit contain) with resolveCoverUrl(coverImageUrl) and onError → show gradient + bookTitle placeholder; else render placeholder (gradient + bookTitle). When `currentPage >= 1`: render content using `pages[currentPage - 1]` only when that index exists; for empty books (pages.length === 0) the only valid page is 0 (cover)—clamp currentPage so we never render content when there are no content pages. Keep store sync as today (setPages(contentPages), setPageBoundaries); clamp currentPage to [0, totalDisplayPages - 1] when syncing. Ensure navigatePrev at page 1 goes to page 0 (cover), and persistPageChange uses the same currentPage (0 = cover, 1+ = content).
  - Notes: PageProgress and tap/swipe/keyboard behavior unchanged. Contained (not full-bleed) avoids clipping. Font-size change already resets to page 0 (cover)—intentional so user re-enters from the start after reflow. Skeleton state: still wait for fonts + pagination; then show cover or content.

- [x] **Task 10: Reader — ChromelessLayout totalPages with cover**
  - File: `apps/reader/src/features/reader/ChromelessLayout.tsx`
  - Action: Add prop `hasCoverPage: boolean` (required; no default—caller must pass explicitly). In bottom bar, compute `totalPages = hasCoverPage ? 1 + pages.length : pages.length` and display `currentPage + 1 / totalPages`.
  - Notes: ReaderPage passes hasCoverPage={true}. No change to chrome visibility or center-tap behavior.

### Acceptance Criteria

- [ ] **AC 1:** Given a book with `cover_image_url` or `cover_image_local_path` in book.json, when the app fetches and parses that book, then the parsed `Book` has `coverImageUrl` set to the local path when present, otherwise the URL, or null when both absent.

- [ ] **AC 2:** Given a relative path string (e.g. `vbeta/kinh/slug/images/cover.jpg`), when `resolveCoverUrl(path)` is called, then the result is the full URL using the app's book-data base (e.g. base + `/book-data/` + path with any leading slash stripped to avoid double slash). Given null or empty path, then the result is null. Given an absolute URL (path starting with `http://` or `https://`), then the result is that path unchanged.

- [ ] **AC 3:** Given the user has a "continue reading" session (bookId and currentPage > 0), when the home page renders, then the Continue Reading card shows the book's cover image when the book has coverImageUrl; otherwise it shows the existing gradient placeholder.

- [ ] **AC 4:** Given the user is on the library (category or search), when book cards are rendered, then each SutraListCard and each SearchResults entry shows the book's cover thumbnail when coverImageUrl is present, or a gradient placeholder when not.

- [ ] **AC 5:** Given the user has at least one bookmark, when the bookmarks page renders, then each BookmarkCard shows the book's cover thumbnail when the catalog has that book with coverImageUrl, or a placeholder when not or while catalog is loading.

- [ ] **AC 6:** Given the user opens a book in the reader, when the reader loads, then page 0 shows the cover image when the book has coverImageUrl, or a gradient + title placeholder when not; and page 1 shows the first content page.

- [ ] **AC 7:** Given the user is on the reader's cover page (page 0), when they tap right or swipe left (or equivalent next action), then they go to page 1 (first content page); when they tap left on page 1, then they go to page 0 (cover).

- [ ] **AC 8:** Given the user is in the reader, when the chrome is visible, then the bottom bar shows "1 / N" on the cover page and "2 / N", "3 / N", … on content pages, with N = 1 + number of content pages.

- [ ] **AC 9:** Given the user leaves the reader after being on a content page, when they return to that book, then last-read position restores to that page (cover = 0, first content = 1, etc.). No migration of previously stored positions is required; users may see the cover once after deploy.

- [ ] **AC 10:** Given a bookmark was saved at reader page 2, when the user opens that bookmark link, then the reader opens at page 2 (second content page); page indices are consistent with cover as page 0.

- [ ] **AC 11:** Given a cover image URL that fails to load (404, network error, or CORS), when the image triggers onError, then the UI shows the gradient/placeholder instead of a broken image (Home, Library, Bookmarks, and Reader cover page).

- [ ] **AC 12:** Given a bookmark whose bookId is not in the catalog (e.g. book removed or re-indexed), when the bookmarks page renders, then the card still shows using bookmark.bookTitle and shows the gradient placeholder for the cover.

- [ ] **AC 13:** Given a book with no content (pages.length === 0), when the user is in the reader, then only page 0 (cover or placeholder) is shown; totalPages is 1; navigation does not attempt to render content and does not crash.

## Additional Context

### Dependencies

- Catalog (`index.json`) and per-book JSON already expose or contain cover fields; no crawler or indexer changes.
- Reader app assumes book-data is served at `VITE_BOOK_DATA_URL` or dev proxy/base path; cover images use the same origin as existing book JSON.
- No new npm dependencies; use existing img and CSS.

### Testing Strategy

- **Unit:** (1) Book schema: parse a raw object with `cover_image_url` and `cover_image_local_path` and assert transformed `coverImageUrl` (prefer local). Parse with both null and assert null. (2) `resolveCoverUrl`: test with null, empty string, a relative path (and path with leading slash), and an absolute URL (`https://...`); assert URL shape (relative → base + `/book-data/` + path; absolute → unchanged). Mock `import.meta.env` (VITE_BOOK_DATA_URL / BASE_URL) in Vitest so tests are deterministic and not env-dependent.
- **Component:** (1) HomePage: with mock store + useBook returning a book with/without coverImageUrl, assert Continue Reading card shows img vs gradient; assert onError shows gradient. (2) SutraListCard: with book that has/does not have coverImageUrl, assert cover area content and onError fallback. (3) BookmarkCard: with catalog mock (and with bookId not in catalog), assert cover or placeholder and card still shows title. (4) ReaderEngine: with coverImageUrl and bookTitle, assert at currentPage 0 the cover or placeholder is shown; at currentPage 1 assert first content paragraph; with empty pages assert only page 0 and no crash. (5) ChromelessLayout: with hasCoverPage true and pages.length = 5, assert bottom bar shows "1 / 6" when currentPage 0.
- **E2E:** Update or add scenarios so cover behavior is covered: e.g. reader-layout and offline specs that mock book data should either include a book with cover_image_url set where asserting reader first page or library card, or add a dedicated e2e that verifies cover on reader first page / library card when mock provides cover. Ensure existing e2e mocks remain valid (cover_image_url can stay null if tests don't assert cover).
- **Integration / manual:** Open a book with cover from library; confirm cover as first page and navigation; confirm last-read and bookmark round-trip. Confirm Home/Library/Bookmarks show covers when data has them. Confirm failed image load shows placeholder.

### Notes

- **Last-read / bookmarks:** Stored page numbers remain 0-based; after this change, 0 = cover, 1+ = content. No migration; users who had "first content" saved as 0 may land on cover once.
- **ChromelessLayout:** hasCoverPage is a required prop (no default) so callers are explicit; reader route always passes true.
- **Font size change:** ReaderEngine already resets to page 0 when font size changes; with cover as page 0 this remains intentional (user re-enters from the start after reflow).
- **Cover loading state:** Cards may show a brief blank or loading area until the cover image loads; onError then shows the gradient. Optionally use a gradient placeholder until img onLoad for a smoother UX; spec requires at least onError fallback.
- **Accessibility:** Cover images should have empty or descriptive alt per context; decorative covers use `alt=""`.
- **Performance:** Cover images are regular img requests to book-data origin; consider existing PWA cache for /book-data/* if present.

## Review Notes

- Adversarial review completed.
- Findings: 10 total, 10 fixed (auto-fix all).
- Resolution approach: fix automatically.
- Fixes applied: F1 MiniSearch storeFields + coverImageUrl; F2 shared coverPlaceholderStyle in @/shared/constants/cover.ts; F3 data.service.test coverImageUrl assertion; F4 removed redundant aspect-ratio on cards; F5 BookmarksPage.test mock with categories; F6 resolveCoverUrl test for multiple leading slashes; F7 coverError lifted to ReaderEngine; F8 ChromelessLayout hasCoverPage JSDoc; F9 gradient until img onLoad on all cover surfaces; F10 already had boundaries.length in deps.
