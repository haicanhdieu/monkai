---
title: 'Fix Book ID Mismatch — Home & Bookmarks Navigation'
slug: 'fix-book-id-mismatch-home-bookmarks-navigation'
created: '2026-03-08'
status: 'Completed'
stepsCompleted: [1, 2, 3, 4]
tech_stack:
  - React 18
  - TypeScript
  - React Router v6 (useParams)
  - Zustand (reader.store, bookmarks.store)
  - TanStack Query v5
  - localforage via StorageService
  - Vitest + @testing-library/react
files_to_modify:
  - apps/reader/src/features/reader/ReaderPage.tsx
  - apps/reader/src/features/reader/ReaderPage.test.tsx
code_patterns:
  - URL param bookId = catalog UUID (routing identifier)
  - book.id from parsed Book JSON = SEO slug (internal, different namespace)
  - setBookId must always receive the catalog UUID
  - persistPageChange in ReaderEngine reads bookId from store
  - upsertBookmark reads bookId from store
test_patterns:
  - Vitest + @testing-library/react
  - MemoryRouter with initialEntries for route param injection
  - QueryClientProvider with retry false for test isolation
  - useReaderStore.getState() for asserting store state post-render
  - vi.mock for useBook hook control
---

# Tech-Spec: Fix Book ID Mismatch — Home & Bookmarks Navigation

**Created:** 2026-03-08

## Overview

### Problem Statement

Three bugs in the Phase 2 Epic 4 implementation all share a single root cause: `ReaderPage.tsx` calls `setBookId(book.id)`, storing the book.json internal ID (SEO-slug format, e.g., `"vbeta__bo-trung-quan"`) into `reader.store.bookId` instead of the catalog UUID (e.g., `"5cb15d2a-94d8-4c10-840d-cd934ac19627"`) that was used to navigate to the reader. This wrong ID is then persisted to `LAST_READ_POSITION` and bookmarks, so all navigation derived from persisted state uses a non-UUID identifier that fails the `catalog.books.find((b) => b.id === id)` lookup in `StaticJsonDataService.getBook()`.

Specific symptoms:
1. **Home page "Đang đọc"** displays the SEO slug (`"vbeta__bo-trung-quan"`) instead of the book name.
2. **"Tiếp Tục" button** navigates to `/read/vbeta__bo-trung-quan` which causes a "book not found" error.
3. **Bookmarks page** cards navigate to `/read/vbeta__bo-trung-quan` causing the same "book not found" error.

### Solution

Change `setBookId(book.id)` to `setBookId(bookId)` in `ReaderPage.tsx`, where `bookId` is the URL param from `useParams()` (the catalog UUID). This ensures the persisted ID always matches what `useBook()` and `toRead()` expect.

### Scope

**In Scope:**
- Fix `setBookId(book.id)` → `setBookId(bookId)` in `ReaderPage.tsx`
- Update/add tests to cover the affected flows

**Out of Scope:**
- Changing the catalog or book.json data structures
- Persisting `bookTitle` to `LAST_READ_POSITION` storage (the existing `useBook()` fallback in `ContinueReadingCard` handles title resolution correctly once the ID is fixed)
- Any reader UI or pagination changes

## Context for Development

### Codebase Patterns

- **Routing**: React Router v6. Route is `/read/:bookId`. `useParams<{ bookId: string }>()` returns the catalog UUID as used in `toRead(catalogBook.id)`.
- **Data flow**: `useBook(id)` → `StaticJsonDataService.getBook(id)` → `catalog.books.find((b) => b.id === id)` lookup requires the catalog UUID. The catalog `id` field is a UUID; the book.json `id` field is a SEO slug — they are different values.
- **Stores**: `reader.store.ts` (Zustand, no immer). `hydrate({ bookId, page })` — restores only `bookId` and `currentPage`, not `bookTitle`.
- **Persistence**: `persistPageChange()` in `ReaderEngine.tsx` calls `storageService.setItem(STORAGE_KEYS.LAST_READ_POSITION, { bookId: id, page })` where `id` comes from `useReaderStore.getState().bookId`.
- **Bookmarks**: `upsertBookmark({ bookId: id, bookTitle: title, page, timestamp })` also reads `bookId` from the store.
- **Title fallback**: `ContinueReadingCard` in `HomePage.tsx` calls `useBook(bookId)` when `bookTitle === ''` to resolve the title. This fallback works correctly once `bookId` holds the catalog UUID.

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `apps/reader/src/features/reader/ReaderPage.tsx` | **The file to fix** — `setBookId(book.id)` on line 22 must become `setBookId(bookId)` |
| `apps/reader/src/stores/reader.store.ts` | Zustand store — `bookId` field, `hydrate()` action |
| `apps/reader/src/features/reader/ReaderEngine.tsx` | `persistPageChange()` reads `bookId` from store |
| `apps/reader/src/stores/bookmarks.store.ts` | `upsertBookmark()` receives `bookId` from store |
| `apps/reader/src/features/home/HomePage.tsx` | `ContinueReadingCard` uses `bookId` for `toRead()` and fallback `useBook()` |
| `apps/reader/src/features/bookmarks/BookmarkCard.tsx` | `toRead(bookmark.bookId)` navigation |
| `apps/reader/src/shared/services/data.service.ts` | `getBook(id)` — requires catalog UUID for `find()` |
| `apps/reader/src/shared/schemas/catalog.schema.ts` | Catalog schema — `id` = UUID |
| `apps/reader/src/shared/schemas/book.schema.ts` | Book schema — `id` = book.json internal SEO slug |

