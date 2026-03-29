---
title: 'Category Page Search Bar'
slug: 'category-page-search-bar'
created: '2026-03-29'
status: 'ready-for-dev'
stepsCompleted: [1, 2, 3, 4]
tech_stack: ['React 18', 'TypeScript strict', 'MiniSearch 7', 'TanStack Virtual', 'Tailwind 3', 'Radix UI']
files_to_modify:
  - 'apps/reader/src/features/library/CategoryPage.tsx'
  - 'apps/reader/src/features/library/CategoryPage.test.tsx'
code_patterns: ['useLibrarySearch', 'LibrarySearchBar', 'SearchResults', 'AppBar children + rightSlot', 'hooks-before-early-returns']
test_patterns: ['vi.fn mock hooks', 'userEvent type/clear', 'screen.getByRole/queryByRole', 'userEvent.setup()']
---

# Tech-Spec: Category Page Search Bar

**Created:** 2026-03-29

## Overview

### Problem Statement

The CategoryPage lists books in a category but has no search bar. When a category contains many books, users cannot filter or quickly locate a specific title — they must scroll manually through the entire list.

### Solution

Add a `LibrarySearchBar` to the CategoryPage, reusing the existing `useLibrarySearch` hook scoped to the category's books. When a query is active, replace `VirtualBookList` with `SearchResults`. Keep the header compact by moving the book count to the AppBar `rightSlot` (title row) instead of below the search bar.

### Scope

**In Scope:**
- Add search bar to `CategoryPage.tsx` (filter within category books only)
- Compact header: count moves to `rightSlot`, search bar is the sole AppBar child
- Show `SearchResults` when query active, `VirtualBookList` when empty
- Update `CategoryPage.test.tsx` with search behaviour tests

**Out of Scope:**
- Cross-category search (already exists on LibraryPage)
- New shared components (reuse existing ones)
- Changes to `LibraryPage`, `useLibrarySearch`, `LibrarySearchBar`, or `SearchResults`

## Context for Development

### Codebase Patterns

- **Hook placement**: React hook rules require `useLibrarySearch` to be called unconditionally. Hoist the `selectedCategory` derivation to the top of the component (before all early-return guards) using null-safe logic. TypeScript narrows `selectedCategory` to non-null after the existing `if (!selectedCategory)` guard — no `!` assertions needed in the render.
- **AppBar slots**: `children` renders below the title row (in a `mt-3` div); `rightSlot` renders to the right of the title. LibraryPage uses `children` for the search bar. CategoryPage currently uses `children` for the count `<p>` — this moves to `rightSlot`.
- **Conditional rendering pattern**: When `normalizedQuery` is truthy → `<SearchResults>`; else → `<VirtualBookList>`. Mirrors `LibraryPage.tsx` lines 122–143.
- **Padding**: `VirtualBookList` has its own `px-4`. `SearchResults` has no outer padding — wrap it in `<div className="px-4 pt-2">` when rendering in CategoryPage.
- **Scroll**: `SearchResults` resets scroll to top on query change internally. `VirtualBookList` saves/restores scroll via `sessionStorage` — no changes needed.
- **TypeScript strict**: `noUnusedLocals`, `noUnusedParameters` — hoisting `selectedCategory` to the top satisfies both hook rules and the no-unused-locals rule (single derivation used in hook call and render).

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `apps/reader/src/features/library/CategoryPage.tsx` | **Modify** — current structure, hook order, render tree |
| `apps/reader/src/features/library/CategoryPage.test.tsx` | **Modify** — add search behaviour tests |
| `apps/reader/src/features/library/LibraryPage.tsx` | **Reference** — how search bar + useLibrarySearch are wired |
| `apps/reader/src/features/library/useLibrarySearch.ts` | **Reuse** — accepts any `CatalogBook[]`, returns `{ query, setQuery, clearQuery, debouncedQuery, normalizedQuery, results }` |
| `apps/reader/src/features/library/LibrarySearchBar.tsx` | **Reuse** — props: `query`, `onQueryChange`, `onClear` |
| `apps/reader/src/features/library/SearchResults.tsx` | **Reuse** — props: `query`, `results: SearchDocument[]` |
| `apps/reader/src/shared/components/AppBar.tsx` | **Reference** — `rightSlot` and `children` slot definitions |

### Technical Decisions

