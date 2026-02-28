# Story 3.1: Metadata Extractor — First Source (parser.py)

Status: done

## Story

As a developer,
I want `parser.py` to extract structured metadata from downloaded thuvienhoasen.org files and write validated `.meta.json` files,
so that each downloaded scripture has a machine-readable, schema-validated metadata record.

## Acceptance Criteria

1. **Given** `parser.py` exists as a Typer CLI and raw files from thuvienhoasen exist in `data/raw/thuvienhoasen/`
   **When** I run `uv run python parser.py --source thuvienhoasen`
   **Then** for each raw file (`.html`, `.pdf`, `.epub`), a `{filename}.meta.json` is written in the same directory
   **And** the `.meta.json` validates against `ScriptureMetadata` with no Pydantic errors
   **And** re-running parser.py skips files whose `.meta.json` already exists (idempotent — NFR4)

2. **Given** a thuvienhoasen HTML file is parsed
   **When** metadata is extracted using CSS selectors from config
   **Then** `id` is generated via `make_id(source.name, title)` — deterministic, same result every run
   **And** `title` is extracted via `css_selectors["title"]` (selector: `"h1.entry-title"`)
   **And** `category` is mapped from breadcrumb text to one of `["Nikaya", "Đại Thừa", "Mật Tông", "Thiền", "Tịnh Độ"]`
   **And** `subcategory` is extracted via `css_selectors["subcategory"]` (selector: `".breadcrumb li:last-child"`)
   **And** `created_at` is an ISO 8601 UTC string at parse time: `"2026-02-27T10:30:00Z"`
   **And** optional fields (`title_pali`, `title_sanskrit`, `author_translator`) are `null` when not found — never omitted
   **And** `copyright_status` is `"unknown"` for thuvienhoasen (modern Vietnamese translations)

3. **Given** parser.py completes a run for thuvienhoasen
   **When** I check the output
   **Then** metadata extraction for each file completes in ≤ 5 seconds per file (NFR2)
   **And** a summary is logged: `[INFO] [parser] Parsed {N} files, {M} errors for source thuvienhoasen`
   **And** all `.meta.json` files are valid UTF-8 with Vietnamese diacritics preserved (NFR7)

4. **Given** `parser.py --help` is run
   **When** the CLI displays help
   **Then** `--source` option is shown (values: all or source-name) and `--config` option defaulting to `config.yaml`

## Tasks / Subtasks

- [x] Create `parser.py` Typer CLI entry point (AC: 4)
  - [x] `app = typer.Typer()` with `@app.command()` — matches crawler.py CLI pattern
  - [x] `--source`: str option, default `"all"`
  - [x] `--config`: str option, default `"config.yaml"`
  - [x] Load config via `load_config(config)`, exit with clear error on malformed config
  - [x] Setup logger via `setup_logger("parser")`
  - [x] `if __name__ == "__main__": app()`
- [x] Implement `scan_raw_files(source_dir: Path) -> list[Path]` (AC: 1)
  - [x] Recursively glob `*.html`, `*.pdf`, `*.epub` under `source_dir`
  - [x] Exclude any filename ending in `.meta.json`
  - [x] Return sorted list for deterministic processing order
- [x] Implement `build_url_index(state_path: Path) -> dict[str, str]` (AC: 2)
  - [x] Load crawl-state.json as raw JSON dict (not via CrawlState — just `json.loads`)
  - [x] For each `{url: "downloaded"}` entry: extract URL path basename via `urlparse`
  - [x] Return `{basename: url}` — e.g., `{"tam-kinh.html": "https://thuvienhoasen.org/..."}`
  - [x] Return empty dict if state file doesn't exist
- [x] Implement `select_text(soup, selector: str) -> str | None` helper (AC: 2)
  - [x] Return `None` if selector is empty string
  - [x] `soup.select_one(selector)` → `.get_text(strip=True)` or `None` if no match
- [x] Implement `map_category(text: str) -> Literal[...]` (AC: 2)
  - [x] Normalize: `text.strip().lower()`
  - [x] Map known Vietnamese category strings to valid Literal (see Dev Notes)
  - [x] Default to `"Nikaya"` for unrecognized values + log warning
- [x] Implement `extract_metadata(file_path, url, source, logger) -> ScriptureMetadata | None` (AC: 2)
  - [x] For `.html`/`.htm`: open with `encoding="utf-8", errors="replace"`, parse via BeautifulSoup
  - [x] For `.pdf`/`.epub`: derive title from `file_path.stem`, skip HTML parsing
  - [x] Extract `title` via `select_text(soup, source.css_selectors.get("title", ""))`
  - [x] If title missing: use `file_path.stem` as fallback, log warning
  - [x] For HTML: also try `soup.find("link", rel="canonical")` for URL if url_index miss
  - [x] Extract `category` text → `map_category(text)`; default `"Nikaya"` if selector empty/no match
  - [x] Extract `subcategory` → strip; `""` if no match (empty string is valid)
  - [x] `id = make_id(source.name, title)` — import from `utils.slugify`
  - [x] `file_path_str = str(file_path)` — relative from project root
  - [x] `file_format` from extension: `.html`/`.htm` → `"html"`, `.pdf` → `"pdf"`, `.epub` → `"epub"`, else `"other"`
  - [x] `copyright_status = "unknown"` (thuvienhoasen — modern translations)
  - [x] `created_at = datetime.now(timezone.utc)`
  - [x] All optional fields (`title_pali`, `title_sanskrit`, `author_translator`) = `None`
  - [x] Instantiate `ScriptureMetadata(...)` — let Pydantic validate; return `None` on ValidationError
  - [x] Return `None` on any exception (never raise)
