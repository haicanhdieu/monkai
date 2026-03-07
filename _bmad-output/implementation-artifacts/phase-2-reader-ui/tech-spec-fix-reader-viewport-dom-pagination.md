---
title: 'Fix Reader Layout — Viewport-Accurate Pagination with DOM Measurement'
slug: 'fix-reader-viewport-dom-pagination'
created: '2026-03-07'
status: 'Completed'
stepsCompleted: [1, 2, 3, 4]
tech_stack: ['React 18', 'TypeScript', 'Tailwind CSS v3', 'Zustand', 'Vitest + React Testing Library', 'Playwright']
files_to_modify:
  - 'apps/reader/src/features/reader/ChromelessLayout.tsx'
  - 'apps/reader/src/features/reader/ReaderEngine.tsx'
  - 'apps/reader/src/lib/pagination/paginateBook.ts'
  - 'apps/reader/src/lib/pagination/pagination.types.ts'
  - 'apps/reader/src/stores/reader.store.ts'
  - 'apps/reader/src/test-setup.ts'
  - 'apps/reader/src/lib/pagination/paginateBook.test.ts'
  - 'apps/reader/src/features/reader/ReaderEngine.test.tsx'
  - 'apps/reader/e2e/reader-layout.spec.ts'
files_to_create:
  - 'apps/reader/src/features/reader/useDOMPagination.ts'
code_patterns:
  - 'Custom hook pattern (useDOMPagination)'
  - 'Hidden off-screen DOM measurement div'
  - 'ResizeObserver on container ref'
  - 'position:fixed inset-0 for full-screen overlay'
  - 'paragraphIndex[] as stable bookmark anchor'
  - 'sessionStorage cache keyed by bookId+viewport+fontSize'
test_patterns:
  - 'Vitest + jsdom — mock ResizeObserver + scrollHeight/clientHeight via vi.spyOn'
  - 'Playwright E2E — verify no-scroll behavior on real browser layout'
---

# Tech-Spec: Fix Reader Layout — Viewport-Accurate Pagination with DOM Measurement

**Created:** 2026-03-07

## Overview

### Problem Statement

The reader suffers from three compounding issues:
1. **Scrollbars on resize**: `ChromelessLayout` uses `min-h-screen` inside `AppShell`'s `overflow-auto <main>` — content grows past the viewport and scrolls instead of paginating. `ReaderEngine`'s `flex-1` outer div needs a fixed-height parent to constrain correctly, but `min-h-screen` is not fixed height.
2. **Content not 100% width**: The reading column uses `w-full` + `maxWidth` but the parent containment chain breaks at the layout level. Width is not reliably 100% of the available space.
3. **Inaccurate pagination on resize**: `paginateBook` uses character-count heuristics (`AVG_CHAR_WIDTH_EM = 0.6`) that drift on resize, different fonts, and long paragraphs — causing page overflow or under-filled pages. The root trigger for re-pagination is correct (resize event), but the measurement is wrong.

### Solution

1. **Layout fix**: Change `ChromelessLayout` root to `position: fixed; inset: 0` — a true full-screen overlay escaping `AppShell`'s `overflow-auto`. Reading area becomes `flex-1 overflow-hidden`.
2. **DOM measurement**: Replace text-estimation pagination with a `useDOMPagination` hook that uses a hidden off-screen `<div>` (same font, exact column width/height, `overflow: hidden`). Append paragraphs one by one, check `scrollHeight > clientHeight` to detect page break. Browser computes actual rendered heights — pixel-perfect.
3. **ResizeObserver**: Observe the reader container element (not window) for accurate re-pagination triggers. Cache results in `sessionStorage`.
4. **Bookmark-ready data**: Expose `pageBoundaries: number[]` (index of first paragraph on each page) in the store as a stable position anchor for the future bookmark feature.

### Scope

