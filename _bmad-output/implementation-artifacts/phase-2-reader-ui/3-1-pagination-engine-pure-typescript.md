# Story 3.1: Pagination Engine (Pure TypeScript)

Status: review

## Story

As a **developer**,
I want a standalone, testable pagination engine that splits paragraph arrays into viewport-sized pages,
so that the reader can calculate page breaks in under 100ms without blocking the UI thread.

## Acceptance Criteria

1. **Given** `lib/pagination/paginateBook.ts` exports `paginateBook(paragraphs: string[], options: PaginationOptions): string[][]`
   **When** called with any input
   **Then** it has zero imports from React, DOM APIs, Zustand, or TanStack Query - pure TypeScript only

2. **Given** `PaginationOptions` includes `{ viewportHeight: number, fontSize: number, lineHeight: number, paddingVertical: number }`
   **When** `paginateBook` is called
   **Then** each returned page contains only paragraphs that fit within `viewportHeight` given the font metrics - no paragraph is split across pages

3. **Given** a Vitest unit test calling `paginateBook` with an array of 500 paragraphs
   **When** the test runs
   **Then** it completes in under 100ms (measured via `performance.now()`) and asserts this as a test condition

4. **Given** an array of 0 paragraphs
   **When** `paginateBook` is called
   **Then** it returns `[[]]` (one empty page) without throwing

5. **Given** a single paragraph longer than the viewport height
   **When** `paginateBook` is called
   **Then** that paragraph occupies its own page (no infinite loop, no crash)

## Tasks / Subtasks

- [x] Task 1: Create pagination domain contracts (AC: 1, 2)
  - [x] Create `apps/reader/src/lib/pagination/pagination.types.ts` with `PaginationOptions`
  - [x] Include optional extension-friendly fields only if required by tests (keep base API minimal)
  - [x] Document assumptions for line-height and vertical padding in code comments

- [x] Task 2: Implement pure pagination engine (AC: 1, 2, 4, 5)
  - [x] Create `apps/reader/src/lib/pagination/paginateBook.ts`
  - [x] Ensure zero framework imports (React/DOM/Zustand/Query)
  - [x] Implement deterministic grouping algorithm without splitting paragraphs across pages
  - [x] Guard against empty inputs and overlong single-paragraph edge case

- [x] Task 3: Add performance and edge-case unit tests (AC: 3, 4, 5)
  - [x] Create `apps/reader/src/lib/pagination/paginateBook.test.ts`
  - [x] Add test fixture generator for 500 synthetic paragraphs
  - [x] Assert runtime budget `< 100ms` using `performance.now()`
  - [x] Add tests for `[] -> [[]]` and long paragraph no-loop behavior

- [x] Task 4: Integrate exports for future reader usage (supports AC: 1)
  - [x] Add any required exports (without introducing a root-level barrel)
  - [x] Confirm import path ergonomics for upcoming Story 3.3 (`ReaderEngine`)

## Dev Notes

### Story Foundation

- Epic 3 objective is instant, paginated reading with chromeless immersion.
- Story 3.1 is the load-bearing technical foundation for Stories 3.3 and 5.1.
- Business value: prevents janky reader UX by making page data precomputed and deterministic.

### Technical Requirements

- Algorithm must be deterministic: same inputs yield identical pagination output.
- Preserve paragraph boundaries; never split text content inside a paragraph.
- Complexity target should be linear in paragraph count for predictable scaling.
- Keep all viewport/font math explicit in helper functions for easy test coverage.

### Architecture Compliance

- Keep pagination in `src/lib/pagination/` as a pure utility boundary.
- `ReaderEngine` will call this via `useMemo`; do not couple engine to render cycle concerns here.
- Respect architecture rule: no React/DOM logic in pagination module.

### Library / Framework Requirements

- Use existing TypeScript strict setup and Vitest test harness.
- Prefer built-in `performance.now()` for threshold measurement in tests.
- No third-party pagination libraries; this must remain custom/pure TypeScript.

### File Structure Requirements

- New files for this story:
  - `apps/reader/src/lib/pagination/pagination.types.ts`
  - `apps/reader/src/lib/pagination/paginateBook.ts`
  - `apps/reader/src/lib/pagination/paginateBook.test.ts`
- Do not place pagination logic inside `features/reader/`.

### Testing Requirements

- Include deterministic snapshot-like assertions for stable page boundaries.
- Include performance budget assertion under CI conditions.
- Include edge cases: empty array, exact-fit paragraphs, overlong single paragraph.

### Previous Story Intelligence

- Epic 2 established strict guardrails (typed contracts, centralized constants, calm fallback patterns).
- Preserve the same quality bar: isolated module + tests before UI wiring.

### Git Intelligence Summary

- Recent commits show incremental implementation with review-driven hardening.
- Keep this story focused and isolated; avoid broad refactors while introducing pagination core.

### Latest Tech Information (project baseline, 2026-03-07)

- Project uses `typescript~5.9.3` and `vitest^4.0.18`; new tests should follow current runner conventions.
- Reader stack remains React 18 + Vite 7; this story should stay framework-agnostic despite UI stack versioning.

### Project Structure Notes

- `apps/reader/src/features/reader/ReaderPage.tsx` is currently a placeholder; this story should not convert it yet.
- Keep the implementation seam ready for Story 3.3 integration.

### References

- [Source: _bmad-output/planning-artifacts/phase-2-reader-ui/epics-reader-ui.md#Story 3.1]
- [Source: _bmad-output/planning-artifacts/phase-2-reader-ui/architecture-reader-ui.md#Frontend Architecture]
- [Source: _bmad-output/planning-artifacts/phase-2-reader-ui/architecture-reader-ui.md#Implementation Sequence]
- [Source: _bmad-output/planning-artifacts/phase-2-reader-ui/prd-reader-ui.md#Non-Functional Requirements]
- [Source: _bmad-output/planning-artifacts/phase-2-reader-ui/ux-design-specification-reader-ui.md#Core User Experience]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- User request: `bmad-bmm-dev-story phase 2 epic 3`
- Story discovered as first ready-for-dev in Epic 3 sprint status

### Completion Notes List

- Generated implementation-ready story context for pagination engine foundation.
- Added hard guardrails to prevent UI framework leakage into algorithm layer.
- Added explicit performance and edge-case test expectations aligned with NFR2.
- Implemented `paginateBook.ts` as pure TypeScript with zero React/DOM/Zustand/Query imports.
- Algorithm: O(n) greedy packer; each paragraph height = `fontSize * lineHeight`; overlong paragraphs get own page.
- 13 tests written covering AC 1–5: empty input, determinism, page capacity bounds, overlong paragraphs, performance budget.
- Performance budget assertion confirmed sub-millisecond (<<100ms) under Vitest runner.
- All 32 tests in full suite pass with zero regressions.
- Export barrel `index.ts` added at `src/lib/pagination/index.ts` for Story 3.3 ergonomics.

### File List

- apps/reader/src/lib/pagination/pagination.types.ts (new)
- apps/reader/src/lib/pagination/paginateBook.ts (new)
- apps/reader/src/lib/pagination/paginateBook.test.ts (new)
- apps/reader/src/lib/pagination/index.ts (new)
- _bmad-output/implementation-artifacts/phase-2-reader-ui/3-1-pagination-engine-pure-typescript.md (updated)
- _bmad-output/implementation-artifacts/phase-2-reader-ui/sprint-status-phase-2-reader-ui.yaml (updated)

## Change Log

- 2026-03-07: Implemented Story 3.1 — pagination engine foundation (claude-sonnet-4-6)
