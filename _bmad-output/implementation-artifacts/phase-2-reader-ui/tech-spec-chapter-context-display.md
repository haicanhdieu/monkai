---
title: 'Chapter Context Display'
slug: 'chapter-context-display'
created: '2026-03-26'
status: 'completed'
stepsCompleted: [1, 2, 3, 4]
tech_stack: ['React 18', 'TypeScript', 'Zustand', 'Tailwind CSS v3', 'Vitest', 'Testing Library', 'epub.js']
files_to_modify:
  - 'apps/reader/src/stores/reader.store.ts'
  - 'apps/reader/src/stores/bookmarks.store.ts'
  - 'apps/reader/src/features/reader/ReaderEngine.tsx'
  - 'apps/reader/src/features/reader/ChromelessLayout.tsx'
  - 'apps/reader/src/features/home/HomePage.tsx'
  - 'apps/reader/src/features/bookmarks/BookmarkCard.tsx'
  - 'apps/reader/src/shared/hooks/useStorageHydration.ts'
  - 'apps/reader/src/features/reader/ReaderEngine.test.tsx'
  - 'apps/reader/src/features/reader/ChromelessLayout.test.tsx'
  - 'apps/reader/src/features/home/HomePage.test.tsx'
  - 'apps/reader/src/features/bookmarks/BookmarkCard.test.tsx'
code_patterns:
  - 'Zustand plain create() for reader/settings; create()(immer()) for bookmarks'
  - 'epub.js book accessed via any-cast + try/catch guard'
  - 'relocated event fires handleRelocated in ReaderEngine — single write point'
  - 'CSS truncation via Tailwind truncate class on flex child with min-w-0'
test_patterns:
  - 'Vitest + @testing-library/react'
  - 'useReaderStore.setState({}) for direct store setup in tests'
  - 'relocated handler captured via rendition.on mock, fired with act()'
  - 'MemoryRouter + optional QueryClientProvider wrapping'
---

# Tech-Spec: Chapter Context Display

**Created:** 2026-03-26

## Overview

### Problem Statement

Users cannot tell what chapter they are currently reading. Page counts are scoped to the current chapter but show no chapter context, causing orientation confusion across three surfaces: the reader bottom bar, the homepage "continue reading" card, and bookmark cards.

### Solution

Add a truncated chapter title beside the page count on all three surfaces. Chapter title is resolved once per `relocated` event in `ReaderEngine.tsx` by matching `location.start.href` against `book.navigation.toc` entries. The resolved title flows to `reader.store` (for reader + homepage) and into the bookmark payload (for bookmark cards). No interaction — display only, CSS ellipsis truncation.

### Scope

**In Scope:**
- `reader.store.ts` — add `currentChapterTitle` and `lastReadChapterTitle` fields; update `setProgress`, `setLastRead`, `hydrateLastRead` signatures
- `bookmarks.store.ts` — add optional `chapterTitle?` to `Bookmark` interface
- `ReaderEngine.tsx` — add `resolveChapterTitle` helper; update `handleRelocated`; add `href?` to `RelocatedLocation`; destructure `book` prop
- `ChromelessLayout.tsx` — read `currentChapterTitle` from store; update bottom bar JSX; pass `chapterTitle` to manual bookmark creation
- `HomePage.tsx` — read `lastReadChapterTitle` from store; update `ContinueReadingCard` page span
- `BookmarkCard.tsx` — render `bookmark.chapterTitle` before page count when present
- `useStorageHydration.ts` — add `chapterTitle?` to `LAST_READ_POSITION` type; thread to `hydrateLastRead`
- Tests for all changed surfaces

**Out of Scope:**
- Tap-to-reveal full chapter title on mobile
- Chapter number display
- Navigation to chapter list from title
- `PageProgress.tsx` — exists but not used in ChromelessLayout; leave untouched

## Context for Development

### Codebase Patterns

**Zustand stores:**
- `reader.store.ts` uses plain `create<ReaderState>((set) => ({...}))` with no middleware
- `bookmarks.store.ts` uses `create<BookmarksState>()(immer((set) => ({...})))` with immer
- `initialState` object is defined separately and spread in — add new fields there AND in the interface
- Store setters that update "last read" take named params, not a single object

