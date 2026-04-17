# Story 2.3: Book Detail & Chapter Content Fetching

Status: review

## Story

As a developer,
I want to fetch book details and chapter content for each discovered book,
So that I have the complete text content ready for output.

## Acceptance Criteria

1. **Given** a `BookListingEntry` for a multi-chapter book
   **When** `fetch_book_detail(entry)` is called
   **Then** it fetches the detail page, calls the parser, and returns a `BookDetail`
   **And** author metadata from the listing entry is preserved for carry-through (FR8) — no special action needed in this method; `entry` is passed alongside `detail` to `assemble_book_data` in Story 3.1

2. **Given** a `BookDetail` with multiple chapters
   **When** `fetch_chapter(tuaid, chuongid)` is called for each chapter
   **Then** it sends a POST to `chuonghoi_moi.aspx` with body `tuaid={id}&chuongid={n}`
   **And** returns the parsed `ChapterParseResult` object (or `None` on failure)

3. **Given** a single-chapter book
   **When** `fetch_chapter(tuaid, "")` is called
   **Then** it POSTs with `chuongid=` (empty string) and returns the parsed content (FR11)

4. **Given** a chapter fetch returns empty content (`content_html` is `None`)
   **When** the result is processed inside `crawl_book`
   **Then** a warning is logged: `[vnthuquan] Empty chapter {chuongid} in book {tuaid}`
   **And** the chapter is preserved with an empty string `""` appended to `chapters_html` — it is NOT skipped (NFR10)

5. **Given** concurrent book processing with 5 workers (default)
   **When** `crawl_all()` processes the pending book list
   **Then** books are processed concurrently via `asyncio.Semaphore(concurrency)`
   **And** rate limiting applies per-request (inside `_rate_limited_request`) across all workers

## Tasks / Subtasks