**In Scope:**
- `ChromelessLayout.tsx` — root: `fixed inset-0 flex flex-col overflow-hidden`; reading area: `flex-1 overflow-hidden`
- `useDOMPagination.ts` (new) — DOM measurement hook with ResizeObserver + sessionStorage cache
- `ReaderEngine.tsx` — add hidden measurement div, replace `paginateBook` call with `useDOMPagination`
- `paginateBook.ts` — rewrite as a pure DOM-agnostic fallback utility (keeps existing pure function API for JSDOM environments / tests)
- `pagination.types.ts` — add `PageBoundaries` type
- `reader.store.ts` — add `pageBoundaries: number[]` alongside existing `pages: string[][]`
- `test-setup.ts` — add `ResizeObserver` mock
- Unit tests: rewrite `paginateBook.test.ts`, update `ReaderEngine.test.tsx`
- E2E: extend `reader-layout.spec.ts` with resize re-pagination test

**Out of Scope:**
- Bookmark UI, bookmark store actions, or bookmark persistence (next story)
- CSS multi-column approach
- epub.js / Readium integration
- Fixed-layout epub support
- Changing `App.tsx` `main` `overflow-auto` (fixed layout escapes it, no change needed)

## Context for Development

### Critical Constraints Discovered

1. **JSDOM has no layout engine** (`vitest.config.ts:14` — `environment: 'jsdom'`). `scrollHeight` and `clientHeight` always return 0. DOM measurement CANNOT be unit tested directly. Strategy:
   - `useDOMPagination` hook: test by mocking `ResizeObserver` + `vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get')` / `clientHeight`
   - Real accuracy validation: Playwright E2E only

2. **`ResizeObserver` absent in JSDOM** — must add mock to `apps/reader/src/test-setup.ts`:
   ```ts
   global.ResizeObserver = vi.fn().mockImplementation(() => ({
     observe: vi.fn(),
     unobserve: vi.fn(),
     disconnect: vi.fn(),
   }))
   ```

3. **Existing `paginateBook.test.ts`** — 190 lines of tests tied to text-estimation API (specific page-count assertions like "100 paragraphs → 4 pages"). These will need full rewrite for the new DOM-measurement API. Many tests will become E2E-only (actual layout behavior cannot be unit tested).

4. **`reader.store.ts` — `pages: string[][]`** — currently stores full paragraph arrays per page. Used in:
   - `ChromelessLayout.tsx:116` — `pages.length` for total count
   - `ReaderEngine.tsx:170` — `computedPages[currentPage]` for content
   - `ReaderPage.tsx:25` — `setPages([])` to reset
   Adding `pageBoundaries: number[]` alongside (not replacing `pages`) minimises change surface.

5. **Hidden measurement div must be in the live DOM** — detached nodes do not compute `scrollHeight`. The div must be rendered as an invisible sibling inside `ReaderEngine` JSX.

### Codebase Patterns

- **State Management**: Zustand (`useReaderStore`) — `currentPage`, `pages`, `setPages`, `setCurrentPage`, `reset`
- **Styling**: Tailwind CSS + inline CSS custom properties (`var(--color-background)`)
- **Data**: `book.content: string[]` — array of paragraphs (structured, no arbitrary HTML)
- **Pagination gate**: `document.fonts.ready` promise (already in `ReaderEngine`, must keep before any measurement)
- **Test pattern**: `beforeEach` calls `useReaderStore.getState().reset()` — store must stay compatible
- **E2E pattern**: `page.route()` mocks for `index.json` + book JSON; asserts `scrollWidth - clientWidth <= 1`

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `apps/reader/src/App.tsx` | AppShell — `<main className="flex-1 overflow-auto pb-16">` (no change needed; fixed overlay escapes it) |
| `apps/reader/src/features/reader/ChromelessLayout.tsx` | Root: `min-h-screen` → `fixed inset-0`. Reading area div: `min-h-screen` → `flex-1 overflow-hidden` |
| `apps/reader/src/features/reader/ReaderEngine.tsx` | Add hidden measurement div; replace `paginateBook` usage with `useDOMPagination` hook |
| `apps/reader/src/features/reader/useDOMPagination.ts` | NEW — DOM measurement hook |
| `apps/reader/src/lib/pagination/paginateBook.ts` | Rewrite as JSDOM-safe fallback (remove DOM assumptions; keep pure function contract) |
| `apps/reader/src/lib/pagination/pagination.types.ts` | Add `PageBoundaries` and `DOMPaginationResult` types |
| `apps/reader/src/stores/reader.store.ts` | Add `pageBoundaries: number[]` + `setPageBoundaries` action |
| `apps/reader/src/test-setup.ts` | Add `ResizeObserver` global mock |
| `apps/reader/src/lib/pagination/paginateBook.test.ts` | Rewrite — new API surface, JSDOM-safe tests only |
| `apps/reader/src/features/reader/ReaderEngine.test.tsx` | Update — mock `useDOMPagination` hook or mock scroll properties |
| `apps/reader/e2e/reader-layout.spec.ts` | Extend with viewport resize re-pagination test |

