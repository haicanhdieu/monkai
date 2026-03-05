---
title: 'Image Download + Book Folder Restructure'
slug: 'image-download-book-folder-restructure'
created: '2026-03-05'
status: 'ready-for-dev'
stepsCompleted: [1, 2, 3, 4]
tech_stack: [Python, Pydantic, aiohttp, asyncio]
files_to_modify: [models.py, utils/api_adapter.py, indexer.py, tests/test_api_adapter.py, tests/test_indexer.py, tests/test_e2e_pipeline.py]
code_patterns: [pydantic_v2, two_phase_pipeline, idempotency_state, disk_existence_check]
test_patterns: [pytest_asyncio, mock_session, tmp_path]
---

# Tech-Spec: Image Download + Book Folder Restructure

**Created:** 2026-03-05

## Overview

### Problem Statement

The current pipeline crawls text content only (chapter HTML). Two gaps exist:
1. **Images not downloaded**: Cover images (from `ApiBookDetail.cover_image_url`) and embedded content images (`<img>` tags in `page.html_content`) are referenced by URL only — not downloaded.
2. **Single-file book-data layout does not scale**: Currently `data/book-data/vbeta/{cat}/{book_seo}.json` is one file. Once we add images, EPUB, MOBI, etc., we need a folder per book to group all artifacts together.

### Solution

**Phase 1 — Crawl**: During `_crawl_phase()`, extract image URLs from each book (cover + `<img>` tags in HTML pages), download them, and save to `data/raw/vbeta/images/{book_id}/`.

**Phase 2 — Build**: During `_build_phase()`, switch from writing `{book_seo}.json` to writing a folder `{book_seo}/book.json`. Copy downloaded images from raw to `data/book-data/vbeta/{cat}/{book_seo}/images/`. Update `book.json` to reference local image paths.

**Indexer**: Update `scan_book_manifests()` and `build_book_data_index()` to find `book.json` inside book folders instead of `{book_seo}.json` files directly under the category folder.

### Scope

**In Scope:**
- Download cover images (from `cover_image_url` in TOC API response) during Phase 1
- Extract and download `<img src="...">` URLs from `page.html_content` during Phase 1
- Store raw images in `data/raw/vbeta/images/{book_id}/{filename}`
- Restructure book-data output from `{book_seo}.json` → `{book_seo}/book.json` + `{book_seo}/images/`
- Copy images from raw to book-data folder during Phase 2
- Update `book.json` model to include `cover_image_local_path` and image references in pages
- Update `models.py`: new `BookImage` model, updated `BookData` and `PageEntry`
- Update `indexer.py` to find `book.json` inside book folders
- Update `_book_data_exists()` to check for folder existence
- New and updated tests for all changed behaviors
- Update `BookArtifact` format list to differentiate `json`/`image` types

**Out of Scope:**
- EPUB/MOBI generation (separate future epic)
- Migration script for existing single-file `book-data` (delete manually and re-run)
- Image resizing or optimization
- Any changes to `data/raw/` categories/books/toc/chapters structure (only adding `images/`)

---

## Context for Development

### Codebase Patterns

- **Two-phase pipeline**: `_crawl_phase()` fetches from API + saves to `data/raw/vbeta/`. `_build_phase()` reads raw → writes to `data/book-data/vbeta/`. This split must be preserved.
- **Disk-existence idempotency**: Every level checks if raw file/folder exists before fetching/building. Image download must follow the same pattern: `data/raw/vbeta/images/{book_id}/` exists → skip image download for that book.
- **`_raw_file_exists()` helper**: Uses `self.output_dir / "raw" / self.config.output_folder` as base. Image existence check should use a similar helper or extend this.
- **`_save_raw()` helper**: Writes raw dict to JSON. Images are binary — need a separate `_save_raw_image()` method that writes bytes.
- **`_book_data_exists()` helper**: Currently checks for a `.json` file. Must change to check for a folder: `data/book-data/vbeta/{cat}/{book_seo}/` directory exists.
- **`_save_book_data()` method**: Currently writes to `{cat}/{book_seo}.json`. Must write to `{cat}/{book_seo}/book.json` and create the folder.
- **Pydantic v2**: All models use `ConfigDict(populate_by_name=True)` pattern and `Field(..., alias="...")` for camelCase API fields.
- **Concurrency**: `_crawl_phase()` uses `asyncio.Semaphore(5)` for concurrent book processing. Image download should run within the same semaphore scope.

