---
title: 'Discover Strip on Home Screen'
slug: 'discover-strip'
created: '2026-04-19'
status: 'completed'
stepsCompleted: [1, 2, 3, 4]
tech_stack:
  - 'React 18 + TypeScript (strict)'
  - 'Tailwind CSS v3 (CSS custom properties for theming)'
  - 'TanStack Query v5 (useCatalogIndex, staleTime: Infinity)'
  - 'Zustand (useActiveSource)'
  - 'React Router v7 (Link, toRead())'
  - 'Radix UI icons'
files_to_modify:
  - 'apps/reader/src/features/home/HomePage.tsx'
  - 'apps/reader/src/features/home/HomePage.test.tsx'
files_to_create:
  - 'apps/reader/src/features/home/DiscoverStrip.tsx'
  - 'apps/reader/src/features/home/DiscoverStrip.test.tsx'
code_patterns:
  - 'CatalogBook from @/shared/types/global.types'
  - 'useCatalogIndex(source) for catalog data — no new API calls'
  - 'useActiveSource() for current source'
  - 'resolveCoverUrl() + coverPlaceholderStyle from shared'
  - 'toRead(book.id) for navigation links'
  - 'CSS custom props: --color-surface, --color-border, --color-accent, --color-text, --color-text-muted'
  - 'min-h-[44px] touch targets, aria-label on interactive elements'
  - 'useState for coverError + coverLoaded pattern (same as SutraListCard + ContinueReadingCard)'
test_patterns:
  - 'Vitest + @testing-library/react'
  - 'MemoryRouter + QueryClientProvider wrapper'
  - 'vi.mock for useCatalogIndex'
  - 'data-testid attributes for targeted queries'
  - 'screen.getByRole, screen.getByLabelText, screen.getAllByRole'
---

# Tech-Spec: Discover Strip on Home Screen

**Created:** 2026-04-19

## Overview

### Problem Statement

The home screen currently shows only a "Continue Reading" card and two quick-action buttons (Library, Bookmarks). There is no discovery surface — users who haven't started a book, or who want to explore new titles, see an empty or static screen with no browsable content from the catalog.

### Solution

Add a **Discover Strip** section below the "Continue Reading" card (or at the top of the scrollable content when no "Continue Reading" card is shown). The strip renders 3–4 book cover tiles in a horizontal scroll row, seeded from the active source's already-loaded catalog (random selection, re-randomized per app session). Each tile is a tappable `Link` that navigates directly to the reader. The strip uses `useCatalogIndex` — the same hook already used for the Library — so no new network calls are required.

### Scope

**In Scope:**
- New `DiscoverStrip` component in `apps/reader/src/features/home/`
- Integrates into `HomePage.tsx` below `ContinueReadingCard`
- Shows 4 books from `useCatalogIndex(activeSource).data.books`, picked randomly at component mount (stable for the session — not re-randomized on re-renders)
- Each tile: 2:3 cover image, book title truncated, tappable → `toRead(book.id)`
- Cover image: same `resolveCoverUrl` + `coverPlaceholderStyle` pattern used in `SutraListCard` and `ContinueReadingCard`
- Works for both `vbeta` and `vnthuquan` sources (respects active source from `useActiveSource`)
- Section heading: "Khám Phá" (Vietnamese)
- Loading state: render 4 skeleton tiles while catalog loads
- Empty/error state: render nothing (no section heading, no strip) — catalog failure is handled upstream
- Unit tests for the new component and the integration into HomePage

**Out of Scope:**
- Personalization / recommendation algorithm
- Filtering by category or search
- "See all" / link to full library (can be added later)
- Saving or persisting the random selection across sessions
- Any new API endpoints or data fetching beyond `useCatalogIndex`

---

## Context for Development

### Codebase Patterns

1. **Cover image handling** — always `useState` for `coverError` and `coverLoaded`. Use `resolveCoverUrl(book.coverImageUrl)` from `@/shared/services/data.service`. Placeholder uses `coverPlaceholderStyle` from `@/shared/constants/cover`. Pattern is identical in both `ContinueReadingCard` and `SutraListCard`.

2. **Catalog data** — `useCatalogIndex(source: SourceId)` from `@/shared/hooks/useCatalogIndex` returns `{ data: CatalogIndex | undefined, isLoading, isError }` via TanStack Query. `CatalogIndex.books` is `CatalogBook[]`. No new hooks or data fetching needed.

3. **Active source** — `useActiveSource()` from `@/shared/stores/useActiveSource` returns `{ activeSource: SourceId }`. Always use this — never hardcode source.

