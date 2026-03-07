# Story 2.2: Category Browse - Library & Category Pages

Status: done

## Story

As a **user**,
I want to browse Buddhist text categories and see the list of sutras within each category,
so that I can discover texts by tradition or topic even without knowing an exact title.

## Acceptance Criteria

1. **Given** the user navigates to `/library`
   **When** `LibraryPage` renders with `useCatalogIndex()` data
   **Then** a grid of category cards is displayed (Nikaya, Đại Thừa, Thiền Tông, etc.) with the category name and sutra count

2. **Given** the catalog is loading
   **When** `LibraryPage` renders before data arrives
   **Then** `<SkeletonText>` blocks matching the card grid layout are shown - no spinner

3. **Given** the user taps a category card
   **When** `CategoryPage` renders at `/library/:category`
   **Then** a list of `<SutraListCard>` components shows each sutra's title, subcategory, and translator name from the catalog

4. **Given** `<SutraListCard>` for a sutra entry
   **When** rendered
   **Then** it has a minimum touch target of 44x44px, shows the sutra title in Lora font, and navigates to `/read/:bookId` on tap

5. **Given** the catalog fetch fails (e.g., book-data unreachable and not cached)
   **When** `LibraryPage` renders with TanStack Query `error` state
   **Then** `<ErrorPage>` renders with a calm themed message - no raw error object shown to user

## Tasks / Subtasks

- [x] Task 1: Build category view model from catalog data (AC: 1, 3)
  - [x] Add category aggregation helper with stable sorting
  - [x] Include category slug, display name, and book count
  - [x] Ensure CategoryPage resolves slug consistently with index data

- [x] Task 2: Implement LibraryPage browse UI (AC: 1, 2, 5)
  - [x] Update `apps/reader/src/features/library/LibraryPage.tsx` to consume `useCatalogIndex()`
  - [x] Render category card grid for loaded state
  - [x] Render `SkeletonText` card placeholders while loading
  - [x] Render themed `ErrorPage` on query error state

- [x] Task 3: Implement CategoryPage list UI (AC: 3, 4)
  - [x] Update `apps/reader/src/features/library/CategoryPage.tsx`
  - [x] Create `SutraListCard` component if missing
  - [x] Show title (Lora), subcategory, translator name, and route to `/read/:bookId`
  - [x] Enforce minimum 44x44px touch targets

- [x] Task 4: Route and constant integrity (AC: 3, 4)
  - [x] Use route constants from `shared/constants/routes.ts`
  - [x] Avoid hardcoded path strings
  - [x] Confirm deep-link navigation works from `/library/:category`

- [x] Task 5: Tests for browse and fallback behavior (AC: 1, 2, 3, 5)
  - [x] Add unit/component tests for loading, success, and error states
  - [x] Validate category card count and navigation behavior
  - [x] Validate no raw technical error strings are rendered to users

## Dev Notes

### Story Foundation

- This story depends on Story 2.1 query/data layer.
- Delivers FR1 and FR2 directly and prepares searchable domain model for Story 2.3.
- Must feel instant and calm in both online and offline cached scenarios.

### Technical Requirements

- Use `useCatalogIndex()` from shared hooks; no duplicate fetch logic in feature components.
- Category mapping should be memoized to avoid unnecessary recomputation on rerender.
- Category slug handling must be deterministic and URL-safe.

### Architecture Compliance

- Keep async state in TanStack Query and presentational state in local component state only.
- Use shared `ErrorPage` and `SkeletonText` rather than introducing new loading/error patterns.
- Keep typography separation: Lora for sutra title, UI labels in existing UI font system.

### Library / Framework Requirements

- Continue TanStack Query v5 object-based APIs and centralized `query.keys.ts`.
- Keep React Router navigation through constants and typed params where possible.
- Keep Tailwind utility classes and existing design tokens; no new visual system divergence.

### File Structure Requirements

- Target files:
  - `apps/reader/src/features/library/LibraryPage.tsx`
  - `apps/reader/src/features/library/CategoryPage.tsx`
  - `apps/reader/src/features/library/SutraListCard.tsx` (new if missing)
  - `apps/reader/src/features/library/library.types.ts` (if needed)
