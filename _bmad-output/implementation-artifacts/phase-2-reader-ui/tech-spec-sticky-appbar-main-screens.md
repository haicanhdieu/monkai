---
title: 'Sticky AppBar on Main Screens'
slug: 'sticky-appbar-main-screens'
created: '2026-03-11'
status: 'Completed'
stepsCompleted: [1, 2, 3, 4]
tech_stack: ['React 18.3.x', 'TypeScript ~5.9.3', 'Tailwind CSS 3.x', 'Vitest ^4.0.18', '@testing-library/react ^16.3.2']
files_to_modify:
  - apps/reader/src/features/home/HomePage.tsx
  - apps/reader/src/features/library/LibraryPage.tsx
  - apps/reader/src/features/bookmarks/BookmarksPage.tsx
  - apps/reader/src/features/settings/SettingsPage.tsx
code_patterns:
  - 'AppBar sticky prop → adds sticky top-0 z-20 backdrop-blur to <header>'
  - 'Scroll container is <main className="flex-1 overflow-auto pb-16"> in App.tsx'
  - 'LibraryPage renders 3 AppBar instances (loading/error/success) — success already sticky'
  - 'Intermediate page wrapper <div className="pb-24"> has no overflow property — sticky resolves correctly'
  - 'backdrop-blur is inert because --color-background is fully opaque in all themes'
test_patterns:
  - 'Vitest + @testing-library/react, colocated *.test.tsx files'
  - 'AppBar.test.tsx:61 covers sticky class at component level but does NOT verify page call-sites pass the prop'
---

# Tech-Spec: Sticky AppBar on Main Screens

**Created:** 2026-03-11

## Overview

### Problem Statement

When users scroll down on Home, Bookmarks, and Settings screens — and on LibraryPage's loading/error states — the AppBar scrolls out of view. Users lose their navigation header and page title context mid-scroll.

### Solution

Pass the existing `sticky` prop to all `AppBar` instances across the four main tab screens (and all three render-states of `LibraryPage`). The `sticky` prop already applies `sticky top-0 z-20 backdrop-blur` CSS classes — no new CSS or component changes are needed.

### Scope

**In Scope:**
- `HomePage` — single AppBar instance, add `sticky`
- `LibraryPage` — 3 AppBar instances (loading, error, success states); success already has `sticky`, loading/error do not
- `BookmarksPage` — single AppBar instance, add `sticky`
- `SettingsPage` — single AppBar instance, add `sticky`

**Out of Scope:**
- `ReaderPage` / `ChromelessLayout` — reader has its own layout
- `CategoryPage` — uses a back-navigation AppBar, separate concern

## Context for Development

### Codebase Patterns

- `AppBar` lives at `apps/reader/src/shared/components/AppBar.tsx`
- `sticky` prop (boolean, default `false`) → conditionally adds `sticky top-0 z-20 backdrop-blur` to the `<header>` element
- **`backdrop-blur` is visually inert:** `--color-background` resolves to a fully opaque color in all three themes (`#F5EDD6` sepia / `#FFFFFF` light / `#1A1207` dark). `backdrop-blur` only works when the background has an alpha channel. The class is emitted in the DOM but produces no frosted-glass effect. The AppBar still correctly covers scrolled content due to the opaque background. Do not attempt to fix this — it is out of scope.
- **Scroll container:** `<main className="flex-1 overflow-auto pb-16">` in `App.tsx` is the nearest scrolling ancestor. `position: sticky` on the AppBar resolves against it.
- **Sticky ancestor chain is safe:** The only DOM nodes between `<main>` and `<AppBar>` are page-root `<div>` elements with no `overflow` property set. Stickiness works correctly. **Warning for future refactors:** adding `overflow-hidden`, `overflow-clip`, or `overflow-scroll` to any ancestor `<div>` of the AppBar will silently break stickiness.
- **LibraryPage success-state AppBar** already passes `sticky` (~line 97) — do not modify it.
- **LibraryPage AppBar height disparity:** The success state passes `<LibrarySearchHub>` as `children`, making its sticky header taller than the loading/error states (which have no children). This is pre-existing and correct.
- **`SettingsPage` has no router wrapper in tests:** `SettingsPage.test.tsx` renders without `MemoryRouter` because no navigation is used. This is fragile (breaks if a sub-component adds `Link`), but is a pre-existing condition — do not change it in this spec.

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `apps/reader/src/shared/components/AppBar.tsx` | AppBar component — `sticky` prop at line 13, applied at line 30 |
| `apps/reader/src/features/home/HomePage.tsx` | Home screen — AppBar at ~line 169, add `sticky` |
| `apps/reader/src/features/library/LibraryPage.tsx` | Library — 3 AppBars: loading ~line 20, error ~line 65, success ~line 97 (already sticky) |
| `apps/reader/src/features/bookmarks/BookmarksPage.tsx` | Bookmarks — AppBar at ~line 15, add `sticky` |
| `apps/reader/src/features/settings/SettingsPage.tsx` | Settings — AppBar at ~line 11, add `sticky` |
| `apps/reader/src/App.tsx` | Scroll container: `<main className="flex-1 overflow-auto pb-16">` |
| `apps/reader/src/shared/components/OfflineBanner.tsx` | `position:fixed top-0 z-40` — overlays sticky AppBar when offline |
| `apps/reader/src/shared/components/SwUpdateBanner.tsx` | `position:fixed top-0 z-50` — overlays sticky AppBar when SW update ready |
| `apps/reader/src/index.css` | CSS variable definitions — `--color-background` fully opaque in all themes |

