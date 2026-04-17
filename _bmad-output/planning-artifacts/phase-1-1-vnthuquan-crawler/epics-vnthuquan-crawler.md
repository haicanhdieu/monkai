---
stepsCompleted: [step-01, step-02, step-03]
inputDocuments:
  - _bmad-output/planning-artifacts/phase-1-1-vnthuquan-crawler/prd-vnthuquan-crawler.md
  - _bmad-output/planning-artifacts/phase-1-1-vnthuquan-crawler/architecture-vnthuquan-crawler.md
---

# monkai - VNThuQuan Crawler (Phase 1.1) — Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for the VNThuQuan Crawler (Phase 1.1), decomposing the requirements from the PRD and Architecture into implementable stories.

## Requirements Inventory

### Functional Requirements

FR1: Crawler fetches listing pages sequentially from `?tranghientai=1` to the last page
FR2: Last page number is auto-detected from pagination links (currently 1269)
FR3: For each listing page, extract all book entries with: URL (`tid`), title, author name, author ID, category name, category ID, chapter count, date, format type
FR4: Only books with format type "Text" are queued for content crawling
FR5: Cookie `AspxAutoDetectCookieSupport=1` is set on all requests
FR6: For each book URL, fetch the detail page and extract: book title, category label, chapter list, `tuaid` value, cover image URL
FR7: For single-chapter books (no chapter list), extract `tuaid` from the auto-load script `noidung1('tuaid={id}&chuongid=')`
FR8: Author metadata from the listing page is carried through to the book record
FR9: For each chapter, send POST request to `chuonghoi_moi.aspx` with body `tuaid={id}&chuongid={n}`
FR10: Parse response by splitting on `--!!tach_noi_dung!!--` delimiter: Part 2 = chapter content HTML, Part 1 = title/author confirmation
FR11: For single-chapter books, POST with `tuaid={id}&chuongid=` (empty chapter ID)
FR12: Content HTML is stored as-is — no cleaning or transformation
FR13: Each book produces one `book.json` at `data/book-data/vnthuquan/{category_slug}/{book_slug}/book.json`
FR14: `book.json` conforms to the existing `BookData` v2.0 Pydantic model schema
FR15: Field mapping from VNThuQuan source fields to BookData v2.0 fields (meta.source="vnthuquan", book_id=tuaid, chapters mapped with html_content from AJAX Part 2, etc.)
FR16: The `publisher` and `publication_year` fields are set to `None` (not available from this source)
FR17: Crawler maintains a state file (`data/crawl-state-vnthuquan.json`) tracking: last completed listing page, set of completed book URLs, per-book status (downloaded|error|skipped)
FR18: On startup, crawler reads state file and skips already-completed books
FR19: State is saved after every book completion (not batched)
FR20: A book is only marked `downloaded` after its `book.json` is successfully written to disk
FR21: Configurable rate limit (default 1.5s) enforced before each HTTP request
FR22: All requests include a descriptive User-Agent header (e.g., `MonkaiCrawler/1.1`)
FR23: HTTP errors (4xx, 5xx) are logged and the book is marked as `error` in state — crawler continues to next book
FR24: Connection timeouts are handled gracefully (default 30s connect, 60s read)
FR25: After crawling completes (or on demand), rebuild `data/book-data/index.json` to include VNThuQuan books
FR26: Each VNThuQuan book gets a `BookIndexEntry` with `source: "vnthuquan"` and a `BookArtifact` pointing to its `book.json`
FR27: Crawler is invocable as a standalone CLI command: `uv run python apps/crawler/vnthuquan_crawler.py`
FR28: CLI options: `--start-page`/`--end-page` (page range), `--resume` (default true), `--rate-limit` (override), `--dry-run` (list without downloading)

### NonFunctional Requirements

