# Story 4.2: Run Summary Report + Corpus Quality Audit

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want `validate.py` to generate a run summary report with corpus-wide quality metrics,
So that I can confirm all quality gates are met before Phase 2 handoff.

## Acceptance Criteria

1. **Given** `data/crawl-state.json` and all `.meta.json` files exist
   **When** I run `validate.py`
   **Then** a run summary report is printed to stdout containing:
   - Total records downloaded, skipped, errored (from crawl-state.json)
   - Total `.meta.json` files found
   - Schema validation pass/fail counts
   - Duplicate file count and percentage (computed from SHA-256 hashes across corpus)
   - Metadata field coverage: percentage of records with all required fields populated

2. **Given** the corpus is audited for duplicates
   **When** SHA-256 hashes are compared across all downloaded files
   **Then** the duplicate rate is reported: `Duplicate rate: {X}% ({N} duplicates of {Total} files)`
   **And** if duplicate rate exceeds 2%, a WARNING is printed: `[WARN] Duplicate rate {X}% exceeds 2% threshold`

3. **Given** metadata field coverage is computed
   **When** required fields are checked across all records
   **Then** coverage is reported per field: e.g., `title: 100%, author_translator: 72%, title_pali: 31%`
   **And** if overall required-field coverage drops below 90%, a WARNING is printed (NFR6)

## Tasks / Subtasks

- [x] Parse `data/crawl-state.json` to count downloaded, skipped, errored records
- [x] Implement deduplication analysis
  - [x] Hash all raw files referenced by `.meta.json` and calculate duplicates
- [x] Implement field coverage analysis
  - [x] Iterate over all records and calculate presence % of each field
- [x] Generate summary report
  - [x] Output metrics in a readable format
  - [x] Apply logic to output warnings if duplicate rate > 2% or required field coverage < 90%

## Dev Notes

### Technical Requirements
- Utilize `utils.dedup` module if helpful, or use Python `hashlib.sha256` to hash the data `data/raw/` files.
- The `data/crawl-state.json` needs to be read.

### Architecture Compliance
- Use `logging` setup from `utils/logging.py`.
- Duplicate checking must use SHA-256 hex digest for content-based deduplication comparison on `data/raw/*` assets.
- Follow snake_case naming conventions for JSON output and logic.

### File Structure Requirements
- Functionality is to be added into `validate.py`.

### Testing Requirements
- Code quality checks via `devbox run lint` (ruff) and `devbox run test`.

### Project Structure Notes
- Interaction with `data/crawl-state.json` and all actual downloaded files.

### References
- [Epic 4 Requirements](file:///Users/minhtrucnguyen/working/monkai/_bmad-output/planning-artifacts/epics.md#L545-L572)
- [Architecture Validations and Constraints](file:///Users/minhtrucnguyen/working/monkai/_bmad-output/planning-artifacts/phase-1-crawler/architecture-phase1-crawler.md)

## Dev Agent Record

### Agent Model Used
claude-3-7-sonnet-20250219

### Debug Log References

### Completion Notes List
- Ultimate context engine analysis completed - comprehensive developer guide created for Story 4.2

### File List
- `_bmad-output/implementation-artifacts/4-2-run-summary-report-corpus-quality-audit.md`
- `validate.py`
