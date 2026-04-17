---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8]
inputDocuments:
  - _bmad-output/planning-artifacts/phase-1-1-vnthuquan-crawler/prd-vnthuquan-crawler.md
  - _bmad-output/project-context.md
  - apps/crawler/models.py
  - apps/crawler/utils/api_adapter.py
  - apps/crawler/utils/state.py
  - apps/crawler/indexer.py
  - apps/crawler/config.yaml
workflowType: 'architecture'
project_name: 'monkai'
user_name: 'Minh'
date: '2026-04-11'
lastStep: 8
status: 'complete'
completedAt: '2026-04-11'
---

# Architecture Decision Document — VNThuQuan Crawler (Phase 1.1)

_Architecture for extending the Monkai crawler pipeline with a VNThuQuan source module._

---

## Project Context Analysis

### Requirements Overview

**Functional Requirements:**
28 FRs across 8 areas:
- **Listing crawl (FR1-5):** Sequential pagination of ~1,269 pages, auto-detect last page, extract book metadata, filter Text-only books, handle ASP.NET cookie requirement
- **Book detail parsing (FR6-8):** Detail page scraping for title, category, chapter list, `tuaid` extraction; single vs multi-chapter handling; carry-through of listing metadata
- **Chapter content (FR9-12):** POST-based AJAX API (`chuonghoi_moi.aspx`), custom delimiter response parsing, single/multi-chapter variants, raw HTML preservation
- **Output format (FR13-16):** BookData v2.0 schema compliance, structured directory output (`vnthuquan/{cat_slug}/{book_slug}/book.json`), field mapping from VNThuQuan to existing models
- **State management (FR17-20):** Separate state file, per-book status tracking, save-after-every-book, mark-downloaded-only-after-write
- **Rate limiting (FR21-24):** Configurable rate limit, User-Agent, graceful error handling, timeouts
- **Index integration (FR25-26):** Rebuild `index.json` with VNThuQuan entries post-crawl
- **CLI interface (FR27-28):** Standalone entry point, page range, resume, rate-limit override, dry-run

**Non-Functional Requirements:**
15 NFRs driving architectural decisions:
- **Performance (NFR1-2):** >=20 books/min throughput, <500MB memory — rules out loading full corpus in memory
- **Reliability (NFR3-6):** Graceful degradation on all error types, exact-point resume, cookie handling, 3x retry with exponential backoff
- **Data quality (NFR7-10):** UTF-8, Vietnamese diacritics preserved, HTML entities preserved, empty chapter flagging
- **Maintainability (NFR11-13):** Self-contained module, reuse existing models, isolated parsing logic
- **Compatibility (NFR14-15):** Reader-consumable output, coexistence in shared index

**Scale & Complexity:**

- Primary domain: Data pipeline (crawler extension)
- Complexity level: Medium
- Estimated architectural components: 3-4 (crawler orchestrator, parser module, state manager extension, CLI)

### Technical Constraints & Dependencies

1. **Must reuse `BookData` v2.0 model** — reader app consumes this schema unchanged; any field mismatch breaks the reader
2. **Must reuse `BookIndex`/`BookIndexEntry`** — VNThuQuan books must appear in the shared `index.json`
3. **Model compatibility tension:** `BookData.book_id` is `int`, `BookIndexEntry.category_id` is `int` — VNThuQuan IDs must conform or models need adaptation
4. **CWD = `apps/crawler`** — all imports unqualified, all paths relative to crawler root
5. **Existing deps only (runtime)** — aiohttp, BeautifulSoup4, Pydantic v2 are sufficient; no new runtime dependencies. Dev dependency `aioresponses` is added for HTTP mocking in tests (see Test Strategy below)
6. **Config-driven** — new source must be addable via `config.yaml` entry (project-context rule), though VNThuQuan's unique AJAX pattern may require source-specific code
7. **Separate state file** — `data/crawl-state-vnthuquan.json` (not sharing with existing `crawl-state.json`)

### Cross-Cutting Concerns Identified

- **HTTP session management:** Cookie dance + rate limiting + retry logic must be consistent across listing, detail, and chapter requests
- **Error propagation:** Book-level errors must not halt the crawl; chapter-level errors should flag but not block the book
- **State atomicity:** State must reflect reality — a book is only "downloaded" after `book.json` is on disk
- **Schema alignment:** Crawler Pydantic output -> reader Zod validation; any new fields or type changes cascade
- **Deduplication:** By book URL (within VNThuQuan) — cross-source dedup via existing `seen_hashes` not applicable (different content format)

---

## Starter Template Evaluation

### Primary Technology Domain

Data pipeline (Python crawler) — extension of existing `apps/crawler/` codebase.

### Starter Options Considered

**N/A — Existing System Extension**

This is not a greenfield project. Phase 1.1 adds a new crawler module to the established monkai crawler pipeline. No starter template or scaffolding tool is applicable.

### Selected Approach: Extend Existing Codebase

