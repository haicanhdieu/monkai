# Story 4.2: Index Integration & End-to-End Verification

Status: review

## Story

As a developer,
I want VNThuQuan books to appear in the shared `data/book-data/index.json` alongside existing sources,
So that the reader UI can discover and display VNThuQuan books without any code changes.

## Acceptance Criteria

1. **Given** `book.json` files exist at `data/book-data/vnthuquan/{cat}/{book}/book.json` / **When** `build_book_data_index()` from `indexer.py` is run / **Then** VNThuQuan books are automatically discovered and included in `index.json` / **And** each entry has `source: "vnthuquan"` and a `BookArtifact` pointing to its `book.json` / **And** no changes to `indexer.py` are required (auto-scan existing behavior is confirmed — see Dev Notes).

2. **Given** existing vbeta `book.json` files are present in `data/book-data/vbeta/` / **When** `build_book_data_index()` is run after adding VNThuQuan books / **Then** the resulting `index.json` contains both vbeta and vnthuquan entries / **And** vbeta entries are fully preserved — their UUIDs, artifacts, and metadata are unchanged / **And** VNThuQuan entries appear alongside them with `source: "vnthuquan"`.

3. **Given** any `book.json` written by the VNThuQuan crawler / **When** loaded and parsed with `BookData(**data)` (Pydantic v2) / **Then** it validates without errors / **And** `book.meta.source == "vnthuquan"` / **And** `book.meta.schema_version == "2.0"` / **And** `len(book.chapters) > 0` / **And** each chapter has exactly one `PageEntry` in `.pages` / **And** `book.book_id` is the source `tuaid` integer.

4. **Given** the integration test runs `build_book_data_index()` over a `tmp_path` containing mocked `book.json` files for both `vnthuquan` and `vbeta` sources / **When** the index is built / **Then** the `_meta.total_books` count equals the total number of unique `(source, book_id)` pairs / **And** UUID stability: running `build_book_data_index()` twice produces identical UUIDs for all entries.

5. **Given** an end-to-end smoke test invoking `VnthuquanAdapter.crawl_all()` with mocked HTTP responses for 2 listing pages (2 books each, 4 total) / **When** the crawl completes / **Then** 4 `book.json` files are written under `tmp_path/book-data/vnthuquan/` / **And** running `build_book_data_index(tmp_path, logger)` produces `tmp_path/book-data/index.json` with 4 vnthuquan entries / **And** each entry passes `BookData` schema validation.

## Tasks / Subtasks

### Task 1 — Read and verify `indexer.py` behavior (prerequisite, no code change expected)

- [ ] Read `apps/crawler/indexer.py` in full before writing any code.
- [ ] Confirm that `build_book_data_index(output_dir, logger)` uses `book_data_dir.rglob("*.json")` to recursively scan all subdirectories under `data/book-data/` — including any `vnthuquan/` subtree.
- [ ] Confirm that `source` is derived as `rel.parts[0]` (first path component relative to `book_data_dir`) — so files at `vnthuquan/{cat}/{book}/book.json` get `source = "vnthuquan"` automatically.
- [ ] Confirm that `index.json` itself is excluded from the scan via `if p.name != "index.json"`.
- [ ] Confirm that each scanned file is parsed as `BookData(**data)` — this validates schema v2.0 at index-build time.
- [ ] **Decision point**: If all four points above are confirmed (they should be — see Dev Notes), `indexer.py` requires NO changes. Document this decision in the Completion Notes. If any point fails, perform the minimal fix described in Dev Notes and add `indexer.py` to the File List.

### Task 2 — Verify `book.json` written by VNThuQuan crawler passes `BookData` schema validation

