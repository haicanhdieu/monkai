---
title: 'Manual Bookmarks for Reader'
slug: 'manual-bookmarks-reader'
created: '2026-03-16'
status: 'completed'
stepsCompleted: [1, 2, 3, 4]
tech_stack: ['React 18', 'TypeScript', 'Zustand + immer', 'Tailwind v3', 'Radix UI Icons', 'localforage (via StorageService)', 'Vitest + Testing Library']
files_to_modify:
  - 'apps/reader/src/stores/bookmarks.store.ts'
  - 'apps/reader/src/shared/hooks/useStorageHydration.ts'
  - 'apps/reader/src/features/reader/ReaderEngine.tsx'
  - 'apps/reader/src/features/reader/ChromelessLayout.tsx'
  - 'apps/reader/src/features/bookmarks/BookmarksPage.tsx'
  - 'apps/reader/src/features/bookmarks/BookmarkCard.tsx'
code_patterns:
  - 'Zustand + immer for stores'
  - 'CSS variables for theming (no Tailwind color classes)'
  - 'data-testid on interactive elements'
  - 'storageService.setItem debounced 300ms for bookmark persistence'
  - 'useReaderStore for currentCfi (already available in ChromelessLayout)'
test_patterns:
  - 'Vitest + @testing-library/react'
  - 'vi.useFakeTimers() for timer tests'
  - 'vi.mock() for module mocks'
  - 'useXxxStore.setState({}) for store setup in tests'
  - 'act() for interactions, waitFor() for async'
  - 'data-testid selectors preferred'
---

# Tech-Spec: Manual Bookmarks for Reader

**Created:** 2026-03-16

## Overview

### Problem Statement

Users can only have one auto-bookmark per book (last read position, saved automatically on every page turn). There is no way to intentionally mark important passages while reading, making it impossible to return to specific meaningful pages across multiple books.

### Solution

Add a manual bookmark toggle button to the reader chrome (top bar, right side). Users tap it to save the current page as a manual bookmark; tapping again removes it. The Bookmarks page is redesigned to group bookmarks by book, with visual distinction between the single auto-bookmark (last read position) and user-created manual bookmarks.

### Scope

**In Scope:**
- Add `type: 'auto' | 'manual'` field to the `Bookmark` interface
- Store: add `addManualBookmark(bookmark)` and `removeManualBookmark(bookId, cfi)` actions; `upsertBookmark` scoped to `type === 'auto'` entries only
- `ChromelessLayout`: bookmark icon button in top bar (always rendered, outside TOC conditional); outline when not bookmarked, filled (`--color-accent`) when bookmarked; tapping toggles; both add and remove persist immediately to storage (debounced 300ms)
- Toggle micro-animation: `active:scale-125` Tailwind class on tap
- New constant `CHROME_BOOKMARK_AUTOHIDE_MS = 4000` — auto-hide timer resets to this value on bookmark tap
- `BookmarksPage`: grouped layout (one section per book), groups sorted by most-recently-accessed; within each group, auto-bookmark first, then manual sorted by page asc (nulls last); catalog query lifted to page level
- `BookmarkCard`: type-aware rendering (auto: muted/no icon; manual: filled star in accent); swipe-to-delete for manual only with click-propagation guard; `data-testid="bookmark-card"` on swipeable wrapper
- Storage: all bookmarks persisted together in `STORAGE_KEYS.BOOKMARKS`

**Out of Scope:**
- Bookmark labels or notes
- Pagination or filtering of bookmarks
- Cross-device sync
- Deleting or editing auto-bookmarks
- "Show less / Xem thêm" collapse per group (deferred)

## Context for Development

### Codebase Patterns