**Rationale:**
- Technology stack is locked: Python 3.11, aiohttp, BeautifulSoup4, Pydantic v2, Typer, pytest
- Project structure is established: `apps/crawler/` with utilities in `utils/`, tests in `tests/`
- Models (`BookData` v2.0, `BookIndex`) are already defined and consumed by the reader app
- Config pattern (`config.yaml` + `load_config()`) is the single source of truth for sources
- New files follow the existing naming and organization conventions

**Architectural Decisions Already Established:**

- **Language & Runtime:** Python 3.11, async/await with aiohttp
- **Build Tooling:** uv for dependency management, devbox for task running
- **Testing Framework:** pytest + pytest-asyncio; ruff for lint/format
- **Code Organization:** Feature-specific scripts at `apps/crawler/` root, shared utilities in `utils/`
- **Development Experience:** `devbox run test:crawler`, `uv run python <script>`, ruff check

**New Files for Phase 1.1:**
- `apps/crawler/vnthuquan_crawler.py` — orchestrator + CLI entry point
- `apps/crawler/vnthuquan_parser.py` — HTML/AJAX response parsing
- `apps/crawler/tests/test_vnthuquan_crawler.py`
- `apps/crawler/tests/test_vnthuquan_parser.py`

---

## Core Architectural Decisions

### Decision Priority Analysis

**Critical Decisions (Block Implementation):**
1. Module pattern: adapter class vs standalone functions
2. BookData model compatibility: how to map VNThuQuan fields to existing `BookData` types
3. State management: reuse `CrawlState` or extend it

**Important Decisions (Shape Architecture):**
4. HTTP session lifecycle and cookie handling
5. Retry strategy implementation
6. Listing-to-book data flow (memory vs disk intermediate state)

**Deferred Decisions (Post-MVP):**
- Parallel/concurrent chapter fetching
- PDF/EPUB format support
- Author page enrichment

### AD-1: Module Pattern — Adapter Class

**Decision:** Follow the `VbetaApiAdapter` pattern — create a `VnthuquanAdapter` class that encapsulates all VNThuQuan-specific logic.

**Rationale:**
- Proven pattern already exists in `utils/api_adapter.py` (`VbetaApiAdapter`)
- Encapsulates session, state, config, and output_dir in a single object
- Rate limiting, retry, and error handling are instance methods — consistent and testable
- Constructor receives `SourceConfig`, `aiohttp.ClientSession`, `CrawlState`, and `output_dir`

**Structure:**
```python
class VnthuquanAdapter:
    def __init__(self, source_config, session, state, output_dir):
        ...

    # Listing layer
    async def fetch_listing_page(self, page_num: int) -> list[BookListingEntry]: ...
    async def fetch_all_listings(self, start_page, end_page) -> list[BookListingEntry]:
        """Fetches all listing pages. Filters out non-Text books (FR5) after parsing each page.
        Only entries with format_type == 'Text' are returned."""
        ...

    # Book detail layer
    async def fetch_book_detail(self, book_entry: BookListingEntry) -> BookDetail | None: ...

    # Chapter content layer
    async def fetch_chapter(self, tuaid: int, chuongid: int | str) -> str | None: ...

    # Assembly + output
    async def crawl_book(self, book_entry: BookListingEntry) -> bool: ...
    async def crawl_all(self, start_page, end_page, concurrency, max_hours, dry_run): ...

    # HTTP infrastructure
    async def _rate_limited_request(self, method, url, **kwargs) -> RequestResult: ...
    async def _request_with_retry(self, method, url, **kwargs) -> RequestResult: ...
    async def _refresh_session(self): ...
    async def _monitor_health(self): ...
```

### AD-2: BookData Model Compatibility — No Model Changes

**Decision:** Reuse `BookData` v2.0 as-is. Map VNThuQuan fields to existing types without modifying the model.

**Field Mapping Resolution:**

| BookData Field | Type | VNThuQuan Value | Notes |
|---|---|---|---|
| `meta.source` | `str` | `"vnthuquan"` | |
| `meta.schema_version` | `str` | `"2.0"` | |
| `meta.built_at` | `datetime` | UTC now | |
| `book_id` | `int` | `tuaid` (int) | Extracted from `noidung1('tuaid=...')` — confirmed integer |
| `book_name` | `str` | Title from detail page | |
| `book_seo_name` | `str` | `slugify_title(book_name)` | Reuse existing `utils/slugify.py` |
| `cover_image_url` | `str \| None` | CSS background-image URL | Extracted from AJAX Part 0 |
| `author` | `str \| None` | Author name from listing | |
| `author_id` | `int \| None` | `tacgiaid` param (int) | From listing URL |
| `publisher` | `str \| None` | `None` | Not available |
| `publication_year` | `int \| None` | `None` | Not available |
| `category_id` | `int` | `theloaiid` param (int) | From listing URL |
| `category_name` | `str` | Category text from listing | |
| `category_seo_name` | `str` | `slugify_title(category_name)` | |
| `total_chapters` | `int` | `len(chapters)` | |
| `chapters[].chapter_id` | `int` | `chuongid` (int) | 0 for single-chapter books |
| `chapters[].chapter_name` | `str` | Title from ToC `<a>` text | |
| `chapters[].chapter_seo_name` | `str` | `slugify_title(chapter_name)` | |
| `chapters[].pages[].html_content` | `str` | AJAX Part 2 content | Raw HTML preserved |
| `chapters[].pages[].sort_number` | `int` | `1` | VNThuQuan chapters are single-page |

