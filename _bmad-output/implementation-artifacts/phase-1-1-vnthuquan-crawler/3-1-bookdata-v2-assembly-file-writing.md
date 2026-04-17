# Story 3.1: BookData v2.0 Assembly & File Writing

Status: review

## Story

As a developer,
I want crawled VNThuQuan data assembled into BookData v2.0 format and written as `book.json` files,
So that the reader UI can consume VNThuQuan books with zero code changes.

## Acceptance Criteria

1. **Given** a `BookListingEntry`, `BookDetail`, and list of chapter content strings
   **When** `assemble_book_data(entry, detail, chapters_html, cover_url)` is called
   **Then** it returns a `BookData` Pydantic model with all fields mapped per the field mapping table below
   **And** `meta.source = "vnthuquan"`, `meta.schema_version = "2.0"`, `meta.built_at` = UTC now (timezone-aware)
   **And** `book_id = tuaid` (int), `book_seo_name = slugify_title(book_name)`
   **And** each chapter has exactly one `PageEntry` with `sort_number=1` and `html_content` taken verbatim from the corresponding `chapters_html` string
   **And** `publisher` and `publication_year` are `None`
   **And** `cover_image_url` is set from the `cover_url` argument (sourced from first chapter's Part 0 extraction)
   **And** `page_count` equals `1` for every `ChapterEntry` (one page per chapter)
   **And** `total_chapters` equals `len(detail.chapter_list)`

2. **Given** an assembled `BookData` object and an `output_dir: Path`
   **When** `write_book_json(book_data, output_dir)` is called
   **Then** it writes to `{output_dir}/book-data/vnthuquan/{category_seo_name}/{book_seo_name}/book.json`
   **And** all intermediate directories are created if they don't exist
   **And** `html_content` strings are stored as-is — no cleaning, no HTML entity decoding, no escaping
   **And** output file is valid UTF-8 JSON, serialized with `model.model_dump(by_alias=True)` using the `_meta` alias
   **And** datetimes are serialized as ISO 8601 strings

3. **Given** the target directory already contains a `book.json` with a **different** `book_id`
   **When** `write_book_json(book_data, output_dir)` is called and the collision is detected
   **Then** the directory slug is suffixed with `-{book_id}` (e.g. `bat-nha-ba-la-mat-da-tam-kinh-42`)
   **And** `book_seo_name` in the `BookData` object is updated to match the suffixed slug before writing
   **And** a warning is logged: `[vnthuquan] Slug collision: {slug} already exists for book_id={existing_id}, using {slug}-{new_id}`
   **And** if the target directory already contains a `book.json` with the **same** `book_id`, it is silently overwritten (idempotent re-run)

4. **Given** `crawl_book(entry)` is called on a `VnthuquanAdapter` instance
   **When** all chapters have been fetched successfully
   **Then** `assemble_book_data()` is called with the entry, detail, chapters HTML list, and cover URL from the first chapter
   **And** `write_book_json()` is called with the assembled `BookData` and `self.output_dir`
   **And** the method returns `True`
   **And** `cover_image_url` is sourced ONLY from the first chapter's `ChapterParseResult.cover_image_url` — subsequent chapters' cover URLs are ignored
   **And** if a chapter's `ChapterParseResult` is `None`, an empty string `""` is appended to `chapters_html` and a warning is logged

## Tasks / Subtasks

- [x] **Task 1: Implement `assemble_book_data()` function in `vnthuquan_crawler.py`** (AC: #1)
  - [ ] Add function signature: `def assemble_book_data(entry: BookListingEntry, detail: BookDetail, chapters_html: list[str], cover_url: str | None) -> BookData`
  - [ ] Import `BookData`, `BookMeta`, `ChapterEntry`, `PageEntry` from `models` at top of file
  - [ ] Import `slugify_title` from `utils.slugify` (already imported — verify it exists)
  - [ ] Import `datetime`, `timezone` from `datetime` module
  - [ ] Construct `BookMeta` with `source="vnthuquan"`, `schema_version="2.0"`, `built_at=datetime.now(timezone.utc)`
  - [ ] Compute `book_seo_name = slugify_title(detail.book_name)`
  - [ ] Compute `category_seo_name = slugify_title(entry.category_name)`
  - [ ] Build `ChapterEntry` list — one entry per `(chuongid, chapter_name)` pair in `detail.chapter_list`, in order
    - [ ] `chapter_id = chuongid` (int); for single-chapter books where chuongid is 0, keep 0
    - [ ] `chapter_name` from the ToC entry text
    - [ ] `chapter_seo_name = slugify_title(chapter_name)`
    - [ ] `chapter_view_count = 0` (not available from VNThuQuan)
    - [ ] `page_count = 1` (exactly one page per chapter)
    - [ ] `pages = [PageEntry(sort_number=1, html_content=chapters_html[i])]` — `page_number=None`
  - [ ] Construct `BookData` using `_meta` alias kwarg: `BookData(**{"_meta": meta, ...})`
    - [ ] `id = f"vnthuquan__{book_seo_name}"`
    - [ ] `book_id = detail.tuaid`
    - [ ] `book_name = detail.book_name`
    - [ ] `book_seo_name = book_seo_name` (computed above)
    - [ ] `cover_image_url = cover_url` (may be None)
    - [ ] `cover_image_local_path = None`
    - [ ] `author = entry.author_name`
    - [ ] `author_id = entry.author_id`
    - [ ] `publisher = None`
    - [ ] `publication_year = None`
    - [ ] `category_id = entry.category_id`
    - [ ] `category_name = entry.category_name`
    - [ ] `category_seo_name = category_seo_name`
    - [ ] `total_chapters = len(detail.chapter_list)`
    - [ ] `chapters = [...]` (list built above)

- [x] **Task 2: Implement `write_book_json()` function in `vnthuquan_crawler.py`** (AC: #2, #3)
  - [ ] Add function signature: `def write_book_json(book_data: BookData, output_dir: Path) -> Path`
  - [ ] Compute target directory: `output_dir / "book-data" / "vnthuquan" / book_data.category_seo_name / book_data.book_seo_name`
  - [ ] **Slug collision check:**
    - [ ] If `target_dir / "book.json"` exists, read its `book_id` field
    - [ ] Parse existing `book_id` via `json.loads(existing_path.read_text(encoding="utf-8"))["book_id"]`
    - [ ] If `existing_book_id != book_data.book_id`: apply suffix — compute `suffixed_slug = f"{book_data.book_seo_name}-{book_data.book_id}"`, update `book_data.book_seo_name = suffixed_slug`, recompute `target_dir` with new slug, log warning
    - [ ] If `existing_book_id == book_data.book_id`: proceed silently (overwrite)
  - [ ] Create directories: `target_dir.mkdir(parents=True, exist_ok=True)`
  - [ ] Serialize: `json_str = book_data.model_dump_json(by_alias=True)` — this uses pydantic's built-in serializer, which handles datetime→ISO 8601 and the `_meta` alias automatically
  - [ ] Write: `(target_dir / "book.json").write_text(json_str, encoding="utf-8")`
  - [ ] Return the final `Path` written to
  - [ ] Import `json`, `Path` at top of file (verify existing imports)

- [x] **Task 3: Integrate into `crawl_book()` in `vnthuquan_crawler.py`** (AC: #4)
  - [ ] Locate the existing `crawl_book(self, entry: BookListingEntry) -> bool` method
  - [ ] After all chapters are fetched, collect `chapters_html: list[str]` and `cover_url: str | None`
  - [ ] Track `cover_url` from `result.cover_image_url` on the FIRST chapter only (`i == 0`)
  - [ ] Append `result.content_html if result else ""` for each chapter; log warning on None result
  - [ ] Call `book_data = assemble_book_data(entry, detail, chapters_html, cover_url)`
  - [ ] Call `write_book_json(book_data, self.output_dir)`
  - [ ] Return `True` on success
  - [ ] Ensure `detail is None` early-return path still returns `False` without calling assembly/write
  - [ ] Implement using the exact pseudocode given in Dev Notes below

- [x] **Task 4: Write tests in `tests/test_vnthuquan_crawler.py`** (AC: #1, #2, #3, #4)
  - [ ] **AC #1 — `assemble_book_data` field mapping:**
    - [ ] Build minimal `BookListingEntry` and `BookDetail` fixtures (in-memory, no HTTP)
    - [ ] Call `assemble_book_data(entry, detail, chapters_html, cover_url)` and assert all top-level fields
    - [ ] Assert `meta.source == "vnthuquan"`, `meta.schema_version == "2.0"`
    - [ ] Assert `meta.built_at` is timezone-aware and within 5 seconds of `datetime.now(timezone.utc)`
    - [ ] Assert `book_id == detail.tuaid`, `book_seo_name == slugify_title(detail.book_name)`
    - [ ] Assert `publisher is None`, `publication_year is None`
    - [ ] Assert `cover_image_url` equals the `cover_url` argument passed in
    - [ ] Assert `total_chapters == len(detail.chapter_list)`
    - [ ] Assert each `ChapterEntry` has `page_count == 1` and `pages[0].sort_number == 1`
    - [ ] Assert `pages[0].page_number is None`
    - [ ] Assert `pages[0].html_content` matches the corresponding `chapters_html[i]` verbatim
    - [ ] Assert `chapter_id` matches `chuongid` from `detail.chapter_list`
    - [ ] Assert `cover_url=None` results in `cover_image_url is None`
  - [ ] **AC #2 — `write_book_json` file output:**
    - [ ] Use `tmp_path` pytest fixture as `output_dir`
    - [ ] Call `write_book_json(book_data, tmp_path)` with an assembled `BookData`
    - [ ] Assert file exists at `tmp_path / "book-data" / "vnthuquan" / {cat_slug} / {book_slug} / "book.json"`
    - [ ] Read file content and parse as JSON — assert `book_id`, `book_name`, `_meta.source` match
    - [ ] Assert raw HTML in `chapters[0].pages[0].htmlContent` is preserved verbatim (use HTML with `<p>` and `&amp;` entity — verify it's NOT decoded)
    - [ ] Assert file is valid UTF-8 (no encoding errors on read)
    - [ ] Assert `_meta.built_at` is a valid ISO 8601 datetime string in the JSON
  - [ ] **AC #3 — slug collision with different book_id:**
    - [ ] Pre-write a `book.json` with a different `book_id` at the expected target path
    - [ ] Call `write_book_json(book_data, tmp_path)` for a new book with the same slug
    - [ ] Assert the new file was written at the suffixed path `{slug}-{book_id}/book.json`
    - [ ] Assert `book_data.book_seo_name` was updated to the suffixed slug
    - [ ] Assert the original `book.json` at the non-suffixed path was NOT overwritten
  - [ ] **AC #3 — slug collision with same book_id (idempotent overwrite):**
    - [ ] Pre-write a `book.json` with the SAME `book_id` at the expected target path
    - [ ] Call `write_book_json(book_data, tmp_path)` again
    - [ ] Assert the file was overwritten silently (no suffix applied)
  - [ ] **AC #4 — `crawl_book` integration (unit test with mocks):**
    - [ ] Mock `self.fetch_book_detail` to return a `BookDetail`
    - [ ] Mock `self.fetch_chapter` to return a `ChapterParseResult` with `content_html` and `cover_image_url`
    - [ ] Mock `assemble_book_data` and `write_book_json` (or let them run against `tmp_path`)
    - [ ] Assert `crawl_book` returns `True`
    - [ ] Assert `cover_image_url` captured is from first chapter only
    - [ ] Assert that a None `ChapterParseResult` results in `""` in `chapters_html` and a logged warning

## Dev Notes

### Architecture Overview

This story adds two pure functions (`assemble_book_data`, `write_book_json`) and integrates them into the existing `crawl_book` method of `VnthuquanAdapter`. No new files are created — all code goes into `vnthuquan_crawler.py` and `tests/test_vnthuquan_crawler.py`.

**Critical constraints:**
- NEVER modify `models.py` — use `BookData`, `BookMeta`, `ChapterEntry`, `PageEntry` as-is
- NEVER modify `utils/slugify.py` — call `slugify_title()` from it as-is
- Raw HTML is stored verbatim — no cleaning, stripping, or entity manipulation
- `cover_image_url` comes ONLY from the first chapter (`i == 0`)
- State management (marking downloaded) is NOT done here — that is Story 3.2

### Field Mapping Table

| `BookData` Field | VNThuQuan Source |
|---|---|
| `meta.source` | `"vnthuquan"` (literal) |
| `meta.schema_version` | `"2.0"` (literal) |
| `meta.built_at` | `datetime.now(timezone.utc)` |
| `book_id` | `detail.tuaid` (int) |
| `book_name` | `detail.book_name` |
| `book_seo_name` | `slugify_title(detail.book_name)` |
| `cover_image_url` | `cover_url` argument (from first chapter Part 0) |
| `cover_image_local_path` | `None` |
| `author` | `entry.author_name` |
| `author_id` | `entry.author_id` |
| `publisher` | `None` |
| `publication_year` | `None` |
| `category_id` | `entry.category_id` |
| `category_name` | `entry.category_name` |
| `category_seo_name` | `slugify_title(entry.category_name)` |
| `total_chapters` | `len(detail.chapter_list)` |
| `id` | `f"vnthuquan__{book_seo_name}"` |
| `chapters[i].chapter_id` | `detail.chapter_list[i][0]` (chuongid, int) |
| `chapters[i].chapter_name` | `detail.chapter_list[i][1]` (ToC text) |
| `chapters[i].chapter_seo_name` | `slugify_title(chapter_name)` |
| `chapters[i].chapter_view_count` | `0` |
| `chapters[i].page_count` | `1` |
| `chapters[i].pages[0].sort_number` | `1` |
| `chapters[i].pages[0].page_number` | `None` |
| `chapters[i].pages[0].html_content` | `chapters_html[i]` (verbatim) |

**Key insight:** Each VNThuQuan chapter maps to exactly one `PageEntry`. `page_number` is always `None`. `sort_number` is always `1`.

### `assemble_book_data()` — Full Implementation Sketch

```python
from datetime import datetime, timezone
from pathlib import Path
import json

from models import BookData, BookMeta, ChapterEntry, PageEntry
from utils.slugify import slugify_title
from vnthuquan_parser import BookListingEntry, BookDetail


def assemble_book_data(
    entry: BookListingEntry,
    detail: BookDetail,
    chapters_html: list[str],
    cover_url: str | None,
) -> BookData:
    now = datetime.now(timezone.utc)
    book_seo_name = slugify_title(detail.book_name)
    category_seo_name = slugify_title(entry.category_name)

    chapters: list[ChapterEntry] = []
    for i, (chuongid, chapter_name) in enumerate(detail.chapter_list):
        html = chapters_html[i] if i < len(chapters_html) else ""
        chapters.append(
            ChapterEntry(
                chapter_id=chuongid,
                chapter_name=chapter_name,
                chapter_seo_name=slugify_title(chapter_name),
                chapter_view_count=0,
                page_count=1,
                pages=[PageEntry(sort_number=1, html_content=html)],
            )
        )

    return BookData(**{
        "_meta": BookMeta(source="vnthuquan", schema_version="2.0", built_at=now),
        "id": f"vnthuquan__{book_seo_name}",
        "book_id": detail.tuaid,
        "book_name": detail.book_name,
        "book_seo_name": book_seo_name,
        "cover_image_url": cover_url,
        "cover_image_local_path": None,
        "author": entry.author_name,
        "author_id": entry.author_id,
        "publisher": None,
        "publication_year": None,
        "category_id": entry.category_id,
        "category_name": entry.category_name,
        "category_seo_name": category_seo_name,
        "total_chapters": len(detail.chapter_list),
        "chapters": chapters,
    })
```

### `write_book_json()` — Full Implementation Sketch

```python
def write_book_json(book_data: BookData, output_dir: Path) -> Path:
    target_dir = (
        output_dir
        / "book-data"
        / "vnthuquan"
        / book_data.category_seo_name
        / book_data.book_seo_name
    )
    existing_path = target_dir / "book.json"

    if existing_path.exists():
        existing = json.loads(existing_path.read_text(encoding="utf-8"))
        existing_id = existing.get("book_id")
        if existing_id != book_data.book_id:
            slug = book_data.book_seo_name
            new_slug = f"{slug}-{book_data.book_id}"
            logger.warning(
                f"[vnthuquan] Slug collision: {slug} already exists for "
                f"book_id={existing_id}, using {new_slug}"
            )
            book_data.book_seo_name = new_slug
            target_dir = target_dir.parent / new_slug

    target_dir.mkdir(parents=True, exist_ok=True)
    out_path = target_dir / "book.json"
    out_path.write_text(book_data.model_dump_json(by_alias=True), encoding="utf-8")
    return out_path
```

**Note on `model_dump_json(by_alias=True)`:** Pydantic v2's `model_dump_json` handles `datetime` → ISO 8601, and `by_alias=True` ensures `BookData.meta` is written as `_meta` in the JSON (matching the `Field(..., alias="_meta")` declaration in `models.py`). The `BookMeta` fields (`source`, `schema_version`, `built_at`) are serialized under `_meta`. The JSON keys for `ChapterEntry.pages[].sort_number` and `html_content` are snake_case since `PageEntry` has no aliases.

### `crawl_book()` — Integration Code (Exact Pseudocode)

```python
async def crawl_book(self, entry: BookListingEntry) -> bool:
    detail = await self.fetch_book_detail(entry)
    if detail is None:
        # mark error in state — handled by Story 3.2
        return False

    chapters_html: list[str] = []
    cover_url: str | None = None

    for i, (chuongid, _) in enumerate(detail.chapter_list):
        result = await self.fetch_chapter(detail.tuaid, chuongid)
        html = result.content_html if result else None
        if html is None:
            logger.warning(
                f"[vnthuquan] Empty chapter {chuongid} in book {detail.tuaid}"
            )
            html = ""
        chapters_html.append(html)
        if i == 0 and result:
            cover_url = result.cover_image_url

    book_data = assemble_book_data(entry, detail, chapters_html, cover_url)
    write_book_json(book_data, self.output_dir)
    return True
```

### Output Path Structure

```
{output_dir}/
  book-data/
    vnthuquan/
      {category_seo_name}/           # e.g. "truyen-ngan"
        {book_seo_name}/             # e.g. "bau-troi-chung"
          book.json
```

`output_dir` is `self.output_dir` on `VnthuquanAdapter` — a `Path` object set at adapter construction time. In tests, use pytest's `tmp_path` fixture.

### Slug Collision Handling — Detail

Collisions occur when two different books produce the same `slugify_title(book_name)`. The resolution strategy:

1. Check if `target_dir / "book.json"` exists before writing
2. If it does, read `book_id` from the existing file (one JSON key lookup — no full parse needed)
3. **Different `book_id`:** suffix slug with `-{new_book_id}`, update `book_data.book_seo_name`, recompute `target_dir`, log warning
4. **Same `book_id`:** overwrite silently — idempotent re-crawl behavior

Suffixed path example: `bat-nha-ba-la-mat-da-tam-kinh-42/book.json`

The warning log format must match exactly:
```
[vnthuquan] Slug collision: {slug} already exists for book_id={existing_id}, using {slug}-{new_id}
```

### Pydantic v2 Instantiation with Alias

`BookData` uses `Field(..., alias="_meta")` for the `meta` field. When constructing with keyword arguments, use the alias form in a dict unpack:

```python
BookData(**{"_meta": meta_instance, "book_id": 42, ...})
```

This works because `BookData` has `model_config = ConfigDict(populate_by_name=True)`, which allows population by both the field name (`meta`) AND the alias (`_meta`). Either form works; use `_meta` to match the JSON output key.

### Serialization Behavior

`model_dump_json(by_alias=True)` produces JSON like:

```json
{
  "_meta": {
    "source": "vnthuquan",
    "schema_version": "2.0",
    "built_at": "2026-04-15T10:23:45.123456+00:00"
  },
  "id": "vnthuquan__bau-troi-chung",
  "book_id": 12345,
  "book_name": "bầu trời chung",
  "book_seo_name": "bau-troi-chung",
  "cover_image_url": null,
  "cover_image_local_path": null,
  "author": "trần hà yên",
  "author_id": 9936,
  "publisher": null,
  "publication_year": null,
  "category_id": 1,
  "category_name": "Truyện ngắn",
  "category_seo_name": "truyen-ngan",
  "total_chapters": 1,
  "chapters": [
    {
      "chapter_id": 0,
      "chapter_name": "Chương 1",
      "chapter_seo_name": "chuong-1",
      "chapter_view_count": 0,
      "page_count": 1,
      "pages": [
        {
          "page_number": null,
          "sort_number": 1,
          "html_content": "<p>content here</p>",
          "original_html_content": null
        }
      ]
    }
  ]
}
```

### Raw HTML Preservation — Test Requirement

When verifying AC #2, use an HTML string that includes entities to confirm no transformation occurs:

```python
chapters_html = ["<p>Nội dung &amp; bài học</p>"]
# After write + read, assert:
assert parsed["chapters"][0]["pages"][0]["html_content"] == "<p>Nội dung &amp; bài học</p>"
```

`model_dump_json` encodes the string as JSON (so `"` becomes `\"` in JSON encoding) but does NOT HTML-decode entities. `&amp;` stays `&amp;`.

### BookDetail Structure (from Story 2.3)

From `vnthuquan_parser.py`, `BookDetail` is a dataclass with at minimum:
- `tuaid: int` — book ID
- `book_name: str` — title
- `chapter_list: list[tuple[int, str]]` — list of `(chuongid, chapter_name)` pairs in ToC order

Single-chapter books have `chapter_list = [(0, book_name)]` where `chuongid = 0`.

### ChapterParseResult Structure (from Story 1.3)

From `vnthuquan_parser.py`, `ChapterParseResult` is a dataclass with at minimum:
- `content_html: str` — AJAX Part 2 content (raw HTML)
- `cover_image_url: str | None` — CSS background-image URL extracted from Part 0

Only the first chapter's `cover_image_url` is used; all others are discarded.

### Imports to Add/Verify in `vnthuquan_crawler.py`

```python
import json
from datetime import datetime, timezone
from pathlib import Path
from models import BookData, BookMeta, ChapterEntry, PageEntry
from utils.slugify import slugify_title
```

Verify these are not already present before adding — avoid duplicate imports.

### Testing Fixtures — Minimal In-Memory Setup

```python
from vnthuquan_parser import BookListingEntry, BookDetail, ChapterParseResult

def make_entry() -> BookListingEntry:
    return BookListingEntry(
        url="truyen.aspx?tid=abc",
        title="bầu trời chung",
        author_name="trần hà yên",
        author_id=9936,
        category_name="Truyện ngắn",
        category_id=1,
        chapter_count=1,
        date="9.4.2026",
        format_type="Text",
    )

def make_detail() -> BookDetail:
    return BookDetail(
        tuaid=12345,
        book_name="bầu trời chung",
        chapter_list=[(0, "Chương 1")],
    )
```

Adjust field names to match the actual `BookListingEntry` and `BookDetail` dataclass definitions implemented in Epics 1 and 2.

### Running Tests

```bash
cd apps/crawler && uv run pytest tests/test_vnthuquan_crawler.py -v
```

To run only the new assembly/write tests (once a marker or naming convention is in place):

```bash
cd apps/crawler && uv run pytest tests/test_vnthuquan_crawler.py -v -k "assemble or write_book"
```

Full suite (must not regress):

```bash
cd apps/crawler && uv run pytest tests/ -v
```

### Project Structure Notes

Files modified by this story:

- **MODIFY:** `apps/crawler/vnthuquan_crawler.py`
  - Add `assemble_book_data()` function (module-level, not a method)
  - Add `write_book_json()` function (module-level, not a method)
  - Modify `VnthuquanAdapter.crawl_book()` to call both functions
  - Add/verify imports: `json`, `datetime`, `timezone`, `Path`, `BookData`, `BookMeta`, `ChapterEntry`, `PageEntry`, `slugify_title`
- **MODIFY:** `apps/crawler/tests/test_vnthuquan_crawler.py`
  - Add tests for `assemble_book_data` (AC #1)
  - Add tests for `write_book_json` including slug collision (AC #2, #3)
  - Add integration test for `crawl_book` with mocks (AC #4)

Files NOT modified:

- `apps/crawler/models.py` — frozen, do not touch
- `apps/crawler/utils/slugify.py` — frozen, do not touch
- `apps/crawler/vnthuquan_parser.py` — frozen for this story
- Any file outside `apps/crawler/`

### References

- [Source: _bmad-output/planning-artifacts/phase-1-1-vnthuquan-crawler/epics-vnthuquan-crawler.md#Story 3.1]
- [Source: _bmad-output/planning-artifacts/phase-1-1-vnthuquan-crawler/architecture-vnthuquan-crawler.md#BookData v2.0 Output]
- [Source: apps/crawler/models.py#BookData, BookMeta, ChapterEntry, PageEntry]
- [Source: Story 1.1: Listing Page Parser — BookListingEntry definition]
- [Source: Story 2.3: Book Detail & Chapter Fetching — BookDetail, ChapterParseResult definitions]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- Story Dev Notes say `detail.book_name` but actual `BookDetail` dataclass field is `detail.title` — used `detail.title` throughout.
- `crawl_book` uses `self._output_dir` (private attribute), not `self.output_dir`.

### Completion Notes List

- Added `assemble_book_data()` and `write_book_json()` module-level functions to `vnthuquan_crawler.py`.
- Updated `crawl_book()` to call both functions after chapter collection.
- Added `json`, `datetime`, `timezone`, `BookData`, `BookMeta`, `ChapterEntry`, `PageEntry`, `slugify_title` imports.
- 6 new tests added; all 38 tests pass; 230 total pass.

### File List

- `apps/crawler/vnthuquan_crawler.py` — MODIFIED: new imports, assemble_book_data/write_book_json functions, updated crawl_book
- `apps/crawler/tests/test_vnthuquan_crawler.py` — MODIFIED: 6 Story 3.1 tests, json/datetime imports

## Change Log

- 2026-04-16: Story 3.1 implemented — BookData v2 assembly, write_book_json with slug-collision, integrated into crawl_book, 6 tests (Date: 2026-04-16)
