# Story 6.1: Book-Level Index Refactor — Move index.json to data/books/ and switch to book-level records

Status: Implementation Complete

## Story

As a developer,
I want `data/books/index.json` to be a flat book-level index (one entry per book) built from the book manifests in `data/books/{source}/`,
so that Phase 2 consumers get a clean, book-oriented catalogue instead of a per-chapter flat list.

## Context

Currently `indexer.py` scans `data/meta/{source}/*.json` (chapter-level metadata) and writes `data/index.json` as a flat array of `IndexRecord` — one entry per crawled chapter (~950 entries). This is useful for the crawler's own tracking but is wrong for consumers who think in terms of *books*, not chapters.

`book_builder.py` already produces one JSON manifest per book at `data/books/{source}/{slug}.json`, each containing the full ordered chapter list. The new `index.json` should aggregate these manifests into a single flat book catalogue at `data/books/index.json`.

**Pipeline order (confirmed safe):** `book_builder` runs before `indexer` in `pipeline.py`, so book manifests always exist before the indexer scans them.

## Acceptance Criteria

1. **Given** book manifests exist at `data/books/{source_name}/{slug}.json`
   **When** I run `uv run python indexer.py`
   **Then** `data/books/index.json` is created/updated as a flat JSON array of `BookIndexRecord` objects
   **And** each entry represents exactly one book (not a chapter)
   **And** every book manifest on disk (excluding `index.json` itself) is represented as exactly one entry

2. **Given** `data/books/index.json` is written
   **When** I inspect an entry
   **Then** it contains exactly the fields: `id`, `title`, `category`, `subcategory`, `source`, `author_translator`, `total_chapters`, `manifest_path`
   **And** `manifest_path` is a relative path pointing to the book manifest file (e.g., `"data/books/thuvienkinhphat/slug.json"`)
   **And** `author_translator` is `null` when absent (not omitted)

3. **Given** the indexer has already run once
   **When** I run `indexer.py` again with identical inputs
   **Then** the output is byte-identical (idempotent)
   **And** running with new book manifests appends new records without duplicating existing ones

4. **Given** `indexer.py` completes
   **When** I inspect the output
   **Then** a summary is logged: `[INFO] [indexer] Indexed {N} books, {M} excluded (errors)`
   **And** `data/books/index.json` is valid JSON parseable with `json.loads()`

5. **Given** the pipeline runs end-to-end via `pipeline.py`
   **When** I inspect the final summary
   **Then** it reads record count from `data/books/index.json` (not the old `data/index.json`)

6. **Given** `validate.py` runs
   **When** it checks Phase 2 quality gates
   **Then** gate Rule 1 checks `data/books/index.json` has ≥ 10 book records (not ≥ 500 chapters)
   **And** gate Rule 6 validates entries against `BookIndexRecord` schema

## Tasks / Subtasks

### Task 1: Add `BookIndexRecord` to `models.py`
- [x] Add `BookIndexRecord` Pydantic model after existing `IndexRecord`:
  ```python
  class BookIndexRecord(BaseModel):
      id: str                  # book_slug
      title: str               # book_title
      category: Literal["Nikaya", "Đại Thừa", "Mật Tông", "Thiền", "Tịnh Độ"]
      subcategory: str
      source: str
      author_translator: str | None
      total_chapters: int
      manifest_path: str       # relative path e.g. "data/books/thuvienkinhphat/slug.json"
  ```
- [x] Keep `IndexRecord` class as-is (used by existing tests and may be needed by other consumers)

### Task 2: Rewrite `indexer.py`
- [x] Replace `scan_meta_files(output_dir)` with `scan_book_manifests(output_dir: Path) -> list[Path]`:
  - Glob `output_dir / "books" / "**" / "*.json"` recursively
  - **Exclude** `index.json` (filter: `p.name != "index.json"`)
  - Return sorted list for deterministic processing order
  - Return `[]` if `output_dir / "books"` does not exist
- [x] Update `load_existing_index(index_path, logger) -> dict[str, BookIndexRecord]`:
  - Same logic as before but parse entries as `BookIndexRecord(**entry)` instead of `IndexRecord(**entry)`
  - Key by `record.id` (book_slug)
- [x] Replace `meta_to_index_record` with `manifest_to_book_record(manifest_path: Path, logger) -> BookIndexRecord | None`:
  - Read and parse manifest JSON (plain `json.loads`, not Pydantic validation of full manifest)
  - Extract fields: `book_slug`, `book_title`, `category`, `subcategory`, `source`, `author_translator`, `total_chapters`
  - Compute `manifest_path` as the relative string path of `manifest_path` arg (use `str(manifest_path)`)
  - Return `None` on any exception, log error
  - No disk consistency check needed (book manifests are always fresh from book_builder)
- [x] Update `build_index(cfg, logger)`:
  - `index_path = output_dir / "books" / "index.json"`
  - Call `scan_book_manifests(output_dir)` instead of `scan_meta_files`
  - Call `manifest_to_book_record` instead of `meta_to_index_record`
  - Log: `[INFO] [indexer] Indexed {N} books, {M} excluded (errors)`
  - `index_path.parent.mkdir(parents=True, exist_ok=True)` still needed for safety
