# Story 2.1: Data Layer - Schemas, Services & Query Hooks

Status: done

## Story

As a **developer**,
I want a validated data layer with Zod schemas, service interfaces, and TanStack Query hooks,
so that all components fetch and consume Phase 1 JSON data consistently and safely.

## Acceptance Criteria

1. **Given** `shared/schemas/catalog.schema.ts` with a Zod schema for `index.json`
   **When** `catalog.schema.safeParse()` is called with valid Phase 1 catalog JSON
   **Then** it returns a typed `CatalogIndex` object with `books` array and category metadata

2. **Given** `shared/schemas/book.schema.ts` with a Zod schema for individual book JSON
   **When** `book.schema.safeParse()` is called with a Phase 1 book file
   **Then** it returns a typed `Book` object including `id`, `title`, `category`, `subcategory`, and `content` (array of paragraph strings)

3. **Given** `DataService` interface in `shared/services/data.service.ts` with methods `getCatalog()` and `getBook(id)`
   **When** `StaticJsonDataService` implements this interface
   **Then** it fetches from `${import.meta.env.VITE_BOOK_DATA_URL}/book-data/index.json` and `/book-data/{id}.json`, validates with Zod, and throws a typed `DataError` on parse failure

4. **Given** `shared/constants/query.keys.ts` with factory functions
   **When** any component calls `queryKeys.catalog()` or `queryKeys.book(id)`
   **Then** it returns a stable, typed array key; no inline array literals exist in any component file

5. **Given** `QueryClient` configured in `main.tsx` with `staleTime: Infinity` and `gcTime: Infinity`
   **When** `useCatalogIndex()` is called from any component
   **Then** the catalog JSON is fetched once, cached indefinitely for the session, and never re-fetched on component remount

6. **Given** a Vitest unit test for `StaticJsonDataService`
   **When** the mock server returns valid catalog JSON
   **Then** `getCatalog()` resolves with a correctly typed `CatalogIndex`
   **And** when the mock returns malformed JSON, `getCatalog()` rejects with a `DataError`

## Tasks / Subtasks

- [x] Task 1: Add schema contracts and shared types (AC: 1, 2)
  - [x] Create `apps/reader/src/shared/schemas/catalog.schema.ts`
  - [x] Create `apps/reader/src/shared/schemas/book.schema.ts`
  - [x] Create or update `apps/reader/src/shared/types/global.types.ts` with `CatalogIndex`, `CatalogBook`, `Book`, and `BookParagraph`
  - [x] Validate and normalize at schema boundary only (no component-level normalization)

- [x] Task 2: Implement service layer contracts (AC: 3)
  - [x] Create `apps/reader/src/shared/services/data.service.ts`
  - [x] Define `DataService`, `StaticJsonDataService`, and typed `DataError`
  - [x] Use `VITE_BOOK_DATA_URL` with safe fallback for local and GitHub Pages modes
  - [x] Return parsed typed values only after Zod `safeParse` success

- [x] Task 3: Implement TanStack Query key and hook layer (AC: 4, 5)
  - [x] Create `apps/reader/src/shared/constants/query.keys.ts`
  - [x] Add `queryKeys.catalog()`, `queryKeys.book(id)`, `queryKeys.category(slug)` factories
  - [x] Create `apps/reader/src/shared/hooks/useCatalogIndex.ts`
  - [x] Create `apps/reader/src/shared/hooks/useBook.ts`
  - [x] Ensure hook calls use object-based query API and factory keys only

- [x] Task 4: Wire QueryClient defaults (AC: 5)
  - [x] Verify `apps/reader/src/main.tsx` QueryClient has `staleTime: Infinity`, `gcTime: Infinity`
  - [x] Ensure no feature overrides these defaults without explicit requirement

- [x] Task 5: Add unit tests for service and schema behavior (AC: 6)
  - [x] Create `apps/reader/src/shared/services/data.service.test.ts`
  - [x] Mock fetch success and malformed payload scenarios
  - [x] Assert typed success path and `DataError` failure path

- [x] Task 6: Enforce consistency and guardrails (AC: 3, 4)
  - [x] Keep `localStorage`/`indexedDB` direct access blocked by ESLint rules
  - [x] Keep query keys centralized; no inline array query keys

## Dev Notes

### Story Foundation

- Epic objective: establish offline-capable discovery foundation before UI browse/search stories.
- Business value: robust, validated data boundary reduces runtime crashes and ensures predictable offline behavior.
- This story is a hard prerequisite for Story 2.2 (category browse) and Story 2.3 (search).

### Technical Requirements

- All Phase 1 JSON must be validated at service boundary before entering app state.
- `DataError` must carry machine-usable category (`network`, `parse`, `not_found`, `unknown`) for UI mapping.
- Keep hooks thin: fetch/parse in service layer, caching in TanStack Query, UI state in components/stores.

### Architecture Compliance

