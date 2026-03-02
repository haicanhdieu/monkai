---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8]
status: 'complete'
completedAt: '2026-03-01'
inputDocuments:
  - _bmad-output/planning-artifacts/phase-1-crawler/prd-vbeta-crawler.md
  - _bmad-output/planning-artifacts/epics.md
  - docs/ke-hoach-thu-vien-kinh-phat.md
  - _bmad-output/planning-artifacts/phase-1-crawler/architecture-phase1-crawler.md
workflowType: 'architecture'
project_name: 'monkai'
user_name: 'Minh'
date: '2026-03-01'
---

# Architecture Decision Document

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

## Project Context Analysis

### Requirements Overview

**Functional Requirements:**
- **Source Crawling (FR-V1, FR-V2):** Pivot to an API-first crawler targeting `api.phapbao.org`, completely removing legacy HTML scrapers.
- **Data Models (FR-V3):** Define new Pydantic models (Category, Book, Chapter, Page) mapping exactly to the incoming JSON structure.
- **Storage (FR-V4, FR-V5):** Transition from HTML storage to storing raw fetched JSON responses in `data/raw/vbeta` and processed data in `data/book-data`.
- **Configuration (FR-V6):** Simplify the system configuration, discarding complex selectors for a cleaner JSON-based strategy.

**Non-Functional Requirements:**
- **Reliability (NFR-V1, NFR-V2):** Graceful degradation on HTTP 4xx/5xx errors without crashing the pipeline. Retention of all Phase 1 reliability NFRs (e.g., resumable state).
- **Extensibility (NFR-V3):** The API adapter design must be generic enough to support new API sources solely through `config.yaml` additions.
- **Quality (NFR-V4):** Zero regressions on existing test suites.

**Scale & Complexity:**
- Primary domain: Data pipeline / ETL CLI tool
- Complexity level: Medium (Significant refactor of an existing tool from HTML scraping to API consumption)
- Estimated architectural components: 4 core modules (crawler extensions, api adapter, models, config validation)

### Technical Constraints & Dependencies

- **Language:** Python 3.11
- **Libraries:** Only existing dependencies (`aiohttp`, `pydantic` v2, `typer`). No new packages.
- **Data Format:** JSON exclusively.
- **Storage Strategy:** Filesystem-only. Existing path patterns (`data/raw/vbeta/{category}/`) are preserved.

### Cross-Cutting Concerns Identified

1. **Async Concurrency & Rate Limiting** — Adapting the existing `aiohttp` engine to manage API request limits smoothly.
2. **Idempotency & State Tracking** — Ensuring API fetches can be cleanly resumed if interrupted.
3. **Data Contract Stability** — Ensuring that the new Pydantic domain models effectively translate into the stable `data/index.json` schema needed for Phase 2.
4. **Generalization of Crawler** — Decoupling the crawler dispatch logic to seamlessly route to either HTML algorithms (if retained for other sources) or the new API adapter, driven strictly by `config.yaml`.

## Starter Template Evaluation

### Primary Technology Domain

Python CLI / ETL data pipeline. No framework-based project generator applies (unlike Next.js or NestJS starters). We compose from first principles using devbox + uv + Typer as the project foundation.

### Starter Options Considered

Given the specific constraints (no DB, no UI, async CLI execution), standard framework boilerplates (Django, FastAPI, etc.) introduce unnecessary overhead. The optimal "starter" is a minimal, composable environment managed by modern Python tooling.

### Selected Starter: Composed Python Project (devbox + uv + Typer)

**Rationale for Selection:**
The PRD specifies a standalone CLI pipeline. A cookiecutter or similar generator would add boilerplate not needed here. Direct composition gives cleaner control and ensures we only pull in exactly what we need for async HTTP fetching, HTML/JSON parsing, and CLI routing. This aligns perfectly with the completed Phase 1 architecture.

**Initialization Command:**

```bash
devbox init
devbox add python@3.11 uv
devbox shell
uv init .
uv add typer requests aiohttp beautifulsoup4 pyyaml pydantic
uv add --dev pytest ruff
```

**Architectural Decisions Provided by Starter:**

**Language & Runtime:**
Python 3.11 (managed reproducibly via devbox)

