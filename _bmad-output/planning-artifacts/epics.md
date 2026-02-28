---
stepsCompleted: [step-01-validate-prerequisites, step-02-design-epics, step-03-create-stories]
inputDocuments:
  - _bmad-output/planning-artifacts/phase-1-crawler/prd-phase1-crawler.md
  - _bmad-output/planning-artifacts/phase-1-crawler/architecture-phase1-crawler.md
---

# Thư Viện Kinh Phật Thông Minh — Phase 1: Web Crawler & Raw Data Corpus - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for the Thư Viện Kinh Phật Thông Minh Phase 1 project, decomposing the requirements from the PRD and Architecture into implementable stories.

## Requirements Inventory

### Functional Requirements

FR1: The crawler can fetch the catalog/listing page of each configured source and extract individual scripture URLs
FR2: The crawler can download the full raw file (HTML, PDF, EPUB, or other detected format) for each scripture URL
FR3: The crawler enforces a configurable per-source rate limit (delay between requests)
FR4: The crawler reads and respects each source's robots.txt before crawling any path
FR5: The crawler can be invoked for a single source or all sources via a CLI argument
FR6: The crawler logs each URL's status (downloaded, skipped, error) to a persistent log file
FR7: The crawler skips URLs whose files already exist locally (incremental mode — no re-download)
FR8: The crawler can resume a previously interrupted run without re-downloading completed files
FR9: Downloaded files are saved to data/raw/<source>/<category>/ with the original filename or a slug derived from the title
FR10: Each raw file is saved in its original format (HTML → .html, PDF → .pdf, EPUB → .epub)
FR11: No modification is made to the raw file content — stored exactly as received
FR12: For each downloaded file, a paired .meta.json is generated in the same directory
FR13: The metadata extractor captures: id, title, title_pali, title_sanskrit, category, subcategory, source, url, author_translator, file_path, file_format, copyright_status, created_at
FR14: category is mapped to one of: Nikaya | Đại Thừa | Mật Tông | Thiền | Tịnh Độ
FR15: subcategory is derived from the source catalog structure (e.g., "Trường Bộ", "Bát Nhã")
FR16: id is deterministic — derived from source slug + title slug (stable across re-runs)
FR17: copyright_status is set to public_domain for classical texts or unknown for modern translations
FR18: The pipeline maintains data/index.json — a flat array of all records with: id, title, category, subcategory, source, url, file_path, file_format, copyright_status
FR19: data/index.json is updated incrementally (new records appended; no full rebuild required)
FR20: data/index.json is always consistent with files on disk (no orphaned entries, no missing files)
FR21: The pipeline detects and skips duplicate files (same content from different URLs)
FR22: A schema validation utility scans all .meta.json files and reports records with missing required fields
FR23: The pipeline generates a run summary report: records downloaded, skipped, errors, duplicates detected
FR24: All scripts are runnable as standalone CLI commands with --help documentation
FR25: Source configuration (seed URLs, rate limits, CSS selectors, output paths) lives in a single config.yaml — nothing hardcoded
FR26: The full pipeline (crawl → extract metadata → update index) can be executed end-to-end via a single command

### NonFunctional Requirements

NFR1: With async mode enabled, crawler must process ≥ 30 pages/minute net of rate-limit delays
NFR2: Metadata extraction must complete within 5 seconds per file on a standard laptop
NFR3: The crawler must handle HTTP errors (4xx, 5xx), timeouts, and malformed HTML gracefully — log and skip, never crash the full run
NFR4: All scripts must be idempotent — re-running with the same inputs produces the same outputs, no duplicates or corrupt state
NFR5: An interrupted crawl must be resumable from where it stopped — no data loss, no full restart
NFR6: ≥ 90% of downloaded records must have all required metadata fields populated
NFR7: All metadata text must preserve original Vietnamese Unicode — no encoding corruption
NFR8: Duplicate file rate in the final corpus must be < 2%
NFR9: Adding a new crawl source requires only a new entry in config.yaml — no changes to core crawler code
NFR10: Crawler, parser, and index modules must be independently runnable and testable
NFR11: All public functions must have inline documentation
NFR12: Crawler must never exceed the configured rate limit — enforced in both sync and async modes
NFR13: Any path disallowed by robots.txt must be logged as a warning and skipped

### Additional Requirements