- [x] Update import in `indexer.py`: `from models import CrawlerConfig, BookIndexRecord` (drop `IndexRecord`, `ScriptureMetadata`)

### Task 3: Update `pipeline.py`
- [x] Line 35: `index_path = "data/books/index.json"`

### Task 4: Update `validate.py`
- [x] Line 141: `index_path = Path(output_dir) / "books" / "index.json"`
- [x] Import `BookIndexRecord` (drop or keep `IndexRecord` import as needed)
- [x] Line 150–155: validate entries against `BookIndexRecord` instead of `IndexRecord`
- [x] Line 159: `rule1 = index_record_count >= 10` (changed from ≥ 500 chapters to ≥ 10 books)
- [x] Line 185: update print string to `"data/books/index.json"`
- [x] Lines 189–190: update remaining `{output_dir}/index.json` string references to `{output_dir}/books/index.json`

### Task 5: Rewrite `tests/test_indexer.py`
- [x] Remove all existing tests (they test the old chapter-level behaviour)
- [x] Add helper `make_book_manifest(books_dir, source, slug, book_title, category, subcategory, author_translator, total_chapters) -> Path` that writes a minimal book manifest JSON
- [x] Tests for `scan_book_manifests`:
  - Finds all `*.json` recursively under `books/`
  - Excludes `index.json` from results
  - Returns sorted list
  - Returns `[]` if `books/` does not exist
- [x] Tests for `load_existing_index` (now `BookIndexRecord`):
  - Returns `{}` if absent
  - Parses valid array of `BookIndexRecord` entries
  - Skips and warns on malformed entries
  - Returns `{}` on corrupt JSON
- [x] Tests for `manifest_to_book_record`:
  - Valid manifest → `BookIndexRecord` with correct fields
  - Missing / corrupt JSON → `None`, error logged
  - `manifest_path` field contains the relative path string
- [x] Tests for `build_index`:
  - Creates `data/books/index.json`
  - Idempotency: two runs produce identical output
  - Incremental: new manifests appended, existing unchanged
  - No duplicate on second run
  - Output is valid parseable JSON preserving Vietnamese characters
  - Log summary contains "books" and "excluded"
  - Output path is `tmp_path / "books" / "index.json"` (not `tmp_path / "index.json"`)

## Dev Notes

### Output Format: `data/books/index.json`

```json
[
  {
    "id": "kinh-phap-cu",
    "title": "Kinh Pháp Cú",
    "category": "Nikaya",
    "subcategory": "Tiểu Bộ",
    "source": "thuvienkinhphat",
    "author_translator": "Thích Minh Châu",
    "total_chapters": 26,
    "manifest_path": "data/books/thuvienkinhphat/kinh-phap-cu.json"
  },
  ...
]
```

### scan_book_manifests: exclude index.json

```python
def scan_book_manifests(output_dir: Path) -> list[Path]:
    books_dir = output_dir / "books"
    if not books_dir.exists():
        return []
    return sorted(p for p in books_dir.rglob("*.json") if p.name != "index.json")
```

### manifest_to_book_record: no Pydantic validation of manifest

The book manifest schema is owned by `book_builder.py`. Do NOT import or validate against it. Use plain `json.loads`:

```python
def manifest_to_book_record(manifest_path: Path, logger) -> BookIndexRecord | None:
    try:
        data = json.loads(manifest_path.read_text(encoding="utf-8"))
        return BookIndexRecord(
            id=data["book_slug"],
            title=data["book_title"],
            category=data["category"],
            subcategory=data.get("subcategory", ""),
            source=data["source"],
            author_translator=data.get("author_translator"),
            total_chapters=data.get("total_chapters", 0),
            manifest_path=str(manifest_path),
        )
    except Exception as e:
        logger.error(f"[indexer] Failed to process {manifest_path}: {e}")
        return None
```

### validate.py rule1 threshold rationale

The old threshold (≥ 500) was calibrated for chapter-level records from ~950 crawled URLs. The new threshold (≥ 10) is calibrated for book-level records. With thuvienkinhphat's corpus, we expect ~50–100 distinct books. A floor of 10 is a meaningful gate that catches empty or near-empty runs.

### Idempotency

Same mechanism as before: load existing `BookIndexRecord` entries keyed by `id` (book_slug), skip any manifest whose `id` is already present.

### Run command

```bash
uv run python indexer.py
```

### Files Changed

- `models.py` — add `BookIndexRecord`
- `indexer.py` — rewrite: new functions, new path, new schema
- `pipeline.py` — update path string
- `validate.py` — update path, rule1 threshold, schema reference, print strings
- `tests/test_indexer.py` — full rewrite

### Files NOT Changed

- `book_builder.py` — not touched; it is now the upstream producer for the indexer
- `parser.py`, `crawler.py`, `utils/` — not touched
- `config.yaml` — not touched

## References

- `indexer.py` (current chapter-level implementation)
- `book_builder.py:build_books` — defines the book manifest schema being consumed
- `validate.py:141–190` — Phase 2 quality gates referencing index.json
- `pipeline.py:35–44` — final summary reads index.json
- `models.py:IndexRecord` — old schema, kept but superseded by BookIndexRecord for index.json
