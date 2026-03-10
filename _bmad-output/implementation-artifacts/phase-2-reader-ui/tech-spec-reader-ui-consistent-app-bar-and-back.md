---
title: 'Reader UI: Consistent App Bar and Context-Aware Back'
slug: 'reader-ui-consistent-app-bar-and-back'
created: '2026-03-09'
status: 'Implementation Complete'
stepsCompleted: [1, 2, 3, 4]
tech_stack: ['TypeScript', 'React 18', 'Vite', 'Tailwind 3', 'react-router-dom 7', 'Zustand', 'Radix UI icons', 'path alias @/*']
files_to_modify: ['apps/reader/src/shared/components/AppBar.tsx (new)', 'apps/reader/src/features/reader/ChromelessLayout.tsx', 'apps/reader/src/features/home/HomePage.tsx', 'apps/reader/src/features/library/LibraryPage.tsx', 'apps/reader/src/features/bookmarks/BookmarksPage.tsx', 'apps/reader/src/features/settings/SettingsPage.tsx', 'apps/reader/src/features/library/CategoryPage.tsx']
code_patterns: ['Shared UI in shared/components (e.g. BottomNav); ROUTES/toRead from shared/constants/routes; CSS vars (--color-surface, --color-border, --color-text, --color-accent) for theming; data-testid for test hooks; PascalCase components, default export for page components']
test_patterns: ['Vitest 4.x', '@testing-library/react 16.x', 'colocated *.test.tsx', 'MemoryRouter for routing', 'data-testid', 'vi.mock for stores/hooks', 'test-setup.ts (jsdom, ResizeObserver mock)']
---

# Tech-Spec: Reader UI: Consistent App Bar and Context-Aware Back

**Created:** 2026-03-09

## Overview

### Problem Statement

1. **App bar inconsistency:** The reader app's top "app bar" is not consistent between the main screens (Home, Library, Bookmarks, Settings). Each screen uses its own inline header with different padding (`pt-4` vs `pt-8` vs `p-6`), title sizes (`text-xl` vs `text-2xl`), and structure (Library uses sticky + backdrop-blur and icons; Bookmarks and Settings are just a title in a div; Home has icon + title + right icon). There is no shared component, so the experience feels fragmented.

2. **Reader back always goes to Library:** The reader's top bar shows a back link that is hardcoded to `ROUTES.LIBRARY` in `ChromelessLayout.tsx`. So when a user opens a book from Home or from Bookmarks, tapping "← Thư viện" still sends them to the Library base instead of back to the screen they came from.

### Solution

1. **App bar:** Introduce a shared top bar (or shell) component used by Home, Library, Bookmarks, and Settings so layout, padding, typography, and optional slots (back, title, right action) are consistent. Category page can reuse the same component with a back link to Library.

2. **Reader back:** Make the reader's back control return the user to the previous screen. Prefer using `navigate(-1)` so back respects actual history; alternatively pass a referrer via `location.state` when navigating to `/read/:bookId` and use it for the back link. The label can stay "Thư viện" when coming from library, or reflect the source (e.g. "Trang Chủ", "Đánh Dấu") if we pass referrer.

### Scope

**In Scope:**
- Consistent app bar (shared component or unified layout) on Home, Library, Bookmarks, Settings.
- Reader back button/link returns to the screen of origin (home, library, or bookmarks) instead of always going to library base.
- Category page can adopt the shared app bar with back-to-library where applicable.

**Out of Scope:**
- Changing reader chrome auto-hide, center-tap, or bottom bar behavior.
- Changing bottom nav or routing structure beyond how we pass referrer/back target.

## Context for Development

### Codebase Patterns

