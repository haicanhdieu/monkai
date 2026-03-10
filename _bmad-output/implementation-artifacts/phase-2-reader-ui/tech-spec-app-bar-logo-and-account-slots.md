---
title: 'Standardize App Bar Slots: Logo Left, Account Right'
slug: 'app-bar-logo-and-account-slots'
created: '2026-03-10'
status: 'Implementation Complete'
stepsCompleted: [1, 2, 3, 4]
tech_stack: ['React 18', 'TypeScript', 'Vite 7', 'Tailwind 3', 'Radix UI icons', 'CSS variables', 'Vitest 4', '@testing-library/react 16']
files_to_modify:
  - 'apps/reader/src/features/home/HomePage.tsx'
  - 'apps/reader/src/features/library/LibraryPage.tsx'
  - 'apps/reader/src/features/bookmarks/BookmarksPage.tsx'
  - 'apps/reader/src/features/settings/SettingsPage.tsx'
code_patterns:
  - 'AppBar leftIcon/rightSlot props accept ReactNode; no API change needed'
  - 'Logo rendered as <img src="/icons/icon-192x192.svg"> in a span container (same h-8 w-8 shape as current hamburger slot)'
  - 'PersonIcon from @radix-ui/react-icons in rounded-full border span (Library pattern is the reference)'
  - 'Extract shared AppLogo JSX constant to avoid duplicating img markup across 4 pages'
  - 'LibraryPage has 3 render paths (loading, error, success) — logo replaces hamburger in all 3'
test_patterns:
  - 'Vitest describe/it; renderWithRouter(MemoryRouter); screen.getByTestId / getByRole'
  - 'No new test file needed — page changes are prop-value only; existing AppBar.test.tsx covers component behavior'
---

# Tech-Spec: Standardize App Bar Slots: Logo Left, Account Right

**Created:** 2026-03-10

## Overview

### Problem Statement

The app bar slot content is inconsistent across the four main pages:
- **Library**: `HamburgerMenuIcon` left + `PersonIcon` right — closest to target but wrong left icon
- **Home**: custom `SunIcon` accent circle left + `BellIcon` right — both wrong
- **Bookmarks**: no left icon, no right slot — missing both
- **Settings**: no left icon, no right slot — missing both

The previous spec (`tech-spec-consistent-app-bar-styling.md`) standardized the visual container (rounded top, periwinkle border, CSS vars). This spec completes the work by standardizing what lives inside that container.

### Solution

Replace the per-page ad-hoc left icons with the app logo (`/icons/icon-192x192.svg`) and ensure every main page has a `PersonIcon` account button on the right, matching the Library page layout as the reference. Extract a shared `AppLogo` inline element to keep the `<img>` markup DRY.

### Scope

**In Scope:**
- Replace `HamburgerMenuIcon` with app logo in `LibraryPage` (all 3 render paths: loading, error, success)
- Replace `SunIcon` circle with app logo, replace `BellIcon` with `PersonIcon` in `HomePage`
- Add app logo (left) + `PersonIcon` (right) to `BookmarksPage`
- Add app logo (left) + `PersonIcon` (right) to `SettingsPage`; remove `titleClassName="font-serif"` to match the uniform style
- Define a shared `AppLogo` element (inline constant or small component in a shared location) to DRY up the `<img>` across 4 pages

**Out of Scope:**
- `AppBar` component API changes
- `CategoryPage` (uses `backTo` back-nav — different surface, not a top-level page)
- Reader/chromeless layout pages
- Making the account button functional (navigation or modal — future work)
- Removing `titleClassName` from the `AppBar` API itself

## Context for Development

### Codebase Patterns

- **AppBar API** (`apps/reader/src/shared/components/AppBar.tsx`): `leftIcon` and `rightSlot` accept `ReactNode`. The component renders the left slot in a `shrink-0 items-center` div, then the `<h1>` title with `flex-1`, then the right slot. No changes to this file.
- **Library reference pattern** (the target for all pages):
  ```tsx
  leftIcon={
    <span className="flex h-8 w-8 items-center justify-center rounded-full">
      <HamburgerMenuIcon className="h-5 w-5" aria-hidden="true" />
    </span>
  }
  rightSlot={
    <span
      className="flex h-8 w-8 items-center justify-center rounded-full border"
      style={{ borderColor: 'var(--color-border)' }}
    >
      <PersonIcon className="h-4 w-4 text-[var(--color-accent)]" aria-hidden="true" />
    </span>
  }
  ```
- **App logo asset**: `/public/icons/icon-192x192.svg` — SVG with amber/orange Buddhist motif (`#C8883A` stroke, `#F5EDD6` fill). Rendered as `<img src="/icons/icon-192x192.svg" alt="" className="h-6 w-6 rounded" aria-hidden="true" />` inside the same `h-8 w-8` span container. Use `alt=""` since it's decorative (title already names the page).
- **AppLogo pattern**: Define once, use in all 4 pages:
  ```tsx
  const AppLogo = (
    <span className="flex h-8 w-8 items-center justify-center rounded-full">
      <img src="/icons/icon-192x192.svg" alt="" className="h-6 w-6 rounded" aria-hidden="true" />
    </span>
  )
  ```
  Can be a module-level const in each file OR extracted to a shared location like `apps/reader/src/shared/components/AppLogo.tsx`. Prefer a shared file for DRY.