### Technical Decisions

- **`fixed inset-0`** for ChromelessLayout root: escapes AppShell overflow entirely; on mobile, `position:fixed` respects visual viewport (address bar shrink/grow) without needing `100dvh` hacks.
- **Hidden measurement div** styled identical to visible column: `position: absolute; top: -9999px; left: -9999px; visibility: hidden; overflow: hidden; width: <readerColumnMaxWidth>px; height: <availableHeight>px`. Must be in live DOM — append to `<body>` or render as child of ReaderEngine.
- **Paragraph-by-paragraph measurement**: Append `<p>` elements one at a time with identical styles (fontSize, lineHeight, fontFamily, marginBottom, overflowWrap). Check `scrollHeight > clientHeight` after each append. On overflow: remove last `<p>`, save page, clear div, begin new page with that paragraph.
- **Single-oversized paragraph**: If a single paragraph overflows an empty page (paragraph taller than available height), place it alone on one page rather than infinite looping.
- **`pageBoundaries: number[]`**: Each entry = index of first paragraph in that page (e.g. `[0, 8, 19, ...]`). Bookmark = `{ bookId, paragraphIndex: pageBoundaries[currentPage] }`. On re-open: find page where `pageBoundaries[i] <= savedIndex < pageBoundaries[i+1]`, jump there.
- **sessionStorage cache key**: `pagination:${bookId}:${Math.round(vw)}x${Math.round(vh)}:${fontSize}`. Cleared on `setPages([])` (book change). Avoids re-measuring same book at same viewport on back-navigation.
- **ResizeObserver** on the reader column container ref: triggers re-pagination only when actual layout dimensions change (more precise than `window resize`). Debounce 100ms to avoid thrashing during drag-resize.

## Implementation Plan

### Tasks

- [x] **Task 1**: Add `ResizeObserver` mock to test setup
  - File: `apps/reader/src/test-setup.ts`
  - Action: Append global mock for `ResizeObserver` using `vi.fn()` so all unit tests can import hooks that use it without throwing.

- [x] **Task 2**: Add types for DOM pagination
  - File: `apps/reader/src/lib/pagination/pagination.types.ts`
  - Action: Add:
    ```ts
    export interface PageBoundaries {
      pages: string[][]        // paragraph content per page (for rendering)
      boundaries: number[]     // paragraph index of first paragraph per page (for bookmarks)
    }
    export interface DOMPaginationOptions {
      availableHeight: number  // px — container height (viewportHeight - verticalPadding*2)
      columnWidth: number      // px — exact column width
      fontSize: number
      lineHeight: number
      fontFamily: string
    }
    ```

- [x] **Task 3**: Create `useDOMPagination` hook
  - File: `apps/reader/src/features/reader/useDOMPagination.ts` (NEW)
  - Action: Implement hook with signature:
    ```ts
    export function useDOMPagination(
      paragraphs: string[],
      measureRef: RefObject<HTMLDivElement>,
      options: DOMPaginationOptions,
      enabled: boolean,        // false until fonts ready
    ): PageBoundaries
    ```
  - Internals:
    1. `ResizeObserver` on `measureRef.current` — debounced 100ms — sets `containerSize` state
    2. `useMemo` computing pages by running DOM measurement loop on `measureRef.current`
    3. sessionStorage read/write with cache key `pagination:${hash(paragraphs.length)}:${vw}x${vh}:${fontSize}`
    4. Returns `{ pages: [[]], boundaries: [0] }` when `!enabled` or `measureRef.current` is null