- **Project Initialization (First Story)**: devbox + uv project setup must be the very first implementation story — `devbox init`, `devbox add python@3.11 uv`, `uv init .`, `uv add typer requests aiohttp beautifulsoup4 pyyaml pydantic`, `uv add --dev pytest ruff`
- **Shared Data Models**: All Pydantic v2 models (ScriptureMetadata, IndexRecord, SourceConfig, CrawlerConfig) must live in a single `models.py` — single source of truth, never redefined inline
- **Config Validation at Startup**: Config loaded via PyYAML + Pydantic SourceConfig/CrawlerConfig; must fail loudly on malformed config before any crawl begins
- **Async Concurrency Model**: aiohttp.ClientSession + TCPConnector(limit_per_host=2) + asyncio.sleep(delay per source config)
- **Crawl State Tracking**: data/crawl-state.json manifest — {url: "downloaded"|"error"|"skipped"} — written by crawler.py, read by indexer.py for consistency
- **Shared Utilities Package**: All cross-cutting logic in utils/ — slugify.py (make_id), config.py (load_config), logging.py (setup_logger), state.py (CrawlState), robots.py (RobotsCache), dedup.py (sha256_hash)
- **Deterministic ID Format**: `{source_slug}__{title_slug}` (double underscore) — Vietnamese diacritics stripped to ASCII via unicodedata NFKD normalization; implemented once in utils/slugify.py
- **Date/Time Format**: ISO 8601 UTC string in all JSON — "2026-02-27T10:30:00Z"
- **Content Hash Algorithm**: SHA-256 hex digest for deduplication — stored in crawl-state.json
- **File Format Detection Order**: (1) URL file extension, (2) HTTP Content-Type response header, (3) file_type_hints from config as fallback
- **HTML Completeness Check**: Verify file size > 0 AND </html> closing tag present before marking as downloaded; binary formats (PDF, EPUB) require non-zero file size only
- **Logging**: stdlib logging + RotatingFileHandler(10MB, 3 backups) in utils/logging.py — format: `{timestamp} [{LEVEL}] [{module}] {message}` — shared by all modules
- **Unit Tests Required**: 5 test files covering: test_slugify.py, test_metadata_schema.py, test_dedup.py, test_robots.py, test_incremental.py
- **Null Handling**: Explicit null for all optional metadata fields — never omit optional fields from .meta.json
- **USER_AGENT Constant**: "MonkaiCrawler/1.0" — consistent across all sessions
- **robots.txt Caching**: Parse and cache RobotFileParser once per source at session start — check before every URL

### FR Coverage Map

FR1: Epic 2 — Catalog page fetch + scripture URL extraction
FR2: Epic 2 — File download (HTML, PDF, EPUB)
FR3: Epic 2 — Per-source configurable rate limit
FR4: Epic 2 — robots.txt check before crawling
FR5: Epic 2 — CLI --source all|<name>
FR6: Epic 2 — Per-URL status logging to persistent log file
FR7: Epic 2 — Incremental skip — no re-download
FR8: Epic 2 — Resume interrupted crawl
FR9: Epic 2 — data/raw/<source>/<category>/ directory layout
FR10: Epic 2 — Format-faithful file storage
FR11: Epic 2 — Raw file stored exactly as received
FR12: Epic 3 — Paired .meta.json per downloaded file
FR13: Epic 3 — Full metadata schema capture (13 fields)
FR14: Epic 3 — Category taxonomy mapping
FR15: Epic 3 — Subcategory from catalog structure
FR16: Epic 3 — Deterministic ID (source_slug__title_slug)
FR17: Epic 3 — copyright_status classification
FR18: Epic 3 — data/index.json flat manifest
FR19: Epic 3 — Incremental index updates
FR20: Epic 3 — Disk consistency (no orphans, no missing files)
FR21: Epic 2 — Deduplication at download (SHA-256)
FR22: Epic 4 — Schema validation utility (validate.py)
FR23: Epic 4 — Run summary report
FR24: Epics 2–4 — --help on all CLI scripts (auto via Typer)
FR25: Epic 1 — Single config.yaml, nothing hardcoded
FR26: Epic 4 — End-to-end pipeline via single command

## Epic List

### Epic 1: Project Foundation & Core Infrastructure
The developer has a working, lintable, testable project environment with all shared data contracts (Pydantic models), utility functions, and config.yaml validated and in place — the foundation all pipeline modules build on.
**FRs covered:** FR25
**NFRs covered:** NFR4, NFR7, NFR9, NFR10, NFR11
**Additional:** devbox + uv project init, models.py (ScriptureMetadata, IndexRecord, SourceConfig, CrawlerConfig), utils/ package (slugify, config, logging, state, robots, dedup), unit tests for 5 critical areas, config.yaml with first source

### Epic 2: Web Crawler — Scripture File Collection
The developer can run a single command to download Buddhist scripture files from one or all 4 configured sources into an organized data/raw/ directory — with full robots.txt compliance, configurable rate limiting, per-URL logging, deduplication at download time, and resumable execution after interruption.
**FRs covered:** FR1, FR2, FR3, FR4, FR5, FR6, FR7, FR8, FR9, FR10, FR11, FR21, FR24 (crawler.py --help)
**NFRs covered:** NFR1, NFR3, NFR5, NFR8, NFR12, NFR13

### Epic 3: Metadata Extraction & Index Management
The developer can parse every downloaded file to generate a paired .meta.json with unified schema, then build and update data/index.json — the complete flat manifest that is the Phase 2 handoff contract.
**FRs covered:** FR12, FR13, FR14, FR15, FR16, FR17, FR18, FR19, FR20, FR24 (parser.py + indexer.py --help)
**NFRs covered:** NFR2, NFR4, NFR6, NFR7, NFR10