### Technical Decisions

- The fix is intentionally minimal: one line change. The catalog UUID is always available as the URL param inside `ReaderPage` — no new data fetching or plumbing is required.
- `book.id` (the SEO slug, e.g., `"vbeta__bo-trung-quan"`) is retained in the `Book` type for potential future use but must NOT be used as the routing/storage identifier.
- `CatalogBook.id` = UUID (e.g., `"5cb15d2a-94d8-4c10-840d-cd934ac19627"`). `Book.id` = SEO slug (e.g., `"vbeta__bo-trung-quan"`). These are two different namespaces and must never be mixed for routing.
- No change to `LastReadPosition` or `Bookmark` interfaces — they already have the correct `bookId: string` field; only the value being stored was wrong.
- No change to `ReaderEngine.tsx` — after the fix, `useReaderStore().bookId` will hold the UUID, and `persistPageChange()` / `upsertBookmark()` will automatically store the correct UUID.
- No change to `HomePage.tsx` — `ContinueReadingCard` already handles `bookTitle === ''` by calling `useBook(bookId)` as a fallback. With the UUID fix, this fetch succeeds.
- No change to `BookmarkCard.tsx` or `BookmarksPage.tsx` — they already call `toRead(bookmark.bookId)` correctly; they just need the right ID persisted.
- `SutraListCard` already uses `book.id` from `CatalogBook` (UUID) for `toRead()` — this is correct and unchanged.
- Existing test `'resets store with new bookId'` in `ReaderPage.test.tsx` uses `bookFixture.id = 'bat-nha'` and URL param `'bat-nha'` — they coincidentally match so the test currently passes and will continue to pass after the fix. A new test with mismatched values is needed to prevent regression.

### Confirmed: No Other Files Need Changes

| File | Reason No Change Needed |
|------|------------------------|
| `reader.store.ts` | `hydrate()` and `setBookId()` are ID-agnostic strings |
| `bookmarks.store.ts` | `upsertBookmark()` accepts any string ID |
| `ReaderEngine.tsx` | Reads `bookId` from store; will be correct after fix |
| `HomePage.tsx` | Title fallback via `useBook()` works once ID is UUID |
| `BookmarkCard.tsx` | Uses `toRead(bookmark.bookId)`; correct once ID is UUID |
| `data.service.ts` | `getBook(id)` lookup is correct; was just receiving wrong input |

## Implementation Plan

### Tasks

- [x] Task 1: Fix `setBookId` to use the URL param (catalog UUID) instead of `book.id`
  - File: `apps/reader/src/features/reader/ReaderPage.tsx`
  - Action: In the `useEffect` (lines 20–27), change `setBookId(book.id)` to `setBookId(bookId)`. `bookId` is already destructured from `useParams()` on line 13 — no new variable or import needed.
  - Before: `setBookId(book.id)`
  - After:  `setBookId(bookId)`

- [x] Task 2: Add regression test that proves the URL param (not `book.id`) is stored
  - File: `apps/reader/src/features/reader/ReaderPage.test.tsx`
  - Action: Add a new `it()` block inside `describe('ReaderPage')` with a fixture where `id` differs from the URL param. The test must fail before Task 1 and pass after.
  - New fixture (add alongside existing `bookFixture`):
    ```ts
    const bookFixtureWithDifferentId: Book = {
      id: 'seo-slug-internal',       // book.json internal id — SEO slug
      title: 'Kinh Test',
      category: 'Kinh',
      subcategory: 'test',
      translator: 'HT. Test',
      content: ['Đoạn 1.'],
    }
    ```
  - New test (add after existing `'resets store with new bookId and empty pages'` test):
    ```ts
    // Regression: store must hold the URL param (catalog UUID), NOT book.id (SEO slug)
    it('stores URL param bookId (catalog UUID) in store, not book.id (SEO slug)', () => {
      mockUseBook.mockReturnValue({ isLoading: false, data: bookFixtureWithDifferentId, error: null })
      renderReaderPage('catalog-uuid-123')   // URL param differs from bookFixtureWithDifferentId.id
      expect(useReaderStore.getState().bookId).toBe('catalog-uuid-123')
    })
    ```

### Acceptance Criteria