- **Routing:** `shared/constants/routes.ts` defines `ROUTES`, `toRead(bookId)`. Lazy-loaded pages in `App.tsx`; reader route hides bottom nav via `pathname.startsWith('/read/')`. All reader entry points use `<Link to={toRead(bookId)}>` (HomePage ContinueReadingCard, BookmarkCard, SutraListCard, SearchResults); BookmarkCard already passes `state={{ page: bookmark.page }}`.
- **Reader chrome:** `ChromelessLayout` (lines 70–98) renders the reader top bar: fixed bar with `<Link to={ROUTES.LIBRARY}>← Thư viện</Link>` and centered book title. Replacing this with a back control that calls `navigate(-1)` (with fallback to `navigate(ROUTES.LIBRARY)` when history length is 1, e.g. direct URL) requires `useNavigate` and optionally `useLocation`; no changes to entry-point components needed.
- **Headers today:** Home: `header` with icon (SunIcon) + h1 "Trang Chủ" + right icon (BellIcon), `px-6 pb-24 pt-8`, `mb-8`, `text-2xl`. Library: loading state `header` with HamburgerMenuIcon + "Thư Viện" + PersonIcon, `px-4 pt-4`, `mb-6`, `text-xl`; main state `header` sticky with `border-b px-4 pb-3 pt-4 backdrop-blur` and LibrarySearchHub below. Category: `header` with `Link to={ROUTES.LIBRARY}` (ArrowLeftIcon) + category title + count, `border-b px-4 pb-4 pt-4`, `text-xl`. Bookmarks: no `<header>`, just `h1` "Đánh Dấu" in div `px-6 pb-24 pt-8`, `text-2xl`, `mb-6`. Settings: no `<header>`, just `h1` "Cài Đặt" in div `p-6`, `text-2xl font-semibold`, Lora font. Shared component should support: optional left (back link or icon), title, optional right slot; consistent padding (e.g. `px-4 py-3` or `pt-4 pb-3`) and title size (e.g. `text-xl font-bold tracking-tight`); optional `sticky` for Library.
- **Shared components:** `BottomNav` lives in `shared/components/`, uses NavLink, ROUTES, Radix icons, CSS vars. New `AppBar` should live there and follow same patterns (ROUTES, CSS vars, aria-label where needed).
- **Project rules (project-context):** TypeScript strict, path alias `@/*` only; no raw localStorage/localforage (use StorageService); Vietnamese UI strings; Vitest + @testing-library/react, colocated `*.test.tsx`, `data-testid`, `vi.mock`.

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `apps/reader/src/App.tsx` | Shell, routes, bottom nav visibility |
| `apps/reader/src/shared/constants/routes.ts` | ROUTES, toRead() |
| `apps/reader/src/shared/components/BottomNav.tsx` | Pattern for shared nav component (ROUTES, CSS vars, Radix icons) |
| `apps/reader/src/features/reader/ChromelessLayout.tsx` | Reader top bar (lines 70–98): replace Link with navigate(-1) + fallback |
| `apps/reader/src/features/home/HomePage.tsx` | Home: replace header (lines 167–187) with AppBar; title "Trang Chủ", left icon, right icon |
| `apps/reader/src/features/library/LibraryPage.tsx` | Library: three branches (loading, error, main); replace each header with AppBar; main branch has sticky + LibrarySearchHub below |
| `apps/reader/src/features/library/CategoryPage.tsx` | Category: replace header (lines 72–86) with AppBar; backTo ROUTES.LIBRARY, title = category displayName |
| `apps/reader/src/features/bookmarks/BookmarksPage.tsx` | Bookmarks: replace h1 block with AppBar; title "Đánh Dấu" |
| `apps/reader/src/features/settings/SettingsPage.tsx` | Settings: replace h1 with AppBar; title "Cài Đặt" |
| `apps/reader/src/features/bookmarks/BookmarkCard.tsx` | Link to reader with state.page only; no change for back behavior |
| `apps/reader/src/features/reader/ChromelessLayout.test.tsx` | Tests chrome visibility, title, fixed position; no assertion on back href; add test for back triggering navigate(-1) or fallback |

### Technical Decisions

- **Reader back:** Use `useNavigate()` in ChromelessLayout. On back action: if `window.history.length > 1`, call `navigate(-1)`; else `navigate(ROUTES.LIBRARY)`. Keep label "← Thư viện" (no referrer-specific label in this iteration). Use a button or clickable element that runs this logic (not `<Link to={...}>`) so history is respected.
- **App bar:** New `AppBar` in `shared/components/AppBar.tsx`. Props: `title: string`; optional `backTo?: string` (route path); optional `leftIcon?: ReactNode` (e.g. Home icon); optional `rightSlot?: ReactNode`; optional `sticky?: boolean`; optional `children` below title row (for LibrarySearchHub). Consistent: `px-4 pt-4 pb-3`, border-bottom with `var(--color-border)`, background `var(--color-surface)` or `var(--color-background)`, title `text-xl font-bold tracking-tight`. When `backTo` is set, render `Link to={backTo}` with arrow + label (e.g. "Thư viện"); when `leftIcon` is set, render it; else no left slot. Library main state keeps sticky and passes SearchHub as children.

## Implementation Plan

### Tasks

- [x] **Task 1:** Create shared AppBar component
  - File: `apps/reader/src/shared/components/AppBar.tsx` (new)
  - Action: Implement `AppBar` with props: `title: string`; optional `backTo?: string`; optional `leftIcon?: ReactNode`; optional `rightSlot?: ReactNode`; optional `sticky?: boolean`; optional `children?: ReactNode` (rendered below the title row). Use consistent styles: `px-4 pt-4 pb-3`, border-bottom `var(--color-border)`, background `var(--color-surface)` or `var(--color-background)`, title `text-xl font-bold tracking-tight`. When `backTo` is set, render `Link to={backTo}` with arrow (←) and appropriate aria-label (e.g. "Quay lại thư viện"); when `leftIcon` is set, render it in a wrapper; else no left slot. Export as named export. Add `data-testid="app-bar"` on the root header element.
  - Notes: Follow BottomNav patterns: import ROUTES from `@/shared/constants/routes`, use CSS vars, Radix icons if needed. Use `<header>` with `role`/`aria-label` for accessibility.