### Epic 4: Data Quality Validation & Phase 2 Handoff
The developer can validate the entire corpus quality (schema completeness, dedup rate, disk consistency), run the full pipeline end-to-end via a single command, and confidently hand off to Phase 2 with all quality gates passing.
**FRs covered:** FR22, FR23, FR24 (validate.py --help), FR26
**NFRs covered:** NFR4, NFR6, NFR8, NFR10

---

## Epic 1: Project Foundation & Core Infrastructure

The developer has a working, lintable, testable project environment with all shared data contracts (Pydantic models), utility functions, and config.yaml validated and in place — the foundation all pipeline modules build on.

### Story 1.1: Project Environment Setup

As a developer,
I want a fully initialized Python project with devbox + uv environment and all required dependencies installed,
So that I have a reproducible, isolated development environment ready to build all pipeline modules.

**Acceptance Criteria:**

**Given** the monkai project directory is empty
**When** I run `devbox shell` then `uv sync`
**Then** a Python 3.11 virtual environment is activated with all declared dependencies available (typer, requests, aiohttp, beautifulsoup4, pyyaml, pydantic, pytest, ruff)
**And** `uv run python --version` outputs Python 3.11.x
**And** `devbox run lint` runs ruff check with exit code 0
**And** `devbox run test` runs pytest with exit code 0 (0 tests collected is acceptable at this stage)

**Given** the project is initialized
**When** I inspect the directory structure
**Then** devbox.json, pyproject.toml, .python-version (pinned to 3.11), and .gitignore all exist
**And** .gitignore includes: `data/raw/`, `data/crawl-state.json`, `logs/`, `.venv/`
**And** devbox.json includes scripts: `crawl`, `parse`, `index`, `validate`, `test`, `lint`, `format`
**And** empty directories exist: `data/raw/`, `logs/`, `tests/`, `utils/`

---

### Story 1.2: Source Configuration File

As a developer,
I want a validated `config.yaml` with thuvienhoasen.org configured as the first crawl source,
So that all pipeline modules are driven from a single configuration file with nothing hardcoded.

**Acceptance Criteria:**

**Given** `config.yaml` exists with thuvienhoasen.org configured
**When** I call `load_config("config.yaml")` from `utils/config.py`
**Then** a valid `CrawlerConfig` Pydantic model is returned with no validation errors
**And** `config.sources[0].name` equals `"thuvienhoasen"`
**And** `config.sources[0].rate_limit_seconds` is ≥ 1.0
**And** `config.sources[0].css_selectors` contains at minimum keys `catalog_links` and `file_links`
**And** `config.output_dir` defaults to `"data"` and `config.log_file` defaults to `"logs/crawl.log"`

**Given** `config.yaml` has a missing required field (e.g., `seed_url` removed)
**When** I call `load_config("config.yaml")`
**Then** a `pydantic.ValidationError` is raised immediately — fail-loud at startup, not silently mid-crawl
**And** the error message identifies the missing field by name

---

### Story 1.3: Shared Data Models

As a developer,
I want all Pydantic v2 data models defined in a single `models.py`,
So that all pipeline modules share one validated, type-safe data contract with no schema duplication.

**Acceptance Criteria:**

**Given** `models.py` exists with `ScriptureMetadata` defined
**When** I instantiate it with all required fields
**Then** the model validates successfully
**And** optional fields (`title_pali`, `title_sanskrit`, `author_translator`) default to `None` and appear as `null` in JSON output (never omitted)
**And** `category` rejects any value outside `["Nikaya", "Đại Thừa", "Mật Tông", "Thiền", "Tịnh Độ"]` with a `ValidationError`
**And** `file_format` only accepts `["html", "pdf", "epub", "other"]`
**And** `copyright_status` only accepts `["public_domain", "unknown"]`
**And** `model.model_dump_json()` produces valid JSON with snake_case field names and ISO 8601 UTC `created_at`

**Given** `IndexRecord` is defined in `models.py`
**When** I instantiate it
**Then** it contains exactly: `id`, `title`, `category`, `subcategory`, `source`, `url`, `file_path`, `file_format`, `copyright_status` — no full metadata fields beyond these

**Given** a `SourceConfig` instantiated with `rate_limit_seconds` below 1.0
**When** I instantiate it
**Then** a `ValidationError` is raised, enforcing the ethical crawl minimum rate

---

### Story 1.4: Core Utilities Package

As a developer,
I want the `utils/` package with all 6 shared utility modules implemented,
So that all pipeline modules can import deterministic ID generation, config loading, logging, crawl state, robots.txt handling, and deduplication from a single trusted location.

**Acceptance Criteria:**

**Given** `utils/slugify.py` is implemented
**When** I call `make_id("thuvienhoasen", "Tâm Kinh")`
**Then** the result is `"thuvienhoasen__tam-kinh"` (Vietnamese diacritics stripped via unicodedata NFKD, double-underscore separator, lowercase, hyphens)
**And** calling `make_id` twice with identical inputs always returns the same string (deterministic)
**And** `make_id("THUVIENHOASEN", "TÂM KINH")` returns the same result as the lowercase form

**Given** `utils/logging.py::setup_logger("crawler")` is called
**When** the logger emits INFO and WARNING messages
**Then** messages appear on stdout AND are appended to `logs/crawl.log`
**And** the format matches: `{ISO-timestamp} [INFO] [crawler] {message}`

