# Story 2.2: Catalog Page Fetch + Scripture URL Extraction

Status: done

## Story

As a developer,
I want the crawler to fetch each source's catalog/listing page and extract individual scripture URLs using CSS selectors from config,
so that I have a complete list of scripture URLs to download for each source.

## Acceptance Criteria

1. **Given** thuvienhoasen.org is configured with valid `seed_url` and `catalog_links` CSS selector
   **When** I run `crawler.py --source thuvienhoasen`
   **Then** the crawler fetches the seed/catalog page(s) and extracts a list of individual scripture URLs
   **And** each extracted URL is an absolute HTTPS URL (relative URLs are resolved against the base)
   **And** extracted URLs are logged at INFO level: `[INFO] [crawler] Found {N} scripture URLs from {source}`

2. **Given** the catalog spans multiple pages (pagination)
   **When** the crawler processes the catalog
   **Then** it follows pagination links (if `pagination_selector` is in config) until all pages are exhausted
   **And** each page fetch respects `rate_limit_seconds` delay

3. **Given** the CSS selector in config returns 0 matches
   **When** the crawler processes that source
   **Then** it logs a WARNING and continues — no crash
   **And** the run summary records 0 URLs found for that source

## Tasks / Subtasks

- [x] Implement `fetch_catalog_urls(source_config, session, robots_cache, logger) -> list[str]` async function (AC: 1)
  - [x] Use `aiohttp.ClientSession` to GET `source_config.seed_url` with `User-Agent: MonkaiCrawler/1.0`
  - [x] Parse HTML response with `BeautifulSoup(response_text, "html.parser")`
  - [x] Select links using `source_config.css_selectors["catalog_links"]`
  - [x] Resolve relative URLs to absolute using `urllib.parse.urljoin(base_url, href)`
  - [x] Log: `logger.info(f"[crawler] Found {len(urls)} scripture URLs from {source_config.name}")`
  - [x] Wrap in per-URL try/except — log error and return empty list on failure (never crash)
