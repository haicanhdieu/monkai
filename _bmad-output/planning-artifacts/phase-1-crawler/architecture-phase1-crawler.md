---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8]
lastStep: 8
status: 'complete'
completedAt: '2026-02-27'
inputDocuments:
  - _bmad-output/planning-artifacts/phase-1-crawler/prd-phase1-crawler.md
  - docs/ke-hoach-thu-vien-kinh-phat.md
workflowType: 'architecture'
project_name: 'monkai'
user_name: 'Minh'
date: '2026-02-27'
---

# Architecture Decision Document

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

## Project Context Analysis

### Requirements Overview

**Functional Requirements (26 total):**
- Source Crawling (FR1–FR8): Multi-source catalog crawl, file download, robots.txt enforcement, rate limiting, incremental/resumable mode, per-URL status logging
- File Storage (FR9–FR11): Organized directory layout, format-faithful storage, no content modification
- Metadata Extraction & Normalization (FR12–FR17): Paired .meta.json per file, unified schema across traditions, deterministic ID generation, copyright_status classification
- Index Management (FR18–FR20): Flat data/index.json manifest, incremental updates, disk consistency
- Data Quality (FR21–FR23): Hash-based deduplication, schema validation utility, run summary report
- Operational (FR24–FR26): CLI with --help, single config.yaml, end-to-end pipeline command

**Non-Functional Requirements (13 total):**
- Performance: ≥30 pages/min async (NFR1), ≤5s metadata extraction per file (NFR2)
- Reliability: Graceful HTTP error handling never crashing full run (NFR3), full idempotency (NFR4), resumable from interruption with no data loss (NFR5)
- Data Quality: ≥90% metadata field coverage (NFR6), UTF-8 preservation (NFR7), <2% duplicate rate (NFR8)
- Maintainability: Config-only new source addition (NFR9), independently runnable modules (NFR10), inline documentation (NFR11)
- Compliance: Rate limit never exceeded in sync or async mode (NFR12), robots.txt skip+warn (NFR13)

**Scale & Complexity:**

- Primary domain: Data pipeline / ETL CLI tool
- Complexity level: Medium (greenfield, no DB/UI, but async concurrency + pluggable sources + idempotency)
- Estimated architectural components: 6–8 discrete modules

### Technical Constraints & Dependencies

- Language: Python 3.10+
- HTTP: requests (sync) + aiohttp + asyncio (async)
- Parsing: BeautifulSoup4
- Storage: Filesystem only — data/raw/<source>/<category>/ + .meta.json + data/index.json
- No database, no embeddings, no LLM calls in Phase 1
- UTF-8 enforced for all metadata; raw files stored as-is (format-faithful)
- Rate limiting: 1–2 seconds/request minimum, configurable per source
- Phase 2 handoff contract: data/index.json is the stable interface boundary

### Cross-Cutting Concerns Identified

1. **Rate limiting** — Must be enforced consistently in both sync and async crawl modes
2. **robots.txt compliance** — Checked before crawling any path on any source
3. **Error handling & logging** — All pipeline stages must log-and-skip on failure; persistent log file
4. **Idempotency** — Re-running with same inputs must produce identical outputs; no state corruption
5. **Encoding consistency** — UTF-8 enforced across all metadata; raw file encoding preserved
6. **Content hashing / deduplication** — Hash-based dedup shared across all sources
7. **Deterministic ID generation** — source slug + title slug scheme must be consistent across parser and indexer throughout the pipeline lifecycle
8. **Phase 2 handoff contract** — data/index.json schema is a public interface; must remain stable

## Starter Template Evaluation

### Primary Technology Domain

Python CLI / ETL data pipeline. No framework-based project generator applies (unlike Next.js or NestJS starters). We compose from first principles using devbox + uv + Typer as the project foundation.

### Approach: Composed Python Project (No Generator)

**Rationale:** The PRD specifies a standalone CLI pipeline with no web framework, no database, and no UI. A cookiecutter or similar generator would add boilerplate not needed here. Direct composition gives cleaner control and avoids lock-in to opinionated generators that assume web/API patterns.

### Initialization Sequence

```bash
devbox init
devbox add python@3.11 uv
devbox shell
uv init .
uv add typer requests aiohttp beautifulsoup4 pyyaml
uv add --dev pytest ruff
```

### devbox.json Structure