**Given** `utils/state.py::CrawlState` loaded on a fresh `data/crawl-state.json`
**When** I call `state.mark_downloaded("https://example.com/file")` then `state.save()`
**Then** `state.is_downloaded("https://example.com/file")` returns `True`
**And** `data/crawl-state.json` on disk reflects the persisted update

**Given** `utils/robots.py::RobotsCache` for a domain
**When** I call `robots_allowed(cache, url)` for a disallowed path
**Then** it returns `False` and the USER_AGENT used is `"MonkaiCrawler/1.0"`
**And** robots.txt is fetched only once per domain per session (cached — no redundant fetches)

**Given** `utils/dedup.py::sha256_hash(file_bytes)` called twice with identical bytes
**When** both results are compared
**Then** both return the same lowercase hex digest
**And** `is_duplicate(hash, seen_set)` returns `True` if hash is in the set, `False` otherwise

---

### Story 1.5: Unit Tests for Core Utilities

As a developer,
I want 5 unit test files covering the critical shared utilities,
So that regressions in the deterministic logic that all pipeline modules depend on are caught immediately.

**Acceptance Criteria:**

**Given** `tests/test_slugify.py` exists
**When** `devbox run test` is executed
**Then** tests pass for: `make_id` determinism, Vietnamese diacritic stripping (`Tâm→tam`, `Đại→dai`, `Ưu→uu`), double-underscore separator format, edge cases (empty title, special characters)

**Given** `tests/test_metadata_schema.py` exists
**When** tests run
**Then** they cover: valid `ScriptureMetadata` instantiation, `ValidationError` on missing required fields, `null` for optional fields in JSON output, enum rejection for invalid category/format/copyright values

**Given** `tests/test_dedup.py` exists
**When** tests run
**Then** they cover: `sha256_hash` stability for known bytes, `is_duplicate` True for known hash, False for new hash

**Given** `tests/test_robots.py` exists with mocked HTTP responses
**When** tests run
**Then** they cover: allowed URL → True, disallowed URL → False, wildcard disallow rule, missing robots.txt treated as allow-all

**Given** `tests/test_incremental.py` exists with a temporary `CrawlState`
**When** tests run
**Then** they cover: `is_downloaded` True for known URL, False for unknown URL, filesystem fallback repairs state when file exists but URL not tracked in state

**And** `devbox run test` exits 0 with all 5 test files collected and all tests passing

---

## Epic 2: Web Crawler — Scripture File Collection

The developer can run a single command to download Buddhist scripture files from one or all 4 configured sources into an organized `data/raw/` directory — with full robots.txt compliance, configurable rate limiting, per-URL logging, deduplication at download time, and resumable execution after interruption.

### Story 2.1: Crawler CLI Shell + robots.txt Compliance

As a developer,
I want a `crawler.py` CLI entry point that loads config and enforces robots.txt compliance before touching any source,
So that every crawl session is ethically compliant from the first request.

**Acceptance Criteria:**

**Given** `crawler.py` exists as a Typer CLI
**When** I run `uv run python crawler.py --help`
**Then** help text is displayed showing `--source` option with values `all` or `<source-name>` and `--config` option defaulting to `config.yaml`

**Given** I run `crawler.py --source thuvienhoasen`
**When** the crawler initializes
**Then** `load_config()` is called and the config is validated — a malformed config exits with a clear error before any network request
**And** `RobotsCache` is initialized and thuvienhoasen.org's robots.txt is fetched and cached once at session start using USER_AGENT `"MonkaiCrawler/1.0"`
**And** `setup_logger("crawler")` is called and all subsequent log output follows the format `{timestamp} [LEVEL] [crawler] {message}`

**Given** a source URL is disallowed by robots.txt
**When** the crawler evaluates that URL
**Then** it logs `[WARN] [crawler] robots.txt blocked: {url}` and skips it — no download attempted
**And** the crawl continues to the next URL without crashing

---

### Story 2.2: Catalog Page Fetch + Scripture URL Extraction

As a developer,
I want the crawler to fetch each source's catalog/listing page and extract individual scripture URLs using CSS selectors from config,
So that I have a complete list of scripture URLs to download for each source.

**Acceptance Criteria:**

**Given** thuvienhoasen.org is configured with valid `seed_url` and `catalog_links` CSS selector
**When** I run `crawler.py --source thuvienhoasen`
**Then** the crawler fetches the seed/catalog page(s) and extracts a list of individual scripture URLs
**And** each extracted URL is an absolute HTTPS URL (relative URLs are resolved against the base)
**And** extracted URLs are logged at INFO level: `[INFO] [crawler] Found {N} scripture URLs from {source}`

**Given** the catalog spans multiple pages (pagination)
**When** the crawler processes the catalog
**Then** it follows pagination links (if `pagination_selector` is in config) until all pages are exhausted
**And** each page fetch respects `rate_limit_seconds` delay

**Given** the CSS selector in config returns 0 matches
**When** the crawler processes that source
**Then** it logs a WARNING and continues — no crash
**And** the run summary records 0 URLs found for that source