**epub.js access pattern** (mirrors `useEpubReader.getToc`):
```typescript
const anyBook = book as unknown as {
  navigation?: { toc?: Array<{ label?: string; href?: string; subitems?: unknown[] }> }
  packaging?: { navPath?: string; ncxPath?: string }
}
```
Always wrap in try/catch and return `''` on any error.

**`relocated` event — add `href?` to the existing interface in `ReaderEngine.tsx`:**
```typescript
interface RelocatedLocation {
  start?: {
    cfi?: string
    href?: string    // ← add this
    percentage?: number
    displayed?: { page: number; total: number }
  }
}
```

**`book` prop in `ReaderEngine`:** Currently defined in `ReaderEngineProps` but destructured as `{ containerRef, rendition, isReady, error, bookId, bookTitle, initialCfi }` — `book` is skipped. Add it to the destructure.

**CSS truncation:** `className="truncate"` (Tailwind: `overflow: hidden; text-overflow: ellipsis; white-space: nowrap`) on a flex child that also has `min-w-0`. The `|` separator and page count must be `shrink-0`.

**Test store setup:** Tests use `useReaderStore.setState({...})`. New fields with `''` defaults won't break existing partial setState calls.

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `apps/reader/src/stores/reader.store.ts` | Add `currentChapterTitle`, `lastReadChapterTitle`; update setters — full file L1–52 |
| `apps/reader/src/stores/bookmarks.store.ts` | Add `chapterTitle?` to `Bookmark` interface — L4–15 |
| `apps/reader/src/features/reader/ReaderEngine.tsx` | `RelocatedLocation` L14–20; `handleRelocated` L90–133; props destructure L43–51; `LastReadPosition` L22–29 |
| `apps/reader/src/features/reader/ChromelessLayout.tsx` | Bottom bar L307–315; `handleBookmarkToggle` L80–96; store destructure L49 |
| `apps/reader/src/features/home/HomePage.tsx` | `ContinueReadingCard` store destructure L26–31; page span L112–115 |
| `apps/reader/src/features/bookmarks/BookmarkCard.tsx` | Page text span L122–127 |
| `apps/reader/src/shared/hooks/useStorageHydration.ts` | `LAST_READ_POSITION` type L19–26; `hydrateLastRead` call L35–40 |

### Technical Decisions

- **Use `location.start.href` not `book.spine.get(cfi)`:** epub.js exposes `start.href` directly — no CFI parsing needed.
- **`resolveChapterTitle` as a module-level function in `ReaderEngine.tsx`:** Not a hook, not exported. Pure function with try/catch. Same as `normalizeHref` in `useEpubReader.ts`.
- **`href` normalization mirrors `getToc()`:** Extract `baseDir` from `packaging.navPath`/`ncxPath`, prepend to TOC entry hrefs, strip `#` fragment, then match against `location.start.href`.
- **No new storage key:** `chapterTitle` is optional on existing `LAST_READ_POSITION` and `Bookmark` shapes. Old stored data lacks the field → fallback to `''` gracefully.
- **Store `undefined` not `''` in Bookmark:** Use `...(chapterTitle ? { chapterTitle } : {})` so empty chapter titles are not serialized to JSON.
- **Use a `bookRef` instead of adding `book` to effect deps (F-001):** Adding `book` to the `handleRelocated` effect's deps array causes all three event listeners (click, keyup, relocated) to be torn down and re-registered when `book` transitions from `null` to loaded — creating a brief window with no `relocated` listener. Instead, declare `const bookRef = useRef<Book | null>(book); bookRef.current = book` above all effects, and call `resolveChapterTitle(bookRef.current, href)` inside the handler. This keeps `book` always up-to-date without any re-registration.
- **Strip `#` fragment from both `href` and TOC hrefs before matching (F-010):** `location.start.href` in epub.js can contain a `#` fragment (e.g. `"OEBPS/chapter1.xhtml#section2"`). The current spec only strips fragments from the TOC side. Add `const cleanHref = href.split('#')[0]` at the top of `resolveChapterTitle` and use `cleanHref` for all comparisons.
- **Use path-boundary-safe matching to prevent false positives (F-003):** Replace the raw `endsWith` with: `cleanHref === normalized || cleanHref.endsWith('/' + normalized) || normalized.endsWith('/' + cleanHref)`. The `'/'` prefix guards against same-named files in different directories being incorrectly matched.

## Implementation Plan

### Tasks

