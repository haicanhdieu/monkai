# Story 3.2: Crawl State Management & Resume

Status: review

## Story

As a developer,
I want the crawler to maintain per-book state and resume from any interruption point,
So that I never lose progress or re-download completed books.

## Acceptance Criteria

1. **Given** `VnthuquanAdapter` is initialized
   **When** the adapter instance is created
   **Then** it holds a `CrawlState` instance constructed with `state_file="data/crawl-state-vnthuquan.json"`
   **And** the state file is loaded automatically (because `CrawlState.__init__` calls `_load()` internally)
   **And** it holds an `asyncio.Lock` instance as `self._state_lock` for serializing concurrent state writes

2. **Given** a book's `book.json` has been successfully written to disk
   **When** `crawl_book(entry)` completes that write
   **Then** the book's URL is marked `"downloaded"` in state via `self.state.mark_downloaded(entry.url)` ONLY AFTER the file write succeeds
   **And** `self.state.save()` is called immediately inside the same `async with self._state_lock` block — never batched
   **And** `logger.info(f"[vnthuquan] Downloaded: {entry.url} ({len(chapters_html)} chapters)")` is emitted

3. **Given** a book detail fetch (`fetch_book_detail`) returns `None` after all retries
   **When** `crawl_book(entry)` handles that failure
   **Then** `self.state.mark_error(entry.url)` is called
   **And** `self.state.save()` is called immediately inside `async with self._state_lock`
   **And** `crawl_book` returns `False`
   **And** the crawler continues to the next book without raising

4. **Given** an exception is raised during `assemble_book_data` or `write_book_json`
   **When** `crawl_book(entry)` catches that exception
   **Then** `self.state.mark_error(entry.url)` is called (not `mark_downloaded`)
   **And** `self.state.save()` is called immediately inside `async with self._state_lock`
   **And** `logger.error(f"[vnthuquan] Error writing book {entry.url}: {e}")` is emitted
   **And** `crawl_book` returns `False`

5. **Given** the crawler is restarted after an interruption
   **When** `crawl_all` calls `fetch_all_listings` and receives all book entries
   **Then** entries already marked `"downloaded"` in state are filtered out (O(1) per entry via dict lookup)
   **And** entries marked `"error"` are NOT filtered — they are re-attempted
   **And** `logger.info(f"[vnthuquan] {total} books total, {pending} pending, {done} already done")` is emitted
   **And** only the pending entries are passed to `crawl_book`

6. **Given** a book entry whose URL is already `"downloaded"` in state
   **When** `crawl_book(entry)` is called with that entry directly
   **Then** it logs `f"[vnthuquan] Skip (state): {entry.url}"` and returns `True` immediately
   **And** no HTTP requests are made

7. **Given** concurrent book processing with multiple async workers
   **When** two or more `crawl_book` coroutines complete simultaneously
   **Then** all state mutations (`mark_downloaded`, `mark_error`, `save`) are wrapped in `async with self._state_lock`
   **And** no data corruption or lost state updates occur

## Tasks / Subtasks

