# Design: Book-Wide Page Count Fix

**Date:** 2026-03-22
**Status:** Approved

## Problem

The reader displays per-chapter page counts (`displayed.page / displayed.total` from epub.js `relocated` event) rather than book-wide counts. `displayed.total` resets every time the user navigates to a new chapter because epub.js scopes `location.start.displayed` to the current spine item. This broken count flows into the reader bottom bar (`PageProgress`), bookmarks page (`BookmarkCard`), and home page (`ContinueReadingCard`).

## Solution

Use epub.js `book.locations` API for book-wide positioning, backed by a per-book localforage cache so counts load instantly on repeat visits. Locations are always regenerated in the background on each book open to stay fresh.

## Architecture

### New hook: `useBookLocations(book, bookId)`

Single-responsibility hook that owns all location caching and generation logic.

**Location:** `apps/reader/src/features/reader/useBookLocations.ts`

**Interface:**
```ts
interface UseBookLocationsResult {
  totalPages: number           // 0 = not yet known (show "--")
  getPageFromCfi: (cfi: string) => number  // 1-based; returns 0 if locations not ready
}
```

**Behaviour — `useEffect` on `[book, bookId]`:**

```ts
useEffect(() => {
  if (!book) return
  let cancelled = false  // initialised false at start of each effect run

  // 1. Fast path: load cache immediately
  void storageService.getItem<BookLocationsCache>(bookLocationsKey(bookId))
    .then((cached) => {
      if (!cancelled && cached?.total > 0) setTotalPages(cached.total)
    })

  // 2. Background regeneration
  if (typeof book.locations?.generate !== 'function') return  // guard: not available
  void book.locations.generate(1600)
    .then(() => {
      // cancelled check MUST happen before any state or storage writes
      if (cancelled) return
      const total = book.locations.total
      if (total > 0) {
        setTotalPages(total)
        void storageService.setItem(
          bookLocationsKey(bookId),
          { total, generatedAt: Date.now() }
        )
      }
    })
    .catch((err) => {
      // generate() failure is non-fatal: totalPages stays at cached value or 0
      console.warn('[useBookLocations] generate error:', err)
    })

  return () => { cancelled = true }
}, [book, bookId])
```

- `cancelled = true` in cleanup runs synchronously before any pending `.then()` can execute, so there is no race between cleanup and the async resolution.
- epub.js does not expose a cancellation API for `generate()`; the `cancelled` flag is sufficient to discard the result.

**`getPageFromCfi(cfi)`:**
- Calls `book.locations.locationFromCfi(cfi)` → 0-based index → returns `index + 1`
- If the call returns `null`, `undefined`, or a value ≤ -1, return `0`
- If the call throws, catch, log `console.warn('[useBookLocations] locationFromCfi error:', err)`, and return `0`
- If `book` is `null`, return `0`

**No error state** is exposed in the result interface. All failures (generate error, locationFromCfi error, missing cache) degrade gracefully to `totalPages === 0` / page `0`, which the UI treats as "not yet known."

### Storage key

Add a standalone exported function to `apps/reader/src/shared/constants/storage.keys.ts`, following the same pattern as the existing `epubBlobCacheKey`:
```ts
export const BOOK_LOCATIONS_CACHE_PREFIX = 'book_locations_'

export function bookLocationsKey(bookId: string): string {
  return `${BOOK_LOCATIONS_CACHE_PREFIX}${bookId}`
}
```
Do NOT add it inside the `STORAGE_KEYS` object (which uses `as const` and only holds string literals).

Stored shape:
```ts
interface BookLocationsCache {
  total: number
  generatedAt: number  // Date.now() — available for future TTL use
}
```

### Changes to `ReaderEngine.tsx`

**Destructure `book`:** `book` is already in `ReaderEngineProps` but the component function currently destructures only `containerRef`, `rendition`, `isReady`, `error`, `bookId`, `bookTitle`, `initialCfi`. Add `book` to that destructuring list.

**Add hook call:**
```ts
const { totalPages, getPageFromCfi } = useBookLocations(book, bookId)
```

**Replace progress logic in `handleRelocated`:**