- Count `rightSlot` uses `<span className="text-sm font-medium text-[var(--color-accent)]">` — matches the style of the categories count in LibraryPage.
- `useLibrarySearch([])` while loading is valid — MiniSearch indexes 0 documents and returns no results.
- No new component extraction — the entire change lives in `CategoryPage.tsx`.

## Implementation Plan

### Tasks

- [ ] **Task 1: Add imports to `CategoryPage.tsx`**
  - File: `apps/reader/src/features/library/CategoryPage.tsx`
  - Action: Add three imports at the top of the file alongside existing imports:
    ```ts
    import { useLibrarySearch } from '@/features/library/useLibrarySearch'
    import { LibrarySearchBar } from '@/features/library/LibrarySearchBar'
    import { SearchResults } from '@/features/library/SearchResults'
    ```

- [ ] **Task 2: Hoist `selectedCategory` derivation and call `useLibrarySearch`**
  - File: `apps/reader/src/features/library/CategoryPage.tsx`
  - Action: Inside `CategoryPage()`, after the three existing hook calls (`useParams`, `useCatalogIndex`, `useOnlineStatus`) and before the first early-return guard, add:
    ```ts
    const selectedCategory = catalogQuery.data && category
      ? getCategoryBySlug(catalogQuery.data, category) ?? null
      : null

    const { query, setQuery, clearQuery, debouncedQuery, normalizedQuery, results } =
      useLibrarySearch(selectedCategory?.books ?? [])
    ```
  - Then delete the existing post-guard `selectedCategory` derivation (currently at the bottom of the function body before the final `return`):
    ```ts
    // DELETE this line (it comes after all the early returns currently):
    const selectedCategory = getCategoryBySlug(catalogQuery.data, category)
    ```
  - Notes: The `if (!selectedCategory)` guard that follows stays exactly where it is. TypeScript narrows `selectedCategory` from `LibraryCategory | null` to `LibraryCategory` after that guard.

- [ ] **Task 3: Update the happy-path AppBar in `CategoryPage.tsx`**
  - File: `apps/reader/src/features/library/CategoryPage.tsx`
  - Action: In the final `return` block, update the `<AppBar>` element:
    1. Add `rightSlot` prop:
       ```tsx
       rightSlot={
         <span className="text-sm font-medium text-[var(--color-accent)]">
           {selectedCategory.count} kinh sách
         </span>
       }
       ```
    2. Replace the existing children `<p className="text-sm" ...>{selectedCategory.count} kinh sách</p>` with:
       ```tsx
       <LibrarySearchBar query={query} onQueryChange={setQuery} onClear={clearQuery} />
       ```

- [ ] **Task 4: Replace `VirtualBookList` with conditional search/list rendering**
  - File: `apps/reader/src/features/library/CategoryPage.tsx`
  - Action: Replace the single `<VirtualBookList ... />` line with:
    ```tsx
    {normalizedQuery ? (
      <div className="px-4 pt-2">
        <SearchResults query={debouncedQuery} results={results} />
      </div>
    ) : (
      <VirtualBookList books={selectedCategory.books} categorySlug={category} />
    )}
    ```

- [ ] **Task 5: Add search tests to `CategoryPage.test.tsx`**
  - File: `apps/reader/src/features/library/CategoryPage.test.tsx`
  - Action: Add `import userEvent from '@testing-library/user-event'` at top. Then add five new `it` blocks inside the existing `describe('CategoryPage')` block, each using `const user = userEvent.setup()`:

    ```tsx
    it('renders search bar when catalog loads', () => {
      mockUseCatalogIndex.mockReturnValue({ isLoading: false, data: catalogFixture, error: null })
      renderPage()
      expect(screen.getByRole('textbox', { name: 'Tìm kiếm kinh sách' })).toBeInTheDocument()
    })

    it('shows book count in title row', () => {
      mockUseCatalogIndex.mockReturnValue({ isLoading: false, data: catalogFixture, error: null })
      renderPage()
      expect(screen.getByText('1 kinh sách')).toBeInTheDocument()
    })

    it('filters results when user types a query', async () => {
      mockUseCatalogIndex.mockReturnValue({ isLoading: false, data: catalogFixture, error: null })
      const user = userEvent.setup()
      renderPage()
      await user.type(screen.getByRole('textbox', { name: 'Tìm kiếm kinh sách' }), 'Bát Nhã')
      expect(screen.getByRole('region', { name: 'Kết quả tìm kiếm' })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Đọc Kinh Bát Nhã' })).toBeInTheDocument()
    })

    it('restores book list when query is cleared', async () => {
      mockUseCatalogIndex.mockReturnValue({ isLoading: false, data: catalogFixture, error: null })
      const user = userEvent.setup()
      renderPage()
      const input = screen.getByRole('textbox', { name: 'Tìm kiếm kinh sách' })
      await user.type(input, 'Bát Nhã')
      await user.clear(input)
      expect(screen.getByRole('link', { name: 'Đọc Kinh Bát Nhã' })).toBeInTheDocument()
      expect(screen.queryByRole('region', { name: 'Kết quả tìm kiếm' })).not.toBeInTheDocument()
    })

    it('shows no results message for unmatched query', async () => {
      mockUseCatalogIndex.mockReturnValue({ isLoading: false, data: catalogFixture, error: null })
      const user = userEvent.setup()
      renderPage()
      await user.type(screen.getByRole('textbox', { name: 'Tìm kiếm kinh sách' }), 'xyz không có')
      expect(screen.getByText('Không tìm thấy kết quả')).toBeInTheDocument()
    })
    ```

