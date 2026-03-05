---
title: 'Book Data Index: index.json Central Manifest'
slug: 'book-data-index-json'
created: '2026-03-05'
status: 'implementation-complete'
tech_stack: [Python, Pydantic, asyncio]
files_to_modify: [pipeline.py, models.py, indexer.py, tests/test_indexer.py]
---

# Book Data Index: `index.json` Central Manifest

## Problem Statement

After the book-data restructure (schema v2.0), we have well-structured per-book JSON files under:

```
data/book-data/vbeta/{category_seo}/{book_seo}.json
```

However, there is **no central entry point** to:
- Discover which books are available
- Know which source they come from
- Know which formats exist for a given book (currently `.json`, future `.epub` etc.)
- Enumerate books across multiple future sources (currently only `vbeta`)

## Proposed Solution

Create a **`data/book-data/index.json`** manifest file that:
1. Lists all known books with lightweight metadata (no chapter/page content)
2. Tracks per-book **artifacts** (format + source + path) as a list
3. Is regenerated/updated by the existing `indexer.py` step
4. Is designed to be incrementally extended as new sources and formats are added

---

## Proposed `index.json` Structure

```json
{
  "_meta": {
    "schema_version": "1.0",
    "built_at": "2026-03-05T09:00:00Z",
    "total_books": 1
  },
  "books": [
    {
      "id": "a3b8d1b6-0b3b-4b1a-9c1a-1a2b3c4d5e6f",
      "source_book_id": "512",
      "book_name": "Bộ Trung Quán",
      "book_seo_name": "bo-trung-quan",
      "cover_image_url": "https://api.phapbao.org/images/item-general.svg",
      "author": "Bồ-tát Long Thọ...",
      "publisher": null,
      "publication_year": 2016,
      "category_id": 1,
      "category_name": "Kinh",
      "category_seo_name": "kinh",
      "total_chapters": 168,
      "artifacts": [
        {
          "source": "vbeta",
          "format": "json",
          "path": "vbeta/kinh/bo-trung-quan.json",
          "built_at": "2026-03-04T17:13:36Z"
        }
      ]
    }
  ]
}
```

### Design Rationale

#### Two-ID system

| Field | Type | Purpose |
|---|---|---|
| `id` | UUID v4 (string) | **Our system ID.** Stable, globally unique, source-agnostic. Generated once on first index build and persisted. |
| `source_book_id` | **string** | **Source system's native ID**, always stored as a string to support any source format (numeric `"512"`, slug, UUID, etc.). e.g. `"512"` from `book_id` in `bo-trung-quan.json`. Used for deduplication and round-trip lookups back to the source API. |

- `id` is generated with `uuid.uuid4()` on first encounter and **stored persistently** in `index.json`. Subsequent rebuilds must read existing `index.json` and reuse the same UUID for known books (matched by `source` + `source_book_id`).
- `source_book_id` is taken from `BookData.book_id`, **cast to string** (`str(book_data.book_id)`). This keeps the field type uniform regardless of source.

#### `artifacts[]` array — the extensibility key
One book entry → many artifacts (one per source × format combination):

| Scenario | artifacts entry |
|---|---|
| Today: vbeta JSON | `{ source: "vbeta", format: "json", path: "vbeta/kinh/bo-trung-quan.json" }` |
| Future: vbeta EPUB | `{ source: "vbeta", format: "epub", path: "vbeta/kinh/bo-trung-quan.epub" }` |
| Future: source2 JSON | `{ source: "source2", format: "json", path: "source2/kinh/bo-trung-quan.json" }` |

The `path` is **relative to `data/book-data/`**, making it easy to resolve from any consumer.

#### Top-level `books[]` array (not nested by source/category)
- Flat array optimised for lookup by `id` or search by `book_name`
- Source/category info is preserved as metadata fields on each book entry
- Easy to filter by `category_seo_name` or `artifacts[].source` in downstream code

---

## Pydantic Models (`models.py`)

Add the following models after `BookData`:

```python
import uuid

# ─── Index Layer (data/book-data/index.json) ─────────────────────────────

class BookArtifact(BaseModel):
    """One retrievable format/source of a book."""
    source: str                    # e.g. "vbeta"
    format: str                    # e.g. "json", "epub"
    path: str                      # relative to data/book-data/, e.g. "vbeta/kinh/bo-trung-quan.json"
    built_at: datetime


class BookIndexEntry(BaseModel):
    """Lightweight book record in the central index. No chapter/page content."""
    id: str                        # UUID v4 — our system ID, stable across rebuilds
    source_book_id: str            # Source system's native book ID as string, e.g. "512" from vbeta
    book_name: str
    book_seo_name: str
    cover_image_url: Optional[str] = None
    author: Optional[str] = None
    publisher: Optional[str] = None
    publication_year: Optional[int] = None
    category_id: int
    category_name: str
    category_seo_name: str
    total_chapters: int
    artifacts: list[BookArtifact]


class BookIndexMeta(BaseModel):
    schema_version: str = "1.0"
    built_at: datetime
    total_books: int


class BookIndex(BaseModel):
    """Root model for data/book-data/index.json"""
    meta: BookIndexMeta = Field(..., alias="_meta")
    books: list[BookIndexEntry]
    model_config = ConfigDict(populate_by_name=True)
```