**Key insight:** VNThuQuan chapters are single-page (one POST = one chapter's full content), so each chapter has exactly one `PageEntry` with `sort_number=1` and `page_number=None`.

**ID namespace isolation:** `book_id` values from VNThuQuan (`tuaid`) may collide with `book_id` values from vbeta (both are integers with no coordination). The reader and index consumer MUST use `(source, book_id)` as the composite key, never `book_id` alone. This is already safe because:
- `index.json` entries include `source` field — reader filters/groups by source
- `book.json` files are in source-scoped directories (`vnthuquan/` vs `vbeta/`) — no file-level collision
- If the reader ever uses `book_id` as a standalone lookup key, that is a reader bug, not a crawler concern

### AD-3: State Management — Reuse Existing CrawlState

**Decision:** Reuse `utils/state.py` `CrawlState` as-is with a different state file path.

```python
state = CrawlState(state_file="data/crawl-state-vnthuquan.json")
```

**State key:** Use the book's `tid` URL (`truyen.aspx?tid={opaque_id}`) as the state key — unique per book.

**Listing progress tracking — dropped.** Listing page extraction is cheap (HTML parsing, no downloads), and the per-book state in `CrawlState` already ensures that re-processing a listing page simply skips already-downloaded books. Tracking listing progress separately adds complexity (schema, atomicity, partial-page handling) for negligible benefit. On resume, re-parse listing pages from page 1; books already in state are skipped in O(1).

**Rationale:**
- `CrawlState` already supports the exact semantics needed: `downloaded | error | skipped`
- Atomic save via `tempfile` + `os.replace` — proven reliable
- Separate file avoids interference with existing crawl state
- Listing re-parse on resume is acceptable — the cost is O(seconds) vs the hours of actual downloading

### AD-4: HTTP Session & Cookie Handling

**Decision:** Single `aiohttp.ClientSession` for the entire crawl with cookie jar enabled and pre-seeded cookie.

```python
jar = aiohttp.CookieJar()
jar.update_cookies({"AspxAutoDetectCookieSupport": "1"})
timeout = aiohttp.ClientTimeout(sock_connect=30, sock_read=60)
session = aiohttp.ClientSession(
    cookie_jar=jar,
    timeout=timeout,
    headers={"User-Agent": "MonkaiCrawler/1.1"}
)
```

**Session health detection and refresh:**
- If a request returns HTTP 302 redirecting to a login/error page, or returns an HTML page containing ASP.NET session-expired markers (e.g., `ViewState` with empty content, redirect to `default.aspx`), treat it as a session expiry signal
- On detection: close the current session, create a new `ClientSession` with a fresh cookie jar (re-seeded with `AspxAutoDetectCookieSupport=1`), and retry the failed request
- Maximum 2 session refreshes per crawl run — if the session keeps expiring, log an error and abort gracefully
- Implementation: `_refresh_session()` method on the adapter, called from `_request_with_retry` when session expiry is detected

**Rationale:**
- ASP.NET requires `AspxAutoDetectCookieSupport=1` cookie on every request (FR5)
- aiohttp cookie jar handles this automatically once seeded
- Single session reuses TCP connections — efficient for ~125K+ requests
- Timeout values from NFR: 30s connect, 60s read
- ASP.NET applications commonly rotate session cookies or expire them after inactivity — multi-hour crawls must handle this

### AD-5: Retry Strategy

**Decision:** 3 retries with exponential backoff (1s, 2s, 4s) + jitter, implemented as an instance method on the adapter. Rate limiting is applied at the **call site** (before calling `_request_with_retry`), not inside retry loops — this separates politeness throttling from failure recovery.

```python
@dataclass
class RequestResult:
    """Rich result from HTTP request — preserves error context for caller decisions."""
    response: aiohttp.ClientResponse | None
    status: int | None          # last HTTP status seen, None if network error
    error_type: str | None      # "timeout" | "connection" | "dns" | "http_4xx" | "http_5xx" | None
    error_detail: str | None    # human-readable error string for logging

async def _rate_limited_request(self, method, url, **kwargs) -> RequestResult:
    """Rate-limit then request with retry. Call this instead of _request_with_retry directly."""
    await asyncio.sleep(self.config.rate_limit_seconds)
    return await self._request_with_retry(method, url, **kwargs)

async def _request_with_retry(self, method, url, **kwargs) -> RequestResult:
    last_error_type = None
    last_error_detail = None
    last_status = None
    for attempt in range(4):  # 1 initial + 3 retries
        if attempt > 0:
            delay = (2 ** (attempt - 1)) + random.uniform(0.1, 0.5)
            await asyncio.sleep(delay)
        try:
            resp = await self.session.request(method, url, **kwargs)
            last_status = resp.status
            if resp.status < 400:
                return RequestResult(response=resp, status=resp.status, error_type=None, error_detail=None)
            if resp.status < 500:  # 4xx = don't retry
                return RequestResult(response=resp, status=resp.status, error_type="http_4xx", error_detail=f"HTTP {resp.status}")
            last_error_type = "http_5xx"
            last_error_detail = f"HTTP {resp.status}"
        except asyncio.TimeoutError:
            last_error_type = "timeout"
            last_error_detail = f"Timeout on attempt {attempt + 1}"
        except aiohttp.ClientConnectorError as e:
            last_error_type = "dns" if "Name or service not known" in str(e) else "connection"
            last_error_detail = str(e)
        except aiohttp.ClientError as e:
            last_error_type = "connection"
            last_error_detail = str(e)
    return RequestResult(response=None, status=last_status, error_type=last_error_type, error_detail=last_error_detail)
```

**Rationale:**
- NFR6 requires 3 retries with exponential backoff
- 4xx errors are not retried (client errors won't self-resolve)
- 5xx and network errors are retried (transient server issues)
- Jitter prevents thundering herd on resume
- `RequestResult` preserves error context so callers can distinguish permanent failures (DNS, 404) from transient ones (timeout, 503) for intelligent skip/retry decisions
- Rate limiting at the call site (`_rate_limited_request`) keeps retry backoff independent — retries don't double-pay the politeness delay

### AD-6: Data Flow — Concurrent Book Processing

**Decision:** Process books concurrently using a bounded worker pool (`asyncio.Semaphore`). Each book is fully independent: listing entry -> detail page -> chapters -> assemble BookData -> write book.json -> update state. No intermediate disk files for partial book data.

**Concurrency model:**
- `CONCURRENCY = 5` workers (configurable via CLI `--concurrency`)
- Each worker processes one book at a time (detail + all chapters + write)
- Rate limiting applies per-request via `_rate_limited_request` — with 5 workers and 1.5s rate limit, effective throughput is ~3.3 requests/second
- `CrawlState` access is serialized via `asyncio.Lock` (single-threaded event loop, but lock prevents interleaved read-modify-write)

**Throughput analysis (NFR1: >=20 books/min):**
- Average book: 1 detail request + ~5 chapter requests = 6 requests
- At 1.5s rate limit per request: 9s per book sequentially
- With 5 concurrent workers: ~5 books every 9s ≈ 33 books/min ✓
- Single-chapter books (common): 2 requests × 1.5s = 3s → even faster

**Flow:**
```
listing_entries = []
for page in listing_pages:
    entries = fetch_listing_page(page)
    listing_entries.extend(e for e in entries if not state.is_downloaded(e.url))

semaphore = asyncio.Semaphore(CONCURRENCY)

async def process_book(entry):
    async with semaphore:
        detail = await fetch_book_detail(entry)
        chapters = [await fetch_chapter(tuaid, cid) for cid in detail.chapter_ids]
        book_data = assemble_book_data(entry, detail, chapters)
        write_book_json(book_data)
        async with state_lock:
            state.mark_downloaded(entry.url)
            state.save()

await asyncio.gather(*[process_book(e) for e in listing_entries])
```

**Rationale:**
- NFR1: >=20 books/min — sequential processing at 1.5s/request cannot meet this; 5 concurrent workers can
- NFR2: <500MB memory — 5 books in memory concurrently is negligible (each book is <1MB)
- FR19: State saved after every book (serialized via lock)
- FR20: Book marked downloaded only after book.json written
- Semaphore bounds concurrency — polite to the server while meeting throughput requirements

---

## Implementation Patterns & Consistency Rules

### Naming Patterns

**File naming:**
- VNThuQuan-specific modules: `vnthuquan_*.py` prefix (matches existing convention of source-specific files)
- Test files: `test_vnthuquan_*.py`

**Function naming:**
- `snake_case` for all functions and variables (Python standard, matches existing codebase)
- Async functions prefixed descriptively: `fetch_*`, `parse_*`, `crawl_*`, `assemble_*`
- Private methods: `_request_with_retry`, `_parse_ajax_response`

**Log messages:**
- Format: `[vnthuquan] {action}: {detail}` (matches `[crawler]`, `[indexer]` patterns)
- Examples: `[vnthuquan] Skip (state): {url}`, `[vnthuquan] Fetched book: {title} ({n} chapters)`

### Structure Patterns

**Parser isolation:**
- All HTML/response parsing in `vnthuquan_parser.py` — pure functions, no I/O
- Adapter in `vnthuquan_crawler.py` — orchestration, I/O, state management
- Parser functions accept `str` (raw HTML/response) and return typed dataclasses/dicts
- **CSS selectors are hardcoded in the parser module**, not read from `config.yaml`. VNThuQuan's page structure is unique (ASP.NET AJAX, custom delimiters) — config-driven selectors add indirection without value since no other source shares this structure. The `css_selectors` block in `config.yaml` serves as **documentation only** (human reference for what the parser targets). If selectors need to change, the parser code is the single source of truth.

**Intermediate data types:**
- Use `dataclass` or `TypedDict` for intermediate parsing results (listing entries, book details)
- These are internal to the VNThuQuan module — not part of the shared model layer
- Convert to `BookData` Pydantic model only at the final assembly step

```python
@dataclass
class BookListingEntry:
    """Parsed from a single book row on a listing page."""
    url: str           # truyen.aspx?tid={opaque_id}
    title: str
    author_name: str | None
    author_id: int | None
    category_name: str
    category_id: int
    chapter_count: int
    date: str
    format_type: str   # "Text", "PDF", etc.

@dataclass
class BookDetail:
    """Parsed from a book detail page."""
    title: str
    category_label: str
    tuaid: int
    chapter_list: list[tuple[int, str]]  # [(chuongid, chapter_title), ...]
    cover_image_url: str | None
    is_single_chapter: bool
```

### Format Patterns

**AJAX response parsing:**
```python
DELIMITER = "--!!tach_noi_dung!!--"

@dataclass
class ChapterParseResult:
    """Parsed AJAX chapter response with all parts."""
    cover_image_url: str | None  # from Part 0 CSS background-image
    content_html: str | None     # from Part 2

def parse_chapter_response(raw: str) -> ChapterParseResult | None:
    """Parse the full AJAX response. Parts: [0]=metadata HTML, [1]=nav, [2]=content HTML.
    Part 0 may contain a CSS background-image with the book cover URL."""
    parts = raw.split(DELIMITER)
    if len(parts) < 3:
        return None  # malformed response
    cover_url = _extract_cover_image(parts[0]) if parts[0] else None
    content = parts[2].strip() or None
    return ChapterParseResult(cover_image_url=cover_url, content_html=content)

def _extract_cover_image(part0_html: str) -> str | None:
    """Extract cover image URL from Part 0's CSS background-image property.
    Pattern: style="background-image:url('...')" on a div element."""
    import re
    match = re.search(r"background-image:\s*url\(['\"]?([^'\")\s]+)['\"]?\)", part0_html)
    return match.group(1) if match else None
```

**Note:** Cover image extraction only needs to succeed on the *first* chapter response for a book. The adapter calls `parse_chapter_response` for every chapter but only uses `cover_image_url` from the first result. Test fixture `vnthuquan_chapter_response.txt` must include a Part 0 sample with a cover image.

**Output paths:**
```
data/book-data/vnthuquan/{category_seo_name}/{book_seo_name}/book.json
```
- Category and book slugs via `utils/slugify.py` `slugify_title()`
- Matches existing vbeta pattern: `data/book-data/vbeta/{cat_seo}/{book_seo}/book.json`

**Slug collision handling:**
- Before writing `book.json`, check if the target directory already exists AND contains a `book.json` with a different `book_id`
- On collision: append `-{book_id}` suffix to the book slug (e.g., `bau-troi-chung-12345/book.json`)
- Also update `book_seo_name` in the `BookData` to match the suffixed slug so the reader can resolve paths correctly
- Log a warning: `[vnthuquan] Slug collision: {slug} already exists for book_id={existing_id}, using {slug}-{new_id}`

### Error Handling Patterns

**Three-level error handling:**

1. **Request level:** Retry with backoff, return `None` on exhaustion
2. **Chapter level:** Log warning for empty/failed chapters, include chapter with empty content, flag in logs
3. **Book level:** If detail page fails or zero chapters extracted, mark `error` in state, log, continue to next book

**Empty chapter handling (NFR10):**
```python
if chapter_html is None or chapter_html.strip() == "":
    logger.warning(f"[vnthuquan] Empty chapter {chuongid} in book {tuaid}")
    chapter_html = ""  # preserve in BookData, don't skip
```

### Rate Limiting Pattern

**Before each HTTP request** (not after), consistent with existing crawler pattern:
```python
await asyncio.sleep(self.config.rate_limit_seconds)
```
Applied inside `_rate_limited_request` before calling `_request_with_retry`. Retry delays are additive (backoff on top of base rate limit) but the base rate limit is NOT re-applied on retries.

### Crawl-Level Timeout & Health Monitoring

**Stall detection:** Track throughput as a rolling window of books completed in the last 10 minutes. If zero books complete in a 10-minute window (and there are books remaining), log a warning. After 30 minutes of zero throughput, abort the crawl gracefully (save state, log summary, exit non-zero).

```python
async def _monitor_health(self):
    """Background task that checks throughput and aborts on stall."""
    while not self._done:
        await asyncio.sleep(600)  # check every 10 min
        recent = self._books_completed_since(time.time() - 600)
        if recent == 0 and self._books_remaining > 0:
            self._stall_count += 1
            logger.warning(f"[vnthuquan] Stall detected: 0 books in last 10min (stall #{self._stall_count})")
            if self._stall_count >= 3:  # 30 min total
                logger.error("[vnthuquan] Aborting: 30min with zero throughput")
                self._abort = True
                return
```

**CLI-level timeout:** Optional `--max-hours` flag (default: 0 = unlimited). If set, the crawl aborts after the specified duration regardless of throughput.

### Test Strategy

**Dev dependency:** `aioresponses` (added to dev dependencies in `pyproject.toml`) — provides `aiohttp.ClientSession` mocking without monkey-patching.

**Parser tests (`test_vnthuquan_parser.py`):**
- Pure unit tests — no mocking needed
- Load saved HTML fixtures from `tests/fixtures/`
- Test each parser function with valid, malformed, and edge-case inputs
- Cover: listing page parsing, book detail extraction, chapter response parsing (including Part 0 cover image), format_type filtering, slug collision scenarios

**Adapter tests (`test_vnthuquan_crawler.py`):**
- Use `aioresponses` to mock all HTTP endpoints
- Test the full book pipeline: listing → detail → chapters → book.json output
- Test retry behavior: mock 503 responses followed by 200
- Test session refresh: mock 302 redirect to session-expired page
- Test state management: verify state file is written after each book
- Test concurrency: verify semaphore bounds concurrent requests
- Test stall detection: mock slow/hanging responses

**Fixtures (`tests/fixtures/`):**
- `vnthuquan_listing_page.html` — full listing page with multiple book rows (Text + non-Text formats)
- `vnthuquan_book_detail.html` — book detail with chapter list
- `vnthuquan_book_detail_single.html` — single-chapter book detail
- `vnthuquan_chapter_response.txt` — full AJAX response with all 3 delimiter-separated parts (including Part 0 with cover image)
- `vnthuquan_chapter_response_empty.txt` — AJAX response with empty Part 2 content

### Enforcement Guidelines

**All AI Agents implementing this MUST:**

1. Never modify `models.py` — use `BookData` v2.0 as-is
2. Never modify existing crawler files (`crawler.py`, `utils/state.py`, etc.)
3. Keep all VNThuQuan logic in `vnthuquan_crawler.py` and `vnthuquan_parser.py`
4. Use `CrawlState` with file path `data/crawl-state-vnthuquan.json`
5. Rate-limit before every HTTP request via `_rate_limited_request`, not inside retry loops
6. Save state after every book completion (serialized via `asyncio.Lock`), never batch
7. Mark downloaded only after `book.json` is written to disk
8. Preserve raw HTML — no cleaning, no entity decoding
9. Use `slugify_title()` from `utils/slugify.py` for all slug generation
10. Handle slug collisions by appending `-{book_id}` suffix
11. Use `(source, book_id)` as the logical composite key — never assume `book_id` is globally unique
12. Use `aioresponses` for HTTP mocking in adapter tests — add as dev dependency only
13. Hardcode CSS selectors in `vnthuquan_parser.py` — config.yaml selectors are documentation only
14. Filter non-Text books in `fetch_all_listings` — only Text format_type entries proceed to download

---

## Project Structure & Boundaries

### Complete Project Directory Structure (Phase 1.1 additions)

```
apps/crawler/
├── vnthuquan_crawler.py           # VnthuquanAdapter class + Typer CLI
├── vnthuquan_parser.py            # Pure parsing functions (no I/O)
├── models.py                      # UNCHANGED — reuse BookData v2.0
├── indexer.py                     # UNCHANGED — build_book_data_index() already scans all book.json
├── config.yaml                    # ADD vnthuquan source entry
├── utils/
│   ├── state.py                   # UNCHANGED — CrawlState reused with different file path
│   ├── slugify.py                 # UNCHANGED — reuse slugify_title()
│   └── ...                        # All other utils unchanged
├── tests/
│   ├── test_vnthuquan_parser.py   # Parser unit tests with HTML fixtures
│   ├── test_vnthuquan_crawler.py  # Adapter integration tests (aioresponses-mocked HTTP)
│   └── fixtures/                  # NEW — saved HTML responses for deterministic tests
│       ├── vnthuquan_listing_page.html
│       ├── vnthuquan_book_detail.html
│       ├── vnthuquan_book_detail_single.html
│       ├── vnthuquan_chapter_response.txt
│       └── vnthuquan_chapter_response_empty.txt
└── data/
    ├── crawl-state-vnthuquan.json       # VNThuQuan-specific crawl state
    └── book-data/
        ├── index.json                    # Rebuilt to include vnthuquan books
        └── vnthuquan/                    # NEW output directory
            ├── truyen-ngan/
            │   └── bau-troi-chung/
            │       └── book.json
            ├── tieu-thuyet/
            │   └── .../
            └── tho/
                └── .../
```

### Architectural Boundaries

**Module boundary — VNThuQuan is self-contained:**
- `vnthuquan_crawler.py` and `vnthuquan_parser.py` are the ONLY new files with VNThuQuan logic
- They import FROM existing modules (`models`, `utils/state`, `utils/slugify`, `utils/config`, `utils/logging`) but never modify them
- No existing file is changed except `config.yaml` (add source entry)

**Parser boundary — Pure functions, no side effects:**
- `vnthuquan_parser.py` contains ONLY parsing logic: HTML -> structured data
- No HTTP calls, no file I/O, no state mutations
- Input: raw HTML strings. Output: dataclasses or `None`.
- Fully testable with saved fixtures

**Adapter boundary — All I/O lives here:**
- `vnthuquan_crawler.py` contains the `VnthuquanAdapter` class
- All HTTP requests, file writes, state updates, and logging happen here
- Calls parser functions for HTML extraction
- Assembles final `BookData` objects and writes `book.json`

**Index boundary — No changes needed:**
- `indexer.py`'s `build_book_data_index()` already scans all `data/book-data/**/*.json` files
- VNThuQuan books at `data/book-data/vnthuquan/...` are automatically discovered
- No indexer changes required — the existing scan picks them up

### Requirements to Structure Mapping

| FR Category | Module | Key Functions |
|---|---|---|
| Listing crawl (FR1-5) | `vnthuquan_crawler.py` | `fetch_listing_page()`, `fetch_all_listings()` |
| Listing parsing | `vnthuquan_parser.py` | `parse_listing_page()`, `extract_book_entries()` |
| Book detail (FR6-8) | `vnthuquan_crawler.py` | `fetch_book_detail()` |
| Detail parsing | `vnthuquan_parser.py` | `parse_book_detail()`, `extract_chapter_list()`, `extract_tuaid()` |
| Chapter fetch (FR9-12) | `vnthuquan_crawler.py` | `fetch_chapter()` |
| Chapter parsing | `vnthuquan_parser.py` | `parse_chapter_response()` |
| Output (FR13-16) | `vnthuquan_crawler.py` | `assemble_book_data()`, `write_book_json()` |
| State (FR17-20) | `utils/state.py` (reused) | `CrawlState` with vnthuquan state file |
| Rate limiting (FR21-24) | `vnthuquan_crawler.py` | `_request_with_retry()` |
| Index (FR25-26) | `indexer.py` (unchanged) | `build_book_data_index()` auto-discovers |
| CLI (FR27-28) | `vnthuquan_crawler.py` | Typer `app` with `crawl` command |

### Data Flow

```
Listing Pages (GET)          Book Detail Pages (GET)        Chapter API (POST)
vietnamthuquan.eu/truyen/    truyen.aspx?tid={id}           chuonghoi_moi.aspx
?tranghientai={1..1269}
        │                            │                            │
        ▼                            ▼                            ▼
┌─────────────────┐         ┌─────────────────┐         ┌─────────────────┐
│ parse_listing   │         │ parse_book      │         │ parse_chapter   │
│ _page()         │         │ _detail()       │         │ _response()     │
│                 │         │                 │         │                 │
│ → BookListing   │         │ → BookDetail    │         │ → html content  │
│   Entry[]       │         │   (tuaid,       │         │   (Part 2)      │
│                 │         │    chapters)    │         │                 │
└────────┬────────┘         └────────┬────────┘         └────────┬────────┘
         │                           │                           │
         └───────────────────────────┴───────────────────────────┘
                                     │
                                     ▼
                          ┌─────────────────────┐
                          │ assemble_book_data() │
                          │ → BookData v2.0      │
                          └──────────┬──────────┘
                                     │
                                     ▼
                          ┌─────────────────────┐
                          │ write book.json      │
                          │ update CrawlState    │
                          └──────────┬──────────┘
                                     │
                                     ▼
                          ┌─────────────────────┐
                          │ build_book_data      │
                          │ _index() (post-crawl)│
                          │ → index.json updated │
                          └─────────────────────┘
```

### Config Addition

```yaml
# config.yaml — append to sources list
- name: vnthuquan
  source_type: html
  enabled: true
  seed_url: "http://vietnamthuquan.eu/truyen/?tranghientai=1"
  rate_limit_seconds: 1.5
  output_folder: vnthuquan
  file_type_hints:
    - html
  # css_selectors below are DOCUMENTATION ONLY — actual selectors are hardcoded
  # in vnthuquan_parser.py (source of truth). Listed here for human reference.
  css_selectors:
    listing_book: "div.truyen-title a"
    listing_author: "span.author a"
    listing_category: "span.label-theloai a"
    listing_chapters: "span.totalchuong"
    listing_format: "span.label-scan"
    listing_date: "span.label-time"
    book_title: "h3.mucluc a b"
    book_category: "h3 > a"
    chapter_item: "li.menutruyen a.normal8"
  pagination_selector: "a[href*='tranghientai']"
```

### CLI Interface

```python
@app.command()
def crawl(
    config: str = typer.Option("config.yaml", help="Config file path"),
    start_page: int = typer.Option(1, help="First listing page to crawl"),
    end_page: int = typer.Option(0, help="Last listing page (0 = auto-detect)"),
    resume: bool = typer.Option(True, help="Resume from saved state"),
    rate_limit: float = typer.Option(0, help="Override rate limit (0 = use config)"),
    concurrency: int = typer.Option(5, help="Max concurrent book downloads"),
    max_hours: float = typer.Option(0, help="Max crawl duration in hours (0 = unlimited)"),
    dry_run: bool = typer.Option(False, help="List books without downloading"),
):
```

Invocation: `cd apps/crawler && uv run python vnthuquan_crawler.py crawl`

---

## Architecture Validation Results

### Coherence Validation

**Decision Compatibility:**
- All decisions use the existing technology stack (aiohttp, BS4, Pydantic v2) — no version conflicts
- Adapter class pattern matches `VbetaApiAdapter` — proven in this codebase
- `BookData` v2.0 used without modification — zero risk of reader breakage
- `CrawlState` reused with separate file — no state collision with existing crawlers

**Pattern Consistency:**
- Naming follows existing patterns (`snake_case`, `[source] Log: detail`)
- File organization matches existing convention (source-specific files at crawler root)
- Error handling follows established three-level pattern (request → chapter → book)
- Rate limiting before requests, not after — matches `crawler.py` pattern

**Structure Alignment:**
- Two new files + test files — minimal surface area
- No modifications to existing modules
- Output directory follows established `data/book-data/{source}/...` convention
- Indexer auto-discovers new output — no integration code needed

### Requirements Coverage Validation

**Functional Requirements Coverage:**

| FR | Covered By | Status |
|---|---|---|
| FR1-5 (Listing) | `fetch_listing_page()`, `parse_listing_page()`, cookie jar, pagination | Covered |
| FR6-8 (Book Detail) | `fetch_book_detail()`, `parse_book_detail()`, single/multi-chapter | Covered |
| FR9-12 (Chapter) | `fetch_chapter()`, `parse_chapter_response()`, delimiter parser | Covered |
| FR13-16 (Output) | `assemble_book_data()`, field mapping table, `write_book_json()` | Covered |
| FR17-20 (State) | `CrawlState` reuse, per-book save, mark-after-write | Covered |
| FR21-24 (Rate Limit) | `_request_with_retry()`, User-Agent in session, timeout config | Covered |
| FR25-26 (Index) | `build_book_data_index()` auto-scan — no changes needed | Covered |
| FR27-28 (CLI) | Typer `crawl` command with all specified options | Covered |

**Non-Functional Requirements Coverage:**

| NFR | Covered By |
|---|---|
| NFR1-2 (Performance) | Stream processing (one book at a time), no corpus in memory |
| NFR3-6 (Reliability) | Retry with backoff, graceful skip, cookie pre-seeding, exact-point resume |
| NFR7-10 (Data Quality) | UTF-8 session encoding, raw HTML preservation, empty chapter flagging |
| NFR11-13 (Maintainability) | Self-contained module, no model changes, parser isolation |
| NFR14-15 (Compatibility) | BookData v2.0 output, auto-indexed in shared index.json |

### Gap Analysis Results

**No critical gaps identified.**

**Minor considerations:**
- Cover image URL extraction from AJAX Part 0 CSS `background-image` — implementation detail to handle in parser, pattern is defined
- Vietnamese slug handling — `slugify_title()` already handles Vietnamese diacritics, verified in existing tests
- `book_id` type: `tuaid` is confirmed integer from site analysis — no type mismatch

### Architecture Completeness Checklist

**Requirements Analysis**

- [x] Project context thoroughly analyzed
- [x] Scale and complexity assessed
- [x] Technical constraints identified
- [x] Cross-cutting concerns mapped

**Architectural Decisions**

- [x] Module pattern decided (adapter class)
- [x] Model compatibility resolved (no changes)
- [x] State management decided (reuse CrawlState)
- [x] HTTP session strategy defined
- [x] Retry strategy specified
- [x] Data flow designed (stream processing)

**Implementation Patterns**

- [x] Naming conventions established
- [x] Structure patterns defined
- [x] Error handling patterns specified
- [x] Rate limiting pattern defined
- [x] Enforcement guidelines documented

**Project Structure**

- [x] Complete directory structure defined
- [x] Module boundaries established
- [x] Requirements mapped to files
- [x] Data flow diagrammed
- [x] Config addition specified
- [x] CLI interface defined

### Architecture Readiness Assessment

**Overall Status:** READY FOR IMPLEMENTATION

**Confidence Level:** High

**Key Strengths:**
- Zero modifications to existing code (except config.yaml)
- Follows proven patterns already in the codebase
- Automatic index integration via existing scanner
- Clear separation of concerns (parser vs adapter)
- Complete field mapping with type verification

**Implementation Priority:**
1. `vnthuquan_parser.py` + `test_vnthuquan_parser.py` (pure functions, testable in isolation)
2. `vnthuquan_crawler.py` + `test_vnthuquan_crawler.py` (adapter with mocked HTTP)
3. `config.yaml` update (add source entry)
4. End-to-end test with a small page range (`--start-page 1 --end-page 2`)
5. Full crawl execution
6. Index rebuild verification
