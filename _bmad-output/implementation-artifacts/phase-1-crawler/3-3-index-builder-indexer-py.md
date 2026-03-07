# Story 3.3: Index Builder (indexer.py)

Status: done

## Story

As a developer,
I want `indexer.py` to build and incrementally update `data/index.json` from all `.meta.json` files, verified for disk consistency,
so that Phase 2 has a single, reliable flat manifest of the entire corpus.

## Acceptance Criteria

1. **Given** `indexer.py` exists as a Typer CLI and `.meta.json` files exist across `data/raw/`
   **When** I run `uv run python indexer.py`
   **Then** `data/index.json` is created/updated as a flat JSON array of `IndexRecord` objects
   **And** every valid `.meta.json` on disk is represented as exactly one entry in `data/index.json`
   **And** the `IndexRecord` schema matches the Phase 2 handoff contract: `id`, `title`, `category`, `subcategory`, `source`, `url`, `file_path`, `file_format`, `copyright_status`

2. **Given** new `.meta.json` files are added after an initial index run
   **When** I run `indexer.py` again
   **Then** only new records are appended — no full rebuild, no duplicates introduced (FR19, NFR4)
   **And** running `indexer.py` twice with identical inputs produces identical `data/index.json` (idempotent)

3. **Given** a `.meta.json` references a `file_path` that does not exist on disk
   **When** `indexer.py` checks disk consistency
   **Then** it logs `[WARN] [indexer] Orphaned meta.json (file missing): {path}` and excludes that record
   **And** every record in `data/index.json` has a corresponding file that exists and is non-empty (FR20)

4. **Given** `indexer.py` completes
   **When** I inspect the output
   **Then** a summary is logged: `[INFO] [indexer] Indexed {N} records, {M} orphans excluded`
   **And** `data/index.json` is valid JSON parseable with `json.loads()` (NFR4)
   **And** `indexer.py --help` shows `--config` option

## Tasks / Subtasks

- [x] Create `indexer.py` Typer CLI entry point (AC: 4)
  - [x] `app = typer.Typer()` with `@app.command()` — matches parser.py / crawler.py pattern
  - [x] `--config`: str option, default `"config.yaml"`
  - [x] Load config via `load_config(config)`, exit with error on malformed config
  - [x] Setup logger via `setup_logger("indexer")`
  - [x] `if __name__ == "__main__": app()`
- [x] Implement `scan_meta_files(output_dir: Path) -> list[Path]` (AC: 1)
  - [x] Recursively glob `data/raw/**/*.meta.json` under `output_dir / "raw"`
  - [x] Return sorted list for deterministic processing order
- [x] Implement `load_existing_index(index_path: Path) -> dict[str, IndexRecord]` (AC: 2)
  - [x] Return `{}` if `index_path` does not exist
  - [x] Load JSON array, parse each entry as `IndexRecord(**entry)` via Pydantic
  - [x] Return dict keyed by `record.id` for O(1) duplicate lookup
  - [x] On parse error for any entry: log warning, skip that entry (do NOT crash)
- [x] Implement `meta_to_index_record(meta_path: Path, logger) -> IndexRecord | None` (AC: 1, 3)
  - [x] Load `.meta.json` as `ScriptureMetadata` via Pydantic: `ScriptureMetadata.model_validate_json(meta_path.read_text(encoding="utf-8"))`
  - [x] Disk consistency check: `file_path = Path(meta.file_path)` — check `file_path.exists() and file_path.stat().st_size > 0`
  - [x] If file missing or empty: log `[WARN] [indexer] Orphaned meta.json (file missing): {meta_path}`, return `None`
  - [x] Convert to IndexRecord: explicit field mapping (no model_dump() leak of extra fields)
  - [x] Return `None` on any exception (ValidationError, FileNotFoundError, json.JSONDecodeError), log error
- [x] Implement `build_index(cfg, logger)` orchestrator (AC: 1, 2, 3, 4)
  - [x] `output_dir = Path(cfg.output_dir)`
  - [x] `index_path = output_dir / "index.json"`
  - [x] `existing: dict[str, IndexRecord] = load_existing_index(index_path)`
  - [x] `meta_files = scan_meta_files(output_dir)`
  - [x] For each meta_path: call `meta_to_index_record(meta_path, logger)`
    - [x] On `None`: increment `orphan_count`, continue
    - [x] On valid record: if `record.id` already in `existing` → skip (no duplicate); else add to `existing`
  - [x] Serialize: `records = list(existing.values())` — stable dict order (Python 3.7+)
  - [x] Write: `index_path.write_text(json.dumps([r.model_dump() for r in records], ensure_ascii=False, indent=2), encoding="utf-8")`
  - [x] Log: `[INFO] [indexer] Indexed {len(records)} records, {orphan_count} orphans excluded`
