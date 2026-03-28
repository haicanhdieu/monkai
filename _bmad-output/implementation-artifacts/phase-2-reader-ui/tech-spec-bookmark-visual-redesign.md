---
title: 'Bookmark Page Visual Redesign — Card-Based Groups + Search'
slug: 'bookmark-visual-redesign'
created: '2026-03-28'
status: 'completed'
stepsCompleted: [1, 2, 3, 4]
tech_stack: ['React 18', 'TypeScript', 'Tailwind v3', 'Radix UI Icons', 'Vitest + Testing Library']
files_to_modify:
  - 'apps/reader/src/features/bookmarks/BookmarkCard.tsx'
  - 'apps/reader/src/features/bookmarks/BookmarksPage.tsx'
  - 'apps/reader/src/features/bookmarks/BookmarkCard.test.tsx'
  - 'apps/reader/src/features/bookmarks/BookmarksPage.test.tsx'
files_to_create:
  - 'apps/reader/src/features/bookmarks/BookmarkSearchBar.tsx'
code_patterns:
  - 'CSS variables for all colors (no Tailwind color classes)'
  - 'data-testid on all interactive elements and key containers'
  - 'Tailwind for layout, spacing, sizing only'
test_patterns:
  - 'Vitest + @testing-library/react'
  - 'Snapshot or visual assertion not used — behavior tests only'
  - 'data-testid selectors preferred'
---

# Tech-Spec: Bookmark Page Visual Redesign — Card-Based Groups + Search

**Created:** 2026-03-28
**Design Reference:** `_bmad-output/stitch-screens/card-based-bookmarks-design.png`

---

## Overview

### Problem Statement

The current bookmarks page renders book groups as floating sections with no visual container, and each bookmark item as an individually bordered pill-shaped card. This creates visual fragmentation — the relationship between a book and its bookmarks is implied by proximity alone. There is also no way to find a specific bookmark without scrolling through the entire list.

### Solution

1. **Card-based groups** — wrap each book + its bookmarks into a single rounded card container. The card provides the visual boundary; individual bookmark rows inside lose their own borders.
2. **Search bar** — add a client-side search input below the AppBar, filtering groups by book title or bookmark chapter title.
3. **Size/spacing** — scale up the cover thumbnail and adjust typography to match the new design.

### Scope

**In Scope:**
- `BookmarkSearchBar.tsx` (new) — search input component
- `BookmarkCard.tsx` — remove individual border/background; resize icons; update delete button layout
- `BookmarksPage.tsx` — add card container per group; add search state + filteredGroups; wire up BookmarkSearchBar
- Updated tests for BookmarkCard + BookmarksPage

**Out of Scope:**
- Swipe-to-delete pointer event logic (unchanged)
- Store integration (`useBookmarksStore`, `useCatalogIndex`)
- Routing (`toRead`, `state: { cfi }`)
- Empty state UI (unchanged)
- CSS variable names (no new variables needed)
- `formatRelativeTime` display

---

## Context for Development

### Codebase Patterns

- CSS variables for all colors — never Tailwind color utility classes (e.g. `style={{ color: 'var(--color-text)' }}` not `className="text-gray-500"`)
- Tailwind used only for layout, spacing, sizing, typography scale
- `data-testid` required on all interactive elements and key containers
- Radix UI Icons for all iconography
- Tests use testId/role/text selectors — no class-based assertions in existing test files

### Design Diff Reference