- **Zustand + immer stores**: All stores use `create<State>()(immer(...))`. Direct mutation in `set()` callbacks. Store selectors via `useXxxStore()` in components; direct state access via `useXxxStore.getState()` in non-React code.
- **Storage persistence**: `storageService.setItem(STORAGE_KEYS.BOOKMARKS, useBookmarksStore.getState().bookmarks)` — always saves the full array. Debounced 300ms via `setTimeout`. Pattern established in `ReaderEngine.tsx:123-130`.
- **Hydration**: `useStorageHydration` in `App.tsx` (runs once on mount). Validates with `isValidBookId`. Filters invalid entries before calling `store.hydrate()`.
- **Theming**: Always `style={{ color: 'var(--color-accent)' }}` — never `className="text-accent"`. Tailwind used for layout/spacing only.
- **Icons**: `@radix-ui/react-icons` — `BookmarkIcon` (outline) and `BookmarkFilledIcon` (filled) both exist in the package.
- **`data-testid`**: Every interactive element and key container gets a `data-testid`. Tests use `screen.getByTestId()` as primary selector.
- **Tab index pattern**: Buttons inside chrome bars get `tabIndex={chromeHidden ? -1 : 0}`.
- **`book.id` available**: `ChromelessLayout` receives `book: Book` prop — `book.id` is the bookId, no new prop needed.
- **`currentCfi` in store**: `useReaderStore` has `currentCfi: string | null`. `ChromelessLayout` already imports `useReaderStore` — add `currentCfi` to the destructure.

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `apps/reader/src/stores/bookmarks.store.ts` | Bookmark state — add `type` field, fix `upsertBookmark`, add new actions |
| `apps/reader/src/features/reader/ChromelessLayout.tsx` | Reader chrome — add bookmark button, new timer constant, storage imports |
| `apps/reader/src/features/reader/ReaderEngine.tsx` | Auto-bookmark — add `type: 'auto'` to `upsertBookmark` payload |
| `apps/reader/src/features/bookmarks/BookmarksPage.tsx` | Redesign to grouped layout, lift catalog query |
| `apps/reader/src/features/bookmarks/BookmarkCard.tsx` | Type indicator, swipe-to-delete with click guard, accept `coverUrl` prop |
| `apps/reader/src/shared/hooks/useStorageHydration.ts` | Default missing `type` to `'auto'` on hydration |
| `apps/reader/src/stores/reader.store.ts` | Reference only — `currentCfi: string | null` at line 3 |
| `apps/reader/src/shared/constants/storage.keys.ts` | `STORAGE_KEYS.BOOKMARKS = 'bookmarks'` — no change needed |

### Technical Decisions

- **`upsertBookmark` fix (F1)**: Change `findIndex` from `b.bookId === bookmark.bookId` to `b.bookId === bookmark.bookId && b.type === 'auto'`. This prevents page turns from overwriting manual bookmarks.

- **`type` field atomicity (F4)**: `type` is added as required to `Bookmark`. Tasks 1 and 3 **must be completed in the same commit** — Task 1 adds the field (causing TS errors at auto-bookmark call sites), Task 3 fixes those call sites. Do not merge Task 1 alone.

- **Swipe + Link conflict (F2)**: `BookmarkCard` outer wrapper is a `<div data-testid="bookmark-card">` with `overflow-hidden relative`. For manual cards, pointer handlers are on this wrapper. A `didSwipe` ref tracks whether the pointer moved > 5px. An `onClickCapture` on the wrapper stops propagation if `didSwipe.current` is true, preventing the inner `<Link>` from navigating after a swipe. Reset `didSwipe` on `pointerDown`.

- **Storage persistence (F3, F10)**: Both add and remove paths in `handleBookmarkToggle` must persist. Use the same 300ms debounce pattern as `ReaderEngine` — a `bookmarkToggleSaveTimeoutRef` in `ChromelessLayout`. On add or remove: clear any pending timeout, set a new 300ms timeout that calls `storageService.setItem(STORAGE_KEYS.BOOKMARKS, useBookmarksStore.getState().bookmarks)`.

- **New timer constant (F7)**: Export `CHROME_BOOKMARK_AUTOHIDE_MS = 4000` from `ChromelessLayout.tsx`. Do NOT change `CHROME_AUTOHIDE_MS = 3000` (used by existing auto-hide and tests). `handleBookmarkToggle` uses `CHROME_BOOKMARK_AUTOHIDE_MS` for its reset; the initial mount auto-hide uses `CHROME_AUTOHIDE_MS` as before. The timer guard `if (useReaderStore.getState().isChromeVisible)` prevents it from calling `toggleChrome()` if chrome was already hidden by user.

- **Swipe numbers reconciled (F6)**: threshold = 60px (reveal), lock = 72px (= delete zone width), clamp = 72px. `setSwipeX(Math.min(delta, 72))`. No 80px anywhere. Card translates by exactly `swipeX` pixels.

- **Bookmark button placement (F11)**: The bookmark button is placed in the top bar JSX **outside** the `{getToc && navigateToTocEntry && (...)}` conditional. It is always rendered regardless of whether TOC is available.