```json
{
  "packages": ["python@3.11", "uv"],
  "shell": {
    "init_hook": ["uv sync"],
    "scripts": {
      "crawl":    "uv run python crawler.py",
      "parse":    "uv run python parser.py",
      "index":    "uv run python indexer.py",
      "validate": "uv run python validate.py",
      "test":     "uv run pytest",
      "lint":     "uv run ruff check .",
      "format":   "uv run ruff format ."
    }
  }
}
```

### Architectural Decisions Established by This Setup

**Language & Runtime:**
Python 3.11 (exceeds the 3.10+ constraint; managed reproducibly via devbox)

**Environment & Package Management:**
devbox 0.14.0 + uv — devbox provides hermetic shell isolation; uv handles fast dependency resolution and virtualenv; pyproject.toml is the single source of truth for dependencies

**CLI Framework:**
Typer 0.24.0 — type-annotated CLI, auto-generates --help, supports subcommands naturally (`crawler.py --source all`, `--source thuvienhoasen`, etc.)

**Testing:**
pytest 9.0.2 — minimal scope: unit tests for core functions with downstream impact: deterministic ID generation, metadata schema validation, dedup hash logic, robots.txt parsing, incremental skip logic. Not testing HTTP I/O or full crawl runs.

**Code Quality:**
ruff 0.15.1 — single tool replaces black + flake8 + isort; runs locally via devbox scripts

**Project Structure:**
```
monkai/
├── devbox.json
├── pyproject.toml
├── config.yaml             # source configs, rate limits, selectors
├── crawler.py              # async crawl engine (Typer CLI entry)
├── parser.py               # metadata extractor (Typer CLI entry)
├── indexer.py              # index manager (Typer CLI entry)
├── validate.py             # schema validator (Typer CLI entry)
├── data/
│   ├── raw/                # <source>/<category>/<files>
│   └── index.json          # flat manifest
├── logs/                   # persistent crawl logs
└── tests/
    ├── test_id_generation.py
    ├── test_metadata_schema.py
    ├── test_dedup.py
    ├── test_robots.py
    └── test_incremental.py
```

**Note:** Project initialization using the commands above should be the first implementation story.

## Core Architectural Decisions

### Decision Priority Analysis

**Critical Decisions (Block Implementation):**
- Crawl state tracking strategy — required for FR7, FR8, NFR5 before any crawl code is written
- Metadata schema implementation — defines the data contract all modules share
- Async concurrency model — determines how the core crawl engine is structured

**Important Decisions (Shape Architecture):**
- Config parsing & validation — determines how source configs are consumed by all modules
- Logging strategy — must be established before any module emits output

**Deferred Decisions (Post-Phase 1):**
- All database, frontend, auth, and API decisions — explicitly out of scope for Phase 1

### Data Architecture

**Crawl State Tracking — `data/crawl-state.json` manifest (Option B)**

Decision: Maintain a persistent `data/crawl-state.json` file tracking `{url: status}` where status is one of `downloaded`, `skipped`, `error`.

Rationale: Filesystem-only checks cannot distinguish a complete download from a partial/corrupt one. The state manifest is also the natural home for FR6 (per-URL status logging) and NFR5 (resumable crawl). A single JSON dict keyed by URL is trivially readable and writable in Python with no library overhead.

Structure:
```json
{
  "https://thuvienhoasen.org/a1234": "downloaded",
  "https://thuvienhoasen.org/a5678": "error",
  "https://budsas.org/sutta/xyz":   "skipped"
}
```

Affects: crawler.py (write), indexer.py (read for consistency check)

**Metadata Schema — Pydantic v2 (Option C)**

Decision: Define the `.meta.json` schema as a Pydantic v2 `BaseModel`. Serialize to JSON via `model.model_dump_json()`.

Version: Pydantic 2.12.5

Rationale: This corpus grounds a future AI citation system — corrupt or missing metadata propagates silently under plain-dict approaches. Pydantic v2 provides runtime validation at ingest time, not at Phase 2 discovery time. It also auto-generates JSON schema for the schema validator (FR22) and gives full IDE autocomplete across all modules.

```python
class ScriptureMetadata(BaseModel):
    id: str
    title: str
    title_pali: str | None = None
    title_sanskrit: str | None = None
    category: Literal["Nikaya", "Đại Thừa", "Mật Tông", "Thiền", "Tịnh Độ"]
    subcategory: str
    source: str
    url: str
    author_translator: str | None = None
    file_path: str
    file_format: Literal["html", "pdf", "epub", "other"]
    copyright_status: Literal["public_domain", "unknown"]
    created_at: datetime
```

Affects: parser.py (create), indexer.py (read/validate), validate.py (schema check)