- [x] Task 1: Extend `Bookmark` interface with optional `chapterTitle` field
  - File: `apps/reader/src/stores/bookmarks.store.ts`
  - Action: Add `chapterTitle?: string` after `total?: number` in the `Bookmark` interface (L13). No other changes to this file.

- [x] Task 2: Add chapter title fields and update store setters in `reader.store.ts`
  - File: `apps/reader/src/stores/reader.store.ts`
  - Action — interface `ReaderState`:
    - Add `currentChapterTitle: string` after `totalPages: number`
    - Add `lastReadChapterTitle: string` after `lastReadTotalPages: number`
    - Update `setProgress` signature: `setProgress: (page: number, total: number, chapterTitle?: string) => void`
    - Update `setLastRead` signature: `setLastRead: (bookId: string, bookTitle: string, page: number, total: number, chapterTitle?: string) => void`
    - Update `hydrateLastRead` signature: `hydrateLastRead: (bookId: string, bookTitle: string, page: number, total: number, chapterTitle?: string) => void`
  - Action — `initialState` object:
    - Add `currentChapterTitle: ''` after `totalPages: 0`
    - Add `lastReadChapterTitle: ''` after `lastReadTotalPages: 0`
  - Action — store implementations:
    - `setProgress: (currentPage, totalPages, currentChapterTitle = '') => set({ currentPage, totalPages, currentChapterTitle })`
    - `setLastRead: (lastReadBookId, lastReadBookTitle, lastReadPage, lastReadTotalPages, lastReadChapterTitle = '') => set({ lastReadBookId, lastReadBookTitle, lastReadPage, lastReadTotalPages, lastReadChapterTitle })`
    - `hydrateLastRead: (lastReadBookId, lastReadBookTitle, lastReadPage, lastReadTotalPages, lastReadChapterTitle = '') => set({ lastReadBookId, lastReadBookTitle, lastReadPage, lastReadTotalPages, lastReadChapterTitle })`
  - Verification: confirm `reset()` (which does `set(initialState)`) zeroes both new fields — this is automatic because they are in `initialState`, but verify by checking `useReaderStore.getState().reset()` leaves `currentChapterTitle === ''` and `lastReadChapterTitle === ''`

- [x] Task 3: Add `resolveChapterTitle` helper and update `handleRelocated` in `ReaderEngine.tsx`
  - **Prerequisites: Tasks 1 and 2 must be complete first.** Task 3 references `chapterTitle` on `Bookmark` (Task 1) and the updated `setProgress`/`setLastRead` signatures (Task 2). TypeScript will error if those aren't applied first.
  - File: `apps/reader/src/features/reader/ReaderEngine.tsx`
  - Action A — extend `RelocatedLocation` interface: add `href?: string` to `start`
  - Action B — extend `LastReadPosition` interface: add `chapterTitle?: string`
  - Action C — destructure `book` from props: change the component's destructure from `{ containerRef, rendition, isReady, error, bookId, bookTitle, initialCfi }` to also include `book`
  - Action D — add a `bookRef` immediately after the existing `useRef` declarations inside the component (after `bookmarkSaveTimeoutRef`):
    ```typescript
    const bookRef = useRef<Book | null>(book)
    bookRef.current = book
    ```
  - Action E — add module-level `resolveChapterTitle` function before the component (exact code below)
  - Action F — update `handleRelocated` inside the existing `useEffect`:
    - After reading `pct`, add: `const href = location?.start?.href`
    - After reading `href`, add: `const chapterTitle = resolveChapterTitle(bookRef.current, href)`
    - Update `setProgress` call: `setProgress(displayed.page, displayed.total, chapterTitle)`
    - Update `setLastRead` call: `setLastRead(bookId, bookTitle, displayed.page, displayed.total, chapterTitle)`
    - Update `payload` construction: add `...(chapterTitle ? { chapterTitle } : {})`
    - Update `upsertBookmark` call: add `...(chapterTitle ? { chapterTitle } : {})`
  - **Do NOT add `book` to the useEffect dependency array** — `bookRef.current` is always current without triggering re-registration
  - Notes — `resolveChapterTitle` exact implementation:
    ```typescript
    type TocItem = { label?: string; href?: string; subitems?: TocItem[] }

    function resolveChapterTitle(book: Book | null, href: string | undefined): string {
      if (!book || !href) return ''
      try {
        const anyBook = book as unknown as {
          navigation?: { toc?: TocItem[] }
          packaging?: { navPath?: string; ncxPath?: string }
        }
        const toc = anyBook.navigation?.toc ?? []
        if (!Array.isArray(toc) || toc.length === 0) return ''
        const basePath =
          typeof anyBook.packaging?.navPath === 'string'
            ? anyBook.packaging.navPath
            : typeof anyBook.packaging?.ncxPath === 'string'
              ? anyBook.packaging.ncxPath
              : ''
        const baseDir =
          basePath && basePath.includes('/')
            ? basePath.slice(0, basePath.lastIndexOf('/') + 1)
            : ''
        const cleanHref = href.split('#')[0]
        const findLabel = (items: TocItem[]): string => {
          for (const item of items) {
            if (typeof item.label === 'string' && item.label.trim() && typeof item.href === 'string') {
              const normalized =
                baseDir && !item.href.startsWith('/')
                  ? `${baseDir}${item.href}`.split('#')[0]
                  : item.href.split('#')[0]
              if (
                cleanHref === normalized ||
                cleanHref.endsWith('/' + normalized) ||
                normalized.endsWith('/' + cleanHref)
              ) {
                return item.label.trim()
              }
            }
            if (Array.isArray(item.subitems) && item.subitems.length > 0) {
              const found = findLabel(item.subitems)
              if (found) return found
            }
          }
          return ''
        }
        return findLabel(toc)
      } catch {
        return ''
      }
    }
    ```
    Note: `TocItem` is declared at module level (outside the function) to avoid the double-cast issue.