- **React keys (F5)**: In `BookmarksPage`, list items use key `${b.bookId}-${b.cfi}-${b.type}` — not `bookId` alone.

- **Catalog query lifted (F9)**: `BookmarksPage` calls `useCatalogIndex()` once. It passes `coverUrl` (resolved via `resolveCoverUrl`) to both group headers and `BookmarkCard` as a prop. `BookmarkCard` no longer calls `useCatalogIndex` internally — it receives `coverUrl: string | null` as a prop. Update `BookmarkCardProps` accordingly.

- **Within-group sort fallback (F12)**: Manual bookmarks sorted by `page` ascending. Items where `page` is `null` or `undefined` sort to the end (use `(a.page ?? Infinity) - (b.page ?? Infinity)`). No CFI string sort.

- **Group sort dominance (F13)**: Groups are ordered by `Math.max(...timestamps)` descending. Because auto-bookmarks update on every page turn, the auto-bookmark timestamp typically dominates. This is intentional — "most recently read" is the correct UX goal.

- **Empty state test strategy (F15)**: Tests assert `data-testid="bookmarks-empty-state"` exists and use `toHaveTextContent(/Chưa có dấu trang nào/)` (partial match, no emoji) to avoid jsdom emoji normalization issues.

## Implementation Plan

### Tasks

- [x] **Task 1 + Task 3 (atomic): Extend `Bookmark` interface, fix `upsertBookmark`, add store actions, add `type: 'auto'` to ReaderEngine**
  > ⚠️ These two tasks must be completed in the same commit — adding `type` as required breaks compilation until Task 3 is also done.

  **Task 1 — File: `apps/reader/src/stores/bookmarks.store.ts`**
  - Action: Add `type: 'auto' | 'manual'` as a required field to the `Bookmark` interface.
  - Action: Fix `upsertBookmark`: change `findIndex` from `b.bookId === bookmark.bookId` to `b.bookId === bookmark.bookId && b.type === 'auto'`. This prevents auto page-turn saves from overwriting manual bookmarks.
  - Action: Add `addManualBookmark: (bookmark: Bookmark) => void` and `removeManualBookmark: (bookId: string, cfi: string) => void` to `BookmarksState`.
  - Action: Implement `addManualBookmark`: push only if no existing entry with `b.bookId === bookmark.bookId && b.cfi === bookmark.cfi && b.type === 'manual'` (idempotent).
  - Action: Implement `removeManualBookmark`: `state.bookmarks = state.bookmarks.filter(b => !(b.bookId === bookId && b.cfi === cfi && b.type === 'manual'))` — only removes `type === 'manual'` entries, never auto.

  **Task 3 — File: `apps/reader/src/features/reader/ReaderEngine.tsx`**
  - Action: In `handleRelocated` (~line 116), add `type: 'auto'` to the `upsertBookmark` payload:
    ```ts
    useBookmarksStore.getState().upsertBookmark({
      bookId,
      bookTitle,
      cfi,
      type: 'auto',
      timestamp: Date.now(),
      ...(displayed && displayed.total > 0 ? { page: displayed.page, total: displayed.total } : {}),
    })
    ```

- [x] **Task 2: Default legacy `type` to `'auto'` in hydration**
  - File: `apps/reader/src/shared/hooks/useStorageHydration.ts`
  - Action: Replace the current `validBookmarks` filter with:
    ```ts
    const validBookmarks = bookmarks
      .filter((b) => isValidBookId(b.bookId) && typeof b.cfi === 'string')
      .map((b) => ({
        ...b,
        type: (b as { type?: string }).type === 'manual' ? 'manual' : 'auto',
      } as Bookmark))
    ```
  - Note: Non-breaking — stored bookmarks without `type` become `'auto'`.