- **PersonIcon** is already imported in `LibraryPage`; needs to be added to `HomePage`, `BookmarksPage`, `SettingsPage` from `@radix-ui/react-icons`.
- **LibraryPage render paths**: (1) loading skeleton — has `leftIcon`+`rightSlot` on `<AppBar>`; (2) error state — bare `<AppBar title="Thư Viện" />` (no slots); (3) success state — has `leftIcon`+`rightSlot`. All three need the logo/PersonIcon treatment.
- **TypeScript strict**: `noUnusedLocals`, `noUnusedParameters` — remove `HamburgerMenuIcon`, `SunIcon`, `BellIcon` imports when no longer used or ESLint will fail.
- **Project context**: Path alias `@/*` → `./src/*`; zero ESLint warnings required (`eslint --max-warnings 0`); Vietnamese UI strings; Tailwind 3; Radix UI.

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `apps/reader/src/shared/components/AppBar.tsx` | Reference API — no changes |
| `apps/reader/src/shared/components/AppBar.test.tsx` | Reference test patterns |
| `apps/reader/src/features/library/LibraryPage.tsx` | Target reference pattern + file to update (swap hamburger → logo) |
| `apps/reader/src/features/home/HomePage.tsx` | Swap SunIcon → logo, BellIcon → PersonIcon; remove unused imports |
| `apps/reader/src/features/bookmarks/BookmarksPage.tsx` | Add logo + PersonIcon; remove unused imports if any |
| `apps/reader/src/features/settings/SettingsPage.tsx` | Add logo + PersonIcon; remove titleClassName prop |
| `apps/reader/public/icons/icon-192x192.svg` | Logo asset — reference only, no changes |

### Technical Decisions

- **Shared `AppLogo` component**: Create `apps/reader/src/shared/components/AppLogo.tsx` exporting a named `AppLogo` component (not `AppLogoConst` variable) so it's importable and testable consistently. It renders the `<span>` + `<img>` markup. This is the single source of truth for logo markup.
- **`alt=""`** on the `<img>`: The logo is purely decorative in the app bar — the page title `<h1>` already conveys context. Empty alt with `aria-hidden="true"` on the `<img>` is correct.
- **`titleClassName` on SettingsPage**: Remove `titleClassName="font-serif"` to achieve visual uniformity. The `AppBar` API retains the prop for other potential uses.
- **Account button non-functional**: The `PersonIcon` button is a `<span>` (not `<button>` or `<Link>`) for now, consistent with Library's current implementation. No interaction added.
- **LibraryPage error state**: Currently `<AppBar title="Thư Viện" />` with no slots. Add logo + PersonIcon for consistency, same as other render paths.

## Implementation Plan

### Tasks

- [x] Task 1: Create shared `AppLogo` component
  - File: `apps/reader/src/shared/components/AppLogo.tsx`
  - Action: Create new file exporting `export function AppLogo()` that returns:
    ```tsx
    <span className="flex h-8 w-8 items-center justify-center rounded-full">
      <img src="/icons/icon-192x192.svg" alt="" className="h-6 w-6 rounded" aria-hidden="true" />
    </span>
    ```
  - Notes: No props needed. Named export (not default) per project convention for non-page components.

- [x] Task 2: Update `LibraryPage` — swap hamburger icon for logo in all render paths
  - File: `apps/reader/src/features/library/LibraryPage.tsx`
  - Action:
    1. Remove `HamburgerMenuIcon` from the `@radix-ui/react-icons` import (keep `PersonIcon`).
    2. Add import: `import { AppLogo } from '@/shared/components/AppLogo'`
    3. In the **loading state** `<AppBar>`: replace the `leftIcon` span containing `HamburgerMenuIcon` with `<AppLogo />`.
    4. In the **error state** `<AppBar title="Thư Viện" />`: add `leftIcon={<AppLogo />}` and `rightSlot={<span className="flex h-8 w-8 items-center justify-center rounded-full border" style={{ borderColor: 'var(--color-border)' }}><PersonIcon className="h-4 w-4 text-[var(--color-accent)]" aria-hidden="true" /></span>}`.
    5. In the **success state** `<AppBar>`: replace the `leftIcon` span containing `HamburgerMenuIcon` with `<AppLogo />`. Keep `rightSlot` with `PersonIcon` unchanged.
  - Notes: `PersonIcon` import already present — do not remove it.

