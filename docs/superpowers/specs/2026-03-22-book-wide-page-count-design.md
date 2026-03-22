# Design: Book-Wide Page Count Fix

**Date:** 2026-03-22
**Status:** Approved

## Problem

The reader displays per-chapter page counts (`displayed.page / displayed.total` from epub.js `relocated` event) rather than book-wide counts. `displayed.total` resets every time the user navigates to a new chapter because epub.js scopes `location.start.displayed` to the current spine item. This broken count flows into the reader bottom bar (`PageProgress`), bookmarks page (`BookmarkCard`), and home page (`ContinueReadingCard`).

## Why `book.locations.generate()` Does Not Work

epub.js's `book.locations.generate(charsPerPage)` counts characters — it does not account for images, inline styles, spacing, or font size. It would produce page counts that don't match what the user sees. The only accurate way to count pages in a paginated rendition is to **actually render each spine item** and read `displayed.total` from the `relocated` event.

## Solution

Walk all spine items using a **hidden background rendition** (same dimensions and font-size as the visible one), collect `displayed.total` per spine item, sum them for the book total. Cache the result keyed by `bookId + fontSize` so it loads instantly on repeat visits and is automatically invalidated when font size changes.

## Architecture

### New hook: `useBookLocations(book, bookId, fontSize, containerRef)`

**Location:** `apps/reader/src/features/reader/useBookLocations.ts`

**Signature:**
```ts
function useBookLocations(
  book: Book | null,
  bookId: string,
  fontSize: number,
  containerRef: React.RefObject<HTMLDivElement>,
): UseBookLocationsResult
```

**Interface:**
```ts
interface UseBookLocationsResult {
  totalPages: number  // 0 = not yet known (show "--")
  getAbsolutePage: (spineIndex: number, pageWithinChapter: number) => number
  // Returns 0 if spine counts not yet loaded
}
```

**epub.js spine API used:**
- `book.spine.spineItems` — ordered `Section[]`, each with `.href: string` and `.index: number` (0-based)
- `location.start.index` — 0-based spine index provided by epub.js in every `relocated` event payload (verified present in epub.js ≥ 0.3)

**Behaviour — `useEffect` on `[book, bookId, fontSize]`:**

```ts
useEffect(() => {
  if (!book || !containerRef.current) return

  const width = containerRef.current.offsetWidth
  const height = containerRef.current.offsetHeight
  // Guard: container must have real dimensions for paginated layout to work
  if (width === 0 || height === 0) return

  let cancelled = false

  // 1. Fast path: load cache immediately
  void storageService.getItem<BookLocationsCache>(bookLocationsKey(bookId, fontSize))
    .then((cached) => {
      if (!cancelled && cached && cached.spinePageCounts.length > 0) {
        setSpinePageCounts(cached.spinePageCounts)
        setTotalPages(cached.totalPages)
      }
    })

  // 2. Background walk using a hidden off-screen rendition.
  // The div must be in the DOM with real pixel dimensions for epub.js to paginate correctly.
  // opacity:0 + pointer-events:none keeps it invisible without affecting layout.
  const hiddenDiv = document.createElement('div')
  hiddenDiv.style.cssText =
    `position:fixed;top:0;left:0;width:${width}px;height:${height}px;` +
    `opacity:0;pointer-events:none;z-index:-1`
  document.body.appendChild(hiddenDiv)

  const hiddenRendition = book.renderTo(hiddenDiv, { flow: 'paginated', width, height })
  hiddenRendition.themes.fontSize(`${fontSize}px`)

  // book.spine.spineItems: ordered Section[], each with .href and .index
  const spineItems: Array<{ href: string; index: number }> = book.spine.spineItems
  const counts: number[] = new Array(spineItems.length).fill(0)
  let currentIndex = 0

  const advance = () => {
    currentIndex++
    if (currentIndex >= spineItems.length) {
      // All spine items walked — finalise
      hiddenRendition.off('relocated', handleRelocated)
      if (cancelled) { hiddenDiv.remove(); return }
      const sum = counts.reduce((a, b) => a + b, 0)
      setSpinePageCounts([...counts])
      setTotalPages(sum)
      void storageService.setItem(bookLocationsKey(bookId, fontSize), {
        spinePageCounts: counts, totalPages: sum, fontSize, generatedAt: Date.now(),
      })
      hiddenDiv.remove()
    } else {
      void hiddenRendition.display(spineItems[currentIndex].href)
    }
  }

  const handleRelocated = (location: { start?: { displayed?: { total: number } } }) => {
    counts[currentIndex] = location?.start?.displayed?.total ?? 0
    advance()
  }

  // If a spine item fails to render, 'loadError' fires instead of 'relocated'.
  // Treat it as 0 pages for that item and move on so the walk never gets stuck.
  const handleLoadError = () => {
    counts[currentIndex] = 0
    advance()
  }

  hiddenRendition.on('relocated', handleRelocated)
  hiddenRendition.on('loadError', handleLoadError)
  void hiddenRendition.display(spineItems[0].href)

  return () => {
    cancelled = true
    hiddenRendition.off('relocated', handleRelocated)
    hiddenRendition.off('loadError', handleLoadError)
    // hiddenDiv.remove() is called inside advance() when the walk completes;
    // if cancelled before completion, remove it here to avoid a DOM leak.
    if (hiddenDiv.parentNode) hiddenDiv.remove()
  }
}, [book, bookId, fontSize])
```

**`getAbsolutePage(spineIndex, pageWithinChapter)`:**
- If `spinePageCounts` is empty, return `0`
- `offset = sum(spinePageCounts[0..spineIndex-1])`
- Return `offset + pageWithinChapter`
- If `spineIndex` is out of range, return `0`