- [x] Verify `data/index.json` schema matches Phase 2 handoff contract (AC: 1)
  - [x] Each entry contains exactly: `id`, `title`, `category`, `subcategory`, `source`, `url`, `file_path`, `file_format`, `copyright_status`
  - [x] `IndexRecord.model_dump()` produces snake_case keys (Pydantic default matches architecture)
  - [x] No `ScriptureMetadata`-only fields leak into index (title_pali, title_sanskrit, author_translator, created_at)
- [x] Add `tests/test_indexer.py` (AC: 1–4)
  - [x] Test `scan_meta_files()`: finds all `.meta.json` recursively; skips non-meta files
  - [x] Test `load_existing_index()`: returns empty dict if file absent; parses valid JSON array; skips malformed entries
  - [x] Test `meta_to_index_record()`: valid meta.json + file exists → IndexRecord; file missing → None + warning logged
  - [x] Test `meta_to_index_record()`: malformed meta.json → None, no exception raised
  - [x] Test `build_index()` idempotency: run twice → identical `data/index.json` content
  - [x] Test incremental: add new meta.json after first run → only new record appended, existing records unchanged
  - [x] Test orphan exclusion: meta.json with file_path pointing to missing file → excluded from index
  - [x] Test output JSON is parseable: `json.loads(index_path.read_text())` succeeds

## Dev Notes

### New File: indexer.py (at project root)

```python
from __future__ import annotations

import json
from pathlib import Path

import typer

from models import CrawlerConfig, IndexRecord, ScriptureMetadata
from utils.config import load_config
from utils.logging import setup_logger

app = typer.Typer()

@app.command()
def index(
    config: str = typer.Option("config.yaml", help="Config file path"),
) -> None:
    cfg = load_config(config)
    logger = setup_logger("indexer")
    build_index(cfg, logger)

if __name__ == "__main__":
    app()
```

### Why Dict-Keyed by id for Incremental Updates

```python
existing: dict[str, IndexRecord] = load_existing_index(index_path)
# existing = {"thuvienhoasen__tam-kinh": IndexRecord(...), ...}

for meta_path in meta_files:
    record = meta_to_index_record(meta_path, logger)
    if record and record.id not in existing:
        existing[record.id] = record  # only add genuinely new records
```

This achieves incremental update (FR19) + idempotency (NFR4) in a single pass. Duplicate check is O(1) by `id` key.

If a meta.json's `id` already exists in the index, skip it — do NOT overwrite (immutable once indexed). If the content changed, the developer can delete the index and rebuild.

### ScriptureMetadata → IndexRecord Conversion

`IndexRecord` has exactly 9 fields, all present in `ScriptureMetadata`. Use explicit field mapping — do NOT use `meta.model_dump()` and filter, as it risks including extra fields if models diverge:

```python
return IndexRecord(
    id=meta.id,
    title=meta.title,
    category=meta.category,
    subcategory=meta.subcategory,
    source=meta.source,
    url=meta.url,
    file_path=meta.file_path,
    file_format=meta.file_format,
    copyright_status=meta.copyright_status,
)
```

Fields NOT copied to IndexRecord: `title_pali`, `title_sanskrit`, `author_translator`, `created_at`.
This is intentional — IndexRecord is the frozen Phase 2 contract.

### Disk Consistency Check

```python
file_path = Path(meta.file_path)
if not file_path.exists() or file_path.stat().st_size == 0:
    logger.warning(f"[indexer] Orphaned meta.json (file missing): {meta_path}")
    return None
```

`meta.file_path` is a relative path string (e.g., `"data/raw/thuvienhoasen/nikaya/tam-kinh.html"`). `Path(meta.file_path)` resolves relative to CWD — works correctly when run from project root via `uv run`.

### Output Format: data/index.json

```json
[
  {
    "id": "thuvienhoasen__kinh-tam-kinh",
    "title": "Tâm Kinh",
    "category": "Đại Thừa",
    "subcategory": "Bát Nhã",
    "source": "thuvienhoasen",
    "url": "https://thuvienhoasen.org/...",
    "file_path": "data/raw/thuvienhoasen/dai-thua/tam-kinh.html",
    "file_format": "html",
    "copyright_status": "unknown"
  },
  ...
]
```

Use `ensure_ascii=False` in `json.dumps()` to preserve Vietnamese characters. Always `indent=2` for human readability and diff-friendly version control.

### load_existing_index Implementation