| Visual Area | Current Design | New Design |
|---|---|---|
| Book group container | `<section>` with no border | Rounded card: `rounded-2xl border` + `--color-surface` bg |
| Bookmark item outer | Standalone bordered pill (`rounded-2xl border p-4`) | Borderless row (`px-3 py-3`) inside card |
| Between bookmark rows | `space-y-3` (gap between pills) | `divide-y` divider lines inside card |
| Between groups | `space-y-8` | `space-y-4` |
| Book cover | `h-14 w-10` (56×40px) | `h-[88px] w-[70px]` (~90×70px) |
| Book title | `text-sm font-semibold` | `text-base font-bold` |
| Icons | `h-4 w-4` | `h-5 w-5` |
| Search bar | Not present | Search input below AppBar |

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `apps/reader/src/features/bookmarks/BookmarkCard.tsx` | Individual bookmark row — swipe-to-delete, link, icons |
| `apps/reader/src/features/bookmarks/BookmarksPage.tsx` | Page container — grouping logic, list render |
| `apps/reader/src/features/bookmarks/BookmarkCard.test.tsx` | 17 existing tests — all pass, use testId/role/text selectors |
| `apps/reader/src/features/bookmarks/BookmarksPage.test.tsx` | 7 existing tests — all pass, use testId/role/text selectors |
| `_bmad-output/stitch-screens/card-based-bookmarks-design.png` | Visual design reference |

### Technical Decisions

- `BookmarkSearchBar` is a pure controlled component (value + onChange props) — no internal state. Caller owns state.
- `filteredGroups` derived via `useMemo` in `BookmarksPage` — not stored in state, recalculated from `groups` + `searchQuery`.
- Search filters at the item level: a group is retained if ≥1 item passes (`chapterTitle` match OR book title match). Groups with 0 matching items are filtered out entirely.
- `divide-y` on `<ul>` uses `style={{ borderColor: 'var(--color-border)' }}` for the divider color — Tailwind's default `divide-*` color is not used.

---

## Implementation Plan

### Tasks

Tasks ordered by dependency (lowest level first):

- [x] Task 1: Create `BookmarkSearchBar.tsx`
  - File: `apps/reader/src/features/bookmarks/BookmarkSearchBar.tsx`
  - Action: Create new file with the following exact content:
    ```tsx
    import { MagnifyingGlassIcon } from '@radix-ui/react-icons'

    interface BookmarkSearchBarProps {
      value: string
      onChange: (value: string) => void
    }

    export function BookmarkSearchBar({ value, onChange }: BookmarkSearchBarProps) {
      return (
        <div
          className="flex items-center gap-2 rounded-full px-4 py-2 border mb-4"
          style={{
            backgroundColor: 'var(--color-surface)',
            borderColor: 'var(--color-border)',
          }}
        >
          <MagnifyingGlassIcon
            className="h-4 w-4 shrink-0"
            style={{ color: 'var(--color-text-muted)' }}
            aria-hidden="true"
          />
          <input
            type="search"
            placeholder="Tìm kiếm..."
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="flex-1 bg-transparent text-sm outline-none"
            style={{ color: 'var(--color-text)' }}
            aria-label="Tìm kiếm dấu trang"
            data-testid="bookmark-search-input"
          />
        </div>
      )
    }
    ```

- [x] Task 2: Strip individual card border/background from `BookmarkCard.tsx`
  - File: `apps/reader/src/features/bookmarks/BookmarkCard.tsx`
  - Action 2a — Outer wrapper: remove `rounded-2xl` from className.
    Find: `className="relative overflow-hidden rounded-2xl"`
    Replace: `className="relative overflow-hidden"`
  - Action 2b — Link element: remove `rounded-2xl border` from className; remove `backgroundColor` and `borderColor` from style; reduce padding from `p-4` to `px-3 py-3`.
    Find:
    ```tsx
    style={{
      transform: `translateX(-${swipeX}px)`,
      transition: swipeX === 0 ? 'transform 0.2s' : 'none',
      backgroundColor: 'var(--color-surface)',
      borderColor: 'var(--color-border)',
    }}
    className="relative flex min-h-[44px] gap-4 rounded-2xl border p-4 transition-colors hover:brightness-95"
    ```
    Replace:
    ```tsx
    style={{
      transform: `translateX(-${swipeX}px)`,
      transition: swipeX === 0 ? 'transform 0.2s' : 'none',
    }}
    className="relative flex min-h-[44px] gap-4 px-3 py-3 transition-colors hover:brightness-95"
    ```

