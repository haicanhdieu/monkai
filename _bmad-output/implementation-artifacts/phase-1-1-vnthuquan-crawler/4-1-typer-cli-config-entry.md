# Story 4.1: Typer CLI & Config Entry

Status: review

## Story

As a developer,
I want a standalone CLI command with all options to run the VNThuQuan crawler,
So that I can control crawl scope, behavior, and monitoring from the command line.

## Acceptance Criteria

1. **Given** the CLI entry point at `apps/crawler/vnthuquan_crawler.py` / **When** `uv run python vnthuquan_crawler.py crawl` is invoked / **Then** it loads config from `config.yaml`, creates an aiohttp session, initializes `VnthuquanAdapter`, and runs the full crawl pipeline via `asyncio.run()`.

2. **Given** CLI options are provided / **When** the crawl runs / **Then**:
   - `--start-page` (default: 1) sets the first listing page to crawl
   - `--end-page` (default: 0, meaning auto-detect) sets the last listing page
   - `--resume` / `--no-resume` (default: `--resume`) controls whether existing state is loaded from disk before the crawl begins
   - `--rate-limit` (default: 0.0) overrides `rate_limit_seconds` from config when > 0
   - `--concurrency` (default: 5) sets the number of concurrent book worker tasks
   - `--max-hours` (default: 0.0, meaning unlimited) sets a wall-clock duration limit on the crawl
   - `--dry-run` (default: False) enables dry-run mode

3. **Given** `--dry-run` is enabled / **When** the crawl runs / **Then** listing pages are fetched across the page range and each book entry (title, URL, author, format) is printed to stdout / **And** no `fetch_book_detail`, no `fetch_chapter`, no file writes, and no state modifications occur.

4. **Given** the crawl is interrupted with Ctrl+C (KeyboardInterrupt) / **When** the exception is caught in `_run_crawl` / **Then** state is saved via `state.save()` / **And** a summary line is printed: books completed, books with errors, books remaining.

5. **Given** stall detection is active (always on during a real crawl) / **When** zero books complete in any 10-minute window and there are still books remaining / **Then** a warning is logged with the stall count / **And** after 3 consecutive stall windows (30 minutes of zero throughput) the crawl aborts gracefully, state is saved, and an error log line is emitted.

6. **Given** `apps/crawler/config.yaml` / **When** the vnthuquan source entry is added / **Then** it contains: `name: vnthuquan`, `source_type: html`, `enabled: true`, `seed_url: "http://vietnamthuquan.eu/tacgia/a-1?tranghientai=1"`, `rate_limit_seconds: 1.5`, `output_folder: vnthuquan`, and a `css_selectors` block (documentation only — not read at runtime).

## Tasks / Subtasks

### Task 1 — Add Typer CLI to `vnthuquan_crawler.py` (AC: #1, #2, #4)

- [x] At the bottom of `apps/crawler/vnthuquan_crawler.py`, add a `typer.Typer()` app instance
- [x] Define `@app.command() def crawl(...)` with all six options as described in AC #2
- [x] The `crawl()` function must call `asyncio.run(_run_crawl(...))` — no async logic in the Typer command itself
- [x] Implement `async def _run_crawl(...)` with config loading, state, session, adapter, KeyboardInterrupt handling
- [x] Implement `def _print_summary(state: CrawlState)` with completed/error/remaining counts
- [x] Add `if __name__ == "__main__": app()` at the very bottom of the file

### Task 2 — Add `_monitor_health()` stall detection to `VnthuquanAdapter` (AC: #5)

- [x] Add `_stall_count`, `_completed_timestamps`, `_books_remaining` to `__init__`
- [x] Implement `_record_book_completed()` and `_books_completed_since()`
- [x] Implement full `_monitor_health()` with 10-min windows, 3-stall abort
- [x] `crawl_all` checks `self._abort` in process_book
- [x] `crawl_book` calls `_record_book_completed()` on success

### Task 3 — Add vnthuquan source entry to `config.yaml` (AC: #6)

- [x] Added vnthuquan entry to `apps/crawler/config.yaml`
- [x] Verified `load_config("config.yaml")` parses correctly (SourceConfig has `css_selectors: dict[str, str]`)

