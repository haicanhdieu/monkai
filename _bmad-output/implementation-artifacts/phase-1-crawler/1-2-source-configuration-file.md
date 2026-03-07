# Story 1.2: Source Configuration File

Status: done

## Story

As a developer,
I want a validated `config.yaml` with thuvienhoasen.org configured as the first crawl source,
so that all pipeline modules are driven from a single configuration file with nothing hardcoded.

## Acceptance Criteria

1. **Given** `config.yaml` exists with thuvienhoasen.org configured
   **When** I call `load_config("config.yaml")` from `utils/config.py`
   **Then** a valid `CrawlerConfig` Pydantic model is returned with no validation errors
   **And** `config.sources[0].name` equals `"thuvienhoasen"`
   **And** `config.sources[0].rate_limit_seconds` is ≥ 1.0
   **And** `config.sources[0].css_selectors` contains at minimum keys `catalog_links` and `file_links`
   **And** `config.output_dir` defaults to `"data"` and `config.log_file` defaults to `"logs/crawl.log"`

2. **Given** `config.yaml` has a missing required field (e.g., `seed_url` removed)
   **When** I call `load_config("config.yaml")`
   **Then** a `pydantic.ValidationError` is raised immediately — fail-loud at startup, not silently mid-crawl
   **And** the error message identifies the missing field by name

## Tasks / Subtasks

- [x] Create/initialize `models.py` with config Pydantic models (AC: 1, 2)
  - [x] Create `SourceConfig(BaseModel)` with all fields and rate_limit_seconds validator
  - [x] Create `CrawlerConfig(BaseModel)` with sources list and defaults
  - [x] Add `@field_validator("rate_limit_seconds")` enforcing ≥ 1.0 on SourceConfig
- [x] Create `utils/config.py` with `load_config()` function (AC: 1, 2)
  - [x] Implement `load_config(path: str = "config.yaml") -> CrawlerConfig`
  - [x] Use `yaml.safe_load()` then `CrawlerConfig(**data)` — Pydantic raises ValidationError on bad config
- [x] Create `config.yaml` with thuvienhoasen.org as first source (AC: 1)
  - [x] Include all required SourceConfig fields
  - [x] Set rate_limit_seconds ≥ 1.5 (be conservative)
  - [x] Include css_selectors with at minimum `catalog_links` and `file_links` keys
  - [x] Include global `output_dir: data` and `log_file: logs/crawl.log`
- [x] Verify (AC: 1, 2)
  - [x] `python -c "from utils.config import load_config; c = load_config(); print(c.sources[0].name)"` → "thuvienhoasen" ✅
  - [x] Deliberately remove `seed_url` from config.yaml and verify ValidationError is raised ✅

## Dev Notes

### Dependency on Story 1.1

This story requires Story 1.1 complete: `devbox.json`, `pyproject.toml`, `utils/__init__.py` must exist.

### models.py: SourceConfig and CrawlerConfig

Create `models.py` in the project root. This story starts it with the config models. Story 1.3 will add `ScriptureMetadata` and `IndexRecord` to the same file.

**CRITICAL:** ALL Pydantic models for the entire project live in `models.py`. Never define schemas inline in any other file.

```python
# models.py
from __future__ import annotations
from pydantic import BaseModel, field_validator


class SourceConfig(BaseModel):
    name: str
    seed_url: str
    rate_limit_seconds: float = 1.5
    output_folder: str
    css_selectors: dict[str, str]
    file_type_hints: list[str] = []
    pagination_selector: str | None = None  # optional: CSS selector for "next page"

    @field_validator("rate_limit_seconds")
    @classmethod
    def enforce_minimum_rate_limit(cls, v: float) -> float:
        if v < 1.0:
            raise ValueError(
                f"rate_limit_seconds must be ≥ 1.0 for ethical crawling, got {v}"
            )
        return v


class CrawlerConfig(BaseModel):
    sources: list[SourceConfig]
    output_dir: str = "data"
    log_file: str = "logs/crawl.log"
```

**Pydantic v2 Notes:**
- Use `@field_validator` (not `@validator` from Pydantic v1) with `@classmethod`
- `str | None` union syntax works with Python 3.11 — no need for `Optional[str]`
- `list[SourceConfig]` and `dict[str, str]` as direct type hints — no `List[]` / `Dict[]` from typing

### utils/config.py: load_config()

