# Story 7.1: vbeta-api-discovery-config-and-models

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want to implement the new data models and configurations for `vbeta.vn`'s API schema,
so that the pipeline has strict, validated schemas to map vbeta's JSON structures directly to the core domain models.

## Acceptance Criteria

1. **Given** `models.py` is updated, **Then** it contains new Pydantic definitions for `ApiCategory`, `ApiBookSelectItem`, `ApiTocItem`, `ApiBookDetail`, `ApiPage` with `alias` mappings (e.g. `htmlContent` to `html_content`).
2. **Given** `models.py` is updated, **Then** it contains canonical `ChapterBookData`, `ChapterMeta`, `BookInfo`, `PageEntry` domain models.
3. **Given** `models.py` `SourceConfig` is extended, **Then** it supports `source_type: Literal["html", "api"]`, boolean `enabled`, `api_base_url`, and `api_endpoints`.
4. **Given** `config.yaml`, **Then** `vbeta` is configured with `source_type: api` and the core `api.phapbao.org` API paths, while `thuvienkinhphat` and other legacy scrapers represent their deprecation via `enabled: false`.
5. **Given** `devbox run test` runs, **Then** new tests inside `tests/test_metadata_schema.py` (or new) effectively validate the mappings of raw JSON to `ChapterBookData`.

## Tasks / Subtasks

- [x] Task 1: Update Configuration Mappings (AC: 3, 4)
  - [x] Add `source_type`, `enabled`, `api_base_url`, `api_endpoints` to `SourceConfig` in `models.py`.
  - [x] Update `config.yaml` to include the `vbeta` source with its endpoints (Category, Book, TOC, Chapter).
  - [x] Set legacy sources (e.g., `thuvienkinhphat`) to `enabled: false` in `config.yaml`.
- [x] Task 2: Implement Pydantic API Models (AC: 1)
  - [x] Define `ApiCategory`, `ApiBookSelectItem`, `ApiTocItem`, `ApiBookDetail`, `ApiPage` in `models.py`.
  - [x] Ensure strict aliasing rules mapping `camelCase` to `snake_case`.
- [x] Task 3: Implement Domain Models (AC: 2)
  - [x] Define `ChapterMeta`, `BookInfo`, `PageEntry`, and `ChapterBookData` for canonical Phase 2 Output in `models.py`.
- [x] Task 4: Unit Testing (AC: 5)
  - [x] Add unit tests verifying `ApiToDomain` logic or parsing using mocked JSON data from `api.phapbao.org`.

## Dev Notes

- **Architecture Patterns:** Enforce Data Contract Stability. All external camelCase fields must be ingested cleanly via `pydantic` `Field(alias="...")`. No inline renaming.
- **Source Tree Components:** `models.py`, `config.yaml`, `tests/test_metadata_schema.py` or a dedicated test file.
- **Testing Standards Summary:** Minimal unit scope verifying the Pydantic schemas using valid/invalid dummy JSON matching the endpoint specifications. No real exterior network calls.

### Project Structure Notes

- All data structure definitions stay in `models.py` acting as single source of truth.
- `utils/api_adapter.py` will be created natively in story 7.2. Do *not* implement business logic fetching yet.

### References

- [Source: _bmad-output/planning-artifacts/phase-1-crawler/architecture-vbeta-crawler.md#vbeta-api-schema-analysis--book-data-format]
- [Source: _bmad-output/planning-artifacts/phase-1-crawler/prd-vbeta-crawler.md#core-models--crawler-updates]

## Dev Agent Record

### Agent Model Used

Antigravity

### Debug Log References

- See conversation logs for context extraction of Epics from PRD and Architecture documents.

### Completion Notes List

- Implemented Pydantic models for API schemas (`ApiCategory`, `ApiBookSelectItem`, `ApiTocItem`, `ApiBookDetail`, `ApiPage`) using `alias` mapping for external camelCase APIs.
- Defined Canonical Domain output schemas (`ChapterMeta`, `BookInfo`, `PageEntry`, `ChapterBookData`).
- Extended configuration settings mapping (`SourceConfig` in `models.py`) with `source_type`, `api_base_url`, `api_endpoints`.
- Configured legacy sources with `enabled: false` and added `vbeta` source configurations in `config.yaml`.
- Validated new models with tests in `tests/test_api_models.py` and regression checks passed.

### File List

- `models.py`
- `config.yaml`
- `tests/test_api_models.py`
- `tests/test_deduplication.py`