- [x] **Task 4**: Add `pageBoundaries` to Zustand store
  - File: `apps/reader/src/stores/reader.store.ts`
  - Action: Add `pageBoundaries: number[]` to `ReaderState`, `initialState` (default `[0]`), and `setPageBoundaries: (b: number[]) => void` action. Keep `pages: string[][]` unchanged.

- [x] **Task 5**: Update `ChromelessLayout` layout
  - File: `apps/reader/src/features/reader/ChromelessLayout.tsx`
  - Action:
    - Root div: `className="fixed inset-0 flex flex-col overflow-hidden"` (remove `relative`, `min-h-screen`)
    - Reading area div (line 99): `className="flex-1 flex flex-col overflow-hidden"` (remove `min-h-screen`)

- [x] **Task 6**: Update `ReaderEngine` to use `useDOMPagination`
  - File: `apps/reader/src/features/reader/ReaderEngine.tsx`
  - Action:
    1. Remove `paginateBook` import and call; remove `window.innerWidth/Height` viewport state; remove `options` useMemo; remove `computedPages` useMemo.
    2. Add `measureRef = useRef<HTMLDivElement>(null)`.
    3. Compute `availableHeight = viewport.height - 2 * READER_PADDING_VERTICAL` and `columnWidth = readerColumnMaxWidth` (keep `readerColumnMaxWidth` calculation as-is).
    4. Call `useDOMPagination(paragraphs, measureRef, { availableHeight, columnWidth, fontSize: READER_FONT_SIZE, lineHeight: READER_LINE_HEIGHT, fontFamily: 'Lora, serif' }, fontsReady)`.
    5. Rename `computedPages` → `pages` from hook result; use `boundaries` to call `setPageBoundaries`.
    6. Render hidden measurement div as last child of outer div:
       ```tsx
       <div
         ref={measureRef}
         aria-hidden="true"
         data-testid="reader-measure-div"
         style={{
           position: 'absolute',
           top: '-9999px',
           left: '-9999px',
           visibility: 'hidden',
           overflow: 'hidden',
           width: `${readerColumnMaxWidth}px`,
           height: `${availableHeight}px`,
           fontSize: `${READER_FONT_SIZE}px`,
           lineHeight: READER_LINE_HEIGHT,
           fontFamily: 'Lora, serif',
           paddingInline: `${horizontalPaddingPerSide}px`,
         }}
       />
       ```

- [x] **Task 7**: Rewrite `paginateBook.ts` as JSDOM-safe utility
  - File: `apps/reader/src/lib/pagination/paginateBook.ts`
  - Action: Keep the function but clarify its role as a JSDOM-safe fallback (used in tests and SSR environments). Remove `AVG_CHAR_WIDTH_EM` heuristic. New contract: given paragraphs + options, return `PageBoundaries` (not `string[][]`). Existing text-estimation logic can stay but return the boundary-index form. This preserves the test surface without removing the function.
  - NOTE: Update `apps/reader/src/lib/pagination/index.ts` to also export `PageBoundaries` type.

- [x] **Task 8**: Rewrite `paginateBook.test.ts`
  - File: `apps/reader/src/lib/pagination/paginateBook.test.ts`
  - Action: Rewrite to test the pure function contract (JSDOM-safe). Remove tests that assert specific exact page counts based on character estimation (they are implementation-detail tests). Keep: empty input, preserves all paragraphs, deterministic, respects font size ratio, handles overlong paragraph. Remove: exact count assertions like "100 paragraphs → 4 pages" (those belong in E2E).