- [x] Task 3: Resize icons and inner row gap in `BookmarkCard.tsx`
  - File: `apps/reader/src/features/bookmarks/BookmarkCard.tsx`
  - Action 3a — Inner row: `gap-2` → `gap-3`.
    Find: `<div className="min-w-0 flex-1 flex items-center gap-2 text-sm" style={{ color: 'var(--color-text-muted)' }}>`
    Replace: `<div className="min-w-0 flex-1 flex items-center gap-3 text-sm" style={{ color: 'var(--color-text-muted)' }}>`
  - Action 3b — BookmarkFilledIcon: `h-4 w-4` → `h-5 w-5`.
    Find: `className="h-4 w-4 shrink-0"\n              style={{ color: 'var(--color-accent)' }}`
    (The BookmarkFilledIcon instance — distinguished from UpdateIcon by the adjacent accent color style)
    Replace: `className="h-5 w-5 shrink-0"` (keep style unchanged)
  - Action 3c — UpdateIcon: `h-4 w-4` → `h-5 w-5`.
    (The UpdateIcon instance — distinguished by the text-muted color style)
    Replace: `className="h-5 w-5 shrink-0"` (keep style unchanged)

- [x] Task 4: Update delete button in `BookmarkCard.tsx` to show trash icon above "Xóa"
  - File: `apps/reader/src/features/bookmarks/BookmarkCard.tsx`
  - Action 4a — Add `TrashIcon` to import line.
    Find: `import { BookmarkFilledIcon, UpdateIcon } from '@radix-ui/react-icons'`
    Replace: `import { BookmarkFilledIcon, UpdateIcon, TrashIcon } from '@radix-ui/react-icons'`
  - Action 4b — Update delete button content.
    Find:
    ```tsx
    className="w-full h-full text-white text-xs font-medium"
    >
      Xóa
    </button>
    ```
    Replace:
    ```tsx
    className="w-full h-full flex flex-col items-center justify-center gap-1 text-white text-xs font-medium"
    >
      <TrashIcon className="h-4 w-4" aria-hidden="true" />
      Xóa
    </button>
    ```

- [x] Task 5: Add search state and filteredGroups to `BookmarksPage.tsx`
  - File: `apps/reader/src/features/bookmarks/BookmarksPage.tsx`
  - Action 5a — Add `useState` to React import.
    Find: `import { useMemo } from 'react'`
    Replace: `import { useMemo, useState } from 'react'`
  - Action 5b — Add `BookmarkSearchBar` import after existing bookmark imports.
    Add after: `import { BookmarkCard } from './BookmarkCard'`
    New line: `import { BookmarkSearchBar } from './BookmarkSearchBar'`
  - Action 5c — Add searchQuery state inside component.
    Add after: `const { bookmarks, removeManualBookmark } = useBookmarksStore()`
    New line: `const [searchQuery, setSearchQuery] = useState('')`
  - Action 5d — Add filteredGroups useMemo after the existing `groups` useMemo block (after line ending with `), [bookmarks])`).
    Add:
    ```tsx
    const filteredGroups = useMemo(() => {
      if (!searchQuery.trim()) return groups
      const q = searchQuery.toLowerCase()
      return groups
        .map((g) => ({
          ...g,
          items: g.items.filter(
            (b) =>
              g.bookTitle.toLowerCase().includes(q) ||
              (b.chapterTitle?.toLowerCase().includes(q) ?? false)
          ),
        }))
        .filter((g) => g.items.length > 0)
    }, [groups, searchQuery])
    ```

