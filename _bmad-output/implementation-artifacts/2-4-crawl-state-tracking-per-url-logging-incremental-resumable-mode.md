# Story 2.4: Crawl State Tracking, Per-URL Logging + Incremental/Resumable Mode

Status: ready-for-dev

## Story

As a developer,
I want every URL's download status persisted to `data/crawl-state.json` with per-URL logging and graceful error handling,
so that I can resume an interrupted crawl and audit exactly what happened to every URL.

## Acceptance Criteria

1. **Given** a URL is successfully downloaded
   **When** the crawler processes it
   **Then** `crawl-state.json` is updated: `{"https://...": "downloaded"}`
   **And** the log records: `[INFO] [crawler] Downloaded: {url} → {file_path}`

2. **Given** a URL download fails with HTTP 4xx/5xx or timeout
   **When** the error occurs
   **Then** the crawler logs `[ERROR] [crawler] HTTP {status}: {url} — skipping`
   **And** `crawl-state.json` records `{"https://...": "error"}`
   **And** the crawl continues to the next URL — the full run never crashes due to a single URL failure (NFR3)

3. **Given** a URL is already marked `"downloaded"` in `crawl-state.json`
   **When** the crawler encounters it in a new run
   **Then** it skips the download: `[INFO] [crawler] Skip (state): {url}`
   **And** if the file exists on disk but is not in crawl-state.json, state is repaired: `state.mark_downloaded(url)` and skip

4. **Given** a crawl is interrupted mid-run (e.g., KeyboardInterrupt)
   **When** the crawler is restarted with the same `--source` argument
   **Then** it resumes from where it stopped — all previously `"downloaded"` URLs are skipped
   **And** no previously downloaded files are re-downloaded or overwritten (NFR5)

## Tasks / Subtasks

- [ ] Initialize `CrawlState` at session start (AC: 1, 3, 4)
  - [ ] `state = CrawlState("data/crawl-state.json")` — loads existing state if file exists
  - [ ] Pass `state` object into the async crawl functions
  - [ ] Call `state.save()` after EVERY successful/failed URL processing (not just at end)
- [ ] Implement incremental skip logic (AC: 3)
  - [ ] Before downloading: `if state.is_downloaded(url): logger.info(f"[crawler] Skip (state): {url}"); continue`
  - [ ] File exists on disk but not in state: `if file_path.exists() and file_path.stat().st_size > 0: state.mark_downloaded(url); state.save(); continue`
  - [ ] Check state FIRST (fast dict lookup), then filesystem (slow I/O) — this order matters for performance
- [ ] Implement per-URL success logging and state update (AC: 1)
  - [ ] After `save_file()`: `state.mark_downloaded(url)` + `state.save()` + `logger.info(f"[crawler] Downloaded: {url} → {file_path}")`
  - [ ] `state.save()` writes `data/crawl-state.json` to disk — call after EACH URL, not batched
- [ ] Implement per-URL error logging and state update (AC: 2)
  - [ ] HTTP 4xx/5xx: `logger.error(f"[crawler] HTTP {resp.status}: {url} — skipping")` + `state.mark_error(url)` + `state.save()`
  - [ ] Network timeout: `logger.error(f"[crawler] Timeout: {url} — skipping")` + `state.mark_error(url)` + `state.save()`
  - [ ] Generic exception: `logger.error(f"[crawler] Error downloading {url}: {e} — skipping")` + `state.mark_error(url)` + `state.save()`
  - [ ] NEVER raise — always `continue` to next URL (NFR3)
- [ ] Handle KeyboardInterrupt gracefully (AC: 4)
  - [ ] Wrap the top-level `asyncio.run(crawl_all(...))` in a try/except KeyboardInterrupt
  - [ ] On interrupt: `logger.info("[crawler] Interrupted — state saved, resumable")` and exit cleanly
  - [ ] The state is already persisted per-URL, so no extra flush needed

## Dev Notes

### CrawlState is Fully Implemented (Story 1.4)

`utils/state.py::CrawlState` was built and tested in Story 1.4. Import and use it directly:

```python
from utils.state import CrawlState

state = CrawlState("data/crawl-state.json")  # loads existing file on init
state.is_downloaded(url)      # bool — True if status is "downloaded"
state.mark_downloaded(url)    # sets status to "downloaded" in memory
state.mark_error(url)         # sets status to "error" in memory
state.mark_skipped(url)       # sets status to "skipped" in memory
state.save()                  # writes to data/crawl-state.json on disk
```

**Do NOT write to `data/crawl-state.json` directly** — always use `CrawlState` methods.

### crawl-state.json Structure

```json
{
  "https://thuvienhoasen.org/a1234": "downloaded",
  "https://thuvienhoasen.org/a5678": "error",
  "https://budsas.org/sutta/xyz": "skipped"
}
```

