# Story 2.3: Global Search with MiniSearch

Status: done

## Story

As a **user**,
I want to instantly search for any sutra by title or keyword across the entire catalog,
so that I can find a specific text without needing to know its category.

## Acceptance Criteria

1. **Given** `LibrarySearchHub` renders within `LibraryPage`
   **When** the search input is empty
   **Then** the category grid is shown below the persistent search bar

2. **Given** the user types into the search bar
   **When** the debounced input (250ms) fires
   **Then** the category grid is replaced by `<SearchResults>` showing filtered sutra titles matching the query against the MiniSearch index

3. **Given** a MiniSearch index built once via `useMemo` from `useCatalogIndex()` data
   **When** built
   **Then** it indexes `title`, `category`, and `subcategory` fields with title boosted (x3) over other fields

4. **Given** the user searches "Bát Nhã"
   **When** results render
   **Then** sutras containing "Bát Nhã" in their title appear within 250ms of the last keystroke, with the matched term visually highlighted

5. **Given** the search query returns no matches
   **When** `<SearchResults>` renders
   **Then** a calm "Không tìm thấy kết quả" message is shown with a suggestion to try a shorter keyword

6. **Given** the user taps a search result
   **When** navigation occurs
   **Then** the user is taken to `/read/:bookId` for the selected sutra

7. **Given** the app is fully offline with a cached catalog
   **When** the user performs a search
   **Then** search results appear identically to the online experience - MiniSearch operates entirely client-side

## Tasks / Subtasks

- [x] Task 1: Build `LibrarySearchHub` orchestration (AC: 1, 2)
  - [x] Create or update `apps/reader/src/features/library/LibrarySearchHub.tsx`
  - [x] Render persistent search input above browse/search body
  - [x] Toggle between category grid and search results based on normalized query

- [x] Task 2: Implement MiniSearch index lifecycle (AC: 2, 3, 7)
  - [x] Build index with `useMemo` from `useCatalogIndex()` payload
  - [x] Index `title`, `category`, `subcategory`
  - [x] Apply title boost x3
  - [x] Ensure index build does not rerun on unrelated rerenders

- [x] Task 3: Implement debounced search behavior (AC: 2, 4)
  - [x] Apply 250ms debounce to user input
  - [x] Execute client-side query only after debounce settles
  - [x] Keep interaction smooth under offline and low-end device conditions

- [x] Task 4: Implement `SearchResults` and highlighting (AC: 4, 5, 6)
  - [x] Create/update `apps/reader/src/features/library/SearchResults.tsx`
  - [x] Highlight matched text fragments (title-first priority)
  - [x] Show calm empty state copy when no results
  - [x] Navigate to `/read/:bookId` on result tap

- [x] Task 5: Test search UX and offline parity (AC: 2, 4, 5, 7)
  - [x] Unit tests for debounce timing and index build behavior
  - [x] Component tests for empty query, match, and no-result states
  - [x] Verify search works with cached catalog data and no network

## Dev Notes

### Story Foundation

- Completes Epic 2 discovery capabilities (FR3, FR4).
- Builds on Story 2.1 data/query layer and Story 2.2 browse screens.
- Search must remain calm, fast, and deterministic under offline-first conditions.

### Technical Requirements

- Normalize query input (trim, Unicode-safe lowercase handling) before searching.
- Keep a stable search document shape with `id`, `title`, `category`, `subcategory`.
- Avoid rebuilding MiniSearch index on each keystroke; index lifecycle should track catalog changes only.

### Architecture Compliance

- Keep the boundary:
  - catalog fetch in `useCatalogIndex()`
  - indexing/search in `LibrarySearchHub`
  - presentation in `SearchResults`
- Do not fetch network data in search result component.
- Maintain calm UX with no toasts/spinners in core search flow.

### Library / Framework Requirements

- Use `minisearch` v7 APIs compatible with current project pin (`^7.2.0`).
- Keep debounce logic explicit and testable (hook or utility, no opaque third-party wrapper required).
- Preserve route constants and navigation conventions from existing app shell.

### File Structure Requirements