**Environment & Package Management:**
devbox + uv — devbox provides hermetic shell isolation; uv handles fast dependency resolution and virtualenv; `pyproject.toml` is the single source of truth for dependencies.

**CLI Framework:**
Typer — type-annotated CLI, auto-generates `--help`, supports subcommands naturally (`crawler.py --source all`, etc.).

**Testing Framework:**
pytest — minimal scope testing for core functions (deterministic ID generation, metadata schema validation, dedup hash logic).

**Code Organization:**
Flat, script-based entry points (`crawler.py`, `parser.py`, `indexer.py`, `validate.py`) with shared modules in a `utils/` package and shared data contracts in `models.py`.

**Development Experience:**
ruff — single tool replaces black + flake8 + isort for fast, unified linting and formatting. Run locally via devbox scripts.

**Note:** Project initialization using this command should be the first implementation story.

## Core Architectural Decisions

### Decision Priority Analysis

**Critical Decisions (Block Implementation):**
- Crawl State Persistence strategy (Flat JSON Manifest)
- Domain Schema Validation approach (Pydantic v2 Models)
- Async HTTP Concurrency model (aiohttp + TCPConnector + asyncio.sleep)

**Important Decisions (Shape Architecture):**
- General API Adapter configuration mapping

**Deferred Decisions (Post-MVP):**
- Complex retry flows with exponential backoff (starting with log-and-skip).

### Data Architecture

- **Decision: Crawl State Persistence** 
  - Choice: Flat JSON Manifest (`data/crawl-state.json`). 
  - Version: N/A - Native Python `json`
  - Rationale: Maintains 100% backward compatibility with the existing indexer and keeps the Phase 1 architecture intact without introducing SQL dependencies. Let's us track `{ "chapter_id": "downloaded" | "error" }`.
  - Affects: `crawler.py`, `indexer.py`

- **Decision: Domain Schema Validation** 
  - Choice: Pydantic v2 Models.
  - Version: Pydantic 2.12.5
  - Rationale: Enforces the data contract at runtime, catching any API structure changes from `api.phapbao.org` immediately. Ensures robust translation from API response to our domain models.
  - Affects: `models.py`, `utils/api_adapter.py`, `validate.py`

### API & Communication Patterns

- **Decision: Async HTTP Concurrency** 
  - Choice: aiohttp with TCPConnector limit + asyncio.sleep 
  - Version: aiohttp 3.13.3
  - Rationale: Satisfies NFR-1 (≥30 pages/min) while ensuring we don't accidentally DDoS the vbeta API by strictly controlling the connection pool and sleep intervals.
  - Affects: `crawler.py`, `utils/api_adapter.py`

### Decision Impact Analysis

**Implementation Sequence:**
1. devbox + uv project initialization (foundation)
2. `config.yaml` unified schema updates and Pydantic `CrawlerConfig`/`SourceConfig` model adjustments.
3. Define strict Schema Models (Category, Book, Chapter, Page) with Pydantic.
4. Crawl state manager updates (`crawl-state.json` read/write parity).
5. Build the API Adapter loop logic in `utils/api_adapter.py`.
6. Integrate API Adapter dispatch path into `crawler.py`.
7. Pipeline testing and validation ensuring `indexer.py` correctly handles new data schemas.

**Cross-Component Dependencies:**
- Pydantic models are the core shared contract enabling seamless translation between the new vbeta API adapter and the existing indexer pipeline.
- The state manager requires the API adapter to accurately surface successful vs. failed API calls to consistently manage resumable logic.

## Implementation Patterns & Consistency Rules

### Pattern Categories Defined

**Critical Conflict Points Identified:**
4 main areas where AI agents could make different choices resulting in pipeline failure.

### Naming Patterns

**Code Naming Conventions:**
- **Variables/Functions:** Strict `snake_case` (`fetch_chapter_content`, `api_base_url`).
- **Classes/Models:** Strict `PascalCase` (`VbetaApiAdapter`, `ChapterMetadata`).

**Data Format Rules:**
- **JSON Fields (Internal):** Strict `snake_case` enforced by Pydantic domain models.
- **API Mapping:** Incoming API fields (e.g., `htmlContent`) MUST be mapped at ingestion using Pydantic aliases `Field(alias="htmlContent")` to internal `snake_case` representations (`html_content`).