NFR1: Crawler must sustain >= 20 books/minute net of rate-limit delays (listing + detail + chapters)
NFR2: Memory usage must stay under 500MB regardless of corpus size (stream processing, no full corpus in memory)
NFR3: Crawler must handle HTTP errors, timeouts, malformed HTML, and empty AJAX responses gracefully — log and skip, never crash
NFR4: Interrupted crawl must resume from exact point of interruption — no data loss
NFR5: Crawler must handle the ASP.NET cookie redirect dance automatically
NFR6: Retry failed requests up to 3 times with exponential backoff before marking as error
NFR7: All output files must be valid UTF-8
NFR8: Vietnamese Unicode characters (diacritics, special characters) must be preserved correctly
NFR9: Content HTML entities (e.g., `&aacute;`) must be preserved as-is (no decoding)
NFR10: Empty chapters (server returns empty Part 2) must be flagged but not block the book
NFR11: Crawler module is self-contained under `apps/crawler/` — no modifications to existing crawler code
NFR12: Reuses existing Pydantic models from `models.py` — no model changes needed
NFR13: VNThuQuan-specific parsing logic is isolated in its own module (easy to maintain as site changes)
NFR14: Output `book.json` files must be loadable by the existing reader UI without any reader code changes
NFR15: VNThuQuan books must appear in `data/book-data/index.json` alongside existing vbeta books

### Additional Requirements

- Follow the `VbetaApiAdapter` pattern — create a `VnthuquanAdapter` class encapsulating all VNThuQuan-specific logic (AD-1)
- No starter template needed — this is an extension of the existing `apps/crawler/` codebase (Starter Template Evaluation)
- Reuse `BookData` v2.0 as-is with no model changes; map VNThuQuan fields to existing types (AD-2)
- Reuse `CrawlState` from `utils/state.py` with a separate state file `data/crawl-state-vnthuquan.json` (AD-3)
- Single `aiohttp.ClientSession` with cookie jar pre-seeded with `AspxAutoDetectCookieSupport=1`; session health detection and refresh on 302/expiry (AD-4)
- 3 retries with exponential backoff (1s, 2s, 4s) + jitter; 4xx not retried; `RequestResult` dataclass for rich error context (AD-5)
- Concurrent book processing with bounded worker pool (`asyncio.Semaphore`, default 5 workers) (AD-6)
- Rate limiting at the call site (`_rate_limited_request`) before calling `_request_with_retry` — retry delays are additive, base rate limit NOT re-applied on retries
- Parser isolation: all HTML/response parsing in `vnthuquan_parser.py` (pure functions, no I/O); orchestration in `vnthuquan_crawler.py`
- CSS selectors hardcoded in parser module — config.yaml selectors are documentation only
- Intermediate data types: `BookListingEntry` and `BookDetail` dataclasses internal to VNThuQuan module
- Cover image extraction from AJAX Part 0 CSS `background-image` — only from first chapter response per book
- Slug collision handling: append `-{book_id}` suffix on collision, update `book_seo_name` to match
- Stall detection: rolling 10-min throughput window; abort after 30 min of zero throughput
- CLI `--max-hours` flag for crawl duration limit; `--concurrency` flag for worker count
- Dev dependency: `aioresponses` for HTTP mocking in adapter tests
- Test fixtures in `tests/fixtures/`: listing page, book detail (multi + single chapter), chapter response (normal + empty)
- Enforcement: never modify `models.py`, existing crawler files, or `utils/state.py`; all VNThuQuan logic in 2 files only

### UX Design Requirements

N/A — This is a CLI data pipeline with no user interface.

### FR Coverage Map

