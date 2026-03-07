# Story 3.2: Reader Page & Book Data Loading

Status: review

## Story

As a **user**,
I want to open a sutra from the library and see it begin loading immediately,
so that I can start reading without waiting for a slow network request.

## Acceptance Criteria

1. **Given** the user taps a `<SutraListCard>` or search result
   **When** navigation to `/read/:bookId` occurs
   **Then** `ReaderPage` renders and immediately calls `useBook(bookId)` via TanStack Query

2. **Given** `useBook(id)` fetches `/book-data/{id}.json` and validates with `book.schema.ts`
   **When** data is loading
   **Then** `<SkeletonText>` blocks fill the reading area with pulsing lines matching the expected text line-height

3. **Given** the book JSON is cached by TanStack Query from a previous visit
   **When** `ReaderPage` mounts
   **Then** the book renders instantly with zero network requests

4. **Given** `reader.store.ts` (Zustand) with fields `{ bookId, pages, currentPage, isChromeVisible }`
   **When** book data loads successfully
   **Then** `reader.store.setBookId(id)` and `reader.store.setPages([])` are called to reset state for the new book

5. **Given** the book JSON fails Zod validation
   **When** `useBook` returns an error
   **Then** `<ReaderErrorPage>` renders with a calm message: "Không thể tải nội dung kinh này" and a back link to the Library

## Tasks / Subtasks

- [x] Task 1: Introduce reader feature state contract (AC: 4)
  - [x] Create `apps/reader/src/stores/reader.store.ts`
  - [x] Include fields: `bookId`, `pages`, `currentPage`, `isChromeVisible`
  - [x] Include actions: `setBookId`, `setPages`, `setCurrentPage`, `toggleChrome`, `reset`

- [x] Task 2: Build Reader error and loading surfaces (AC: 2, 5)
  - [x] Create `apps/reader/src/features/reader/ReaderErrorPage.tsx`
  - [x] Reuse `SkeletonText` for loading placeholders in reader viewport
  - [x] Ensure calm copy and navigation path back to `ROUTES.LIBRARY`

- [x] Task 3: Upgrade ReaderPage from placeholder (AC: 1, 2, 3, 4, 5)
  - [x] Update `apps/reader/src/features/reader/ReaderPage.tsx`
  - [x] Resolve `bookId` from route params and call `useBook(bookId)` immediately
  - [x] Handle loading/error/success paths with clear branching
  - [x] On success, reset reader state via store actions before rendering engine shell

- [x] Task 4: Add tests for data loading behavior (AC: 1, 2, 3, 5)
  - [x] Create `apps/reader/src/features/reader/ReaderPage.test.tsx`
  - [x] Assert loading skeleton visibility
  - [x] Assert cached data renders without loading fallback flash
  - [x] Assert validation/network error maps to `ReaderErrorPage`

## Dev Notes

### Story Foundation

- This story introduces the real `/read/:bookId` entrypoint UX.
- It consumes Epic 2 data layer outputs (`useBook`) and prepares state for Story 3.3 pagination rendering.
- It directly supports FR5 and FR8.

### Technical Requirements

- Route param handling must be resilient to empty/invalid `bookId`.
- Keep a strict UI state machine: `loading -> error|success` with no ambiguous mixed state.
- Reset pages on book change to avoid stale content bleed between books.

### Architecture Compliance

- Data fetch stays in TanStack Query hook (`useBook`), not in component side-effect fetches.
- Persistent/interactive reader state lives in Zustand store.
- Error copy must be user-safe and never expose raw schema/stack output.

### Library / Framework Requirements

- Continue using TanStack Query v5 object API conventions already established.
- Use `react-router-dom` route params and existing route constants helpers.
- Reuse shared UI components (`SkeletonText`, `ErrorPage` patterns) for consistency.

### File Structure Requirements

- Target files:
  - `apps/reader/src/features/reader/ReaderPage.tsx`
  - `apps/reader/src/features/reader/ReaderErrorPage.tsx`
  - `apps/reader/src/stores/reader.store.ts`
  - `apps/reader/src/features/reader/ReaderPage.test.tsx`
- Keep shared types in `shared/types` only when cross-feature reuse is needed.

### Testing Requirements

- Include tests for loading, parse failure, and cached-success path.
- Include store reset assertion when switching from one `bookId` to another.
- Ensure tests avoid network dependency by mocking `useBook` or service layer.

### Previous Story Intelligence

- Story 3.1 defines pagination contract but does not render UI; this story must stop at loading and state prep.
- Epic 2 proved calm fallback and skeleton-first loading patterns; replicate that style.

### References

- [Source: _bmad-output/planning-artifacts/phase-2-reader-ui/epics-reader-ui.md#Story 3.2]
- [Source: _bmad-output/planning-artifacts/phase-2-reader-ui/architecture-reader-ui.md#Data Flow]
- [Source: _bmad-output/planning-artifacts/phase-2-reader-ui/architecture-reader-ui.md#Requirements to Structure Mapping]
- [Source: _bmad-output/planning-artifacts/phase-2-reader-ui/ux-design-specification-reader-ui.md#UX Consistency Patterns]
- [Source: _bmad-output/planning-artifacts/phase-2-reader-ui/prd-reader-ui.md#Functional Requirements]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- Implemented as part of YOLO batch: stories 3.2–3.5

### Completion Notes List

- Created `stores/reader.store.ts` with Zustand v5: bookId, pages, currentPage, isChromeVisible + all actions.
- Created `ReaderErrorPage.tsx` with DataErrorCategory-mapped messages (extended upfront for Story 3.5).
- Updated `ReaderPage.tsx`: loading skeleton → error page → ChromelessLayout+ReaderEngine success.
- `setBookId` + `setPages([])` called via `useEffect` when book data arrives.
- 6 tests cover loading, cached, network error, parse error, store reset paths — all pass.

### File List

- apps/reader/src/stores/reader.store.ts (new)
- apps/reader/src/features/reader/ReaderErrorPage.tsx (new)
- apps/reader/src/features/reader/ReaderPage.tsx (updated)
- apps/reader/src/features/reader/ReaderPage.test.tsx (new)
- _bmad-output/implementation-artifacts/phase-2-reader-ui/3-2-reader-page-and-book-data-loading.md (updated)

## Change Log

- 2026-03-07: Implemented Story 3.2 — reader page & book data loading (claude-sonnet-4-6)