- [x] Implement `parse_source(source, cfg, logger)` orchestrator (AC: 1, 3)
  - [x] `source_dir = Path(cfg.output_dir) / "raw" / source.output_folder`
  - [x] `state_path = Path(cfg.output_dir) / "crawl-state.json"`
  - [x] Build `url_index = build_url_index(state_path)`
  - [x] `raw_files = scan_raw_files(source_dir)` → sorted list
  - [x] For each `file_path`:
    - [x] `meta_path = Path(str(file_path) + ".meta.json")`; skip if exists (idempotent)
    - [x] `url = url_index.get(file_path.name, source.seed_url)` — seed_url as fallback
    - [x] Call `extract_metadata(file_path, url, source, logger)`
    - [x] On success: `meta_path.write_text(metadata.model_dump_json(indent=2), encoding="utf-8")`; increment `parsed_count`
    - [x] On `None` return or exception: log error, increment `error_count`, `continue`
  - [x] Log: `[INFO] [parser] Parsed {parsed_count} files, {error_count} errors for source {source.name}`
- [x] Add `tests/test_parser.py` (AC: 1–4)
  - [x] Test `scan_raw_files()`: finds .html, .pdf, .epub; skips .meta.json (use `tmp_path`)
  - [x] Test `select_text()`: returns text on match, None on no match, None on empty selector
  - [x] Test `map_category()`: maps Vietnamese strings; defaults to "Nikaya" for unknown
  - [x] Test `extract_metadata()` with sample thuvienhoasen HTML — all fields populated
  - [x] Test `extract_metadata()` with malformed HTML — returns None, no exception raised
  - [x] Test idempotency: second `parse_source` run skips existing .meta.json files
  - [x] Test UTF-8 roundtrip: `json.loads(meta_path.read_text("utf-8"))["title"]` preserves Vietnamese chars
  - [x] Test `build_url_index()`: returns empty dict if state file absent

## Dev Notes

### New File: parser.py (at project root)

```python
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal
from urllib.parse import urlparse

import typer
from bs4 import BeautifulSoup

from models import CrawlerConfig, ScriptureMetadata, SourceConfig
from utils.config import load_config
from utils.logging import setup_logger
from utils.slugify import make_id

app = typer.Typer()

@app.command()
def parse(
    source: str = typer.Option("all", help="Source name or 'all'"),
    config: str = typer.Option("config.yaml", help="Config file path"),
) -> None:
    cfg = load_config(config)
    logger = setup_logger("parser")
    sources = cfg.sources if source == "all" else [s for s in cfg.sources if s.name == source]
    if not sources:
        logger.error(f"[parser] No source found: {source}")
        raise typer.Exit(1)
    for src in sources:
        parse_source(src, cfg, logger)

if __name__ == "__main__":
    app()
```

### URL Reverse Index

crawl-state.json format: `{"https://thuvienhoasen.org/a1234": "downloaded", ...}`.
Load directly as JSON (no CrawlState needed here — read-only access):

```python
def build_url_index(state_path: Path) -> dict[str, str]:
    if not state_path.exists():
        return {}
    state_data: dict[str, str] = json.loads(state_path.read_text(encoding="utf-8"))
    index: dict[str, str] = {}
    for url, status in state_data.items():
        if status == "downloaded":
            segment = Path(urlparse(url).path).name
            if segment:
                index[segment] = url
    return index
```

For HTML files not in the index (title_slug fallback filenames), also try canonical URL from HTML:
```python
canonical_tag = soup.find("link", rel="canonical")
if canonical_tag and canonical_tag.get("href"):
    url = canonical_tag["href"]
```

If still not found: `url = source.seed_url` (best-effort fallback; log a warning).

### Category Mapping

```python
CATEGORY_MAP: dict[str, str] = {
    "nikaya": "Nikaya",
    "kinh nikaya": "Nikaya",
    "đại thừa": "Đại Thừa",
    "dai thua": "Đại Thừa",
    "kinh đại thừa": "Đại Thừa",
    "mật tông": "Mật Tông",
    "mat tong": "Mật Tông",
    "thiền": "Thiền",
    "thien": "Thiền",
    "tịnh độ": "Tịnh Độ",
    "tinh do": "Tịnh Độ",
}

def map_category(text: str) -> Literal["Nikaya", "Đại Thừa", "Mật Tông", "Thiền", "Tịnh Độ"]:
    normalized = text.strip().lower()
    return CATEGORY_MAP.get(normalized, "Nikaya")  # type: ignore[return-value]
```