---

### Story 2.3: Async File Download + File Storage + Rate Limiting

As a developer,
I want the crawler to asynchronously download scripture files to an organized `data/raw/` directory with rate limiting enforced,
So that I can collect files from all sources efficiently while respecting each site's rate limits.

**Acceptance Criteria:**

**Given** a list of scripture URLs for thuvienhoasen.org
**When** the crawler downloads them
**Then** each file is saved to `data/raw/thuvienhoasen/<category>/<filename>` preserving directory structure
**And** the filename is the original filename from the URL, or `{title_slug}.{ext}` if the URL has no clean filename
**And** file format is detected in order: (1) URL extension, (2) HTTP `Content-Type` header, (3) `file_type_hints` from config
**And** the file is stored exactly as received — no content modification

**Given** `aiohttp.ClientSession` with `TCPConnector(limit_per_host=2)` is used
**When** downloading multiple files concurrently
**Then** no more than 2 concurrent connections are made to the same host at any time
**And** `asyncio.sleep(source.rate_limit_seconds)` is called between requests to that host
**And** the effective download rate meets ≥ 30 pages/minute net of rate-limit delays (NFR1)

**Given** an HTML file is downloaded
**When** the crawler checks download completeness
**Then** it verifies file size > 0 AND `</html>` closing tag is present before marking as downloaded
**And** for binary formats (PDF, EPUB), only non-zero file size is required

---

### Story 2.4: Crawl State Tracking, Per-URL Logging + Incremental/Resumable Mode

As a developer,
I want every URL's download status persisted to `data/crawl-state.json` with per-URL logging and graceful error handling,
So that I can resume an interrupted crawl and audit exactly what happened to every URL.

**Acceptance Criteria:**

**Given** a URL is successfully downloaded
**When** the crawler processes it
**Then** `crawl-state.json` is updated: `{"https://...": "downloaded"}`
**And** the log records: `[INFO] [crawler] Downloaded: {url} → {file_path}`

**Given** a URL download fails with HTTP 4xx/5xx or timeout
**When** the error occurs
**Then** the crawler logs `[ERROR] [crawler] HTTP {status}: {url} — skipping`
**And** `crawl-state.json` records `{"https://...": "error"}`
**And** the crawl continues to the next URL — the full run never crashes due to a single URL failure (NFR3)

**Given** a URL is already marked `"downloaded"` in `crawl-state.json`
**When** the crawler encounters it in a new run
**Then** it skips the download: `[INFO] [crawler] Skip (state): {url}`
**And** if the file exists on disk but is not in crawl-state.json, state is repaired: `state.mark_downloaded(url)` and skip

**Given** a crawl is interrupted mid-run (e.g., KeyboardInterrupt)
**When** the crawler is restarted with the same `--source` argument
**Then** it resumes from where it stopped — all previously `"downloaded"` URLs are skipped
**And** no previously downloaded files are re-downloaded or overwritten (NFR5)

---

### Story 2.5: Content Deduplication + All 4 Sources Configured

As a developer,
I want duplicate files detected and skipped at download time using SHA-256 hashing, and all 4 target sources fully configured in `config.yaml`,
So that the corpus has < 2% duplicate rate and any 5th source can be added via config alone.

**Acceptance Criteria:**

**Given** `utils/dedup.py` is integrated into the download loop
**When** a file is downloaded
**Then** its SHA-256 hash is computed and compared against all previously seen hashes in the current session
**And** if a duplicate is detected, the file is not written to disk: `[INFO] [crawler] Duplicate detected (hash match): {url} — skipping`
**And** `crawl-state.json` records `{"https://...": "skipped"}` for duplicate URLs

**Given** `config.yaml` is updated with all 4 sources: `thuvienhoasen`, `budsas`, `chuabaphung`, `dhammadownload`
**When** I run `crawler.py --source all`
**Then** all 4 sources are crawled in sequence, each respecting its own `rate_limit_seconds`
**And** files land in `data/raw/thuvienhoasen/`, `data/raw/budsas/`, `data/raw/chuabaphung/`, `data/raw/dhammadownload/` respectively

**Given** a new 5th source is added to `config.yaml` with valid fields
**When** I run `crawler.py --source new-source-name`
**Then** it crawls the new source without any changes to `crawler.py` code (NFR9)

---

## Epic 3: Metadata Extraction & Index Management

The developer can parse every downloaded file to generate a paired `.meta.json` with unified schema, then build and update `data/index.json` — the complete flat manifest that is the Phase 2 handoff contract.

### Story 3.1: Metadata Extractor — First Source (parser.py)

As a developer,
I want `parser.py` to extract structured metadata from downloaded thuvienhoasen.org files and write validated `.meta.json` files,
So that each downloaded scripture has a machine-readable, schema-validated metadata record.

**Acceptance Criteria:**

**Given** `parser.py` exists as a Typer CLI and raw files from thuvienhoasen exist in `data/raw/thuvienhoasen/`
**When** I run `uv run python parser.py --source thuvienhoasen`
**Then** for each raw file, a `{filename}.meta.json` is written in the same directory
**And** the `.meta.json` validates against `ScriptureMetadata` with no Pydantic errors