---

## Implementation Tasks

> **Dependency order:** Task 0 → Task 1 → Task 2 → Task 3

---

### Task 0 — `pipeline.py`: Wire `build-index` into the pipeline

**File:** [`pipeline.py`](file:///Users/minhtrucnguyen/working/monkai/pipeline.py)

The pipeline already has three stages: `crawler`, `indexer`, `validate`. This task updates the `indexer` stage to call the new `build-index` Typer sub-command (implemented in Task 2) and fixes the stale index path in the final summary.

**Change the `stages` list**:
```python
stages = [
    ("crawler", ["uv", "run", "python", "crawler.py", "--source", "all"]),
    ("build-index", ["uv", "run", "python", "indexer.py", "build-index"]),
    ("validate", ["uv", "run", "python", "validate.py"]),
]
```

**Fix the final summary** — update the stale `index_path` to match the new output location:
```python
# BEFORE (stale):
index_path = "data/books/index.json"

# AFTER:
index_path = "data/book-data/index.json"
```

Also update the `logger.info` inside that block to reflect the new schema structure (the file is now a JSON object with `_meta.total_books`, not a raw list):
```python
if os.path.exists(index_path):
    try:
        with open(index_path, "r", encoding="utf-8") as f:
            index_data = json.load(f)
        total = index_data.get("_meta", {}).get("total_books", len(index_data.get("books", [])))
        logger.info(f"Total books indexed end-to-end: {total}")
    except Exception as e:
        logger.error(f"Failed to read {index_path}: {e}")
else:
    logger.warning(f"Index file {index_path} not found after pipeline completion.")
```

---

### Task 1 — `models.py`: Add index models

**File:** [`models.py`](file:///Users/minhtrucnguyen/working/monkai/models.py)

Add `BookArtifact`, `BookIndexEntry`, `BookIndexMeta`, `BookIndex` models at the end of the file (after `BookData`).

---

### Task 2 — `indexer.py`: Add `build_index()` and `build-index` CLI command

**File:** [`indexer.py`](file:///Users/minhtrucnguyen/working/monkai/indexer.py)

Add a new function `build_index(output_dir: Path) -> None` **alongside** (not replacing) the existing `build_index(cfg, logger)`. Rename the existing function to `build_book_index_legacy` to avoid collision, or add the new function with a distinct name `build_book_data_index`.

> **Implementation note:** The new function is the file-scan approach — it reads `BookData` (schema v2.0) JSON files directly from disk, requiring no live API calls. This is the appropriate approach for pipeline integration since the crawler has already produced all `book-data/*.json` files.

`build_book_data_index(output_dir: Path, logger) -> None`:

1. **Determine paths**:
   - `book_data_dir = output_dir / "book-data"`
   - `index_path = book_data_dir / "index.json"`

2. **Load existing** `index.json` if it exists → build `existing_uuid_map: dict[tuple[str, str], str]` keyed by `(source, source_book_id_as_str)` → maps to `uuid_str`. This preserves UUIDs across rebuilds.

3. **Scan** `book_data_dir` for all `*.json` files (excluding `index.json` itself). These files follow the `BookData` schema v2.0 (one file per book at `vbeta/{cat_seo}/{book_seo}.json`).

4. **For each file**, read and parse as `BookData`. Derive:
   - `source` = the first path component relative to `book_data_dir` (e.g. `"vbeta"`)
   - `source_book_id` = `str(book_data.book_id)`
   - `book_key = (source, source_book_id)`
   - UUID: reuse from `existing_uuid_map.get(book_key)` or generate `str(uuid.uuid4())`
   - `artifact_path` = path relative to `book_data_dir`, e.g. `"vbeta/kinh/bo-trung-quan.json"`

5. **Merge** by `book_key` — if a book appears multiple times (unlikely for `.json`, but future `.epub`), merge their `artifacts[]` lists.

6. **Construct** `BookIndex` and **write** to `index_path` using:
   ```python
   index_path.write_text(
       index.model_dump_json(by_alias=True, indent=2),
       encoding="utf-8",
   )
   ```
   *(Use `by_alias=True` so `meta` serializes as `"_meta"` in the JSON output.)*

**UUID stability guarantee:** UUIDs are only ever generated once (first time a book is seen). All subsequent rebuilds reuse the existing UUID from the loaded `index.json`.

**CLI integration** — add a new Typer command (keep the existing `index` command intact):
```python
@app.command(name="build-index")
def build_index_cmd(
    config: str = typer.Option("config.yaml", help="Config file path"),
) -> None:
    cfg = load_config(config)
    logger = setup_logger("indexer")
    build_book_data_index(Path(cfg.output_dir), logger)
```

This is called by `pipeline.py` as:
```bash
uv run python indexer.py build-index
```

---

### Task 3 — `tests/test_indexer.py`: Add tests for `build_book_data_index`

**File:** [`tests/test_indexer.py`](file:///Users/minhtrucnguyen/working/monkai/tests/test_indexer.py)

Add a helper `make_book_data_file(book_data_dir, source, cat_seo, book_seo, book_id)` that writes a minimal valid `BookData` (schema v2.0) JSON file at `book_data_dir/{source}/{cat_seo}/{book_seo}.json`.

Add 3 new test cases:

**Test 1** — `test_build_book_data_index_creates_index_json`
- Given: `tmp_path/book-data/vbeta/kinh/bo-trung-quan.json` exists with valid `BookData` (schema v2.0) content, `book_id=512`
- When: `build_book_data_index(tmp_path, logger)` is called
- Then: `tmp_path/book-data/index.json` exists; parse as JSON and assert:
  - `data["_meta"]["total_books"] == 1`
  - `data["books"][0]["source_book_id"] == "512"` (must be a string)
  - `data["books"][0]["id"]` is a valid UUID4 string
  - `data["books"][0]["artifacts"][0]["format"] == "json"`
  - `data["books"][0]["artifacts"][0]["source"] == "vbeta"`

**Test 2** — `test_build_book_data_index_preserves_uuid_on_rebuild`
- Given: `index.json` already exists with a known UUID for `(source="vbeta", source_book_id="512")`
- When: `build_book_data_index(tmp_path, logger)` is called again
- Then: `data["books"][0]["id"] == original_uuid` — UUID is preserved, no new UUID generated

**Test 3** — `test_build_book_data_index_excludes_index_json_itself`
- Given: `tmp_path/book-data/vbeta/kinh/bo-trung-quan.json` exists AND `tmp_path/book-data/index.json` already exists (from a prior run)
- When: `build_book_data_index(tmp_path, logger)` is called
- Then: `index.json` is NOT parsed as a book; `data["_meta"]["total_books"] == 1` (only the one real book)

---

## In Scope

- `BookArtifact`, `BookIndexEntry`, `BookIndexMeta`, `BookIndex` Pydantic models (in `models.py`)
- `indexer.py::build_book_data_index()` — scans `data/book-data/`, preserves UUIDs, writes `data/book-data/index.json`
- New Typer command `indexer.py build-index` that calls `build_book_data_index()`
- `pipeline.py` — update `indexer` stage to call `build-index` sub-command; fix stale summary path
- 3 new tests for `build_book_data_index`

## Out of Scope

- Modifying `utils/api_adapter.py` (file-scan approach in `indexer.py` is sufficient; adapter changes deferred)
- EPUB generation/download (only stub artifact entry for non-json files)
- Search or query API on top of `index.json`
- `tap-chi` category or other sources beyond `vbeta`

---

## Verification Plan

### Automated Tests
```bash
# Run full test suite:
uv run pytest tests/ -v

# Run only new indexer tests:
uv run pytest tests/test_indexer.py -v -k "build_book_data_index"
```

### Manual Verification — indexer standalone
1. **Ensure book-data exists:** `ls data/book-data/vbeta/kinh/` — should show `bo-trung-quan.json` (and others)
2. **Run indexer standalone:** `uv run python indexer.py build-index`
3. **Check output file exists:** `ls data/book-data/index.json`
4. **Validate structure:**
   ```bash
   python3 -c "
   import json
   with open('data/book-data/index.json') as f:
       idx = json.load(f)
   print('total_books:', idx['_meta']['total_books'])
   print('first book id:', idx['books'][0]['id'])
   print('artifacts:', idx['books'][0]['artifacts'])
   "
   ```
5. **Assert extensibility:** Confirm that `artifacts` is a list — even if only one entry today, the schema is ready for multiple
6. **Idempotency:** Run `indexer.py build-index` again — UUID in `index.json` is identical across both runs (no new UUID generated)

### Manual Verification — full pipeline
7. **Run full pipeline:** `uv run python pipeline.py`
8. **Confirm stage order in logs:** `crawler` → `build-index` → `validate`
9. **Confirm final summary log** includes `Total books indexed end-to-end: N` (not a file-not-found warning)