- [x] Task 6: Wire up `BookmarkSearchBar` and update render in `BookmarksPage.tsx`
  - File: `apps/reader/src/features/bookmarks/BookmarksPage.tsx`
  - Action 6a — Replace `<div className="mb-6" />` spacer with `<BookmarkSearchBar>`.
    Find: `<div className="mb-6" />`
    Replace: `<BookmarkSearchBar value={searchQuery} onChange={setSearchQuery} />`
  - Action 6b — Update groups container spacing.
    Find: `<div className="space-y-8">`
    Replace: `<div className="space-y-4">`
  - Action 6c — Add no-results state and use `filteredGroups`. Update the `groups.length === 0` conditional to:
    ```tsx
    {groups.length === 0 ? (
      <div
        className="flex flex-col items-center justify-center gap-6 px-8 py-20 text-center"
        data-testid="bookmarks-empty-state"
      >
        <p className="text-base leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
          Chưa có dấu trang nào. Nhấn 🔖 khi đọc để lưu trang.
        </p>
        <Link
          to={ROUTES.LIBRARY}
          className="rounded-full px-6 py-3 text-sm font-semibold text-white"
          style={{ backgroundColor: 'var(--color-accent)' }}
        >
          Khám phá Thư Viện
        </Link>
      </div>
    ) : filteredGroups.length === 0 ? (
      <p className="py-12 text-center text-sm" style={{ color: 'var(--color-text-muted)' }}>
        Không tìm thấy dấu trang nào.
      </p>
    ) : (
      <div className="space-y-4">
        {filteredGroups.map((group) => (
          <section
            key={group.bookId}
            data-testid="bookmark-group"
            className="overflow-hidden rounded-2xl border"
            style={{
              backgroundColor: 'var(--color-surface)',
              borderColor: 'var(--color-border)',
            }}
          >
            <div className="flex items-center gap-4 px-3 pt-3 pb-3" data-testid="bookmark-group-header">
              <div className="relative h-[88px] w-[70px] shrink-0 overflow-hidden rounded">
                {coverUrlMap[group.bookId] ? (
                  <img
                    src={coverUrlMap[group.bookId]!}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div
                    className="h-full w-full rounded"
                    style={{ backgroundColor: 'var(--color-border)' }}
                  />
                )}
              </div>
              <span className="text-base font-bold truncate" style={{ color: 'var(--color-text)' }}>
                {group.bookTitle}
              </span>
            </div>
            <ul
              className="divide-y"
              style={{ borderColor: 'var(--color-border)' }}
            >
              {group.items.map((b) => (
                <li key={`${b.bookId}-${b.cfi}-${b.type}`}>
                  <BookmarkCard
                    bookmark={b}
                    onDelete={
                      b.type === 'manual'
                        ? () => {
                            removeManualBookmark(b.bookId, b.cfi)
                            void storageService.setItem(
                              STORAGE_KEYS.BOOKMARKS,
                              useBookmarksStore.getState().bookmarks
                            )
                          }
                        : undefined
                    }
                  />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    )}
    ```

- [x] Task 7: Update `BookmarkCard.test.tsx`
  - File: `apps/reader/src/features/bookmarks/BookmarkCard.test.tsx`
  - Action: Add one new test asserting the outer wrapper no longer has `border` class (since the border now lives on the parent `<section>` in BookmarksPage).
    Add inside `describe('BookmarkCard', () => {` (after the existing auto/manual describe blocks):
    ```tsx
    it('outer wrapper does not have border class (border is now on the parent card)', () => {
      renderCard(MANUAL_BOOKMARK)
      const card = screen.getByTestId('bookmark-card')
      expect(card).not.toHaveClass('border')
    })
    ```
  - Notes: No existing assertions to remove — existing tests use testId/role/text selectors only, no class checks.

