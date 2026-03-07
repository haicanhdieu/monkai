# Story 4.2: Reading Progress Persistence & Resume

Status: ready-for-dev

## Story

As a **user**,
I want the app to automatically remember exactly which page I was reading,
so that every time I reopen a sutra I continue from where I left off without any manual bookmarking.

## Acceptance Criteria

1. **Given** the user turns to any page in `ReaderEngine`
   **When** `reader.store.setCurrentPage(n)` fires
   **Then** within the same tick, `StorageService.setItem(STORAGE_KEYS.LAST_READ_POSITION, { bookId, page: n })` is called silently — no UI feedback shown

2. **Given** the user closes the app and reopens it
   **When** `useStorageHydration` runs on mount
   **Then** `reader.store.hydrate({ bookId, page })` is called with the persisted values (implemented in Story 4.1)

3. **Given** `HomePage` renders and `lastReadPosition` exists in `reader.store` (non-empty `bookId` and `currentPage > 0`)
   **When** the Home screen loads
   **Then** the "Continue Reading" hero card shows the book title and page number (e.g., "Kinh Pháp Hoa — trang 14") as the primary action, using live data from `reader.store`

4. **Given** the user taps the "Continue Reading" card
   **When** navigation occurs
   **Then** they land on `/read/:bookId` and `ReaderEngine` opens directly to the saved page (not page 1)

5. **Given** no `lastReadPosition` exists (first-ever app open, or `bookId` is empty string)
   **When** `HomePage` renders
   **Then** the "Continue Reading" card is not shown; the primary content instead directs to the Library via the existing quick-action grid

6. **Given** `bookmarks.store.ts` with `hydrate(bookmarks)` action (created in Story 4.1)
   **When** the user navigates to `/bookmarks`
   **Then** `<BookmarksPage>` lists all persisted reading positions as `<BookmarkCard>` entries (book title, page, timestamp), each tappable to navigate to `/read/:bookId` at the saved page

## Tasks / Subtasks

- [ ] Task 1: Wire progress persistence in ReaderEngine (AC: 1)
  - [ ] In `apps/reader/src/features/reader/ReaderEngine.tsx`, after `useReaderStore.setCurrentPage(n)` is called, also call `storageService.setItem(STORAGE_KEYS.LAST_READ_POSITION, { bookId, page: n })`
  - [ ] Import `storageService` from `@/shared/services/storage.service` and `STORAGE_KEYS` from `@/shared/constants/storage.keys`
  - [ ] Read `bookId` from `useReaderStore` (already stored there via `setBookId`)
  - [ ] Do NOT add any loading state or UI feedback — this is a silent background write

- [ ] Task 2: Wire bookmark upsert in ReaderEngine (AC: 6, prerequisite for 4.5)
  - [ ] After the storage write in Task 1, also call `useBookmarksStore.getState().upsertBookmark({ bookId, bookTitle, page: n, timestamp: Date.now() })`
  - [ ] `bookTitle` must come from the book data currently loaded in ReaderPage — pass it down to ReaderEngine as a prop or read from a shared store
  - [ ] Also persist bookmarks to storage: `storageService.setItem(STORAGE_KEYS.BOOKMARKS, useBookmarksStore.getState().bookmarks)`

- [ ] Task 3: Update HomePage to show conditional "Continue Reading" card (AC: 3, 4, 5)
  - [ ] Import `useReaderStore` from `@/stores/reader.store`
  - [ ] Read `bookId` and `currentPage` from store
  - [ ] Condition: `hasLastRead = bookId !== '' && currentPage > 0`
  - [ ] When `hasLastRead === true`: render the "Continue Reading" hero card with real data (book title from store or a catalog lookup, page number)
  - [ ] When `hasLastRead === false`: hide the "Continue Reading" section entirely — DO NOT show hardcoded placeholder
  - [ ] The "Tiếp tục" button must link to `/read/${bookId}` using `toRead(bookId)` from `@/shared/constants/routes`
  - [ ] For book title display: since reader.store doesn't hold title, use `bookId` formatted as a fallback (e.g., slug → display name) or read title from TanStack Query cache via `useBook(bookId)` in suspended/lazy mode
  - [ ] **Simpler approach**: store `bookTitle` in `reader.store` alongside `bookId` — add `bookTitle: string` field and `setBookTitle(title: string)` action — call it when book loads in `ReaderPage`

- [ ] Task 4: Ensure ReaderEngine resumes at saved page on open (AC: 4)
  - [ ] In `ReaderPage.tsx`, after pagination is complete and `readerStore.setPages(pages)` is called, check if `readerStore.currentPage > 0` (from hydration)
  - [ ] If `currentPage` is already set from hydration, do NOT reset it to 0 — the reader should open at the hydrated page
  - [ ] Verify `ReaderEngine` uses `currentPage` from store directly (it should already — just confirm no reset-to-0 logic on mount)

- [ ] Task 5: Update BookmarksPage with real data (AC: 6) — stub for Story 4.5
  - [ ] Import `useBookmarksStore`
  - [ ] Show a simple list of bookmarks with book title, page, and "Tiếp tục" link
  - [ ] Empty state: "Chưa có đánh dấu nào" message (full polish in Story 4.5)

