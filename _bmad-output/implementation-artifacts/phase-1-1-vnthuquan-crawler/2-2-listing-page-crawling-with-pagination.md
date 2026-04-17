# Story 2.2: Listing Page Crawling with Pagination

Status: review

## Story

As a developer,
I want to crawl VNThuQuan listing pages with automatic pagination and Text-only filtering,
So that I can discover all downloadable books on the site.

## Acceptance Criteria

1. **Given** the adapter's `fetch_listing_page(page_num)` is called
   **When** the listing page is fetched successfully
   **Then** it calls the parser's `parse_listing_page()` and returns `BookListingEntry` objects

2. **Given** `fetch_all_listings(start_page, end_page)` is called with `end_page=0`
   **When** the first listing page is fetched
   **Then** the last page number is auto-detected from pagination links via `extract_last_page_number(html)` (FR2)
   **And** all pages from `start_page` to the detected last page are fetched sequentially

3. **Given** listing entries include books with format types Text, PDF, Audio
   **When** `fetch_all_listings` returns results
   **Then** only entries with `format_type == "Text"` are included (FR4)
   **And** non-Text entries are silently filtered out (no log entry per filtered book)

4. **Given** a listing page fetch fails (HTTP error or timeout)
   **When** the error occurs
   **Then** it is logged as a warning and the crawler continues to the next page
   **And** the failed page contributes zero entries (empty list) and does not halt execution

## Tasks / Subtasks

