# Monkai — Smart Buddhist Scripture Library

> **Thư Viện Kinh Phật Thông Minh** — A multi-phase project to crawl, index, and serve Buddhist scriptures through an AI-powered interface.

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Project Status](#project-status)
- [Quick Start](#quick-start)
- [Installation](#installation)
- [Configuration](#configuration)
- [Data Models](#data-models)
- [Testing](#testing)
- [Roadmap](#roadmap)

## Overview

Monkai collects Buddhist scriptures from authoritative Vietnamese digital libraries, normalizes them into a structured corpus, and provides a foundation for an AI-powered chat interface.

**What you get:**

- A configuration-driven web crawler that respects `robots.txt` and rate limits
- Deterministic, deduplication-safe metadata extraction using Vietnamese-aware ID generation
- Incremental crawl state — interrupted runs resume where they left off
- A frozen `index.json` schema that serves as the handoff contract to the AI layer

**Supported scripture traditions:**

| Tradition | Vietnamese | Description |
|-----------|------------|-------------|
| Nikaya | Nguyên Thủy | Theravāda — Pali canon |
| Đại Thừa | Đại Thừa | Mahāyāna — East Asian Buddhism |
| Mật Tông | Mật Tông | Vajrayāna — Tantric Buddhism |
| Thiền | Thiền | Zen Buddhism |
| Tịnh Độ | Tịnh Độ | Pure Land Buddhism |

**Active sources:**

| Source | Type | URL | Status |
|--------|------|-----|--------|
| `vbeta` | API | `api.phapbao.org` | Enabled |
| `vnthuquan` | HTML | `vietnamthuquan.eu` | Enabled |
| `thuvienhoasen` | HTML | `thuvienhoasen.org` | Disabled (robots.txt) |
| `thuvienkinhphat` | HTML | `thuvienkinhphat.net` | Disabled |

## Architecture

```mermaid
flowchart TD
    Config[config.yaml\nSingle source of truth] --> Crawler
    Config --> VNTCrawler
    Crawler[crawler.py + api_adapter.py\nAsync HTTP + deduplication\nvbeta source] --> JsonFiles[data/book-data/vbeta/\nCanonical JSON]
    VNTCrawler[vnthuquan_crawler.py + vnthuquan_parser.py\nHTML scraper with chapter AJAX\nvnthuquan source] --> VNTFiles[data/book-data/vnthuquan/\nCanonical JSON]
    JsonFiles --> Indexer[indexer.py\nBuild index.json]
    VNTFiles --> Indexer
    Indexer --> IndexFile[data/books/index.json\nPhase 2 contract]
    IndexFile --> Validator[validate.py\nQuality gates]
    Validator -->|Pass| Phase2[Phase 2\nAI Chat Interface]
```

### VNThuQuan Crawler

`vnthuquan_crawler.py` is a dedicated HTML scraper for `vietnamthuquan.eu` with its own architecture:

- **`VnthuquanAdapter`** — async HTTP adapter with rate limiting, 4-attempt exponential backoff, and session health monitoring
- **`vnthuquan_parser.py`** — pure parsing functions (no I/O): `parse_listing_page`, `parse_book_detail`, `parse_chapter_response`
- **Chapter AJAX** — chapters fetched via `GET vietnamthuquan.eu/truyen/chuonghoi_moi.aspx?tid=…`
- **Output format** — `BookData` v2.0 JSON written to `data/book-data/vnthuquan/{category}/{book}/book.json`
- **Slug collision resolution** — if two books share a slug, `book_id` is appended automatically
- **State persistence** — uses the shared `CrawlState` for resumable crawls

### Key Design Principles

- **Single source of truth** — all sources and CSS selectors live in `config.yaml`; no code changes needed to add a new site
- **Deterministic IDs** — `{source_slug}__{title_slug}` generated via `make_id()`, stable across re-runs
- **Incremental and resumable** — crawl state persisted in `data/crawl-state.json`
- **Robot-compliant** — `robots.txt` fetched once per domain, cached in-memory
- **Idempotent** — re-running the same inputs produces identical outputs

## Project Status

| Component | Status |
|-----------|--------|
| Environment setup | ✅ Complete |
| Data models (Pydantic API mappings) | ✅ Complete |
| Utilities package | ✅ Complete |
| API Web crawler (`crawler.py`) | ✅ Complete |
| VNThuQuan HTML crawler (`vnthuquan_crawler.py`) | ✅ Complete |
| VNThuQuan parser (`vnthuquan_parser.py`) | ✅ Complete |
| 271 tests passing | ✅ Complete |
| Index builder (`indexer.py`) | ✅ Complete |
| Validation utility (`validate.py`) | ✅ Complete |
| Phase 2 — AI chat interface | 📋 Planned |
| Phase 3 — Advanced features | 📋 Planned |

## Quick Start

```bash
# 1. Clone and enter the project
git clone <repo-url> monkai
cd monkai

# 2. Start the Devbox environment (recommended)
devbox shell

# 3. Install dependencies
uv sync

# 4. Verify everything works
devbox run test

# 5. Run the vbeta API crawler
devbox run crawl

# Or run the VNThuQuan HTML crawler
devbox run crawl-vnthuquan
```

You'll see 271 tests passing.

## Installation

### Prerequisites

Choose one of the following setups:

**Option A: Devbox (recommended — fully reproducible)**

Install [Devbox](https://www.jetify.com/devbox), then:

```bash
devbox shell   # activates Python 3.11 + uv automatically
uv sync
```

**Option B: Python 3.11 + uv directly**

Install [uv](https://docs.astral.sh/uv/getting-started/installation/), then:

```bash
uv sync        # reads pyproject.toml, creates .venv, installs all deps
```

### Available Scripts

| Command | Description |
|---------|-------------|
| `devbox run test` | Run the full test suite with pytest |
| `devbox run crawl` | Run the vbeta API crawler |
| `devbox run crawl-vnthuquan` | Run the VNThuQuan HTML crawler |
| `devbox run parse` | Run the metadata parser |
| `devbox run index` | Build the index manifest |
| `devbox run build` | Build the e-book manifests and structures |
| `devbox run lint` | Lint with ruff |
| `devbox run format` | Format with ruff |

## Configuration

`config.yaml` is the single configuration file for all pipeline behaviour.

```yaml
output_dir: data          # Root directory for downloaded files
log_file: logs/crawl.log  # Rotating log file path

sources:
  - name: vbeta            # API source — phapbao.org Vietnamese Tripitaka
    source_type: api
    enabled: true
    ...

  - name: vnthuquan        # HTML source — vietnamthuquan.eu
    source_type: html
    enabled: true
    seed_url: "http://vietnamthuquan.eu/truyen/?tranghientai=1"
    rate_limit_seconds: 1.5
    ...
```

### Configured Sources

| Source | Type | Content | Notes |
|--------|------|---------|-------|
| `vbeta` | API (`api_adapter.py`) | Comprehensive digitized Vietnamese Tripitaka | Enabled |
| `vnthuquan` | HTML (`vnthuquan_crawler.py`) | Vietnamese literature and Buddhist texts from vietnamthuquan.eu | Enabled; dedicated crawler with chapter AJAX support |
| `thuvienhoasen` | HTML (`crawler.py`) | Extensive Mahāyāna and Theravāda collection | Disabled — blocked by robots.txt |
| `thuvienkinhphat` | HTML (`crawler.py`) | 2-level catalog with 950+ chapter URLs | Disabled |

## Data Models

All models are defined in `models.py` using Pydantic v2.

### ChapterBookData (Canonical Format)

The per-chapter data contract ingested to Disk:

```python
class ChapterBookData(BaseModel):
    meta: ChapterMeta = Field(..., alias="_meta")
    id: str                                 # e.g. "vbeta__1-kinh-pham-vong"
    chapter_id: int
    chapter_name: str
    chapter_seo_name: str
    chapter_view_count: int = 0
    page_count: int
    book: BookInfo
    pages: list[PageEntry]                  # array of HTML payloads
```

### IndexRecord

The frozen Phase 2 handoff contract written to `data/index.json`:

```python
class IndexRecord(BaseModel):
    id: str
    title: str
    category: Literal["Nikaya", "Đại Thừa", "Mật Tông", "Thiền", "Tịnh Độ"]
    subcategory: str
    source: str
    url: str
    file_path: str
    file_format: Literal["html", "pdf", "epub", "other"]
    copyright_status: Literal["public_domain", "unknown"]
```

## Project Structure

```text
apps/crawler/
├── config.yaml              # All source configuration
├── crawler.py               # Async web crawler CLI — vbeta + html sources
├── api_adapter.py           # vbeta API HTTP adapter
├── vnthuquan_crawler.py     # VNThuQuan HTML crawler + Typer CLI
├── vnthuquan_parser.py      # Pure HTML parsers for VNThuQuan (no I/O)
├── pipeline.py              # Pipeline orchestration
├── indexer.py               # Index building
├── validate.py              # Validation utility
├── models.py                # Pydantic data models (BookData, ChapterEntry, …)
├── utils/
│   ├── api_adapter.py       # vbeta API client
│   ├── config.py            # Load and validate config.yaml
│   ├── dedup.py             # SHA-256 duplicate detection
│   ├── logging.py           # Dual-output rotating logger
│   ├── robots.py            # robots.txt caching and compliance
│   ├── slugify.py           # Vietnamese ID generation
│   └── state.py             # Crawl state persistence
├── tests/                   # 271 tests across all modules
│   ├── test_crawler.py
│   ├── test_vnthuquan_crawler.py
│   ├── test_vnthuquan_parser.py
│   ├── test_vnthuquan_integration.py
│   └── ...
├── data/                    # Created on first crawl run
│   ├── book-data/
│   │   ├── vbeta/           # vbeta chapters: category/book/book.json
│   │   └── vnthuquan/       # VNThuQuan books: category/book/book.json
│   ├── crawl-state.json     # Per-URL download state (resumable)
│   └── books/index.json     # Flat manifest for Phase 2
└── logs/                    # Rotating log files
```

## Testing

Run the full test suite:

```bash
devbox run test
```

| Test File | What It Covers |
|-----------|----------------|
| `test_slugify.py` | Vietnamese diacritic stripping, deterministic ID generation |
| `test_metadata_schema.py` | Pydantic validation, enum constraints, JSON serialization |
| `test_dedup.py` | SHA-256 hashing, duplicate detection utilities |
| `test_robots.py` | robots.txt caching, allowed/disallowed URL checking |
| `test_incremental.py` | Crawl state persistence, resumable operations |
| `test_crawler.py` | CLI shell, config validation, robots.txt enforcement |
| `test_catalog_fetch.py` | Catalog fetch, URL extraction, pagination |
| `test_download.py` | Format detection, filename derivation, async download, rate limiting |
| `test_crawl_state_integration.py` | State tracking, incremental skip, KeyboardInterrupt handling |
| `test_deduplication.py` | Cross-source SHA-256 dedup, source config validation |
| `test_vnthuquan_parser.py` | Listing page parsing, book detail extraction, chapter AJAX parsing |
| `test_vnthuquan_crawler.py` | Session factory, rate limiting, retry/backoff, health monitoring |
| `test_vnthuquan_integration.py` | End-to-end crawl flow, `assemble_book_data`, `write_book_json` |
| `test_api_adapter.py` | vbeta API adapter, DTO mapping |
| `test_api_models.py` | vbeta API Pydantic models |
| `test_e2e_pipeline.py` | Full pipeline integration |
| `test_indexer.py` | Index manifest generation |

## Roadmap

### Phase 1 — Data Corpus (current)

Build a structured, validated corpus of Buddhist scriptures.

- [x] Utility modules and data models
- [x] Unit test coverage (271 tests)
- [x] API crawler for vbeta source (`crawler.py` + `api_adapter.py`)
- [x] HTML crawler for VNThuQuan source (`vnthuquan_crawler.py` + `vnthuquan_parser.py`)
- [x] Sources configured in `config.yaml`
- [x] Index builder generating `data/books/index.json`
- [x] Validation utility with strict Schema quality gate reporting

### Phase 2 — AI Chat Interface

Build an intelligent query interface over the corpus.

- Natural language scripture lookup using RAG
- Concept explanation with canonical citations
- Comparative analysis across traditions
- **Stack:** FastAPI · React 18 · Claude API · ChromaDB

### Phase 3 — Advanced Features

- User accounts, bookmarks, personal notes
- AI-generated learning pathways
- Community annotations
- Mobile PWA and public API
- Multi-language support

## Dependencies

| Package | Purpose |
|---------|---------|
| `aiohttp` | Async HTTP client for concurrent crawling |
| `beautifulsoup4` | HTML parsing and CSS selector extraction |
| `pydantic` | Data validation and schema enforcement |
| `pyyaml` | Configuration file parsing |
| `typer` | CLI framework |
| `pytest` | Test runner (dev) |
| `ruff` | Linter and formatter (dev) |