**Updated initialization command:**
```bash
uv add typer requests aiohttp beautifulsoup4 pyyaml pydantic
```

### API & Communication Patterns

**Async Concurrency — aiohttp + TCPConnector + asyncio.sleep (Option C)**

Decision: Use `aiohttp.ClientSession` with `aiohttp.TCPConnector(limit_per_host=N)` to cap concurrent connections per source. Rate limiting enforced via `asyncio.sleep(delay)` between requests, where `delay` is sourced from config per source.

Rationale: The requirement is a minimum 1–2s delay between requests — this is deliberate, slow, polite crawling, not high-frequency scraping. A token bucket adds complexity that buys nothing at this scale. `TCPConnector(limit_per_host=2)` prevents accidental burst; `asyncio.sleep` enforces the configured minimum delay. Both NFR12 (never exceed rate limit) and NFR1 (≥30 pages/min net of delays) are satisfied.

Pattern:
```python
async def crawl_source(source_config, session):
    for url in catalog_urls:
        if already_downloaded(url):
            continue
        await asyncio.sleep(source_config.rate_limit_seconds)
        response = await session.get(url)
        ...
```

Affects: crawler.py exclusively

### Infrastructure & Deployment

**Config Parsing — PyYAML + Pydantic v2 SourceConfig model (Option B)**

Decision: Load `config.yaml` with PyYAML, then validate through a Pydantic `SourceConfig` model. A top-level `CrawlerConfig` model holds a list of `SourceConfig` entries.

Rationale: Since Pydantic is already a project dependency (metadata schema), using it for config validation costs nothing. A malformed config.yaml (missing selectors, invalid rate limits) should fail loudly at startup, not silently mid-crawl. This is critical for NFR9 — adding a new source is a config-only change that must be validated before the run begins.

```python
class SourceConfig(BaseModel):
    name: str
    seed_url: str
    rate_limit_seconds: float = 1.5
    output_folder: str
    css_selectors: dict[str, str]
    file_type_hints: list[str] = []

class CrawlerConfig(BaseModel):
    sources: list[SourceConfig]
    output_dir: str = "data"
    log_file: str = "logs/crawl.log"
```

Affects: all modules (shared config loading utility)

**Logging — stdlib `logging` + `RotatingFileHandler`**

Decision: Use Python stdlib `logging` module configured with both a `StreamHandler` (console) and `RotatingFileHandler` (persistent log file). One shared logger setup in a `utils/logging.py` module imported by all CLI entries.

Rationale: No additional dependency. `RotatingFileHandler` prevents unbounded log growth across multiple crawl runs. Console output satisfies the "progress logged to console" requirement in Journey 1. File output satisfies FR6 (persistent log per URL).

Configuration:
```python
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(),
        RotatingFileHandler("logs/crawl.log", maxBytes=10_000_000, backupCount=3),
    ]
)
```

Affects: all modules

### Decision Impact Analysis

**Implementation Sequence:**
1. devbox + uv project initialization (foundation for all else)
2. `config.yaml` schema + Pydantic `CrawlerConfig`/`SourceConfig` models (shared contract)
3. `ScriptureMetadata` Pydantic model (shared data contract)
4. Deterministic ID generation utility (shared, tested first)
5. Crawl state manager (`crawl-state.json` read/write utility)
6. `crawler.py` — robots.txt check → catalog crawl → async file download → state update
7. `parser.py` — metadata extraction → `ScriptureMetadata` → `.meta.json` write
8. `indexer.py` — scan `.meta.json` files → build/update `data/index.json`
9. `validate.py` — schema validation + run summary report

**Cross-Component Dependencies:**
- Pydantic models are the shared contract between parser.py → indexer.py → validate.py
- `crawl-state.json` is written by crawler.py and read by indexer.py for consistency checks
- `config.yaml` / `CrawlerConfig` is loaded by every module independently
- Deterministic ID (`source_slug + title_slug`) must produce identical values in both parser.py and indexer.py — shared utility function, not duplicated logic
- `data/index.json` schema is the Phase 2 handoff contract — frozen after Phase 1 complete

## Implementation Patterns & Consistency Rules

### Critical Conflict Points Identified

8 areas where AI agents could make different choices without explicit rules:
ID generation, Vietnamese slug handling, JSON field formats, shared module
locations, error handling granularity, robots.txt caching, null handling,
and content hash algorithm.

### Naming Patterns

