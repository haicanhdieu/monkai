# Story 4.1: Schema Validation Utility (validate.py)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want `validate.py` to scan all `.meta.json` files and report records with missing or invalid required fields,
So that I can identify and fix metadata quality issues before Phase 2 handoff.

## Acceptance Criteria

1. **Given** `validate.py` exists as a Typer CLI
   **When** I run `uv run python validate.py --help`
   **Then** help text is displayed with `--config` option documented

2. **Given** `.meta.json` files exist across `data/raw/`
   **When** I run `validate.py`
   **Then** every `.meta.json` is validated against the `ScriptureMetadata` Pydantic schema
   **And** records with missing required fields are reported: `[WARN] [validate] Schema error in {path}: {field} missing`
   **And** records with invalid enum values are reported with the offending value

3. **Given** all records pass validation
   **When** `validate.py` completes
   **Then** it exits with code 0 and prints: `All {N} records passed schema validation`

4. **Given** any records fail validation
   **When** `validate.py` completes
   **Then** it exits with code 1 and a summary of failures is printed to stdout

## Tasks / Subtasks

- [x] Create `validate.py` as a Typer CLI
  - [x] Implement `--help` output with `--config` documentation
- [x] Implement metadata finding logic
  - [x] Recursively find all `.meta.json` files under `data/raw/`
- [x] Implement validation engine
  - [x] Load each `.meta.json` and validate against `models.ScriptureMetadata`
  - [x] Catch Pydantic `ValidationError`s and format error reports per field
- [x] Implement summary reporting
  - [x] Log schema errors as `[WARN] [validate] Schema error ...`
  - [x] Handle exit codes (0 for success, 1 for failures)

## Dev Notes

### Technical Requirements
- Language/Runtime: Python 3.11 with `uv`
- Dependencies: `typer`, `pydantic`
- Logging format must exactly match: `{timestamp} [{LEVEL}] [{module}] {message}` using the shared `utils/logging.py->setup_logger`
- Validation MUST use the existing `models.py::ScriptureMetadata` class – do not redefine the schema.
- Must handle loading `config.yaml` using shared `utils/config.py`.

### Architecture Compliance
- Pydantic models are the shared contract. Corrupted metadata must be caught immediately.
- Use `logging` setup from `utils/logging.py`.
- Follow snake_case naming for Python and JSON.

### File Structure Requirements
- `validate.py` belongs at the project root.
- Imports must use existing modules (`models.py`, `utils/logging.py`, `utils/config.py`).

### Testing Requirements
- Code quality checks via `devbox run lint` (ruff) and `devbox run test`.

### Project Structure Notes
- Existing modules: `models.py`, `utils/`.
- Integration is outbound-only for validation (reads `.meta.json`).

### References
- [Epic 4 Requirements](file:///Users/minhtrucnguyen/working/monkai/_bmad-output/planning-artifacts/epics.md#L517-L543)
- [Architecture Validations and Constraints](file:///Users/minhtrucnguyen/working/monkai/_bmad-output/planning-artifacts/phase-1-crawler/architecture-phase1-crawler.md)

## Dev Agent Record

### Agent Model Used
claude-3-7-sonnet-20250219

### Debug Log References

### Completion Notes List
- Ultimate context engine analysis completed - comprehensive developer guide created for Story 4.1

### File List
- `_bmad-output/implementation-artifacts/4-1-schema-validation-utility-validate-py.md`
- `validate.py`
