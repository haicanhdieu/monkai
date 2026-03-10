---
title: 'Fix reader bookmark page not restored on fresh load'
slug: 'fix-reader-bookmark-page-not-restored-on-fresh-load'
created: '2026-03-11'
status: 'Implementation Complete'
stepsCompleted: [1, 2, 3, 4]
tech_stack: ['React', 'Zustand', 'React Router', 'TypeScript']
files_to_modify: ['apps/reader/src/features/reader/ReaderEngine.tsx', 'apps/reader/src/features/reader/ReaderPage.test.tsx']
code_patterns: ['effects sync store from DOM pagination', 'location state for navigation params', 'clamp currentPage to totalPages-1']
test_patterns: ['React Testing Library', 'mock useBook and useLocation', 'assert reader store state']
---

# Tech-Spec: Fix reader bookmark page not restored on fresh load

**Created:** 2026-03-11

## Overview

### Problem Statement

When the user performs a fresh reload (F5), goes to the bookmark page, and clicks a book that has a bookmark (e.g. sample book 1 bookmarked on page 15), the app navigates to the reader but shows the cover (page 0) instead of the bookmarked page (15). The page number (15) is correctly passed from the bookmark link via React Router location state; the bug is that the reader engine overwrites it before pagination has finished, so the user ends up on the first page. **Page indices in this spec are 0-based:** page 0 = cover, page 1 = first content page; `bookmark.page` and `currentPage` follow this convention.

### Solution

Only apply the reader store sync and currentPage clamp in `ReaderEngine` when DOM pagination has actually completed (`paginationResult !== null`). Until then, leave the store’s `currentPage` (and pages/boundaries) unchanged so the bookmark page is preserved and shown once pagination is ready.

### Scope

**In Scope:**
- Fix the sync effect in `ReaderEngine` so it does not run (and thus does not clamp `currentPage`) when `paginationResult === null`.
- Add or adjust tests to cover: open from bookmark link after fresh load → reader shows bookmarked page (e.g. page 15), not cover.

**Out of Scope:**
- Changing how bookmark page is passed (already correct via `state={{ page: bookmark.page }}`).
- Changing when or how `useDOMPagination` runs (e.g. waiting for “all content” elsewhere); the fix is local to the sync/clamp logic.
- Handling stale store if pagination resets to `null` when bookId/paragraphs change (e.g. switching book); accepted as-is.
- Avoiding a brief flash of the cover before showing the bookmarked page while pagination completes; acceptable and not required.

## Context for Development

### Codebase Patterns

- **Reader state:** `ReaderPage` sets `currentPage` from `locationState?.page` (bookmark) or 0 when book loads; it also resets `setPages([])`, `setPageBoundaries([0])`. `ReaderEngine` later syncs computed pages/boundaries from `useDOMPagination` into the store and clamps `currentPage` to `[0, totalDisplayPages - 1]`.
- **Pagination:** `useDOMPagination` returns `null` until the first measurement completes (after fonts ready and measure div in DOM). When `null`, callers use fallbacks `pages = []`, `boundaries = [0]`, `totalDisplayPages = 1`. The sync effect in `ReaderEngine` runs with these fallbacks and clamps 15 → 0.
- **Bookmark navigation:** `BookmarkCard` uses `<Link to={toRead(bookmark.bookId)} state={{ page: bookmark.page }} />`. Page is 0-based (e.g. 15 = 16th page including cover). Bookmark on page 0 (cover) is supported and must be preserved like any other page.

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `apps/reader/src/features/reader/ReaderPage.tsx` | Reads `locationState?.page`, sets store on book load (including `setCurrentPage(pageFromBookmark ?? 0)`). |
| `apps/reader/src/features/reader/ReaderEngine.tsx` | Uses `useDOMPagination`, syncs pages/boundaries to store, clamps `currentPage` in the effect with comment "Sync computed pages into store when pagination result changes". Root cause: effect runs when result is still null. |
| `apps/reader/src/features/reader/useDOMPagination.ts` | Returns `null` until first measurement; then returns full `{ pages, boundaries }` for all paragraphs. |
| `apps/reader/src/features/bookmarks/BookmarkCard.tsx` | Navigates with `state={{ page: bookmark.page }}`. |
| `apps/reader/src/features/reader/ReaderPage.test.tsx` | Existing test “opens at bookmark page when navigating from bookmark link” — can be extended for integration with engine. |

### Technical Decisions