**Python Code Naming — snake_case everywhere:**
- Functions: `generate_id()`, `extract_metadata()`, `update_index()`
- Variables: `source_config`, `file_path`, `crawl_state`
- Files/modules: `crawler.py`, `parser.py`, `utils/slugify.py`
- Classes: PascalCase — `ScriptureMetadata`, `SourceConfig`, `CrawlState`
- Constants: UPPER_SNAKE — `DEFAULT_RATE_LIMIT`, `INDEX_FILE`
- Anti-pattern: `crawlState`, `extractMetaData`, `updateIndex` ❌

**JSON Field Naming — snake_case for all .meta.json and index.json fields:**
- `file_path`, `author_translator`, `copyright_status`, `created_at`
- Anti-pattern: `filePath`, `authorTranslator` ❌
- Rationale: Consistency with Python model field names; no translation layer needed

**Deterministic ID Format:**
```
{source_slug}__{title_slug}
```
- Example: `thuvienhoasen__kinh-tam-kinh`
- `source_slug`: lowercase, ASCII, hyphens (from config `name` field)
- `title_slug`: lowercase, Vietnamese diacritics stripped to ASCII, hyphens
- Double underscore separator to distinguish source from title parts
- Shared utility: `utils/slugify.py::make_id(source, title) -> str`
- Anti-pattern: each module implementing its own slug logic ❌

**File Naming for Downloads:**
- Prefer original filename from URL if clean (no query strings, no hash)
- Otherwise: `{title_slug}.{extension}` derived from title
- Example: `kinh-tam-kinh.html`, `truong-bo-kinh-01.pdf`
- Anti-pattern: `file_1234.html`, `download_abc.pdf` ❌

### Structure Patterns

**Shared Utilities Location — `utils/` package:**
```
utils/
├── __init__.py
├── slugify.py      # make_id(), slugify_title() — shared by parser + indexer
├── config.py       # load_config() -> CrawlerConfig — shared by all modules
├── logging.py      # setup_logger() — shared by all modules
└── state.py        # CrawlState read/write — shared by crawler + indexer
```
- Rule: Any function used by more than one module goes in `utils/`
- Anti-pattern: Copying slug logic into both parser.py and indexer.py ❌

**Pydantic Models Location — `models.py` (top-level):**
- All modules import from `models.py` — never redefine schemas inline
- Anti-pattern: Defining a dict schema in parser.py and a different TypedDict in indexer.py ❌

**Test File Naming — `tests/test_{module}.py`:**
- `tests/test_slugify.py` — tests `utils/slugify.py`
- `tests/test_metadata_schema.py` — tests `models.py` validation
- `tests/test_state.py` — tests `utils/state.py`
- Anti-pattern: `slugify_test.py`, `TestSlugify.py` ❌

### Format Patterns

**Date/Time in JSON — ISO 8601 UTC string:**
- `"created_at": "2026-02-27T10:30:00Z"`
- Always UTC, always include seconds, always `Z` suffix
- In Python: `datetime.now(UTC).isoformat(timespec="seconds").replace("+00:00", "Z")`
- Anti-pattern: Unix timestamp `1709029800`, or local time without timezone ❌

**Null Handling in .meta.json — explicit `null`, never omit optional fields:**
- `"title_pali": null` ✅
- Omitting the key entirely ❌
- Rationale: Downstream Phase 2 can iterate known fields without key-existence checks

**Content Hash Algorithm — SHA-256, hex digest, lowercase:**
- `hashlib.sha256(file_bytes).hexdigest()`
- Stored in crawl-state.json and used for dedup comparison
- Anti-pattern: MD5, sha1, base64-encoded hash ❌

**Log Message Format:**
```
2026-02-27T10:30:00Z [INFO]  [crawler] Downloaded: https://...
2026-02-27T10:30:01Z [WARN]  [crawler] robots.txt blocked: https://...
2026-02-27T10:30:02Z [ERROR] [crawler] HTTP 503: https://... — skipping
```
- Format: `{timestamp} [{LEVEL}] [{module}] {message}`
- Module tag: `crawler`, `parser`, `indexer`, `validate`
- Anti-pattern: Bare `print()` statements, inconsistent format between modules ❌

### Process Patterns

**Error Handling Granularity — per-URL, never per-run:**
- Each URL failure is caught, logged, and recorded as `error` in crawl-state.json
- The run NEVER crashes due to a single URL failure (NFR3)
- Pattern:
```python
try:
    result = await fetch(url)
    state.mark_downloaded(url)
except Exception as e:
    logger.error(f"[crawler] Failed {url}: {e}")
    state.mark_error(url)
    continue  # next URL
```
- Anti-pattern: Bare `raise` that propagates to top level, `except: pass` swallowing errors ❌

