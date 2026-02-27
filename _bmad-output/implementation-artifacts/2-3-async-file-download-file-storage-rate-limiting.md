# Story 2.3: Async File Download + File Storage + Rate Limiting

Status: ready-for-dev

## Story

As a developer,
I want the crawler to asynchronously download scripture files to an organized `data/raw/` directory with rate limiting enforced,
so that I can collect files from all sources efficiently while respecting each site's rate limits.

## Acceptance Criteria

1. **Given** a list of scripture URLs for thuvienhoasen.org
   **When** the crawler downloads them
   **Then** each file is saved to `data/raw/thuvienhoasen/<category>/<filename>` preserving directory structure
   **And** the filename is the original filename from the URL, or `{title_slug}.{ext}` if the URL has no clean filename
   **And** file format is detected in order: (1) URL extension, (2) HTTP `Content-Type` header, (3) `file_type_hints` from config
   **And** the file is stored exactly as received — no content modification

2. **Given** `aiohttp.ClientSession` with `TCPConnector(limit_per_host=2)` is used
   **When** downloading multiple files concurrently
   **Then** no more than 2 concurrent connections are made to the same host at any time
   **And** `asyncio.sleep(source.rate_limit_seconds)` is called between requests to that host
   **And** the effective download rate meets ≥ 30 pages/minute net of rate-limit delays (NFR1)

3. **Given** an HTML file is downloaded
   **When** the crawler checks download completeness
   **Then** it verifies file size > 0 AND `</html>` closing tag is present before marking as downloaded
   **And** for binary formats (PDF, EPUB), only non-zero file size is required

## Tasks / Subtasks

- [ ] Implement file format detection (AC: 1)
  - [ ] `detect_format(url, content_type, file_type_hints) -> str` — returns `"html"`, `"pdf"`, `"epub"`, or `"other"`
  - [ ] Priority: (1) URL path extension → (2) Content-Type header → (3) first entry in `file_type_hints`
  - [ ] Map MIME types: `"text/html"` → `"html"`, `"application/pdf"` → `"pdf"`, `"application/epub+zip"` → `"epub"`
- [ ] Implement filename derivation (AC: 1)
  - [ ] `derive_filename(url, title_slug, file_format) -> str`
  - [ ] Prefer: last path segment of URL if it has a clean extension (no query strings)
  - [ ] Fallback: `f"{title_slug}.{file_format}"` using `make_id`-compatible slug
  - [ ] Never return empty string — always return a valid filename
- [ ] Implement directory creation and file write (AC: 1)
  - [ ] `save_file(content: bytes, file_path: Path) -> None`
  - [ ] `file_path.parent.mkdir(parents=True, exist_ok=True)` — create dirs as needed
  - [ ] Write raw bytes exactly: `file_path.write_bytes(content)` — NO encoding/decoding
- [ ] Implement HTML completeness check (AC: 3)
  - [ ] `is_complete_html(content: bytes) -> bool` — returns `True` if `file size > 0` AND `b"</html>"` (case-insensitive) in last 512 bytes
  - [ ] For PDF/EPUB: `len(content) > 0` only
  - [ ] If incomplete: log warning, mark as `error` in state, do NOT write file to disk
- [ ] Implement async download loop with rate limiting (AC: 2)
  - [ ] `download_scripture_file(url, source_config, session, state, logger) -> bytes | None`
  - [ ] `aiohttp.TCPConnector(limit_per_host=2)` — created once in `crawl_all()`
  - [ ] `await asyncio.sleep(source_config.rate_limit_seconds)` BEFORE each download request
  - [ ] On HTTP error (4xx/5xx): log `[ERROR]` + `state.mark_error(url)` + return `None`
  - [ ] On timeout/network error: same error handling pattern
- [ ] Integrate two-phase URL resolution for thuvienhoasen (catalog → scripture page → file)
  - [ ] `catalog_links` selector gives scripture page URLs (from Story 2.2)
  - [ ] From each scripture page: use `file_links` selector to get actual download URL
  - [ ] If no `file_links` match: treat the scripture page URL itself as the download target

## Dev Notes

### Two-Phase URL Resolution for thuvienhoasen

thuvienhoasen has a catalog page → scripture page → file structure:
1. **Catalog page** (`seed_url`): contains links matching `catalog_links` CSS selector → these are scripture *page* URLs, not file URLs
2. **Scripture page**: each page has a link matching `file_links` CSS selector → the actual downloadable file

```python
async def resolve_file_url(page_url, source_config, session, robots_cache, logger) -> str | None:
    """From a scripture page URL, find the actual file download URL."""
    if not robots_allowed(robots_cache, page_url):
        logger.warning(f"[crawler] robots.txt blocked: {page_url}")
        return None
    try:
        async with session.get(page_url) as resp:
            text = await resp.text(encoding="utf-8", errors="replace")
        soup = BeautifulSoup(text, "html.parser")
        file_sel = source_config.css_selectors.get("file_links")
        if file_sel:
            tag = soup.select_one(file_sel)
            if tag and tag.get("href"):
                return urljoin(page_url, tag["href"])
        return page_url  # Fallback: page URL itself is the download target
    except Exception as e:
        logger.error(f"[crawler] Failed to resolve file URL from {page_url}: {e}")
        return None
```

