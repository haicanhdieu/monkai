# Story 7.3: tests-validation-and-legacy-cleanup

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want to completely replace all legacy dependencies of the old DOM scrapers with the new robust API tests, and ensure full verification on the refactored schema formats,
so that the pipeline passes all end-to-end verifications, maintains its 90% metadata coverage threshold without regressions, and securely removes old code safely.

## Acceptance Criteria

1. **Given** `validate.py` executes against `data/book-data/vbeta/`, **Then** it applies checking on Canonical output: checking `id`, `chapter_id`, `chapter_name`, `book.name`, and `book.category_name` against the Canonical Schema (>=90% fields required completion rate).
2. **Given** test refactoring is complete, **Then** `test_crawler.py` and `test_api_adapter.py` show successful validation via `devbox run test`. All HTML-specific CSS-scraping tests and methods should be successfully retired.
3. **Given** manual legacy cleanup, **Then** all old scraping mechanisms previously meant for HTML endpoints inside `parser.py` inside the active runner structure are permanently deleted avoiding code-bloat.
4. **Given** pipeline verification executes, **Then** `devbox run pipeline` generates a valid flat-list schema from iterating `data/book-data/vbeta/` saving results properly in `data/index.json`.

## Tasks / Subtasks

- [ ] Task 1: Verify output against Canonical Schema (AC: 1, 4)
  - [ ] Adjust `validate.py` (if necessary) to account for reading through nested directories `vbeta/{cat}/{book}/{chapter}.json` vs flat `.meta.json` files.
  - [ ] Ensure `indexer.py` (if necessary) is capable of properly indexing from `data/book-data/vbeta/` directly into `data/index.json`.
- [ ] Task 2: Retire legacy parsers and logic (AC: 3)
  - [ ] Permanently strip away HTML parser loops, outdated `.meta.json` generating functions for `thuvienhoasen`, `budsas` and older configurations.
  - [ ] Adjust the main workflow path to rely solely on `crawler.py` feeding `data/book-data/` bypassing `parser.py` if no longer fundamentally needed for standard run flows.
- [ ] Task 3: Refactor test suites (AC: 2)
  - [ ] Delete defunct tests verifying obsolete parsing of specific `thuvienkinhphat` tables and headers inside `tests/`.
  - [ ] Verify `devbox run test` runs cleanly showcasing zero regressions in core utils (slugify, idempotency, models).

## Dev Notes

- **Architecture Patterns:** Enforce removal of Legacy code exactly. All HTML logic should disappear gracefully. The CLI flow `devbox run pipeline` changes conceptually from "Crawl -> Parse -> Index" to "API Fetch/Format -> Index".
- **Source Tree Components:** `validate.py`, `indexer.py`, `tests/`, `crawler.py`.
- **Testing Standards Summary:** Local suite coverage should verify Pydantic formatting functions and End-to-End indexer paths correctly mapping data formats.

### Project Structure Notes

- Check the integration boundary of `indexer.py`. It explicitly expected `.meta.json` extensions previously. Make sure it expects the correct structures from `data/book-data/vbeta/` or update its pointer paths carefully preserving stability.

### References

- [Source: _bmad-output/planning-artifacts/phase-1-crawler/architecture-vbeta-crawler.md#integration-points]
- [Source: _bmad-output/planning-artifacts/phase-1-crawler/prd-vbeta-crawler.md#success-criteria]

## Dev Agent Record

### Agent Model Used

PLACEHOLDER_M37

### Debug Log References

- Pulled pipeline mapping concepts from Architecture verification boundary blocks.

### Completion Notes List

- Comprehensive completion of Epic 7 tracking the shift to an api approach verified and recorded.

### File List

- `validate.py`
- `indexer.py`
- `tests/*`
- `parser.py`
