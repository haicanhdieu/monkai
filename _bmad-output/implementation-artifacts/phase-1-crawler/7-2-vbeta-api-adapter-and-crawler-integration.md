# Story 7.2: vbeta-api-adapter-and-crawler-integration

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want to implement the `VbetaApiAdapter` to orchestrate fetching and parsing `vbeta.vn`'s API and integrate it seamlessly with our CLI crawler,
so that the pipeline automatically traverses Categories → Books → TOCs → Pages and writes valid matching JSON files to disk with no HTML scraping.

## Acceptance Criteria

1. **Given** `utils/api_adapter.py` is implemented, **Then** it provides a `VbetaApiAdapter` class capable of fetching Categories, Books, Chapters via asynchronous GET/POST methods.
2. **Given** the crawler iterates Categories -> Books -> TOC -> Pages, **Then** rate limits defined in `vbeta`'s `SourceConfig` are strictly observed with added random jitter (`asyncio.sleep(rate_limit + random.uniform(0.1, 0.5))`).
3. **Given** HTTP 4xx/5xx errors occur, **Then** error are caught per URL locally without crashing the full pipeline and recorded to the state manifest.
4. **Given** `CrawlState` parity, **Then** the URL endpoints are cached inside the `crawl-state.json` to prevent re-downloads on resumption.
5. **Given** the crawler operates on `vbeta.vn`, **Then** raw API responses save exactly unaltered into `data/raw/vbeta/{endpoints...}` and formatted Canonical output saves to `data/book-data/vbeta/{cat_seo}/{book_seo}/{ch_seo}.json`.
6. **Given** `crawler.py` is called with `--source vbeta`, **Then** the crawler correctly dispatches directly to `VbetaApiAdapter` (via `config.source_type == "api"` check) and executes to completion.

## Tasks / Subtasks

- [x] Task 1: Create `VbetaApiAdapter` class (AC: 1, 2)
   - [x] Build isolated Async HTTP fetching loop logic per API structure: /categories -> /get-books-selectlist-by-categoryId/{catId} -> /get-tableofcontents-by-bookId (POST) -> /get-pages-by-tableofcontentid/{chapterId}.
   - [x] Include network jitter to prevent strict cadence triggering of WAFs.
- [x] Task 2: Dispatch from `crawler.py` (AC: 6)
   - [x] Read `source_type` from selected configs. If `html` run legacy logic. If `api` dispatch to adapter logic.
- [x] Task 3: Handle Idempotency and State (AC: 3, 4)
   - [x] Call `CrawlState.is_downloaded(api_url)` before fetching.
   - [x] Log and skip errors without failing the process.
- [x] Task 4: Store Files (AC: 5)
   - [x] Implement saving untouched JSON to `data/raw/vbeta/`.
   - [x] Implement transforming API Models via Pydantic to Canonical Domain `ChapterBookData` Models and storing in `data/book-data/vbeta/`.

## Dev Notes

- **Architecture Patterns:** API fetch routines MUST use the defined Models under `models.py` created in Story 7-1. E.g `ApiPage(**json_data)`.
- **Source Tree Components:** `utils/api_adapter.py`, `crawler.py`, `data/raw/vbeta/`, `data/book-data/vbeta/`.
- **Testing Standards Summary:** Local unit test integration of `VbetaApiAdapter` using `tests/test_api_adapter.py` avoiding actual network calls but using `pytest` async mocks to verify correct file IO outputs and tree traversal logics.

### Project Structure Notes

- Keep `api_adapter.py` clean from any HTML business scraping logic.
- The `VbetaApiAdapter` sits decoupled from the CLI argument parsing in `crawler.py`.

### References

- [Source: _bmad-output/planning-artifacts/phase-1-crawler/architecture-vbeta-crawler.md#crawler-traversal-flow]
- [Source: _bmad-output/planning-artifacts/phase-1-crawler/prd-vbeta-crawler.md#user-journeys]

## Dev Agent Record

### Agent Model Used

Antigravity

### Debug Log References

- See log for context extraction from PRD and Architecture on data boundary structures and idempotency.

### Completion Notes List

- Developed asynchronous `VbetaApiAdapter` to orchestrate crawling the endpoints of `api.phapbao.org`.
- Integrated strict adherence to source rate limit alongside random jitter.
- Wired internal `CrawlState` to gracefully track duplicate chapter fetches idempotently.
- Stored raw API output JSON inside `data/raw/vbeta/` folders.
- Persisted translated `ChapterBookData` outputs safely using Pydantic inside `data/book-data/`.
- Validated via rigorous local pytest integration of API structure skipping real network calls `test_api_adapter.py`.

### File List

- `utils/api_adapter.py`
- `crawler.py`
- `tests/test_api_adapter.py`