### Acceptance Criteria

- [ ] **AC1 — Search bar renders on load**
  - Given: User navigates to a valid category URL (e.g. `/library/kinh`) and the catalog loads
  - When: The page finishes loading
  - Then: A search input with placeholder "Tìm kiếm kinh điển..." and aria-label "Tìm kiếm kinh sách" is visible below the AppBar title row

- [ ] **AC2 — Book count visible in title row (compact header)**
  - Given: Category page loads successfully
  - When: User views the header
  - Then: Book count (e.g. "42 kinh sách") appears on the right side of the AppBar title row — NOT below the search bar

- [ ] **AC3 — Typing filters books within the category**
  - Given: User is on a category page with at least one book
  - When: User types a query that matches a book title
  - Then: The `SearchResults` list renders with matching books; `VirtualBookList` is not visible

- [ ] **AC4 — Clearing the query restores the full book list**
  - Given: User has an active search query showing `SearchResults`
  - When: User clears the input (via clear button or Escape key)
  - Then: `VirtualBookList` is restored showing all category books; `SearchResults` is not visible

- [ ] **AC5 — Unmatched query shows empty state**
  - Given: User types a query that matches no books in the category
  - When: MiniSearch returns empty results
  - Then: "Không tìm thấy kết quả" message is shown

- [ ] **AC6 — Search state resets on navigation**
  - Given: User has typed a query on a category page
  - When: User navigates away (e.g. back to LibraryPage) and then returns to the same category
  - Then: The search input is empty and VirtualBookList shows all books (component remount resets local state)

## Additional Context

### Dependencies

No new npm dependencies. All components and hooks (`useLibrarySearch`, `LibrarySearchBar`, `SearchResults`) already exist in `apps/reader/src/features/library/`. `@testing-library/user-event` is already a dev dependency.

### Testing Strategy

- **Unit tests** in `CategoryPage.test.tsx` — extend existing mock pattern (`vi.fn` for `useCatalogIndex`, `useOnlineStatus`, `useParams`). Five new `it` blocks covering: render, count visibility, filter, clear, no-results.
- **Manual verification**: Run `devbox run dev`, navigate to a category with many books, verify compact header and search filters correctly.
- **Lint + types**: Run `pnpm --filter reader lint` and `pnpm --filter reader test` — zero warnings, all tests pass.

### Notes

- **Pre-mortem risk**: `useLibrarySearch` calls `toSearchDocuments(books)` which maps `CatalogBook[]` to `SearchDocument[]`. Verify `getCategoryBySlug` returns `LibraryCategory` (with `books: CatalogBook[]`) — confirmed from `library.types.ts` that `LibraryCategory extends CatalogCategory` and has `books: CatalogBook[]`.
- **Debounce in tests**: `useLibrarySearch` debounces 250ms. Use `userEvent.setup()` with `vi.useFakeTimers()` or wait for debounce — however `userEvent.type` with real timers should work fine in Vitest's jsdom since `MiniSearch.search` is synchronous. If tests are flaky on debounce, wrap assertions in `await vi.runAllTimersAsync()`.
- **AC6 is not unit-tested** — navigation reset is implicit from React local state; no explicit test needed since it is guaranteed by React's component lifecycle.