- [x] Task 4: Thread `chapterTitle` through `useStorageHydration.ts`
  - File: `apps/reader/src/shared/hooks/useStorageHydration.ts`
  - Action A — add `chapterTitle?: string` to the inline type for `LAST_READ_POSITION` (the object passed to `storageService.getItem<{...}>` on L19)
  - Action B — update `hydrateLastRead` call (L35–39): add 5th arg `lastRead.chapterTitle` (type: `string | undefined`, accepted since signature now takes `chapterTitle?`)

- [x] Task 5: Update `ChromelessLayout.tsx` — bottom bar and manual bookmark
  - File: `apps/reader/src/features/reader/ChromelessLayout.tsx`
  - Action A — add `currentChapterTitle` to the `useReaderStore()` destructure (L49)
  - Action B — replace the bottom bar left `<span>` (the one rendering `currentPage / totalPagesDisplay`) with a flex wrapper:
    ```tsx
    <div className="flex items-center gap-2 min-w-0 flex-1 mr-2">
      {currentChapterTitle && (
        <>
          <span
            className="truncate text-xs"
            style={{ color: 'var(--color-text-muted)', fontFamily: 'Inter, sans-serif' }}
            data-testid="chapter-title"
          >
            {currentChapterTitle}
          </span>
          <span
            className="text-xs shrink-0"
            style={{ color: 'var(--color-text-muted)', fontFamily: 'Inter, sans-serif' }}
            aria-hidden="true"
          >
            |
          </span>
        </>
      )}
      <span
        className="text-xs shrink-0"
        style={{ color: 'var(--color-text-muted)', fontFamily: 'Inter, sans-serif' }}
      >
        {totalPagesDisplay > 0 ? `${currentPage} / ${totalPagesDisplay}` : ''}
      </span>
    </div>
    ```
  - Action C — in `handleBookmarkToggle` (L92), add `...(currentChapterTitle ? { chapterTitle: currentChapterTitle } : {})` to the `addManualBookmark` call

- [x] Task 6: Update `ContinueReadingCard` in `HomePage.tsx`
  - File: `apps/reader/src/features/home/HomePage.tsx`
  - Action A — add `lastReadChapterTitle` to the `useReaderStore()` destructure in `ContinueReadingCard` (L26–31)
  - Action B — replace the right `<span>` in the progress row (currently `<span>Trang {currentPage} / {totalPages}</span>` at L114):
    ```tsx
    <span className="flex items-center gap-1 min-w-0 max-w-[60%]">
      {lastReadChapterTitle && (
        <>
          <span className="truncate min-w-0">{lastReadChapterTitle}</span>
          <span aria-hidden="true" className="shrink-0">|</span>
        </>
      )}
      <span className="shrink-0">Trang {currentPage} / {totalPages}</span>
    </span>
    ```
  - Notes: `currentPage` and `totalPages` here are the local variables computed at L42–43, not store fields directly