- [x] Task 8: Add search tests to `BookmarksPage.test.tsx`
  - File: `apps/reader/src/features/bookmarks/BookmarksPage.test.tsx`
  - Action: Add `userEvent` import and a new `describe('BookmarksPage — search', ...)` block. Add after existing imports:
    ```tsx
    import userEvent from '@testing-library/user-event'
    ```
    Add after the existing `describe('BookmarksPage', ...)` block:
    ```tsx
    describe('BookmarksPage — search', () => {
      it('search input is rendered', () => {
        useBookmarksStore.setState({ bookmarks: [bookmark1] })
        renderPage()
        expect(screen.getByTestId('bookmark-search-input')).toBeInTheDocument()
      })

      it('typing filters groups by book title', async () => {
        useBookmarksStore.setState({ bookmarks: [bookmark1, bookmark2] })
        renderPage()
        await userEvent.type(screen.getByTestId('bookmark-search-input'), 'Pháp Hoa')
        const groups = screen.getAllByTestId('bookmark-group')
        expect(groups).toHaveLength(1)
        expect(within(groups[0]).getByTestId('bookmark-group-header')).toHaveTextContent('Kinh Pháp Hoa')
      })

      it('typing filters groups by chapter title', async () => {
        const bookmarkWithChapter: Bookmark = {
          bookId: 'kinh-phap-hoa',
          bookTitle: 'Kinh Pháp Hoa',
          cfi: 'epubcfi(/6/6!/4/2/1:0)',
          timestamp: 1000000,
          type: 'manual',
          chapterTitle: 'Phẩm Phương Tiện',
        }
        useBookmarksStore.setState({ bookmarks: [bookmarkWithChapter, bookmark2] })
        renderPage()
        await userEvent.type(screen.getByTestId('bookmark-search-input'), 'Phương Tiện')
        const groups = screen.getAllByTestId('bookmark-group')
        expect(groups).toHaveLength(1)
        expect(within(groups[0]).getByTestId('bookmark-group-header')).toHaveTextContent('Kinh Pháp Hoa')
      })

      it('clearing search restores all groups', async () => {
        useBookmarksStore.setState({ bookmarks: [bookmark1, bookmark2] })
        renderPage()
        const input = screen.getByTestId('bookmark-search-input')
        await userEvent.type(input, 'Pháp Hoa')
        expect(screen.getAllByTestId('bookmark-group')).toHaveLength(1)
        await userEvent.clear(input)
        expect(screen.getAllByTestId('bookmark-group')).toHaveLength(2)
      })

      it('search with no match shows no-results message, not empty state', async () => {
        useBookmarksStore.setState({ bookmarks: [bookmark1] })
        renderPage()
        await userEvent.type(screen.getByTestId('bookmark-search-input'), 'xyznotfound')
        expect(screen.queryByTestId('bookmarks-empty-state')).not.toBeInTheDocument()
        expect(screen.getByText('Không tìm thấy dấu trang nào.')).toBeInTheDocument()
      })

      it('group section has card styling', () => {
        useBookmarksStore.setState({ bookmarks: [bookmark1] })
        renderPage()
        const group = screen.getByTestId('bookmark-group')
        expect(group).toHaveClass('rounded-2xl')
        expect(group).toHaveClass('overflow-hidden')
      })

      it('bookmark list uses divide-y not space-y-3', () => {
        useBookmarksStore.setState({ bookmarks: [bookmark1] })
        renderPage()
        const group = screen.getByTestId('bookmark-group')
        const ul = within(group).getByRole('list')
        expect(ul).toHaveClass('divide-y')
        expect(ul).not.toHaveClass('space-y-3')
      })
    })
    ```
  - Notes: Requires `@testing-library/user-event` — verify it is already a dev dependency before adding the import. If not present, run `pnpm -C apps/reader add -D @testing-library/user-event`.

---

### Acceptance Criteria

- [x] AC 1: Given the bookmarks page is open with at least one bookmark, when the page renders, then a search input with placeholder "Tìm kiếm..." is visible below the AppBar.

- [x] AC 2: Given the search input is visible and multiple book groups exist, when the user types a book title substring, then only groups whose book title contains the query (case-insensitive) are shown.

- [x] AC 3: Given the search input is visible and a bookmark has a `chapterTitle`, when the user types a chapter title substring, then groups containing that bookmark are shown even if the book title does not match.

- [x] AC 4: Given the search input has a query that filtered some groups, when the user clears the input, then all groups are restored.

- [x] AC 5: Given the search input has a query that matches no book titles or chapter titles, when the filtered result is empty but bookmarks exist, then "Không tìm thấy dấu trang nào." is shown and the original empty state (`bookmarks-empty-state`) is NOT shown.

- [x] AC 6: Given the bookmarks page renders groups, when inspecting the DOM, then each `[data-testid="bookmark-group"]` element has `rounded-2xl`, `overflow-hidden`, and `border` classes, and a `style` with `backgroundColor: var(--color-surface)` and `borderColor: var(--color-border)`.