4. **Navigation** — `toRead(book.id)` from `@/shared/constants/routes` produces `/read/:bookId`. Use `<Link>` from `react-router-dom`.

5. **Theming** — all colours are CSS custom properties: `var(--color-surface)`, `var(--color-border)`, `var(--color-accent)`, `var(--color-text)`, `var(--color-text-muted)`. No hardcoded hex colours except white (`#ffffff`) where used by existing patterns.

6. **Touch targets** — interactive elements must have `min-h-[44px]` or `min-w-[44px]` (44px minimum). Apply `aria-label` to every interactive element.

7. **Typography** — book titles use `fontFamily: 'Lora, serif'` (matches existing list cards). Body/UI text uses the default sans-serif stack.

8. **Horizontal scroll pattern** — use `overflow-x-auto` with `flex flex-row gap-3` inside. Hide scrollbar visually with Tailwind's `scrollbar-hide` if available, or a minimal CSS approach. Do not use a grid — it must scroll horizontally on mobile.

9. **Random selection** — use `useMemo` with an empty dependency array (`[]`) to pick `N` books once on mount and never re-randomise until the component unmounts. Shuffle with Fisher-Yates or `Array.from(books).sort(() => Math.random() - 0.5)`.

10. **Component location** — feature components live in `src/features/<feature>/`. New file: `DiscoverStrip.tsx` alongside `HomePage.tsx`.

11. **Export style** — named export for sub-components (`export function DiscoverStrip`), default export for page components only.

12. **Tests** — Vitest + Testing Library. Tests live colocated (`DiscoverStrip.test.tsx`). Always wrap with `<MemoryRouter>` + `<QueryClientProvider>`. Mock `useCatalogIndex` with `vi.mock`. Use `data-testid` on the strip container for easy targeting.

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `apps/reader/src/features/home/HomePage.tsx` | Integration point — add `<DiscoverStrip />` here |
| `apps/reader/src/features/home/HomePage.test.tsx` | Add smoke tests verifying strip renders |
| `apps/reader/src/features/library/SutraListCard.tsx` | Cover image + placeholder pattern to replicate |
| `apps/reader/src/shared/hooks/useCatalogIndex.ts` | Hook for catalog data |
| `apps/reader/src/shared/stores/useActiveSource.ts` | Active source Zustand store |
| `apps/reader/src/shared/constants/cover.ts` | `coverPlaceholderStyle` |
| `apps/reader/src/shared/services/data.service.ts` | `resolveCoverUrl()` |
| `apps/reader/src/shared/constants/routes.ts` | `toRead()` |
| `apps/reader/src/shared/types/global.types.ts` | `CatalogBook`, `CatalogIndex` types |
| `apps/reader/src/shared/constants/sources.ts` | `SourceId` type |

### Technical Decisions

- **N = 4 books** shown in the strip (fits comfortably on a 375px viewport with ~90px-wide tiles + gaps; the last tile is intentionally partially visible to signal scrollability).
- **Random selection stabilised with `useMemo([], [])`** — picks once on mount, stable during re-renders (e.g. catalog re-validation in background). Avoids jarring re-shuffle while user is looking at the strip.
- **Skeleton tiles** while `isLoading` — show 4 placeholder tiles with the same dimensions and `coverPlaceholderStyle` background. No spinner. Matches the existing skeleton-free loading approach on the Library page.
- **No section rendered on error or empty catalog** — `if (!books.length) return null`. Error handling is the responsibility of `useCatalogIndex` upstream; the strip simply hides itself gracefully.
- **Source change** — when `activeSource` changes, `useCatalogIndex` returns a new query result. The strip re-renders with the new catalog's books. `useMemo` re-runs because the books array reference changes.
- **Tile width** — fixed `w-[88px]` (2:3 ratio → height ~132px). Narrow enough to show ~3.5 tiles on a 375px screen, signalling scroll.
- **No `snap` scrolling** — keep it simple; snap can be added later.

---

## Implementation Plan

### Tasks