**No error state** is exposed. Failures (e.g. a spine item fails to load) degrade gracefully — that item's count stays `0` and we continue. The final total may be slightly off but will not crash.

**Concurrency with user navigation:** The hidden rendition is completely independent from the visible rendition — they share the same `Book` object (read-only) but have separate render contexts. The user can freely navigate the visible rendition while the hidden one walks spine items. No locking or coordination needed.

### Storage key

Add to `apps/reader/src/shared/constants/storage.keys.ts`, following the existing `epubBlobCacheKey` pattern:

```ts
export const BOOK_LOCATIONS_CACHE_PREFIX = 'book_locations_'

export function bookLocationsKey(bookId: string, fontSize: number): string {
  return `${BOOK_LOCATIONS_CACHE_PREFIX}${bookId}_fs${fontSize}`
}
```

Do NOT add inside `STORAGE_KEYS` (which uses `as const` for string literals only).

Stored shape:
```ts
interface BookLocationsCache {
  spinePageCounts: number[]  // index = spine item index, value = pages in that item
  totalPages: number         // sum of spinePageCounts
  fontSize: number           // font size used when counting
  generatedAt: number        // Date.now()
}
```

Different font sizes produce different cache entries and are independently valid. No manual invalidation needed.

### Changes to `ReaderEngine.tsx`

**Extend `RelocatedLocation` interface** to include spine item index:
```ts
interface RelocatedLocation {
  start?: {
    cfi?: string
    index?: number  // spine item index (0-based) — add this
    percentage?: number
    displayed?: { page: number; total: number }
  }
}
```

**Destructure `book` from props** — already in `ReaderEngineProps` but not yet destructured in the function body. Add it.

**Add hook call** (after existing store/settings hooks):
```ts
const { fontSize } = useSettingsStore()
const { totalPages, getAbsolutePage } = useBookLocations(book, bookId, fontSize, containerRef)
```

**Replace progress logic in `handleRelocated`:**

Remove:
```ts
if (displayed && displayed.total > 0) {
  setProgress(displayed.page, displayed.total)
  setLastRead(bookId, bookTitle, displayed.page, displayed.total)
}
```

Replace with:
```ts
const spineIndex = location?.start?.index ?? -1
const pageWithinChapter = displayed?.page ?? 0
const currentPage = spineIndex >= 0 ? getAbsolutePage(spineIndex, pageWithinChapter) : 0

if (totalPages > 0 && currentPage > 0) {
  setProgress(currentPage, totalPages)
  setLastRead(bookId, bookTitle, currentPage, totalPages)
}
```

**Keep `locationAnnouncement` logic unchanged.** It still uses `displayed` / `pct` for the aria-live text — this is independent of page counting.

**Keep bookmark saving logic unchanged** — it guards on `displayed.total > 0` separately for the `page`/`total` fields written to bookmarks.

### Changes to `PageProgress.tsx`

`currentPage` from the store is now **1-based** (from `getAbsolutePage`). Remove the existing `+ 1` offset.

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
- `BookmarkCard.tsx` — reads `bookmark.page / bookmark.total` written by `setLastRead`, now correct
- `BookmarksPage.tsx` — no change
- `HomePage.tsx` — reads `lastReadPage / lastReadTotalPages` from store, now correct

## Data Flow

```
Hidden rendition walks all spine items
        ↓ collects displayed.total per item
useBookLocations → spinePageCounts[], totalPages, getAbsolutePage
        ↓
ReaderEngine (handleRelocated) uses location.start.index + displayed.page
        ↓
setProgress(currentPage, totalPages)  →  reader.store (1-based currentPage)
setLastRead(...)                      →  reader.store + storageService
        ↓
PageProgress, HomePage ContinueReadingCard, BookmarkCard
```

## First-Open UX

- No cache → `totalPages === 0` → `PageProgress` shows `-- / --`
- Hidden rendition walks spine items in background (seconds for small books)
- Count appears once walk completes; cached keyed by bookId + fontSize
- Subsequent opens → cached count appears instantly; walk re-runs silently to refresh
- Font size change → new cache key → shows `-- / --` briefly while new walk runs

## Testing

**`useBookLocations`:**
- Cache hit: mock `storageService.getItem` returning valid cache → assert `totalPages` and `spinePageCounts` set immediately without waiting for walk
- Walk completes: mock spine with 3 items, mock `relocated` firing with `displayed.total` 5, 3, 7 → assert `totalPages === 15`, `storageService.setItem` called with correct payload
- Unmount during walk: set `cancelled = true` before walk finishes → assert `setTotalPages` not called, `hiddenDiv` removed from DOM
- `getAbsolutePage`: spine counts `[5, 3, 7]`, `getAbsolutePage(1, 2)` → `5 + 2 = 7`; `getAbsolutePage(0, 1)` → `1`; `getAbsolutePage(-1, 1)` → `0`; empty counts → `0`
- Font size change: effect re-runs with new cache key; old walk is cancelled, new walk starts

**`ReaderEngine`:**
- Mock `useBookLocations` returning `{ totalPages: 0, getAbsolutePage: () => 0 }` → assert `setProgress` NOT called on relocated
- Mock `useBookLocations` returning `{ totalPages: 15, getAbsolutePage: () => 7 }` → assert `setProgress(7, 15)` called on relocated with `location.start.index = 1, displayed.page = 2`

**`PageProgress`:**
- `totalPages === 0`: visible text `-- / --`, aria-label `'Đang tải số trang'`
- `totalPages > 0, currentPage = 7`: visible text `7 / 15`, aria-label `'Trang 7 trên 15'` (no `+1` offset)