**Robots.txt Check — cached per session, per source domain:**
- Parse and cache `RobotFileParser` once per source at session start
- Check before every URL: `robots.can_fetch(USER_AGENT, url)`
- USER_AGENT constant: `"MonkaiCrawler/1.0"` — consistent across all sessions
- Anti-pattern: Re-fetching robots.txt for every URL, or skipping the check ❌

**Incremental Skip Logic — check crawl-state.json first, filesystem second:**
```python
if state.is_downloaded(url):
    logger.info(f"[crawler] Skip (state): {url}")
    continue
if file_exists_and_nonempty(expected_path):
    state.mark_downloaded(url)  # repair state if file exists but not tracked
    continue
```
- Anti-pattern: Checking filesystem without updating state ❌

**Config Access — always via loaded CrawlerConfig model, never raw dict:**
```python
config = load_config("config.yaml")  # returns CrawlerConfig
for source in config.sources:
    delay = source.rate_limit_seconds  # typed access
```
- Anti-pattern: `config["sources"][0]["rate_limit_seconds"]` ❌

### Enforcement Guidelines

**All AI Agents MUST:**
- Import `ScriptureMetadata` and `CrawlerConfig` from `models.py` — never redefine
- Import `make_id()` from `utils/slugify.py` — never inline slug logic
- Import `setup_logger()` from `utils/logging.py` — never call `logging.basicConfig()` in modules
- Use `utils/state.py` for all crawl-state.json reads/writes — never write directly
- Use `null` for missing optional metadata fields — never omit them

### Anti-Pattern Reference

| Anti-Pattern | Correct Pattern |
|---|---|
| Slug logic duplicated in parser.py and indexer.py | `utils/slugify.py::make_id()` imported by both |
| `"created_at": 1709029800` | `"created_at": "2026-02-27T10:30:00Z"` |
| Omitting `"title_pali"` when None | `"title_pali": null` |
| `hashlib.md5(...)` for dedup | `hashlib.sha256(...)` |
| `except: pass` on fetch error | Log + `state.mark_error(url)` + `continue` |
| `config["sources"][0]["name"]` | `config.sources[0].name` |
| `print(f"Downloaded {url}")` | `logger.info(f"[crawler] Downloaded: {url}")` |

## Project Structure & Boundaries

### Complete Project Directory Structure

```
monkai/
├── devbox.json                      # devbox env: python@3.11, uv; scripts: crawl/parse/index/validate/test/lint
├── pyproject.toml                   # uv project: all deps incl. typer, pydantic, aiohttp, bs4, pytest, ruff
├── .python-version                  # pinned: 3.11
├── .gitignore                       # data/raw/, data/crawl-state.json, logs/, .venv/
├── README.md
│
├── config.yaml                      # per-source config: seed_url, rate_limit_seconds, css_selectors,
│                                    # output_folder, file_type_hints; global: output_dir, log_file
│
├── models.py                        # ALL Pydantic models — single source of truth for data contracts:
│                                    # ScriptureMetadata, IndexRecord, SourceConfig, CrawlerConfig
│
├── crawler.py                       # FR1–FR8 — Typer CLI entry point
│                                    # Commands: crawl [--source all|<name>] [--config config.yaml]
│                                    # Responsibilities: robots.txt check, catalog crawl, async file
│                                    # download, rate limiting, crawl-state.json updates, run log
│
├── parser.py                        # FR12–FR17 — Typer CLI entry point
│                                    # Commands: parse [--source all|<name>] [--config config.yaml]
│                                    # Responsibilities: read raw files, extract metadata via CSS
│                                    # selectors, build ScriptureMetadata, write .meta.json per file
│
├── indexer.py                       # FR18–FR20 — Typer CLI entry point
│                                    # Commands: index [--source all|<name>] [--config config.yaml]
│                                    # Responsibilities: scan .meta.json files, build IndexRecord list,
│                                    # write/update data/index.json, verify disk consistency
│
├── validate.py                      # FR21–FR23 — Typer CLI entry point
│                                    # Commands: validate [--config config.yaml]
│                                    # Responsibilities: schema validation of all .meta.json,
│                                    # dedup check, run summary report (records/skipped/errors/dupes)
│
├── utils/
│   ├── __init__.py
│   ├── config.py                    # load_config(path) -> CrawlerConfig; fails loudly on invalid YAML
│   ├── logging.py                   # setup_logger(module_name) -> Logger; RotatingFileHandler + StreamHandler
│   ├── slugify.py                   # make_id(source, title) -> str; slugify_title(title) -> str
│   │                                # strips Vietnamese diacritics (unicodedata.normalize NFKD)
│   ├── state.py                     # CrawlState class: load/save crawl-state.json, is_downloaded(),
│   │                                # mark_downloaded(), mark_error(), mark_skipped()
│   ├── robots.py                    # RobotsCache: fetch + cache RobotFileParser per domain;
│   │                                # robots_allowed(cache, url) -> bool; USER_AGENT = "MonkaiCrawler/1.0"
│   └── dedup.py                     # sha256_hash(file_bytes) -> str; is_duplicate(hash, seen_hashes) -> bool
│
├── data/
│   ├── raw/                         # FR9 — organized by source/category
│   │   ├── thuvienhoasen/
│   │   │   ├── nikaya/
│   │   │   ├── dai-thua/
│   │   │   ├── thien/
│   │   │   └── mat-tong/
│   │   ├── budsas/
│   │   │   └── nikaya/
│   │   ├── chuabaphung/
│   │   │   └── kinh-tung/
│   │   └── dhammadownload/
│   │       └── tipitaka/
│   │           (each file: <slug>.html / .pdf / .epub + <slug>.meta.json)
│   │
│   ├── index.json                   # FR18 — flat IndexRecord array; Phase 2 handoff contract
│   └── crawl-state.json             # FR7/FR8 — {url: "downloaded"|"error"|"skipped"}
│
├── logs/
│   └── crawl.log                    # FR6 — RotatingFileHandler; 10MB max, 3 backups
│
└── tests/
    ├── conftest.py                  # shared fixtures: sample ScriptureMetadata, mock SourceConfig
    ├── test_slugify.py              # make_id() determinism, Vietnamese diacritic stripping, edge cases
    ├── test_metadata_schema.py      # ScriptureMetadata: required fields, optional nulls, enum validation
    ├── test_dedup.py                # sha256_hash() stability, is_duplicate() with known hashes
    ├── test_robots.py               # robots_allowed() with mocked responses: allow/disallow/wildcard
    └── test_incremental.py          # is_downloaded() for known URL; filesystem fallback repairs state
```

