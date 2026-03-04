---
title: 'Book-Data JSON Restructure: One File Per Book'
slug: 'book-data-json-restructure'
created: '2026-03-05'
status: 'implementation-complete'
stepsCompleted: [1, 2, 3, 4, 5]
tech_stack: [Python, Pydantic, aiohttp, asyncio]
files_to_modify: [models.py, utils/api_adapter.py, tests/test_api_adapter.py]
code_patterns: [pydantic_v2, filesystem_handoff, idempotency_state]
test_patterns: [pytest_asyncio, mock_session]
---

# Book-Data JSON Restructure: One File Per Book

## Problem Statement

The current pipeline saves one JSON file per chapter under a nested folder:
```
data/book-data/vbeta/{category_seo}/{book_seo}/{chapter_seo}.json
```
Example of what currently exists:
```
data/book-data/vbeta/kinh/bo-trung-quan/         ← folder
    chapter-1.json
    chapter-2.json
    ...
```

The desired format is **one JSON file per book** that contains the full book info plus all its chapters (including all their pages):
```
data/book-data/vbeta/kinh/bo-trung-quan.json     ← single file
```

## Feasibility Analysis

**✅ YES, this is fully achievable.** Key reasons:

1. **Raw data is already saved.** The crawler saves raw API responses in `data/raw/vbeta/` (categories, books per category, TOC per book, pages per chapter). When you delete old `book-data` and re-run, the pipeline can read from these raw files to reconstruct book-data without re-crawling.

2. **Idempotency is already tracked per chapter URL.** The existing `crawl-state.json` uses the chapter API URL as the key. During a rebuild-from-raw-data run, chapters already marked as `downloaded` cause the network fetch to be skipped; the build step uses disk-existence of the output book JSON to skip.

3. **Pipeline splits cleanly into two phases:**
   - **Phase 1 – Crawl:** Fetch from API → save to `data/raw/vbeta/` (skip if raw file exists on disk)
   - **Phase 2 – Build:** Read from `data/raw/vbeta/` → aggregate all chapters per book → write single `{book_seo}.json` (skip if target file already exists)

---

## New Output Schema (`BookData` model)

Replace `ChapterBookData` (one-chapter model) with a `BookData` model (whole-book model):

**File path:** `data/book-data/vbeta/{category_seo}/{book_seo}.json`

```json
{
  "_meta": {
    "source": "vbeta",
    "schema_version": "2.0",
    "built_at": "2026-03-05T00:00:00Z"
  },
  "id": "vbeta__bo-trung-quan",
  "book_id": 42,
  "book_name": "Bộ Trung Quán",
  "book_seo_name": "bo-trung-quan",
  "cover_image_url": "https://api.phapbao.org/...",
  "author": "Hòa thượng Thích Minh Châu dịch",
  "author_id": 1,
  "publisher": "Viện Nghiên Cứu Phật Học Việt Nam",
  "publication_year": 2000,
  "category_id": 1,
  "category_name": "Kinh",
  "category_seo_name": "kinh",
  "total_chapters": 5,
  "chapters": [
    {
      "chapter_id": 12439,
      "chapter_name": "1. Chương Một",
      "chapter_seo_name": "chuong-mot",
      "chapter_view_count": 123,
      "page_count": 10,
      "pages": [
        { "page_number": 1, "sort_number": 1, "html_content": "<div>...</div>" }
      ]
    }
  ]
}
```

---

## Two-Phase Pipeline Design

```
Phase 1 – CRAWL (network + raw save):
  For each category → book → chapter:
    Check disk: data/raw/vbeta/categories.json exists?              → skip categories fetch
    Check disk: data/raw/vbeta/books/by_category_{cat_id}.json?    → skip books fetch
    Check disk: data/raw/vbeta/toc/book_{book_id}.json?            → skip TOC fetch
    Check disk: data/raw/vbeta/chapters/{chapter_id}.json?         → skip chapter fetch

Phase 2 – BUILD book-data (pure transform, no network):
  For each book (discovered from raw/toc/ files):
    Check disk: data/book-data/vbeta/{cat_seo}/{book_seo}.json?    → skip entire book
    Read raw toc/book_{book_id}.json → extract chapter ids
    Read each raw chapters/{chapter_id}.json
    Aggregate into BookData model
    Write single {cat_seo}/{book_seo}.json
```