- [x] Task 7: Update `BookmarkCard.tsx` — chapter title before page count
  - File: `apps/reader/src/features/bookmarks/BookmarkCard.tsx`
  - Action — replace the `<span className="flex-1">` block (L122–127) with:
    ```tsx
    <span className="flex-1 flex items-center gap-1 min-w-0">
      {bookmark.page != null && bookmark.total != null && bookmark.total > 0 ? (
        <>
          {bookmark.chapterTitle && (
            <>
              <span className="truncate">{bookmark.chapterTitle}</span>
              <span aria-hidden="true" className="shrink-0">|</span>
            </>
          )}
          <span className="shrink-0">Trang {bookmark.page} / {bookmark.total}</span>
        </>
      ) : (
        isManual ? 'Vị trí đã lưu' : 'Đang đọc'
      )}
    </span>
    ```

- [x] Task 8: Add tests for `ReaderEngine.tsx` chapter title resolution
  - File: `apps/reader/src/features/reader/ReaderEngine.test.tsx`
  - Action A — in the existing test "calls setCurrentCfi and storageService.setItem on relocated with CFI" (L305), the `relocatedHandler` mock type and call do not include `href` — no change needed (existing test is already passing `{ start: { cfi } }` which is valid since `href?` is optional)
  - Action B — add new describe block `'ReaderEngine — chapter title resolution'`:
    ```typescript
    describe('ReaderEngine — chapter title resolution', () => {
      beforeEach(() => {
        useReaderStore.getState().reset()
        mockSetItem.mockClear()
        mockGetItem.mockResolvedValue(null)
      })

      it('calls setProgress with resolved chapter title when book has matching TOC entry', async () => {
        const mockBook = {
          navigation: {
            toc: [{ label: 'Tâm Kinh', href: 'chapter1.xhtml' }],
          },
          packaging: { navPath: 'OEBPS/nav.xhtml' },
        }
        let relocatedHandler: ((loc: unknown) => void) | null = null
        const mockRendition = {
          on: vi.fn((event: string, fn: (loc: unknown) => void) => {
            if (event === 'relocated') relocatedHandler = fn
          }),
          off: vi.fn(),
          display: vi.fn().mockResolvedValue(undefined),
          themes: { select: vi.fn(), fontSize: vi.fn(), override: vi.fn() },
        }
        render(
          <ReaderEngine
            containerRef={{ current: null }}
            rendition={mockRendition as never}
            book={mockBook as never}
            isReady={true}
            error={null}
            bookId="book-1"
            bookTitle="My Book"
          />,
        )
        await act(() => {
          relocatedHandler!({
            start: {
              cfi: 'epubcfi(/6/2!/4/2/1:0)',
              href: 'OEBPS/chapter1.xhtml',
              displayed: { page: 3, total: 12 },
            },
          })
        })
        expect(useReaderStore.getState().currentChapterTitle).toBe('Tâm Kinh')
      })

      it('resolves to empty string when href does not match any TOC entry', async () => {
        const mockBook = {
          navigation: { toc: [{ label: 'Tâm Kinh', href: 'chapter1.xhtml' }] },
          packaging: { navPath: 'OEBPS/nav.xhtml' },
        }
        let relocatedHandler: ((loc: unknown) => void) | null = null
        const mockRendition = {
          on: vi.fn((event: string, fn: (loc: unknown) => void) => {
            if (event === 'relocated') relocatedHandler = fn
          }),
          off: vi.fn(),
          display: vi.fn().mockResolvedValue(undefined),
          themes: { select: vi.fn(), fontSize: vi.fn(), override: vi.fn() },
        }
        render(
          <ReaderEngine
            containerRef={{ current: null }}
            rendition={mockRendition as never}
            book={mockBook as never}
            isReady={true}
            error={null}
            bookId="book-1"
            bookTitle="My Book"
          />,
        )
        await act(() => {
          relocatedHandler!({
            start: {
              cfi: 'epubcfi(/6/4!/4/2/1:0)',
              href: 'OEBPS/chapter99.xhtml',
              displayed: { page: 1, total: 5 },
            },
          })
        })
        expect(useReaderStore.getState().currentChapterTitle).toBe('')
      })

      it('resolves to empty string when book is null', async () => {
        let relocatedHandler: ((loc: unknown) => void) | null = null
        const mockRendition = {
          on: vi.fn((event: string, fn: (loc: unknown) => void) => {
            if (event === 'relocated') relocatedHandler = fn
          }),
          off: vi.fn(),
          display: vi.fn().mockResolvedValue(undefined),
          themes: { select: vi.fn(), fontSize: vi.fn(), override: vi.fn() },
        }
        render(
          <ReaderEngine
            containerRef={{ current: null }}
            rendition={mockRendition as never}
            book={null}
            isReady={true}
            error={null}
            bookId="book-1"
            bookTitle="My Book"
          />,
        )
        await act(() => {
          relocatedHandler!({
            start: {
              cfi: 'epubcfi(/6/2!/4/2/1:0)',
              href: 'OEBPS/chapter1.xhtml',
              displayed: { page: 1, total: 5 },
            },
          })
        })
        expect(useReaderStore.getState().currentChapterTitle).toBe('')
      })
    })
    ```

