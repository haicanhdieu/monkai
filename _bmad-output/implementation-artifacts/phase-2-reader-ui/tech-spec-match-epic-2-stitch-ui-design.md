---
title: 'Match Epic 2 Implementation to Stitch UI Design'
slug: 'match-epic-2-stitch-ui-design'
created: '2026-03-07T13:15:27+07:00'
status: 'Completed'
stepsCompleted: [1, 2, 3, 4]
tech_stack: ['React', 'TypeScript', 'Tailwind CSS', 'TanStack Query', 'React Router', 'Vitest', 'Minisearch']
files_to_modify: ['apps/reader/src/features/home/HomePage.tsx', 'apps/reader/src/features/library/LibraryPage.tsx', 'apps/reader/src/features/library/CategoryPage.tsx', 'apps/reader/src/features/library/CategoryGrid.tsx', 'apps/reader/src/features/library/LibrarySearchHub.tsx', 'apps/reader/src/features/library/SearchResults.tsx', 'apps/reader/src/features/library/SutraListCard.tsx']
code_patterns: ['Utility-first Tailwind CSS', 'CSS Custom Property Themes (.theme-sepia, .theme-light, .theme-dark)', 'Presentational components separated from data fetching queries']
test_patterns: ['Vitest', 'React Testing Library (RTL)', 'Component-level rendering assertions', 'WCAG contrast assertions', 'Touch target minimum size assertions']
---
Prototype: _bmad-output/implementation-artifacts/pwa-reader-ui-prototype

# Tech-Spec: Match Epic 2 Implementation to Stitch UI Design

**Created:** 2026-03-07T13:15:27+07:00

## Overview

### Problem Statement

The current implementation of Phase 2 Epic 2 (Library Discovery & Search) does not match the provided Google Stitch design mockups.

### Solution

Review the Stitch design mockups for the project and update the Home, Library, Category, and Search UI components to match the specifications perfectly.

### Scope

**In Scope:**

- UI/UX updates to the pages and components created during Phase 2 Epic 2 (Home, Library, Category, Search).
- Alignment with Stitch design tokens, padding, typography, and component structures.

**Out of Scope:**

- Backend / schema changes.
- Implementation of new features not present in the Stitch design for these pages.

## Context for Development

### Codebase Patterns

- **Styling**: Tailwind CSS v3 augmented with custom CSS variables (`var(--color-surface)`, `var(--color-border)`) and specific brand tokens (`bg-kem`, `text-nau-tram`) based on reading themes.
- **Typography**: `Inter` for sans-serif/UI elements (loaded with `font-display: swap`), `Lora` for serif/Sutra text titles (loaded with `font-display: block` to ensure exact metric measurements for pagination later).
- **Architecture**: Smart/Dumb component separation. Async state resides in TanStack Query custom hooks (`useCatalogIndex()`), passed down as props to presentational structures (`CategoryGrid`, `LibrarySearchHub`).

### Files to Reference

| File                                                      | Purpose                                                                      |
| --------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `apps/reader/src/features/home/HomePage.tsx`            | Main entry point; needs full redesign to match Stitch.                       |
| `apps/reader/src/features/library/LibraryPage.tsx`      | Library browsing shell; manages query state and skeleton placeholders.       |
| `apps/reader/src/features/library/LibrarySearchHub.tsx` | Minisearch input and view toggler between categories and results.            |
| `apps/reader/src/features/library/CategoryGrid.tsx`     | UI displaying all available categories.                                      |
| `apps/reader/src/features/library/CategoryPage.tsx`     | Lists specific sutras matching the category route.                           |
| `apps/reader/src/features/library/SutraListCard.tsx`    | The individual sutra item UI component; must align with Stitch list item UI. |

### Technical Decisions

- The UI must continue to respect the three defined themes (Sepia, Light, Dark). Hardcoded non-variable hex colors inside components should be avoided unless explicitly required by Stitch constraints that break the theming engine.
- Minimal Touch Targets (44x44px min constraint) established in Epic 2 must test successfully.

## Implementation Plan

### Tasks

- [x] Task 1: Update Home Page to match Stitch design

  - File: `apps/reader/src/features/home/HomePage.tsx`
  - Action: Replace placeholder with actual Stitch Home page layout. Include header, hero section, and quick links/categories as defined by the "Home page" Stitch screen (id 181945724485987742). Ensure theming persists.
- [x] Task 2: Redesign Library Page layout

  - File: `apps/reader/src/features/library/LibraryPage.tsx`
  - Action: Update the structural layout, text sizes, and padding of the top-level library view to match the Stitch "Library Explorer" screen.
- [x] Task 3: Overhaul Search Input UI

  - File: `apps/reader/src/features/library/LibrarySearchHub.tsx`
  - Action: Update the search input visual style (border radius, padding, icon, typography) to match the Stitch designs perfectly, maintaining the existing debounce and Minisearch logic.
- [x] Task 4: Match Category Grid design

  - File: `apps/reader/src/features/library/CategoryGrid.tsx`
  - Action: Update the layout of individual category cards (typography, spacing, borders, minimum touch target height) to match Stitch specification. Ensure fallback colors still respect the CSS custom properties (`var(--color-surface)`).
- [x] Task 5: Redesign Category Page and Sutra List Item

  - File: `apps/reader/src/features/library/CategoryPage.tsx` & `apps/reader/src/features/library/SutraListCard.tsx`
  - Action: Update `SutraListCard` to match the exact spacing, typography (`Lora` for title, `Inter` for metadata), and visual hierarchy found in the Stitch design. Ensure the `CategoryPage` list layout aligns perfectly with the mockups.
- [x] Task 6: Review and Fix Breaking Tests

  - File: `apps/reader/src/features/library/*.test.tsx`
  - Action: Run existing RTL tests and update queries or assertions if the DOM structure changes significantly (e.g., text changes, role changes, wrapper elements added). Ensure the 44x44px touch target assertions still pass.

### Acceptance Criteria

- [x] AC 1: Given the user navigates to `/`, when the `HomePage` renders, then it visually matches the Stitch Home page design including headers and layout.
- [x] AC 2: Given the user navigates to `/library`, when the `LibraryPage` and its children render, then the search bar, category grid, and overall spacing match the Stitch "Library Explorer" design exactly.
- [x] AC 3: Given the user taps a category card, when the `CategoryPage` renders `SutraListCard` items, then the list items visually match the Stitch design (typography, hierarchy) and enforce a minimum 44x44px touch target.
- [x] AC 4: Given the user changes the reading theme, when the redesigned pages render, then no hardcoded colors break the theme expectations (Sepia, Light, Dark).

## Additional Context

### Dependencies

- Project Monkai in Google Stitch (`projects/1437433555868286223`) for visual reference.
- Existing Minisearch integration.
- Current React Router routes and setup.

### Testing Strategy

- Unit tests: Update affected RTL tests in the `features/library` to match new DOM node hierarchies or roles.
- Manual testing: Verify visually against the Stitch dashboard in a browser, checking Light, Dark, and Sepia themes to ensure CSS variable inheritance is maintained. Check responsive behavior.

### Notes

- Avoid throwing away the `useCatalogIndex` data hooking structure; focus strictly on presentational (JSX/Tailwind) updates.
- Double-check that `Lora` font is applied *only* where explicitly called for in the Stitch design (usually sutra headers), keeping `Inter` for functional UI text.

## Review Notes

- Adversarial review completed
- Findings: 10 total, 8 fixed, 2 skipped
- Resolution approach: auto-fix