- [x] **Task 9**: Update `ReaderEngine.test.tsx`
  - File: `apps/reader/src/features/reader/ReaderEngine.test.tsx`
  - Action:
    - Add `ResizeObserver` mock (already in test-setup after Task 1, no extra work)
    - Mock `scrollHeight`/`clientHeight` on `HTMLElement.prototype` in beforeEach so DOM measurement returns predictable pages:
      ```ts
      // Make every measurement div think it's at capacity after 3 paragraphs
      vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(100)
      vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(90)
      ```
    - Keep all existing navigation tests (tap, swipe, keyboard) — they don't depend on exact page count
    - Update `'50 paragraphs ensures multiple pages'` comment if page count changes

- [x] **Task 10**: Extend E2E test for resize
  - File: `apps/reader/e2e/reader-layout.spec.ts`
  - Action: Add a second test case after the existing one:
    - Load reader at 1280x800 viewport, verify no scrollbars
    - Resize to 390x844 (mobile), wait for re-pagination
    - Verify no scrollbars at new size
    - Verify total page count changed (re-pagination fired)

### Acceptance Criteria

- [x] **AC 1**: Given the reader is open, when the browser window is resized or orientation changes, the content re-paginates using actual DOM measurements — no horizontal or vertical scrollbars appear at any viewport size.
- [x] **AC 2**: Given a book with very long paragraphs (2000+ chars) or unbroken strings (1200+ chars), when rendered, no scrollbars appear and text wraps correctly within the reading column.
- [x] **AC 3**: Given the reader is open at its initial viewport, the content column fills 100% of the available width (up to the 700px max-width cap), with no gap between content edge and column edge.
- [x] **AC 4**: Given `document.fonts.ready` has not resolved, the reader shows the skeleton. After it resolves, DOM measurement runs once before any page is displayed.
- [x] **AC 5**: Given a book previously paginated at the same viewport + fontSize, when navigating back to it, the pagination result is retrieved from sessionStorage (no re-measurement flicker).
- [x] **AC 6**: Given the current page has been read, `useReaderStore.getState().pageBoundaries[currentPage]` returns the paragraph index of the first paragraph on that page (data contract for future bookmark feature).
- [x] **AC 7**: All existing navigation behaviours (tap zones, swipe, keyboard, page progress) work unchanged.

## Additional Context

### Dependencies

- No new npm packages required. `ResizeObserver` is available in all modern browsers and Chromium (Playwright).

### Testing Strategy

- **Unit (Vitest/jsdom)**: Mock `ResizeObserver` globally; mock `scrollHeight`/`clientHeight` via `vi.spyOn` to control pagination output in unit tests. Test hook contract (returns `{ pages, boundaries }`), navigation, empty content, loading state.
- **E2E (Playwright)**: Only place where actual layout is verified. Assert `scrollHeight === clientHeight` and `scrollWidth === clientWidth` on reader container and window. Test viewport resize triggers re-pagination.
- **Manual**: Open a real book on desktop + mobile; resize window aggressively; verify no scrollbars; verify content fills width; verify page progress updates correctly.

### Bookmark Data Contract (Future Story Reference)

```ts
// To save a bookmark:
const bookmark = {
  bookId: store.bookId,
  paragraphIndex: store.pageBoundaries[store.currentPage],
  savedAt: Date.now(),
}

// To restore a bookmark:
const targetPage = store.pageBoundaries.findLastIndex(
  (boundary) => boundary <= bookmark.paragraphIndex
)
store.setCurrentPage(targetPage)
```

### Notes

- `App.tsx` `<main className="flex-1 overflow-auto pb-16">` does NOT need to change. The `fixed inset-0` on ChromelessLayout completely escapes this container.
- The hidden measurement div uses `position: absolute` with `top/left: -9999px` (not `position: fixed`) to stay within the component's stacking context and avoid z-index conflicts.
- Keep `READER_PADDING_VERTICAL = 80` — this accounts for fixed top+bottom chrome overlays. The available height for measurement is `window.innerHeight - 80*2`. The ResizeObserver approach will naturally pick up the correct height from the container.
## Review Notes
- Adversarial review completed
- Findings: 12 total, 10 fixed, 2 skipped (F11 noise for this codebase — paragraphs are plain text; F12 low/design decision)
- Resolution approach: auto-fix