### File Format Detection

```python
import mimetypes
from pathlib import PurePosixPath
from urllib.parse import urlparse

def detect_format(url: str, content_type: str, file_type_hints: list[str]) -> str:
    # 1. URL extension
    parsed = urlparse(url)
    suffix = PurePosixPath(parsed.path).suffix.lower().lstrip(".")
    if suffix in ("html", "htm"):
        return "html"
    if suffix == "pdf":
        return "pdf"
    if suffix == "epub":
        return "epub"

    # 2. Content-Type header
    mime = content_type.split(";")[0].strip().lower()
    if "html" in mime:
        return "html"
    if mime == "application/pdf":
        return "pdf"
    if "epub" in mime:
        return "epub"

    # 3. file_type_hints from config
    for hint in file_type_hints:
        if hint in ("html", "pdf", "epub"):
            return hint

    return "other"
```

### Directory Layout

```
data/raw/
└── thuvienhoasen/
    ├── nikaya/
    │   ├── truong-bo-kinh.html
    │   └── truong-bo-kinh.meta.json   ← written by parser.py (Story 3.1)
    ├── dai-thua/
    └── thien/
```

The category subdirectory comes from the source's catalog structure. For Story 2.3, use the category slug extracted from the config or from the catalog page breadcrumb. If category is unknown at download time, use `"uncategorized"` as the directory.

**Category slug mapping:**
```python
CATEGORY_SLUG = {
    "Nikaya": "nikaya",
    "Đại Thừa": "dai-thua",
    "Mật Tông": "mat-tong",
    "Thiền": "thien",
    "Tịnh Độ": "tinh-do",
}
```

### HTML Completeness Check

```python
def is_complete_html(content: bytes, file_format: str) -> bool:
    if len(content) == 0:
        return False
    if file_format == "html":
        # Check last 512 bytes for </html> closing tag (case-insensitive)
        tail = content[-512:].lower()
        return b"</html>" in tail
    return True  # PDF, EPUB: non-zero size is sufficient
```

### Rate Limiting Pattern

```python
# Rate limit: sleep BEFORE each request (not after)
await asyncio.sleep(source_config.rate_limit_seconds)
async with session.get(url) as resp:
    content = await resp.read()
```

`TCPConnector(limit_per_host=2)` is set on the session — this caps concurrent connections.
`asyncio.sleep(rate_limit_seconds)` enforces minimum delay — NEVER bypass this (NFR12).

### File Write Pattern

```python
from pathlib import Path

def save_file(content: bytes, file_path: Path) -> None:
    """Write raw bytes — no encoding/decoding (FR11)."""
    file_path.parent.mkdir(parents=True, exist_ok=True)
    file_path.write_bytes(content)
```

`write_bytes()` writes exactly the bytes received — no charset conversion ever.

### Filename Derivation

```python
from urllib.parse import urlparse
from pathlib import PurePosixPath
from utils.slugify import slugify_title

def derive_filename(url: str, title_slug: str, file_format: str) -> str:
    parsed = urlparse(url)
    path = PurePosixPath(parsed.path)
    # Use URL filename if it has a clean extension (no query params in path)
    if path.suffix and not parsed.query:
        return path.name
    # Fallback: title slug + extension
    return f"{title_slug}.{file_format}"
```

### Error Handling Pattern

```python
try:
    async with session.get(file_url) as resp:
        if resp.status >= 400:
            logger.error(f"[crawler] HTTP {resp.status}: {file_url} — skipping")
            state.mark_error(file_url)
            continue
        content = await resp.read()
except asyncio.TimeoutError:
    logger.error(f"[crawler] Timeout: {file_url} — skipping")
    state.mark_error(file_url)
    continue
except Exception as e:
    logger.error(f"[crawler] Error downloading {file_url}: {e} — skipping")
    state.mark_error(file_url)
    continue
```

### After Successful Download

```python
save_file(content, file_path)
state.mark_downloaded(file_url)
state.save()  # Persist after each file — ensures resume works on interruption
logger.info(f"[crawler] Downloaded: {file_url} → {file_path}")
```

### Project Structure Notes

- `crawler.py` at project root handles ALL download logic
- `data/raw/` directory already exists (created in Story 1.1)
- `logs/` directory already exists (created in Story 1.1)
- `utils/state.py::CrawlState` is fully implemented — import and use it
- `utils/dedup.py::sha256_hash` is fully implemented — used in Story 2.5

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.3: Async File Download + File Storage + Rate Limiting]
- [Source: _bmad-output/planning-artifacts/phase-1-crawler/architecture-phase1-crawler.md#API & Communication Patterns — Async Concurrency]
- [Source: _bmad-output/planning-artifacts/phase-1-crawler/architecture-phase1-crawler.md#Gap Analysis — File format detection order]
- [Source: _bmad-output/planning-artifacts/phase-1-crawler/architecture-phase1-crawler.md#Gap Analysis — HTML completeness check]
- [Source: _bmad-output/planning-artifacts/phase-1-crawler/architecture-phase1-crawler.md#Naming Patterns — File Naming for Downloads]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

### File List