| FR | Epic | Description |
|---|---|---|
| FR1 | Epic 2 | Sequential listing page fetching |
| FR2 | Epic 2 | Auto-detect last page number |
| FR3 | Epic 1 | Extract book metadata from listing entries |
| FR4 | Epic 2 | Filter Text-only books |
| FR5 | Epic 2 | ASP.NET cookie handling |
| FR6 | Epic 1 | Parse book detail page |
| FR7 | Epic 1 | Single-chapter book parsing |
| FR8 | Epic 2 | Author metadata carry-through |
| FR9 | Epic 2 | Chapter POST request |
| FR10 | Epic 1 | Delimiter response parsing |
| FR11 | Epic 2 | Single-chapter POST variant |
| FR12 | Epic 3 | Raw HTML preservation |
| FR13 | Epic 3 | book.json output path |
| FR14 | Epic 3 | BookData v2.0 conformance |
| FR15 | Epic 3 | Field mapping |
| FR16 | Epic 3 | Null publisher/publication_year |
| FR17 | Epic 3 | State file tracking |
| FR18 | Epic 3 | Skip completed books on resume |
| FR19 | Epic 3 | Save state after every book |
| FR20 | Epic 3 | Mark downloaded after write |
| FR21 | Epic 2 | Rate limiting |
| FR22 | Epic 2 | User-Agent header |
| FR23 | Epic 2 | HTTP error handling |
| FR24 | Epic 2 | Connection timeout handling |
| FR25 | Epic 4 | Rebuild index.json |
| FR26 | Epic 4 | BookIndexEntry with source |
| FR27 | Epic 4 | Standalone CLI command |
| FR28 | Epic 4 | CLI options |

## Epic List

### Epic 1: VNThuQuan Parser & Data Types
Establish verified, tested parsing logic that correctly handles VNThuQuan's unique HTML and AJAX response format — the foundation for all crawling work.
**FRs covered:** FR3, FR6, FR7, FR10

### Epic 2: Book Discovery & Content Download
Developer can discover books on VNThuQuan and download their content — the core crawling engine with HTTP infrastructure, rate limiting, retry, and concurrent processing.
**FRs covered:** FR1-2, FR4-5, FR8-9, FR11, FR21-24

### Epic 3: BookData Output & Resumable State
Downloaded content is persisted as reader-compatible `book.json` files with full resume capability — no data loss on interruption.
**FRs covered:** FR12-20

### Epic 4: CLI Interface & Index Integration
Complete, production-ready CLI tool that integrates with the existing monkai ecosystem — developer can run, monitor, and manage crawls end-to-end.
**FRs covered:** FR25-28

---

## Epic 1: VNThuQuan Parser & Data Types

Establish verified, tested parsing logic that correctly handles VNThuQuan's unique HTML and AJAX response format — the foundation for all crawling work.

### Story 1.1: Listing Page Parser & Data Types

As a developer,
I want to parse VNThuQuan listing pages into structured `BookListingEntry` dataclasses,
So that I have reliable metadata extraction for all books on the site.

**Acceptance Criteria:**

**Given** a saved HTML fixture of a VNThuQuan listing page with multiple book entries (Text, PDF, Audio formats)
**When** `parse_listing_page(html)` is called
**Then** it returns a list of `BookListingEntry` objects with: url, title, author_name, author_id, category_name, category_id, chapter_count, date, format_type
**And** Vietnamese diacritics in titles and author names are preserved correctly
**And** author_id and category_id are parsed as integers from URL params (`tacgiaid`, `theloaiid`)
**And** entries with all format types (Text, PDF, Epub, Audio, Image) are returned (filtering happens at adapter level)

**Given** a listing page with missing or malformed book entries
**When** `parse_listing_page(html)` is called
**Then** malformed entries are skipped and valid entries are still returned
**And** no exception is raised

**Given** a listing page HTML
**When** `extract_last_page_number(html)` is called
**Then** it returns the highest page number from pagination links matching `?tranghientai={n}`

### Story 1.2: Book Detail Page Parser

As a developer,
I want to parse VNThuQuan book detail pages to extract chapter lists and `tuaid` values,
So that I know exactly which chapters to download for each book.

**Acceptance Criteria:**

**Given** a saved HTML fixture of a multi-chapter book detail page
**When** `parse_book_detail(html)` is called
**Then** it returns a `BookDetail` with: title, category_label, tuaid (int), chapter_list (list of (chuongid, chapter_title) tuples), is_single_chapter=False
**And** tuaid is extracted from `onClick="noidung1('tuaid={id}&chuongid={n}')"` patterns
**And** chapter titles are extracted from `<a class="normal8">` elements