```python
# utils/config.py
import yaml
from models import CrawlerConfig


def load_config(path: str = "config.yaml") -> CrawlerConfig:
    """Load and validate crawler configuration from YAML file.

    Raises pydantic.ValidationError if config is malformed.
    Raises FileNotFoundError if config file does not exist.
    """
    with open(path, encoding="utf-8") as f:
        data = yaml.safe_load(f)
    return CrawlerConfig(**data)
```

**Critical behavior:** `CrawlerConfig(**data)` triggers Pydantic validation immediately. A missing required field raises `pydantic.ValidationError` with a clear field-level error message. This is the intended fail-loud behavior — do NOT catch and swallow ValidationError here.

### config.yaml: Full Initial Structure

```yaml
# config.yaml — Monkai Crawler Configuration
# All pipeline modules read from this file via utils/config.py
# To add a new source: add a new entry to 'sources' — no code changes needed (NFR9)

output_dir: data
log_file: logs/crawl.log

sources:
  - name: thuvienhoasen
    seed_url: https://thuvienhoasen.org/p16a0/kinh-dien
    rate_limit_seconds: 1.5
    output_folder: thuvienhoasen
    file_type_hints:
      - html
    css_selectors:
      catalog_links: "a.list-item-title"      # selector for scripture page links on catalog
      file_links: "a.download-link"            # selector for file download links on scripture page
      title: "h1.entry-title"                  # selector for scripture title
      category: ".breadcrumb li:nth-child(2)"  # selector for tradition/category
      subcategory: ".breadcrumb li:last-child" # selector for subcategory
```

**Note on CSS selectors:** The above selectors are placeholders — the actual correct selectors for thuvienhoasen.org must be discovered by inspecting the live site HTML during Epic 2 implementation. The config structure and key names (`catalog_links`, `file_links`, `title`, `category`, `subcategory`) are fixed — only the selector values change. `catalog_links` and `file_links` are the minimum required keys (checked in AC 1).

### Architecture Compliance

- `load_config()` returns `CrawlerConfig` — all modules use typed attribute access: `config.sources[0].name` (NOT `config["sources"][0]["name"]`)
- `yaml.safe_load()` — always safe, never `yaml.load()` (security)
- Config is loaded once at module startup and passed as a parameter — modules do NOT re-read config.yaml during execution
- `utils/config.py` is the ONLY place `yaml.safe_load` is called — all other modules `from utils.config import load_config`

### Anti-Patterns

- ❌ `config["sources"][0]["rate_limit"]` — use typed Pydantic model attributes
- ❌ `yaml.load(f, Loader=yaml.Loader)` — always `yaml.safe_load()`
- ❌ Defining `SourceConfig` or `CrawlerConfig` inline in any module — only in `models.py`
- ❌ Hardcoding any seed URL, rate limit, or selector in Python code — all in config.yaml
- ❌ `try: load_config() except ValidationError: pass` — let it fail loudly

### Project Structure Notes

- `models.py` is at project root — not inside `utils/`
- `utils/config.py` imports from `models` (root-level) — this works because all scripts run from project root via `uv run python`
- `config.yaml` is at project root alongside `models.py`

### References

- [Source: _bmad-output/planning-artifacts/phase-1-crawler/architecture-phase1-crawler.md#Config Parsing — PyYAML + Pydantic v2 SourceConfig model]
- [Source: _bmad-output/planning-artifacts/phase-1-crawler/architecture-phase1-crawler.md#Pydantic Models Location]
- [Source: _bmad-output/planning-artifacts/phase-1-crawler/architecture-phase1-crawler.md#Config Access]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.2: Source Configuration File]
- [Source: _bmad-output/planning-artifacts/epics.md#Additional Requirements — Config Validation at Startup]
- [Source: _bmad-output/planning-artifacts/phase-1-crawler/prd-phase1-crawler.md#FR25]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- Created `models.py` at project root with `SourceConfig` (with rate_limit_seconds validator ≥ 1.0) and `CrawlerConfig` Pydantic v2 models
- Created `utils/config.py` with `load_config()` using `yaml.safe_load()` — raises ValidationError on bad config
- Created `config.yaml` with thuvienhoasen.org as first source (rate_limit_seconds=1.5, all required CSS selectors)
- AC1 verified: `load_config()` returns CrawlerConfig with sources[0].name="thuvienhoasen"
- AC2 verified: Removing seed_url raises pydantic.ValidationError identifying "seed_url" field

### File List

- models.py
- utils/config.py
- config.yaml