**ID Generation:** 
All identifiers must be generated using `utils/slugify.py::make_id()`. The pattern is `{source_slug}__{title_slug}` (e.g., `vbeta__tam-kinh`). No inline string formatting for IDs is permitted.

### Structure Patterns

**File Organization:**
- Global CLI entry points (`crawler.py`, `parser.py`, `indexer.py`) must remain clean dispatchers.
- All new source-specific network logic for vbeta MUST live in `utils/api_adapter.py`.
- Shared Pydantic data contracts MUST live only in `models.py`.

### Process Patterns

**Error Handling Patterns:**
- **Granularity:** Exceptions must be caught per-URL/per-item, never at the global loop level.
- **Protocol:** Log the error using the standard logger, mark the URL as `"error"` in `data/crawl-state.json`, and `continue` to the next item. The tool must never crash the run for a single asset failure.

**Loading State Management (Idempotency):**
- Agents must check `CrawlState.is_downloaded(url)` before making any network requests.
- Agents must wait `asyncio.sleep(source_config.rate_limit_seconds + random.uniform(0.1, 0.5))` *before* checking state/fetching next item to avoid strict cadence detection.

### Enforcement Guidelines

**All AI Agents MUST:**
- Map external camelCase/PascalCase API fields to internal snake_case via Pydantic.
- Catch HTTP exceptions gracefully and record them in the `crawl-state.json` manifest.
- Only construct deterministic IDs calling `utils/slugify.py`.

**Anti-Patterns (DO NOT DO THIS):**
- `except Exception: pass` (swallowing errors without logging)
- `f"{source}_{title}"` (inline manual ID generation)
- Implementing `aiohttp.ClientSession` directly inside `crawler.py` without using the dispatch pattern.

## Project Structure & Boundaries

### Complete Project Directory Structure

``` text
monkai/
├── devbox.json                      # devbox env: python@3.11, uv; scripts
├── pyproject.toml                   # uv project: all deps incl. typer, pydantic, aiohttp
├── .gitignore                       # data/raw/, data/crawl-state.json, logs/, .venv/
├── README.md
│
├── config.yaml                      # configuration (vbeta API endpoints & settings)
│
├── models.py                        # ALL Pydantic models (Category, Book, Chapter, SourceConfig)
│
├── crawler.py                       # CLI entry: FR-V1, FR-V2 (Dispatch to API Adapter)
├── parser.py                        # CLI entry: (Retained for pipeline continuity if needed)
├── indexer.py                       # CLI entry: Build index.json from fetched metadata
├── validate.py                      # CLI entry: Schema validation & run summary
│
├── utils/
│   ├── __init__.py
│   ├── api_adapter.py               # NEW: VbetaApiAdapter (fetch categories, books, chapters)
│   ├── config.py                    # load_config(path) -> CrawlerConfig
│   ├── logging.py                   # setup_logger(module_name)
│   ├── slugify.py                   # make_id(source, title) -> str
│   └── state.py                     # CrawlState class (manage crawl-state.json)
│
├── data/
│   ├── raw/                         # Raw fetch output (unmodified API payloads)
│   │   └── vbeta/
│   │       ├── categories.json      # Raw GET categories response
│   │       ├── books/
│   │       │   └── by_category_{cat_id}.json  # Raw book list per category
│   │       ├── toc/
│   │       │   └── book_{book_id}.json         # Raw TOC per book (POST response)
│   │       └── chapters/
│   │           └── {chapter_id}.json           # Raw chapter pages response
│   │
│   ├── book-data/                   # FR-V5 Canonical output (ChapterBookData schema)
│   │   └── vbeta/
│   │       └── {category_seo}/
│   │           └── {book_seo}/
│   │               └── {chapter_seo}.json
│   │
│   ├── index.json                   # Final flat manifest (Phase 2 handoff)
│   └── crawl-state.json             # Idempotency state {chapter_id: status}
│
├── logs/
│   └── crawl.log                    
│
└── tests/
    ├── conftest.py                  
    ├── test_api_adapter.py          # NEW: Mocked HTTP responses for vbeta API
    ├── test_slugify.py              
    ├── test_metadata_schema.py      
    └── test_state.py          
```