**Given** a thuvienhoasen HTML file is parsed
**When** metadata is extracted using CSS selectors from config
**Then** `id` is generated via `make_id(source_name, title)` — deterministic, never recomputed differently
**And** `category` is mapped to one of `["Nikaya", "Đại Thừa", "Mật Tông", "Thiền", "Tịnh Độ"]`
**And** `subcategory` is derived from the catalog section structure
**And** `created_at` is an ISO 8601 UTC string: `"2026-02-27T10:30:00Z"`
**And** optional fields (`title_pali`, `title_sanskrit`, `author_translator`) are `null` when not found — never omitted

**Given** parser.py completes a run
**When** I check the output
**Then** metadata extraction for each file completes in ≤ 5 seconds (NFR2)
**And** a summary is logged: `[INFO] [parser] Parsed {N} files, {M} errors for source thuvienhoasen`

---

### Story 3.2: Parser Extended to All 4 Sources + Edge Cases

As a developer,
I want `parser.py` extended to handle all 4 sources with correct CSS selectors and copyright classification,
So that the complete corpus of all 4 sources has validated, UTF-8 clean metadata records.

**Acceptance Criteria:**

**Given** raw files exist for `budsas`, `chuabaphung`, and `dhammadownload`
**When** I run `parser.py --source all`
**Then** `.meta.json` files are generated for every raw file across all 4 sources
**And** each source uses its own CSS selectors defined in `config.yaml` — no hardcoded selectors in parser.py (NFR9)

**Given** a modern Vietnamese translation file is parsed (chuabaphung or dhammadownload)
**When** `copyright_status` is determined
**Then** it is set to `"unknown"` for modern translations
**And** classical Pali canon texts (Nikaya category) from budsas are set to `"public_domain"`

**Given** a metadata field contains Vietnamese Unicode text (e.g., title with diacritics)
**When** the `.meta.json` is written
**Then** the file is UTF-8 encoded with no mojibake or encoding corruption (NFR7)
**And** `json.loads(meta_json_content)` succeeds and all Vietnamese characters are preserved exactly

**Given** a raw file's HTML is malformed or CSS selectors return no match
**When** the parser processes it
**Then** it logs `[ERROR] [parser] Extraction failed: {file_path} — {reason}` and continues
**And** the run never crashes due to a single file failure (per-file try/except)
**And** ≥ 90% of all records across the corpus have all required metadata fields populated (NFR6)

---

### Story 3.3: Index Builder (indexer.py)

As a developer,
I want `indexer.py` to build and incrementally update `data/index.json` from all `.meta.json` files, verified for disk consistency,
So that Phase 2 has a single, reliable flat manifest of the entire corpus.

**Acceptance Criteria:**

**Given** `indexer.py` exists as a Typer CLI and `.meta.json` files exist across `data/raw/`
**When** I run `uv run python indexer.py`
**Then** `data/index.json` is created/updated as a flat JSON array of `IndexRecord` objects
**And** every `.meta.json` on disk is represented as exactly one entry in `data/index.json`
**And** the `IndexRecord` schema matches the Phase 2 handoff contract: `id`, `title`, `category`, `subcategory`, `source`, `url`, `file_path`, `file_format`, `copyright_status`

**Given** new `.meta.json` files are added after an initial index run
**When** I run `indexer.py` again
**Then** only new records are appended — no full rebuild, no duplicates introduced (FR19, NFR4)
**And** running `indexer.py` twice with the same inputs produces identical `data/index.json` output (idempotent)

**Given** a `.meta.json` references a file path that does not exist on disk
**When** `indexer.py` checks disk consistency
**Then** it logs `[WARN] [indexer] Orphaned meta.json (file missing): {path}` and excludes that record
**And** every record in `data/index.json` has a corresponding file that exists and is non-empty (FR20)

**Given** `indexer.py` completes
**When** I inspect the output
**Then** a summary is logged: `[INFO] [indexer] Indexed {N} records, {M} orphans excluded`
**And** `data/index.json` is valid JSON parseable with `json.loads()` (NFR4)

---

## Epic 4: Data Quality Validation & Phase 2 Handoff

The developer can validate the entire corpus quality (schema completeness, dedup rate, disk consistency), run the full pipeline end-to-end via a single command, and confidently hand off to Phase 2 with all quality gates passing.

### Story 4.1: Schema Validation Utility (validate.py)

As a developer,
I want `validate.py` to scan all `.meta.json` files and report records with missing or invalid required fields,
So that I can identify and fix metadata quality issues before Phase 2 handoff.

**Acceptance Criteria:**

**Given** `validate.py` exists as a Typer CLI
**When** I run `uv run python validate.py --help`
**Then** help text is displayed with `--config` option documented

**Given** `.meta.json` files exist across `data/raw/`
**When** I run `validate.py`
**Then** every `.meta.json` is validated against the `ScriptureMetadata` Pydantic schema
**And** records with missing required fields are reported: `[WARN] [validate] Schema error in {path}: {field} missing`
**And** records with invalid enum values are reported with the offending value