- Fix in `ReaderEngine` only: guard the sync effect so it runs only when `paginationResult !== null`. No change to `ReaderPage` or to how bookmark page is passed.
- When `paginationResult === null`, do not call `setPages`/`setPageBoundaries`/`setCurrentPage` from that effect; the store keeps the values set by `ReaderPage` (e.g. `currentPage === 15`). When `paginationResult` becomes non-null, the effect runs once with the real page count and then clamps only if `currentPage > totalDisplayPages - 1` (preserving 15 if it’s in range).

## Implementation Plan

### Tasks

- [x] Task 1: Guard sync effect so it only runs when pagination is ready
  - File: `apps/reader/src/features/reader/ReaderEngine.tsx`
  - Action: Locate the effect that syncs `pages`/`pageBoundaries` to the store and clamps `currentPage` (search for the comment "Sync computed pages into store when pagination result changes"). At the very start of that effect body, add: `if (paginationResult === null) return;`. Add `paginationResult` to the effect’s dependency array so it re-runs when pagination changes from null to the measured result.
  - Notes: This preserves `currentPage` from the bookmark until real pagination exists; then the existing clamp logic keeps it in valid range without overwriting it with 0. Verify the effect only runs when the pagination result actually changes (e.g. null → non-null or after re-measurement), not on every render; `useDOMPagination` returns a stable reference until re-measurement.

- [x] Task 2: Add test that exercises the fix (real ReaderEngine or guard)
  - File: `apps/reader/src/features/reader/ReaderPage.test.tsx` (and optionally a dedicated test file for ReaderEngine sync/clamp if preferred)
  - Action: Ensure at least one test runs the **real** `ReaderEngine` (not the current mock) so the sync effect and the new guard are executed. Current `ReaderPage.test.tsx` mocks `ReaderEngine`, so the fix is never exercised. Either: (a) unmock `ReaderEngine` for a single test that mounts `ReaderPage` with `state: { page: 10 }`, uses a book fixture with enough paragraphs to yield multiple pages (e.g. 15+ content paragraphs), and asserts after engine has run (e.g. after `waitFor` or layout effects) that `useReaderStore.getState().currentPage === 10`; or (b) add a unit test in `ReaderEngine.test.tsx` (if it exists) that renders `ReaderEngine` with a multi-page book and a store pre-set to `currentPage: 10`, mocks `useDOMPagination` to return `null` then later a result with 20+ pages, and asserts `currentPage` remains 10 after the result is set. Required assertion: store `currentPage` equals the bookmark page (e.g. 10) once pagination has completed, and is not clamped to 0.
  - Notes: Do not rely only on tests that mock out `ReaderEngine`; the guard must run in at least one test to prevent regressions.

### Acceptance Criteria

- [x] AC 1: Given the user has performed a fresh reload (F5), when they open the bookmarks page and click a book that has a bookmark on page N (e.g. page 15), then the reader opens and displays page N (e.g. page 15), not the cover (page 0). *Validated by manual testing (and optionally E2E); not required to be automated in unit tests.*
- [x] AC 2: Given the user opens the reader from a bookmark link with `state.page === 15`, when DOM pagination completes with more than 16 total display pages, then `currentPage` in the reader store remains 15 and the UI shows the content for page 15.
- [x] AC 3: Given the user opens the reader from a bookmark link with `state.page === 99`, when DOM pagination completes with only 20 total display pages, then `currentPage` is clamped to 19 (last page) and the UI shows the last page (no crash, no out-of-range).
- [x] AC 4: Given the user opens the reader without a bookmark (e.g. from library), when book loads and pagination completes, then behavior is unchanged: last-read or 0 is used and clamp still applies as today.

## Additional Context

### Dependencies

- None. Uses existing `useDOMPagination` and reader store.

### Testing Strategy

- Unit/integration: At least one test must run the real `ReaderEngine` and assert store `currentPage` equals the bookmark page after pagination (see Task 2). AC 1 is validated by manual testing (and optionally E2E); it is not required to be automated in CI.
- Manual: Fresh reload → Bookmarks → click “Sample book 1” (bookmark on page 15) → confirm reader shows page 15.

### Notes

- See **Context for Development** (Codebase Patterns and Technical Decisions) for root cause and fix rationale.

### Manual verification (before release)

- **AC 1:** Perform once: fresh reload (F5) → Bookmarks → click a book with a bookmark on page 15 (e.g. Sample book 1) → confirm the reader opens on page 15, not the cover.
