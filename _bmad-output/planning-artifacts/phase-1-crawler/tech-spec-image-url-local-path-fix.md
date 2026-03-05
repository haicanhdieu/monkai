---
title: 'Image URL → Local Relative Path Fix'
slug: 'image-url-local-path-fix'
created: '2026-03-05'
status: 'implementation-complete'
stepsCompleted: [1, 2, 3, 4]
tech_stack: [Python, Pydantic, aiohttp, asyncio]
files_to_modify: [utils/api_adapter.py, indexer.py, tests/test_api_adapter.py, tests/test_e2e_pipeline.py]
code_patterns: [pydantic_v2, two_phase_pipeline, idempotency_state]
test_patterns: [pytest_asyncio, mock_session, tmp_path]
---

# Tech-Spec: Image URL → Local Relative Path Fix

**Created:** 2026-03-05

## Overview

### Problem Statement

The previous tech-spec (`tech-spec-image-download-book-folder-restructure.md`) was implemented and images are now downloaded. However, two gaps remain:

1. **`html_content` in `PageEntry`**: `<img src="https://...">` tags in page HTML still point to remote HTTP URLs. The existing field `original_html_content` was intended to store the original HTML while `html_content` is rewritten with local paths — but this HTML rewriting step was never implemented.
2. **`index.json` `cover_image_url`**: The `BookIndexEntry.cover_image_url` in `index.json` is populated from `book_data.cover_image_url` (the original HTTP URL). It should instead use `book_data.cover_image_local_path` when available.

### Solution

- **`utils/api_adapter.py` — `_build_phase()`**: After copying images to the book folder, build a `{original_url: relative_local_path}` mapping and rewrite `<img src>` attributes in each `PageEntry.html_content`. Store the pre-rewrite HTML in `PageEntry.original_html_content`.
- **`indexer.py` — `build_book_data_index()`**: Prefer `book_data.cover_image_local_path` over `book_data.cover_image_url` when populating the `BookIndexEntry.cover_image_url` field.

### Scope

**In Scope:**
- Rewrite `<img src="ORIGINAL_URL">` → `<img src="RELATIVE_LOCAL_PATH">` in `PageEntry.html_content` during `_build_phase()`
- Store original HTML in `PageEntry.original_html_content`
- Use `cover_image_local_path` in `index.json` `cover_image_url` field
- New/updated tests
- Full pipeline re-run to regenerate all book data and index

**Out of Scope:**
- Any changes to the image download process (already complete)
- Folder restructure (already complete)
- Any changes to `data/raw/`

---

## Context for Development

### Codebase Patterns

- **Two-phase pipeline**: `_crawl_phase()` fetches/downloads, `_build_phase()` reads raw → writes book-data. All HTML rewriting must happen in `_build_phase()`.
- **Idempotency**: `_book_data_exists()` checks for folder — if the book folder already exists, the build step is skipped. To re-run, `data/book-data/vbeta/` must be wiped first.
- **`_extract_image_urls()`**: Already implemented static method — extracts `<img src>` URLs from raw page dicts.
- **`_derive_image_filename()`**: Already implemented static method — derives local filename from URL.
- **`_copy_images_to_book_folder()`**: Already implemented — copies raw images to book folder, returns `cover_local` path. This is called in `_build_phase()` before `_save_book_data()`.

### Files to Reference