### Architectural Boundaries

**API Boundaries:**
- **External:** `utils/api_adapter.py` is the *only* module permitted to make HTTP calls to `api.phapbao.org`.
- **Internal Contract:** `utils/api_adapter.py` returns `models.py` Pydantic objects or saves directly to disk. `crawler.py` merely orchestrates it.

**Data Boundaries:**
- **Raw Data (`data/raw/vbeta/`):** Contains the exact, unmodified JSON payloads returned by the vbeta API for auditability.
- **Processed Data (`data/book-data/`):** Contains the standardized `.meta.json` files matching our system-wide schema, ready for indexing.

### Requirements to Structure Mapping

**Epic/Feature Mapping:**
- **Epic 7 - vbeta.vn API Crawler**
  - Core logic: `utils/api_adapter.py`
  - Data contracts: `models.py` (Category, Book, Chapter schemas)
  - CLI integration: `crawler.py`
  - Storage: `data/raw/vbeta/`

**Cross-Cutting Concerns:**
- **Idempotency & Resuming:** `utils/state.py` controls read/writes to `data/crawl-state.json`. `api_adapter.py` queries this before fetching.
- **Configuration:** `utils/config.py` loads `config.yaml` to feed `api_base_url` to the adapter.

### Integration Points

**Internal Communication:**
The pipeline relies on file-system handoffs. The Crawler (`crawler.py` -> `api_adapter.py`) writes to `data/raw/` and `data/book-data/`. The Indexer (`indexer.py`) reads from `data/book-data/` to produce `data/index.json`. 

**External Integrations:**
Integration with `https://api.phapbao.org` via standard HTTP GET requests returning JSON.

## Architecture Validation Results

### Coherence Validation ✅

**Decision Compatibility:**
The data extraction pipeline relies on standard Python async HTTP handling (`aiohttp`) layered with strict domain validation (`pydantic`). This is a proven, highly compatible combination for ETL tasks. 

**Pattern Consistency:**
The adapter pattern (`utils/api_adapter.py`) perfectly insulates the core CLI orchestration (`crawler.py`) from the specifics of the `api.phapbao.org` contract.

**Structure Alignment:**
The flat CLI script structure with encapsulated `utils/` and `data/` directories maintains the Phase 1 paradigm while organizing the new API-centric dependencies cleanly.

### Requirements Coverage Validation ✅

**Epic/Feature Coverage:**
Epic 7 (vbeta.vn API Crawler) is fully supported by the defined architecture. The network calls, data transformation, and flat-file persistence are all explicitly mapped.

**Functional Requirements Coverage:**
- FR-V1, FR-V2 (Fetching & Idempotency) -> Supported by `CrawlState` and `api_adapter`.
- FR-V3 (Error Handling) -> Supported by the per-URL try/except and logging patterns.
- FR-V4 (Schema Validation) -> Supported by Pydantic models.

**Non-Functional Requirements Coverage:**
- NFR-1 (Performance ≥30 pages/min) -> Addressed via `aiohttp` concurrency + semaphore.
- NFR-2 (Zero Regressions) -> Maintained by keeping the `indexer.py` read contract identical.

### Implementation Readiness Validation ✅

**Decision Completeness:**
All choices are documented with specific library versions (`aiohttp 3.13.3`, `pydantic 2.12.5`).

**Structure Completeness:**
The directory tree explicitly maps every required file for Phase 1 and the new vbeta pivot.

**Pattern Completeness:**
Strict naming conventions (`snake_case` models mapping from camelCase APIs) and ID generation rules (`utils/slugify.py`) are clearly defined to prevent agent drift.

### Gap Analysis Results

- **Important:** Add randomized jitter to the async sleep mechanism to prevent strict cadence triggering of WAFs. (Added to Implementation Patterns).

### Validation Issues Addressed

- **Resolution:** Updated the network delay implementation pattern to explicitly specify `asyncio.sleep(rate_limit + random_jitter)` to ensure more robust API interactions.

### Architecture Completeness Checklist