- [ ] Task 6: Write unit tests (AC: 1, 3, 5)
  - [ ] Test `ReaderEngine`: assert `storageService.setItem` is called with correct args when `setCurrentPage` fires — mock `storageService`
  - [ ] Test `HomePage` with `bookId = ''`: assert "Continue Reading" section is not rendered
  - [ ] Test `HomePage` with `bookId = 'kinh-phap-hoa'` and `currentPage = 14`: assert card renders with correct link and page number
  - [ ] Use existing `HomePage.test.tsx` — extend it, do not replace

## Dev Notes

### Critical Context

**Prerequisite: Story 4.1 must be complete first** — this story depends on:
- `storageService` singleton from `storage.service.ts`
- `STORAGE_KEYS` from `storage.keys.ts`
- `useReaderStore.hydrate()` action
- `useBookmarksStore` with `upsertBookmark()` and `hydrate()`

**reader.store.ts current state** (from code review):
```typescript
// EXISTING fields — keep all:
bookId: string      // already in store ✓
pages: string[][]
pageBoundaries: number[]
currentPage: number  // set by setCurrentPage ✓
isChromeVisible: boolean
hasSeenHint: boolean

// MISSING — must be added by this story:
bookTitle: string    // needed for HomePage display
// Add action: setBookTitle(title: string)
```

**ReaderEngine page-turn call flow** (from existing implementation):
- `ReaderEngine.tsx` calls `useReaderStore().setCurrentPage(nextPage)` on tap/swipe
- After this call, add the storage write — this is the correct injection point
- Do NOT debounce — save on every page turn (this is the AC requirement)

**HomePage.tsx current state** (from code review):
- Line 65: hardcoded `"Kinh Pháp Hoa"` title — must be replaced with store data
- Line 72: hardcoded `to={toRead('kinh-phap-hoa')}` — must be dynamic
- Lines 85-86: hardcoded "16%" and "trang 14 / 89" — must be dynamic or removed
- The entire `<section aria-label="Tiếp tục đọc">` block must be conditionally rendered based on `hasLastRead`

**Book title in reader.store**:
- Add `bookTitle: string` (default `''`) to `ReaderState`
- Add `setBookTitle: (title: string) => void` action
- Call `setBookTitle(book.title)` in `ReaderPage.tsx` when book data loads (inside `useEffect` or `useBook` success handler)
- `reader.store.hydrate()` only has `{ bookId, page }` from storage — `bookTitle` is NOT persisted to storage (too much overhead), it will be empty on cold start. For HomePage on cold start: if `bookId` is set but `bookTitle` is empty, show the book ID slug as fallback title (or trigger a `useBook(bookId)` call from HomePage to get the title)

**Recommended approach for book title on HomePage cold start**:
- In `HomePage.tsx`, if `hasLastRead && bookTitle === ''`, call `useBook(bookId)` and use `book.data.title` from TanStack Query — this will be served from cache if book was previously loaded; no network request needed due to `staleTime: Infinity`
- This is the cleanest approach — avoids adding unnecessary title persistence to storage

**Resume at saved page** — key detail:
- `useStorageHydration` runs before routing (in `App.tsx`)
- `reader.store.currentPage` is hydrated before `ReaderPage` mounts
- In `ReaderPage`, when pagination completes (`setPages(pages)` called), do NOT call `setCurrentPage(0)` — the store already has the correct page from hydration
- Check: `if (readerStore.currentPage === 0) readerStore.setCurrentPage(0)` — just don't reset unconditionally

### Project Structure Notes

Files to modify:
- `apps/reader/src/features/reader/ReaderEngine.tsx` — add storage write + bookmark upsert on page turn
- `apps/reader/src/features/reader/ReaderPage.tsx` — call `setBookTitle`, ensure no reset-to-0 on mount
- `apps/reader/src/features/home/HomePage.tsx` — conditional "Continue Reading" with live data
- `apps/reader/src/features/home/HomePage.test.tsx` — extend with real store tests
- `apps/reader/src/stores/reader.store.ts` — add `bookTitle`, `setBookTitle`
- `apps/reader/src/features/bookmarks/BookmarksPage.tsx` — stub with real data

No new files needed for this story — all are modifications to existing files.

### Architecture Compliance

- Import `storageService` from `@/shared/services/storage.service` — NOT from `localforage` directly
- Import `STORAGE_KEYS` from `@/shared/constants/storage.keys` — no string literals
- Use `@/` absolute imports across feature boundaries
- No try/catch in React components — `storageService.setItem` already handles errors internally
- Use `useReaderStore.getState()` for actions called outside React render (e.g., from event handlers)

### References

- [Source: _bmad-output/planning-artifacts/phase-2-reader-ui/epics-reader-ui.md#Story 4.2]
- [Source: _bmad-output/planning-artifacts/phase-2-reader-ui/architecture-reader-ui.md#Communication Patterns - State Management]
- [Source: _bmad-output/planning-artifacts/phase-2-reader-ui/architecture-reader-ui.md#Data Flow - step 5 Page turn]
- [Source: _bmad-output/planning-artifacts/phase-2-reader-ui/ux-design-specification-reader-ui.md#Journey 1: The Daily Practitioner]
- [Source: apps/reader/src/stores/reader.store.ts — existing store shape]
- [Source: apps/reader/src/features/home/HomePage.tsx — current hardcoded implementation]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

### File List