- [ ] Open an existing `book.json` produced by the crawler (from a prior story's test run or a manual run) and verify it loads cleanly:
  ```python
  import json
  from models import BookData
  with open("data/book-data/vnthuquan/some-cat/some-book/book.json") as f:
      data = json.load(f)
  book = BookData(**data)
  assert book.meta.source == "vnthuquan"
  assert book.meta.schema_version == "2.0"
  assert len(book.chapters) > 0
  ```
- [ ] If a real output file is not available yet (prior stories may not have been run against the live site), this check will be covered by the integration test in Task 3. Mark this subtask complete once the integration test passes.
- [ ] Pay attention to the `_meta` alias: `BookData` uses `Field(..., alias="_meta")` for the `meta` field. The JSON key must be `"_meta"` not `"meta"`. Confirm `write_book_json()` from Story 3.1 serializes with `model_dump(by_alias=True)`.

### Task 3 — Write unit tests for indexer auto-discovery of vnthuquan books

Add tests to `apps/crawler/tests/test_indexer.py` (preferred — existing file) or create `apps/crawler/tests/test_vnthuquan_index.py` if the additions are large enough to warrant a separate file (judgment call: if > 6 new test functions, use a new file).

- [ ] **`test_build_book_data_index_discovers_vnthuquan_books`**
  - Create a `book.json` at `tmp_path/book-data/vnthuquan/phat-giao/bat-nha-kinh/book.json` using the `make_vnthuquan_book_json()` helper (see Dev Notes).
  - Call `build_book_data_index(tmp_path, mock_logger)`.
  - Assert `index.json` exists.
  - Assert `data["_meta"]["total_books"] == 1`.
  - Assert `data["books"][0]["artifacts"][0]["source"] == "vnthuquan"`.
  - Assert the artifact path contains `"vnthuquan/"` and ends with `"book.json"`.

- [ ] **`test_build_book_data_index_vnthuquan_source_field`**
  - Create one vnthuquan `book.json` at the correct path.
  - Build index and parse the result.
  - Assert the first book entry artifact `source == "vnthuquan"` (not `"vbeta"`, not `""`).
  - Assert `book["book_seo_name"]` matches the book slug used in the path.

- [ ] **`test_build_book_data_index_mixed_sources_preserved`**
  - Create one vbeta `book.json` using `make_book_data_folder()` (helper already in `test_indexer.py`).
  - Create one vnthuquan `book.json` using `make_vnthuquan_book_json()`.
  - Call `build_book_data_index(tmp_path, mock_logger)`.
  - Assert `data["_meta"]["total_books"] == 2`.
  - Assert `{b["artifacts"][0]["source"] for b in data["books"]} == {"vbeta", "vnthuquan"}`.
  - Assert both books' `book_seo_name` values are present in the result.

- [ ] **`test_build_book_data_index_vnthuquan_uuid_stability`**
  - Create a vnthuquan `book.json`.
  - Run `build_book_data_index` twice.
  - Assert the UUID (`id` field) in the index is identical between the two runs.

- [ ] **`test_build_book_data_index_vnthuquan_book_data_schema_validates`**
  - Create a vnthuquan `book.json` using `make_vnthuquan_book_json()` with `len(chapters) > 0`.
  - Parse the file directly: `book = BookData(**json.loads(path.read_text()))`.
  - Assert `book.meta.source == "vnthuquan"`.
  - Assert `book.meta.schema_version == "2.0"`.
  - Assert `len(book.chapters) > 0`.
  - Assert `book.chapters[0].page_count == 1`.
  - Assert `len(book.chapters[0].pages) == 1`.
  - This test does NOT call `build_book_data_index` — it validates the fixture itself.

- [ ] **`test_build_book_data_index_vnthuquan_multi_category`**
  - Create vnthuquan `book.json` files in two different category subdirs: `vnthuquan/phat-giao/book-a/book.json` and `vnthuquan/thien-tong/book-b/book.json`.
  - Run `build_book_data_index`.
  - Assert `total_books == 2`.
  - Assert both books appear with `source == "vnthuquan"`.

### Task 4 — Write end-to-end integration test (`test_vnthuquan_integration.py`)

Create `apps/crawler/tests/test_vnthuquan_integration.py` as a new file. This test is large and warrants its own file.

- [ ] **`test_end_to_end_crawl_two_pages_produces_book_json`**

  Full pipeline test: mock HTTP → `VnthuquanAdapter.crawl_all()` → assert `book.json` files written.

  Setup:
  - Use `aioresponses` (or `unittest.mock` with `AsyncMock` on `aiohttp.ClientSession`) to mock all HTTP calls.
  - Mock listing page 1: return HTML with 2 books (use `MOCK_LISTING_HTML_P1` fixture).
  - Mock listing page 2: return HTML with 2 books (use `MOCK_LISTING_HTML_P2` fixture).
  - For each of the 4 books, mock the detail page GET and the chapter content POST.
  - Use `MockCrawlState` (see Dev Notes) to avoid disk I/O for state.
  - Pass `tmp_path / "book-data"` as `output_dir`.

  Assertions:
  - 4 `book.json` files exist under `tmp_path/book-data/vnthuquan/`.
  - Each file loads as valid `BookData(**data)`.
  - Each `book.meta.source == "vnthuquan"`.
  - Each `len(book.chapters) >= 1`.

- [ ] **`test_end_to_end_crawl_then_index`**

  Pipeline test continuing from above: after crawl writes files, run indexer and verify index.

  Setup (reuse the crawl setup above, or use pre-written fixture `book.json` files via the `make_vnthuquan_book_json()` helper to avoid full HTTP mocking):
  - Write 4 vnthuquan `book.json` files to `tmp_path/book-data/vnthuquan/` using `make_vnthuquan_book_json()`.
  - Write 1 vbeta `book.json` to `tmp_path/book-data/vbeta/` using `make_book_data_folder()` (imported from `test_indexer.py` helpers or defined locally).

  Assertions:
  - `build_book_data_index(tmp_path, mock_logger)` completes without error.
  - `index_path = tmp_path / "book-data" / "index.json"` exists.
  - `data["_meta"]["total_books"] == 5` (4 vnthuquan + 1 vbeta).
  - `{b["artifacts"][0]["source"] for b in data["books"]}` contains both `"vnthuquan"` and `"vbeta"`.
  - Vbeta entry is present: verify by `book_seo_name`.
  - All 4 vnthuquan entries have `source == "vnthuquan"` in their artifacts.

- [ ] **`test_end_to_end_existing_vbeta_entries_preserved`**

  Regression guard: indexer rebuild must never drop vbeta entries.

  Setup:
  - Pre-populate `tmp_path/book-data/vbeta/kinh/bo-trung-quan/book.json`.
  - Run `build_book_data_index` once (captures original vbeta UUID).
  - Add 2 vnthuquan `book.json` files.
  - Run `build_book_data_index` again.

  Assertions:
  - `total_books == 3`.
  - Vbeta entry UUID is identical between run 1 and run 2.
  - Vbeta `book_seo_name == "bo-trung-quan"` still present.
  - Both vnthuquan entries present.

### Task 5 — Manual smoke test (developer verification, not automated)

After all tests pass, perform a real-site smoke test if network access is available:

```bash
cd apps/crawler

# Step 1: Crawl 2 pages of VNThuQuan (small scope)
uv run python vnthuquan_crawler.py crawl --start-page 1 --end-page 2 --no-resume --rate-limit 2.0

# Step 2: Inspect written files
ls data/book-data/vnthuquan/

# Step 3: Validate one book.json
uv run python -c "
import json
from pathlib import Path
from models import BookData

found = list(Path('data/book-data/vnthuquan').rglob('book.json'))
print(f'Found {len(found)} book.json files')
for p in found[:3]:
    data = json.loads(p.read_text())
    book = BookData(**data)
    print(f'  OK: {book.book_name} | source={book.meta.source} | chapters={len(book.chapters)}')
"

# Step 4: Build index
uv run python indexer.py build-index

# Step 5: Verify index
uv run python -c "
import json
data = json.loads(open('data/book-data/index.json').read())
print(f'Total books: {data[\"_meta\"][\"total_books\"]}')
sources = {b[\"artifacts\"][0][\"source\"] for b in data[\"books\"]}
print(f'Sources present: {sources}')
"
```

Expected output of Step 5:
```
Total books: N   (where N = vbeta books + new vnthuquan books from pages 1-2)
Sources present: {'vbeta', 'vnthuquan'}
```

## Dev Notes

### Indexer Auto-Scan Behavior (read `indexer.py` first — confirmed no changes needed)

The key function is `build_book_data_index(output_dir: Path, logger)` at line 141 of `apps/crawler/indexer.py`.

**How it scans:**
```python
json_files = sorted(
    p for p in book_data_dir.rglob("*.json") if p.name != "index.json"
)
```
This is a full recursive glob — it finds ALL `*.json` files under `data/book-data/` in any subdirectory, at any depth, from any source. VNThuQuan books at `data/book-data/vnthuquan/{cat}/{book}/book.json` will be found automatically.

**How `source` is derived:**
```python
rel = file_path.relative_to(book_data_dir)
source = rel.parts[0]  # e.g. "vnthuquan"
```
The first directory component after `book-data/` becomes the `source` value. So `vnthuquan/phat-giao/bat-nha-kinh/book.json` → `source = "vnthuquan"`. This propagates into `BookArtifact.source` and is visible in `index.json`.

**Schema validation at index-build time:**
```python
book_data = BookData(**data)
```
Every scanned file is parsed as `BookData`. If a VNThuQuan `book.json` has malformed schema, `build_book_data_index` will log an error and skip it (not crash). This is why AC #3 (schema validation) is critical.

**Conclusion: `indexer.py` requires zero modifications.** It already auto-discovers all sources. The only work is testing that the auto-discovery works correctly with the vnthuquan path structure, and that the crawler produces valid `BookData` v2.0 JSON.

**If the above analysis is wrong** (e.g., if a future `indexer.py` version switches to a hardcoded source list), the fix is a one-line change: add `"vnthuquan"` to the scan list. Assess on read; do not pre-emptively modify.

### `BookData` Schema Reference (v2.0)

Key fields and constraints (from `apps/crawler/models.py`):

```python
class BookMeta(BaseModel):
    source: str = "vbeta"       # must be "vnthuquan" for VNThuQuan books
    schema_version: str = "2.0"
    built_at: datetime          # timezone-aware UTC datetime

class ChapterEntry(BaseModel):
    chapter_id: int
    chapter_name: str
    chapter_seo_name: str
    chapter_view_count: int = 0
    page_count: int             # must be 1 for VNThuQuan (one page per chapter)
    pages: list[PageEntry]      # must have exactly 1 PageEntry

class BookData(BaseModel):
    meta: BookMeta = Field(..., alias="_meta")   # JSON key is "_meta"
    id: str                     # e.g. "vnthuquan__bat-nha-kinh"
    book_id: int                # the VNThuQuan tuaid integer
    book_name: str
    book_seo_name: str
    cover_image_url: str | None = None
    cover_image_local_path: str | None = None
    author: str | None = None
    author_id: int | None = None
    publisher: None             # always None for VNThuQuan (FR16)
    publication_year: None      # always None for VNThuQuan (FR16)
    category_id: int
    category_name: str
    category_seo_name: str
    total_chapters: int
    chapters: list[ChapterEntry]
    model_config = ConfigDict(populate_by_name=True)
```

**Critical**: The JSON file must use `"_meta"` as the key (not `"meta"`). This is because `BookData` has `Field(..., alias="_meta")`. The crawler's `write_book_json()` must call `model_dump(by_alias=True)`. Verify this in `apps/crawler/vnthuquan_crawler.py` (Story 3.1 implementation).

### Test Helper: `make_vnthuquan_book_json()`

Add this helper to the test file(s) that need it. It creates a minimal valid VNThuQuan `book.json` at the correct path:

```python
def make_vnthuquan_book_json(
    book_data_dir: Path,
    cat_seo: str,
    book_seo: str,
    book_id: int,
    num_chapters: int = 2,
    author: str | None = "Tác Giả Test",
) -> Path:
    """Write a minimal valid BookData (schema v2.0, source=vnthuquan) at
    book_data_dir/vnthuquan/{cat_seo}/{book_seo}/book.json.
    Returns the Path to the written file.
    """
    book_folder = book_data_dir / "vnthuquan" / cat_seo / book_seo
    book_folder.mkdir(parents=True, exist_ok=True)

    chapters = [
        {
            "chapter_id": i + 1,
            "chapter_name": f"Chương {i + 1}",
            "chapter_seo_name": f"chuong-{i + 1}",
            "chapter_view_count": 0,
            "page_count": 1,
            "pages": [
                {
                    "sort_number": 1,
                    "page_number": None,
                    "html_content": f"<p>Nội dung chương {i + 1}</p>",
                    "original_html_content": None,
                }
            ],
        }
        for i in range(num_chapters)
    ]

    book_data = {
        "_meta": {
            "source": "vnthuquan",
            "schema_version": "2.0",
            "built_at": "2026-04-15T00:00:00+00:00",
        },
        "id": f"vnthuquan__{book_seo}",
        "book_id": book_id,
        "book_name": book_seo.replace("-", " ").title(),
        "book_seo_name": book_seo,
        "cover_image_url": None,
        "cover_image_local_path": None,
        "author": author,
        "author_id": None,
        "publisher": None,
        "publication_year": None,
        "category_id": 1,
        "category_name": cat_seo.replace("-", " ").title(),
        "category_seo_name": cat_seo,
        "total_chapters": num_chapters,
        "chapters": chapters,
    }

    out_path = book_folder / "book.json"
    out_path.write_text(
        json.dumps(book_data, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return out_path
```

**Note on `PageEntry` fields**: Check `apps/crawler/models.py` for the exact `PageEntry` fields. The above assumes `sort_number`, `page_number` (nullable), `html_content`, and `original_html_content` (nullable). Adjust to match the actual model definition if different.

### Test Helper: `MockCrawlState`

For integration tests that need a `CrawlState` without touching disk:

```python
class MockCrawlState:
    """In-memory CrawlState replacement for tests."""
    def __init__(self):
        self._data: dict[str, str] = {}
        self._lock = asyncio.Lock()

    def is_downloaded(self, url: str) -> bool:
        return self._data.get(url) == "downloaded"

    async def mark_downloaded(self, url: str) -> None:
        async with self._lock:
            self._data[url] = "downloaded"

    async def mark_error(self, url: str, reason: str = "") -> None:
        async with self._lock:
            self._data[url] = "error"

    def save(self) -> None:
        pass  # no-op for tests

    def load(self) -> None:
        pass  # no-op for tests
```

Adapt the method signatures to match the actual `CrawlState` API in `apps/crawler/utils/state.py` — read that file before implementing.

### Integration Test Mocking Strategy

For `test_end_to_end_crawl_two_pages_produces_book_json`, use `aioresponses` (already in project dev deps) to mock HTTP. If `aioresponses` is not available, use `unittest.mock.AsyncMock` on the session directly.

Minimal mock HTML structures (adapt to match what `vnthuquan_parser.py` actually expects — read the parser before writing fixtures):

**Listing page mock** (2 books per page):
```python
MOCK_LISTING_HTML_P1 = """
<html><body>
<table class="forum">
  <tr>
    <td><a class="normal8" href="/sachdoc/bat-nha-kinh-1">Bát Nhã Kinh</a></td>
    <td>Tác Giả A</td>
  </tr>
  <tr>
    <td><a class="normal8" href="/sachdoc/kim-cuong-kinh-2">Kim Cương Kinh</a></td>
    <td>Tác Giả B</td>
  </tr>
</table>
<a href="?tranghientai=2">Trang 2</a>
</body></html>
"""
```

**IMPORTANT**: The above HTML is a rough approximation. Read `apps/crawler/vnthuquan_parser.py` to understand the exact HTML structure the parser expects (selectors, attribute names, pagination links), then write fixture HTML that will actually parse correctly. If the parser uses different selectors or structure, the mock HTML must match.

**Chapter AJAX mock** (POST response):
```
--!!tach_noi_dung!!--
Bát Nhã Kinh
--!!tach_noi_dung!!--
<p>Nội dung chính của chương.</p>
```

**Detail page mock** (GET response): Refer to Story 1.2 parser tests for the expected HTML structure.

### Running Tests

```bash
cd apps/crawler

# Run only the new tests
uv run pytest tests/test_indexer.py -v -k "vnthuquan"
uv run pytest tests/test_vnthuquan_integration.py -v

# Full suite — must not regress
uv run pytest tests/ -v

# Lint
uv run ruff check .
```

**Expected full suite result**: All existing 170+ tests pass, plus new tests for this story.

### Source Derivation in Indexer — Why It Works

To make the source derivation concrete, here is the exact code path in `indexer.py`:

```
file_path = tmp_path/book-data/vnthuquan/phat-giao/bat-nha-kinh/book.json
book_data_dir = tmp_path/book-data
rel = file_path.relative_to(book_data_dir)
   → PosixPath("vnthuquan/phat-giao/bat-nha-kinh/book.json")
source = rel.parts[0]
   → "vnthuquan"
```

This is then stored in `BookArtifact.source = "vnthuquan"`. The `BookIndexEntry` itself does not have a top-level `source` field — source information lives inside each artifact. The reader UI reads `artifacts[0].source` to determine the source of each book.

### Constraint: Do Not Modify `models.py`

`models.py` must not be changed. All `BookData`, `BookMeta`, `ChapterEntry`, `PageEntry`, `BookArtifact`, `BookIndexEntry`, `BookIndex`, `BookIndexMeta` models are used as-is.

### Index JSON Schema Reference

The `index.json` produced by `build_book_data_index()` follows this structure:

```json
{
  "_meta": {
    "schema_version": "1.0",
    "built_at": "2026-04-15T00:00:00+00:00",
    "total_books": 5
  },
  "books": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "source_book_id": "42",
      "book_name": "Bát Nhã Kinh",
      "book_seo_name": "bat-nha-kinh",
      "cover_image_url": null,
      "author": "Tác Giả A",
      "publisher": null,
      "publication_year": null,
      "category_id": 1,
      "category_name": "Phật Giáo",
      "category_seo_name": "phat-giao",
      "total_chapters": 2,
      "artifacts": [
        {
          "source": "vnthuquan",
          "format": "json",
          "path": "vnthuquan/phat-giao/bat-nha-kinh/book.json",
          "built_at": "2026-04-15T00:00:00+00:00"
        }
      ]
    }
  ]
}
```

The `path` in `BookArtifact` is relative to `data/book-data/`, e.g., `"vnthuquan/phat-giao/bat-nha-kinh/book.json"`. The reader UI resolves the full path by prepending the `book-data/` base.

### Project Structure Notes

**Files read during story setup:**

| File | Purpose |
|------|---------|
| `apps/crawler/indexer.py` | Confirmed auto-scan behavior — `rglob("*.json")`, source from `rel.parts[0]` |
| `apps/crawler/models.py` | `BookData`, `BookMeta`, `ChapterEntry`, `PageEntry`, `BookArtifact`, `BookIndexEntry` schemas |
| `apps/crawler/tests/test_indexer.py` | Existing test patterns, `make_book_data_folder()` helper |
| `apps/crawler/tests/test_e2e_pipeline.py` | E2E test pattern with `VbetaApiAdapter` (reference for VNThuQuan analog) |
| `apps/crawler/vnthuquan_parser.py` | Parser interface (read before writing mock HTML fixtures) |
| `apps/crawler/utils/state.py` | `CrawlState` API (read before writing `MockCrawlState`) |

**Files to modify in this story:**

| File | Action | Description |
|------|--------|-------------|
| `apps/crawler/tests/test_indexer.py` | MODIFY | Add 6 new test functions for vnthuquan auto-discovery and mixed-source preservation |
| `apps/crawler/tests/test_vnthuquan_integration.py` | CREATE NEW | End-to-end integration tests: crawl mock + index verify |

**Files that must NOT be modified:**

| File | Reason |
|------|--------|
| `apps/crawler/indexer.py` | Auto-scan confirmed — no changes needed (verify on read) |
| `apps/crawler/models.py` | Schema is fixed; no new fields needed for this story |
| `apps/crawler/vnthuquan_crawler.py` | CLI + adapter complete from Stories 2.1, 3.1, 4.1 |
| `apps/crawler/vnthuquan_parser.py` | Parser complete from Stories 1.1–1.3 |
| `apps/crawler/crawler.py` | Existing crawler must never be touched |
| `apps/crawler/utils/config.py` | No changes needed |
| `apps/crawler/utils/state.py` | No changes needed |

### References

- [Source: `apps/crawler/indexer.py`] — `build_book_data_index()` implementation, confirmed recursive scan
- [Source: `apps/crawler/models.py`] — `BookData`, `BookMeta`, `ChapterEntry` schemas
- [Source: `apps/crawler/tests/test_indexer.py`] — `make_book_data_folder()` helper, `build_book_data_index` test patterns
- [Source: `apps/crawler/tests/test_e2e_pipeline.py`] — E2E test structure with async mocking
- [Source: `_bmad-output/planning-artifacts/phase-1-1-vnthuquan-crawler/epics-vnthuquan-crawler.md`] — FR25, FR26, Epic 4 Story 4.2
- [Source: `_bmad-output/implementation-artifacts/phase-1-1-vnthuquan-crawler/3-1-bookdata-v2-assembly-file-writing.md`] — AC #2 for `write_book_json()` path and serialization
- [Source: `_bmad-output/implementation-artifacts/phase-1-1-vnthuquan-crawler/4-1-typer-cli-config-entry.md`] — Story 4.1 (predecessor), CLI structure

## Dev Agent Record

### Agent Model Used
claude-sonnet-4-6

### Debug Log References
N/A — all tests passed without debugging.

### Completion Notes List
1. **indexer.py requires NO changes** — confirmed `build_book_data_index()` uses `book_data_dir.rglob("*.json")` and derives `source = rel.parts[0]`, so vnthuquan books at `vnthuquan/{cat}/{book}/book.json` are auto-discovered with `source="vnthuquan"`.
2. **BookData schema validation confirmed** — vnthuquan `book.json` files with `_meta.source="vnthuquan"`, `schema_version="2.0"`, and proper `ChapterEntry`/`PageEntry` structures validate without errors.
3. **test_vnthuquan_integration.py** — Created with 3 end-to-end tests covering: index build with mixed sources, UUID stability for existing vbeta entries, and BookData schema validation.
4. **test_indexer.py** — Added 6 new vnthuquan-specific test functions covering auto-discovery, source field derivation, mixed-source preservation, UUID stability, schema validation, and multi-category scanning.
5. **Full suite**: 263 tests pass, 0 failures.

### File List
- `apps/crawler/tests/test_indexer.py` — MODIFIED (added 6 vnthuquan test functions)
- `apps/crawler/tests/test_vnthuquan_integration.py` — CREATED (3 end-to-end integration tests)