- [x] Add `_listing_url(page_num)` helper method to `VnthuquanAdapter` in `apps/crawler/vnthuquan_crawler.py` (AC: #1, #2)
  - [x] Strips any existing query string from `self._source_config.seed_url` using `rsplit("?", 1)[0]`
  - [x] Returns `f"{base}?tranghientai={page_num}"`
  - [x] Signature: `def _listing_url(self, page_num: int) -> str`

- [x] Implement `fetch_listing_page(page_num)` method on `VnthuquanAdapter` (AC: #1, #4)
  - [x] Build the page URL using `self._listing_url(page_num)`
  - [x] Make the request via `await self._rate_limited_request("GET", url)` — never call `_request_with_retry` directly
  - [x] On error (`result.error_type` is not None or `result.response` is None): log warning `[vnthuquan] Failed listing page {page_num}: {result.error_detail}` and return `[]`
  - [x] On success: read body with `await result.response.text(encoding="utf-8")` and pass to `parse_listing_page(html)`
  - [x] Return the list of `BookListingEntry` objects directly from the parser (no filtering here)
  - [x] Signature: `async def fetch_listing_page(self, page_num: int) -> list[BookListingEntry]`

- [x] Implement `fetch_all_listings(start_page, end_page)` method on `VnthuquanAdapter` (AC: #2, #3, #4)
  - [x] Fetch first page using `await self._rate_limited_request("GET", self._listing_url(start_page))` directly (not via `fetch_listing_page`) so pagination detection and first-page entries share one request
  - [x] On failure of first page: log error `[vnthuquan] Failed to fetch first listing page: {error_detail}` and return `[]`
  - [x] Read first page HTML: `await first_page_result.response.text(encoding="utf-8")`
  - [x] Parse first page entries: `parse_listing_page(first_html)`
  - [x] If `end_page == 0`: call `extract_last_page_number(first_html)` and assign result to `end_page`; log info `[vnthuquan] Auto-detected last page: {end_page}`
  - [x] Extend `all_entries` with first page entries
  - [x] Loop `for page_num in range(start_page + 1, end_page + 1)`: call `await self.fetch_listing_page(page_num)` and extend `all_entries`
  - [x] After loop, filter: `text_only = [e for e in all_entries if e.format_type == "Text"]`
  - [x] Log info: `[vnthuquan] Found {len(text_only)} Text books from {len(all_entries)} total across pages {start_page}-{end_page}`
  - [x] Return `text_only`
  - [x] Signature: `async def fetch_all_listings(self, start_page: int = 1, end_page: int = 0) -> list[BookListingEntry]`

- [x] Add import of `parse_listing_page` and `extract_last_page_number` from `vnthuquan_parser` at the top of `vnthuquan_crawler.py` (if not already present)
  - [x] `from vnthuquan_parser import parse_listing_page, extract_last_page_number`
  - [x] Also import `BookListingEntry` if it comes from `vnthuquan_parser` (check existing imports)

- [x] Write tests in `apps/crawler/tests/test_vnthuquan_crawler.py` (AC: #1–#4)
  - [x] Test: `fetch_listing_page` returns parsed entries on HTTP 200 (AC: #1)
    - [x] Mock GET for the listing URL returning the fixture HTML
    - [x] Assert return type is `list[BookListingEntry]` and entries are non-empty
    - [x] Assert at least one entry has expected fields (url, title, format_type, etc.)
  - [x] Test: `fetch_listing_page` returns empty list on HTTP 4xx (AC: #4)
    - [x] Mock GET returning `status=404`
    - [x] Assert return value is `[]`
  - [x] Test: `fetch_listing_page` returns empty list on timeout (AC: #4)
    - [x] Mock GET raising `aiohttp.ServerTimeoutError`
    - [x] Assert return value is `[]`
  - [x] Test: `fetch_all_listings` with explicit `end_page` fetches all pages sequentially (AC: #2)
    - [x] Mock GET for pages 1 through N (use a small end_page like 3)
    - [x] Assert each page URL was called exactly once
    - [x] Assert returned entries span all pages
  - [x] Test: `fetch_all_listings` auto-detects last page when `end_page=0` (AC: #2)
    - [x] Mock GET for page 1 returning fixture HTML (which has known last page from `extract_last_page_number`)
    - [x] Mock GET for pages 2 through detected_last_page
    - [x] Assert total request count equals detected_last_page
  - [x] Test: `fetch_all_listings` filters to Text-only entries (AC: #3)
    - [x] Use fixture HTML that includes both Text and non-Text entries
    - [x] Assert all returned entries have `format_type == "Text"`
    - [x] Assert returned count is less than total parsed count (non-Text were filtered)
  - [x] Test: `fetch_all_listings` skips failed pages and continues (AC: #4)
    - [x] Mock page 1 with valid HTML (end_page=3), page 2 with `status=500` (all retries), page 3 with valid HTML
    - [x] Assert return is non-empty (pages 1 and 3 contributed entries)
    - [x] Assert no exception is raised

## Dev Notes

### Architecture Overview

This story adds three methods to the existing `VnthuquanAdapter` class in `apps/crawler/vnthuquan_crawler.py`. The parser module (`vnthuquan_parser.py`) is complete and must not be modified. All HTTP requests must go through `_rate_limited_request`.

**Flow:**

```
fetch_all_listings(start_page, end_page)
    |
    ├── _rate_limited_request(GET, _listing_url(start_page))   ← first page direct call
    |       → extract_last_page_number(html)                   ← auto-detect if end_page == 0
    |       → parse_listing_page(html)                         ← collect first page entries
    |
    ├── for page_num in range(start_page+1, end_page+1):
    |       fetch_listing_page(page_num)
    |           → _rate_limited_request(GET, _listing_url(page_num))
    |           → parse_listing_page(html)
    |
    └── filter: format_type == "Text"  →  return text_only
```

### Listing URL Pattern

The seed URL in config is `http://vietnamthuquan.eu/tacgia/a-1` (or with an existing query string). Always strip any existing query string before appending the page parameter:

```python
def _listing_url(self, page_num: int) -> str:
    base = self._source_config.seed_url.rsplit("?", 1)[0]
    return f"{base}?tranghientai={page_num}"
```

Example output: `http://vietnamthuquan.eu/tacgia/a-1?tranghientai=1`

### `fetch_listing_page` — Exact Implementation

```python
async def fetch_listing_page(self, page_num: int) -> list[BookListingEntry]:
    url = self._listing_url(page_num)
    result = await self._rate_limited_request("GET", url)
    if result.error_type or not result.response:
        logger.warning(f"[vnthuquan] Failed listing page {page_num}: {result.error_detail}")
        return []
    html = await result.response.text(encoding="utf-8")
    return parse_listing_page(html)
```

Key constraints:
- No filtering here — filtering happens exclusively in `fetch_all_listings`
- Return `[]` (not raise) on any error
- Use `_rate_limited_request`, never `_request_with_retry` directly

### `fetch_all_listings` — Exact Implementation

```python
async def fetch_all_listings(self, start_page: int = 1, end_page: int = 0) -> list[BookListingEntry]:
    all_entries: list[BookListingEntry] = []

    # Fetch first page directly to get HTML for pagination detection
    first_page_result = await self._rate_limited_request("GET", self._listing_url(start_page))
    if first_page_result.error_type or not first_page_result.response:
        logger.error(
            f"[vnthuquan] Failed to fetch first listing page: {first_page_result.error_detail}"
        )
        return []

    first_html = await first_page_result.response.text(encoding="utf-8")
    first_entries = parse_listing_page(first_html)

    if end_page == 0:
        end_page = extract_last_page_number(first_html)
        logger.info(f"[vnthuquan] Auto-detected last page: {end_page}")

    all_entries.extend(first_entries)

    for page_num in range(start_page + 1, end_page + 1):
        entries = await self.fetch_listing_page(page_num)
        all_entries.extend(entries)

    # Filter to Text-only (FR4) — non-Text entries silently dropped
    text_only = [e for e in all_entries if e.format_type == "Text"]
    logger.info(
        f"[vnthuquan] Found {len(text_only)} Text books from {len(all_entries)} total"
        f" across pages {start_page}-{end_page}"
    )
    return text_only
```

### Log Messages (exact wording)

| Situation | Level | Message |
|---|---|---|
| `fetch_listing_page` fails | `WARNING` | `[vnthuquan] Failed listing page {page_num}: {result.error_detail}` |
| First page fails in `fetch_all_listings` | `ERROR` | `[vnthuquan] Failed to fetch first listing page: {error_detail}` |
| `end_page` auto-detected | `INFO` | `[vnthuquan] Auto-detected last page: {n}` |
| All pages collected and filtered | `INFO` | `[vnthuquan] Found {n} Text books from {total} total across pages {start}-{end}` |

The logger should already exist in `vnthuquan_crawler.py` as a module-level `logging.getLogger(__name__)` from Story 2.1. Do not create a new logger.

### Imports to Add (if not already present)

```python
from vnthuquan_parser import parse_listing_page, extract_last_page_number, BookListingEntry
```

Verify what is already imported at the top of `vnthuquan_crawler.py` before adding.

### Testing with aioresponses

All tests use `aioresponses` (already added as a dev dependency in Story 2.1). The fixture HTML is at `apps/crawler/tests/fixtures/vnthuquan_listing_page.html`.

**Adapter fixture (reuse or extend the existing `conftest.py` fixture from Story 2.1):**

```python
import pytest
import pytest_asyncio
from pathlib import Path
from unittest.mock import MagicMock
from vnthuquan_crawler import VnthuquanAdapter, create_session

@pytest_asyncio.fixture
async def adapter():
    mock_config = MagicMock()
    mock_config.seed_url = "http://vietnamthuquan.eu/tacgia/a-1"
    mock_config.rate_limit_seconds = 0  # no sleep in tests
    session = await create_session()
    adp = VnthuquanAdapter(
        source_config=mock_config,
        session=session,
        state=None,
        output_dir=Path("/tmp"),
    )
    yield adp
    await session.close()

@pytest.fixture
def listing_fixture():
    fixture_path = Path(__file__).parent / "fixtures" / "vnthuquan_listing_page.html"
    return fixture_path.read_text(encoding="utf-8")
```

**Test: `fetch_listing_page` returns entries on success:**

```python
from aioresponses import aioresponses

@pytest.mark.asyncio
async def test_fetch_listing_page_success(adapter, listing_fixture):
    url = "http://vietnamthuquan.eu/tacgia/a-1?tranghientai=1"
    with aioresponses() as m:
        m.get(url, body=listing_fixture.encode("utf-8"), status=200)
        entries = await adapter.fetch_listing_page(1)
    assert isinstance(entries, list)
    assert len(entries) > 0
    assert hasattr(entries[0], "format_type")
```

**Test: `fetch_listing_page` returns `[]` on 4xx:**

```python
@pytest.mark.asyncio
async def test_fetch_listing_page_404(adapter):
    url = "http://vietnamthuquan.eu/tacgia/a-1?tranghientai=99"
    with aioresponses() as m:
        m.get(url, status=404)
        entries = await adapter.fetch_listing_page(99)
    assert entries == []
```

**Test: `fetch_listing_page` returns `[]` on timeout:**

```python
import aiohttp

@pytest.mark.asyncio
async def test_fetch_listing_page_timeout(adapter):
    url = "http://vietnamthuquan.eu/tacgia/a-1?tranghientai=5"
    with aioresponses() as m:
        # Must register 4 times: 1 initial + 3 retries, all timeout
        for _ in range(4):
            m.get(url, exception=aiohttp.ServerTimeoutError())
        entries = await adapter.fetch_listing_page(5)
    assert entries == []
```

**Test: `fetch_all_listings` with explicit `end_page`:**

```python
@pytest.mark.asyncio
async def test_fetch_all_listings_explicit_end_page(adapter, listing_fixture):
    base = "http://vietnamthuquan.eu/tacgia/a-1?tranghientai={}"
    with aioresponses() as m:
        for p in range(1, 4):  # pages 1, 2, 3
            m.get(base.format(p), body=listing_fixture.encode("utf-8"), status=200)
        entries = await adapter.fetch_all_listings(start_page=1, end_page=3)
    assert all(e.format_type == "Text" for e in entries)
```

**Test: `fetch_all_listings` auto-detects last page:**

```python
@pytest.mark.asyncio
async def test_fetch_all_listings_auto_detect(adapter, listing_fixture):
    # The fixture must contain pagination links so extract_last_page_number returns > 1.
    # Determine the expected last page by calling the parser directly:
    from vnthuquan_parser import extract_last_page_number
    detected = extract_last_page_number(listing_fixture)
    assert detected > 1, "Fixture must have multi-page pagination for this test"

    base = "http://vietnamthuquan.eu/tacgia/a-1?tranghientai={}"
    with aioresponses() as m:
        for p in range(1, detected + 1):
            m.get(base.format(p), body=listing_fixture.encode("utf-8"), status=200)
        entries = await adapter.fetch_all_listings(start_page=1, end_page=0)
    assert all(e.format_type == "Text" for e in entries)
```

**Test: Text-only filtering:**

```python
@pytest.mark.asyncio
async def test_fetch_all_listings_text_only_filter(adapter, listing_fixture):
    from vnthuquan_parser import parse_listing_page
    all_parsed = parse_listing_page(listing_fixture)
    # The fixture should include non-Text entries; skip this test if it doesn't
    non_text = [e for e in all_parsed if e.format_type != "Text"]
    if not non_text:
        pytest.skip("Fixture has no non-Text entries; update fixture to include PDF/Audio rows")

    url = "http://vietnamthuquan.eu/tacgia/a-1?tranghientai=1"
    with aioresponses() as m:
        m.get(url, body=listing_fixture.encode("utf-8"), status=200)
        entries = await adapter.fetch_all_listings(start_page=1, end_page=1)
    assert all(e.format_type == "Text" for e in entries)
    assert len(entries) < len(all_parsed)
```

**Test: skips failed page, continues:**

```python
@pytest.mark.asyncio
async def test_fetch_all_listings_skips_failed_page(adapter, listing_fixture):
    base = "http://vietnamthuquan.eu/tacgia/a-1?tranghientai={}"
    with aioresponses() as m:
        m.get(base.format(1), body=listing_fixture.encode("utf-8"), status=200)
        # Page 2 fails all 4 attempts (1 initial + 3 retries)
        for _ in range(4):
            m.get(base.format(2), status=503)
        m.get(base.format(3), body=listing_fixture.encode("utf-8"), status=200)
        # No exception should propagate
        entries = await adapter.fetch_all_listings(start_page=1, end_page=3)
    assert isinstance(entries, list)
    # Entries from pages 1 and 3 must be present
    assert len(entries) > 0
```

### Rate Limiting in Tests

Set `mock_config.rate_limit_seconds = 0` in the test fixture so `asyncio.sleep(0)` is essentially a no-op. This prevents tests from being slow while still exercising the actual code path.

### Fixture Note

The fixture at `apps/crawler/tests/fixtures/vnthuquan_listing_page.html` was created in Story 1.1. Verify it contains:
- Multiple book entries with varying `format_type` values (Text, PDF, Audio) for the filter test
- Pagination links with `?tranghientai=N` for the auto-detect test

If the fixture only has Text entries, the filter test must use `pytest.skip` (see test above) — do not modify the fixture or the parser.

### Enforcement Rules

1. **Never modify `vnthuquan_parser.py`** — it is complete from Epic 1. Only call `parse_listing_page()` and `extract_last_page_number()` from it.
2. **Every HTTP call goes through `_rate_limited_request`** — never call `_request_with_retry` directly from these new methods.
3. **On listing page error: return `[]`, log, continue** — no exceptions should propagate out of `fetch_listing_page`.
4. **Text-only filter lives exclusively in `fetch_all_listings`** — `fetch_listing_page` returns all entries from the parser unmodified.
5. **No state updates in this story** — `CrawlState` is not touched here; state tracking for downloaded books is handled in Story 3.2.
6. **No concurrent fetching** — pages are fetched sequentially via a simple `for` loop; concurrency is introduced in Story 2.3.

### Running Tests

Run only the new tests:

```bash
cd apps/crawler && uv run pytest tests/test_vnthuquan_crawler.py -v -k "listing"
```

Run the full crawler test file:

```bash
cd apps/crawler && uv run pytest tests/test_vnthuquan_crawler.py -v
```

Run the full test suite (must all pass before marking story done):

```bash
cd apps/crawler && uv run pytest tests/ -v
```

Lint check:

```bash
cd apps/crawler && uv run ruff check .
```

### Project Structure Notes

**Files modified by this story:**

- `apps/crawler/vnthuquan_crawler.py` — add `_listing_url`, `fetch_listing_page`, `fetch_all_listings` methods to `VnthuquanAdapter`; add imports for `parse_listing_page`, `extract_last_page_number`, `BookListingEntry` from `vnthuquan_parser`
- `apps/crawler/tests/test_vnthuquan_crawler.py` — add listing crawl tests (7 new test functions)

**Files NOT modified (do not touch):**

- `apps/crawler/vnthuquan_parser.py` — complete from Epic 1
- `apps/crawler/tests/test_vnthuquan_parser.py` — complete from Epic 1
- `apps/crawler/tests/fixtures/vnthuquan_listing_page.html` — fixture from Epic 1
- `apps/crawler/models.py`, `crawler.py`, `utils/state.py`, `utils/dedup.py`, any other util
- `apps/crawler/pyproject.toml` — `aioresponses` was already added in Story 2.1

### References

- [Source: _bmad-output/planning-artifacts/phase-1-1-vnthuquan-crawler/epics-vnthuquan-crawler.md#Story 2.2]
- [Source: _bmad-output/planning-artifacts/phase-1-1-vnthuquan-crawler/architecture-vnthuquan-crawler.md#Listing crawl (FR1-5)]
- [Source: _bmad-output/planning-artifacts/phase-1-1-vnthuquan-crawler/architecture-vnthuquan-crawler.md#VnthuquanAdapter]
- [Source: _bmad-output/implementation-artifacts/phase-1-1-vnthuquan-crawler/2-1-http-infrastructure-vnthuquanadapter-skeleton.md]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- aioresponses requires `await session.request()` (not `async with`) so the response body can be read by callers. Used `await resp.release()` for 5xx responses that are retried.

### Completion Notes List

- Added `_listing_url`, `fetch_listing_page`, `fetch_all_listings` methods to `VnthuquanAdapter`.
- Added `logging`, `BookListingEntry`, `extract_last_page_number`, `parse_listing_page` imports.
- Changed `_request_with_retry` from `async with session.request()` to `await session.request()` (required so callers can read response text after the method returns).
- 7 new tests added; all 18 tests pass.

### File List

- `apps/crawler/vnthuquan_crawler.py` — MODIFIED: added logging import, parser imports, _listing_url/_fetch_listing_page/fetch_all_listings methods; changed session.request to non-context-manager form
- `apps/crawler/tests/test_vnthuquan_crawler.py` — MODIFIED: added 7 Story 2.2 listing tests

## Change Log

- 2026-04-16: Story 2.2 implemented — listing page crawling with pagination and Text-only filter, 7 new tests (Date: 2026-04-16)