**Given** all records pass validation
**When** `validate.py` completes
**Then** it exits with code 0 and prints: `All {N} records passed schema validation`

**Given** any records fail validation
**When** `validate.py` completes
**Then** it exits with code 1 and a summary of failures is printed to stdout

---

### Story 4.2: Run Summary Report + Corpus Quality Audit

As a developer,
I want `validate.py` to generate a run summary report with corpus-wide quality metrics,
So that I can confirm all quality gates are met before Phase 2 handoff.

**Acceptance Criteria:**

**Given** `data/crawl-state.json` and all `.meta.json` files exist
**When** I run `validate.py`
**Then** a run summary report is printed to stdout containing:
- Total records downloaded, skipped, errored (from crawl-state.json)
- Total `.meta.json` files found
- Schema validation pass/fail counts
- Duplicate file count and percentage (computed from SHA-256 hashes across corpus)
- Metadata field coverage: percentage of records with all required fields populated

**Given** the corpus is audited for duplicates
**When** SHA-256 hashes are compared across all downloaded files
**Then** the duplicate rate is reported: `Duplicate rate: {X}% ({N} duplicates of {Total} files)`
**And** if duplicate rate exceeds 2%, a WARNING is printed: `[WARN] Duplicate rate {X}% exceeds 2% threshold`

**Given** metadata field coverage is computed
**When** required fields are checked across all records
**Then** coverage is reported per field: e.g., `title: 100%, author_translator: 72%, title_pali: 31%`
**And** if overall required-field coverage drops below 90%, a WARNING is printed (NFR6)

---

### Story 4.3: End-to-End Pipeline Command + Phase 2 Handoff Verification

As a developer,
I want a single command that runs the full pipeline (crawl → parse → index → validate) and verifies the Phase 2 handoff contract is satisfied,
So that I can execute the complete corpus build in one step and confirm Phase 2 readiness.

**Acceptance Criteria:**

**Given** `devbox.json` is updated with a `pipeline` script
**When** I run `devbox run pipeline` (or `uv run python pipeline.py`)
**Then** the four pipeline stages execute in sequence: `crawler.py → parser.py → indexer.py → validate.py`
**And** each stage's exit code is checked — if any stage fails, the pipeline halts and logs which stage failed
**And** final output reports total records processed end-to-end (FR26)

**Given** the full pipeline completes successfully
**When** I inspect `data/index.json`
**Then** every record conforms to the frozen Phase 2 `IndexRecord` schema: `id`, `title`, `category`, `subcategory`, `source`, `url`, `file_path`, `file_format`, `copyright_status`
**And** `data/index.json` is valid JSON with ≥ 500 unique records (primary success metric)
**And** all files referenced in `data/index.json` exist on disk and are non-empty

**Given** the pipeline is run a second time with no new sources or files
**When** all stages complete
**Then** `data/index.json` is identical to the first run output (full pipeline idempotency — NFR4)
**And** no files are re-downloaded, no `.meta.json` files are overwritten, no duplicate records added to index

**Given** the Phase 2 handoff quality gates checklist
**When** `validate.py` runs as the final stage
**Then** all gates pass:
- [ ] ≥ 500 unique records in `data/index.json`
- [ ] All 4 sources crawled with 0 robots.txt violations
- [ ] Duplicate rate < 2%
- [ ] ≥ 90% of records have all required metadata fields
- [ ] All files in `data/index.json` exist on disk and are non-empty
- [ ] `data/index.json` is valid JSON matching the IndexRecord schema

---

## Epic 5: ThuvienKinhPhat Parser Fix & EPUB Book Builder

The parser correctly extracts `category` (Kinh Tạng / Luật Tạng / Thắng Pháp Tạng), `bookTitle`, `chapter`, and `authorTranslator` from the ThuvienKinhPhat HTML pages using breadcrumb navigation, title-tag splitting, and translator lookup. A `book_builder.py` module groups parsed chapters into ordered EPUB-ready book manifests.

**FRs covered:** FR13 (extended metadata schema), FR14 (category taxonomy — new Tạng categories), FR25 (config-driven selectors)
**NFRs covered:** NFR4 (idempotent re-parse), NFR6 (≥90% metadata coverage), NFR7 (Vietnamese Unicode)

---

### Story 5.1: Extend Models for ThuvienKinhPhat Categories

As a developer,
I want the `ScriptureMetadata` model to accept Tạng-level categories from ThuvienKinhPhat,
So that the parser can correctly classify Kinh Tạng, Luật Tạng, and Thắng Pháp Tạng scriptures.

**Acceptance Criteria:**

**Given** `models.py` `ScriptureMetadata.category` Literal is updated
**When** I instantiate it with `category="Kinh Tạng"`
**Then** it validates successfully with no Pydantic error
**And** `"Luật Tạng"` and `"Thắng Pháp Tạng"` also validate correctly
**And** `IndexRecord.category` Literal is updated with the same new values
**And** existing valid values (`"Nikaya"`, `"Đại Thừa"`, `"Mật Tông"`, `"Thiền"`, `"Tịnh Độ"`) continue to validate
**And** `CATEGORY_MAP` in `parser.py` is updated to map `"kinh tạng"`, `"luật tạng"`, `"thắng pháp tạng"` to their canonical literals