- [x] Task 3: Update `HomePage` — swap SunIcon/BellIcon for logo/PersonIcon
  - File: `apps/reader/src/features/home/HomePage.tsx`
  - Action:
    1. Remove `SunIcon` and `BellIcon` from the `@radix-ui/react-icons` import (keep other imports if still used — `ReaderIcon`, `BookmarkIcon`, `ChevronRightIcon`).
    2. Add import: `import { PersonIcon } from '@radix-ui/react-icons'`
    3. Add import: `import { AppLogo } from '@/shared/components/AppLogo'`
    4. In `<AppBar>` inside `HomePage`: replace `leftIcon` (the accent-bg `SunIcon` div) with `<AppLogo />`. Replace `rightSlot` (the `BellIcon` circle) with the standard PersonIcon span:
       ```tsx
       <span
         className="flex h-8 w-8 items-center justify-center rounded-full border"
         style={{ borderColor: 'var(--color-border)' }}
       >
         <PersonIcon className="h-4 w-4 text-[var(--color-accent)]" aria-hidden="true" />
       </span>
       ```
  - Notes: `ReaderIcon`, `BookmarkIcon`, `ChevronRightIcon` are used in `quickActions` and `ContinueReadingCard` — do NOT remove those.

- [x] Task 4: Update `BookmarksPage` — add logo and PersonIcon
  - File: `apps/reader/src/features/bookmarks/BookmarksPage.tsx`
  - Action:
    1. Add import: `import { PersonIcon } from '@radix-ui/react-icons'`
    2. Add import: `import { AppLogo } from '@/shared/components/AppLogo'`
    3. Update `<AppBar title="Đánh Dấu" />` to:
       ```tsx
       <AppBar
         title="Đánh Dấu"
         leftIcon={<AppLogo />}
         rightSlot={
           <span
             className="flex h-8 w-8 items-center justify-center rounded-full border"
             style={{ borderColor: 'var(--color-border)' }}
           >
             <PersonIcon className="h-4 w-4 text-[var(--color-accent)]" aria-hidden="true" />
           </span>
         }
       />
       ```

- [x] Task 5: Update `SettingsPage` — add logo and PersonIcon, remove titleClassName
  - File: `apps/reader/src/features/settings/SettingsPage.tsx`
  - Action:
    1. Add import: `import { PersonIcon } from '@radix-ui/react-icons'`
    2. Add import: `import { AppLogo } from '@/shared/components/AppLogo'`
    3. Update `<AppBar title="Cài Đặt" titleClassName="font-serif" />` to:
       ```tsx
       <AppBar
         title="Cài Đặt"
         leftIcon={<AppLogo />}
         rightSlot={
           <span
             className="flex h-8 w-8 items-center justify-center rounded-full border"
             style={{ borderColor: 'var(--color-border)' }}
           >
             <PersonIcon className="h-4 w-4 text-[var(--color-accent)]" aria-hidden="true" />
           </span>
         }
       />
       ```
  - Notes: Remove `titleClassName="font-serif"` — uniform title style across all main pages.

### Acceptance Criteria

- [x] AC1: Given any of the four main pages (Home, Library, Bookmarks, Settings), when the page renders, then the app bar left slot shows the Monkai app logo (`/icons/icon-192x192.svg`) in a `h-8 w-8` rounded-full container.
- [x] AC2: Given any of the four main pages, when the page renders, then the app bar right slot shows a `PersonIcon` in a `h-8 w-8` rounded-full bordered circle using `var(--color-border)` and `var(--color-accent)`.
- [x] AC3: Given `LibraryPage`, when it is in loading, error, or success state, then all three states show the logo left and PersonIcon right.
- [x] AC4: Given `HomePage`, when rendered, then `SunIcon` and `BellIcon` are no longer rendered in the app bar.
- [x] AC5: Given `SettingsPage`, when rendered, then the page title uses the default (non-serif) style — `titleClassName` prop is not passed.
- [x] AC6: Given running `pnpm lint` in `apps/reader`, then zero warnings/errors are reported (no unused imports remain).
- [x] AC7: Given running `pnpm test` in `apps/reader`, then all existing tests pass with no regressions.

## Additional Context

### Dependencies

- No new external libraries. `PersonIcon` is already available from `@radix-ui/react-icons`. Logo is an existing static asset in `public/`.

### Testing Strategy

- **No new test files needed**: Changes are purely prop-value substitutions on page components. The `AppBar` component behavior is already covered by `AppBar.test.tsx`.
- **Lint check** (mandatory): Run `pnpm lint` in `apps/reader` after implementation to catch any leftover unused imports. TypeScript strict mode (`noUnusedLocals`) will also catch these at build time.
- **Manual verification**: Open each of the 4 pages in the dev server; confirm logo appears on the left, PersonIcon on the right, consistent with the Library page.

### Notes

- The `AppLogo` component is created as a proper named React component (not just a JSX constant) so it's importable, tree-shakeable, and follows project conventions.
- The `PersonIcon` account button remains non-interactive (a `<span>`) matching the current Library implementation. A future spec can wire it to an account modal or settings route.
- `CategoryPage` is intentionally excluded — it uses the `backTo` back-navigation pattern which is semantically correct for a drill-down page.