- [x] AC 1: Given a user has previously opened a book (navigated to `/read/<UUID>` and turned at least one page), when the app is reloaded and the Home page renders, then the "Đang đọc" section displays the human-readable book title (e.g., "Bộ Trung Quán"), not the SEO slug (e.g., `"vbeta__bo-trung-quan"`).

- [x] AC 2: Given the Home page "Tiếp tục đọc" card is visible with a persisted last-read position, when the user taps "Tiếp tục", then the browser navigates to `/read/<UUID>` (the catalog UUID), and the reader loads the book without a "book not found" error.

- [x] AC 3: Given the Bookmarks page lists one or more saved reading positions, when the user taps any `BookmarkCard`, then the browser navigates to `/read/<UUID>` and the reader loads the book without a "book not found" error.

- [x] AC 4: Given `ReaderPage` is rendered at `/read/catalog-uuid-123` and `useBook()` resolves with a `Book` whose `id` is `'seo-slug-internal'`, when the component mounts and the `useEffect` fires, then `useReaderStore.getState().bookId` equals `'catalog-uuid-123'` (the URL param), not `'seo-slug-internal'` (the book's internal id).

- [x] AC 5: Given the regression test added in Task 2 (`'stores URL param bookId (catalog UUID) in store, not book.id (SEO slug)'`), when `pnpm test` runs after Task 1 is applied, then this test passes.

- [x] AC 6: Given the full test suite (`pnpm test`), when run after both tasks are applied, then all 5 existing `ReaderPage` tests, all 3 existing `HomePage` tests, and all 4 existing `BookmarksPage` tests continue to pass with no regressions.

## Review Notes

- Adversarial review completed (2 passes)
- Findings: 12 total, 9 fixed, 3 skipped (noise/pre-existing/wide-scope)
- Resolution approach: auto-fix
- F1 fixed: `book?.id` → `book` in `useEffect` dep array (correct exhaustive deps)
- F2 fixed: added `setPageBoundaries([0])` call alongside `setPages([])` in reset effect
- F4 fixed: removed tautological negative assertion from regression test
- F6 fixed: added test for `!bookId` early-return → `not_found` error page
- F7 fixed: added `expect(mockUseBook).toHaveBeenCalledWith(...)` to regression test
- F8 fixed: added test for plain `Error` → `'unknown'` category fallback
- F9 fixed: added book-to-book navigation test (store updates correctly without explicit reset)
- F10 fixed: removed AC reference comments (`// AC N of N.N`) from component and test files
- F5 skipped: noise — fixture naming is intentional for readability
- F3 skipped: intentional design — `currentPage` not reset on book change (resume reading behavior)
- F11 skipped: pre-existing design decision about error category taxonomy, out of scope
- F12 skipped: `bookId = ''` default is a deliberate project-wide pattern; changing it has wide scope

## Additional Context

### Dependencies

- No new libraries or packages required.
- No changes to data files (`index.json`, `book.json` files).
- No changes to shared types, schemas, or services.
- Downstream correctness depends on `SutraListCard` and `SearchResults` already using `toRead(catalogBook.id)` (catalog UUID) for navigation — confirmed correct, no change needed.

### Testing Strategy

**Unit tests (Vitest + @testing-library/react):**
- Task 2 adds one targeted regression test in `ReaderPage.test.tsx` using a mismatched `bookFixture.id` vs URL param.
- Run `pnpm test` from `apps/reader/` after both tasks — all tests must pass.

**Manual smoke test after implementation:**
1. In dev (`pnpm dev`), navigate Library → open any book → read a few pages (turn page at least once).
2. Navigate to Home tab — verify "Đang đọc" shows the correct book title, not a slug.
3. Tap "Tiếp tục" — verify reader opens at the saved page without error.
4. Navigate to Bookmarks tab — verify the card shows the correct title; tap it — verify reader opens without error.
5. Hard-refresh the browser (clears in-memory Zustand state, forces storage hydration) and repeat steps 2–4.

### Notes

- **Pre-mortem risk — existing test passes by coincidence**: The test `'resets store with new bookId and empty pages when book data loads'` uses `bookFixture.id = 'bat-nha'` and URL param `'bat-nha'` — they are the same value by accident. This test will pass both before and after the fix. Task 2's new test is the actual regression guard.
- **Pagination sessionStorage cache**: `useDOMPagination` builds cache keys using `bookId`. After the fix the key uses the UUID instead of the SEO slug. Old cached entries (keyed by SEO slug) are simply orphaned — they won't be read and will expire with the session. No explicit cache invalidation needed.
- **`book.id` is not removed**: The `Book` interface retains `id: string` (SEO slug from book.json). It is not used for routing after this fix but remains available for future use (e.g., canonical URLs, analytics).
- **`bookTitle` is intentionally not persisted to `LAST_READ_POSITION`**: The `ContinueReadingCard` title fallback (`useBook(bookId)` when `bookTitle === ''`) is the correct pattern. Persisting `bookTitle` to storage is out of scope and unnecessary.