- Keep async/server state in TanStack Query; do not mirror server payloads into Zustand.
- Respect boundary: `Component -> Query Hook -> DataService -> fetch -> Zod`.
- Maintain absolute imports via `@/` across feature boundaries.
- Follow naming conventions from architecture (`*.schema.ts`, `*.service.ts`, `query.keys.ts`).

### Library / Framework Requirements

- Use object API for TanStack Query v5 hooks (`useQuery({ queryKey, queryFn })`), not overloaded signatures.
- Keep `@tanstack/react-query` at project-pinned v5 line and use `gcTime` terminology (v5 rename from `cacheTime`).
- Keep `zod` at project-pinned v4 line and use `safeParse` to avoid throw-first control flow.
- Keep `localforage` access out of this story scope; storage belongs to Epic 4.

### File Structure Requirements

- New files should live under:
  - `apps/reader/src/shared/schemas/`
  - `apps/reader/src/shared/services/`
  - `apps/reader/src/shared/constants/`
  - `apps/reader/src/shared/hooks/`
- Do not add feature-level data fetch logic directly inside `features/library/*` yet.

### Testing Requirements

- Unit tests are mandatory for service happy-path + malformed payload + missing payload.
- Add schema fixtures for realistic Phase 1 JSON shapes.
- Ensure tests run through current `vitest.config.ts` without custom runner hacks.

### Previous Story Intelligence

- Epic 1 is complete and established these patterns:
  - monorepo layout in `apps/reader/`
  - strict lint/typecheck/test gates
  - route constants and app shell skeleton already present
- Reuse existing scaffold patterns rather than introducing alternate app architecture.

### Git Intelligence Summary

- Recent commits show a docs-first and guardrail-first cadence (`README`, CI/lint hardening).
- Maintain this by adding clear source references in code comments only where needed and keeping standards strict.

### Latest Tech Information (as of 2026-03-07)

- `@tanstack/react-query` v5 is the active major; v5 migration guidance confirms object-style hook API and `gcTime` terminology.
- `zod` latest npm line is v4.x; project is already pinned to `^4.3.6`, compatible with schema-first validation.
- `minisearch` npm line is v7.x (project currently `^7.2.0`), matching Epic 2 search requirements for Story 2.3.
- `localforage` remains at `1.10.0`; no newer stable npm release indicated in sources.

### Project Structure Notes

- No `project-context.md` discovered in repository; rely on architecture/PRD/UX artifacts as primary context.
- This story should not modify reader UX components except for integration touchpoints needed to consume hooks.

### References

- [Source: _bmad-output/planning-artifacts/phase-2-reader-ui/epics-reader-ui.md#Story 2.1]
- [Source: _bmad-output/planning-artifacts/phase-2-reader-ui/architecture-reader-ui.md#Data Architecture]
- [Source: _bmad-output/planning-artifacts/phase-2-reader-ui/architecture-reader-ui.md#Implementation Patterns & Consistency Rules]
- [Source: _bmad-output/planning-artifacts/phase-2-reader-ui/prd-reader-ui.md#Functional Requirements]
- [TanStack Query v5 announcement](https://tanstack.com/blog/announcing-tanstack-query-v5)
- [TanStack Query React docs (v5)](https://tanstack.com/query/v5/docs/framework/react)
- [Zod npm](https://www.npmjs.com/package/zod)
- [MiniSearch npm](https://www.npmjs.com/package/minisearch)
- [localforage npm](https://www.npmjs.com/package/localforage)

## Dev Agent Record

### Agent Model Used

gpt-5-codex

### Debug Log References

- Epic requested: "whole phase 2 epic 2"
- Created as Epic 2 story batch item 1 of 3

### Completion Notes List

- Implemented Zod-backed catalog and book schema boundaries with normalized shared types.
- Added `DataService`/`StaticJsonDataService` with typed `DataError` categories (`network`, `parse`, `not_found`, `unknown`).
- Added centralized query key factories and TanStack Query hooks using v5 object API.
- Wired app-level `QueryClient` defaults with `staleTime: Infinity` and `gcTime: Infinity`.
- Added unit coverage for service success, parse failure, not-found, and book content normalization paths.

### File List

- apps/reader/src/shared/types/global.types.ts
- apps/reader/src/shared/schemas/catalog.schema.ts
- apps/reader/src/shared/schemas/book.schema.ts
- apps/reader/src/shared/services/data.service.ts
- apps/reader/src/shared/services/data.service.test.ts
- apps/reader/src/shared/constants/query.keys.ts
- apps/reader/src/shared/hooks/useCatalogIndex.ts
- apps/reader/src/shared/hooks/useBook.ts
- apps/reader/src/main.tsx

## Senior Developer Review (AI)

Date: 2026-03-07  
Reviewer: Minh (AI)
Outcome: Approved

Summary:
- Acceptance criteria validated against implementation and tests.
- No open HIGH or MEDIUM findings remain after follow-up fixes in sibling Epic 2 stories.
- Story status moved from `review` to `done`.

## Change Log

- 2026-03-07: Completed adversarial review pass; approved and set story status to `done`.