- [x] **Task 1: Add `CHAPTER_AJAX_URL` constant and `_done`/`_abort` flags to `VnthuquanAdapter.__init__`** (AC: #2, #5)
  - [ ] Add module-level constant (outside the class) in `vnthuquan_crawler.py`:
    ```python
    CHAPTER_AJAX_URL = "http://vietnamthuquan.eu/truyen/chuonghoi_moi.aspx"
    ```
  - [ ] In `VnthuquanAdapter.__init__`, add two instance flags:
    ```python
    self._done: bool = False
    self._abort: bool = False
    ```
  - [ ] These flags are read in `crawl_all` to signal completion and orderly abort (e.g., on `max_hours` exceeded)
  - [ ] Do NOT change any existing `__init__` parameters — only add to the method body

- [x] **Task 2: Add import of parser functions and types** (AC: #1, #2)
  - [ ] At the top of `vnthuquan_crawler.py`, verify (and add if missing) the following import from `vnthuquan_parser`:
    ```python
    from vnthuquan_parser import (
        parse_listing_page,
        extract_last_page_number,
        parse_book_detail,
        parse_chapter_response,
        BookListingEntry,
        BookDetail,
        ChapterParseResult,
    )
    ```
  - [ ] Also ensure `import time` is present at the top level (needed for `crawl_all` timeout guard)
  - [ ] Also ensure `import asyncio` is present (needed for `Semaphore`, `gather`, `create_task`)
  - [ ] Do NOT add `import typer` here — it will be added in Story 4.1

- [x] **Task 3: Implement `fetch_book_detail(entry)` on `VnthuquanAdapter`** (AC: #1)
  - [ ] Signature: `async def fetch_book_detail(self, entry: BookListingEntry) -> BookDetail | None`
  - [ ] Build URL from `entry.url` — it is already a full URL (e.g. `http://vietnamthuquan.eu/truyen.aspx?tid=12345`)
  - [ ] Make request: `result = await self._rate_limited_request("GET", url)` — never call `_request_with_retry` directly
  - [ ] On error (`result.error_type is not None` or `result.response is None`):
    - [ ] Log: `logger.warning(f"[vnthuquan] Failed book detail {url}: {result.error_detail}")`
    - [ ] Return `None`
  - [ ] On success: read body with `html = await result.response.text(encoding="utf-8")`
  - [ ] Parse: `detail = parse_book_detail(html)`
  - [ ] If `detail is None`:
    - [ ] Log: `logger.warning(f"[vnthuquan] Unparseable book detail: {url}")`
    - [ ] Return `None`
  - [ ] Log success: `logger.info(f"[vnthuquan] Fetched book: {detail.title} ({len(detail.chapter_list)} chapters)")`
  - [ ] Return `detail`
  - [ ] **FR8 note:** `BookDetail` does NOT carry author fields — `entry.author_name` and `entry.author_id` are on the `BookListingEntry`. The caller (`crawl_book`) passes both `entry` and `detail` to `assemble_book_data` in Story 3.1, which reads author fields from `entry`. No special action needed here.

- [x] **Task 4: Implement `fetch_chapter(tuaid, chuongid)` on `VnthuquanAdapter`** (AC: #2, #3)
  - [ ] Signature: `async def fetch_chapter(self, tuaid: int, chuongid: int | str) -> ChapterParseResult | None`
  - [ ] Build POST body dict: `data = {"tuaid": str(tuaid), "chuongid": str(chuongid)}`
    - [ ] For single-chapter books, caller passes `chuongid=""` → dict becomes `{"tuaid": "33201", "chuongid": ""}` — this is correct per FR11; do NOT substitute a default value
  - [ ] Make request: `result = await self._rate_limited_request("POST", CHAPTER_AJAX_URL, data=data)`
  - [ ] On error (`result.error_type is not None` or `result.response is None`):
    - [ ] Log: `logger.warning(f"[vnthuquan] Failed chapter {chuongid} for book {tuaid}: {result.error_detail}")`
    - [ ] Return `None`
  - [ ] On success: read body with `raw = await result.response.text(encoding="utf-8")`
  - [ ] Parse and return: `return parse_chapter_response(raw)`
  - [ ] Do NOT log on successful parse — `crawl_book` handles empty-content warnings

- [x] **Task 5: Implement `crawl_book(entry)` stub on `VnthuquanAdapter`** (AC: #4)
  - [ ] Signature: `async def crawl_book(self, entry: BookListingEntry) -> bool`
  - [ ] Fetch detail: `detail = await self.fetch_book_detail(entry)`
  - [ ] If `detail is None`: return `False`
  - [ ] Initialize: `chapters_html: list[str] = []` and `cover_url: str | None = None`
  - [ ] Iterate over `detail.chapter_list` with `enumerate`:
    - [ ] `for i, (chuongid, _) in enumerate(detail.chapter_list):`
    - [ ] Call: `result = await self.fetch_chapter(detail.tuaid, chuongid)`
    - [ ] If `result is None` or `result.content_html is None`:
      - [ ] Log: `logger.warning(f"[vnthuquan] Empty chapter {chuongid} in book {detail.tuaid}")`
      - [ ] Append `""` to `chapters_html` — never skip (NFR10)
    - [ ] Else: append `result.content_html` to `chapters_html`
    - [ ] If `i == 0` and `result is not None`: assign `cover_url = result.cover_image_url`
  - [ ] Return `True`
  - [ ] **Note:** State management (`self._state.mark_downloaded`, etc.) is intentionally NOT added here — that is Story 3.2. `assemble_book_data` and `write_book_json` calls are Story 3.1. This stub only fetches and collects.

- [x] **Task 6: Implement `_monitor_health()` placeholder on `VnthuquanAdapter`** (AC: #5)
  - [ ] Signature: `async def _monitor_health(self) -> None`
  - [ ] Body: a simple loop that sleeps and checks `self._done`:
    ```python
    async def _monitor_health(self) -> None:
        while not self._done:
            await asyncio.sleep(30)
    ```
  - [ ] This is a placeholder for future session-health monitoring; it must exist so `crawl_all` can call `asyncio.create_task(self._monitor_health())`

- [x] **Task 7: Implement `crawl_all(...)` on `VnthuquanAdapter`** (AC: #5)
  - [ ] Signature:
    ```python
    async def crawl_all(
        self,
        start_page: int = 1,
        end_page: int = 0,
        concurrency: int = 5,
        max_hours: float = 0.0,
        dry_run: bool = False,
    ) -> None:
    ```
  - [ ] Fetch all listing entries: `all_entries = await self.fetch_all_listings(start_page, end_page)`
  - [ ] If `dry_run is True`:
    - [ ] For each entry, print to stdout: `print(f"[dry-run] {entry.url}: {entry.title}")`
    - [ ] Return immediately after the loop (do not process books)
  - [ ] Filter pending books: `pending = [e for e in all_entries if not self._state.is_downloaded(e.url)]`
  - [ ] Log info: `logger.info(f"[vnthuquan] {len(all_entries)} books total, {len(pending)} pending")`
  - [ ] Create semaphore: `semaphore = asyncio.Semaphore(concurrency)`
  - [ ] Record start time: `start_time = time.time()`
  - [ ] Define inner coroutine `process_book(entry)`:
    ```python
    async def process_book(entry: BookListingEntry) -> None:
        if max_hours > 0 and (time.time() - start_time) / 3600 > max_hours:
            return
        if self._abort:
            return
        async with semaphore:
            await self.crawl_book(entry)
    ```
  - [ ] Launch monitor task: `monitor_task = asyncio.create_task(self._monitor_health())`
  - [ ] Run all books concurrently inside `try`/`finally`:
    ```python
    try:
        await asyncio.gather(*[process_book(e) for e in pending])
    finally:
        self._done = True
        monitor_task.cancel()
    ```
  - [ ] **Key constraint:** `asyncio.Semaphore(concurrency)` limits concurrent in-flight book processes; rate limiting happens inside `_rate_limited_request`, not in `crawl_all` directly

- [x] **Task 8: Write tests in `apps/crawler/tests/test_vnthuquan_crawler.py`** (AC: #1–#5)

  - [x] **Test 8.1: `fetch_book_detail` — multi-chapter book returns `BookDetail`** (AC: #1)
    - [ ] Load `vnthuquan_book_detail.html` fixture from `tests/fixtures/`
    - [ ] Mock GET for `http://vietnamthuquan.eu/truyen.aspx?tid=12345` returning fixture bytes
    - [ ] Create a minimal `BookListingEntry` with matching URL
    - [ ] Call `await adapter.fetch_book_detail(entry)`
    - [ ] Assert result is not `None`
    - [ ] Assert `result.is_single_chapter is False`
    - [ ] Assert `len(result.chapter_list) > 0`
    - [ ] Assert `result.title` is a non-empty string

  - [x] **Test 8.2: `fetch_book_detail` — single-chapter book returns `BookDetail`** (AC: #1, #3)
    - [ ] Load `vnthuquan_book_detail_single.html` fixture
    - [ ] Mock GET returning fixture bytes
    - [ ] Assert `result.is_single_chapter is True`
    - [ ] Assert `len(result.chapter_list) == 1` (single entry)

  - [x] **Test 8.3: `fetch_book_detail` — HTTP 404 returns `None`** (AC: #1)
    - [ ] Mock GET returning `status=404`
    - [ ] Assert return value is `None`

  - [x] **Test 8.4: `fetch_book_detail` — timeout returns `None`** (AC: #1)
    - [ ] Mock GET raising `aiohttp.ServerTimeoutError` for all 4 attempts
    - [ ] Assert return value is `None`

  - [x] **Test 8.5: `fetch_book_detail` — unparseable HTML returns `None` and logs warning** (AC: #1)
    - [ ] Mock GET returning `status=200` with body `"<html><body></body></html>"` (no recognizable content)
    - [ ] Assert return value is `None`
    - [ ] Optionally assert `caplog` contains `"Unparseable book detail"`

  - [x] **Test 8.6: `fetch_chapter` — multi-chapter POST sends correct body** (AC: #2)
    - [ ] Load `vnthuquan_chapter_response.txt` fixture
    - [ ] Mock POST for `CHAPTER_AJAX_URL` returning fixture bytes
    - [ ] Call `await adapter.fetch_chapter(tuaid=33201, chuongid=1)`
    - [ ] Assert result is not `None`
    - [ ] Assert `result.content_html` is not `None` and is a non-empty string
    - [ ] (aioresponses captures the POST body — verify `data` dict had `"tuaid": "33201"` and `"chuongid": "1"` if the library exposes this)

  - [x] **Test 8.7: `fetch_chapter` — single-chapter POST uses empty `chuongid`** (AC: #3)
    - [ ] Load `vnthuquan_chapter_response.txt` fixture
    - [ ] Mock POST for `CHAPTER_AJAX_URL` returning fixture bytes
    - [ ] Call `await adapter.fetch_chapter(tuaid=33201, chuongid="")`
    - [ ] Assert result is not `None`

  - [x] **Test 8.8: `fetch_chapter` — empty response returns `ChapterParseResult` with `None` content** (AC: #4)
    - [ ] Load `vnthuquan_chapter_response_empty.txt` fixture
    - [ ] Mock POST returning fixture bytes
    - [ ] Call `await adapter.fetch_chapter(tuaid=33201, chuongid=2)`
    - [ ] Assert result is not `None`
    - [ ] Assert `result.content_html is None` (or is an empty-ish string — depends on parser fixture)

  - [x] **Test 8.9: `fetch_chapter` — HTTP error returns `None`** (AC: #2)
    - [ ] Mock POST returning `status=500` for all 4 attempts
    - [ ] Assert return value is `None`

  - [x] **Test 8.10: `crawl_book` — empty chapter logs warning and appends `""`** (AC: #4)
    - [ ] Patch `adapter.fetch_book_detail` to return a mock `BookDetail` with 2 chapters
    - [ ] Patch `adapter.fetch_chapter` to return `None` for the second chapter (or a result with `content_html=None`)
    - [ ] Call `await adapter.crawl_book(entry)`
    - [ ] Assert return value is `True`
    - [ ] Assert `caplog` contains `"Empty chapter"` warning

  - [x] **Test 8.11: `crawl_book` — `fetch_book_detail` failure returns `False`** (AC: #1)
    - [ ] Patch `adapter.fetch_book_detail` to return `None`
    - [ ] Assert return value is `False`

  - [x] **Test 8.12: `crawl_all` — uses semaphore to limit concurrency** (AC: #5)
    - [ ] Create a list of 6 fake `BookListingEntry` objects (all marked not-downloaded by mock state)
    - [ ] Patch `adapter.fetch_all_listings` to return the 6 entries
    - [ ] Use a counter + asyncio.Event to track max simultaneous in-flight calls to `crawl_book`
    - [ ] Patch `adapter.crawl_book` with an instrumented coroutine that increments the counter, awaits a small delay, then decrements it; record the peak count
    - [ ] Call `await adapter.crawl_all(concurrency=3)`
    - [ ] Assert peak concurrent count was at most 3

  - [x] **Test 8.13: `crawl_all` — `dry_run=True` prints entries but does not call `crawl_book`** (AC: #5)
    - [ ] Patch `adapter.fetch_all_listings` to return 2 fake entries
    - [ ] Patch `adapter.crawl_book` as a mock
    - [ ] Call `await adapter.crawl_all(dry_run=True)` (capture stdout or patch `print`)
    - [ ] Assert `crawl_book` was never called
    - [ ] Assert stdout contained `"[dry-run]"` lines

  - [x] **Test 8.14: `crawl_all` — `max_hours` guard aborts remaining books** (AC: #5)
    - [ ] Patch `time.time` to return a value that immediately exceeds `max_hours` after the first book
    - [ ] Assert that `crawl_book` is called 0 or 1 times (not all N books), demonstrating the guard fires

## Dev Notes

### File Layout

This story modifies exactly two files:

| File | Action |
|---|---|
| `apps/crawler/vnthuquan_crawler.py` | ADD: `CHAPTER_AJAX_URL` constant, `_done`/`_abort` in `__init__`, `fetch_book_detail`, `fetch_chapter`, `crawl_book`, `crawl_all`, `_monitor_health` |
| `apps/crawler/tests/test_vnthuquan_crawler.py` | ADD: 14 new test functions for the above methods |

These files must NOT be modified:
- `apps/crawler/vnthuquan_parser.py` — read-only; only call its functions via import
- `apps/crawler/models.py`
- `apps/crawler/utils/state.py`
- Any other file in the repo

### Architecture Overview

```
crawl_all(start, end, concurrency, max_hours, dry_run)
    │
    ├── fetch_all_listings(start, end)           [Story 2.2]
    │       └── returns list[BookListingEntry]   (Text-only filtered)
    │
    ├── filter pending: state.is_downloaded()    [stub: Story 3.2 fills state writes]
    │
    ├── asyncio.Semaphore(concurrency)
    │
    └── asyncio.gather(*[process_book(e) for e in pending])
            └── process_book(entry)
                    └── crawl_book(entry)
                            │
                            ├── fetch_book_detail(entry)
                            │       → GET truyen.aspx?tid=...
                            │       → parse_book_detail(html)
                            │       → BookDetail | None
                            │
                            └── for chuongid in detail.chapter_list:
                                    fetch_chapter(tuaid, chuongid)
                                        → POST chuonghoi_moi.aspx
                                        → parse_chapter_response(raw)
                                        → ChapterParseResult | None
```

### URL Patterns

| Purpose | Method | URL | Body |
|---|---|---|---|
| Book detail page | GET | `http://vietnamthuquan.eu/truyen.aspx?tid={tuaid}` | — |
| Chapter content | POST | `http://vietnamthuquan.eu/truyen/chuonghoi_moi.aspx` | `tuaid={id}&chuongid={n}` |
| Single-chapter | POST | same AJAX URL | `tuaid={id}&chuongid=` (empty) |

`entry.url` from `BookListingEntry` is already a fully qualified URL — do not prepend a base URL in `fetch_book_detail`.

### Exact Implementation: `fetch_book_detail`

```python
async def fetch_book_detail(self, entry: BookListingEntry) -> BookDetail | None:
    """Fetch and parse a book detail page."""
    url = entry.url  # e.g. "http://vietnamthuquan.eu/truyen.aspx?tid=12345"
    result = await self._rate_limited_request("GET", url)
    if result.error_type or not result.response:
        logger.warning(f"[vnthuquan] Failed book detail {url}: {result.error_detail}")
        return None
    html = await result.response.text(encoding="utf-8")
    detail = parse_book_detail(html)
    if detail is None:
        logger.warning(f"[vnthuquan] Unparseable book detail: {url}")
        return None
    logger.info(f"[vnthuquan] Fetched book: {detail.title} ({len(detail.chapter_list)} chapters)")
    return detail
```

### Exact Implementation: `fetch_chapter`

```python
CHAPTER_AJAX_URL = "http://vietnamthuquan.eu/truyen/chuonghoi_moi.aspx"

async def fetch_chapter(self, tuaid: int, chuongid: int | str) -> ChapterParseResult | None:
    """Fetch and parse one chapter via AJAX POST."""
    data = {"tuaid": str(tuaid), "chuongid": str(chuongid)}
    result = await self._rate_limited_request("POST", CHAPTER_AJAX_URL, data=data)
    if result.error_type or not result.response:
        logger.warning(f"[vnthuquan] Failed chapter {chuongid} for book {tuaid}: {result.error_detail}")
        return None
    raw = await result.response.text(encoding="utf-8")
    return parse_chapter_response(raw)
```

Key points:
- `chuongid=""` (empty string) is valid and required for single-chapter books (FR11). Never replace it with `0` or any other default.
- `str(chuongid)` on `""` stays `""` — this is intentional.
- Rate limit applies BEFORE every POST, same as GETs.

### Exact Implementation: `crawl_book` (stub — no state, no assembly)

```python
async def crawl_book(self, entry: BookListingEntry) -> bool:
    """Process one book: fetch detail + all chapters. State/assembly added in Stories 3.1/3.2."""
    detail = await self.fetch_book_detail(entry)
    if detail is None:
        return False
    chapters_html: list[str] = []
    cover_url: str | None = None
    for i, (chuongid, _) in enumerate(detail.chapter_list):
        result = await self.fetch_chapter(detail.tuaid, chuongid)
        if result is None or result.content_html is None:
            logger.warning(f"[vnthuquan] Empty chapter {chuongid} in book {detail.tuaid}")
            chapters_html.append("")
        else:
            chapters_html.append(result.content_html)
        if i == 0 and result is not None:
            cover_url = result.cover_image_url
    return True
```

`chapters_html` and `cover_url` are collected here but not yet used — Story 3.1 will extend this method to call `assemble_book_data(entry, detail, chapters_html, cover_url)` and `write_book_json(...)`. Do not add those calls now.

### Exact Implementation: `crawl_all`

```python
async def crawl_all(
    self,
    start_page: int = 1,
    end_page: int = 0,
    concurrency: int = 5,
    max_hours: float = 0.0,
    dry_run: bool = False,
) -> None:
    all_entries = await self.fetch_all_listings(start_page, end_page)

    if dry_run:
        for entry in all_entries:
            print(f"[dry-run] {entry.url}: {entry.title}")
        return

    pending = [e for e in all_entries if not self._state.is_downloaded(e.url)]
    logger.info(f"[vnthuquan] {len(all_entries)} books total, {len(pending)} pending")

    semaphore = asyncio.Semaphore(concurrency)
    start_time = time.time()

    async def process_book(entry: BookListingEntry) -> None:
        if max_hours > 0 and (time.time() - start_time) / 3600 > max_hours:
            return
        if self._abort:
            return
        async with semaphore:
            await self.crawl_book(entry)

    monitor_task = asyncio.create_task(self._monitor_health())
    try:
        await asyncio.gather(*[process_book(e) for e in pending])
    finally:
        self._done = True
        monitor_task.cancel()
```

### Exact Implementation: `_monitor_health` placeholder

```python
async def _monitor_health(self) -> None:
    """Placeholder health monitor — periodically checks session health."""
    while not self._done:
        await asyncio.sleep(30)
```

### `__init__` additions

Add the following two lines to the existing `__init__` body (do not change its signature):

```python
self._done: bool = False
self._abort: bool = False
```

### FR8 Author Carry-Through — No Action Required Here

`BookDetail` returned by `parse_book_detail()` does not store `author_name` or `author_id`. Those fields live on `BookListingEntry`. The caller chain works as follows:

```
crawl_book(entry)
    fetch_book_detail(entry)  →  BookDetail
    ...collect chapters_html, cover_url...
    # Story 3.1 adds:
    book_data = assemble_book_data(entry, detail, chapters_html, cover_url)
    #                              ^^^^^ ← author fields come from here
```

Do not copy author fields into `BookDetail` and do not add author-carrying logic to `fetch_book_detail`. The pattern is already correct by design.

### NFR10 — Empty Chapter Preservation

When a chapter response is empty or unparseable:
- Always append `""` (empty string) to `chapters_html`
- Always log the warning
- Never raise an exception
- Never skip the chapter or reduce the chapter count

This ensures the assembled `BookData` (Story 3.1) has exactly `len(detail.chapter_list)` entries in its chapter list, with empty chapters marked by empty HTML content strings.

### Log Messages (exact wording)

| Situation | Level | Message |
|---|---|---|
| `fetch_book_detail` HTTP or timeout failure | `WARNING` | `[vnthuquan] Failed book detail {url}: {result.error_detail}` |
| `fetch_book_detail` parser returns `None` | `WARNING` | `[vnthuquan] Unparseable book detail: {url}` |
| `fetch_book_detail` success | `INFO` | `[vnthuquan] Fetched book: {detail.title} ({n} chapters)` |
| `fetch_chapter` HTTP or timeout failure | `WARNING` | `[vnthuquan] Failed chapter {chuongid} for book {tuaid}: {result.error_detail}` |
| `crawl_book` empty/None chapter content | `WARNING` | `[vnthuquan] Empty chapter {chuongid} in book {detail.tuaid}` |
| `crawl_all` pending summary | `INFO` | `[vnthuquan] {total} books total, {pending} pending` |

The logger is already present as module-level `logger = logging.getLogger(__name__)` from Story 2.1 — do not create a new one.

### Test Fixture Files

All fixtures already exist from Epic 1 stories. Do NOT create or modify them.

| Fixture | Path | Used by |
|---|---|---|
| Multi-chapter book detail HTML | `apps/crawler/tests/fixtures/vnthuquan_book_detail.html` | Tests 8.1 |
| Single-chapter book detail HTML | `apps/crawler/tests/fixtures/vnthuquan_book_detail_single.html` | Test 8.2 |
| Chapter AJAX response (non-empty) | `apps/crawler/tests/fixtures/vnthuquan_chapter_response.txt` | Tests 8.6, 8.7 |
| Chapter AJAX response (empty) | `apps/crawler/tests/fixtures/vnthuquan_chapter_response_empty.txt` | Test 8.8 |

Load fixtures in tests via `pathlib.Path`:

```python
FIXTURES = Path(__file__).parent / "fixtures"

@pytest.fixture
def book_detail_fixture() -> str:
    return (FIXTURES / "vnthuquan_book_detail.html").read_text(encoding="utf-8")

@pytest.fixture
def book_detail_single_fixture() -> str:
    return (FIXTURES / "vnthuquan_book_detail_single.html").read_text(encoding="utf-8")

@pytest.fixture
def chapter_response_fixture() -> str:
    return (FIXTURES / "vnthuquan_chapter_response.txt").read_text(encoding="utf-8")

@pytest.fixture
def chapter_response_empty_fixture() -> str:
    return (FIXTURES / "vnthuquan_chapter_response_empty.txt").read_text(encoding="utf-8")
```

### Testing Pattern Reference

```python
import pytest
import asyncio
from aioresponses import aioresponses
from unittest.mock import AsyncMock, patch
from pathlib import Path

# Import from the module under test
from vnthuquan_crawler import VnthuquanAdapter, CHAPTER_AJAX_URL
from vnthuquan_parser import BookListingEntry

@pytest.fixture
def adapter(mock_state, mock_source_config, mock_session):
    """Reuse the adapter fixture from Story 2.1/2.2 conftest or define locally."""
    return VnthuquanAdapter(
        source_config=mock_source_config,
        session=mock_session,
        state=mock_state,
        output_dir=Path("/tmp/vnthuquan-test"),
    )

@pytest.mark.asyncio
async def test_fetch_book_detail_multi_chapter(adapter, book_detail_fixture):
    with aioresponses() as m:
        m.get(
            "http://vietnamthuquan.eu/truyen.aspx?tid=12345",
            body=book_detail_fixture.encode("utf-8"),
            status=200,
        )
        entry = BookListingEntry(
            url="http://vietnamthuquan.eu/truyen.aspx?tid=12345",
            title="Test Book",
            author_name="Test Author",
            author_id=99,
            format_type="Text",
            category_name="Kinh",
        )
        detail = await adapter.fetch_book_detail(entry)
    assert detail is not None
    assert detail.is_single_chapter is False
    assert len(detail.chapter_list) > 0

@pytest.mark.asyncio
async def test_fetch_chapter_post_body(adapter, chapter_response_fixture):
    with aioresponses() as m:
        m.post(
            CHAPTER_AJAX_URL,
            body=chapter_response_fixture.encode("utf-8"),
            status=200,
        )
        result = await adapter.fetch_chapter(tuaid=33201, chuongid=1)
    assert result is not None
    assert result.content_html is not None

@pytest.mark.asyncio
async def test_fetch_chapter_single_chapter(adapter, chapter_response_fixture):
    with aioresponses() as m:
        m.post(
            CHAPTER_AJAX_URL,
            body=chapter_response_fixture.encode("utf-8"),
            status=200,
        )
        result = await adapter.fetch_chapter(tuaid=33201, chuongid="")
    assert result is not None

@pytest.mark.asyncio
async def test_crawl_all_uses_semaphore(adapter):
    """Verify at most `concurrency` books processed simultaneously."""
    entries = [
        BookListingEntry(
            url=f"http://vietnamthuquan.eu/truyen.aspx?tid={i}",
            title=f"Book {i}",
            author_name="Author",
            author_id=i,
            format_type="Text",
            category_name="Kinh",
        )
        for i in range(6)
    ]
    peak = 0
    current = 0
    lock = asyncio.Lock()

    async def fake_crawl_book(entry):
        nonlocal peak, current
        async with lock:
            current += 1
            if current > peak:
                peak = current
        await asyncio.sleep(0.05)
        async with lock:
            current -= 1

    adapter._state.is_downloaded = lambda url: False

    with patch.object(adapter, "fetch_all_listings", return_value=entries):
        with patch.object(adapter, "crawl_book", side_effect=fake_crawl_book):
            await adapter.crawl_all(concurrency=3)

    assert peak <= 3
```

### Running the Tests

From the project root or from `apps/crawler/`:

```bash
cd apps/crawler && uv run pytest tests/test_vnthuquan_crawler.py -v
```

To run only the new tests added in this story (assuming they are grouped or named with a pattern):

```bash
cd apps/crawler && uv run pytest tests/test_vnthuquan_crawler.py -v -k "book_detail or fetch_chapter or crawl_book or crawl_all"
```

Full suite (must not break existing tests):

```bash
cd apps/crawler && uv run pytest tests/ -v
```

### Dependency Check

`aioresponses` should already be installed as a dev dependency from Story 2.1. If missing, add to `apps/crawler/pyproject.toml`:

```toml
[dependency-groups]
dev = [
    "aioresponses>=0.7.6",
    ...
]
```

Then run `uv sync` from `apps/crawler/`.

### Project Structure Notes

Files modified in this story:

- **`apps/crawler/vnthuquan_crawler.py`** — primary change file
  - Add `CHAPTER_AJAX_URL` module-level constant (near top, after imports)
  - Extend `VnthuquanAdapter.__init__` with `self._done` and `self._abort`
  - Add methods: `fetch_book_detail`, `fetch_chapter`, `crawl_book`, `crawl_all`, `_monitor_health`
  - Add imports: `parse_book_detail`, `parse_chapter_response`, `BookDetail`, `ChapterParseResult` from `vnthuquan_parser`; `import time` (if not present)

- **`apps/crawler/tests/test_vnthuquan_crawler.py`** — test additions
  - Add fixture functions for loading fixture files (if not already present from Stories 2.1/2.2)
  - Add 14 test functions as detailed in Task 8

Files that must NOT be modified:
- `apps/crawler/vnthuquan_parser.py`
- `apps/crawler/models.py`
- `apps/crawler/utils/state.py`
- `apps/crawler/tests/fixtures/*` (all fixture files are read-only)

### References

- Story 2.1 — `VnthuquanAdapter` skeleton, `RequestResult`, `_rate_limited_request`, `_request_with_retry`
- Story 2.2 — `fetch_listing_page`, `fetch_all_listings`, `_listing_url`
- Story 3.1 — `assemble_book_data`, `write_book_json` (will extend `crawl_book`)
- Story 3.2 — state management integration (will extend `crawl_book` with `self._state` calls)
- `apps/crawler/tests/fixtures/vnthuquan_book_detail.html` — multi-chapter fixture
- `apps/crawler/tests/fixtures/vnthuquan_book_detail_single.html` — single-chapter fixture
- `apps/crawler/tests/fixtures/vnthuquan_chapter_response.txt` — chapter AJAX fixture
- `apps/crawler/tests/fixtures/vnthuquan_chapter_response_empty.txt` — empty chapter fixture
- VNThuQuan chapter AJAX endpoint: `http://vietnamthuquan.eu/truyen/chuonghoi_moi.aspx`

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- `cover_url` local variable renamed to `_cover_url` (prefix) to avoid ruff F841 warning; it is collected but intentionally unused until Story 3.1 extends `crawl_book`.

### Completion Notes List

- Added `CHAPTER_AJAX_URL` constant, `_done`/`_abort` flags, `fetch_book_detail`, `fetch_chapter`, `crawl_book`, `crawl_all`, `_monitor_health` to `VnthuquanAdapter`.
- Added `time`, `BookDetail`, `ChapterParseResult`, `parse_book_detail`, `parse_chapter_response` imports.
- 14 new tests added; all 32 tests pass; 224 total pass (6 pre-existing unrelated failures unchanged).

### File List

- `apps/crawler/vnthuquan_crawler.py` — MODIFIED: CHAPTER_AJAX_URL, _done/_abort flags, 5 new methods, new imports
- `apps/crawler/tests/test_vnthuquan_crawler.py` — MODIFIED: 14 Story 2.3 tests added, asyncio import added

## Change Log

- 2026-04-16: Story 2.3 implemented — book detail/chapter fetch, crawl_book/crawl_all/monitor, 14 tests (Date: 2026-04-16)