### Technical Decisions

- **Zero new logic or CSS** — only prop addition per page.
- **No visual regression on LibraryPage success state** — already sticky, unchanged.
- **`backdrop-blur` inert — accepted:** All `--color-background` values are fully opaque. `backdrop-blur` produces no visible effect. Future improvement (out of scope): add alpha to `--color-background` or use a separate semi-transparent variable for the sticky state.
- **Banner overlay — known limitation accepted:** `OfflineBanner` (`fixed top-0 z-40`) and `SwUpdateBanner` (`fixed top-0 z-50`) will visually overlay the sticky AppBar (`z-20`) when active, since fixed banners float above all document-flow content. This is acceptable — banners are transient and rare. Fixing the offset conflict is a separate future task.
- **Integration coverage gap — accepted:** `AppBar.test.tsx:61` verifies the `sticky` prop applies CSS classes at the component level. It does **not** verify that page components actually pass the prop. A developer who omits `sticky` on a call-site will have zero automated detection. For a 5-line change this risk is acceptable; a future improvement would add `data-testid="app-bar"` + class assertions to page-level tests.

## Implementation Plan

### Tasks

> **LibraryPage note:** The file has three `<AppBar` elements. Identify each by its surrounding conditional block — do not use search-replace across the whole file.

- [x] Task 1: Add `sticky` to `AppBar` in `HomePage`
  - File: `apps/reader/src/features/home/HomePage.tsx`
  - Action: Inside `export default function HomePage()`, locate the `<AppBar` opening tag (~line 169). Add the `sticky` boolean prop.
  - Before: `<AppBar`
  - After: `<AppBar sticky`
  - Notes: Single instance; no other AppBars in this file.

- [x] Task 2: Add `sticky` to `AppBar` in `LibraryPage` — **loading state**
  - File: `apps/reader/src/features/library/LibraryPage.tsx`
  - Action: Inside the `if (catalogQuery.isLoading)` block (first early return, ~line 17), locate the `<AppBar` opening tag (~line 20). Add `sticky`.
  - Before: `<AppBar` (inside `if (catalogQuery.isLoading)` block)
  - After: `<AppBar sticky`

- [x] Task 3: Add `sticky` to `AppBar` in `LibraryPage` — **error state**
  - File: `apps/reader/src/features/library/LibraryPage.tsx`
  - Action: Inside the `if (catalogQuery.error || !catalogQuery.data)` block (second early return, ~line 58), locate the `<AppBar` opening tag (~line 65). Add `sticky`.
  - Before: `<AppBar` (inside `if (catalogQuery.error || !catalogQuery.data)` block)
  - After: `<AppBar sticky`
  - Notes: The success-state `<AppBar sticky` at ~line 97 already has `sticky` — do **not** touch it.

- [x] Task 4: Add `sticky` to `AppBar` in `BookmarksPage`
  - File: `apps/reader/src/features/bookmarks/BookmarksPage.tsx`
  - Action: Inside `export default function BookmarksPage()`, locate the `<AppBar` opening tag (~line 15). Add `sticky`.
  - Before: `<AppBar`
  - After: `<AppBar sticky`
  - Notes: Single instance — rendered for both list state and empty state.