- [x] **Task 1: Create `DiscoverStrip` component**
  - File: `apps/reader/src/features/home/DiscoverStrip.tsx`
  - Action: Create new file with the following structure:
    - Import `useMemo`, `useState` from `react`
    - Import `Link` from `react-router-dom`
    - Import `useCatalogIndex` from `@/shared/hooks/useCatalogIndex`
    - Import `useActiveSource` from `@/shared/stores/useActiveSource`
    - Import `resolveCoverUrl` from `@/shared/services/data.service`
    - Import `coverPlaceholderStyle` from `@/shared/constants/cover`
    - Import `toRead` from `@/shared/constants/routes`
    - Import `CatalogBook` type from `@/shared/types/global.types`
    - Define `DISCOVER_COUNT = 4`
    - Implement `BookCoverTile({ book }: { book: CatalogBook })` — named sub-component (not exported):
      - `useState` for `coverError` and `coverLoaded`
      - `resolveCoverUrl(book.coverImageUrl)` → `coverUrl`
      - Render: `<Link to={toRead(book.id)} aria-label={\`Đọc \${book.title}\`} className="flex-none w-[88px] ...">`
        - Cover image div: `w-full` with `aspectRatio: '2/3'`, `overflow-hidden rounded`, `relative`
        - Image with `onLoad`/`onError`, placeholder fallback — same pattern as `SutraListCard`
        - Title: `<p>` with `fontFamily: 'Lora, serif'`, `text-xs`, `line-clamp-2 mt-1`, `color: 'var(--color-text)'`
    - Implement `SkeletonTile` — named sub-component (not exported):
      - Same `w-[88px]` container
      - `div` with `aspectRatio: '2/3'`, `coverPlaceholderStyle`, `rounded`, `animate-pulse`
      - Short text-line placeholder below
    - Implement exported `DiscoverStrip()`:
      - `const { activeSource } = useActiveSource()`
      - `const { data, isLoading } = useCatalogIndex(activeSource)`
      - `const picks = useMemo(() => { ... }, [data?.books])` — Fisher-Yates shuffle on `data?.books ?? []`, slice to `DISCOVER_COUNT`
      - If `isLoading`: render section with heading + 4 `<SkeletonTile />`
      - If `!isLoading && picks.length === 0`: `return null`
      - Otherwise: render `<section aria-label="Khám phá">` with heading `"Khám Phá"` + horizontal scroll `<div className="flex flex-row gap-3 overflow-x-auto pb-2">` containing `picks.map(book => <BookCoverTile key={book.id} book={book} />)`
  - Notes:
    - `data-testid="discover-strip"` on the outer `<section>`
    - `data-testid="discover-strip-skeleton"` on the skeleton container `<div>`
    - Heading style matches existing section headings in `HomePage.tsx`: `text-lg font-semibold mb-4`, `color: 'var(--color-text)'`

- [x] **Task 2: Write tests for `DiscoverStrip`**
  - File: `apps/reader/src/features/home/DiscoverStrip.test.tsx`
  - Action: Create test file covering:
    - Mock `useCatalogIndex` with `vi.mock('@/shared/hooks/useCatalogIndex', ...)`
    - Mock `useActiveSource` to return `{ activeSource: 'vbeta' }`
    - Helper `renderStrip()`: wraps in `<MemoryRouter>` + `<QueryClientProvider>`
    - Test: "renders 4 book cover links when catalog has books" — provide `books` array of 6+, expect 4 links with `aria-label` matching `Đọc <title>`
    - Test: "renders skeleton tiles while loading" — mock `isLoading: true`, expect `data-testid="discover-strip-skeleton"` in DOM, no links
    - Test: "renders nothing when catalog is empty" — mock `data: { books: [], categories: [] }`, `isLoading: false`, expect `queryByTestId('discover-strip')` to be `null`
    - Test: "each tile links to the correct book route" — verify `href` attribute equals `/read/<bookId>` for each rendered tile
    - Test: "works with vnthuquan source" — mock `useActiveSource` returning `vnthuquan`, verify `useCatalogIndex` is called with `'vnthuquan'`
  - Notes:
    - Use `vi.mock` at top of file, not inside `beforeEach`
    - `vi.mock('@/shared/stores/useActiveSource', ...)` must also be mocked since it uses `zustand/persist`

- [x] **Task 3: Integrate `DiscoverStrip` into `HomePage`**
  - File: `apps/reader/src/features/home/HomePage.tsx`
  - Action:
    - Add import: `import { DiscoverStrip } from '@/features/home/DiscoverStrip'`
    - Inside the `<div className="px-6">` content area, add `<DiscoverStrip />` immediately after `<ContinueReadingCard />`
    - Position: between `<ContinueReadingCard />` and the quick-actions `<section>`

