# Story 1.8: Emit a transparent run report

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As the operator,
I want `sync.py all` to run the full pipeline and print a summary of what it did,
so that I can see exactly how many books were imported, skipped, or errored on every run.

## Acceptance Criteria

1. **Given** the full pipeline
   **When** `sync.py all` runs
   **Then** it executes **pull → index → compose → publish** in order (compose is part of index per Story 1.6; the externally visible order is pull → index(+compose) → publish).

2. **Given** a completed run
   **When** the report is emitted
   **Then** it reports counts for: **books considered, imported, skipped-pdf, skipped-duplicate, skipped-quality, and errors** (FR16)
   **And** also surfaces the Phase-5-specific skip buckets already produced upstream: skipped-excluded-category, dedup title-only **flagged-for-review**, and skipped-licensing (so no skip is invisible).

3. **Given** idempotency (FR17)
   **When** a second consecutive run executes with no upstream change
   **Then** the report shows **0 imported / 0 changed** (and 0 files copied), consistent with Story 1.7.

## Tasks / Subtasks

- [x] **Task 1: Threaded counters** (AC: #2)
  - [x] Introduce a lightweight `RunReport` accumulator passed through the pipeline (or returned and merged from each stage): `considered`, `imported`, `skipped_pdf`, `skipped_duplicate`, `skipped_quality`, `skipped_excluded_category`, `flagged_for_review`, `skipped_licensing`, `errors`, `files_copied`, `records_changed`.
  - [x] Each stage (1.3 filter, 1.4 dedup, 1.5 map/gate, 1.6 emit, 1.7 publish) increments its bucket and records per-book detail where useful.
- [x] **Task 2: `sync.py all` orchestration** (AC: #1)
  - [x] Chain pull → index(+compose) → publish; on a stage error, record into `errors` and fail clearly (do not pretend success).
- [x] **Task 3: Render the report** (AC: #2, #3)
  - [x] Print a concise human-readable summary at the end (counts table). Optionally also write a JSON report to disk for auditability.
  - [x] Ensure `files_copied` (from rsync/rclone) and `records_changed` (compose diff) are real, so a no-op run prints 0/0.
- [x] **Task 4: Tests**
  - [x] Given a mixed fixture set (epub, pdf-only, a duplicate, a no-cover book, an excluded-category book), the report counts match expectations.
  - [x] A second `index` run over identical staging reports 0 imported / 0 records changed (idempotency).
  - [x] `uv run pytest` green; `uv run ruff check .` clean.

## Dev Notes

- **This is the operator's trust surface (Journey 3).** Minh runs the sync, watches the report, runs again, expects 0 changes. The report is how the idempotency + non-destructiveness guarantees become *observable*. [Source: prd-onedrive-import.md#Journey-3, #Journey-4]
- **FR16 names six buckets; Phase 5 produces more.** The PRD FR16 lists considered/imported/skipped-pdf/skipped-duplicate/skipped-quality/errors. But D5 (excluded categories), D2.3 (title-only flagged-for-review), and D7 (licensing) each produce their own skip/flag reasons. Surface all of them so nothing is silently dropped — this aligns with the `on_unmapped: error` philosophy (no invisible drops). [Source: prd-onedrive-import.md#FR16, #D5, #D2, #D7]
- **`flagged-for-review` is NOT a skip** — those books are kept (Story 1.4). Report them separately so the operator can eyeball the 4 known title-collisions / any author-missing matches. [Source: prd-onedrive-import.md#D2]
- **Counts feed acceptance numbers:** measurable outcome is ~2,020 imported, 323 excluded, 0 dead-ends. The report is how you verify the run matched the plan. [Source: category-mapping.yaml#meta, prd-onedrive-import.md#Measurable-Outcomes]
- **`sync.py all` is the devbox `sync-books` entry** (Story 1.1 wired the script). [Source: architecture-onedrive-import.md#Repo-Layout-Invocation]

### Project Structure Notes

- Adds a `RunReport` (small module or dataclass) threaded through `sync.py`. No new external deps.
- Final story of Epic 1 — after this, `devbox run sync-books` runs the whole pipeline and prints a verifiable summary. The epic is verifiable end-to-end against the served `onedrive/index.json` without the reader.

### References

- [Source: epics-onedrive-import.md#Story-1.8]
- [Source: prd-onedrive-import.md#FR16, #FR17]
- [Source: prd-onedrive-import.md#Journey-3, #Journey-4, #Measurable-Outcomes]
- [Source: architecture-onedrive-import.md#Repo-Layout-Invocation]

## Dev Agent Record

### Agent Model Used
claude-sonnet-4-6

### Debug Log References
None.

### Completion Notes List
- `report.py`: `RunReport` dataclass (all FR16 + Phase-5 buckets: considered/imported/skipped_pdf/skipped_duplicate/skipped_quality/skipped_excluded_category/flagged_for_review/skipped_licensing/errors/records_changed/files_copied/flagged_titles). `render_report()` prints aligned table.
- `sync.py index` now populates and returns `RunReport` alongside index data. `records_changed` computed as symmetric diff of onedrive: ids between prior and new index.
- `sync.py all` chains pull → index → publish → `render_report()`.
- 5 new tests: count accumulation, render format, zero-run, idempotency records_changed=0, mixed pipeline counts.
- 51 total tests pass; ruff clean.

### File List
- apps/onedrive-sync/report.py (new)
- apps/onedrive-sync/sync.py (modified — index returns RunReport, all prints it)
- apps/onedrive-sync/tests/test_report.py (new)

### Change Log
- 2026-06-06: Implemented story 1.8 — RunReport accumulator, render_report, threaded through full pipeline.