- [x] **Task 4: Add manual bookmark toggle button to `ChromelessLayout`**
  - File: `apps/reader/src/features/reader/ChromelessLayout.tsx`
  - Action: Add imports: `useBookmarksStore` from `@/stores/bookmarks.store`; `BookmarkIcon`, `BookmarkFilledIcon` from `@radix-ui/react-icons`; `storageService` from `@/shared/services/storage.service`; `STORAGE_KEYS` from `@/shared/constants/storage.keys`.
  - Action: Export new constant alongside `CHROME_AUTOHIDE_MS`: `export const CHROME_BOOKMARK_AUTOHIDE_MS = 4000`. Do NOT change `CHROME_AUTOHIDE_MS`.
  - Action: Add `currentCfi` to the `useReaderStore` destructure (line 45).
  - Action: Destructure from `useBookmarksStore`: `const { bookmarks, addManualBookmark, removeManualBookmark } = useBookmarksStore()`
  - Action: Add `const bookmarkToggleSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)` for debounced storage save.
  - Action: Compute: `const isManuallyBookmarked = currentCfi != null && bookmarks.some(b => b.bookId === book.id && b.cfi === currentCfi && b.type === 'manual')`
  - Action: Add `handleBookmarkToggle`:
    ```ts
    const handleBookmarkToggle = () => {
      if (!currentCfi) return
      // Reset auto-hide to 4s so user sees the result before chrome fades
      if (autoHideTimerRef.current !== null) clearTimeout(autoHideTimerRef.current)
      autoHideTimerRef.current = setTimeout(() => {
        if (useReaderStore.getState().isChromeVisible) toggleChrome()
        autoHideTimerRef.current = null
      }, CHROME_BOOKMARK_AUTOHIDE_MS)
      // Toggle bookmark
      if (isManuallyBookmarked) {
        removeManualBookmark(book.id, currentCfi)
      } else {
        addManualBookmark({ bookId: book.id, bookTitle: book.title, cfi: currentCfi, type: 'manual', timestamp: Date.now() })
      }
      // Debounced persist (300ms) — covers both add and remove
      if (bookmarkToggleSaveTimeoutRef.current) clearTimeout(bookmarkToggleSaveTimeoutRef.current)
      bookmarkToggleSaveTimeoutRef.current = setTimeout(() => {
        void storageService.setItem(STORAGE_KEYS.BOOKMARKS, useBookmarksStore.getState().bookmarks)
        bookmarkToggleSaveTimeoutRef.current = null
      }, 300)
    }
    ```
  - Action: Clean up `bookmarkToggleSaveTimeoutRef` in the existing cleanup return of the keyboard effect (add alongside existing cleanup).
  - Action: Add bookmark button to top bar JSX. Place it **outside** and after the `{getToc && navigateToTocEntry && (...)}` block — always rendered:
    ```tsx
    <button
      type="button"
      onClick={handleBookmarkToggle}
      disabled={currentCfi == null}
      className="text-sm bg-transparent border-none cursor-pointer p-2 font-inherit focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-surface)] active:scale-125 transition-transform"
      style={{ color: isManuallyBookmarked ? 'var(--color-accent)' : 'var(--color-text-muted)' }}
      tabIndex={chromeHidden || currentCfi == null ? -1 : 0}
      aria-label={isManuallyBookmarked ? 'Xóa dấu trang' : 'Thêm dấu trang'}
      data-testid="bookmark-toggle"
      aria-pressed={isManuallyBookmarked}
    >
      {isManuallyBookmarked
        ? <BookmarkFilledIcon className="h-4 w-4" aria-hidden="true" />
        : <BookmarkIcon className="h-4 w-4" aria-hidden="true" />}
    </button>
    ```