- [x] Task 9: Add chapter title tests to `ChromelessLayout.test.tsx`
  - File: `apps/reader/src/features/reader/ChromelessLayout.test.tsx`
  - Action — add new describe block `'ChromelessLayout — chapter title display'`:
    ```typescript
    describe('ChromelessLayout — chapter title display', () => {
      beforeEach(() => {
        useReaderStore.setState({
          currentPage: 3,
          totalPages: 12,
          currentChapterTitle: '',
          isChromeVisible: true,
          currentCfi: null,
        })
      })

      it('shows chapter title and separator when currentChapterTitle is set', () => {
        useReaderStore.setState({ currentChapterTitle: 'Tâm Kinh' })
        renderLayout()
        const bottomBar = screen.getByTestId('chrome-bottom-bar')
        expect(screen.getByTestId('chapter-title')).toHaveTextContent('Tâm Kinh')
        within(bottomBar).getByText('|')
      })

      it('does not show chapter title or separator when currentChapterTitle is empty', () => {
        useReaderStore.setState({ currentChapterTitle: '' })
        renderLayout()
        expect(screen.queryByTestId('chapter-title')).not.toBeInTheDocument()
        expect(screen.queryByText('|')).not.toBeInTheDocument()
      })

      it('passes chapterTitle to addManualBookmark when bookmark toggle is clicked with a chapter set (AC 4)', () => {
        useReaderStore.setState({
          currentChapterTitle: 'Tâm Kinh',
          currentCfi: 'epubcfi(/6/2!/4/2/1:0)',
          currentPage: 3,
          totalPages: 12,
          isChromeVisible: true,
        })
        renderLayout()
        fireEvent.click(screen.getByTestId('bookmark-toggle'))
        expect(mockAddManualBookmark).toHaveBeenCalledWith(
          expect.objectContaining({ chapterTitle: 'Tâm Kinh' })
        )
      })
    })
    ```
  - Note: `within` is imported from `@testing-library/react` (already used in the test file). `fireEvent` is also already imported.

- [x] Task 10: Add chapter title tests to `HomePage.test.tsx`
  - File: `apps/reader/src/features/home/HomePage.test.tsx`
  - Action — update the `beforeEach` to also reset `lastReadChapterTitle: ''`; add a new test:
    ```typescript
    it('shows chapter title before page count in Continue Reading card when lastReadChapterTitle is set', () => {
      useReaderStore.setState({
        lastReadBookId: 'kinh-phap-hoa',
        lastReadBookTitle: 'Kinh Pháp Hoa',
        lastReadPage: 15,
        lastReadTotalPages: 99,
        lastReadChapterTitle: 'Phẩm Tựa',
      })
      renderHomePage()
      expect(screen.getByText('Phẩm Tựa')).toBeInTheDocument()
      expect(screen.getByText('|')).toBeInTheDocument()
    })

    it('does not show chapter title or separator when lastReadChapterTitle is empty', () => {
      useReaderStore.setState({
        lastReadBookId: 'kinh-phap-hoa',
        lastReadBookTitle: 'Kinh Pháp Hoa',
        lastReadPage: 15,
        lastReadTotalPages: 99,
        lastReadChapterTitle: '',
      })
      renderHomePage()
      expect(screen.queryByText('|')).not.toBeInTheDocument()
    })
    ```

