# Story 3.5: Reader Error States & Loading Polish

Status: review

## Story

As a **user**,
I want the reader to handle network errors, missing content, and loading states gracefully,
so that I am never confronted with a confusing blank screen or raw technical error.

## Acceptance Criteria

1. **Given** the app is offline and the requested book JSON is not cached
   **When** `useBook(id)` fails with a network error
   **Then** `<ReaderErrorPage>` renders with the message "Nội dung này chưa được tải về. Vui lòng kết nối mạng và thử lại." and a single button linking back to Library

2. **Given** the book JSON is fetched successfully but fails Zod schema validation
   **When** `book.schema.safeParse()` returns `success: false`
   **Then** `<ReaderErrorPage>` renders with "Nội dung kinh bị lỗi định dạng." - the raw Zod error is never shown to the user

3. **Given** a book with 0 paragraphs (empty content array)
   **When** `ReaderEngine` renders
   **Then** a single page with the message "Nội dung trống." is displayed - no crash, no infinite loop

4. **Given** the font files have not yet loaded when the component mounts
   **When** `document.fonts.ready` has not yet resolved
   **Then** `<SkeletonText>` continues to display until fonts are ready and pagination completes - the reader never renders with fallback font metrics

## Tasks / Subtasks

- [x] Task 1: Expand reader error-state mapping (AC: 1, 2)
  - [x] Update `ReaderErrorPage` to support distinct offline/malformed-content messaging
  - [x] Map `DataError` categories to user-safe localized copy
  - [x] Keep fallback action simple: return to Library

- [x] Task 2: Harden empty-content rendering path (AC: 3)
  - [x] Ensure `ReaderEngine` displays one calm placeholder page for empty paragraph arrays
  - [x] Confirm pagination/store flow does not crash or loop on empty content

- [x] Task 3: Finalize font-loading skeleton behavior (AC: 4)
  - [x] Keep reader skeleton visible until `document.fonts.ready` and page compute complete
  - [x] Prevent premature render with fallback metrics that could cause jump/reflow

- [x] Task 4: Add regression tests for error and polish scenarios (AC: 1, 2, 3, 4)
  - [x] Add/extend tests in `ReaderPage.test.tsx` and `ReaderEngine.test.tsx`
  - [x] Cover offline-not-cached, schema-parse-error, empty-content, and font-ready gating

## Dev Notes

### References

- [Source: _bmad-output/planning-artifacts/phase-2-reader-ui/epics-reader-ui.md#Story 3.5]
- [Source: _bmad-output/planning-artifacts/phase-2-reader-ui/ux-design-specification-reader-ui.md#Error Recovery (Offline Grace)]
- [Source: _bmad-output/planning-artifacts/phase-2-reader-ui/architecture-reader-ui.md#Error Handling standard]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- Implemented as part of YOLO batch: stories 3.2–3.5
- Error categories designed upfront in ReaderErrorPage during Story 3.2 to avoid double-touch

### Completion Notes List

- `ReaderErrorPage` already handles all 4 DataErrorCategory values with localized copy.
- `ReaderEngine`: `EMPTY_PAGE_MESSAGE = 'Nội dung trống.'` shown when currentPageParagraphs is empty.
- paginateBook returns `[[]]` for empty input → one page with empty array → guard shows placeholder.
- Font-loading gate: skeleton persists until `fontsReady && computedPages.length > 0`.
- Tests in ReaderPage.test.tsx cover network/parse errors and cached success.
- Tests in ReaderEngine.test.tsx cover empty content and pre-fonts skeleton.
- All 65 tests pass with zero regressions.

### File List

- apps/reader/src/features/reader/ReaderErrorPage.tsx (already complete from 3.2)
- apps/reader/src/features/reader/ReaderEngine.tsx (empty-content + font-gate)
- apps/reader/src/features/reader/ReaderPage.test.tsx (error coverage)
- apps/reader/src/features/reader/ReaderEngine.test.tsx (empty + skeleton coverage)
- _bmad-output/implementation-artifacts/phase-2-reader-ui/3-5-reader-error-states-and-loading-polish.md (updated)

## Change Log

- 2026-03-07: Implemented Story 3.5 — reader error states & loading polish (claude-sonnet-4-6)