### Architectural Boundaries

**Module Responsibilities (no overlap):**

| Module | Reads | Writes |
|---|---|---|
| `crawler.py` | `config.yaml`, `crawl-state.json` | `data/raw/<files>`, `crawl-state.json`, `logs/crawl.log` |
| `parser.py` | `config.yaml`, `data/raw/<files>` | `data/raw/**/*.meta.json` |
| `indexer.py` | `config.yaml`, `data/raw/**/*.meta.json`, `crawl-state.json` | `data/index.json` |
| `validate.py` | `config.yaml`, `data/raw/**/*.meta.json`, `data/index.json` | stdout report only |

**Boundary rule:** No module writes to another module's primary output.

**Data Flow (pipeline sequence):**
```
config.yaml
    ↓
crawler.py ──→ data/raw/<source>/<category>/<file> + crawl-state.json + logs/crawl.log
    ↓
parser.py  ──→ data/raw/**/*.meta.json
    ↓
indexer.py ──→ data/index.json
    ↓
validate.py → run summary report (stdout)
```

**External Integrations (outbound only):**
- 4 target domains: thuvienhoasen.org, budsas.org, chuabaphung.vn, dhammadownload.com
- Each domain's `/robots.txt` endpoint — fetched once per session, cached in `RobotsCache`
- No inbound integrations; no auth; no external APIs

**Phase 2 Handoff Contract (frozen after Phase 1):**
```json
{
  "id": "thuvienhoasen__kinh-tam-kinh",
  "title": "Tâm Kinh",
  "category": "Đại Thừa",
  "subcategory": "Bát Nhã",
  "source": "thuvienhoasen",
  "url": "https://thuvienhoasen.org/...",
  "file_path": "data/raw/thuvienhoasen/dai-thua/tam-kinh.html",
  "file_format": "html",
  "copyright_status": "public_domain"
}
```

### Requirements to Structure Mapping

| FR Category | Primary File(s) | Supporting Utils |
|---|---|---|
| Source Crawling (FR1–FR8) | `crawler.py` | `utils/robots.py`, `utils/state.py`, `utils/config.py` |
| File Storage (FR9–FR11) | `crawler.py` → `data/raw/` | `utils/slugify.py` (filename generation) |
| Metadata Extraction (FR12–FR17) | `parser.py` | `models.py` (ScriptureMetadata), `utils/slugify.py` (make_id) |
| Index Management (FR18–FR20) | `indexer.py` | `models.py` (IndexRecord), `utils/state.py` (consistency) |
| Data Quality (FR21–FR23) | `validate.py` | `utils/dedup.py`, `models.py` (schema validation) |
| Operational (FR24–FR26) | All 4 CLIs (Typer) | `config.yaml`, `utils/config.py` |