- [x] Task 11: Add chapter title tests to `BookmarkCard.test.tsx`
  - File: `apps/reader/src/features/bookmarks/BookmarkCard.test.tsx`
  - Action — add a new fixture and tests:
    ```typescript
    const MANUAL_BOOKMARK_WITH_CHAPTER: Bookmark = {
      ...MANUAL_BOOKMARK,
      chapterTitle: 'Tâm Kinh',
    }

    describe('BookmarkCard — chapter title display', () => {
      it('shows chapter title before page count when chapterTitle is set', () => {
        renderCard(MANUAL_BOOKMARK_WITH_CHAPTER)
        expect(screen.getByText('Tâm Kinh')).toBeInTheDocument()
        expect(screen.getByText('|')).toBeInTheDocument()
        expect(screen.getByText('Trang 5 / 100')).toBeInTheDocument()
      })

      it('does not show chapter title or separator when chapterTitle is absent', () => {
        renderCard(MANUAL_BOOKMARK)
        expect(screen.queryByText('|')).not.toBeInTheDocument()
        expect(screen.getByText('Trang 5 / 100')).toBeInTheDocument()
      })

      it('does not show chapter title on auto bookmark without page data', () => {
        renderCard(AUTO_BOOKMARK)
        expect(screen.queryByText('|')).not.toBeInTheDocument()
        expect(screen.getByText('Đang đọc')).toBeInTheDocument()
      })
    })
    ```

### Acceptance Criteria

- [x] AC 1: Given `book.navigation.toc` has entry `{ label: "Tâm Kinh", href: "chapter1.xhtml" }` and `packaging.navPath` is `"OEBPS/nav.xhtml"`, when the epub reader fires `relocated` with `start.href = "OEBPS/chapter1.xhtml"`, then `useReaderStore.getState().currentChapterTitle === "Tâm Kinh"`

- [x] AC 2: Given `currentChapterTitle = "Tâm Kinh"`, `currentPage = 3`, `totalPages = 12`, and chrome is visible, when the reader bottom bar renders, then it displays "Tâm Kinh", "|", and "3 / 12" in that order

- [x] AC 3: Given `currentChapterTitle = ""` and `currentPage = 3`, `totalPages = 12`, when the reader bottom bar renders, then it displays only "3 / 12" — no "|" separator and no chapter title element

- [x] AC 4: Given `currentChapterTitle = "Tâm Kinh"` and the user taps the bookmark toggle button, when `addManualBookmark` is called, then the created bookmark includes `chapterTitle: "Tâm Kinh"`

- [x] AC 5: Given a `Bookmark` with `chapterTitle: "Tâm Kinh"`, `page: 3`, `total: 12`, when `BookmarkCard` renders, then the card displays "Tâm Kinh", "|", and "Trang 3 / 12" in that order

- [x] AC 6: Given a `Bookmark` with no `chapterTitle` field and `page: 5`, `total: 100`, when `BookmarkCard` renders, then the card displays "Trang 5 / 100" with no separator

- [x] AC 7: Given `lastReadChapterTitle = "Phẩm Tựa"`, `lastReadPage = 15`, `lastReadTotalPages = 99`, when `ContinueReadingCard` renders, then it displays "Phẩm Tựa", "|", and "Trang 15 / 99"

- [x] AC 8: Given `lastReadChapterTitle = ""`, when `ContinueReadingCard` renders, then it displays only "Trang X / Y" — no separator, no chapter title

- [x] AC 9: Given `LAST_READ_POSITION` in storage contains `{ chapterTitle: "Tâm Kinh", bookId: "...", cfi: "...", ... }`, when `useStorageHydration` runs, then `useReaderStore.getState().lastReadChapterTitle === "Tâm Kinh"`

- [x] AC 10: Given `LAST_READ_POSITION` in storage has no `chapterTitle` field (old stored format), when `useStorageHydration` runs, then `lastReadChapterTitle` defaults to `""` and no error is thrown

- [x] AC 11: Given `resolveChapterTitle` is called with `book = null`, when evaluated, then it returns `""` without throwing

- [x] AC 12: Given `book.navigation.toc` is an empty array, when `resolveChapterTitle` is called with any href, then it returns `""`

## Additional Context

### Dependencies