- [x] **Task 1: Add `_state_lock` and `state` to `VnthuquanAdapter.__init__`** (AC: #1, #7)
  - [x] Open `apps/crawler/vnthuquan_crawler.py` and locate `VnthuquanAdapter.__init__`
  - [x] Verify `self.state` is already accepted as a constructor parameter (from Story 2.1 skeleton) — if so, confirm it is stored as `self.state`
  - [x] If `self.state` is NOT already set up: add `state: CrawlState` parameter and store it as `self.state = state`
  - [x] Add `self._state_lock = asyncio.Lock()` in `__init__` — this must be created inside `__init__`, not at class level, to bind to the running event loop
  - [x] Add `import asyncio` at the top of `vnthuquan_crawler.py` if not already present
  - [x] Add `from utils.state import CrawlState` at the top if not already present

- [x] **Task 2: Update `crawl_book()` with full state integration** (AC: #2, #3, #4, #6)
  - [x] Locate the existing `crawl_book(self, entry: BookListingEntry) -> bool` method in `VnthuquanAdapter`
  - [x] **Add early-exit skip check at the top of the method (before any HTTP calls):**
  - [x] **After `fetch_book_detail` returns `None`, add error state handling:**
  - [x] **Wrap `assemble_book_data` + `write_book_json` + success state in a try/except block:**
  - [x] Verify the chapter-fetching loop (from Story 3.1) remains intact between the `fetch_book_detail` block and the try/except block
  - [x] Verify `cover_url` is captured only from the first chapter (`i == 0`) — this logic is already from Story 3.1

- [x] **Task 3: Update `crawl_all()` with resume logic** (AC: #5)
  - [x] Locate the existing `crawl_all(self, start_page, end_page, concurrency, max_hours, dry_run)` method
  - [x] After `all_entries = await self.fetch_all_listings(start_page, end_page)`, add the filtering + logging
  - [x] Replace any existing iteration over `all_entries` with iteration over `pending`
  - [x] Verify the `dry_run` branch still iterates `all_entries` (not `pending`) — dry-run should show everything regardless of state
  - [x] Verify `asyncio.Semaphore(concurrency)` is used for concurrency control

- [ ] **Task 4: Verify `CrawlState` instantiation in the CLI entry point** (AC: #1)
  - [ ] Deferred to Story 4-1 (CLI entry point not yet created)

- [x] **Task 5: Write state management tests** (AC: #1–#7)
  - [x] Open `apps/crawler/tests/test_vnthuquan_crawler.py`
  - [x] Add the tests listed in the Testing section below
  - [x] All new tests must pass: 14/14 pass
  - [x] Full suite must not regress: 239 pass (6 pre-existing failures in test_deduplication.py unrelated)

## Dev Notes

### Critical `CrawlState` API — Read This First

The actual `CrawlState` implementation in `apps/crawler/utils/state.py` differs slightly from the story prompt specification. Use the **actual** API:

```python
class CrawlState:
    def __init__(self, state_file: str = "data/crawl-state.json") -> None:
        # calls self._load() internally — NO separate public load() method
        ...

    def save(self) -> None: ...           # atomic via tempfile + os.replace
    def is_downloaded(self, url: str) -> bool: ...
    def mark_downloaded(self, url: str) -> None: ...
    def mark_error(self, url: str) -> None: ...  # NO reason parameter
    def get_status(self, url: str) -> StatusValue | None: ...
    def mark_skipped(self, url: str) -> None: ...
```

**Key differences from the prompt specification:**
- `mark_error(url)` takes NO `reason` parameter — do NOT pass a reason string
- There is NO public `load()` method — loading happens automatically in `__init__` via `_load()`
- State values are typed as `Literal["downloaded", "error", "skipped"]`
- `is_error(url)` does NOT exist — use `get_status(url) == "error"` if needed

**State file for this adapter:** `"data/crawl-state-vnthuquan.json"` — this must be distinct from the main crawler's `"data/crawl-state.json"`.

### Full `crawl_book()` Implementation

The complete method after Story 3.2 changes:

```python
async def crawl_book(self, entry: BookListingEntry) -> bool:
    """Process one book: fetch detail, chapters, assemble, write, update state."""
    # AC #6: early-exit if already downloaded
    if self.state.is_downloaded(entry.url):
        logger.info(f"[vnthuquan] Skip (state): {entry.url}")
        return True

    # Fetch book detail (title, ToC)
    detail = await self.fetch_book_detail(entry)
    if detail is None:
        # AC #3: mark error on detail fetch failure
        async with self._state_lock:
            self.state.mark_error(entry.url)
            self.state.save()
        return False

    # Fetch all chapters
    chapters_html: list[str] = []
    cover_url: str | None = None
    for i, (chuongid, _) in enumerate(detail.chapter_list):
        result = await self.fetch_chapter(detail.tuaid, chuongid)
        html = result.content_html if result else None
        if html is None:
            logger.warning(f"[vnthuquan] Empty chapter {chuongid} in book {detail.tuaid}")
            html = ""
        chapters_html.append(html)
        if i == 0 and result:
            cover_url = result.cover_image_url

    # AC #2 and #4: assemble, write, then update state
    try:
        book_data = assemble_book_data(entry, detail, chapters_html, cover_url)
        write_book_json(book_data, self.output_dir)  # write FIRST
        async with self._state_lock:
            self.state.mark_downloaded(entry.url)    # only after successful write
            self.state.save()
        logger.info(f"[vnthuquan] Downloaded: {entry.url} ({len(chapters_html)} chapters)")
        return True
    except Exception as e:
        async with self._state_lock:
            self.state.mark_error(entry.url)
            self.state.save()
        logger.error(f"[vnthuquan] Error writing book {entry.url}: {e}")
        return False
```

### Full `crawl_all()` Implementation

```python
async def crawl_all(
    self,
    start_page: int,
    end_page: int,
    concurrency: int,
    max_hours: float,
    dry_run: bool,
) -> None:
    all_entries = await self.fetch_all_listings(start_page, end_page)

    if dry_run:
        for entry in all_entries:
            typer.echo(f"[dry-run] {entry.url}: {entry.title}")
        return

    # AC #5: skip downloaded, re-attempt errors
    pending = [e for e in all_entries if not self.state.is_downloaded(e.url)]
    total = len(all_entries)
    done = total - len(pending)
    logger.info(f"[vnthuquan] {total} books total, {len(pending)} pending, {done} already done")

    semaphore = asyncio.Semaphore(concurrency)

    async def process_book(entry: BookListingEntry) -> bool:
        async with semaphore:
            return await self.crawl_book(entry)

    await asyncio.gather(*[process_book(e) for e in pending])
```

### `__init__` Changes

Add exactly two lines to `VnthuquanAdapter.__init__`:

```python
self._state_lock = asyncio.Lock()
```

If `self.state` is not already set (check Story 2.1 implementation — the skeleton accepted `state` as a parameter), add:

```python
self.state = state  # CrawlState instance
```

The full `__init__` signature must include `state: CrawlState`:

```python
def __init__(
    self,
    source_config,           # SourceConfig or similar
    session: aiohttp.ClientSession,
    state: CrawlState,
    output_dir: Path,
) -> None:
    self.source_config = source_config
    self.session = session
    self.state = state
    self.output_dir = output_dir
    self._state_lock = asyncio.Lock()
    self._session_refresh_count = 0
    self.rate_limit_seconds = source_config.rate_limit_seconds
```

### State Enforcement Rules

| Rule | Where enforced |
|------|----------------|
| State marked ONLY after successful disk write | `crawl_book`: `write_book_json` is called before `mark_downloaded` |
| State saved after EVERY book outcome | Both `try` and `except` branches call `state.save()` |
| Lock wraps all state read-modify-write | `async with self._state_lock` around `mark_*` + `save()` |
| Resume: re-attempt `error` books | `pending` filter uses only `is_downloaded()` — error URLs pass through |
| Skip only `downloaded` books | Same filter: `not self.state.is_downloaded(e.url)` |
| Never modify `utils/state.py` | Do not touch this file |

### Concurrency Safety Detail

`asyncio.Lock` is appropriate here (not `threading.Lock`) because all crawler code runs in a single OS thread under an asyncio event loop. The lock serializes the `mark_* + save` sequence across coroutines that may be suspended mid-operation.

**Why the lock is needed:**
```
Worker A: mark_downloaded("url_a")    ← modifies _state dict
Worker B: mark_downloaded("url_b")    ← modifies _state dict concurrently
Worker A: save()                      ← may overwrite B's change if interleaved
Worker B: save()
```

With the lock, each worker holds exclusive access for the full `mark + save` sequence.

**Important:** The `is_downloaded()` check at the top of `crawl_book` is intentionally outside the lock — it is a read-only check and does not need serialization. The only risk (a race where two workers both read `False` and both start crawling the same book) is handled by the file system — `write_book_json` uses `model_dump_json` which is idempotent, and `mark_downloaded` is called after write so the second write simply overwrites.

### State File Location

The VNThuQuan crawler uses its own state file, separate from the main crawler:

```
apps/crawler/
  data/
    crawl-state.json             ← main crawler (do not use)
    crawl-state-vnthuquan.json   ← this adapter
    book-data/
      vnthuquan/
        {category_seo_name}/
          {book_seo_name}/
            book.json
```

The `data/` directory is relative to the CWD when the crawler runs. The CLI entry point must `cd` to or be launched from `apps/crawler/`, or `output_dir` and `state_file` must be specified as absolute paths.

### Testing Guidance

#### Fixtures

Add these fixtures to `apps/crawler/tests/test_vnthuquan_crawler.py` if not already present:

```python
import pytest
import asyncio
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch
from utils.state import CrawlState
from vnthuquan_crawler import VnthuquanAdapter
from vnthuquan_parser import BookListingEntry, BookDetail, ChapterParseResult


@pytest.fixture
def tmp_state(tmp_path) -> CrawlState:
    """A fresh CrawlState backed by a temp file."""
    state_file = str(tmp_path / "crawl-state-vnthuquan.json")
    return CrawlState(state_file=state_file)


@pytest.fixture
def adapter(tmp_path, tmp_state) -> VnthuquanAdapter:
    """A VnthuquanAdapter with real CrawlState and mock session."""
    session = MagicMock()
    source_config = MagicMock()
    source_config.rate_limit_seconds = 0  # no delay in tests
    return VnthuquanAdapter(
        source_config=source_config,
        session=session,
        state=tmp_state,
        output_dir=tmp_path,
    )


def make_entry(url: str = "http://vnthuquan.net/truyen/abc.aspx") -> BookListingEntry:
    return BookListingEntry(
        url=url,
        title="Bầu Trời Chung",
        author_name="Tác Giả Test",
        author_id=1001,
        category_name="Truyện ngắn",
        category_id=1,
        chapter_count=2,
        date="1.1.2026",
        format_type="Text",
    )


def make_detail() -> BookDetail:
    return BookDetail(
        tuaid=9999,
        book_name="Bầu Trời Chung",
        chapter_list=[(101, "Chương 1"), (102, "Chương 2")],
    )


def make_chapter_result(html: str = "<p>content</p>", cover: str | None = None) -> ChapterParseResult:
    return ChapterParseResult(
        content_html=html,
        cover_image_url=cover,
    )
```

#### Test: State file loaded on init (AC #1)

```python
def test_adapter_state_loaded_on_init(tmp_path, tmp_state):
    """CrawlState is initialized and accessible on adapter."""
    session = MagicMock()
    source_config = MagicMock()
    source_config.rate_limit_seconds = 0
    adapter = VnthuquanAdapter(
        source_config=source_config,
        session=session,
        state=tmp_state,
        output_dir=tmp_path,
    )
    assert adapter.state is tmp_state
    assert adapter._state_lock is not None


def test_state_lock_is_asyncio_lock(adapter):
    """_state_lock must be an asyncio.Lock, not a threading.Lock."""
    assert isinstance(adapter._state_lock, asyncio.Lock)
```

#### Test: State marked downloaded after write, not before (AC #2)

```python
@pytest.mark.asyncio
async def test_crawl_book_marks_downloaded_after_write(adapter, tmp_path):
    """mark_downloaded is called only after write_book_json succeeds."""
    entry = make_entry()
    detail = make_detail()
    
    call_order = []

    with (
        patch.object(adapter, "fetch_book_detail", new=AsyncMock(return_value=detail)),
        patch.object(adapter, "fetch_chapter", new=AsyncMock(return_value=make_chapter_result())),
        patch("vnthuquan_crawler.write_book_json", side_effect=lambda *a, **kw: call_order.append("write")),
        patch("vnthuquan_crawler.assemble_book_data", return_value=MagicMock()),
    ):
        original_mark = adapter.state.mark_downloaded
        def mark_and_record(url):
            call_order.append("mark_downloaded")
            original_mark(url)
        adapter.state.mark_downloaded = mark_and_record

        result = await adapter.crawl_book(entry)

    assert result is True
    assert call_order.index("write") < call_order.index("mark_downloaded"), \
        "write must happen before mark_downloaded"
    assert adapter.state.is_downloaded(entry.url)
```

#### Test: State saved immediately after success (AC #2)

```python
@pytest.mark.asyncio
async def test_crawl_book_saves_state_immediately_on_success(adapter, tmp_path):
    """State file is written to disk after each successful book."""
    entry = make_entry()
    detail = make_detail()
    state_file = Path(adapter.state._state_file)

    with (
        patch.object(adapter, "fetch_book_detail", new=AsyncMock(return_value=detail)),
        patch.object(adapter, "fetch_chapter", new=AsyncMock(return_value=make_chapter_result())),
        patch("vnthuquan_crawler.write_book_json"),
        patch("vnthuquan_crawler.assemble_book_data", return_value=MagicMock()),
    ):
        await adapter.crawl_book(entry)

    assert state_file.exists(), "State file must be saved to disk after crawl_book"
    import json
    saved = json.loads(state_file.read_text(encoding="utf-8"))
    assert saved.get(entry.url) == "downloaded"
```

#### Test: State marked error on detail fetch failure (AC #3)

```python
@pytest.mark.asyncio
async def test_crawl_book_marks_error_on_detail_failure(adapter, tmp_path):
    """When fetch_book_detail returns None, URL is marked error and state is saved."""
    entry = make_entry()
    state_file = Path(adapter.state._state_file)

    with patch.object(adapter, "fetch_book_detail", new=AsyncMock(return_value=None)):
        result = await adapter.crawl_book(entry)

    assert result is False
    assert adapter.state.get_status(entry.url) == "error"
    assert state_file.exists()
    import json
    saved = json.loads(state_file.read_text(encoding="utf-8"))
    assert saved.get(entry.url) == "error"
```

#### Test: State marked error on write exception (AC #4)

```python
@pytest.mark.asyncio
async def test_crawl_book_marks_error_on_write_exception(adapter, tmp_path):
    """When write_book_json raises, URL is marked error and state is saved."""
    entry = make_entry()
    detail = make_detail()

    with (
        patch.object(adapter, "fetch_book_detail", new=AsyncMock(return_value=detail)),
        patch.object(adapter, "fetch_chapter", new=AsyncMock(return_value=make_chapter_result())),
        patch("vnthuquan_crawler.assemble_book_data", return_value=MagicMock()),
        patch("vnthuquan_crawler.write_book_json", side_effect=OSError("disk full")),
    ):
        result = await adapter.crawl_book(entry)

    assert result is False
    assert adapter.state.get_status(entry.url) == "error"
    assert not adapter.state.is_downloaded(entry.url)
```

#### Test: Already-downloaded books skipped in crawl_book (AC #6)

```python
@pytest.mark.asyncio
async def test_crawl_book_skips_downloaded_url(adapter):
    """If URL is already downloaded in state, crawl_book skips all HTTP and returns True."""
    entry = make_entry()
    adapter.state.mark_downloaded(entry.url)

    with patch.object(adapter, "fetch_book_detail", new=AsyncMock()) as mock_detail:
        result = await adapter.crawl_book(entry)
        mock_detail.assert_not_called()

    assert result is True
```

#### Test: crawl_all skips downloaded entries (AC #5)

```python
@pytest.mark.asyncio
async def test_crawl_all_skips_downloaded_entries(adapter):
    """crawl_all filters out downloaded entries before dispatching crawl_book."""
    entry_done = make_entry(url="http://vnthuquan.net/truyen/done.aspx")
    entry_todo = make_entry(url="http://vnthuquan.net/truyen/todo.aspx")

    adapter.state.mark_downloaded(entry_done.url)

    with (
        patch.object(adapter, "fetch_all_listings", new=AsyncMock(return_value=[entry_done, entry_todo])),
        patch.object(adapter, "crawl_book", new=AsyncMock(return_value=True)) as mock_crawl,
    ):
        await adapter.crawl_all(start_page=1, end_page=1, concurrency=1, max_hours=1, dry_run=False)

    called_urls = [call.args[0].url for call in mock_crawl.call_args_list]
    assert entry_done.url not in called_urls, "Downloaded entry must not be passed to crawl_book"
    assert entry_todo.url in called_urls, "Pending entry must be passed to crawl_book"
```

#### Test: crawl_all re-attempts error entries (AC #5)

```python
@pytest.mark.asyncio
async def test_crawl_all_reattempts_error_entries(adapter):
    """crawl_all does NOT skip entries with 'error' status — they are re-attempted."""
    entry_error = make_entry(url="http://vnthuquan.net/truyen/error.aspx")
    adapter.state.mark_error(entry_error.url)

    with (
        patch.object(adapter, "fetch_all_listings", new=AsyncMock(return_value=[entry_error])),
        patch.object(adapter, "crawl_book", new=AsyncMock(return_value=True)) as mock_crawl,
    ):
        await adapter.crawl_all(start_page=1, end_page=1, concurrency=1, max_hours=1, dry_run=False)

    called_urls = [call.args[0].url for call in mock_crawl.call_args_list]
    assert entry_error.url in called_urls, "Error entry must be re-attempted"
```

#### Test: Concurrent state updates do not corrupt state (AC #7)

```python
@pytest.mark.asyncio
async def test_concurrent_state_updates_no_corruption(adapter, tmp_path):
    """Multiple concurrent crawl_book calls serialize state writes without data loss."""
    entries = [make_entry(url=f"http://vnthuquan.net/truyen/{i}.aspx") for i in range(10)]
    detail = make_detail()

    with (
        patch.object(adapter, "fetch_book_detail", new=AsyncMock(return_value=detail)),
        patch.object(adapter, "fetch_chapter", new=AsyncMock(return_value=make_chapter_result())),
        patch("vnthuquan_crawler.write_book_json"),
        patch("vnthuquan_crawler.assemble_book_data", return_value=MagicMock()),
    ):
        results = await asyncio.gather(*[adapter.crawl_book(e) for e in entries])

    assert all(results), "All books should succeed"
    for entry in entries:
        assert adapter.state.is_downloaded(entry.url), f"{entry.url} not marked downloaded"
```

### Running Tests

Run only state management tests:
```bash
cd apps/crawler && uv run pytest tests/test_vnthuquan_crawler.py -v -k "state or skip or downloaded or error or concurrent or crawl_all"
```

Run full test suite (must not regress):
```bash
cd apps/crawler && uv run pytest tests/ -v
```

Lint:
```bash
cd apps/crawler && uv run ruff check vnthuquan_crawler.py
```

### Common Pitfalls

1. **`asyncio.Lock()` must be created in `__init__`**, not at class level. Creating it at class level shares a lock across instances and fails if the event loop is replaced between tests.

2. **Do NOT use `threading.Lock`** — all crawler code is async; use `asyncio.Lock`.

3. **`mark_error(url)` takes no reason argument** — the actual `CrawlState` in `utils/state.py` has `def mark_error(self, url: str) -> None` with no `reason` parameter.

4. **The state file path must be `"data/crawl-state-vnthuquan.json"`**, not `"data/crawl-state.json"`. The latter is the main crawler's state file.

5. **Do not skip the `is_downloaded` check in `crawl_all` when `dry_run=True`** — dry-run should show ALL entries including already-downloaded ones (for visibility), and `crawl_book` is never called in dry-run mode.

6. **State is per-URL, not per-file** — the URL stored in state is `entry.url` (the book listing URL), not the file path of `book.json`.

7. **Do not batch saves** — call `self.state.save()` immediately after every `mark_*` call. Never accumulate mutations and save once at the end.

### Project Structure Notes

**Files modified by this story:**

- **MODIFY: `apps/crawler/vnthuquan_crawler.py`**
  - `VnthuquanAdapter.__init__`: add `self._state_lock = asyncio.Lock()`, verify `self.state = state`
  - `VnthuquanAdapter.crawl_book()`: add skip check, error state on detail failure, try/except with state on write, correct ordering (write → mark → save)
  - `VnthuquanAdapter.crawl_all()`: add `pending` filter, skip-count logging, pass `pending` to `asyncio.gather`
  - Imports: verify `import asyncio`, `from utils.state import CrawlState`

- **MODIFY: `apps/crawler/tests/test_vnthuquan_crawler.py`**
  - Add fixtures: `tmp_state`, updated `adapter` fixture using real `CrawlState`
  - Add 9 new tests as listed in Testing Guidance above

**Files NOT modified:**

- `apps/crawler/utils/state.py` — frozen, do not touch under any circumstances
- `apps/crawler/models.py` — frozen
- `apps/crawler/vnthuquan_parser.py` — frozen for this story
- Any file outside `apps/crawler/`

### References

- `apps/crawler/utils/state.py` — actual `CrawlState` source (read before implementing)
- `_bmad-output/implementation-artifacts/phase-1-1-vnthuquan-crawler/3-1-bookdata-v2-assembly-file-writing.md` — Story 3.1 which implements `assemble_book_data`, `write_book_json`, and the base `crawl_book` this story extends
- `_bmad-output/implementation-artifacts/phase-1-1-vnthuquan-crawler/2-1-http-infrastructure-vnthuquanadapter-skeleton.md` — Story 2.1 which defines the `VnthuquanAdapter.__init__` signature (state parameter was included)
- `_bmad-output/planning-artifacts/phase-1-1-vnthuquan-crawler/epics-vnthuquan-crawler.md` — source epic for Story 3.2 acceptance criteria

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