**Cross-Cutting Concerns to Location:**

| Concern | Location |
|---|---|
| Rate limiting | `crawler.py` — `asyncio.sleep(source.rate_limit_seconds)` |
| robots.txt compliance | `utils/robots.py` — `RobotsCache`, imported by `crawler.py` |
| Error handling / logging | `utils/logging.py` — `setup_logger()`, used by all modules |
| Idempotency / resume | `utils/state.py` — `CrawlState`, used by `crawler.py` + `indexer.py` |
| UTF-8 / encoding | `parser.py` — enforced at metadata write; `models.py` — all `str` fields |
| Content deduplication | `utils/dedup.py` — `sha256_hash()`, used by `crawler.py` at download |
| Deterministic ID | `utils/slugify.py` — `make_id()`, used by `parser.py` + `indexer.py` |
| Phase 2 contract | `models.py::IndexRecord` + `data/index.json` — owned by `indexer.py` |

### Development Workflow

**Full pipeline end-to-end (FR26):**
```bash
devbox run crawl    # crawl all sources
devbox run parse    # extract metadata
devbox run index    # build index.json
devbox run validate # quality check + summary
```

**Single source:**
```bash
uv run python crawler.py --source thuvienhoasen
```

**Quality gates:**
```bash
devbox run test     # pytest — 5 core test files
devbox run lint     # ruff check
devbox run format   # ruff format
```

## Architecture Validation Results

### Coherence Validation ✅

**Decision Compatibility:**
All technology versions are mutually compatible — Typer 0.24.0, Pydantic 2.12.5, aiohttp, BeautifulSoup4, pytest 9.0.2, ruff 0.15.1 all require Python ≥3.10, and we target 3.11. devbox + uv have no conflicts. Pydantic v2 is used consistently for both metadata schemas and config validation — one pattern, zero translation overhead.

**Pattern Consistency:**
snake_case is used uniformly in Python code and JSON field names — no camelCase translation layer at any boundary. All shared utilities live in `utils/`, all Pydantic models in `models.py` — no duplication risk. The `make_id()` function in `utils/slugify.py` is the single implementation of ID generation, imported by both `parser.py` and `indexer.py`.

**Structure Alignment:**
The project structure directly reflects the pipeline sequence: `crawler.py` → `parser.py` → `indexer.py` → `validate.py`. Module boundaries are clean with no circular writes. `utils/` correctly hosts all cross-cutting logic. `tests/` maps 1:1 to the 5 critical test areas.

### Requirements Coverage Validation ✅

**Functional Requirements — all 26 covered:**

| FRs | Coverage |
|---|---|
| FR1–FR8 (Source Crawling) | `crawler.py` + `utils/robots.py` + `utils/state.py` + Typer CLI |
| FR9–FR11 (File Storage) | `crawler.py` writes `data/raw/<source>/<category>/` raw bytes |
| FR12–FR17 (Metadata) | `parser.py` + `models.py::ScriptureMetadata` + `utils/slugify.py` |
| FR18–FR20 (Index) | `indexer.py` + `models.py::IndexRecord` + disk consistency check |
| FR21–FR23 (Data Quality) | `validate.py` + `utils/dedup.py` + Pydantic schema validation |
| FR24–FR26 (Operational) | Typer (--help auto-generated), `config.yaml`, devbox run scripts |

**Non-Functional Requirements — all 13 covered:**

| NFRs | Coverage |
|---|---|
| NFR1 (≥30 pages/min) | aiohttp async engine + `TCPConnector` |
| NFR2 (≤5s metadata extraction) | BS4 HTML parsing, no network I/O in `parser.py` |
| NFR3 (graceful error handling) | Per-URL try/except pattern in all modules |
| NFR4 (idempotency) | `make_id()` determinism + Pydantic validation + `CrawlState` |
| NFR5 (resumable) | `crawl-state.json` persisted; incremental skip logic |
| NFR6 (≥90% metadata) | Pydantic required vs optional field enforcement |
| NFR7 (UTF-8) | All Pydantic `str` fields; `.meta.json` written UTF-8 |
| NFR8 (<2% duplicates) | `utils/dedup.py` SHA-256 hash check at download |
| NFR9 (config-only new source) | `SourceConfig` Pydantic model — config drives everything |
| NFR10 (independent modules) | All 4 scripts are standalone Typer CLIs |
| NFR11 (inline docs) | Pattern rule established; enforced by ruff |
| NFR12 (rate limit enforced) | `asyncio.sleep(source.rate_limit_seconds)` — no bypass possible |
| NFR13 (robots.txt skip+warn) | `utils/robots.py` + `logger.warning()` on blocked URL |