- [x] **Task 4: Add `HomePage` integration smoke tests for the strip**
  - File: `apps/reader/src/features/home/HomePage.test.tsx`
  - Action: Add 2 new tests to the existing `describe('HomePage', ...)` block:
    - Mock `useCatalogIndex` (import `vi` from vitest, mock module at top of file)
    - Test: "renders Discover Strip section when catalog has books" — mock catalog with 4+ books, expect `screen.getByLabelText('Khám phá')` to be in document
    - Test: "does not render Discover Strip when catalog is loading" — mock `isLoading: true`, expect `screen.queryByLabelText('Khám phá')` not to show book links (skeleton shown instead)
  - Notes:
    - The existing `renderHomePage` helper already provides the correct wrapper — reuse it
    - Add the `vi.mock` for `useCatalogIndex` at the top of `HomePage.test.tsx`, before existing tests (ensure it doesn't break existing tests by defaulting mock to `isLoading: false, data: { books: [], categories: [] }` in a `beforeEach`)

### Acceptance Criteria

- [x] **AC 1:** Given the catalog has loaded and contains at least 1 book, when the user views the Home screen, then a "Khám Phá" section is visible below the "Continue Reading" card (or at the top of content if no last-read book), showing exactly 4 book cover tiles (or fewer if the catalog has fewer than 4 books).

- [x] **AC 2:** Given the catalog is still loading, when the user views the Home screen, then 4 skeleton placeholder tiles are shown in place of book covers, with no book titles or links rendered.

- [x] **AC 3:** Given the catalog has loaded but contains 0 books, when the user views the Home screen, then the "Khám Phá" section is not rendered at all (no heading, no tiles).

- [x] **AC 4:** Given the Discover Strip is visible, when the user taps any book cover tile, then the app navigates to `/read/<bookId>` for that book.

- [x] **AC 5:** Given the active source is `vbeta`, when the Home screen renders, then the Discover Strip shows books from the `vbeta` catalog. Given the active source is switched to `vnthuquan`, then the Discover Strip shows books from the `vnthuquan` catalog.

- [x] **AC 6:** Given a book cover tile has no `coverImageUrl` (null) or the image fails to load, when the tile is rendered, then the gradient placeholder (`coverPlaceholderStyle`) is shown instead of a broken image.

- [x] **AC 7:** Given the Discover Strip has more tiles than fit on screen, when the user swipes horizontally, then the strip scrolls to reveal additional tiles.

- [x] **AC 8:** Given the Home screen is rendered, when the 4 books in the strip are selected, then the same 4 books remain displayed during re-renders within the same session (random selection is stable for the component lifetime).

---

## Additional Context

### Dependencies

- No new npm packages required.
- `useCatalogIndex` is already used by `LibraryPage` — the query result is already cached by TanStack Query at `staleTime: Infinity`, so opening the Home screen after visiting the Library costs zero network requests for the strip.
- The strip relies on the catalog already being loaded. If the user opens the app for the first time and goes straight to Home (catalog not yet cached), `isLoading: true` will be `true` briefly and the skeleton state handles this gracefully.

### Testing Strategy

**Unit tests** (`DiscoverStrip.test.tsx`):
- Mock `useCatalogIndex` and `useActiveSource`
- Cover: loading state, populated state (4 books rendered), empty state (nothing rendered), correct hrefs, source switching

**Integration smoke tests** (`HomePage.test.tsx`):
- Add mocks for `useCatalogIndex` without breaking existing tests
- Verify the strip section appears/disappears appropriately in context of the full Home page

**Manual testing checklist:**
1. Start app on Home screen — verify Discover Strip renders with 4 books from active source
2. Switch source (Library → source pill) → return to Home → verify strip books change
3. Tap a book tile → verify navigation to reader
4. Cover image failure: use DevTools to block image requests → verify gradient placeholder appears
5. Refresh app — verify books may differ (random re-pick on new mount)
6. On narrow viewport (375px): verify horizontal scrollability, 3.5 tiles visible at once

## Review Notes
- Adversarial review completed
- Findings: 12 total, 12 fixed, 0 skipped
- Resolution approach: auto-fix
- Key fixes: Fisher-Yates shuffle, aria-hidden on skeletons, min-h-[44px] touch target, explicit isError guard, role="list"/"listitem", scrollbar hiding, overflow-hidden on line-clamp, test factory-mock pattern aligned with codebase standard

### Notes

- **Future enhancement**: A "See all" link at the end of the strip (navigating to `/library`) could be added without changing the component's data layer.
- **Re-randomization**: Currently re-picks when `data?.books` reference changes (e.g., background catalog re-fetch after focus). This is acceptable — the user will rarely notice a catalog background refresh.
- **Accessibility**: The horizontal scroll container should have `role="list"` and each tile `role="listitem"` to aid screen reader navigation, or alternatively rely on `<Link>` semantics with clear `aria-label`. The chosen approach (Link with aria-label) is simpler and consistent with the existing `SutraListCard` pattern.
- **ESLint**: The project runs ESLint with `--max-warnings 0`. Ensure no unused imports, no `any` types, and `verbatimModuleSyntax` compliance (`import type` for type-only imports).
