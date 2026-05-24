---
title: 'Library page perf: eliminate render bottleneck on navigation'
type: 'bugfix'
created: '2026-05-24'
status: 'done'
baseline_commit: 'f8a2ecd123b8541823067acbd17c6bb7470201f1'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Navigating to LibraryPage or CategoryPage still takes 5–10 s even after catalog preload, because two CPU-intensive operations block the main thread synchronously during the first render: (1) `MiniSearch.addAll(5 000+ books)` in `useLibrarySearch` and (2) `buildLibraryCategories` / `getCategoryBySlug` doing an O(N×M) `localeCompare` sort across all books before any JSX is returned.

**Approach:** Eliminate eager MiniSearch index building on LibraryPage by deferring it to the moment the user focuses the search bar; replace `buildLibraryCategories` (sorts all books) with a cheap `buildLibraryCategoryHeaders` that only sorts the ~20 category records; fix `getCategoryBySlug` to do a direct lookup + single-category sort instead of rebuilding all categories.

## Boundaries & Constraints

**Always:**
- `CategoryGrid` must accept `CatalogCategory[]` (no books needed — it only renders `slug`, `displayName`, `count`).
- Lazy search on LibraryPage: pass `[]` to `useLibrarySearch` until `searchEnabled` is `true`; flip `searchEnabled` via the search bar's `onFocus`.
- `getCategoryBySlug` uses a module-level cached `Intl.Collator('vi')` — create the collator once, not per call.
- Storage, StorageService, query key, and data service rules from project-context.md remain in force.
- Existing `isLoading` skeleton behavior on LibraryPage and CategoryPage must not change.

**Ask First:**
- If a visible "search loading" indicator is needed while MiniSearch builds after focus — ask before adding UI.

**Never:**
- Do not add a Web Worker; do not use `import … from 'localforage'` directly.
- Do not change `staleTime` / `gcTime` on the global `QueryClient`.
- Do not remove the existing skeleton loading states.
- Do not change `StaticJsonDataService.getCatalog`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| User navigates to LibraryPage (catalog cached) | `useCatalogIndex` returns data instantly, `searchEnabled = false` | Page renders immediately; categories visible; MiniSearch NOT built yet | — |
| User focuses search bar on LibraryPage | `searchEnabled` flips to `true` | `useLibrarySearch` receives all books; MiniSearch builds; search works | — |
| User navigates to CategoryPage (catalog cached) | `getCategoryBySlug` does direct find + single-category sort | CategoryPage renders fast; VirtualBookList shows books | — |
| `catalog.categories` is empty | `buildLibraryCategoryHeaders` called with empty array | Returns `[]`; CategoryGrid renders empty section | — |

</frozen-after-approval>

## Code Map

- `apps/reader/src/features/library/library.utils.ts` -- add `buildLibraryCategoryHeaders`, fix `getCategoryBySlug`, add cached collator, remove `buildLibraryCategories` + `sortBooksByTitle`
- `apps/reader/src/features/library/LibraryPage.tsx` -- use `buildLibraryCategoryHeaders`; lazy search (`searchEnabled` state + `onFocus`)
- `apps/reader/src/features/library/CategoryGrid.tsx` -- change `categories` prop from `LibraryCategory[]` to `CatalogCategory[]`
- `apps/reader/src/features/library/LibrarySearchBar.tsx` -- add optional `onFocus` prop
- `apps/reader/src/features/library/LibrarySearchHub.tsx` -- update `categories` prop type to `CatalogCategory[]` to stay consistent with CategoryGrid
- `apps/reader/src/features/library/LibrarySearchHub.test.tsx` -- update fixture type if needed

## Tasks & Acceptance

**Execution:**
- [x] `apps/reader/src/features/library/library.utils.ts` -- add `const bookCollator = new Intl.Collator('vi')` at module level; add `buildLibraryCategoryHeaders(catalog: CatalogIndex): CatalogCategory[]` (sorts `catalog.categories` by `displayName` using `bookCollator`); rewrite `getCategoryBySlug` to `catalog.categories.find(...)` + `catalog.books.filter(...).sort(bookCollator.compare)`; delete `buildLibraryCategories` and `sortBooksByTitle`
- [x] `apps/reader/src/features/library/CategoryGrid.tsx` -- change `categories: LibraryCategory[]` to `categories: CatalogCategory[]` in `CategoryGridProps`; update import (drop `LibraryCategory`, add `CatalogCategory` from `@/shared/types/global.types`)
- [x] `apps/reader/src/features/library/LibrarySearchBar.tsx` -- add optional `onFocus?: () => void` to `LibrarySearchBarProps`; wire to `<input onFocus={onFocus}>`
- [x] `apps/reader/src/features/library/LibraryPage.tsx` -- add `const [searchEnabled, setSearchEnabled] = useState(false)`; replace `buildLibraryCategories` import+call with `buildLibraryCategoryHeaders`; pass `searchEnabled ? (catalogQuery.data?.books ?? []) : []` to `useLibrarySearch`; pass `onFocus={() => setSearchEnabled(true)}` to `LibrarySearchBar`
- [x] `apps/reader/src/features/library/LibrarySearchHub.tsx` -- change `categories: LibraryCategory[]` to `categories: CatalogCategory[]`; fix imports

