# Story 4.3: End-to-End Pipeline Command + Phase 2 Handoff Verification

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want a single command that runs the full pipeline (crawl → parse → index → validate) and verifies the Phase 2 handoff contract is satisfied,
So that I can execute the complete corpus build in one step and confirm Phase 2 readiness.

## Acceptance Criteria

1. **Given** `devbox.json` is updated with a `pipeline` script
   **When** I run `devbox run pipeline` (or `uv run python pipeline.py`)
   **Then** the four pipeline stages execute in sequence: `crawler.py → parser.py → indexer.py → validate.py`
   **And** each stage's exit code is checked — if any stage fails, the pipeline halts and logs which stage failed
   **And** final output reports total records processed end-to-end (FR26)

2. **Given** the full pipeline completes successfully
   **When** I inspect `data/index.json`
   **Then** every record conforms to the frozen Phase 2 `IndexRecord` schema: `id`, `title`, `category`, `subcategory`, `source`, `url`, `file_path`, `file_format`, `copyright_status`
   **And** `data/index.json` is valid JSON with ≥ 500 unique records (primary success metric)
   **And** all files referenced in `data/index.json` exist on disk and are non-empty

3. **Given** the pipeline is run a second time with no new sources or files
   **When** all stages complete
   **Then** `data/index.json` is identical to the first run output (full pipeline idempotency — NFR4)
   **And** no files are re-downloaded, no `.meta.json` files are overwritten, no duplicate records added to index

4. **Given** the Phase 2 handoff quality gates checklist
   **When** `validate.py` runs as the final stage
   **Then** all gates pass:
   - [ ] ≥ 500 unique records in `data/index.json`
   - [ ] All 4 sources crawled with 0 robots.txt violations
   - [ ] Duplicate rate < 2%
   - [ ] ≥ 90% of records have all required metadata fields
   - [ ] All files in `data/index.json` exist on disk and are non-empty
   - [ ] `data/index.json` is valid JSON matching the IndexRecord schema

## Tasks / Subtasks

- [x] Create `pipeline.py` script
  - [x] Implement subprocess execution for `crawler.py`, `parser.py`, `indexer.py`, `validate.py` in sequence
  - [x] Verify exit codes and halt pipeline on failure
  - [x] Gather reports and output final pipeline summary
- [x] Incorporate Phase 2 handoff quality gates to `validate.py`
  - [x] Modify `validate.py` to output a checklist of Phase 2 criteria explicitly
- [x] Update `devbox.json`
  - [x] Add `pipeline` script to `.shell.scripts` in `devbox.json`
- [x] Manual test: Perform idempotency checks and Phase 2 JSON consistency.

## Dev Notes

### Technical Requirements
- Utilize `subprocess.run` to call each stage module, checking for `returncode`.
- End-to-end verification must confirm JSON schema structure identically formatted as `models.IndexRecord`.

### Architecture Compliance
- Use `logging` setup from `utils/logging.py`.
- No new cross-cutting concern to add; combine the 4 modules together.
- Follow snake_case naming conventions.

### File Structure Requirements
- Functionality is to be added into a `pipeline.py` root script and `validate.py`.

### Testing Requirements
- Code quality checks via `devbox run lint` (ruff) and `devbox run test`.

### Project Structure Notes
- Interaction with existing 4 Typer CLIs.

### References
- [Epic 4 Requirements](file:///Users/minhtrucnguyen/working/monkai/_bmad-output/planning-artifacts/epics.md#L574-L609)
- [Architecture Validations and Constraints](file:///Users/minhtrucnguyen/working/monkai/_bmad-output/planning-artifacts/phase-1-crawler/architecture-phase1-crawler.md)

## Dev Agent Record

### Agent Model Used
claude-3-7-sonnet-20250219

### Debug Log References

### Completion Notes List
- Ultimate context engine analysis completed - comprehensive developer guide created for Story 4.3

### File List
- `_bmad-output/implementation-artifacts/4-3-end-to-end-pipeline-command-phase-2-handoff-verification.md`
- `pipeline.py`
- `devbox.json`
- `validate.py`