- [x] Implement pagination support (AC: 2)
  - [x] Check if `source_config.pagination_selector` is set (it's `None` by default in `SourceConfig`)
  - [x] If set: after extracting page URLs, find next-page link using `pagination_selector`
  - [x] Loop until no next-page link found; `await asyncio.sleep(source_config.rate_limit_seconds)` between pages
  - [x] Guard against infinite loops: track visited page URLs, break if already seen
- [x] Handle 0-match case gracefully (AC: 3)
  - [x] If BeautifulSoup finds 0 elements for `catalog_links` selector: `logger.warning(f"[crawler] No URLs found for {source_config.name} with selector '{selector}'")`
  - [x] Return empty list — do not crash or raise
- [x] Integrate into `crawl_all()` function in `crawler.py`
  - [x] Call `fetch_catalog_urls()` per source before entering download loop
  - [x] Pass the URL list to the download function (Story 2.3 will implement the download)

## Dev Notes

### Depends On Story 2.1

`crawler.py` scaffold (CLI, logger setup, config loading, RobotsCache init) must exist. This story fills in the catalog fetch logic inside the async crawl functions.

### Available Utilities (Do NOT reimplement)

```python
from utils.config import load_config          # already called in crawler.py
from utils.logging import setup_logger        # already called in crawler.py
from utils.robots import RobotsCache, robots_allowed, USER_AGENT
```

### aiohttp Session Pattern

The `aiohttp.ClientSession` is shared across all requests. Create it ONCE in the top-level `crawl_all()` coroutine and pass it down to all sub-functions. Do NOT create a new session per URL.

```python
async def crawl_all(sources, cfg, robots_cache, logger):
    connector = aiohttp.TCPConnector(limit_per_host=2)
    async with aiohttp.ClientSession(
        connector=connector,
        headers={"User-Agent": USER_AGENT}
    ) as session:
        for source in sources:
            urls = await fetch_catalog_urls(source, session, robots_cache, logger)
            # Story 2.3: await download_files(urls, source, session, ...)
```

### Catalog Fetch Implementation

```python
import aiohttp
import asyncio
from bs4 import BeautifulSoup
from urllib.parse import urljoin

async def fetch_catalog_urls(source_config, session, robots_cache, logger) -> list[str]:
    all_urls: list[str] = []
    page_url = source_config.seed_url
    visited_pages: set[str] = set()

    while page_url and page_url not in visited_pages:
        visited_pages.add(page_url)

        # robots.txt check before fetching catalog page itself
        if not robots_allowed(robots_cache, page_url):
            logger.warning(f"[crawler] robots.txt blocked catalog page: {page_url}")
            break

        try:
            async with session.get(page_url) as resp:
                text = await resp.text(encoding="utf-8", errors="replace")
        except Exception as e:
            logger.error(f"[crawler] Failed to fetch catalog {page_url}: {e}")
            break

        soup = BeautifulSoup(text, "html.parser")
        selector = source_config.css_selectors.get("catalog_links", "")
        links = soup.select(selector)

        if not links:
            logger.warning(
                f"[crawler] No URLs found for {source_config.name} "
                f"with selector '{selector}'"
            )

        for tag in links:
            href = tag.get("href", "")
            if href:
                all_urls.append(urljoin(page_url, href))

        # Pagination
        next_page = None
        pagination_sel = source_config.pagination_selector
        if pagination_sel:
            next_tag = soup.select_one(pagination_sel)
            if next_tag:
                next_href = next_tag.get("href", "")
                if next_href:
                    next_page = urljoin(page_url, next_href)

        if next_page and next_page != page_url:
            await asyncio.sleep(source_config.rate_limit_seconds)
            page_url = next_page
        else:
            break

    logger.info(f"[crawler] Found {len(all_urls)} scripture URLs from {source_config.name}")
    return all_urls
```

### CSS Selectors from config.yaml

```yaml
css_selectors:
  catalog_links: "a.list-item-title"      # links to individual scripture pages
  file_links: "a.download-link"           # on each scripture page, links to actual file
  title: "h1.entry-title"
  category: ".breadcrumb li:nth-child(2)"
  subcategory: ".breadcrumb li:last-child"
```

`catalog_links` gives the list of scripture *page* URLs. `file_links` will be used in Story 2.3 to get the actual downloadable file URL from each scripture page.

### URL Resolution Rule

```python
from urllib.parse import urljoin
# Always resolve relative URLs:
absolute_url = urljoin(page_url, href)  # handles both /path and https://... hrefs
```

Never store relative URLs — always convert to absolute before adding to the list.

### Error Handling Pattern (Per-URL, Never Per-Run)

```python
try:
    result = await session.get(url)
except Exception as e:
    logger.error(f"[crawler] Failed {url}: {e}")
    continue  # next URL — run never crashes
```

This pattern is enforced project-wide (NFR3).

### Project Structure Notes

- All catalog fetch logic lives in `crawler.py` (no separate module needed at this scale)
- `parser.py`, `indexer.py`, `validate.py` do NOT fetch catalog pages — those are crawler.py's responsibility
- The `file_links` selector (for getting actual download URLs from scripture pages) is used in Story 2.3

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.2: Catalog Page Fetch + Scripture URL Extraction]
- [Source: _bmad-output/planning-artifacts/phase-1-crawler/architecture-phase1-crawler.md#API & Communication Patterns — Async Concurrency]
- [Source: _bmad-output/planning-artifacts/phase-1-crawler/architecture-phase1-crawler.md#Process Patterns — Robots.txt Check]
- [Source: _bmad-output/planning-artifacts/phase-1-crawler/architecture-phase1-crawler.md#Process Patterns — Error Handling Granularity]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- Implemented `fetch_catalog_urls()` in `crawler.py`: fetches seed URL, parses with BeautifulSoup, extracts absolute URLs using `urljoin`, logs INFO count
- robots.txt checked before each catalog page fetch (not just download URLs)
- Pagination loop with visited-pages guard to prevent infinite loops; `asyncio.sleep(rate_limit_seconds)` between pages
- 0-match case: logs WARNING with selector info, returns empty list, no crash
- Network errors caught per-page: logs ERROR and breaks loop, returns what was collected
- `crawl_all()` updated to use shared `aiohttp.ClientSession` with `User-Agent: MonkaiCrawler/1.0`; `fetch_catalog_urls` called per source
- 12 new tests in `tests/test_catalog_fetch.py`; 58 total tests pass, no regressions

### File List

- crawler.py (modified — added fetch_catalog_urls, updated crawl_all)
- tests/test_catalog_fetch.py (created)

### Change Log

- 2026-02-27: Story 2.2 implemented — catalog fetch + URL extraction, pagination, robots.txt compliance, 12 tests added