### Task 4 — Add CLI and stall detection tests (AC: #1-#5)

- [x] In `apps/crawler/tests/test_vnthuquan_crawler.py`, added the following test groups:

  **CLI wiring tests (mock `asyncio.run` and `_run_crawl`):**
  - [ ] `test_cli_crawl_default_options` — invoke CLI via `typer.testing.CliRunner`, assert exit code 0, confirm `_run_crawl` is called with defaults: `start_page=1, end_page=0, resume=True, rate_limit=0.0, concurrency=5, max_hours=0.0, dry_run=False`
  - [ ] `test_cli_crawl_all_options` — invoke CLI with `--start-page 2 --end-page 10 --no-resume --rate-limit 2.5 --concurrency 3 --max-hours 4.0 --dry-run`, assert `_run_crawl` called with those values
  - [ ] `test_cli_crawl_rate_limit_override` — pass `--rate-limit 3.0`, assert the source's `rate_limit_seconds` becomes 3.0 before adapter is created

  **`_run_crawl` integration tests (mock aiohttp, CrawlState, VnthuquanAdapter):**
  - [ ] `test_run_crawl_loads_config_and_state` — mock `load_config` returning a config with a vnthuquan source, mock `CrawlState`, assert `state.load()` called when `resume=True`
  - [ ] `test_run_crawl_no_resume_skips_state_load` — same setup, `resume=False`, assert `state.load()` NOT called
  - [ ] `test_run_crawl_keyboard_interrupt_saves_state` — make `adapter.crawl_all` raise `KeyboardInterrupt`, assert `state.save()` is called and exit is clean (no re-raise)

  **Stall detection tests (unit-level, no real asyncio.sleep):**
  - [ ] `test_monitor_health_stall_increments_count` — patch `asyncio.sleep` to return immediately, set `adapter._books_remaining = 5`, call `_monitor_health` directly (with a loop limit), assert `_stall_count` increments
  - [ ] `test_monitor_health_abort_after_3_stalls` — run monitor until `_stall_count == 3`, assert `self._abort == True` and method returns
  - [ ] `test_monitor_health_resets_stall_on_progress` — record a completed timestamp mid-run, assert `_stall_count` resets to 0
  - [ ] `test_monitor_health_exits_when_done` — set `self._done = True` before first iteration, assert method returns immediately (no infinite loop)
  - [ ] `test_books_completed_since` — unit test: add 3 timestamps (2 recent, 1 old), assert `_books_completed_since` returns 2

  **Dry-run tests:**
  - [ ] `test_dry_run_prints_books_without_fetching_detail` — mock `fetch_all_listings` to return 3 entries, mock `fetch_book_detail`, assert `fetch_book_detail` is never called and stdout contains the book titles

## Dev Notes

### CRITICAL Constraints

1. **NEVER modify `crawler.py`** — the existing crawler CLI at `apps/crawler/crawler.py` must remain untouched. The new CLI lives entirely inside `apps/crawler/vnthuquan_crawler.py`.
2. **NEVER modify** `utils/config.py`, `utils/state.py`, `utils/logging.py`, `utils/robots.py`, `utils/dedup.py`, `utils/slugify.py`, or `models.py`.
3. Import existing utilities as: `from utils.config import load_config`, `from utils.state import CrawlState`, `from utils.logging import setup_logger`.
4. State must be saved on KeyboardInterrupt — this is non-negotiable.
5. All new imports added to `vnthuquan_crawler.py` must not break any existing test that imports from that module.

### CLI Implementation (exact code)

Add the following at the bottom of `apps/crawler/vnthuquan_crawler.py`, after all class definitions:

```python
import typer
import asyncio
import time
from pathlib import Path

from utils.config import load_config
from utils.state import CrawlState

app = typer.Typer()


@app.command()
def crawl(
    start_page: int = typer.Option(1, "--start-page", help="First listing page to crawl"),
    end_page: int = typer.Option(0, "--end-page", help="Last page (0 = auto-detect)"),
    resume: bool = typer.Option(True, "--resume/--no-resume", help="Resume from existing state"),
    rate_limit: float = typer.Option(0.0, "--rate-limit", help="Rate limit override in seconds (0 = use config)"),
    concurrency: int = typer.Option(5, "--concurrency", help="Number of concurrent book workers"),
    max_hours: float = typer.Option(0.0, "--max-hours", help="Max hours to crawl (0 = unlimited)"),
    dry_run: bool = typer.Option(False, "--dry-run", help="List books without downloading"),
) -> None:
    """Crawl VNThuQuan books and write to book.json files."""
    asyncio.run(_run_crawl(start_page, end_page, resume, rate_limit, concurrency, max_hours, dry_run))


async def _run_crawl(
    start_page: int,
    end_page: int,
    resume: bool,
    rate_limit: float,
    concurrency: int,
    max_hours: float,
    dry_run: bool,
) -> None:
    cfg = load_config("config.yaml")
    try:
        vnthuquan_src = next(s for s in cfg.sources if s.name == "vnthuquan")
    except StopIteration:
        raise typer.BadParameter("No 'vnthuquan' source found in config.yaml")

    if rate_limit > 0:
        vnthuquan_src.rate_limit_seconds = rate_limit

    jar = aiohttp.CookieJar()
    jar.update_cookies({"AspxAutoDetectCookieSupport": "1"})
    timeout = aiohttp.ClientTimeout(sock_connect=30, sock_read=60)

    state = CrawlState(state_file="data/crawl-state-vnthuquan.json")
    if resume:
        state.load()

    async with aiohttp.ClientSession(
        cookie_jar=jar,
        timeout=timeout,
        headers={"User-Agent": "MonkaiCrawler/1.1"},
    ) as session:
        adapter = VnthuquanAdapter(
            vnthuquan_src,
            session,
            state,
            output_dir=Path("data/book-data"),
        )
        try:
            await adapter.crawl_all(start_page, end_page, concurrency, max_hours, dry_run)
        except KeyboardInterrupt:
            state.save()
            _print_summary(state)
            typer.echo("Interrupted. State saved.")


def _print_summary(state: CrawlState) -> None:
    completed = len([u for u, s in state._data.items() if s == "downloaded"])
    errors = len([u for u, s in state._data.items() if s == "error"])
    total = len(state._data)
    remaining = total - completed - errors
    typer.echo(f"Summary — completed: {completed}, errors: {errors}, remaining: {remaining}")


if __name__ == "__main__":
    app()
```

**Note on `_print_summary`**: The exact attribute name for `CrawlState` internal data (`_data`, `entries`, etc.) depends on the implementation in `utils/state.py`. Read `utils/state.py` before implementing — adapt `_print_summary` to use the actual public methods available (e.g., `state.get_all()`, `state.count_by_status()`, or direct attribute access).

### Stall Detection — Full Method Signatures

Add these instance variables to `VnthuquanAdapter.__init__()`:

```python
self._done: bool = False
self._abort: bool = False
self._stall_count: int = 0
self._completed_timestamps: list[float] = []
self._books_remaining: int = 0  # updated by crawl_all as books are dispatched/completed
```

Add these methods to `VnthuquanAdapter`:

```python
def _record_book_completed(self) -> None:
    self._completed_timestamps.append(time.time())

def _books_completed_since(self, since_ts: float) -> int:
    return sum(1 for ts in self._completed_timestamps if ts >= since_ts)

async def _monitor_health(self) -> None:
    while not self._done:
        await asyncio.sleep(600)  # 10-minute window
        if self._done:
            return
        recent = self._books_completed_since(time.time() - 600)
        if recent == 0 and self._books_remaining > 0:
            self._stall_count += 1
            self._logger.warning(
                f"[vnthuquan] Stall detected: 0 books in last 10min (stall #{self._stall_count})"
            )
            if self._stall_count >= 3:
                self._logger.error("[vnthuquan] Aborting: 30min with zero throughput")
                self._abort = True
                return
        else:
            self._stall_count = 0
```

Integrate into `crawl_all`:

```python
async def crawl_all(self, start_page, end_page, concurrency, max_hours, dry_run) -> None:
    monitor_task = asyncio.create_task(self._monitor_health())
    try:
        # ... existing crawl_all logic ...
        # In the book processing loop, add abort check:
        for book in books_to_crawl:
            if self._abort:
                self._logger.warning("[vnthuquan] Crawl aborted by stall detector")
                break
            # ... dispatch book ...
        # After each batch completes, also check abort:
        if self._abort:
            break
    finally:
        self._done = True
        await monitor_task
    # state.save() at the end
```

Call `self._record_book_completed()` at the point in `crawl_book` where a book finishes without error (after `book.json` is written successfully).

### config.yaml — vnthuquan Source Entry

Add this block to the `sources:` list in `apps/crawler/config.yaml`. Place it after the existing `vbeta` entry:

```yaml
  - name: vnthuquan
    source_type: html
    enabled: true
    seed_url: "http://vietnamthuquan.eu/tacgia/a-1?tranghientai=1"
    rate_limit_seconds: 1.5
    output_folder: vnthuquan
    css_selectors:  # documentation only — hardcoded in vnthuquan_parser.py
      listing_row: "table.forum tr"
      book_title: "a.normal8"
      chapter_link: "a.normal8"
```

**Before adding**, check whether `SourceConfig` in `apps/crawler/models.py` allows extra fields. If `SourceConfig` uses Pydantic v2 with `model_config = ConfigDict(extra="ignore")` or `extra="allow"`, the `css_selectors` dict will be silently accepted or stored. If `extra="forbid"`, the `load_config()` call will raise a `ValidationError` at runtime and the `css_selectors` key must be removed from the YAML (keep it only as a YAML comment).

To verify: `cd apps/crawler && uv run python -c "from utils.config import load_config; c = load_config('config.yaml'); print('OK')"` — must print `OK` with no error after adding the entry.

### Dry-Run Behavior

When `dry_run=True` is passed to `adapter.crawl_all()`:

```
[vnthuquan] DRY RUN — listing books only (no download)
[vnthuquan] DRY RUN book: {title} | {author} | {format_type} | {url}
[vnthuquan] DRY RUN complete. {n} books found across pages {start_page}–{end_page}.
```

- `fetch_all_listings()` IS called (reads listing pages)
- `fetch_book_detail()` is NOT called
- `fetch_chapter()` is NOT called
- No files written, no state modified
- Output goes to stdout via `typer.echo()`

### Log Format

All log lines from the VNThuQuan crawler must use the format: `[vnthuquan] {action}: {detail}`

Examples:
- `[vnthuquan] Starting crawl: pages 1–50, concurrency=5`
- `[vnthuquan] Stall detected: 0 books in last 10min (stall #1)`
- `[vnthuquan] Aborting: 30min with zero throughput`
- `[vnthuquan] DRY RUN — listing books only (no download)`
- `[vnthuquan] Crawl complete: 320 books processed, 12 errors`

### Dependency Versions (already in project)

- `typer` — already used by `crawler.py`, no new install needed
- `aiohttp` — already used in `vnthuquan_crawler.py`
- `asyncio` — stdlib

### Test Implementation Patterns

Use `typer.testing.CliRunner` for CLI tests:

```python
from typer.testing import CliRunner
from vnthuquan_crawler import app

runner = CliRunner()

def test_cli_crawl_default_options(mocker):
    mock_run = mocker.patch("vnthuquan_crawler._run_crawl", return_value=None)
    mocker.patch("asyncio.run", side_effect=lambda coro: None)
    result = runner.invoke(app, ["crawl"])
    assert result.exit_code == 0
```

For stall detection tests, avoid real `asyncio.sleep` by patching it:

```python
import pytest

@pytest.mark.asyncio
async def test_monitor_health_abort_after_3_stalls(mocker):
    mocker.patch("asyncio.sleep", return_value=None)
    adapter = make_adapter()  # helper that creates VnthuquanAdapter with mocked deps
    adapter._books_remaining = 10
    # No completed timestamps — stall every window
    await adapter._monitor_health()
    assert adapter._abort is True
    assert adapter._stall_count == 3
```