**✅ Requirements Analysis**
- [x] Project context thoroughly analyzed
- [x] Scale and complexity assessed
- [x] Technical constraints identified
- [x] Cross-cutting concerns mapped

**✅ Architectural Decisions**
- [x] Critical decisions documented with versions
- [x] Technology stack fully specified
- [x] Integration patterns defined
- [x] Performance considerations addressed

**✅ Implementation Patterns**
- [x] Naming conventions established
- [x] Structure patterns defined
- [x] Communication patterns specified
- [x] Process patterns documented

**✅ Project Structure**
- [x] Complete directory structure defined
- [x] Component boundaries established
- [x] Integration points mapped
- [x] Requirements to structure mapping complete

### Architecture Readiness Assessment

**Overall Status:** READY FOR IMPLEMENTATION
**Confidence Level:** High

**Key Strengths:**
- Strong data contract enforcement via Pydantic will catch upstream API changes immediately.
- Resilient state management supports safe interruption and resumption of long crawls.

**Areas for Future Enhancement:**
- If the target API introduces complex auth or pagination cursor changes, the `VbetaApiAdapter` may require a more robust state machine.

### Implementation Handoff

**AI Agent Guidelines:**
- Follow all architectural decisions exactly as documented.
- Map all external API fields to internal `snake_case` models using Pydantic aliases.
- Respect project boundaries: `crawler.py` orchestrates, `api_adapter.py` executes network logic.

**First Implementation Priority:**
Initialize the UV + Typer project foundation and define the Pydantic models (`models.py`) based on the API responses.

---

## vbeta API Schema Analysis & book-data Format

_This section documents the live API structure discovered at `api.phapbao.org`, the canonical `book-data` JSON format, and the Pydantic models that enforce the data contract during crawling._

### Confirmed API Endpoints

| Level | Endpoint | Method | Purpose |
|---|---|---|---|
| 1 – Categories | `/api/categories/get-selectlist-categories?hasAllOption=false` | GET | All 6 top-level categories |
| 2 – Books | `/api/search/get-books-selectlist-by-categoryId/{catId}` | GET | All books in a category |
| 3a – TOC | `/api/search/get-tableofcontents-by-bookId` | POST `{bookId}` | Book metadata + chapter list |
| 3b – Pages | `/api/search/get-pages-by-tableofcontentid/{chapterId}` | GET | Pages (htmlContent) per chapter |

**Traversal order:** Categories → Books → Table of Contents (chapters) → Pages

### API Response Shapes

**Level 1 – Categories**
```json
{
  "result": [
    { "extraData": 1, "value": 1, "label": "Kinh", "seoName": "kinh" },
    { "extraData": 1, "value": 2, "label": "Luật", "seoName": "luat" },
    { "extraData": 1, "value": 3, "label": "Luận", "seoName": "luan" },
    { "extraData": 1, "value": 4, "label": "Sách", "seoName": "sach" },
    { "extraData": 1, "value": 8, "label": "Linh Sơn Đại Tạng", "seoName": "linh-son-dai-tang" },
    { "extraData": 1, "value": 7, "label": "Tạp Chí", "seoName": "tap-chi" }
  ],
  "success": true,
  "errors": []
}
```

**Level 2 – Books per Category** (`catId=1` example)
```json
{
  "result": [
    { "value": 1, "label": "Kinh Trường Bộ 1", "seoName": null },
    { "value": 319, "label": "Kinh Trường Bộ 2", "seoName": null }
  ],
  "success": true
}
```
> Note: `seoName` is null at this level — full book metadata comes from Level 3a.

**Level 3a – Book Detail + TOC** (POST `{bookId: 1}`)
```json
{
  "result": {
    "id": 1,
    "name": "Kinh Trường Bộ 1",
    "seoName": "kinh-truong-bo-1",
    "coverImageUrl": "https://api.phapbao.org/uploads/kinhtruongbo_tap1.jpg",
    "categoryId": 1,
    "categoryName": "Kinh",
    "author": "Hòa thượng Thích Minh Châu dịch",
    "authorId": 1,
    "publisher": "Viện Nghiên Cứu Phật Học Việt Nam, TP. Hồ Chí Minh",
    "publicationYear": 1991,
    "tableOfContents": {
      "totalItems": 19,
      "items": [
        {
          "id": 12439,
          "name": "1. Kinh Phạm Võng",
          "seoName": "1-kinh-pham-vong",
          "viewCount": 0,
          "minPageNumber": 11,
          "maxPageNumber": 92
        }
      ]
    }
  }
}
```

