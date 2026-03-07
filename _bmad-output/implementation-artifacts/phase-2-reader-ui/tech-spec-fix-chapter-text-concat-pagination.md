---

## title: 'Fix Chapter Text Concatenation Before Pagination'
slug: 'fix-chapter-text-concat-pagination'
created: '2026-03-07'
status: 'completed'
stepsCompleted: [1, 2, 3, 4, 5]
tech_stack: ['TypeScript', 'Zod', 'Vitest']
files_to_modify: ['apps/reader/src/shared/schemas/book.schema.ts']
code_patterns: ['zod-transform', 'pure-function-normalization']
test_patterns: ['vitest-describe-it-expect', 'fixture-helpers', 'no-dom-required']

# Tech-Spec: Fix Chapter Text Concatenation Before Pagination

**Created:** 2026-03-07

## Overview

### Problem Statement

`normalizeParagraphs()` in `book.schema.ts` loops **chapter → page → one flat paragraph string per data-page**. Because `.replace(/\s+/g, ' ')` collapses newlines, each data-page becomes a single string. The DOM paginator then treats each short data-page as one independent paragraph — if it fits on screen alone, it leaves a blank area and the next page's content begins disconnected, breaking reading flow.

### Solution

Inside `normalizeParagraphs()`, for each chapter, collect all data-pages' text first, preserve `\n` separators, then split on `\n` to produce fine-grained paragraph strings. Push the full set of chapter paragraphs into the output. The DOM paginator receives natural paragraphs that flow freely across screen pages — no artificial data-page boundaries.

### Scope

**In Scope:**

- Modify `normalizeParagraphs()` in `apps/reader/src/shared/schemas/book.schema.ts` to concat all pages per chapter before splitting into paragraphs
- Fix whitespace normalization to collapse only within-line whitespace, not `\n` separators
- Update/add unit tests in `apps/reader/src/shared/schemas/book.schema.test.ts` (or nearby) to cover the fix

**Out of Scope:**

- `useDOMPagination.ts` — no changes
- `ReaderEngine.tsx` — no changes
- Reader store — no changes
- Any data fetching or API layer

## Context for Development

### Codebase Patterns

- `bookSchema` uses `rawBookSchema.transform()` — the `normalizeParagraphs()` function runs inside that transform
- `BookParagraph` = `string` (see `global.types.ts`)
- `book.content` is `string[]` passed directly to `ReaderEngine` as `paragraphs` prop
- Tests use Vitest + Testing Library; schema tests would be unit tests with plain JS objects

### Files to Reference


| File                                                  | Purpose                                                  |
| ----------------------------------------------------- | -------------------------------------------------------- |
| `apps/reader/src/shared/schemas/book.schema.ts`       | Contains `normalizeParagraphs()` — primary change target |
| `apps/reader/src/shared/types/global.types.ts`        | `Book` and `BookParagraph` type definitions              |
| `apps/reader/src/features/reader/useDOMPagination.ts` | Receives `paragraphs: string[]` — read-only reference    |


### Technical Decisions

- Preserve `\n` during HTML stripping by splitting BEFORE collapsing whitespace
- Within each paragraph (after split), collapse runs of spaces only (not newlines)
- Empty strings after split + trim are filtered out

## Implementation Plan

### Tasks

1. [x] **Modify `normalizeParagraphs()` in `apps/reader/src/shared/schemas/book.schema.ts`**
  Replace the current per-page push with a per-chapter accumulation + split strategy:
   **Current logic (lines 50–76):**
   **New logic:**
2. [x] **Add/update unit tests** in `apps/reader/src/shared/schemas/` (create `book.schema.test.ts` if it doesn't exist):
  - **Multi-page chapter flows together**: Given a chapter with 2 short pages, `book.content` should have multiple paragraph strings from both pages (not 2 big blobs), and none should be blank.
  - **Multi-chapter isolation**: Chapter boundary is preserved — paragraphs from chapter A all appear before chapter B's paragraphs.
  - **HTML entities still decoded**: `&Agrave;` → `À` still works post-refactor.
  - **Empty pages skipped**: Pages with null/empty `html_content` produce no output.

### Acceptance Criteria

**AC1 – Chapter pages concatenated before pagination:**

- Given a chapter with 3 data-pages each containing 1 short sentence, when `normalizeParagraphs()` runs, then `book.content` contains 3 separate paragraph strings (not 3 large blobs), all accessible to the DOM paginator in sequence.

**AC2 – No blank-space pages from short data-pages:**

- Given that `book.content` now contains fine-grained paragraphs, when the DOM paginator lays them out, then no screen-page is blank or shows only one short sentence followed by empty space (verified by existing pagination tests passing).

**AC3 – HTML `<br>` and block tags split into separate paragraphs:**

- Given `<p>Line A</p><p>Line B</p>` as page HTML, when normalized, then `book.content` includes `'Line A'` and `'Line B'` as separate entries.

**AC4 – Empty/null pages produce no output:**

- Given a page with `html_content: null` and `original_html_content: null`, when normalized, then no empty string is added to `book.content`.

**AC5 – Multi-chapter order preserved:**

- Given 2 chapters each with 2 pages, when normalized, then all paragraphs from chapter 1 appear before all paragraphs from chapter 2 in `book.content`.

## Review Notes

- Adversarial review completed
- Findings: 13 total, 12 fixed, 1 skipped (F5 undecided — pre-existing regex limitation unrelated to this fix)
- Resolution approach: auto-fix

## Additional Context

### Dependencies

None — this is a pure transform function change with no new dependencies.

### Testing Strategy

Unit tests on `normalizeParagraphs()` (exported or tested via `bookSchema.parse()`). No DOM required. Run with `pnpm -F reader test` or `vitest run`.

### Notes

- `sessionStorage` cache in `useDOMPagination` is keyed on `paragraphs.length` — after the fix, paragraph count will increase (more fine-grained), which will naturally invalidate any stale cache entries. No manual cache busting needed.
- `PageProgress` currently returns `null` (line 7 of `PageProgress.tsx`) — unrelated to this fix.