- [x] **Task 2:** Reader back uses history (navigate -1) with fallback
  - File: `apps/reader/src/features/reader/ChromelessLayout.tsx`
  - Action: Replace the top-bar `<Link to={ROUTES.LIBRARY}>← Thư viện</Link>` (lines 83–90) with a back control that calls `useNavigate()`. On click: if `window.history.length > 1`, call `navigate(-1)`; else call `navigate(ROUTES.LIBRARY)`. Keep visible label "← Thư viện" and `aria-label="Về Thư viện"`. Use a `<button>` or clickable element with `type="button"` (and same styling as current link) so back respects browser history.
  - Notes: Keep existing ChromelessLayout props and chrome visibility logic unchanged. Ensure the control is still keyboard-accessible and respects `tabIndex` when chrome is hidden.

- [x] **Task 3:** HomePage uses AppBar
  - File: `apps/reader/src/features/home/HomePage.tsx`
  - Action: Replace the existing `<header>...</header>` (lines 167–187) with `<AppBar title="Trang Chủ" leftIcon={<SunIcon ... />} rightSlot={<...BellIcon />} />`. Keep the same icons (SunIcon, BellIcon) and wrapper divs for visual consistency. Preserve outer page container `className` (e.g. `px-6 pb-24 pt-8`); adjust if AppBar introduces its own top padding so page content spacing is consistent.
  - Notes: Import AppBar from `@/shared/components/AppBar`. If AppBar does not include page-level padding, keep `pt-8` on the container or align with other pages (see Task 4–6).

- [x] **Task 4:** LibraryPage uses AppBar in all branches
  - File: `apps/reader/src/features/library/LibraryPage.tsx`
  - Action: In loading state (lines 16–31): replace `<header>...</header>` with `<AppBar title="Thư Viện" leftIcon={<HamburgerMenuIcon ... />} rightSlot={<PersonIcon ... />} />`. In error state (lines 61–73): replace `<h1 className="mb-4 ...">Thư Viện</h1>` with `<AppBar title="Thư Viện" />` (no icons if current error UI has no header icons). In main state (lines 81–104): replace the sticky `<header>...</header>` with `<AppBar title="Thư Viện" sticky leftIcon={...} rightSlot={...} children={<LibrarySearchHub ... />} />` so the search hub remains below the title row. Preserve `LibrarySearchHub` props (`categories`, `books`, `contentClassName`).
  - Notes: Use `sticky top-0 z-20 backdrop-blur` and same background/border as in Technical Decisions when `sticky` is true. Ensure loading and error wrappers (e.g. `px-4 pb-24 pt-4`) stay consistent; AppBar may supply top padding so avoid double padding.

- [x] **Task 5:** BookmarksPage uses AppBar
  - File: `apps/reader/src/features/bookmarks/BookmarksPage.tsx`
  - Action: Replace the standalone `<h1 className="mb-6 text-2xl font-bold tracking-tight">Đánh Dấu</h1>` and its wrapper with `<AppBar title="Đánh Dấu" />`. Keep the rest of the page (empty state, list of BookmarkCards) and container `className="px-6 pb-24 pt-8"`; adjust top padding if AppBar provides it (e.g. use `pt-4` or match other pages).
  - Notes: No back link or icons on Bookmarks tab.

- [x] **Task 6:** SettingsPage uses AppBar
  - File: `apps/reader/src/features/settings/SettingsPage.tsx`
  - Action: Replace the standalone `<h1 className="text-2xl font-semibold" ...>Cài Đặt</h1>` with `<AppBar title="Cài Đặt" />`. Keep the rest of the page (sections, FontSizeControl, ThemeToggle, OfflineStorageInfo) and container `className="flex flex-col gap-8 p-6"`; add or adjust top padding so content is not cramped (e.g. ensure first section has spacing below AppBar).
  - Notes: Settings previously used Lora font for the title; AppBar will use the shared title style (Inter, text-xl). If design requires Lora for Settings only, add an optional `titleClassName` prop to AppBar later; otherwise keep consistent.

- [x] **Task 7:** CategoryPage uses AppBar with back
  - File: `apps/reader/src/features/library/CategoryPage.tsx`
  - Action: Replace the existing `<header>...</header>` (lines 72–86) with `<AppBar title={selectedCategory.displayName} backTo={ROUTES.LIBRARY} />`. Optionally render the count line ("X kinh sách") as AppBar `children` or directly below AppBar in the page. Preserve the back destination (ROUTES.LIBRARY) and aria-label "Quay lại thư viện" (handled by AppBar when `backTo` is set).
  - Notes: Ensure category title truncates or wraps appropriately in AppBar. Keep `space-y-3 px-4` for the book list below.