Default to `"Nikaya"` — the most common category at thuvienhoasen and safest fallback.

### file_format Detection (Extension-Based)

Do NOT re-import `detect_format` from crawler.py — use a simple local lookup:

```python
EXT_TO_FORMAT: dict[str, str] = {
    ".html": "html", ".htm": "html",
    ".pdf": "pdf",
    ".epub": "epub",
}
file_format = EXT_TO_FORMAT.get(file_path.suffix.lower(), "other")
```

### file_path Field

Store as a relative string from the project root — matches the format expected by indexer.py and validate.py:
- `"data/raw/thuvienhoasen/nikaya/kinh-tam-kinh.html"` ✅
- `/Users/.../data/raw/...` ❌

`str(file_path)` works correctly when parser.py is run from project root via `uv run`.

### Idempotency

```python
meta_path = Path(str(file_path) + ".meta.json")
if meta_path.exists():
    logger.debug(f"[parser] Skip (exists): {file_path}")
    continue
```

This satisfies NFR4 — re-running never overwrites valid `.meta.json` files.

### created_at Serialization

```python
created_at = datetime.now(timezone.utc)
# ScriptureMetadata.enforce_utc validator requires tzinfo — timezone.utc satisfies this
# model_dump_json() serializes datetime with tzinfo as ISO 8601 UTC
```

Verify serialization produces `"2026-02-27T10:30:00Z"` format — the Pydantic default for UTC datetimes.

### BeautifulSoup Dependency

`beautifulsoup4` (bs4) is already installed — it's a dependency from Epic 2 (crawler.py uses it for HTML parsing). No new dependency needed.

### Per-File Error Handling

```python
for file_path in raw_files:
    try:
        # ... process ...
    except Exception as e:
        logger.error(f"[parser] Extraction failed: {file_path} — {e}")
        error_count += 1
        continue  # NEVER crash the full run (NFR3 pattern)
```

### config.yaml CSS Selectors for thuvienhoasen (already configured)

```yaml
css_selectors:
  catalog_links: "a.list-item-title"
  file_links: "a.download-link"
  title: "h1.entry-title"
  category: ".breadcrumb li:nth-child(2)"
  subcategory: ".breadcrumb li:last-child"
```

Parser uses `title`, `category`, `subcategory` selectors. `catalog_links` and `file_links` are crawler.py's concern — ignore them in parser.py.

### Project Structure Notes

- New files: `parser.py` (project root), `tests/test_parser.py`
- No changes to: `models.py`, `utils/`, `config.yaml`, `crawler.py`
- `BeautifulSoup` (bs4) already in dependencies — no `uv add` needed
- Run command: `uv run python parser.py --source thuvienhoasen` or `devbox run parse`
- `devbox.json` already has `"parse": "uv run python parser.py"` script from Epic 1 setup

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 3.1: Metadata Extractor — First Source (parser.py)]
- [Source: _bmad-output/planning-artifacts/phase-1-crawler/architecture-phase1-crawler.md#Data Architecture — Metadata Schema — Pydantic v2]
- [Source: _bmad-output/planning-artifacts/phase-1-crawler/architecture-phase1-crawler.md#Implementation Patterns — Naming Patterns]
- [Source: _bmad-output/planning-artifacts/phase-1-crawler/architecture-phase1-crawler.md#Project Structure — Module Responsibilities table]
- [Source: _bmad-output/planning-artifacts/epics.md#Additional Requirements — Deterministic ID Format]
- [Source: _bmad-output/planning-artifacts/epics.md#Additional Requirements — Null Handling]
- [Source: models.py#ScriptureMetadata]
- [Source: utils/slugify.py#make_id]
- [Source: config.yaml#sources.thuvienhoasen.css_selectors]
- [Source: _bmad-output/implementation-artifacts/2-5-content-deduplication-all-4-sources-configured.md#Dev Notes — seen_hashes Session Scope (pattern reference for session-scoped state)]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

Implementation went smoothly. select_text() uses soup.select_one() which handles compound CSS selectors ("h2, h3", "h1, h2, title") natively in BS4 — no special-casing needed.

### Completion Notes List

- Created `parser.py` with full Typer CLI, all helper functions, and parse_source orchestrator
- 29 tests added in `tests/test_parser.py` covering Stories 3.1 and 3.2 (combined)
- All 142 tests pass (113 original + 29 new); 0 regressions
- Linting: ruff check passes with 0 errors
- classify_copyright implemented alongside other helpers (satisfies Story 3.2 AC2)
- All source-specific behavior is config-driven; no source-name branches in extract_metadata()
- UTF-8 roundtrip verified: Vietnamese diacritics preserved through write → read

### File List

- `parser.py` (new)
- `tests/test_parser.py` (new)

### Change Log

- 2026-02-28: Implemented Stories 3.1 and 3.2 — parser.py created with full metadata extraction pipeline for all 4 sources, 29 tests added
- 2026-02-28: Code review — fixed L1 (dead code in scan_raw_files), L2 (skipped_count in summary), M4 (misleading error message in parse_source); added chuabaphung test (M2) and missing-category warning test (M3)