**Given** a saved HTML fixture of a single-chapter book detail page
**When** `parse_book_detail(html)` is called
**Then** it returns a `BookDetail` with: tuaid extracted from `noidung1('tuaid={id}&chuongid=')`, chapter_list containing one entry with chuongid="" or 0, is_single_chapter=True

**Given** a book detail page with no chapter list and no auto-load script
**When** `parse_book_detail(html)` is called
**Then** it returns `None` (unparseable book)

### Story 1.3: Chapter AJAX Response Parser

As a developer,
I want to parse VNThuQuan's custom-delimited AJAX responses to extract chapter content and cover images,
So that I can reliably obtain the actual text content of each chapter.

**Acceptance Criteria:**

**Given** a saved fixture of a normal AJAX chapter response with `--!!tach_noi_dung!!--` delimiters
**When** `parse_chapter_response(raw)` is called
**Then** it returns a `ChapterParseResult` with: content_html from Part 2 (raw HTML preserved, no entity decoding), cover_image_url extracted from Part 0 CSS `background-image:url(...)` if present

**Given** a saved fixture of an AJAX response with empty Part 2 content
**When** `parse_chapter_response(raw)` is called
**Then** it returns a `ChapterParseResult` with content_html=None and cover_image_url if available

**Given** a malformed response with fewer than 3 delimiter-separated parts
**When** `parse_chapter_response(raw)` is called
**Then** it returns `None`

**Given** HTML entities like `&aacute;` in the chapter content
**When** `parse_chapter_response(raw)` is called
**Then** entities are preserved as-is in content_html (no decoding)

---

## Epic 2: Book Discovery & Content Download

Developer can discover books on VNThuQuan and download their content — the core crawling engine with HTTP infrastructure, rate limiting, retry, and concurrent processing.

### Story 2.1: HTTP Infrastructure & VnthuquanAdapter Skeleton

As a developer,
I want a `VnthuquanAdapter` class with session management, cookie handling, rate limiting, and retry logic,
So that all HTTP communication with VNThuQuan is reliable, polite, and handles failures gracefully.

**Acceptance Criteria:**

**Given** the adapter is initialized with a `SourceConfig` and `aiohttp.ClientSession`
**When** the session is created
**Then** the cookie jar is pre-seeded with `AspxAutoDetectCookieSupport=1`
**And** User-Agent is set to `MonkaiCrawler/1.1`
**And** timeouts are 30s connect, 60s read

**Given** `_rate_limited_request(method, url)` is called
**When** the request executes
**Then** `asyncio.sleep(rate_limit_seconds)` is called BEFORE the request (not after)
**And** the request delegates to `_request_with_retry`

**Given** a request fails with a 5xx error or timeout
**When** `_request_with_retry` handles it
**Then** it retries up to 3 times with exponential backoff (1s, 2s, 4s) + jitter
**And** returns a `RequestResult` with error_type and error_detail on exhaustion

**Given** a request returns a 4xx error
**When** `_request_with_retry` handles it
**Then** it does NOT retry and returns `RequestResult` with error_type="http_4xx"

**Given** the session detects a 302 redirect to a session-expired page
**When** `_refresh_session()` is triggered
**Then** the current session is closed and a new one is created with fresh cookie jar
**And** maximum 2 session refreshes per crawl run

### Story 2.2: Listing Page Crawling with Pagination

As a developer,
I want to crawl VNThuQuan listing pages with automatic pagination and Text-only filtering,
So that I can discover all downloadable books on the site.

**Acceptance Criteria:**

**Given** the adapter's `fetch_listing_page(page_num)` is called
**When** the listing page is fetched
**Then** it calls the parser's `parse_listing_page()` and returns `BookListingEntry` objects