### Gap Analysis Results

**Critical Gaps: None.**

**Important Gaps (surfaced for implementation agent awareness):**

1. **File format detection order** — Implementation agent must follow: (1) URL file extension, (2) HTTP `Content-Type` response header, (3) `file_type_hints` from config as fallback.

2. **HTML completeness check** — For HTML files, verify `file size > 0` AND presence of `</html>` closing tag before marking `downloaded` in state. Binary formats (PDF, EPUB) require only non-zero file size.

**Nice-to-Have (deferred, no blocker):**
- `pipeline.py` single-command orchestrator for true FR26 single-command execution
- `config.example.yaml` for onboarding documentation
- Retry logic with exponential backoff for transient HTTP errors (currently log-and-skip)
- Playwright/Selenium option for JavaScript-rendered sources (open PRD question)

### Architecture Completeness Checklist

**Requirements Analysis**
- [x] Project context thoroughly analyzed
- [x] Scale and complexity assessed (Medium)
- [x] Technical constraints identified (Python 3.11, no DB, no LLM)
- [x] Cross-cutting concerns mapped (8 concerns, all located)

**Architectural Decisions**
- [x] Critical decisions documented with versions (Pydantic 2.12.5, Typer 0.24.0, pytest 9.0.2, ruff 0.15.1)
- [x] Technology stack fully specified
- [x] Data architecture decided (crawl-state.json, Pydantic models, SHA-256 dedup)
- [x] Concurrency model decided (aiohttp + TCPConnector + asyncio.sleep)
- [x] Config validation decided (Pydantic SourceConfig/CrawlerConfig)
- [x] Logging decided (stdlib RotatingFileHandler)

**Implementation Patterns**
- [x] Naming conventions established (snake_case code + JSON, PascalCase classes)
- [x] Deterministic ID format specified (`{source}__{title}` double underscore)
- [x] Structure patterns defined (utils/, models.py, tests/)
- [x] Process patterns documented (per-URL error handling, robots.txt caching, incremental skip)
- [x] Anti-pattern reference table provided
- [x] Enforcement guidelines written (8 MUST rules)

**Project Structure**
- [x] Complete directory structure defined with file-level annotations
- [x] Module boundaries established (read/write ownership table)
- [x] Data flow documented (4-stage pipeline diagram)
- [x] Requirements-to-structure mapping complete (all 26 FRs mapped)
- [x] Phase 2 handoff contract frozen (IndexRecord schema)

### Architecture Readiness Assessment

**Overall Status: READY FOR IMPLEMENTATION**

**Confidence Level: High**

**Key Strengths:**
- Clean ETL pipeline with zero module boundary violations
- Pydantic v2 enforces the data contract at runtime — corrupted metadata is caught immediately, not silently propagated to Phase 2
- `crawl-state.json` gives the crawler full resumability and auditability in a single lightweight file
- `utils/` package eliminates all duplication risk for the 3 most conflict-prone functions (make_id, setup_logger, load_config)
- Config-driven source architecture means adding a 5th source requires zero code changes (NFR9 fully satisfied)

**Areas for Future Enhancement (Phase 2+):**
- `pipeline.py` orchestrator for true single-command execution
- Retry logic with exponential backoff for transient HTTP errors
- Playwright/Selenium option for JavaScript-rendered sources

### Implementation Handoff

**AI Agent Guidelines:**
- Follow all architectural decisions exactly as documented — no inline schema definitions, no duplicate utility functions
- Use `models.py` as the single import source for all data models
- Use `utils/slugify.py::make_id()` for every ID — never implement slug logic locally
- Implement file format detection in order: URL extension → Content-Type header → config hint
- Add `</html>` presence check for HTML completeness before marking downloaded
- Phase 2 handoff contract (`IndexRecord` schema and `data/index.json`) is frozen — do not modify

**First Implementation Priority:**
```bash
devbox init
devbox add python@3.11 uv
devbox shell
uv init .
uv add typer requests aiohttp beautifulsoup4 pyyaml pydantic
uv add --dev pytest ruff
```
Then: implement `models.py` and `utils/` package before any CLI module — shared contracts first.