- [x] AC 7: Given the bookmarks page renders groups, when inspecting the DOM, then the `<ul>` inside each group has class `divide-y` (not `space-y-3`), and the individual `[data-testid="bookmark-card"]` outer wrappers do NOT have a `border` class.

- [x] AC 8: Given a group is rendered, when inspecting the group header, then the cover thumbnail is `h-[88px] w-[70px]` and the book title has classes `text-base font-bold`.

- [x] AC 9: Given a manual bookmark is rendered inside a card group, when the user swipes left ≥ 60px, then the delete button is revealed and shows a trash icon stacked above "Xóa" text; clicking it removes the bookmark.

- [x] AC 10: Given zero bookmarks exist in the store, when the page renders, then the empty state (`bookmarks-empty-state`) is shown and no search bar interaction changes this.

- [x] AC 11: Given the bookmarks page renders, when all tests are run with `pnpm -C apps/reader test`, then all existing 24 tests pass and all 8 new tests pass.

---

## Additional Context

### Dependencies

- `@radix-ui/react-icons` — already installed; `TrashIcon` and `MagnifyingGlassIcon` are available in the package.
- `@testing-library/user-event` — check if already a dev dependency in `apps/reader/package.json` before importing in tests. If absent, install with `pnpm -C apps/reader add -D @testing-library/user-event`.
- No new CSS variables needed.
- No new store fields or routes needed.

### Testing Strategy

**Unit tests (Vitest + Testing Library):**
- `BookmarkCard.test.tsx`: Add 1 new test — outer wrapper does not have `border` class. All 17 existing tests must continue to pass.
- `BookmarksPage.test.tsx`: Add 7 new tests covering: search renders, filters by book title, filters by chapter title, clears to show all, no-match shows correct message, group card styling, divide-y on list. All 7 existing tests must continue to pass.

**Run command:**
```bash
pnpm -C apps/reader test
```

**Manual verification:**
1. Open bookmarks page with ≥2 books bookmarked
2. Confirm each book group is visually wrapped in a card (rounded, bordered)
3. Confirm bookmark rows inside have no individual border
4. Confirm rows are separated by a fine divider line
5. Type in search bar — confirm groups filter in real time
6. Clear search — confirm all groups return
7. Type a query with no matches — confirm "Không tìm thấy dấu trang nào." appears (not the empty state)
8. Swipe a manual bookmark — confirm delete button shows trash icon + "Xóa"

## Review Notes
- Adversarial review completed
- Findings: 12 total, 11 fixed, 1 skipped (F-12 undecided — alt="" kept as empty since alt={bookTitle} now added)
- Resolution approach: auto-fix
- Post-review fixes: search bar hidden on empty state (F-01), divide-y color via Tailwind arbitrary value (F-03), test moved to correct describe block (F-04), focus ring on delete button (F-05), enterKeyHint + clear button on search bar (F-06, F-07), --color-error/--color-on-error CSS variables defined (F-08, F-11), searchQuery reset on store clear (F-09), aria-live region for screen readers (F-10)

### Notes

**Risk: `@testing-library/user-event` missing**
Check `apps/reader/package.json` devDependencies before writing Task 8 tests. If absent, install first.

**Risk: `divide-y` color inheritance**
Tailwind's `divide-y` uses its own border color utility. The spec uses `style={{ borderColor: 'var(--color-border)' }}` on the `<ul>` to override with the CSS variable. Verify the divider renders visibly in both light and dark themes.

**Risk: swipe-to-delete and card overflow**
`BookmarkCard`'s outer wrapper uses `overflow-hidden` to clip the delete button reveal. The parent `<section>` now also uses `overflow-hidden`. This double-overflow-hidden is safe — the swipe animation clipping still works because the card wrapper's own overflow contains the translate.

**Out of scope but worth noting:**
- A "clear search" ✕ button inside the search bar would improve UX but is not in the current design spec.
- Keyboard accessibility for the search (focus management on Escape) is not specified.