### Skip Logic Summary

| Condition | Skip what |
|---|---|
| `data/raw/vbeta/categories.json` exists | Categories API fetch |
| `data/raw/vbeta/books/by_category_{cat_id}.json` exists | Books-per-category API fetch |
| `data/raw/vbeta/toc/book_{book_id}.json` exists | TOC API fetch |
| `data/raw/vbeta/chapters/{chapter_id}.json` exists | Chapter pages API fetch |
| `data/book-data/vbeta/{cat_seo}/{book_seo}.json` exists | Entire book build step |

> **Note:** Phase 1 checks disk existence BEFORE hitting the network (dual guard: disk check + `crawl-state.json`). This handles the case where raw files exist from a previous run but state was reset or corrupted.

---

## Implementation Tasks

### Task 1 — `models.py`: Add new Pydantic models

**File:** [`models.py`](file:///Users/minhtrucnguyen/working/monkai/models.py)

**Add** the following models after the existing `ChapterBookData` class:

```python
# ─── New Book-level Domain Layer (schema v2.0) ──────────────────────────

class BookMeta(BaseModel):
    source: str = "vbeta"
    schema_version: str = "2.0"
    built_at: datetime


class ChapterEntry(BaseModel):
    """A chapter with its pages, embedded inside BookData."""
    chapter_id: int
    chapter_name: str
    chapter_seo_name: str
    chapter_view_count: int = 0
    page_count: int
    pages: list[PageEntry]


class BookData(BaseModel):
    """
    Canonical output format v2: one file per book.
    Path: data/book-data/vbeta/{cat_seo}/{book_seo}.json
    """
    meta: BookMeta = Field(..., alias="_meta")
    id: str                                  # e.g. "vbeta__bo-trung-quan"
    book_id: int
    book_name: str
    book_seo_name: str
    cover_image_url: str | None = None
    author: str | None = None
    author_id: int | None = None
    publisher: str | None = None
    publication_year: int | None = None
    category_id: int
    category_name: str
    category_seo_name: str
    total_chapters: int
    chapters: list[ChapterEntry]
    model_config = ConfigDict(populate_by_name=True)
```

**Mark** `ChapterBookData` as deprecated with a docstring note (do not remove — existing crawled data references it).

---

### Task 2 — `utils/api_adapter.py`: Refactor into two phases

**File:** [`utils/api_adapter.py`](file:///Users/minhtrucnguyen/working/monkai/utils/api_adapter.py)

**Add imports** at top:
```python
from models import (
    ...,          # existing imports
    BookMeta,
    ChapterEntry,
    BookData,
)
import datetime
```

**Add** `_raw_file_exists(path_parts: list[str]) -> bool` helper:
```python
def _raw_file_exists(self, path_parts: list[str]) -> bool:
    """Check if a raw file exists on disk."""
    raw_dir = self.output_dir / "raw" / self.config.output_folder
    return raw_dir.joinpath(*path_parts).exists()

def _book_data_exists(self, cat_seo: str, book_seo: str) -> bool:
    """Check if a processed book-data file already exists."""
    path = self.output_dir / "book-data" / self.config.output_folder / cat_seo / f"{book_seo}.json"
    return path.exists()
```

**Replace** `process_all()` with:
```python
async def process_all(self):
    """Main orchestrator: Phase 1 crawl raw data, Phase 2 build book JSONs."""
    logger.info(f"[api_adapter] Phase 1: Crawling raw data for {self.config.name}")
    book_registry = await self._crawl_phase()   # returns list of (book_id, cat_seo, book_seo)

    logger.info(f"[api_adapter] Phase 2: Building book-data for {len(book_registry)} books")
    self._build_phase(book_registry)
```

**Add** `_crawl_phase()` — same logic as current `process_all()` but with disk-existence checks before each API call, and no `_save_canonical()` call. Returns a registry list:
```python
async def _crawl_phase(self) -> list[tuple[int, str, str]]:
    """
    Fetch all levels from API → save raw JSON.
    Skips any level whose raw file already exists on disk.
    Returns list of (book_id, cat_seo_name, book_seo_name).
    """
    book_registry = []
    
    # Level 1: Categories
    if self._raw_file_exists(["categories.json"]):
        logger.info("[api_adapter] Skip (disk): categories.json")
        with open(self.output_dir / "raw" / self.config.output_folder / "categories.json") as f:
            raw = json.load(f)
        categories = [ApiCategory(**c) for c in raw.get("result", [])]
    else:
        categories = await self.fetch_categories()

    for cat in categories:
        cat_seo = cat.seo_name or slugify_title(cat.label)

        # Level 2: Books per category
        if self._raw_file_exists(["books", f"by_category_{cat.value}.json"]):
            logger.info(f"[api_adapter] Skip (disk): books/by_category_{cat.value}.json")
            with open(self.output_dir / "raw" / self.config.output_folder / "books" / f"by_category_{cat.value}.json") as f:
                raw = json.load(f)
            books = [ApiBookSelectItem(**b) for b in raw.get("result", [])]
        else:
            books = await self.fetch_books_for_category(cat.value)

        for book_item in books:
            # Level 3a: TOC
            if self._raw_file_exists(["toc", f"book_{book_item.value}.json"]):
                logger.info(f"[api_adapter] Skip (disk): toc/book_{book_item.value}.json")
                with open(self.output_dir / "raw" / self.config.output_folder / "toc" / f"book_{book_item.value}.json") as f:
                    toc_data = json.load(f)
            else:
                toc_data = await self.fetch_toc_for_book(book_item.value)
                if not toc_data:
                    continue

            try:
                result = toc_data.get("result")
                if not result:
                    continue
                book_detail = ApiBookDetail(**result)
                toc_items = [ApiTocItem(**item) for item in result.get("tableOfContents", {}).get("items", [])]
            except Exception as e:
                logger.error(f"[api_adapter] Failed to parse TOC for book {book_item.value}: {e}")
                continue

            book_registry.append((book_item.value, cat_seo, book_detail.seo_name))

            for toc_item in toc_items:
                chapter_id = toc_item.id
                api_chapter_url = self._get_chapter_url(chapter_id)

                # Level 3b: Chapter pages — check disk first, then state
                if self._raw_file_exists(["chapters", f"{chapter_id}.json"]):
                    logger.info(f"[api_adapter] Skip (disk): chapters/{chapter_id}.json")
                    continue

                if self.state.is_downloaded(api_chapter_url):
                    logger.info(f"[api_adapter] Skip (state): {api_chapter_url}")
                    continue

                pages_data = await self.fetch_chapter_pages(chapter_id)
                if not pages_data:
                    self.state.mark_error(api_chapter_url)
                    self.state.save()
                    continue

                self.state.mark_downloaded(api_chapter_url)
                self.state.save()
                logger.info(f"[api_adapter] Crawled: chapters/{chapter_id}.json")

    return book_registry
```

**Add** `_build_phase()`:
```python
def _build_phase(self, book_registry: list[tuple[int, str, str]]) -> None:
    """
    Read raw data → aggregate → write one BookData JSON per book.
    Skips books whose output file already exists.
    """
    import datetime

    for book_id, cat_seo, book_seo in book_registry:
        if self._book_data_exists(cat_seo, book_seo):
            logger.info(f"[api_adapter] Skip (exists): book-data/{cat_seo}/{book_seo}.json")
            continue

        toc_path = self.output_dir / "raw" / self.config.output_folder / "toc" / f"book_{book_id}.json"
        if not toc_path.exists():
            logger.warning(f"[api_adapter] Missing TOC raw file for book {book_id}, skipping build")
            continue

        try:
            with open(toc_path) as f:
                toc_data = json.load(f)

            result = toc_data["result"]
            book_detail = ApiBookDetail(**result)
            toc_items = [ApiTocItem(**item) for item in result.get("tableOfContents", {}).get("items", [])]

            chapters: list[ChapterEntry] = []
            for toc_item in toc_items:
                chapter_path = self.output_dir / "raw" / self.config.output_folder / "chapters" / f"{toc_item.id}.json"
                if not chapter_path.exists():
                    logger.warning(f"[api_adapter] Missing chapter raw file {toc_item.id}, skipping chapter")
                    continue

                with open(chapter_path) as f:
                    ch_data = json.load(f)

                raw_pages = ch_data["result"].get("pages", [])
                pages = [PageEntry(
                    page_number=p.get("pageNumber"),
                    sort_number=p["sortNumber"],
                    html_content=p["htmlContent"]
                ) for p in raw_pages]

                chapters.append(ChapterEntry(
                    chapter_id=toc_item.id,
                    chapter_name=toc_item.name,
                    chapter_seo_name=toc_item.seo_name,
                    chapter_view_count=toc_item.view_count,
                    page_count=len(pages),
                    pages=pages
                ))

            book_data = BookData(
                _meta=BookMeta(built_at=datetime.datetime.now(datetime.timezone.utc)),
                id=f"{self.config.name}__{book_seo}",
                book_id=book_detail.id,
                book_name=book_detail.name,
                book_seo_name=book_detail.seo_name,
                cover_image_url=book_detail.cover_image_url,
                author=book_detail.author,
                author_id=book_detail.author_id,
                publisher=book_detail.publisher,
                publication_year=book_detail.publication_year,
                category_id=book_detail.category_id,
                category_name=book_detail.category_name,
                category_seo_name=cat_seo,
                total_chapters=len(chapters),
                chapters=chapters
            )

            self._save_book_data(book_data, cat_seo)
            logger.info(f"[api_adapter] Built: book-data/{cat_seo}/{book_seo}.json ({len(chapters)} chapters)")

        except Exception as e:
            logger.error(f"[api_adapter] Error building book {book_id} ({book_seo}): {e}")
```

**Add** `_save_book_data()`:
```python
def _save_book_data(self, book_data: BookData, cat_seo: str) -> None:
    """Save canonical BookData JSON: one file per book."""
    out_path = (
        self.output_dir / "book-data" / self.config.output_folder
        / cat_seo / f"{book_data.book_seo_name}.json"
    )
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(book_data.model_dump_json(by_alias=True, indent=2))
```

**Remove** `_save_canonical()` method (no longer needed).

---

### Task 3 — `tests/test_api_adapter.py`: Update and add tests

**File:** [`tests/test_api_adapter.py`](file:///Users/minhtrucnguyen/working/monkai/tests/test_api_adapter.py)

Add the following 4 new test cases:

**Test 1** — `test_crawl_phase_skips_chapter_if_raw_exists`
- Given: `chapters/12439.json` exists in `tmp_path/raw/vbeta/`
- When: `_crawl_phase()` is called
- Then: `session.get` is NOT called for the chapter endpoint

**Test 2** — `test_crawl_phase_skips_categories_if_raw_exists`
- Given: `categories.json` exists in `tmp_path/raw/vbeta/`
- When: `_crawl_phase()` is called
- Then: `session.get` is NOT called for the categories endpoint, file is read from disk instead

**Test 3** — `test_build_phase_creates_book_json`
- Given: `toc/book_1.json` and `chapters/12439.json` exist in raw dir with known content
- When: `_build_phase([(1, "kinh", "book-1")])` is called
- Then: `book-data/vbeta/kinh/book-1.json` is created; assert `chapters` list length and `total_chapters` match

**Test 4** — `test_build_phase_skips_if_book_json_exists`
- Given: `book-data/vbeta/kinh/book-1.json` already exists
- When: `_build_phase([(1, "kinh", "book-1")])` is called
- Then: file is not overwritten (use mtime or mock `open` to verify no write occurred)

---

## In Scope

- New `BookMeta`, `ChapterEntry`, `BookData` Pydantic models in `models.py`
- Refactor `VbetaApiAdapter.process_all()` → `_crawl_phase()` + `_build_phase()`
- Disk-existence checks for raw skip logic at all 4 API levels
- New `{book_seo}.json` output generation
- 4 new tests in `test_api_adapter.py`

## Out of Scope

- Migration script for existing legacy `book-data` folders (delete manually and re-run)
- `indexer.py` update (Phase 2 handoff — separate follow-up story)
- Any changes to `data/raw/` structure

---

## Verification Plan

### Automated Tests
```bash
# Run full test suite:
uv run pytest tests/ -v

# Run only api_adapter tests:
uv run pytest tests/test_api_adapter.py -v
```

### Manual Verification
1. **Wipe book-data:** `rm -rf data/book-data/vbeta/`
2. **Run pipeline (rebuild from raw, no network):** `uv run python crawler.py crawl --source vbeta`
3. **Assert file structure:** `data/book-data/vbeta/kinh/bo-trung-quan.json` must be a **file**, not a directory
4. **Assert file content:** Open JSON → confirm top-level `chapters[]` array, each with nested `pages[]`
5. **Assert idempotency:** Run again → all steps skipped, zero API calls made