- Target files:
  - `apps/reader/src/features/library/LibrarySearchHub.tsx`
  - `apps/reader/src/features/library/SearchResults.tsx`
  - `apps/reader/src/features/library/LibraryPage.tsx` (integration)
  - `apps/reader/src/features/library/library.types.ts` (if needed)
- Keep shared highlighting helper in feature folder unless reused cross-feature.

### Testing Requirements

- Add tests for:
  - 250ms debounce behavior
  - title boost ranking (title hits rank above category-only hits)
  - no-result message content
  - navigation to `/read/:bookId`
  - offline operation with cached catalog fixture

### Previous Story Intelligence

- Story 2.1 + 2.2 establish typed data contracts and browse rendering patterns.
- Reuse existing `SkeletonText`, calm copy style, and component boundaries rather than adding new interaction metaphors.

### Git Intelligence Summary

- Current repo trend is strict quality gates and incremental feature layering.
- Implement search in isolated components with tests; avoid broad refactors touching unrelated reader features.

### Latest Tech Information (as of 2026-03-07)

- MiniSearch package line remains v7 on npm; current project pin `^7.2.0` is aligned with architecture recommendation.
- TanStack Query v5 remains current major and supports the long-lived cache model needed for offline search source data.
- `react-router-dom` line in project is modern and supports route transitions required for search-result deep links.

### Project Structure Notes

- Library feature directory already exists; prefer additive implementation over structural reorganization.
- No `project-context.md` detected; planning/architecture/UX docs are authoritative context sources.

### References

- [Source: _bmad-output/planning-artifacts/phase-2-reader-ui/epics-reader-ui.md#Story 2.3]
- [Source: _bmad-output/planning-artifacts/phase-2-reader-ui/architecture-reader-ui.md#Gap 3 - Client-side search library]
- [Source: _bmad-output/planning-artifacts/phase-2-reader-ui/ux-design-specification-reader-ui.md#Journey 2: The Scholar]
- [Source: _bmad-output/planning-artifacts/phase-2-reader-ui/prd-reader-ui.md#Functional Requirements]
- [MiniSearch npm](https://www.npmjs.com/package/minisearch)
- [TanStack Query React docs (v5)](https://tanstack.com/query/v5/docs/framework/react)

## Dev Agent Record

### Agent Model Used

gpt-5-codex

### Debug Log References

- Epic requested: "whole phase 2 epic 2"
- Created as Epic 2 story batch item 3 of 3

### Completion Notes List

- Implemented `LibrarySearchHub` with persistent search bar and 250ms debounced query switching between browse grid and results.
- Added MiniSearch index lifecycle with `useMemo`, indexing `title/category/subcategory`, and title boost x3 ranking.
- Implemented `SearchResults` with in-title highlighting, calm no-result copy, and route-safe `/read/:bookId` navigation.
- Integrated search hub into `LibraryPage` while preserving offline-compatible client-side search flow.
- Added tests for debounce behavior, title boost ordering, no-result message, and result navigation.
- Review fix: made debounce timing assertion strict at the 250ms boundary using fake timers.
- Review fix: added cached-catalog offline parity integration test for Library search flow.

### File List

- apps/reader/src/features/library/LibrarySearchHub.tsx
- apps/reader/src/features/library/SearchResults.tsx
- apps/reader/src/features/library/LibraryPage.tsx
- apps/reader/src/features/library/library.types.ts
- apps/reader/src/features/library/LibrarySearchHub.test.tsx
- apps/reader/src/features/library/LibraryPage.offline.test.tsx
- apps/reader/src/shared/constants/routes.ts

## Senior Developer Review (AI)

Date: 2026-03-07  
Reviewer: Minh (AI)
Outcome: Approved

Summary:
- Validated search/browse switch, MiniSearch ranking, highlighting, no-result messaging, and result navigation.
- Closed review gaps by adding strict debounce timing verification and offline cached-catalog parity test.
- Story status moved from `review` to `done`.

## Change Log

- 2026-03-07: Added review-driven debounce/offline coverage and URL-safe route encoding; approved and set status to `done`.