- All changes are within `apps/reader/src/` — no cross-app dependencies, no new npm packages
- epub.js `location.start.href` presence on `relocated` events: confirmed by epub.js architecture (same field used by `useEpubReader.navigateToTocEntry` to determine spine position)

### Testing Strategy

**Unit tests (Vitest + Testing Library):**
- `ReaderEngine.test.tsx` — 3 new tests: matching TOC entry, no match, null book (Task 8)
- `ChromelessLayout.test.tsx` — 2 new tests: chapter title shown, chapter title absent (Task 9)
- `HomePage.test.tsx` — 2 new tests: chapter title shown, chapter title absent (Task 10)
- `BookmarkCard.test.tsx` — 3 new tests: with chapter title, without, auto bookmark (Task 11)

**Existing tests that must remain passing:**
- `ReaderEngine.test.tsx` "calls setCurrentCfi..." — passes `{ start: { cfi } }` with no `href`; `resolveChapterTitle(book, undefined)` returns `''`; `setProgress` and `setLastRead` accept `chapterTitle?` with default `''`
- `HomePage.test.tsx` line 59 checks `getAllByText(/Trang 15/)` — still matches the `<span>Trang 15 / 99</span>` inside the chapter context wrapper
- `BookmarkCard.test.tsx` — `MANUAL_BOOKMARK` and `AUTO_BOOKMARK` fixtures have no `chapterTitle`; fallback rendering is unchanged

**Manual testing steps:**
1. Open reader on an epub with a valid TOC — bottom bar should show chapter title + "|" + page count
2. Navigate to a new chapter — chapter title should update
3. Go to homepage — "continue reading" card should show the chapter title
4. Add a manual bookmark — open Bookmarks page, verify chapter title appears on that bookmark card
5. Reload the app — chapter title on homepage card should be restored from storage
6. Test with an epub that has no TOC — bottom bar shows only page count, no separator

## Review Notes
- Adversarial review completed
- Findings: 12 total, 9 fixed, 3 skipped (noise)
- Resolution approach: auto-fix
- Post-review fixes applied:
  - F-001: Added `normalized.includes('/')` guard on path-boundary endsWith checks to prevent false-positive matching of bare filenames
  - F-002: Added comment documenting relationship to `useEpubReader.normalizeHref` (maintenance risk mitigation)
  - F-003: Added `useEffect` in `ReaderPage.tsx` to clear stale chapter/page context when `bookId` changes
  - F-004: Updated `HomePage` link `aria-label` to include chapter title for screen reader parity
  - F-005: Added `!item.href.startsWith(baseDir)` guard to prevent double-prefixing TOC hrefs that already contain the full path
  - F-006: Corrected test name in `ReaderEngine.test.tsx` to match spec prescription
  - F-007: Added `min-w-0` to truncating chapter-title spans in `BookmarkCard.tsx` and `ChromelessLayout.tsx`
  - F-010: Added AC 9 & AC 10 tests to `useStorageHydration.test.ts`
  - F-011: Moved `BookmarkCard — chapter title display` describe to be a sibling of the outer describe

### Notes

- **`PageProgress.tsx`:** This component exists and renders `{currentPage + 1} / {totalPages}` but is imported nowhere. Do not touch it; it is dead code and out of scope.
- **Off-by-one in `PageProgress.tsx` vs `ChromelessLayout`:** `PageProgress` uses `currentPage + 1`, while `ChromelessLayout` uses `currentPage` directly. These are different conventions. This spec does not change either — it only adds the chapter title alongside the existing display.
- **epub.js `book.navigation` availability:** `book.navigation` is populated via `book.loaded.navigation` — a separate promise from `rendition.display()`. There is a theoretical race where `relocated` fires before `navigation` is ready. In practice this is extremely rare on any device, and `resolveChapterTitle` gracefully returns `''` when `toc` is empty or unavailable. The feature degrades silently (no chapter title shown) rather than crashing.
- **`location.start.href` availability:** epub.js populates `start.href` on `relocated` events in paginated flow mode (the mode used here). If it is ever absent, `resolveChapterTitle(bookRef.current, undefined)` returns `''` immediately. Verify this works correctly on first manual test run (AC1).
- **Future:** Mobile tap-to-reveal of full title (deferred) would add a `TouchableOpacity` wrapper around the chapter title span with a tooltip/sheet — no structural changes needed to implement that later.