Remove the existing block:
```ts
if (displayed && displayed.total > 0) {
  setProgress(displayed.page, displayed.total)
  setLastRead(bookId, bookTitle, displayed.page, displayed.total)
}
```

Replace with:
```ts
const currentPage = getPageFromCfi(cfi)
if (totalPages > 0 && currentPage > 0) {
  setProgress(currentPage, totalPages)
  setLastRead(bookId, bookTitle, currentPage, totalPages)
}
```

**Keep `locationAnnouncement` logic unchanged.** It still uses `displayed` for the aria-live text. When `totalPages === 0` (locations not yet ready), the `displayed` percentage path (`pct`) provides the fallback announcement text. No change needed there.

**Keep bookmark saving logic unchanged** — it already uses the `displayed` conditional separately and can keep the existing `displayed.total > 0` guard for `page`/`total` fields written to the bookmark.

### Changes to `PageProgress.tsx`

`currentPage` from the store is now **1-based** (set by `getPageFromCfi` which returns `index + 1`). The component currently renders `{currentPage + 1}` — remove the `+ 1` since it is no longer needed.

When `totalPages === 0`, show placeholders in both visible text and `aria-label`:

```tsx
<p
  aria-label={totalPages === 0 ? 'Đang tải số trang' : `Trang ${currentPage} trên ${totalPages}`}
  ...
>
  {totalPages === 0 ? '-- / --' : `${currentPage} / ${totalPages}`}
</p>
```

### No changes needed

- `reader.store.ts` — `currentPage` / `totalPages` shape already correct
- `BookmarkCard.tsx` — reads `bookmark.page / bookmark.total` written by `setLastRead`, which will now have correct values
- `BookmarksPage.tsx` — no change
- `HomePage.tsx` — reads from store via `lastReadPage / lastReadTotalPages`, which will now have correct values

## Data Flow

```
book.locations.generate()
        ↓
useBookLocations → totalPages, getPageFromCfi
        ↓
ReaderEngine (handleRelocated)
        ↓
setProgress(currentPage, totalPages)  →  reader.store (1-based currentPage)
setLastRead(...)                      →  reader.store + storageService
        ↓
PageProgress (bottom bar) — no +1 offset
HomePage ContinueReadingCard
BookmarkCard
```

## First-Open UX

- No cache → `totalPages === 0` → `PageProgress` shows `-- / --`, aria-label says "Đang tải số trang"
- Generation completes (seconds) → count appears and is cached
- Subsequent opens → cached count appears instantly, regeneration runs silently in background

## Testing

**`useBookLocations`:**
- Cache hit: mock `storageService.getItem` returning `{ total: 42, generatedAt: 0 }`, mock `book.locations.generate` resolving with `book.locations.total = 50` after a delay — assert `totalPages` is immediately `42`, then updates to `50` when generate resolves, and `storageService.setItem` is called with `total: 50`
- Cache miss: mock `storageService.getItem` returning `null` — assert `totalPages` is `0` initially, then `book.locations.total` after generate
- Unmount before generate resolves: call cleanup before `generate()` promise resolves — assert `setTotalPages` is NOT called and `storageService.setItem` is NOT called
- `generate()` throws: assert `totalPages` stays at cached value (or `0`), `console.warn` called, no crash
- `getPageFromCfi` valid: mock `book.locations.locationFromCfi` returning `4` (0-based) → assert return value is `5`
- `getPageFromCfi` returns null: assert returns `0`
- `getPageFromCfi` throws: assert returns `0`, `console.warn` called
- `book.locations.generate` not a function: assert hook does not throw, `totalPages` stays `0`

**`ReaderEngine`:**
- Mock `useBookLocations` returning `{ totalPages: 0, getPageFromCfi: () => 0 }` — assert `setProgress` is NOT called on relocated
- Mock `useBookLocations` returning `{ totalPages: 200, getPageFromCfi: () => 42 }` — assert `setProgress(42, 200)` called on relocated

**`PageProgress`:**
- `totalPages === 0`: assert visible text is `-- / --`, aria-label is `'Đang tải số trang'`
- `totalPages > 0`: assert visible text is `{currentPage} / {totalPages}` (no +1 offset), aria-label is `Trang ${currentPage} trên ${totalPages}`
