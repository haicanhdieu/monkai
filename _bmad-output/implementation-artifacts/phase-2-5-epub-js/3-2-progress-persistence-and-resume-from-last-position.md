# Story 3.2: Progress Persistence and Resume from Last Position

Status: review

## Story

As a reader user,
I want my exact reading position saved every time I turn a page,
so that when I reopen a sutra I resume exactly where I left off.

## Acceptance Criteria

1. **Given** `rendition.on('relocated', ...)` is wired in `ReaderEngine`
   **When** the user turns a page and epub.js fires the `relocated` event
   **Then** `readerStore.setCurrentCfi(location.start.cfi)` is called
   **And** `storageService.setItem(STORAGE_KEYS.LAST_READ_POSITION, { bookId, cfi: location.start.cfi })` is called in the same handler
   **And** progress is NOT saved in a `useEffect` watching `currentCfi`

2. **Given** a user previously read a sutra and a CFI was saved
   **When** the user reopens that sutra
   **Then** `rendition.display(savedCfi)` is called after `isReady` is true
   **And** the reader opens at the saved page, not the beginning

3. **Given** no saved CFI exists for a sutra
   **When** the user opens it
   **Then** `rendition.display()` is called without arguments (epub.js default: beginning of book)

4. **Given** the app is offline
   **When** the user opens a cached sutra
   **Then** progress save and resume work identically using the locally stored CFI

## Tasks / Subtasks

- [x] Wire `rendition.on('relocated')` in `ReaderEngine.tsx` for progress save (AC: 1)
  - [x] Import `storageService` and `STORAGE_KEYS` in `ReaderEngine.tsx`
  - [x] In the `useEffect` that wires rendition events, add `relocated` handler
  - [x] Handler: call `readerStore.setCurrentCfi(location.start.cfi)` and `storageService.setItem(STORAGE_KEYS.LAST_READ_POSITION, { bookId, cfi: location.start.cfi })`
  - [x] `bookId` is the current bookId from URL params — pass it as a prop or read from `useParams()` in `ReaderPage` and pass down
  - [x] Ensure `location.start.cfi` is a string (not null) before setting
- [x] Implement resume logic in `ReaderPage.tsx` (AC: 2, 3)
  - [x] After `isReady` becomes true (watch via effect or render conditional), read `LAST_READ_POSITION` from storage
  - [x] If saved `cfi` matches current `bookId`, call `rendition.display(savedCfi)`
  - [x] If no saved position, call `rendition.display()` (epub.js default)
  - [x] Pass `rendition` from `useEpubReader` up to `ReaderPage` OR handle resume inside `ReaderEngine`
- [x] Verify offline behavior — `storageService` uses `localforage` which persists to IndexedDB, available offline (AC: 4)
- [x] Update `ReaderEngine.test.tsx` with tests for relocated event handler (AC: 1)
- [x] Update `ReaderPage.test.tsx` with tests for resume logic (AC: 2, 3)

## Dev Notes

### Codebase Context

**Prerequisites:** Stories 3.1 (reader.store), 2.1 (useEpubReader), 2.2 (ReaderEngine rewrite).

**CRITICAL anti-pattern to avoid:**
```typescript
// ❌ WRONG — fires on React re-renders, not on actual page turns
useEffect(() => {
  if (currentCfi) storageService.setItem(STORAGE_KEYS.LAST_READ_POSITION, { bookId, cfi: currentCfi })
}, [currentCfi])

// ✅ CORRECT — fires precisely when epub.js reports a page turn
rendition.on('relocated', (location) => {
  readerStore.setCurrentCfi(location.start.cfi)
  void storageService.setItem(STORAGE_KEYS.LAST_READ_POSITION, { bookId, cfi: location.start.cfi })
})
```

**epub.js `Location` type:**
```typescript
interface Location {
  start: { cfi: string; href: string; index: number; displayed: { page: number; total: number }; percentage?: number }
  end: { cfi: string; href: string; index: number; displayed: { page: number; total: number }; percentage?: number }
  atStart: boolean
  atEnd: boolean
}
```
Use `location.start.cfi` for the progress CFI.

**Resume implementation — two approaches:**

**Approach A (preferred): Resume inside `ReaderEngine`** — `ReaderEngine` already has `isReady` from `useEpubReader`. When `isReady` transitions to `true`, read the saved position from storage and call `rendition.display(savedCfi)`.

```typescript
// In ReaderEngine.tsx — add alongside existing event wiring useEffect
const [resumeAttempted, setResumeAttempted] = useState(false)

useEffect(() => {
  if (!isReady || !rendition || resumeAttempted) return
  setResumeAttempted(true)

  void storageService.getItem<{ bookId: string; cfi?: string }>(STORAGE_KEYS.LAST_READ_POSITION)
    .then((saved) => {
      if (saved && saved.bookId === bookId && saved.cfi) {
        void rendition.display(saved.cfi)
      } else {
        void rendition.display()
      }
    })
    .catch(() => {
      void rendition.display()
    })
}, [isReady, rendition, bookId, resumeAttempted])
```