- [x] **Task 5: Redesign `BookmarksPage` for grouped layout**
  - File: `apps/reader/src/features/bookmarks/BookmarksPage.tsx`
  - Action: Remove unused `BookmarkIcon` import (was used for old empty state).
  - Action: Call `useCatalogIndex()` once at the page level. Build a `coverUrlMap: Record<string, string | null>` mapping `bookId → resolvedCoverUrl` using `resolveCoverUrl` from `@/shared/services/data.service`. Pass `coverUrl={coverUrlMap[b.bookId] ?? null}` to each `BookmarkCard`.
  - Action: Import `removeManualBookmark` from `useBookmarksStore`.
  - Action: Replace the flat `sorted` array with grouped structure:
    ```ts
    const groups = Object.values(
      bookmarks.reduce<Record<string, { bookId: string; bookTitle: string; items: typeof bookmarks }>>(
        (acc, b) => {
          if (!acc[b.bookId]) acc[b.bookId] = { bookId: b.bookId, bookTitle: b.bookTitle, items: [] }
          acc[b.bookId].items.push(b)
          return acc
        },
        {}
      )
    )
    .sort((a, b) =>
      Math.max(...b.items.map(i => i.timestamp)) - Math.max(...a.items.map(i => i.timestamp))
    )
    .map(g => ({
      ...g,
      items: [
        ...g.items.filter(b => b.type === 'auto'),
        ...g.items
          .filter(b => b.type === 'manual')
          .sort((a, b) => (a.page ?? Infinity) - (b.page ?? Infinity)),
      ],
    }))
    ```
  - Action: Render group sections. Each group:
    - Outer `<section data-testid="bookmark-group">`
    - Header `<div data-testid="bookmark-group-header">` containing: small cover thumbnail (40×56px, use `coverUrlMap[group.bookId]`) + book title text
    - Sub-list `<ul>` with items:
      ```tsx
      {group.items.map((b) => (
        <li key={`${b.bookId}-${b.cfi}-${b.type}`}>
          <BookmarkCard
            bookmark={b}
            coverUrl={coverUrlMap[b.bookId] ?? null}
            onDelete={b.type === 'manual' ? () => {
              removeManualBookmark(b.bookId, b.cfi)
              // Immediate persist on delete
              void storageService.setItem(STORAGE_KEYS.BOOKMARKS, useBookmarksStore.getState().bookmarks)
            } : undefined}
          />
        </li>
      ))}
      ```
  - Action: Update empty state to `data-testid="bookmarks-empty-state"` with text "Chưa có dấu trang nào. Nhấn 🔖 khi đọc để lưu trang." (keep existing library link below).
  - Action: Import `storageService` and `STORAGE_KEYS` for the delete persist call.

- [x] **Task 6: Update `BookmarkCard` for type indicator and swipe-to-delete**
  - File: `apps/reader/src/features/bookmarks/BookmarkCard.tsx`
  - Action: Remove `useCatalogIndex` call and `resolveCoverUrl` import — card now receives `coverUrl: string | null` as a prop.
  - Action: Update `BookmarkCardProps`: add `coverUrl: string | null`, `onDelete?: () => void`. Remove internal cover resolution logic.
  - Action: Add `BookmarkFilledIcon` to `@radix-ui/react-icons` import.
  - Action: Add local state: `const [swipeX, setSwipeX] = useState(0)`, `const startXRef = useRef(0)`, `const didSwipeRef = useRef(false)`.
  - Action: Outer wrapper becomes `<div data-testid="bookmark-card" className="relative overflow-hidden">` for all card types.
  - Action: For `type === 'manual'`, attach pointer handlers to the outer `<div>` and add a click guard:
    ```tsx
    onPointerDown={(e) => { startXRef.current = e.clientX; didSwipeRef.current = false }}
    onPointerMove={(e) => {
      const delta = startXRef.current - e.clientX
      if (delta > 5) didSwipeRef.current = true
      if (delta > 0) setSwipeX(Math.min(delta, 72))
    }}
    onPointerUp={() => { if (swipeX < 60) setSwipeX(0) }}
    onPointerLeave={() => { if (swipeX < 60) setSwipeX(0) }}
    onClickCapture={(e) => { if (didSwipeRef.current) { e.stopPropagation(); e.preventDefault(); didSwipeRef.current = false } }}
    ```
  - Action: Render delete zone for `type === 'manual'` only — absolutely positioned behind card:
    ```tsx
    {bookmark.type === 'manual' && (
      <div
        className="absolute inset-y-0 right-0 flex items-center justify-center w-[72px]"
        style={{ backgroundColor: 'var(--color-error, #ef4444)' }}
        aria-hidden={swipeX < 60}
      >
        <button
          type="button"
          onClick={() => onDelete?.()}
          aria-label="Xóa dấu trang"
          data-testid="bookmark-delete-btn"
          className="w-full h-full text-white text-xs font-medium"
        >
          Xóa
        </button>
      </div>
    )}
    ```
  - Action: The `<Link>` is nested inside the outer `<div>`, translated left by `swipeX`:
    ```tsx
    <Link
      to={toRead(bookmark.bookId)}
      state={{ cfi: bookmark.cfi }}
      style={{ transform: `translateX(-${swipeX}px)`, transition: swipeX === 0 ? 'transform 0.2s' : 'none' }}
      className="relative flex min-h-[44px] gap-4 rounded-2xl border p-4 transition-colors hover:brightness-95"
      style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
    >
    ```
    Note: merge the two `style` props into one.
  - Action: Inside the `<Link>`, type-aware content:
    - `type === 'auto'`: no icon, position text in `--color-text-muted`, `text-sm`, label "Đang đọc" replacing "Vị trí đã lưu"
    - `type === 'manual'`: `BookmarkFilledIcon` in `--color-accent` to the left, full `--color-text` weight
  - Note: `type === 'auto'` card has no pointer handlers, no delete zone, no `onClickCapture` — just the outer `<div>` wrapper + `<Link>`.