- Reuse shared components from `apps/reader/src/shared/components/`.

### Testing Requirements

- Component-level tests should assert:
  - skeleton render on loading
  - category cards and counts on success
  - calm error state on failure
  - click/tap navigation intents
- Include a touch target assertion strategy (class/style + RTL checks).

### Previous Story Intelligence

- Story 2.1 establishes schema/service/query boundaries; this story must consume, not bypass, those contracts.
- If 2.1 introduces typed `DataError`, map known categories to user-safe copy without exposing internals.

### Git Intelligence Summary

- Existing phase implementation favors strict file organization and centralized constants.
- Continue this pattern; avoid adding ad hoc utility folders or duplicated route constants.

### Latest Tech Information (as of 2026-03-07)

- `react-router-dom` in project is `^7.13.1`; keep route handling aligned with current API usage in repo.
- `@tanstack/react-query` remains on v5 line and supports stable long-lived cache semantics used by this story.
- `minisearch` v7 remains the selected search engine for Story 2.3; this story should shape data for easy indexing.

### Project Structure Notes

- Current `apps/reader/src/features/library/` already exists with `LibraryPage.tsx` and `CategoryPage.tsx`; evolve these instead of replacing architecture.
- No `project-context.md` found; use planning/architecture/UX docs as authority.

### References

- [Source: _bmad-output/planning-artifacts/phase-2-reader-ui/epics-reader-ui.md#Story 2.2]
- [Source: _bmad-output/planning-artifacts/phase-2-reader-ui/ux-design-specification-reader-ui.md#UX Consistency Patterns]
- [Source: _bmad-output/planning-artifacts/phase-2-reader-ui/architecture-reader-ui.md#Requirements to Structure Mapping]
- [Source: _bmad-output/planning-artifacts/phase-2-reader-ui/prd-reader-ui.md#Functional Requirements]
- [React Router docs](https://reactrouter.com/)
- [TanStack Query React docs (v5)](https://tanstack.com/query/v5/docs/framework/react)

## Dev Agent Record

### Agent Model Used

gpt-5-codex

### Debug Log References

- Epic requested: "whole phase 2 epic 2"
- Created as Epic 2 story batch item 2 of 3

### Completion Notes List

- Implemented category aggregation and deterministic slug resolution utilities for browse flow.
- Replaced `LibraryPage` placeholder with loading skeletons, calm error fallback, and category browse entrypoint.
- Replaced `CategoryPage` placeholder and added `SutraListCard` with Lora title, translator/subcategory metadata, and 44x44+ touch target.
- Added shared `ErrorPage` and `SkeletonText` components used by library surfaces.
- Added component tests covering loading/success/error and category deep-link rendering.
- Review fix: normalized both URL and stored category slugs during lookup to avoid false "category not found" cases.
- Review fix: encoded dynamic route segments to keep category/book links URL-safe.

### File List

- apps/reader/src/features/library/library.types.ts
- apps/reader/src/features/library/library.utils.ts
- apps/reader/src/features/library/CategoryGrid.tsx
- apps/reader/src/features/library/SutraListCard.tsx
- apps/reader/src/features/library/LibraryPage.tsx
- apps/reader/src/features/library/CategoryPage.tsx
- apps/reader/src/shared/components/ErrorPage.tsx
- apps/reader/src/shared/components/SkeletonText.tsx
- apps/reader/src/features/library/LibraryPage.test.tsx
- apps/reader/src/features/library/CategoryPage.test.tsx
- apps/reader/src/shared/constants/routes.ts

## Senior Developer Review (AI)

Date: 2026-03-07  
Reviewer: Minh (AI)
Outcome: Approved

Summary:
- Validated browse flows, loading skeletons, error UX, and tap targets against ACs.
- Fixed route/slug robustness issues found during adversarial review.
- Story status moved from `review` to `done`.

## Change Log

- 2026-03-07: Applied review fixes for slug normalization and URL-safe route segment encoding; approved and set status to `done`.