All status values are strings: `"downloaded"`, `"error"`, `"skipped"`.

### Incremental Skip Logic (Exact Order)

```python
async def process_url(url, source_config, file_path, session, state, logger):
    # 1. Check crawl-state.json FIRST (fast in-memory dict lookup)
    if state.is_downloaded(url):
        logger.info(f"[crawler] Skip (state): {url}")
        return

    # 2. Filesystem fallback (file exists on disk but state not tracked — repair)
    if file_path.exists() and file_path.stat().st_size > 0:
        state.mark_downloaded(url)
        state.save()
        logger.info(f"[crawler] Skip (disk+state repaired): {url}")
        return

    # 3. robots.txt check
    if not robots_allowed(robots_cache, url):
        logger.warning(f"[crawler] robots.txt blocked: {url}")
        return

    # 4. Rate limit — BEFORE request
    await asyncio.sleep(source_config.rate_limit_seconds)

    # 5. Download
    try:
        async with session.get(url) as resp:
            if resp.status >= 400:
                logger.error(f"[crawler] HTTP {resp.status}: {url} — skipping")
                state.mark_error(url)
                state.save()
                return
            content = await resp.read()
    except asyncio.TimeoutError:
        logger.error(f"[crawler] Timeout: {url} — skipping")
        state.mark_error(url)
        state.save()
        return
    except Exception as e:
        logger.error(f"[crawler] Error downloading {url}: {e} — skipping")
        state.mark_error(url)
        state.save()
        return

    # 6. Completeness check (Story 2.3)
    if not is_complete_html(content, file_format):
        logger.warning(f"[crawler] Incomplete download: {url}")
        state.mark_error(url)
        state.save()
        return

    # 7. Save file + update state
    save_file(content, file_path)
    state.mark_downloaded(url)
    state.save()
    logger.info(f"[crawler] Downloaded: {url} → {file_path}")
```

### Resume Behavior

On restart with `--source thuvienhoasen`:
1. `CrawlState("data/crawl-state.json")` loads the previous state into memory
2. For each URL in the catalog: `state.is_downloaded(url)` returns True for already-downloaded URLs
3. Those URLs are skipped immediately — no network request made
4. URLs with status `"error"` are retried (they are NOT `is_downloaded`)

**Important**: `CrawlState.is_downloaded()` only returns `True` for `"downloaded"` status, NOT for `"error"` or `"skipped"`. This means errored URLs are retried on resume.

### Save-Per-URL Requirement

`state.save()` must be called AFTER every URL outcome (success OR failure). This ensures that if the process is killed mid-run, the state reflects what was actually completed — not what was queued.

Do NOT batch saves (e.g., save only at end of source). A kill signal between batch writes would lose all progress since last save.

### KeyboardInterrupt Handling

```python
# In crawler.py main command:
try:
    asyncio.run(crawl_all(sources, cfg, robots_cache, logger))
except KeyboardInterrupt:
    logger.info("[crawler] Interrupted — state saved, resumable")
    raise typer.Exit(code=0)
```

The state is already current because we save after every URL — no extra flush is needed.

### Log Format Reference

All log messages use the format established by `setup_logger("crawler")`:
```
2026-02-27T10:30:00Z [INFO]  [crawler] Downloaded: https://... → data/raw/thuvienhoasen/nikaya/kinh-abc.html
2026-02-27T10:30:01Z [INFO]  [crawler] Skip (state): https://...
2026-02-27T10:30:02Z [ERROR] [crawler] HTTP 404: https://... — skipping
2026-02-27T10:30:03Z [WARN]  [crawler] robots.txt blocked: https://...
2026-02-27T10:30:04Z [INFO]  [crawler] Interrupted — state saved, resumable
```

### Project Structure Notes

- `data/crawl-state.json` is listed in `.gitignore` — it is a runtime artifact, not committed
- State file path is hardcoded as `"data/crawl-state.json"` — no config option needed
- `utils/state.py` tests (test_incremental.py) verify all CrawlState behaviors — the implementation is correct; just use it
- Story 2.5 will also call `state.mark_skipped(url)` for deduplication skips

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.4: Crawl State Tracking, Per-URL Logging + Incremental/Resumable Mode]
- [Source: _bmad-output/planning-artifacts/phase-1-crawler/architecture-phase1-crawler.md#Data Architecture — Crawl State Tracking]
- [Source: _bmad-output/planning-artifacts/phase-1-crawler/architecture-phase1-crawler.md#Process Patterns — Incremental Skip Logic]
- [Source: _bmad-output/planning-artifacts/phase-1-crawler/architecture-phase1-crawler.md#Process Patterns — Error Handling Granularity]
- [Source: _bmad-output/implementation-artifacts/1-4-core-utilities-package.md#utils/state.py]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

### File List
