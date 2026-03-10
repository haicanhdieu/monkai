---
title: 'Consistent App Bar Styling Across All Pages'
slug: 'consistent-app-bar-styling'
created: '2026-03-09'
status: 'in-progress'
stepsCompleted: [1, 2, 3, 4]
tech_stack: ['React 18', 'TypeScript', 'Vite 7', 'Tailwind 3', 'CSS variables', 'Vitest 4', '@testing-library/react 16', 'Radix UI icons']
files_to_modify: ['apps/reader/src/shared/components/AppBar.tsx', 'apps/reader/src/index.css', 'apps/reader/src/shared/components/AppBar.test.tsx']
code_patterns: ['AppBar leftIcon/rightSlot/backTo; header border-b + inline style borderColor/backgroundColor; CSS vars in .theme-sepia/.theme-light/.theme-dark; path alias @/*; colocated *.test.ts(x)']
test_patterns: ['Vitest describe/it; renderWithRouter(MemoryRouter); screen.getByTestId("app-bar"), getByRole("banner"); expect(header.className).toContain(...)']
---

# Tech-Spec: Consistent App Bar Styling Across All Pages

**Created:** 2026-03-09

## Overview

### Problem Statement

The app bar is implemented per-page with inconsistent visuals and slot usage. The target is to align all pages with a single reference design: cream/beige bar, rounded top corners, thin light purple (periwinkle) top border, with a consistent three-zone layout (left icon, centered title, right icon).

### Solution

- Update the shared `AppBar` component to apply the reference visual style (background, rounded top corners, periwinkle top border).
- Optionally standardize which pages show hamburger (left) and profile circle (right) so the bar looks the same everywhere; otherwise keep current slot content but ensure the container styling is consistent.

### Scope

**In Scope:**
- App bar visual style: cream/beige background, rounded top-left and top-right corners, thin periwinkle top border.
- Single place for styling: `AppBar.tsx` (and any new CSS variable in `index.css` for the border color).
- All pages that use `AppBar` (Home, Library, Bookmarks, Settings, Category) receive the updated bar appearance.
- Tests updated or added to cover the new styling/behavior.

**Out of Scope:**
- Changing navigation behavior or routes.
- Adding new app bar slots or pages not already using `AppBar`.
- Reader chrome (ChromelessLayout) — only main app shell pages.

## Context for Development

### Codebase Patterns

- **AppBar** (`apps/reader/src/shared/components/AppBar.tsx`): Single shared header. Props: `title`, `backTo`, `backLabel`, `titleClassName`, `leftIcon`, `rightSlot`, `sticky`, `children`. Renders `<header>` with `border-b`, `px-4 pt-4 pb-3`; `borderColor` and `backgroundColor` set via inline `style` using `var(--color-border)` and `var(--color-surface)` or `var(--color-background)` when sticky. No rounded corners or top border. Left slot: either `<Link to={backTo}>← {backLabel}</Link>`, or `leftIcon` wrapper, or zero-width spacer. Title is `<h1>` with `text-xl font-bold tracking-tight truncate` and optional `titleClassName`. Right slot optional. Children rendered below in `mt-3` div.
- **Themes** (`apps/reader/src/index.css`): `.theme-sepia`, `.theme-light`, `.theme-dark` each set `--color-background`, `--color-text`, `--color-text-muted`, `--color-accent`, `--color-surface`, `--color-border`. No `--color-app-bar-border` yet; add per theme for periwinkle top border.
- **Page layout**: AppBar is always inside a page wrapper with horizontal padding (e.g. `px-4` or `px-6`) and top padding (`pt-4` or `pt-8`), so the bar is inset; adding `rounded-t-*` on the header will show rounded top corners. Library main view uses `<div className="pb-24">` with AppBar as first child (no wrapper padding), so bar is full-width there; rounded corners still apply to the bar element.
- **Icons**: LibraryPage uses `HamburgerMenuIcon` and `PersonIcon` from `@radix-ui/react-icons`; left icon in plain span, right in rounded-full border circle. HomePage uses `SunIcon` (accent bg) and `BellIcon` in rounded-full. Other pages pass no left/right or only `backTo`.
- **Project context** (`_bmad-output/project-context.md`): Path alias `@/*` → `./src/*`; Vitest + @testing-library; colocated tests; Vietnamese UI; Tailwind 3, Radix UI.

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `apps/reader/src/shared/components/AppBar.tsx` | Restyle: replace `border-b` with top border, add `rounded-t-xl` (or similar), keep padding and flex layout; optional inline style for `borderTopColor`. |
| `apps/reader/src/index.css` | Add `--color-app-bar-border` in `.theme-sepia`, `.theme-light`, `.theme-dark` (periwinkle / light purple; dark theme a muted variant). |
| `apps/reader/src/shared/components/AppBar.test.tsx` | Add or adjust test that header has rounded top and top border (e.g. class `rounded-t-xl`, or style/attribute); keep existing tests passing. |
| `apps/reader/src/features/library/LibraryPage.tsx` | Reference for hamburger + profile circle markup; no change required if only visual style is updated. |
| `apps/reader/src/features/home/HomePage.tsx` | Uses Sun + Bell; optional later: align to hamburger + profile. |
| `apps/reader/src/features/bookmarks/BookmarksPage.tsx` | No slots; receives new bar style automatically. |
| `apps/reader/src/features/settings/SettingsPage.tsx` | No slots; titleClassName preserved. |
| `apps/reader/src/features/library/CategoryPage.tsx` | backTo preserved; new bar style automatic. |