**Level 3b – Chapter Pages** (`chapterId=12439`)
```json
{
  "result": {
    "id": 12439,
    "name": "1. Kinh Phạm Võng",
    "seoName": "1-kinh-pham-vong",
    "viewCount": 2889,
    "totalItems": 82,
    "book": {
      "id": 1,
      "name": "Kinh Trường Bộ 1",
      "seoName": "kinh-truong-bo-1",
      "coverImageUrl": "https://api.phapbao.org/uploads/kinhtruongbo_tap1.jpg",
      "categoryId": 1,
      "categoryName": "Kinh",
      "seoCategoryName": "kinh",
      "author": "Hòa thượng Thích Minh Châu dịch",
      "authorId": 1,
      "seoAuthorName": "hoa-thuong-thich-minh-chau-dich",
      "publisher": "Viện Nghiên Cứu Phật Học Việt Nam, TP. Hồ Chí Minh",
      "publicationYear": 1991
    },
    "pages": [
      { "sortNumber": 11, "pageNumber": 11, "htmlContent": "<div class=\"page-item\">..." }
    ]
  }
}
```

### book-data JSON Schema (Canonical Output)

**File path:** `data/book-data/vbeta/{category_seo_name}/{book_seo_name}/{chapter_seo_name}.json`

**Example:** `data/book-data/vbeta/kinh/kinh-truong-bo-1/1-kinh-pham-vong.json`

```json
{
  "_meta": {
    "source": "vbeta",
    "schema_version": "1.0",
    "fetched_at": "2026-03-01T15:04:05Z",
    "api_chapter_url": "https://api.phapbao.org/api/search/get-pages-by-tableofcontentid/12439"
  },
  "id": "vbeta__1-kinh-pham-vong",
  "chapter_id": 12439,
  "chapter_name": "1. Kinh Phạm Võng",
  "chapter_seo_name": "1-kinh-pham-vong",
  "chapter_view_count": 2889,
  "page_count": 82,
  "book": {
    "id": 1,
    "name": "Kinh Trường Bộ 1",
    "seo_name": "kinh-truong-bo-1",
    "cover_image_url": "https://api.phapbao.org/uploads/kinhtruongbo_tap1.jpg",
    "author": "Hòa thượng Thích Minh Châu dịch",
    "author_id": 1,
    "publisher": "Viện Nghiên Cứu Phật Học Việt Nam, TP. Hồ Chí Minh",
    "publication_year": 1991,
    "category_id": 1,
    "category_name": "Kinh",
    "category_seo_name": "kinh"
  },
  "pages": [
    {
      "page_number": 11,
      "sort_number": 11,
      "html_content": "<div class=\"page-item\">...</div>"
    }
  ]
}
```

### Pydantic Models (`models.py`)