**Given** `fetch_all_listings(start_page, end_page)` is called with end_page=0
**When** the first listing page is fetched
**Then** the last page number is auto-detected from pagination links (FR2)
**And** all pages from start_page to the detected last page are fetched sequentially

**Given** listing entries include books with format types Text, PDF, Audio
**When** `fetch_all_listings` returns results
**Then** only entries with `format_type == "Text"` are included (FR4)
**And** non-Text entries are silently filtered out

**Given** a listing page fetch fails (HTTP error or timeout)
**When** the error occurs
**Then** it is logged as a warning and the crawler continues to the next page

### Story 2.3: Book Detail & Chapter Content Fetching

As a developer,
I want to fetch book details and chapter content for each discovered book,
So that I have the complete text content ready for output.

**Acceptance Criteria:**

**Given** a `BookListingEntry` for a multi-chapter book
**When** `fetch_book_detail(entry)` is called
**Then** it fetches the detail page, calls the parser, and returns a `BookDetail`
**And** author metadata from the listing entry is preserved for carry-through (FR8)

**Given** a `BookDetail` with multiple chapters
**When** `fetch_chapter(tuaid, chuongid)` is called for each chapter
**Then** it sends a POST to `chuonghoi_moi.aspx` with body `tuaid={id}&chuongid={n}`
**And** returns the parsed chapter content HTML

**Given** a single-chapter book
**When** `fetch_chapter(tuaid, "")` is called
**Then** it POSTs with `chuongid=` (empty) and returns the content (FR11)

**Given** a chapter fetch returns empty content (Part 2 is empty)
**When** the result is processed
**Then** a warning is logged: `[vnthuquan] Empty chapter {chuongid} in book {tuaid}`
**And** the chapter is preserved with empty content (NFR10)

**Given** concurrent book processing with 5 workers (default)
**When** `crawl_all()` processes the book list
**Then** books are processed concurrently via `asyncio.Semaphore(concurrency)`
**And** rate limiting applies per-request across all workers

---

## Epic 3: BookData Output & Resumable State

Downloaded content is persisted as reader-compatible `book.json` files with full resume capability — no data loss on interruption.

### Story 3.1: BookData v2.0 Assembly & File Writing

As a developer,
I want crawled VNThuQuan data assembled into BookData v2.0 format and written as `book.json` files,
So that the reader UI can consume VNThuQuan books with zero code changes.

**Acceptance Criteria:**

**Given** a `BookListingEntry`, `BookDetail`, and list of chapter content strings
**When** `assemble_book_data()` is called
**Then** it returns a `BookData` Pydantic model with all fields mapped per the architecture field mapping table
**And** `meta.source = "vnthuquan"`, `meta.schema_version = "2.0"`, `meta.built_at` = UTC now
**And** `book_id = tuaid` (int), `book_seo_name = slugify_title(book_name)`
**And** each chapter has exactly one `PageEntry` with `sort_number=1` and `html_content` from AJAX Part 2
**And** `publisher` and `publication_year` are `None` (FR16)
**And** `cover_image_url` is taken from the first chapter's Part 0 extraction

**Given** an assembled `BookData` object
**When** `write_book_json(book_data)` is called
**Then** it writes to `data/book-data/vnthuquan/{category_seo_name}/{book_seo_name}/book.json`
**And** directories are created if they don't exist
**And** content HTML is stored as-is with no cleaning or entity decoding (FR12)
**And** output is valid UTF-8 (NFR7)

**Given** a slug collision (target directory already has a `book.json` with a different `book_id`)
**When** the collision is detected
**Then** the book slug is suffixed with `-{book_id}` (e.g., `bau-troi-chung-12345`)
**And** `book_seo_name` in the BookData is updated to match
**And** a warning is logged

### Story 3.2: Crawl State Management & Resume

As a developer,
I want the crawler to maintain per-book state and resume from any interruption point,
So that I never lose progress or re-download completed books.

**Acceptance Criteria:**

**Given** the adapter initializes with `CrawlState(state_file="data/crawl-state-vnthuquan.json")`
**When** the crawl starts
**Then** the state file is loaded if it exists, or created empty if not