---

### Story 5.2: Fix ThuvienKinhPhat CSS Selectors & Parser Logic

As a developer,
I want `parser.py` to use breadcrumb navigation, title-tag splitting, and translator lookup for ThuvienKinhPhat HTML pages,
So that each chapter's meta JSON correctly contains `category`, `bookTitle`, `chapter`, and `authorTranslator` without falling back to filename stubs.

**Acceptance Criteria:**

**Given** `truong01.html` is parsed by `parser.py`
**When** metadata is extracted
**Then** `book_title` equals `"Kinh Trường Bộ"` (from breadcrumb 3rd item, not `<title>` tag)
**And** `chapter` equals `"1. Kinh Phạm võng(Brahmajàla sutta)"` (from `<title>` split on `:`, right side)
**And** `category` equals `"Kinh Tạng"` (from breadcrumb 2nd item)
**And** `author_translator` equals `"Hòa thượng Thích Minh Châu"` (from translator lookup map)
**And** `subcategory` equals `""` (intentionally empty)
**And** `title` is set to the same value as `chapter` (no separate title field needed)

**Given** `bkni01.html` is parsed
**When** metadata is extracted
**Then** `book_title` equals `"Giới Bổn Tỳ-khưu Ni"` (from breadcrumb)
**And** `chapter` equals `"[01]"` (from inline `[01]` marker when title-tag split yields no chapter)
**And** `category` equals `"Luật Tạng"` (from breadcrumb)
**And** `author_translator` equals `"Indacanda Bhikkhu (Trương đình Dũng)"` (from `"Lời tiếng Việt:"` prefix on page)

**Given** `config.yaml` thuvienkinhphat selectors are updated
**When** I inspect the config
**Then** `book_title` selector is removed (breadcrumb-based in code)
**And** `chapter` selector is removed (title-tag split in code)
**And** `author_translator` selector is empty (translator map in code)
**And** a `breadcrumb_selector: "a"` selector is added to navigate breadcrumb links

**Given** parser runs on all 547 existing raw files
**When** I run `uv run python parser.py --source thuvienkinhphat --force`
**Then** ≥ 90% of records have non-null `book_title`, `chapter`, and `category` (NFR6)
**And** no Vietnamese text has encoding corruption (NFR7)

---

### Story 5.3: Build Book Manifests for EPUB Preparation (book_builder.py)

As a developer,
I want `book_builder.py` to group parsed chapter meta JSONs into ordered book manifest files,
So that the EPUB generation phase has a ready-to-use, sorted chapter list per book.

**Acceptance Criteria:**

**Given** `book_builder.py` exists as a Typer CLI
**When** I run `uv run python book_builder.py --help`
**Then** help text is displayed with `--source` and `--config` options

**Given** parsed meta JSONs exist in `data/meta/thuvienkinhphat/`
**When** I run `uv run python book_builder.py --source thuvienkinhphat`
**Then** one JSON manifest file per book is written to `data/books/thuvienkinhphat/{book-slug}.json`
**And** each manifest contains:
```json
{
  "book_title": "Kinh Trường Bộ",
  "category": "Kinh Tạng",
  "subcategory": "",
  "author_translator": "Hòa thượng Thích Minh Châu",
  "cover_image_url": null,
  "source": "thuvienkinhphat",
  "chapters": [
    {"order": 1, "chapter": "1. Kinh Phạm võng...", "meta_file": "truong01.json", "url": "..."}
  ]
}
```
**And** chapters are sorted by filename number (e.g. `truong01` → 1, `truong02` → 2)
**And** running `book_builder.py` twice with same inputs produces identical output (idempotent, NFR4)

**Given** a book has chapters from multiple TOC sub-sections (e.g. Tập I, Tập II in Trường Bộ)
**When** the builder groups them
**Then** all chapters appear in one book manifest in correct numeric order regardless of sub-section

---

### Story 5.4: Verify Re-Parse Quality + Update Index

As a developer,
I want to re-parse all ThuvienKinhPhat files with the fixed parser and verify metadata quality via `validate.py`,
So that the corpus accurately reflects the correct book-level metadata before EPUB generation begins.

**Acceptance Criteria:**

**Given** fixed `parser.py` is in place
**When** I run `uv run python parser.py --source thuvienkinhphat --force`
**Then** all 547+ meta JSON files are regenerated with correct metadata
**And** a summary log confirms: `Parsed {N} files, 0 critical errors`

**Given** re-parsed meta JSONs exist
**When** I run `uv run python validate.py`
**Then** ≥ 90% of ThuvienKinhPhat records have `book_title`, `chapter`, `category` all non-null (NFR6)
**And** `category` values are all valid literals (no `"Nikaya"` misclassification for Luật/VDP texts)
**And** `author_translator` is non-null for ≥ 80% of records

**Given** re-parse completes
**When** I run `uv run python indexer.py`
**Then** `data/index.json` is updated with corrected records for all ThuvienKinhPhat chapters
**And** no duplicate IDs appear in the index