```python
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


# ─── Raw API Ingestion Models ───────────────────────────────────────────

class ApiCategory(BaseModel):
    """GET /api/categories/get-selectlist-categories"""
    value: int                              # category ID
    label: str                              # e.g. "Kinh"
    seo_name: Optional[str] = Field(None, alias="seoName")
    model_config = {"populate_by_name": True}


class ApiBookSelectItem(BaseModel):
    """GET /api/search/get-books-selectlist-by-categoryId/{catId}"""
    value: int                              # book ID
    label: str
    seo_name: Optional[str] = Field(None, alias="seoName")
    model_config = {"populate_by_name": True}


class ApiTocItem(BaseModel):
    """POST get-tableofcontents-by-bookId -> result.tableOfContents.items[]"""
    id: int                                 # chapter / TOC ID → used to fetch pages
    name: str
    seo_name: str = Field(..., alias="seoName")
    view_count: int = Field(0, alias="viewCount")
    min_page_number: int = Field(0, alias="minPageNumber")
    max_page_number: int = Field(0, alias="maxPageNumber")
    model_config = {"populate_by_name": True}


class ApiBookDetail(BaseModel):
    """POST get-tableofcontents-by-bookId -> result"""
    id: int
    name: str
    seo_name: str = Field(..., alias="seoName")
    cover_image_url: Optional[str] = Field(None, alias="coverImageUrl")
    category_id: int = Field(..., alias="categoryId")
    category_name: str = Field(..., alias="categoryName")
    author: Optional[str] = None
    author_id: Optional[int] = Field(None, alias="authorId")
    publisher: Optional[str] = None
    publication_year: Optional[int] = Field(None, alias="publicationYear")
    model_config = {"populate_by_name": True}


class ApiPage(BaseModel):
    """GET get-pages-by-tableofcontentid/{id} -> result.pages[]"""
    page_number: int = Field(..., alias="pageNumber")
    sort_number: int = Field(..., alias="sortNumber")
    html_content: str = Field(..., alias="htmlContent")
    model_config = {"populate_by_name": True}


# ─── Domain Layer (book-data output format) ─────────────────────────────

class ChapterMeta(BaseModel):
    source: str = "vbeta"
    schema_version: str = "1.0"
    fetched_at: datetime
    api_chapter_url: str


class BookInfo(BaseModel):
    id: int
    name: str
    seo_name: str
    cover_image_url: Optional[str] = None
    author: Optional[str] = None
    author_id: Optional[int] = None
    publisher: Optional[str] = None
    publication_year: Optional[int] = None
    category_id: int
    category_name: str
    category_seo_name: str


class PageEntry(BaseModel):
    page_number: int
    sort_number: int
    html_content: str


class ChapterBookData(BaseModel):
    """
    Canonical output format. One file per chapter.
    Path: data/book-data/vbeta/{cat_seo}/{book_seo}/{chapter_seo}.json
    """
    meta: ChapterMeta = Field(..., alias="_meta")
    id: str                                 # e.g. "vbeta__1-kinh-pham-vong"
    chapter_id: int
    chapter_name: str
    chapter_seo_name: str
    chapter_view_count: int = 0
    page_count: int
    book: BookInfo
    pages: list[PageEntry]
    model_config = {"populate_by_name": True}
```

### Crawler Traversal Flow

```
1. GET /categories → save data/raw/vbeta/categories.json
   │
   └─ for each category:
      2. GET /get-books-selectlist-by-categoryId/{cat_id}
         │  → save data/raw/vbeta/books/by_category_{cat_id}.json
         │
         └─ for each book:
            3. POST /get-tableofcontents-by-bookId {bookId}
               │  → save data/raw/vbeta/toc/book_{book_id}.json
               │  → extract: book metadata + list of TOC items (chapters)
               │
               └─ for each TOC item (chapter):
                  4. GET /get-pages-by-tableofcontentid/{chapter_id}
                     │  → save data/raw/vbeta/chapters/{chapter_id}.json
                     │  → transform to ChapterBookData
                     └─ save data/book-data/vbeta/{cat_seo}/{book_seo}/{ch_seo}.json
```

### PRD Coverage Map

| Requirement | Field | API Level | Status |
|---|---|---|---|
| FR-V2: Fetch all categories | `book.category_name` / `category_id` | Level 1 | ✅ |
| FR-V2: Fetch all books | `book.name` / `book.id` | Level 2 | ✅ |
| FR-V2: Fetch all chapters | `chapter_name` / `chapter_id` | Level 3a (TOC) | ✅ |
| FR-V2: Fetch page content | `pages[].html_content` | Level 3b (pages) | ✅ |
| FR-V3: Pydantic models | All `ApiXxx` + `ChapterBookData` | `models.py` | ✅ |
| FR-V4: Save raw JSON | `data/raw/vbeta/` tree | Storage | ✅ |
| FR-V5: Save book-data | `data/book-data/vbeta/` | Storage | ✅ |
| Success: title | `chapter_name` | Level 3b | ✅ |
| Success: category | `book.category_name` | Level 3b | ✅ |
| Success: book_title | `book.name` | Level 3b | ✅ |
| Success: author | `book.author` | Level 3a | ✅ |
| Success: publisher | `book.publisher` | Level 3a | ✅ |
| Success: cover image | `book.cover_image_url` | Level 3a | ✅ |
