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

## Architecture

```mermaid
flowchart TD
    Config[config.yaml\nSingle source of truth] --> Crawler
    Crawler[crawler.py\nAsync download + dedup] --> RawFiles[data/raw/\nHTML · PDF · EPUB]
    RawFiles --> Parser[parser.py\nMetadata extraction]
    Parser --> MetaJSON[*.meta.json\nScriptureMetadata]
    MetaJSON --> Indexer[indexer.py\nBuild index.json]
    Indexer --> IndexFile[data/index.json\nPhase 2 contract]
    IndexFile --> Validator[validate.py\nQuality gates]
    Validator -->|Pass| Phase2[Phase 2\nAI Chat Interface]
```

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
| Data models (Pydantic) | ✅ Complete |
| Utilities package | ✅ Complete |
| Unit tests (27 passing) | ✅ Complete |
| Web crawler (`crawler.py`) | ⏳ In progress |
| Metadata parser (`parser.py`) | ⏳ In progress |
| Index builder (`indexer.py`) | ⏳ In progress |
| Validation utility (`validate.py`) | ⏳ In progress |
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
```

You'll see 27 tests passing.

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
| `devbox run lint` | Lint with ruff |
| `devbox run format` | Format with ruff |

## Configuration

`config.yaml` is the single configuration file for all pipeline behaviour.

```yaml
output_dir: data          # Root directory for downloaded files
log_file: logs/crawl.log  # Rotating log file path

sources:
  - name: thuvienhoasen
    seed_url: https://thuvienhoasen.org/p16a0/kinh-dien
    rate_limit_seconds: 1.5        # Minimum 1.0 — enforced by the crawler
    output_folder: thuvienhoasen
    file_type_hints:
      - html
    css_selectors:
      catalog_links: "a.list-item-title"
      file_links: "a.download-link"
      title: "h1.entry-title"
      category: ".breadcrumb li:nth-child(2)"
      subcategory: ".breadcrumb li:last-child"
```

**To add a new source**, append a new entry to `sources` — no code changes needed.

### Planned Sources

| Source | Content |
|--------|---------|
| `thuvienhoasen.org` | Vietnamese triple canon (Kinh, Luật, Luận) |
| `budsas.org` | Pali Nikaya texts |
| `chuabaphung.vn` | Daily chanting scriptures |
| `dhammadownload.com` | Bilingual Pali texts |

## Data Models

All models are defined in `models.py` using Pydantic v2.

### ScriptureMetadata

The per-file metadata record written by `parser.py`:

```python
class ScriptureMetadata(BaseModel):
    id: str                    # "{source_slug}__{title_slug}"  e.g. "thuvienhoasen__tam-kinh"
    title: str                 # Original Vietnamese title
    title_pali: str | None     # Pali equivalent (null if unavailable)
    title_sanskrit: str | None # Sanskrit equivalent (null if unavailable)
    category: Literal["Nikaya", "Đại Thừa", "Mật Tông", "Thiền", "Tịnh Độ"]
    subcategory: str           # e.g. "Trường Bộ", "Bát Nhã"
    source: str                # e.g. "thuvienhoasen"
    url: str                   # Canonical source URL
    author_translator: str | None
    file_path: str             # Relative: "data/raw/source/cat/file.html"
    file_format: Literal["html", "pdf", "epub", "other"]
    copyright_status: Literal["public_domain", "unknown"]
    created_at: datetime       # ISO 8601 UTC, timezone-aware required
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
monkai/
├── config.yaml              # All source configuration
├── models.py                # Pydantic data models
├── pyproject.toml           # Project manifest and dependencies
├── utils/
│   ├── config.py            # Load and validate config.yaml
│   ├── dedup.py             # SHA-256 duplicate detection
│   ├── logging.py           # Dual-output rotating logger
│   ├── robots.py            # robots.txt caching and compliance
│   ├── slugify.py           # Vietnamese ID generation
│   └── state.py             # Crawl state persistence
├── tests/
│   ├── conftest.py
│   ├── test_dedup.py
│   ├── test_incremental.py
│   ├── test_metadata_schema.py
│   ├── test_robots.py
│   └── test_slugify.py
├── docs/
│   └── ke-hoach-thu-vien-kinh-phat.md   # Full project plan (Vietnamese)
├── data/                    # Created on first crawl run
│   ├── raw/                 # Downloaded files by source/category
│   ├── crawl-state.json     # Per-URL download state
│   └── index.json           # Flat manifest for Phase 2
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
| `test_dedup.py` | SHA-256 hashing, duplicate detection |
| `test_robots.py` | robots.txt caching, allowed/disallowed URL checking |
| `test_incremental.py` | Crawl state persistence, resumable operations |

## Roadmap

### Phase 1 — Data Corpus (current)

Build a structured, validated corpus of Buddhist scriptures.

- [x] Utility modules and data models
- [x] Unit test coverage
- [ ] Web crawler with async download and rate limiting
- [ ] Metadata parser with CSS selector extraction
- [ ] Index builder generating `data/index.json`
- [ ] Validation utility with quality gate reporting

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