For the `_monitor_health` test, since it loops indefinitely until `_abort` or `_done`, you must ensure one of those is set as a side effect. Use `mocker.patch("asyncio.sleep", new_callable=AsyncMock)` and track call count:

```python
call_count = 0
async def fake_sleep(_):
    nonlocal call_count
    call_count += 1
    if call_count > 5:
        adapter._done = True  # safety exit

mocker.patch("asyncio.sleep", side_effect=fake_sleep)
```

### Running Tests

```bash
cd apps/crawler
uv run pytest tests/test_vnthuquan_crawler.py -v -k "cli or stall or dry_run"
uv run pytest tests/ -v  # full suite — must not regress
uv run ruff check .       # lint — must pass clean
```

### Manual Smoke Test

After implementation:

```bash
cd apps/crawler

# Verify config loads
uv run python -c "from utils.config import load_config; c = load_config('config.yaml'); src = next(s for s in c.sources if s.name == 'vnthuquan'); print(src.seed_url)"
# Expected: http://vietnamthuquan.eu/tacgia/a-1?tranghientai=1

# Dry run (safe — no writes)
uv run python vnthuquan_crawler.py crawl --dry-run --start-page 1 --end-page 1 --no-resume

# Inspect CLI help
uv run python vnthuquan_crawler.py crawl --help
```

Expected `--help` output:
```
Usage: vnthuquan_crawler.py crawl [OPTIONS]

  Crawl VNThuQuan books and write to book.json files.

Options:
  --start-page INTEGER     First listing page to crawl  [default: 1]
  --end-page INTEGER       Last page (0 = auto-detect)  [default: 0]
  --resume / --no-resume   Resume from existing state  [default: resume]
  --rate-limit FLOAT       Rate limit override in seconds (0 = use config)  [default: 0.0]
  --concurrency INTEGER    Number of concurrent book workers  [default: 5]
  --max-hours FLOAT        Max hours to crawl (0 = unlimited)  [default: 0.0]
  --dry-run                List books without downloading  [default: no-dry-run]
  --help                   Show this message and exit.
```

### Project Structure Notes

**Files modified in this story (3 files total):**

| File | Action | Description |
|------|--------|-------------|
| `apps/crawler/vnthuquan_crawler.py` | MODIFY | Add Typer CLI (`app`, `crawl`, `_run_crawl`, `_print_summary`), stall detection (`_monitor_health`, `_record_book_completed`, `_books_completed_since`), new instance vars in `__init__`, monitor integration in `crawl_all` |
| `apps/crawler/config.yaml` | MODIFY | Add `vnthuquan` source entry to `sources:` list |
| `apps/crawler/tests/test_vnthuquan_crawler.py` | MODIFY | Add CLI tests, `_run_crawl` integration tests, stall detection unit tests, dry-run tests |

**Files that must NOT be modified:**
- `apps/crawler/crawler.py`
- `apps/crawler/utils/config.py`
- `apps/crawler/utils/state.py`
- `apps/crawler/utils/logging.py`
- `apps/crawler/utils/robots.py`
- `apps/crawler/utils/dedup.py`
- `apps/crawler/utils/slugify.py`
- `apps/crawler/models.py`
- `apps/crawler/vnthuquan_parser.py`

**Files from prior stories that are inputs (read, do not modify):**
- `apps/crawler/vnthuquan_parser.py` — parser functions used by the adapter
- `apps/crawler/vnthuquan_crawler.py` — existing class body (Epic 2 + 3 content)

### References

- [Source: _bmad-output/planning-artifacts/phase-1-1-vnthuquan-crawler/epics-vnthuquan-crawler.md#Story 4.1]
- [Source: _bmad-output/implementation-artifacts/phase-1-1-vnthuquan-crawler/1-1-listing-page-parser-data-types.md] — story file format reference
- [Source: apps/crawler/crawler.py] — existing Typer pattern to match
- [Source: apps/crawler/config.yaml] — YAML structure to extend
- [Source: apps/crawler/utils/state.py] — CrawlState API (read before implementing `_print_summary`)
- [Source: apps/crawler/models.py] — SourceConfig model (check extra fields policy before adding css_selectors to YAML)

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