### Technical Decisions

- Add `--color-app-bar-border` in `index.css` for each theme (periwinkle/light purple for sepia and light, muted for dark) so the top border is themeable.
- In AppBar: use `border-t` (or `border-t-2`) with `borderColor: 'var(--color-app-bar-border)'`, remove `border-b`, add Tailwind `rounded-t-xl` (or `rounded-t-2xl`) to the `<header>`. Keep existing background logic (surface vs background when sticky).
- Do not change slot API or page-specific left/right content in this spec; visual style only unless product later confirms layout standardization.

## Implementation Plan

### Tasks

- [x] Task 1: Add app bar top border CSS variable for all themes
  - File: `apps/reader/src/index.css`
  - Action: In `.theme-sepia`, `.theme-light`, and `.theme-dark`, add `--color-app-bar-border`. Use a periwinkle/light purple for sepia (e.g. `#B8A9C9` or similar) and light; use a muted purple or compatible tone for dark so the border remains visible on dark surface.
  - Notes: Place each new variable immediately after the existing `--color-border` line in that block so theme blocks stay consistent.

- [ ] Task 2: Restyle AppBar header container (top border, rounded top, remove bottom border)
  - File: `apps/reader/src/shared/components/AppBar.tsx`
  - Action: In the `headerClasses` array, remove `border-b` and add `border-t` (or `border-t-2` for thin but visible) and `rounded-t-xl`. In the header `style` object, replace `borderColor` with `borderTopColor: 'var(--color-app-bar-border)'` (and remove bottom border styling). Keep `backgroundColor` logic unchanged (surface when not sticky, background when sticky). Keep `px-4 pt-4 pb-3` and sticky/backdrop-blur classes.
  - Notes: Do not change the flex layout, slots, or children; only the outer header element styling.

- [ ] Task 3: Add test for app bar visual style (rounded top, top border)
  - File: `apps/reader/src/shared/components/AppBar.test.tsx`
  - Action: Add a test that renders AppBar and asserts the header element has a class indicating rounded top (e.g. `rounded-t-xl`) and that it has a top border (e.g. via `borderTopWidth` or `border-top` style, or by checking that `borderTopColor` is set when using inline style). Ensure all existing tests still pass.
  - Notes: If the component uses inline `style` for border, assert on that; if Tailwind border classes are used, assert on className. Avoid snapshot tests if the project does not use them; prefer explicit assertions.

## Acceptance Criteria

- [ ] AC1: Given any page that uses AppBar (Home, Library, Bookmarks, Settings, Category), when the page is rendered, then the app bar has a cream/beige background (via existing surface/background vars), rounded top-left and top-right corners (e.g. `rounded-t-xl`), and a thin light purple (periwinkle) top border.
- [ ] AC2: Given AppBar with backTo set (e.g. Category page), when rendered, then the back link appears in the left slot and the title is centered; given AppBar with leftIcon/rightSlot (e.g. Library), when rendered, then slots are aligned as today; given AppBar with children (e.g. LibrarySearchHub), when rendered, then children appear below the title row with correct spacing.
- [ ] AC3: Given the app uses theme-sepia, theme-light, or theme-dark, when the AppBar is rendered, then the top border color comes from `var(--color-app-bar-border)` and matches the active theme (periwinkle for sepia/light, muted for dark).
- [ ] AC4: Given the AppBar test file, when `pnpm test` is run in apps/reader, then all AppBar tests pass, including a test that asserts the header has rounded top and a top border.

## Additional Context

### Dependencies

- No new external libraries. Uses existing Tailwind 3 and CSS custom properties. Reader app already loads `index.css` and applies theme classes to the root.

### Testing Strategy

- **Unit:** In `AppBar.test.tsx`, add one test that checks the header has `rounded-t-xl` (or equivalent) and a top border (class or inline style). Keep existing tests for title, back link, backLabel, titleClassName, leftIcon, rightSlot, sticky, and children unchanged.
- **Manual:** After implementation, open Home, Library, Bookmarks, Settings, and a Category page in the reader app; confirm the bar has cream/beige background, rounded top corners, and periwinkle top border in the default (sepia) theme; switch to light and dark and confirm the border color adapts.

### Notes

- Scope is visual style only; left/right slot content per page is unchanged (no hamburger/profile standardization across all pages in this spec).
- If the bar is full-width on Library (no horizontal padding on parent), rounded corners will still show at the viewport edges; if wrapped in padded containers, corners are visible within the inset.
- Future consideration: standardizing hamburger + profile circle on every main page can be a follow-up spec if product confirms.