- [x] **Task 8:** Add and update tests
  - Files: `apps/reader/src/shared/components/AppBar.test.tsx` (new), `apps/reader/src/features/reader/ChromelessLayout.test.tsx`
  - Action: (1) Create `AppBar.test.tsx`: render AppBar with title only; with backTo; with leftIcon and rightSlot; with sticky; with children. Assert presence of title text, link when backTo set (href), and data-testid. (2) In ChromelessLayout.test.tsx: add a test that the back control triggers navigation—mock `useNavigate` and assert it is called with `-1` when history.length > 1, or with `ROUTES.LIBRARY` when history.length is 1 (or simulate direct open). Keep existing ChromelessLayout tests passing.
  - Notes: Use MemoryRouter where needed; for history length simulation, consider a test that mocks `window.history.length` or uses a router with initial entries to control stack.

### Acceptance Criteria

- [x] **AC 1:** Given the user is on Home, Library, Bookmarks, or Settings, when the page is shown, then the top bar uses the shared AppBar with consistent padding, title size (`text-xl font-bold`), and border/background styling.
- [x] **AC 2:** Given the user is on the reader screen after opening a book from Home (e.g. via Continue Reading), when they tap the back control "← Thư viện", then they return to Home (previous history entry).
- [x] **AC 3:** Given the user is on the reader screen after opening a book from Bookmarks, when they tap the back control, then they return to Bookmarks.
- [x] **AC 4:** Given the user is on the reader screen after opening a book from Library (or category), when they tap the back control, then they return to Library (or the category page they came from).
- [x] **AC 5:** Given the user opened the reader via direct URL or has only one history entry, when they tap the back control, then they navigate to the Library route (fallback).
- [x] **AC 6:** Given the user is on the Category page, when the page is shown, then the app bar shows a back link to Library and the category name as title; tapping back goes to Library.
- [x] **AC 7:** Given the user is on Library (main state), when they scroll, then the app bar remains sticky with the search hub below it (unchanged behavior).
- [x] **AC 8:** Given any main tab (Home, Library, Bookmarks, Settings), when comparing headers, then padding (e.g. px-4 pt-4 pb-3 for the bar), title typography, and presence of optional left/right slots are consistent; only content (title text, icons) differs.

## Additional Context

### Dependencies

- react-router-dom: `useNavigate`, `Link`, existing usage of `ROUTES` from `@/shared/constants/routes`. No new routes or API dependencies.
- No other features or tasks block this work. AppBar is a new shared component; pages and ChromelessLayout are the only consumers.

### Testing Strategy

- **Unit tests:** (1) AppBar: new `AppBar.test.tsx` covering title-only, backTo (link href and label), leftIcon, rightSlot, sticky class, children. (2) ChromelessLayout: extend existing tests to assert back behavior—mock `useNavigate`, render with MemoryRouter (or Router with initialEntries), trigger click on back control, expect `navigate(-1)` or `navigate(ROUTES.LIBRARY)` as appropriate. One test for "has history" and one for "no history" (fallback) if feasible.
- **Integration:** Run existing page tests (HomePage, LibraryPage, BookmarksPage, SettingsPage, CategoryPage) after replacing headers with AppBar; fix any assertions that target the old header structure (e.g. getByRole('heading', { name: 'Trang Chủ' }) may still pass if AppBar renders an h1 with the title).
- **Manual:** (1) Open app, go Home → open a book from Continue Reading → tap back: confirm return to Home. (2) Go Bookmarks → open a book → tap back: confirm return to Bookmarks. (3) Go Library → open a book → tap back: confirm return to Library. (4) Open reader via direct URL (e.g. /read/xyz) → tap back: confirm redirect to Library. (5) Compare app bar appearance on Home, Library, Bookmarks, Settings, and Category and confirm consistency.

### Notes

- **History length:** `window.history.length` in ChromelessLayout may be 1 when the app is opened in a new tab or via direct link; fallback to ROUTES.LIBRARY is required. In SPA with in-app navigations, history grows as user moves; ensure no reliance on a specific number beyond "> 1".
- **i18n:** Keep Vietnamese labels ("Trang Chủ", "Thư Viện", "Đánh Dấu", "Cài Đặt", "Về Thư viện", "Quay lại thư viện") consistent with existing locale; no new strings file changes unless adding a shared constant for back label.
- **Future:** Optional referrer-specific back label (e.g. "← Trang Chủ" when coming from home) can be added later by passing `state: { from: pathname }` from entry points and reading it in ChromelessLayout; out of scope for this spec.