**Acceptance Criteria:**
- Given the catalog is preloaded in React Query cache, when the user navigates to LibraryPage, then the page and category grid render without any skeleton flash or visible delay.
- Given the catalog is preloaded, when the user navigates to a CategoryPage, then the book list renders without a multi-second freeze.
- Given the user is on LibraryPage and has NOT touched the search bar, then the MiniSearch index has NOT been built (no expensive computation on mount).
- Given the user focuses the search bar on LibraryPage, then search becomes functional (can type and receive results).
- Given the existing `isLoading` branch is true, then the skeleton loading state still renders correctly.

## Design Notes

**Why `buildLibraryCategoryHeaders` instead of modifying `buildLibraryCategories`:**
`CategoryGrid` never uses the `books` field — only `slug`, `displayName`, `count`. The O(N×M) sort in `buildLibraryCategories` existed to populate `LibraryCategory.books` which LibraryPage never consumed. A separate function with the correct output type (`CatalogCategory[]`) makes the intent explicit and removes the dead work.

**Why lazy search on focus rather than `useEffect` / `startTransition`:**
`startTransition` only defers the state update priority — the `MiniSearch.addAll(5 000+)` call inside `useMemo` is still synchronous and will block the thread in the same frame. Lazy-on-focus is the only safe option that guarantees zero blocking on navigation.

## Verification

**Commands:**
- `cd apps/reader && pnpm test` -- expected: all tests pass, no regressions
- `cd apps/reader && pnpm lint` -- expected: zero warnings

**Manual checks:**
- Navigate to Library after second load (catalog in RQ cache): categories must appear instantly with no freeze.
- Navigate to a CategoryPage from Library: books must appear quickly (< 500 ms).
- Focus the search bar on LibraryPage: search works after brief build delay; typing returns results.

## Suggested Review Order

**Core utility changes — root of all perf gains**

- Module-level collator + new `buildLibraryCategoryHeaders` replaces O(N×M) sort
  [`library.utils.ts:4`](../../apps/reader/src/features/library/library.utils.ts#L4)

- `getCategoryBySlug` rewritten: direct `find` + single-category sort vs. full rebuild
  [`library.utils.ts:33`](../../apps/reader/src/features/library/library.utils.ts#L33)

**LibraryPage lazy search**

- `searchEnabled` state gate — MiniSearch not built until focus; resets on source switch
  [`LibraryPage.tsx:25`](../../apps/reader/src/features/library/LibraryPage.tsx#L25)

- Books passed to `useLibrarySearch` only when `searchEnabled`
  [`LibraryPage.tsx:27`](../../apps/reader/src/features/library/LibraryPage.tsx#L27)

- `onFocus` + `onSourceChange` wiring
  [`LibraryPage.tsx:44`](../../apps/reader/src/features/library/LibraryPage.tsx#L44)

**CategoryPage lazy search + memoization**

- `selectedCategory` wrapped in `useMemo` — stable reference prevents MiniSearch rebuild on every render
  [`CategoryPage.tsx:108`](../../apps/reader/src/features/library/CategoryPage.tsx#L108)

- Same lazy search gate as LibraryPage; `onFocus` wired to SearchBar
  [`CategoryPage.tsx:114`](../../apps/reader/src/features/library/CategoryPage.tsx#L114)

**Type narrowing**

- `CategoryGrid` prop narrowed to `CatalogCategory[]` — books field was never used
  [`CategoryGrid.tsx:7`](../../apps/reader/src/features/library/CategoryGrid.tsx#L7)

- `LibrarySearchBar` gets optional `onFocus` prop
  [`LibrarySearchBar.tsx:7`](../../apps/reader/src/features/library/LibrarySearchBar.tsx#L7)