`bookId` must be passed as a prop to `ReaderEngine`. Update `ReaderEngine` props:
```typescript
interface ReaderEngineProps {
  epubUrl: string
  bookId: string  // ← ADD: needed for progress matching and storage writes
}
```

**Approach B**: Handle resume in `ReaderPage` using a callback — more complex, less contained.

**Prefer Approach A** — it keeps resume logic co-located with the reader engine.

**`storageService.setItem` is async** — use `void storageService.setItem(...)` pattern (don't await, don't crash on storage errors in the navigation hot path).

**Storage format verification:**
```typescript
// What is written to storage:
{ bookId: string, cfi: string }
// e.g. { bookId: "uuid-...", cfi: "epubcfi(/6/2!/4/2/1:0)" }

// What useStorageHydration reads (updated in Story 3.1):
// It calls readerStore.setCurrentCfi(saved.cfi) if cfi is present
```

**`readerStore.currentCfi`** is used by `useStorageHydration` on app load to restore the last position in the store. The `resumeAttempted` logic in `ReaderEngine` reads from storage directly to avoid a race condition with `isReady`.

**Why not use `readerStore.currentCfi` for resume?** The store's `currentCfi` is set by `useStorageHydration` on app load, but `ReaderEngine` mounts after the hydration promise resolves. The timing is fragile. Reading from storage directly in the `isReady` effect is more reliable.

**Bookmarks update:** The old `ReaderEngine` also called `useBookmarksStore.upsertBookmark()` on page change. If bookmarks are still needed (they are — BookmarksPage still exists), wire a bookmark save in the `relocated` handler:
```typescript
rendition.on('relocated', (location) => {
  const cfi = location.start.cfi
  readerStore.setCurrentCfi(cfi)
  void storageService.setItem(STORAGE_KEYS.LAST_READ_POSITION, { bookId, cfi })
  // Update bookmark for current position
  useBookmarksStore.getState().upsertBookmark({ bookId, bookTitle, cfi, timestamp: Date.now() })
  void storageService.setItem(STORAGE_KEYS.BOOKMARKS, useBookmarksStore.getState().bookmarks)
})
```
Check `bookmarks.store.ts` to see if `upsertBookmark` signature has changed or if `cfi` needs to replace `page`. This may require a Story 3.2 sub-task to update `bookmarks.store.ts` to use `cfi` instead of `page`.

**`bookTitle` for bookmark:** Pass `bookTitle` as a prop to `ReaderEngine` if needed by bookmarks.

### Project Structure Notes

- Modified files: `src/features/reader/ReaderEngine.tsx`, `src/features/reader/ReaderPage.tsx`
- Possibly also: `src/stores/bookmarks.store.ts` if bookmark shape needs updating for CFI

### Testing Standards

- `ReaderEngine` test for relocated: mock `storageService.setItem` and verify it's called with the correct CFI on relocated event
- `ReaderPage` test for resume: verify `rendition.display(cfi)` is called when saved position exists
- Verify `rendition.display()` (no args) is called when no saved position

### References

- Architecture anti-pattern: [Source: architecture-reader-ui-epubjs.md#Communication Patterns — ❌ WRONG saving in useEffect]
- Correct pattern: [Source: architecture-reader-ui-epubjs.md#Communication Patterns — ✅ CORRECT progress saved in relocated handler]
- Storage shape: [Source: architecture-reader-ui-epubjs.md#Data Architecture — CFI-based Progress Persistence]
- Data flow: [Source: architecture-reader-ui-epubjs.md#Project Structure & Boundaries — Data Flow step 4]
- Epics AC: [Source: epics-reader-ui-epubjs.md#Story 3.2 Acceptance Criteria]
- StorageService: [Source: apps/reader/src/shared/services/storage.service.ts]
- bookmarks.store: [Source: apps/reader/src/stores/bookmarks.store.ts]

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List

- apps/reader/src/features/reader/ReaderEngine.tsx (bookId/bookTitle/initialCfi props, relocated save, resume effect)
- apps/reader/src/features/reader/ReaderPage.tsx (pass bookId, bookTitle, initialCfi from location.state)
- apps/reader/src/stores/bookmarks.store.ts (Bookmark.cfi replaces page)
- apps/reader/src/features/bookmarks/BookmarkCard.tsx (state.cfi, display "Vị trí đã lưu")
- apps/reader/src/shared/hooks/useStorageHydration.ts (hydrate only bookmarks with cfi)
- apps/reader/src/features/reader/ReaderEngine.test.tsx (progress persistence test)
- apps/reader/src/features/bookmarks/BookmarksPage.test.tsx (cfi fixtures)
- apps/reader/src/shared/hooks/useStorageHydration.test.ts (cfi bookmark fixtures)