**Given** a book has been successfully crawled and `book.json` written to disk
**When** `crawl_book()` completes for that book
**Then** the book's URL is marked as `downloaded` in state ONLY AFTER the file write succeeds (FR20)
**And** state is saved immediately (FR19), not batched
**And** state save is serialized via `asyncio.Lock` for concurrent safety

**Given** a book detail or chapter fetch fails after all retries
**When** the book is marked in state
**Then** it is marked as `error` with the failure reason
**And** state is saved and the crawler continues to the next book (FR23)

**Given** the crawler is restarted after an interruption
**When** `fetch_all_listings` returns book entries
**Then** books already marked `downloaded` in state are skipped in O(1) (FR18)
**And** books marked `error` are re-attempted

**Given** concurrent book processing with state updates
**When** multiple workers complete books simultaneously
**Then** state updates are serialized via `asyncio.Lock` — no data corruption

---

## Epic 4: CLI Interface & Index Integration

Complete, production-ready CLI tool that integrates with the existing monkai ecosystem — developer can run, monitor, and manage crawls end-to-end.

### Story 4.1: Typer CLI & Config Entry

As a developer,
I want a standalone CLI command with all options to run the VNThuQuan crawler,
So that I can control crawl scope, behavior, and monitoring from the command line.

**Acceptance Criteria:**

**Given** the CLI entry point at `apps/crawler/vnthuquan_crawler.py`
**When** `uv run python vnthuquan_crawler.py crawl` is invoked
**Then** it loads config, creates session, initializes adapter, and runs the crawl pipeline

**Given** CLI options are provided
**When** the crawl runs
**Then** `--start-page` / `--end-page` limits the page range (default: all)
**And** `--resume` (default: true) controls whether state is loaded
**And** `--rate-limit` overrides the config value
**And** `--concurrency` sets the worker pool size (default: 5)
**And** `--max-hours` sets a duration limit (default: 0 = unlimited)
**And** `--dry-run` lists books that would be crawled without downloading

**Given** `--dry-run` is enabled
**When** the crawl runs
**Then** listing pages are fetched and book entries are printed to stdout
**And** no book detail/chapter fetching occurs and no state is modified

**Given** the crawl is interrupted with Ctrl+C
**When** `KeyboardInterrupt` is caught
**Then** state is saved and a summary is printed (books completed, errors, remaining)

**Given** stall detection is active
**When** zero books complete in a 10-minute window
**Then** a warning is logged
**And** after 30 minutes of zero throughput, the crawl aborts gracefully with state saved

**Given** `config.yaml` in `apps/crawler/`
**When** the vnthuquan source entry is added
**Then** it includes: name=vnthuquan, source_type=html, enabled=true, seed_url, rate_limit_seconds=1.5, output_folder=vnthuquan, css_selectors (documentation only)

### Story 4.2: Index Integration & End-to-End Verification

As a developer,
I want VNThuQuan books to appear in the shared `data/book-data/index.json` alongside existing sources,
So that the reader UI can discover and display VNThuQuan books without any code changes.

**Acceptance Criteria:**

**Given** `book.json` files exist at `data/book-data/vnthuquan/{cat}/{book}/book.json`
**When** `build_book_data_index()` from `indexer.py` is run
**Then** VNThuQuan books are automatically discovered and included in `index.json`
**And** each entry has `source: "vnthuquan"` and a `BookArtifact` pointing to its `book.json`
**And** no changes to `indexer.py` are required (auto-scan existing behavior)

**Given** the full crawl pipeline (listing -> detail -> chapters -> book.json -> index)
**When** run with `--start-page 1 --end-page 2` (small range for verification)
**Then** books from pages 1-2 are crawled, written as `book.json`, and indexed
**And** the reader UI can load these books (BookData v2.0 schema validation passes)
**And** existing vbeta books in `index.json` are preserved alongside new VNThuQuan entries