- [x] **Task 7: Write `bookmarks.store.test.ts`** (new file)
  - File: `apps/reader/src/stores/bookmarks.store.test.ts`
  - Pattern: `settings.store.test.ts` (no storage mock needed).
  - Tests:
    - `upsertBookmark` replaces auto-bookmark by `bookId` (regression — confirms fix didn't break existing behavior)
    - `upsertBookmark` with `type: 'auto'` does NOT replace a manual bookmark with same `bookId`
    - `addManualBookmark` adds a bookmark to the store
    - `addManualBookmark` is idempotent: same `bookId + cfi` twice → only one entry
    - `addManualBookmark` allows different `cfi` values for the same `bookId`
    - `removeManualBookmark` removes the matching manual bookmark
    - `removeManualBookmark` does NOT remove an auto-bookmark with the same `bookId + cfi`
    - `removeManualBookmark` on non-existent entry is a no-op (no error, store unchanged)

- [x] **Task 8: Update `useStorageHydration.test.ts`**
  - File: `apps/reader/src/shared/hooks/useStorageHydration.test.ts`
  - Action: Add one test using existing UUID/CFI fixtures:
    ```ts
    it('defaults type to "auto" for legacy bookmarks without a type field', async () => {
      const bookmarks = [
        { bookId: UUID_BOOK_ID, bookTitle: 'Legacy', cfi: SAMPLE_CFI, timestamp: 1000 }
      ]
      mockStorageService.getItem
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(bookmarks)
      const { unmount } = renderHook(() => useStorageHydration())
      await vi.waitFor(() => {
        expect(useBookmarksStore.getState().bookmarks[0].type).toBe('auto')
      })
      unmount()
    })
    ```

- [x] **Task 9: Update `ChromelessLayout.test.tsx`**
  - File: `apps/reader/src/features/reader/ChromelessLayout.test.tsx`
  - Action: Add at top of file:
    ```ts
    import { CHROME_BOOKMARK_AUTOHIDE_MS } from '@/features/reader/ChromelessLayout'
    ```
  - Action: Add mock for `useBookmarksStore`:
    ```ts
    const mockAddManualBookmark = vi.fn()
    const mockRemoveManualBookmark = vi.fn()
    vi.mock('@/stores/bookmarks.store', () => ({
      useBookmarksStore: vi.fn(() => ({
        bookmarks: [],
        addManualBookmark: mockAddManualBookmark,
        removeManualBookmark: mockRemoveManualBookmark,
      })),
    }))
    ```
  - Action: Add `storageService` mock (for `setItem` calls from toggle handler):
    ```ts
    vi.mock('@/shared/services/storage.service', () => ({
      storageService: { setItem: vi.fn() },
    }))
    ```
  - Action: In `beforeEach`, add `useReaderStore.setState({ currentCfi: 'epubcfi(/6/4!/4/2/1:0)' })` and clear mocks.
  - Tests to add:
    - `bookmark-toggle` button renders in top bar
    - `tabIndex={-1}` when chrome hidden (`isChromeVisible: false`)
    - `tabIndex={0}` when chrome visible and `currentCfi` set
    - `disabled` attribute present when `currentCfi` is null (`useReaderStore.setState({ currentCfi: null })`)
    - `aria-pressed="false"` and label "Thêm dấu trang" when no manual bookmark in store
    - `aria-pressed="true"` and label "Xóa dấu trang" when `useBookmarksStore` returns a matching manual bookmark
    - Clicking when not bookmarked calls `addManualBookmark` with `{ bookId: book.id, bookTitle: book.title, cfi: currentCfi, type: 'manual' }` (timestamp is any number)
    - Clicking when bookmarked calls `removeManualBookmark` with `(book.id, currentCfi)`
    - After bookmark tap, auto-hide timer fires at `CHROME_BOOKMARK_AUTOHIDE_MS` (4000ms), not at `CHROME_AUTOHIDE_MS` (3000ms) — use `vi.advanceTimersByTime(3000)` to confirm chrome has NOT hidden yet, then `vi.advanceTimersByTime(1000)` to confirm it hides
    - Existing auto-hide-at-3000ms test (line 127) must still pass unchanged — it tests the initial mount timer which uses `CHROME_AUTOHIDE_MS` and is unaffected

- [x] **Task 10: Update `BookmarksPage.test.tsx`**
  - File: `apps/reader/src/features/bookmarks/BookmarksPage.test.tsx`
  - Action: Add `type: 'auto'` to `bookmark1` and `bookmark2` fixtures.
  - Action: Update empty state assertion to use partial text match (no emoji): `screen.getByText(/Chưa có dấu trang nào/)` or `within(screen.getByTestId('bookmarks-empty-state')).getByText(/Chưa có dấu trang nào/)`.
  - Action: Update "renders BookmarkCard" test — now checks for `data-testid="bookmark-group"` sections rather than flat list.
  - Action: Update sort test — checks that the group containing `bookmark2` (higher timestamp) renders before the group containing `bookmark1`.
  - Tests to add:
    - A book with one auto + one manual bookmark renders auto card first (check DOM order within group)
    - Manual bookmark card has `data-testid="bookmark-delete-btn"` accessible after swipe (or: verify `onDelete` wiring by checking `removeManualBookmark` is called)
    - Auto bookmark card has no `data-testid="bookmark-delete-btn"` (even after swipe attempt)

- [x] **Task 11: Write `BookmarkCard.test.tsx`** (new file)
  - File: `apps/reader/src/features/bookmarks/BookmarkCard.test.tsx`
  - Setup: mock `react-router-dom` for `Link` (or use `MemoryRouter`). Pass `coverUrl={null}` to all cards.
  - Tests:
    - Auto bookmark card renders "Đang đọc" text
    - Auto bookmark card does NOT render `BookmarkFilledIcon` (check by absence of accent-colored icon or by querying `data-testid` absence)
    - Manual bookmark card renders `BookmarkFilledIcon` (check via icon presence or aria)
    - Manual card: swipe left by 30px (`fireEvent.pointerDown` then `pointerMove` with clientX 30px left) → `bookmark-delete-btn` is not visible (`aria-hidden="true"` or not in document)
    - Manual card: swipe left ≥ 60px → `bookmark-delete-btn` is visible
    - Clicking `bookmark-delete-btn` calls the `onDelete` prop
    - Auto card: swipe left ≥ 60px has no effect — `bookmark-delete-btn` never appears
    - Manual card: after swipe triggers link navigation guard, `onClickCapture` prevents navigation (verify by checking `mockNavigate` was NOT called after swipe + click)

### Acceptance Criteria

- [ ] **AC 1**: Given epub has loaded (`currentCfi` non-null), when user taps center to reveal chrome, then `data-testid="bookmark-toggle"` is visible in the top bar regardless of whether a TOC is available.
- [ ] **AC 2**: Given no manual bookmark exists for the current page, when user taps the bookmark button, then: icon becomes filled (accent color), `aria-pressed="true"`, label becomes "Xóa dấu trang", a manual bookmark is added to the store with `type: 'manual'`, and chrome auto-hides after `CHROME_BOOKMARK_AUTOHIDE_MS` (4s), not 3s.
- [ ] **AC 3**: Given a manual bookmark exists for the current page (icon filled), when user taps the bookmark button, then: icon returns to outline, `aria-pressed="false"`, label returns to "Thêm dấu trang", the manual bookmark is removed from the store, and any auto-bookmark at the same CFI is unaffected.
- [ ] **AC 4**: Given `currentCfi` is null (epub not yet relocated), when chrome is visible, then the bookmark button has `disabled` attribute and `tabIndex={-1}`.
- [ ] **AC 5**: Given bookmarks persisted without a `type` field, when the app loads and hydration runs, then those bookmarks are hydrated with `type: 'auto'`.
- [ ] **AC 6**: Given epub `relocated` fires, when `upsertBookmark` is called from `ReaderEngine`, then the saved bookmark has `type: 'auto'` and does not overwrite any manual bookmark for the same book.
- [ ] **AC 7**: Given a book has one auto-bookmark and two manual bookmarks, when BookmarksPage loads, then: one group section per book; auto-bookmark card is first; two manual cards below, sorted by `page` ascending (nulls last); each manual card shows filled bookmark icon in accent color.
- [ ] **AC 8**: Given two books each with bookmarks, and Book A was accessed more recently, when BookmarksPage loads, then Book A's group appears above Book B's.
- [ ] **AC 9**: Given a manual bookmark card is visible, when user swipes it left ≥ 60px, then `data-testid="bookmark-delete-btn"` is revealed; the swipe gesture does NOT trigger navigation.
- [ ] **AC 10**: Given the delete button is revealed on a manual bookmark card, when user taps it, then the bookmark is removed from the store and `storageService.setItem` is called with the updated bookmarks array.
- [ ] **AC 11**: Given an auto-bookmark card is swiped left, then no delete button is revealed.
- [ ] **AC 12**: Given no bookmarks exist, when BookmarksPage renders, then `data-testid="bookmarks-empty-state"` is present and contains the text "Chưa có dấu trang nào".
- [ ] **AC 13**: Given `addManualBookmark` is called twice with the same `bookId + cfi`, then only one manual bookmark entry exists for that combination in the store.
- [ ] **AC 14**: Given a bookmark is toggled (add or remove) in the reader, when 300ms elapses, then `storageService.setItem` is called with the full updated bookmarks array.

## Review Notes
- Adversarial review completed
- Findings: 13 total, 8 fixed, 5 skipped (3 noise/invalid, 2 low-priority design notes)
- Resolution approach: auto-fix
- Fixes applied: pointer capture (F2), pointercancel handler (F3), focusable delete button tabIndex (F1), swipe state reset after delete (F6), coverUrlMap useMemo (F7), Math.max→reduce (F8), bookmarkToggleSaveTimeoutRef in own effect (F4), addManualBookmark enforces type:'manual' (F5)

## Additional Context

### Dependencies

- No new npm packages required.
- `BookmarkFilledIcon` — already in `@radix-ui/react-icons`.
- `storageService` + `STORAGE_KEYS` — must be imported in `ChromelessLayout.tsx` and `BookmarksPage.tsx` (not currently present in either).

### Testing Strategy

- **Unit (store)**: `bookmarks.store.test.ts` — new file. Pure store logic, no mocks. 8 cases.
- **Unit (hydration)**: 1 new test in `useStorageHydration.test.ts`.
- **Component (ChromelessLayout)**: ~10 new tests in existing file. Mock `useBookmarksStore` and `storageService`. Use `vi.useFakeTimers()` for timer assertions.
- **Component (BookmarksPage)**: Update existing `BookmarksPage.test.tsx`. All fixtures need `type` field. Empty state assertion uses partial text match (no emoji).
- **Component (BookmarkCard)**: New `BookmarkCard.test.tsx`. Use `fireEvent.pointerDown/Move/Up` for swipe simulation.
- **Manual testing**: Open book → tap center → tap 🔖 → chrome fades with filled icon → reopen → icon still filled → tap again → unfilled → close app and reopen → state preserved. Navigate to Bookmarks → verify grouped view, swipe manual card → delete works.

### Notes

- **F1 fix — `upsertBookmark` scope**: The critical fix is scoping `findIndex` to `type === 'auto'`. Without this, every page turn after adding a manual bookmark will silently corrupt the store.
- **F2 fix — swipe + link**: `didSwipeRef` + `onClickCapture` is the standard pattern for preventing `<Link>` navigation after a drag/swipe gesture. Reset `didSwipeRef` on each `pointerDown`.
- **F3/F10 fix — storage consistency**: Both add and remove now use the same 300ms debounce ref (`bookmarkToggleSaveTimeoutRef`), consistent with the `ReaderEngine` pattern. The `BookmarksPage` delete path uses an immediate (non-debounced) `setItem` call since there is no subsequent auto-save trigger in that context.
- **F7 fix — timer constants**: `CHROME_AUTOHIDE_MS = 3000` (unchanged, exported, tested). `CHROME_BOOKMARK_AUTOHIDE_MS = 4000` (new, exported, tested separately). No existing tests need changing.
- **Known limitation**: `active:scale-125` micro-animation is CSS-only and not verifiable in jsdom — only aria state changes are tested.
- **Future**: Labels/notes on manual bookmarks; "Xem thêm" collapse per group; `--color-error` CSS variable (hardcoded `#ef4444` fallback used for delete zone until variable is defined).