### Files to Reference

| File | Purpose |
| ---- | ------- |
| [`utils/api_adapter.py`](file:///Users/minhtrucnguyen/working/monkai/utils/api_adapter.py) | Main pipeline: `_crawl_phase()`, `_build_phase()`, `_save_book_data()`, `_book_data_exists()` |
| [`models.py`](file:///Users/minhtrucnguyen/working/monkai/models.py) | `BookData`, `ChapterEntry`, `PageEntry`, `BookArtifact`, `BookIndexEntry` |
| [`indexer.py`](file:///Users/minhtrucnguyen/working/monkai/indexer.py) | `scan_book_manifests()`, `build_book_data_index()` — must find `book.json` in folders |
| [`tests/test_api_adapter.py`](file:///Users/minhtrucnguyen/working/monkai/tests/test_api_adapter.py) | Existing tests: `_TOC_RAW`, `_CHAPTER_RAW` fixtures, 4 phase tests to update/extend |
| [`tests/test_indexer.py`](file:///Users/minhtrucnguyen/working/monkai/tests/test_indexer.py) | Indexer tests — must update to expect `book.json` in subfolder |

### Technical Decisions

1. **Image URL extraction**: Use `re.findall(r'<img[^>]+src=["\']([^"\']+)["\']', html)` — no BeautifulSoup dependency needed, keeps it lightweight.
2. **Image filename derivation**: Use `urllib.parse.urlparse(url).path.rsplit('/', 1)[-1]` to preserve original filename. If the filename is empty or ambiguous (e.g. `.svg`, query-string URLs), generate a deterministic name: `f"img_{hashlib.md5(url.encode()).hexdigest()[:8]}{ext}"`.
3. **Raw image directory**: `data/raw/vbeta/images/{book_id}/` — one subfolder per book_id. Idempotency: if the folder already exists AND is non-empty, skip image download for that book.
4. **Book-data folder structure**:
   ```
   data/book-data/vbeta/{cat_seo}/{book_seo}/
       book.json          ← was previously {book_seo}.json
       images/
           cover.jpg      ← downloaded cover image (if any)
           img_abc12345.jpg  ← content images
   ```
5. **`book.json` local image paths**: Store paths relative to `data/book-data/` root (consistent with `BookArtifact.path`). E.g. `cover_image_local_path: "vbeta/kinh/bo-trung-quan/images/cover.jpg"`.
6. **`PageEntry` `html_content` rewrite**: In `_build_phase()`, after copying images, rewrite `<img src="ORIGINAL_URL">` → `<img src="RELATIVE_LOCAL_PATH">` in the stored HTML. Original URL preserved in `page.original_html_content`.
7. **`_book_data_exists()` change**: Check `(output_dir / "book-data" / source / cat_seo / book_seo).is_dir()` instead of file `.exists()`.
8. **`BookArtifact` format**: Add `"image"` as a valid format alongside `"json"`, `"epub"`, `"mobi"`.
9. **HTTP image download**: Reuse `self.session` (aiohttp). Use `session.get(url, allow_redirects=True)` and read raw bytes. Apply the same rate-limit jitter logic.

---

## Implementation Plan

### Task 1 — `models.py`: Update models

**File:** [`models.py`](file:///Users/minhtrucnguyen/working/monkai/models.py)

**1a. Update `PageEntry`** — add optional `original_html_content` field:
```python
class PageEntry(BaseModel):
    page_number: int | None = None
    sort_number: int
    html_content: str                        # may have local img paths post-build
    original_html_content: str | None = None # original HTML with remote URLs (set during build)
```

**1b. Update `BookData`** — add `cover_image_local_path` field:
```python
class BookData(BaseModel):
    ...
    cover_image_url: str | None = None        # remote URL (unchanged)
    cover_image_local_path: str | None = None # relative path to local copy, e.g. "vbeta/kinh/slug/images/cover.jpg"
    ...
```

**1c. Update `BookArtifact`** — `format` field accepts `"image"`:
```python
class BookArtifact(BaseModel):
    source: str
    format: str   # "json", "epub", "mobi", "image" — no Literal constraint, extensible
    path: str
    built_at: datetime
```

**No other model changes needed.** `ChapterEntry`, `BookMeta`, `BookIndexEntry` remain unchanged.

---

### Task 2 — `utils/api_adapter.py`: Add image download to Phase 1

**File:** [`utils/api_adapter.py`](file:///Users/minhtrucnguyen/working/monkai/utils/api_adapter.py)

**2a. Add imports** at top:
```python
import re
import hashlib
from urllib.parse import urlparse
```

**2b. Add `_extract_image_urls(html_pages: list[dict]) -> list[str]` static helper**:
```python
@staticmethod
def _extract_image_urls(pages_data_list: list[dict]) -> list[str]:
    """Extract unique <img src=...> URLs from a list of raw page dicts."""
    seen: set[str] = set()
    result: list[str] = []
    for page in pages_data_list:
        html = page.get("htmlContent", "")
        for url in re.findall(r'<img[^>]+src=["\']([^"\']+)["\']', html):
            if url not in seen:
                seen.add(url)
                result.append(url)
    return result
```

**2c. Add `_derive_image_filename(url: str) -> str` static helper**:
```python
@staticmethod
def _derive_image_filename(url: str) -> str:
    """Derive a safe local filename from an image URL."""
    path = urlparse(url).path
    name = path.rsplit("/", 1)[-1] if "/" in path else path
    if not name or len(name) > 100:
        ext = path.rsplit(".", 1)[-1][:4] if "." in path else "img"
        name = f"img_{hashlib.md5(url.encode()).hexdigest()[:8]}.{ext}"
    return name
```

**2d. Add `_save_raw_image(path_parts: list[str], data: bytes) -> Path` method**:
```python
def _save_raw_image(self, path_parts: list[str], data: bytes) -> Path:
    """Save raw image bytes to data/raw/vbeta/images/..."""
    raw_dir = self.output_dir / "raw" / self.config.output_folder
    file_path = raw_dir.joinpath(*path_parts)
    file_path.parent.mkdir(parents=True, exist_ok=True)
    file_path.write_bytes(data)
    return file_path
```

**2e. Add `_raw_images_exist(book_id: int) -> bool` method**:
```python
def _raw_images_exist(self, book_id: int) -> bool:
    """Check if raw image folder for this book is non-empty."""
    img_dir = self.output_dir / "raw" / self.config.output_folder / "images" / str(book_id)
    return img_dir.is_dir() and any(img_dir.iterdir())
```

**2f. Add `async _download_book_images(book_id: int, cover_url: str | None, pages_data_list: list[dict]) -> dict[str, str]` method**:
```python
async def _download_book_images(
    self,
    book_id: int,
    cover_url: str | None,
    pages_data_list: list[dict],
) -> dict[str, str]:
    """
    Download cover + content images for a book to raw/images/{book_id}/.
    Returns mapping of {original_url: local_filename}.
    Skips if raw/images/{book_id}/ already exists and is non-empty (idempotent).
    """
    if self._raw_images_exist(book_id):
        logger.info(f"[api_adapter] Skip (disk): raw images for book {book_id}")
        # Return mapping from existing files
        img_dir = self.output_dir / "raw" / self.config.output_folder / "images" / str(book_id)
        return {}  # mapping not restored on skip — build phase reads folder directly

    urls: list[str] = []
    if cover_url:
        urls.append(cover_url)
    content_urls = self._extract_image_urls(pages_data_list)
    urls.extend(content_urls)

    url_to_filename: dict[str, str] = {}
    for url in urls:
        filename = self._derive_image_filename(url)
        try:
            jitter = random.uniform(0.1, 0.3)
            await asyncio.sleep(self.config.rate_limit_seconds + jitter)
            async with self.session.get(url, allow_redirects=True) as resp:
                if resp.status >= 400:
                    logger.warning(f"[api_adapter] Image download failed {resp.status}: {url}")
                    continue
                data = await resp.read()
            self._save_raw_image(["images", str(book_id), filename], data)
            url_to_filename[url] = filename
            logger.info(f"[api_adapter] Downloaded image: images/{book_id}/{filename}")
        except Exception as e:
            logger.error(f"[api_adapter] Error downloading image {url}: {e}")

    return url_to_filename
```

**2g. Update `_process_book()` inside `_crawl_phase()`** — after all chapters are fetched, collect all raw page dicts and call `_download_book_images()`:

In `_crawl_phase()`, within the `_process_book()` inner function, after the chapter loop completes, add:
```python
# Collect all pages data for image extraction
all_pages_data: list[dict] = []
for toc_item in toc_items:
    chapter_path = self.output_dir / "raw" / self.config.output_folder / "chapters" / f"{toc_item.id}.json"
    if chapter_path.exists():
        with open(chapter_path) as f:
            ch = json.load(f)
        all_pages_data.extend(ch.get("result", {}).get("pages", []))

cover_url = book_detail.cover_image_url
await self._download_book_images(book_item.value, cover_url, all_pages_data)
```

---

### Task 3 — `utils/api_adapter.py`: Phase 2 folder restructure

**3a. Update `_book_data_exists()`** — check folder not file:
```python
def _book_data_exists(self, cat_seo: str, book_seo: str) -> bool:
    """Check if a processed book folder already exists."""
    path = self.output_dir / "book-data" / self.config.output_folder / cat_seo / book_seo
    return path.is_dir()
```

**3b. Update `_save_book_data()`** — write to `{book_seo}/book.json`:
```python
def _save_book_data(self, book_data: BookData, cat_seo: str) -> None:
    """Save canonical BookData JSON: {book_seo}/book.json inside book folder."""
    book_folder = (
        self.output_dir / "book-data" / self.config.output_folder
        / cat_seo / book_data.book_seo_name
    )
    book_folder.mkdir(parents=True, exist_ok=True)
    out_path = book_folder / "book.json"
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(book_data.model_dump_json(by_alias=True, indent=2))
```

**3c. Add `_copy_images_to_book_folder()` method**:
```python
def _copy_images_to_book_folder(
    self,
    book_id: int,
    book_folder: Path,
    cover_url: str | None,
) -> tuple[str | None, dict[str, str]]:
    """
    Copy images from raw/images/{book_id}/ to {book_folder}/images/.
    Returns (cover_local_path_relative, {original_url: relative_local_path}).
    Paths are relative to data/book-data/.
    """
    import shutil
    raw_img_dir = self.output_dir / "raw" / self.config.output_folder / "images" / str(book_id)
    if not raw_img_dir.exists():
        return None, {}

    dest_img_dir = book_folder / "images"
    dest_img_dir.mkdir(parents=True, exist_ok=True)

    url_to_local: dict[str, str] = {}
    cover_local: str | None = None

    for src_file in raw_img_dir.iterdir():
        if src_file.is_file():
            shutil.copy2(src_file, dest_img_dir / src_file.name)
            rel_path = str((dest_img_dir / src_file.name).relative_to(
                self.output_dir / "book-data"
            ))
            # Map cover URL to local path
            if cover_url:
                cover_filename = self._derive_image_filename(cover_url)
                if src_file.name == cover_filename:
                    cover_local = rel_path

    return cover_local, url_to_local
```

**3d. Update `_build_phase()`** — copy images and set `cover_image_local_path`:

In `_build_phase()`, after building `book_data` object but before calling `_save_book_data()`:
```python
# Copy images to book folder and set local paths
book_folder = (
    self.output_dir / "book-data" / self.config.output_folder
    / cat_seo / book_seo
)
cover_local, _ = self._copy_images_to_book_folder(
    book_id, book_folder, book_detail.cover_image_url
)
book_data.cover_image_local_path = cover_local
```

---

### Task 4 — `indexer.py`: Update to find `book.json` in folders

**File:** [`indexer.py`](file:///Users/minhtrucnguyen/working/monkai/indexer.py)

**4a. Update `scan_book_manifests()`** — find `book.json` files inside book folders:
```python
def scan_book_manifests(output_dir: Path) -> list[Path]:
    """Find all book.json manifest files under output_dir/book-data/.
    
    New structure: data/book-data/vbeta/{cat}/{book_seo}/book.json
    Excludes index.json. Returns sorted list.
    """
    books_dir = output_dir / "book-data"
    if not books_dir.exists():
        return []
    return sorted(p for p in books_dir.rglob("book.json"))
```

**4b. Update `build_book_data_index()`** — in the artifact path derivation, the `path` should now point to the `book.json` file within the folder:

In the loop over `json_files`, update the `artifact_path` derivation:
```python
artifact_path = str(rel)  # e.g. "vbeta/kinh/bo-trung-quan/book.json"
```
This already works correctly since `rel = file_path.relative_to(book_data_dir)` — no code change needed here as long as `scan_book_manifests()` returns the right paths.

**4c. Update `BookIndexEntry` in `build_book_data_index()`** — add cover image artifact if local path exists:

After building `BookIndexEntry`, add image artifacts:
```python
# Check for image artifacts
img_dir = file_path.parent / "images"
if img_dir.exists():
    for img_file in sorted(img_dir.iterdir()):
        if img_file.is_file():
            img_rel = str(img_file.relative_to(book_data_dir))
            img_artifact = BookArtifact(
                source=source,
                format="image",
                path=img_rel,
                built_at=book_data.meta.built_at,
            )
            if book_key in book_map:
                existing_entry = book_map[book_key]
                existing_paths = {a.path for a in existing_entry.artifacts}
                if img_rel not in existing_paths:
                    existing_entry.artifacts.append(img_artifact)
```

---

### Acceptance Criteria

**AC 1 — Image download (Phase 1)**
- Given: book with `cover_image_url` set and chapters with `<img>` tags in HTML
- When: `_crawl_phase()` runs
- Then: `data/raw/vbeta/images/{book_id}/` directory is created with at least one file (cover)

**AC 2 — Image download idempotency**
- Given: `data/raw/vbeta/images/{book_id}/` exists and is non-empty
- When: `_crawl_phase()` runs again
- Then: no HTTP requests to image URLs are made

**AC 3 — Book folder structure (Phase 2)**
- Given: raw data exists for a book
- When: `_build_phase()` runs
- Then: `data/book-data/vbeta/{cat}/{book_seo}/book.json` exists (not `{book_seo}.json`)
- Then: `data/book-data/vbeta/{cat}/{book_seo}/images/` folder exists with images copied

**AC 4 — Build idempotency after restructure**
- Given: `data/book-data/vbeta/{cat}/{book_seo}/` directory exists
- When: `_build_phase()` runs
- Then: `book.json` is NOT overwritten (mtime unchanged)

**AC 5 — `cover_image_local_path` populated**
- Given: cover image downloaded to raw and copied to book folder
- When: `book.json` is read
- Then: `cover_image_local_path` field is set to a valid relative path (not null)

**AC 6 — Indexer finds book.json in folders**
- Given: book folder `data/book-data/vbeta/kinh/bo-trung-quan/book.json` exists
- When: `build_book_data_index()` runs
- Then: `index.json` contains an entry for this book with `artifacts[0].path = "vbeta/kinh/bo-trung-quan/book.json"`

**AC 7 — All existing tests pass**
- `uv run pytest tests/ -v` → all 155 tests pass

---

## Additional Context

### Dependencies

- `re`, `hashlib`, `urllib.parse`, `shutil` — all stdlib, no new pip packages needed
- `aiohttp.ClientSession` — already used for API fetches, reused for image downloads

### Testing Strategy

**New tests in `tests/test_api_adapter.py`:**

- `test_extract_image_urls_basic` — static method unit test: given HTML with `<img src="...">`, returns URL list
- `test_extract_image_urls_no_imgs` — given HTML with no img tags, returns empty list
- `test_download_book_images_skips_if_raw_exists` — given `raw/images/{book_id}/` is non-empty, no HTTP calls made
- `test_download_book_images_downloads_cover` — mock session, given cover URL, verifies raw image file created
- `test_build_phase_creates_book_folder` — given raw toc/chapters, `_build_phase()` creates `{book_seo}/book.json` folder
- `test_build_phase_skips_if_book_folder_exists` — given `{book_seo}/` dir exists, `book.json` not overwritten
- `test_copy_images_to_book_folder` — given raw images, copies to book folder and returns correct cover path

**Updated existing tests in `tests/test_api_adapter.py`:**
- `test_build_phase_creates_book_json` → update assertion: check `kinh/book-1/book.json` (not `kinh/book-1.json`)
- `test_build_phase_skips_if_book_json_exists` → update setup: create folder `kinh/book-1/` not file

**New tests in `tests/test_indexer.py`:**
- `test_scan_book_manifests_finds_book_json_in_folders` — given folder structure with `book.json`, scan returns them
- `test_build_book_data_index_with_folder_structure` — end-to-end: create `book.json` in folder, run indexer, assert artifact path contains `/book.json`

### Run Tests

```bash
# Full suite (must all pass)
uv run pytest tests/ -v

# Focused on adapter changes
uv run pytest tests/test_api_adapter.py -v

# Focused on indexer changes
uv run pytest tests/test_indexer.py -v

# E2E pipeline test
uv run pytest tests/test_e2e_pipeline.py -v
```

---

### Task 5 — `tests/test_e2e_pipeline.py`: End-to-End Workflow Test [NEW]

**File:** `tests/test_e2e_pipeline.py` (new file)

This test runs the complete pipeline end-to-end — Phase 1 (crawl raw + images) → Phase 2 (build book folder) → indexer (`build_book_data_index`) — using fully mocked HTTP and a real `tmp_path` filesystem. No network access.

**Fixtures:** Reuse `_TOC_RAW` and `_CHAPTER_RAW` from `test_api_adapter.py` (or inline them).

**Test:** `test_full_pipeline_crawl_build_index`

```python
# tests/test_e2e_pipeline.py
import json
import logging
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from models import SourceConfig
from utils.api_adapter import VbetaApiAdapter
from utils.state import CrawlState
from indexer import build_book_data_index

# ── shared raw data ──────────────────────────────────────────────────────────

_CATEGORIES_RAW = {
    "success": True,
    "result": [{"value": 1, "label": "Kinh", "seoName": "kinh"}],
}
_BOOKS_RAW = {
    "success": True,
    "result": [{"value": 42, "label": "Bộ Trung Quán", "seoName": "bo-trung-quan"}],
}
_TOC_RAW = {
    "result": {
        "id": 42,
        "name": "Bộ Trung Quán",
        "seoName": "bo-trung-quan",
        "categoryId": 1,
        "categoryName": "Kinh",
        "coverImageUrl": "https://cdn.example.com/images/cover.jpg",
        "author": "Thích Minh Châu",
        "authorId": 1,
        "publisher": "VNCPHVN",
        "publicationYear": 2000,
        "tableOfContents": {
            "items": [
                {
                    "id": 12439,
                    "name": "Chương Một",
                    "seoName": "chuong-mot",
                    "viewCount": 5,
                    "minPageNumber": 1,
                    "maxPageNumber": 2,
                }
            ]
        },
    },
    "success": True,
}
_CHAPTER_RAW = {
    "result": {
        "pages": [
            {"pageNumber": 1, "sortNumber": 1, "htmlContent": "<p>Page 1</p>"},
            {"pageNumber": 2, "sortNumber": 2, "htmlContent": "<p>Page 2</p><img src='https://cdn.example.com/images/fig1.png'>"},
        ]
    }
}
_COVER_BYTES = b"FAKE_COVER_IMAGE_BYTES"
_FIG1_BYTES  = b"FAKE_FIG1_IMAGE_BYTES"


@pytest.fixture
def source_config():
    return SourceConfig(
        name="vbeta",
        source_type="api",
        enabled=True,
        api_base_url="https://api.phapbao.org",
        api_endpoints={
            "category": "/api/categories/get-selectlist-categories",
            "book": "/api/search/get-books-selectlist-by-categoryId/",
            "toc": "/api/search/get-tableofcontents-by-bookId",
            "chapter": "/api/search/get-pages-by-tableofcontentid/",
        },
        output_folder="vbeta",
    )


@pytest.fixture
def mock_state():
    state = MagicMock(spec=CrawlState)
    state.is_downloaded.return_value = False
    return state


@pytest.mark.asyncio
async def test_full_pipeline_crawl_build_index(source_config, mock_state, tmp_path):
    """Full E2E: Phase 1 crawl (with image download) → Phase 2 build folder → indexer index.

    Verifies:
    - data/raw/vbeta/{categories,books,toc,chapters,images} all populated
    - data/book-data/vbeta/kinh/bo-trung-quan/book.json created
    - data/book-data/vbeta/kinh/bo-trung-quan/images/ has cover.jpg + fig1.png
    - book.json cover_image_local_path is not null
    - data/book-data/index.json has 1 book with json + image artifacts
    """

    def make_mock_session():
        session = MagicMock()

        def make_acm(content, status=200, binary=False):
            mock_resp = AsyncMock()
            mock_resp.status = status
            if binary:
                mock_resp.read = AsyncMock(return_value=content)
            else:
                mock_resp.json = AsyncMock(return_value=content)
            ctx = AsyncMock()
            ctx.__aenter__ = AsyncMock(return_value=mock_resp)
            ctx.__aexit__ = AsyncMock(return_value=None)
            return ctx

        def get_side_effect(url, **kwargs):
            if "categories" in url:
                return make_acm(_CATEGORIES_RAW)
            elif "get-books" in url:
                return make_acm(_BOOKS_RAW)
            elif "get-pages" in url:
                return make_acm(_CHAPTER_RAW)
            elif "cover.jpg" in url:
                return make_acm(_COVER_BYTES, binary=True)
            elif "fig1.png" in url:
                return make_acm(_FIG1_BYTES, binary=True)
            return make_acm({}, status=404)

        session.get = MagicMock(side_effect=get_side_effect)
        session.post = MagicMock(return_value=make_acm(_TOC_RAW))
        return session

    session = make_mock_session()
    adapter = VbetaApiAdapter(source_config, session, mock_state, str(tmp_path))

    with patch("asyncio.sleep", new_callable=AsyncMock):
        with patch("random.uniform", return_value=0.1):
            await adapter.process_all()

    # ── Phase 1 raw assertions ──────────────────────────────────────────────
    raw_dir = tmp_path / "raw" / "vbeta"
    assert (raw_dir / "categories.json").exists(),         "categories.json missing from raw"
    assert (raw_dir / "books" / "by_category_1.json").exists(), "books raw missing"
    assert (raw_dir / "toc" / "book_42.json").exists(),     "toc raw missing"
    assert (raw_dir / "chapters" / "12439.json").exists(),  "chapter raw missing"

    # Image raw files
    img_raw_dir = raw_dir / "images" / "42"
    assert img_raw_dir.is_dir(), "raw images dir missing for book 42"
    raw_image_names = {f.name for f in img_raw_dir.iterdir()}
    assert any("cover" in n or n.endswith(".jpg") for n in raw_image_names), \
        f"cover image not found in raw images: {raw_image_names}"

    # ── Phase 2 book-data assertions ────────────────────────────────────────
    book_folder = tmp_path / "book-data" / "vbeta" / "kinh" / "bo-trung-quan"
    assert book_folder.is_dir(), "book folder not created"

    book_json_path = book_folder / "book.json"
    assert book_json_path.exists(), "book.json not created inside book folder"

    with open(book_json_path) as f:
        book_data = json.load(f)

    assert book_data["book_seo_name"]  == "bo-trung-quan"
    assert book_data["total_chapters"] == 1
    assert len(book_data["chapters"])  == 1
    assert len(book_data["chapters"][0]["pages"]) == 2
    assert book_data["cover_image_local_path"] is not None, \
        "cover_image_local_path must be set after build phase"

    images_dir = book_folder / "images"
    assert images_dir.is_dir(), "images/ subdir not created in book folder"
    copied_image_names = {f.name for f in images_dir.iterdir()}
    assert len(copied_image_names) >= 1, "no images copied to book folder"

    # ── Indexer assertions ──────────────────────────────────────────────────
    logger = MagicMock(spec=logging.Logger)
    build_book_data_index(tmp_path, logger)

    index_path = tmp_path / "book-data" / "index.json"
    assert index_path.exists(), "index.json not created by indexer"

    index_data = json.loads(index_path.read_text(encoding="utf-8"))
    assert index_data["_meta"]["total_books"] == 1

    book_entry = index_data["books"][0]
    assert book_entry["book_seo_name"] == "bo-trung-quan"

    artifact_formats = {a["format"] for a in book_entry["artifacts"]}
    assert "json" in artifact_formats, "json artifact missing from index"
    assert "image" in artifact_formats, "image artifact missing from index"

    json_artifact = next(a for a in book_entry["artifacts"] if a["format"] == "json")
    assert json_artifact["path"].endswith("book.json"), \
        f"json artifact path should end with book.json, got: {json_artifact['path']}"


@pytest.mark.asyncio
async def test_full_pipeline_idempotent(source_config, mock_state, tmp_path):
    """Running process_all() twice produces identical output (no duplicate files, no rewrites)."""

    def make_mock_session():
        session = MagicMock()

        def make_acm(content, status=200, binary=False):
            mock_resp = AsyncMock()
            mock_resp.status = status
            if binary:
                mock_resp.read = AsyncMock(return_value=content)
            else:
                mock_resp.json = AsyncMock(return_value=content)
            ctx = AsyncMock()
            ctx.__aenter__ = AsyncMock(return_value=mock_resp)
            ctx.__aexit__ = AsyncMock(return_value=None)
            return ctx

        def get_side_effect(url, **kwargs):
            if "categories" in url:
                return make_acm(_CATEGORIES_RAW)
            elif "get-books" in url:
                return make_acm(_BOOKS_RAW)
            elif "get-pages" in url:
                return make_acm(_CHAPTER_RAW)
            elif "cover.jpg" in url or "fig1.png" in url:
                return make_acm(b"IMG", binary=True)
            return make_acm({}, status=404)

        session.get = MagicMock(side_effect=get_side_effect)
        session.post = MagicMock(return_value=make_acm(_TOC_RAW))
        return session

    with patch("asyncio.sleep", new_callable=AsyncMock):
        with patch("random.uniform", return_value=0.1):
            # First run
            adapter1 = VbetaApiAdapter(source_config, make_mock_session(), mock_state, str(tmp_path))
            await adapter1.process_all()

            book_json = tmp_path / "book-data" / "vbeta" / "kinh" / "bo-trung-quan" / "book.json"
            mtime_after_first = book_json.stat().st_mtime

            # Second run — fresh session, same tmp_path
            adapter2 = VbetaApiAdapter(source_config, make_mock_session(), mock_state, str(tmp_path))
            await adapter2.process_all()

            mtime_after_second = book_json.stat().st_mtime

    # book.json must not be rewritten on second run
    assert mtime_after_first == mtime_after_second, \
        "book.json was overwritten on second run — idempotency broken"

    # session.get call count on second run should be 0 (all data already on disk)
    # adapter2's session is fresh — if everything was skipped, call_count stays 0
    assert adapter2.session.get.call_count == 0, \
        "HTTP GET was called on second run — disk-existence skip failed"
```

### Manual Verification

```bash
# 1. Wipe stale book-data (existing flat .json files are no longer valid)
rm -rf data/book-data/vbeta/

# 2. Run the FULL end-to-end pipeline (crawler → build-index → validate)
uv run python pipeline.py
```

**After pipeline completes, spot-check:**

```bash
# Folder structure — expect {book_seo}/ dirs, NOT flat .json files
find data/book-data/vbeta -maxdepth 3 | head -20
# ✓ data/book-data/vbeta/kinh/bo-trung-quan/book.json
# ✓ data/book-data/vbeta/kinh/bo-trung-quan/images/

# cover_image_local_path is set (not null)
python3 -c "
import json, glob
f = sorted(glob.glob('data/book-data/vbeta/**/*.json', recursive=True))[0]
d = json.load(open(f))
print('cover_image_local_path:', d.get('cover_image_local_path'))
"

# Index has both json + image artifacts
python3 -c "
import json
d = json.load(open('data/book-data/index.json'))
book = d['books'][0]
print('artifacts:', [(a['format'], a['path']) for a in book['artifacts'][:3]])
"
```

**Run again to verify idempotency (should be all skips, zero new HTTP calls):**
```bash
uv run python pipeline.py
# Logs should show only "[Skip (disk): ...]" lines — no new downloads
```

### Notes

- The existing 470 `{book_seo}.json` files will become stale after this change. Delete `data/book-data/vbeta/` before re-running.
- Raw data (`data/raw/vbeta/`) remains intact — no changes to categories/books/toc/chapters structure.
- Image download rate-limiting follows the same `rate_limit_seconds + jitter` pattern to avoid hammering the server.
- Books with no cover and no content images will still get an empty `images/` folder (acceptable).