| File | Purpose |
| ---- | ------- |
| [`utils/api_adapter.py`](file:///Users/minhtrucnguyen/working/monkai/utils/api_adapter.py) | Add `_build_url_to_local_map()`, modify `_build_phase()` HTML rewriting |
| [`indexer.py`](file:///Users/minhtrucnguyen/working/monkai/indexer.py) | Change `cover_image_url` assignment in `build_book_data_index()` |
| [`tests/test_api_adapter.py`](file:///Users/minhtrucnguyen/working/monkai/tests/test_api_adapter.py) | Add new test for img src rewriting |
| [`tests/test_e2e_pipeline.py`](file:///Users/minhtrucnguyen/working/monkai/tests/test_e2e_pipeline.py) | Extend assertions to verify img rewriting and local index URL |

---

## Implementation Plan

### Task 1 — `utils/api_adapter.py`: Add `_build_url_to_local_map()` helper

**File:** [`utils/api_adapter.py`](file:///Users/minhtrucnguyen/working/monkai/utils/api_adapter.py)

Add the following method to `VbetaApiAdapter`, alongside the other image helpers:

```python
def _build_url_to_local_map(
    self,
    book_folder: Path,
    cover_url: str | None,
    pages_data_list: list[dict],
) -> dict[str, str]:
    """Build {original_url: relative_local_path} for all downloaded images of a book.

    Paths are relative to data/book-data/ root (consistent with BookArtifact.path).
    Only includes URLs whose derived filename actually exists in the book folder.
    """
    dest_img_dir = book_folder / "images"
    if not dest_img_dir.exists():
        return {}
    book_data_dir = self.output_dir / "book-data"
    url_to_local: dict[str, str] = {}

    # Cover image
    if cover_url:
        filename = self._derive_image_filename(cover_url)
        dest = dest_img_dir / filename
        if dest.exists():
            url_to_local[cover_url] = str(dest.relative_to(book_data_dir))

    # Content images
    for url in self._extract_image_urls(pages_data_list):
        filename = self._derive_image_filename(url)
        dest = dest_img_dir / filename
        if dest.exists():
            url_to_local[url] = str(dest.relative_to(book_data_dir))

    return url_to_local
```

---

### Task 2 — `utils/api_adapter.py`: Rewrite `<img src>` in `_build_phase()`

**File:** [`utils/api_adapter.py`](file:///Users/minhtrucnguyen/working/monkai/utils/api_adapter.py)

In `_build_phase()`, after the call to `_copy_images_to_book_folder()` and before `_save_book_data()`, insert:

```python
# Collect raw pages data to build the URL→local map
all_pages_data: list[dict] = []
for toc_item in toc_items:
    chapter_path = (
        self.output_dir / "raw" / self.config.output_folder
        / "chapters" / f"{toc_item.id}.json"
    )
    if chapter_path.exists():
        with open(chapter_path) as f:
            ch = json.load(f)
        all_pages_data.extend(ch.get("result", {}).get("pages", []))

# Rewrite <img src="URL"> → <img src="local/rel/path"> in each page
url_to_local = self._build_url_to_local_map(
    book_folder, book_detail.cover_image_url, all_pages_data
)
if url_to_local:
    for chapter in chapters:
        for page in chapter.pages:
            rewritten = page.html_content
            for orig_url, local_path in url_to_local.items():
                rewritten = rewritten.replace(orig_url, local_path)
            if rewritten != page.html_content:
                page.original_html_content = page.html_content
                page.html_content = rewritten
```

> **Note**: `all_pages_data` reads the same raw chapter files already loaded above. This is a second read but is necessary because the raw `pages` dicts (with `htmlContent` keys) are needed for `_extract_image_urls()`. The `chapters` list uses `PageEntry` objects (with `html_content`).

---

### Task 3 — `indexer.py`: Use `cover_image_local_path` in `build_book_data_index()`

**File:** [`indexer.py`](file:///Users/minhtrucnguyen/working/monkai/indexer.py)

In `build_book_data_index()`, locate the `BookIndexEntry(...)` constructor call (around line 220) and change the `cover_image_url` argument:

```python
# BEFORE
cover_image_url=book_data.cover_image_url,

# AFTER
cover_image_url=book_data.cover_image_local_path or book_data.cover_image_url,
```

This stores the local relative path in the index when available, falling back to the original HTTP URL only if no local path exists.

---

### Task 4 — Tests

#### 4a. New test: `test_build_phase_rewrites_img_src_in_pages`

**File:** [`tests/test_api_adapter.py`](file:///Users/minhtrucnguyen/working/monkai/tests/test_api_adapter.py)

Given:
- A chapter with `htmlContent` containing `<img src='https://cdn.example.com/images/fig1.png'>` 
- The image file `raw/vbeta/images/{book_id}/fig1.png` exists on disk (pre-created in tmp_path)
- Build phase runs (book folder does not yet exist)

Then:
- `page.html_content` does NOT contain `https://cdn.example.com/images/fig1.png`
- `page.html_content` contains the relative local path (e.g. `vbeta/kinh/bo-trung-quan/images/fig1.png`)
- `page.original_html_content` equals the original HTML with the HTTP URL

#### 4b. Extend E2E test: `test_full_pipeline_crawl_build_index`

**File:** [`tests/test_e2e_pipeline.py`](file:///Users/minhtrucnguyen/working/monkai/tests/test_e2e_pipeline.py)

Add assertions after the existing `book.json` checks:

```python
# Check img src rewriting in page HTML
page_with_img = book_data["chapters"][0]["pages"][1]  # sort_number=2 has fig1.png
assert "https://cdn.example.com/images/fig1.png" not in page_with_img["html_content"], \
    "HTTP img URL should be rewritten to local path"
assert page_with_img["original_html_content"] is not None, \
    "original_html_content should be preserved"

# Check index.json uses local path for cover
index_data = json.loads(index_path.read_text(encoding="utf-8"))
book_entry = index_data["books"][0]
assert not book_entry["cover_image_url"].startswith("https://"), \
    "index.json cover_image_url should be local relative path, not HTTP URL"
```

---

### Acceptance Criteria

**AC 1 — `html_content` rewritten after build**
- Given: page HTML contains `<img src="https://cdn.example.com/fig.png">` and `fig.png` was downloaded
- When: `_build_phase()` runs
- Then: `page.html_content` contains the relative local path, not the HTTP URL

**AC 2 — `original_html_content` preserved**
- Given: page HTML was rewritten (AC 1)
- Then: `page.original_html_content` contains the original HTML with the HTTP URL

**AC 3 — Pages without images unchanged**
- Given: page HTML has no `<img>` tags
- Then: `page.original_html_content` is `null`, `page.html_content` is unchanged

**AC 4 — `index.json` uses local cover path**
- Given: `book.json` has `cover_image_local_path` set
- When: `build_book_data_index()` runs
- Then: `index.json` `books[*].cover_image_url` is the relative local path, not `https://`

**AC 5 — All tests pass**
- `uv run pytest tests/ -v` → all tests green

---

### Manual Verification

```bash
# 1. Wipe stale book-data and re-run full pipeline
rm -rf data/book-data/vbeta/
uv run python pipeline.py

# 2. Check img src rewriting
python3 -c "
import json, glob, re
f = sorted(glob.glob('data/book-data/vbeta/**/*.json', recursive=True))[0]
d = json.load(open(f))
for ch in d['chapters']:
    for p in ch['pages']:
        remaining_http = re.findall(r'<img[^>]+src=[\"\\']https?://[^\"\\'>]+[\"\\']', p['html_content'])
        if remaining_http:
            print('HTTP IMG STILL IN HTML:', remaining_http[:1])
print('Scan complete.')
"

# 3. Check index.json uses local paths
python3 -c "
import json
d = json.load(open('data/book-data/index.json'))
for b in d['books'][:3]:
    print(b['book_seo_name'], '->', b.get('cover_image_url'))
"
```