```python
def load_existing_index(index_path: Path) -> dict[str, IndexRecord]:
    if not index_path.exists():
        return {}
    try:
        entries = json.loads(index_path.read_text(encoding="utf-8"))
        result: dict[str, IndexRecord] = {}
        for entry in entries:
            try:
                record = IndexRecord(**entry)
                result[record.id] = record
            except Exception as e:
                pass  # Log but continue — don't let one bad entry corrupt the whole load
        return result
    except Exception:
        return {}  # Corrupt index.json → start fresh
```

### meta_to_index_record: ScriptureMetadata Validation

Loading via `ScriptureMetadata.model_validate_json(...)` re-validates the entire record against the schema. This catches cases where parser.py wrote a valid JSON file but with a now-invalid value (e.g., category enum change). Such records are excluded from the index with a logged error.

### Idempotency Guarantee

Running indexer.py twice with the same inputs:
1. First run: loads empty existing, adds all records → writes index.json with N records
2. Second run: loads existing N records, finds same N meta files, all ids already in existing → no new additions → writes same N records

Output is identical (same dict insertion order, same JSON serialization). This satisfies NFR4.

### crawl-state.json Usage

indexer.py does NOT read crawl-state.json for building the index. The index is built from `.meta.json` files only. crawl-state.json is used by validate.py (Story 4.2) for the run summary report.

The architecture boundary table confirms: `indexer.py` reads `data/raw/**/*.meta.json` only.

### scan_meta_files Pattern

```python
def scan_meta_files(output_dir: Path) -> list[Path]:
    raw_dir = output_dir / "raw"
    if not raw_dir.exists():
        return []
    return sorted(raw_dir.rglob("*.meta.json"))
```

`rglob("*.meta.json")` matches files like:
- `data/raw/thuvienhoasen/nikaya/tam-kinh.html.meta.json`
- `data/raw/budsas/nikaya/truong-bo-01.html.meta.json`

The `.meta.json` suffix convention (double extension: original ext + .meta.json) is established in Story 3.1.

### Project Structure Notes

- New files: `indexer.py` (project root), `tests/test_indexer.py`
- No changes to: `models.py`, `utils/`, `config.yaml`, `crawler.py`, `parser.py`
- `data/index.json` is created if absent, updated incrementally if present
- Run: `uv run python indexer.py` or `devbox run index`
- `devbox.json` already has `"index": "uv run python indexer.py"` from Epic 1 setup

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 3.3: Index Builder (indexer.py)]
- [Source: _bmad-output/planning-artifacts/epics.md#Requirements — FR18, FR19, FR20]
- [Source: _bmad-output/planning-artifacts/phase-1-crawler/architecture-phase1-crawler.md#Project Structure — Module Responsibilities table]
- [Source: _bmad-output/planning-artifacts/phase-1-crawler/architecture-phase1-crawler.md#Data Architecture — Phase 2 Handoff Contract]
- [Source: _bmad-output/planning-artifacts/phase-1-crawler/architecture-phase1-crawler.md#Implementation Patterns — Config Access pattern]
- [Source: models.py#IndexRecord — 9 fields, frozen Phase 2 contract]
- [Source: models.py#ScriptureMetadata — source for field mapping]
- [Source: _bmad-output/planning-artifacts/epics.md#Additional Requirements — Null Handling (ensure_ascii=False for JSON)]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

All tests passed on first implementation attempt. Key design: load_existing_index uses a two-level try/except so individual malformed entries don't prevent loading the rest of the index. build_index creates parent dirs (output_dir/index.json path) with mkdir(parents=True) to handle fresh installs.

### Completion Notes List

- Created `indexer.py` with Typer CLI, scan_meta_files, load_existing_index, meta_to_index_record, build_index
- 20 tests added in `tests/test_indexer.py` covering all ACs
- All 162 tests pass (113 original + 29 parser + 20 indexer); 0 regressions
- Linting: ruff check passes with 0 errors
- IndexRecord has exactly 9 fields — ScriptureMetadata-only fields (created_at, title_pali, author_translator, title_sanskrit) excluded
- Vietnamese characters preserved via ensure_ascii=False in json.dumps
- Idempotency verified by test: second run produces byte-identical output

### File List

- `indexer.py` (new)
- `tests/test_indexer.py` (new)

### Change Log

- 2026-02-28: Implemented Story 3.3 — indexer.py created with full incremental index building pipeline, 20 tests added
- 2026-02-28: Code review — fixed H1 (load_existing_index now logs warnings for malformed entries, added logger param), M1 (orphan_count renamed to excluded_count, log message clarified); added test_load_existing_index_warns_on_malformed_entry