- [x] Task 5: Add `sticky` to `AppBar` in `SettingsPage`
  - File: `apps/reader/src/features/settings/SettingsPage.tsx`
  - Action: Inside `export default function SettingsPage()`, locate the `<AppBar` opening tag (~line 11). Add `sticky`.
  - Before: `<AppBar`
  - After: `<AppBar sticky`
  - Notes: Single instance.

### Acceptance Criteria

- [x] AC 1: Given Home has scrollable content, when the user scrolls down, then the AppBar remains pinned at the top of the viewport.

- [x] AC 2: Given Library in its **success state**, when the user scrolls down, then the AppBar (including search hub) remains pinned at the top. *(Pre-existing — must remain unchanged.)*

- [x] AC 3: Given Library in its **loading state** (skeleton cards), when the user scrolls down, then the AppBar (no search hub, shorter) remains pinned at the top.

- [x] AC 4: Given Library in its **error state**, when the user scrolls down, then the AppBar remains pinned at the top.

- [x] AC 5: Given Bookmarks with **one or more bookmark cards**, when the user scrolls down, then the AppBar remains pinned at the top.

- [x] AC 6: Given Bookmarks in its **empty state** (zero bookmarks), then the AppBar is present and visible at the top of the page. *(Content may not be scrollable, but the AppBar must be rendered with `sticky`.)*

- [x] AC 7: Given Settings, when the user scrolls down past font and theme controls, then the AppBar remains pinned at the top.

- [x] AC 8: Given any affected screen, the sticky AppBar `<header>` carries the classes `sticky top-0 z-20 backdrop-blur`. *(Covered by `AppBar.test.tsx:61` at component level. No page-level assertions added — accepted gap per Technical Decisions.)*

- [x] AC 9 *(documentation check)*: After implementation, manually verify `ReaderPage.tsx` / `ChromelessLayout.tsx` and `CategoryPage.tsx` contain no newly-added `sticky` prop — these files must be unmodified.

- [x] AC 10 *(known limitation)*: When `OfflineBanner` or `SwUpdateBanner` is active, the banner overlays the sticky AppBar. This is accepted behavior — no fix required in this spec.

### Manual Verification Steps

1. `devbox run dev` — open each screen in browser, scroll down, confirm AppBar stays pinned.
2. **Library loading state:** Chrome DevTools → Network → throttle to "Slow 3G" → hard-reload Library screen. Skeleton should stay long enough to scroll.
3. **Library error state:** DevTools → Network → check "Offline" → navigate to Library. Error message renders; scroll to confirm AppBar stays pinned.
4. **Bookmarks empty state:** Clear all bookmarks (Settings or fresh profile) → navigate to Bookmarks → confirm AppBar visible at top.

## Review Notes
- Adversarial review completed
- Findings: 12 total, 0 fixed, 12 skipped
- Resolution approach: auto-fix (all real findings invalidated upon inspection)

## Additional Context

### Dependencies

- No external libraries or new dependencies.
- `AppBar`'s `sticky` prop is fully implemented in `apps/reader/src/shared/components/AppBar.tsx`.

### Testing Strategy

- **No new tests.** `AppBar.test.tsx:61` covers sticky class at component level. Accepted integration gap documented in Technical Decisions.
- `devbox run test` after all changes — must pass with zero failures.
- `devbox run lint` after all changes — must report zero warnings.
- Manual steps above cover the rest.

### Notes

- `backdrop-blur` is inert — opaque backgrounds. Future fix: add alpha to `--color-background` or use a dedicated `--color-background-sticky` with transparency.
- Banner overlay (OfflineBanner z-40, SwUpdateBanner z-50 over AppBar z-20) is an accepted limitation. Future fix: set a CSS variable for `--appbar-top-offset` based on banner visibility, applied as `top` on the sticky header.
- `LibraryPage` success-state sticky header is taller than loading/error (includes `LibrarySearchHub`) — pre-existing, correct.
- `HomePage` uses `pb-24` on the page root div; `<main>` has `pb-16`. This double bottom padding is pre-existing — do not change it.
- Future: add `sticky` assertions to page-level tests to close the integration coverage gap.
- Future: `CategoryPage` sticky AppBar if desired — separate spec (back-link nav pattern).
