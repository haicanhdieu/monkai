# crawler.py — Typer CLI entry point for FR1–FR8
import asyncio
import logging
from pathlib import Path, PurePosixPath
from typing import NamedTuple
from urllib.parse import urljoin, urlparse

import aiohttp
import typer
from bs4 import BeautifulSoup

from models import CrawlerConfig, SourceConfig
from utils.config import load_config
from utils.dedup import sha256_hash, is_duplicate
from utils.logging import setup_logger
from utils.robots import RobotsCache, robots_allowed, USER_AGENT
from utils.slugify import slugify_title
from utils.state import CrawlState

app = typer.Typer()

# Category → directory slug mapping
CATEGORY_SLUG = {
    "Nikaya": "nikaya",
    "Đại Thừa": "dai-thua",
    "Mật Tông": "mat-tong",
    "Thiền": "thien",
    "Tịnh Độ": "tinh-do",
}


class ScriptureResolution(NamedTuple):
    """Result of resolving a scripture page: file URL, title slug, and category slug."""

    file_url: str
    title_slug: str
    category_slug: str


# ---------------------------------------------------------------------------
# File format detection
# ---------------------------------------------------------------------------


def detect_format(url: str, content_type: str, file_type_hints: list[str]) -> str:
    """Detect file format using three-tier priority: URL ext > Content-Type > hints.

    Returns: "html", "pdf", "epub", or "other".
    """
    # 1. URL path extension
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


# ---------------------------------------------------------------------------
# Filename derivation
# ---------------------------------------------------------------------------


def derive_filename(url: str, title_slug: str, file_format: str) -> str:
    """Derive a filename for the downloaded file.

    Prefers the last URL path segment if it has a clean extension (no query params).
    Falls back to {title_slug}.{file_format}.
    Never returns empty string.
    """
    parsed = urlparse(url)
    path = PurePosixPath(parsed.path)
    if path.suffix and not parsed.query and path.name:
        return path.name
    slug = title_slug or "untitled"
    return f"{slug}.{file_format}"


# ---------------------------------------------------------------------------
# File persistence
# ---------------------------------------------------------------------------


def save_file(content: bytes, file_path: Path) -> None:
    """Write raw bytes to file_path, creating parent directories as needed."""
    file_path.parent.mkdir(parents=True, exist_ok=True)
    file_path.write_bytes(content)


# ---------------------------------------------------------------------------
# HTML completeness check
# ---------------------------------------------------------------------------


def is_complete_html(content: bytes, file_format: str) -> bool:
    """Check if downloaded content is complete.

    HTML: requires non-zero size AND </html> in the last 512 bytes (case-insensitive).
    PDF/EPUB/other: requires non-zero size only.
    """
    if len(content) == 0:
        return False
    if file_format == "html":
        tail = content[-512:].lower()
        return b"</html>" in tail
    return True


# ---------------------------------------------------------------------------
# Two-phase URL resolution (scripture page → download URL)
# ---------------------------------------------------------------------------


async def resolve_file_url(
    page_url: str,
    source_config: SourceConfig,
    session: aiohttp.ClientSession,
    robots_cache: RobotsCache,
    logger: logging.Logger,
) -> ScriptureResolution | None:
    """From a scripture page URL, find the actual file URL, title slug, and category slug.

    Returns ScriptureResolution or None if blocked/failed.
    Applies rate limiting before the HTTP request (NFR12).
    Falls back to page_url if no file_links selector matches.
    """
    if not robots_allowed(robots_cache, page_url):
        logger.warning(f"[crawler] robots.txt blocked: {page_url}")
        return None

    # Rate limit: sleep BEFORE each scripture page request (NFR12)
    await asyncio.sleep(source_config.rate_limit_seconds)

    try:
        async with session.get(page_url) as resp:
            if resp.status >= 400:
                logger.error(
                    f"[crawler] HTTP {resp.status} fetching scripture page: {page_url}"
                )
                return None
            text = await resp.text(encoding="utf-8", errors="replace")

        soup = BeautifulSoup(text, "html.parser")

        # Resolve file URL (fallback: page itself is the download target)
        file_url = page_url
        file_sel = source_config.css_selectors.get("file_links")
        if file_sel:
            tag = soup.select_one(file_sel)
            if tag and tag.get("href"):
                file_url = urljoin(page_url, tag["href"])

        # Extract title for filename slug
        title_slug = "untitled"
        title_sel = source_config.css_selectors.get("title", "")
        if title_sel:
            title_tag = soup.select_one(title_sel)
            if title_tag:
                raw_title = title_tag.get_text(strip=True)
                title_slug = slugify_title(raw_title) or "untitled"

        # Extract category for directory structure
        category_slug = "uncategorized"
        cat_sel = source_config.css_selectors.get("category", "")
        if cat_sel:
            cat_tag = soup.select_one(cat_sel)
            if cat_tag:
                raw_cat = cat_tag.get_text(strip=True)
                category_slug = CATEGORY_SLUG.get(raw_cat, "uncategorized")

        return ScriptureResolution(file_url, title_slug, category_slug)

    except Exception as e:
        logger.error(f"[crawler] Failed to resolve file URL from {page_url}: {e}")
        return None


# ---------------------------------------------------------------------------
# Async download with rate limiting
# ---------------------------------------------------------------------------


async def download_scripture_file(
    url: str,
    source_config: SourceConfig,
    session: aiohttp.ClientSession,
    state: CrawlState,
    logger: logging.Logger,
) -> tuple[bytes, str] | None:
    """Download a single scripture file with rate limiting enforced.

    Rate limit sleep is applied BEFORE each request.
    Returns (raw_bytes, content_type) on success, None on any error.
    """
    await asyncio.sleep(source_config.rate_limit_seconds)

    try:
        async with session.get(url) as resp:
            if resp.status >= 400:
                logger.error(f"[crawler] HTTP {resp.status}: {url} — skipping")
                state.mark_error(url)
                state.save()
                return None
            content = await resp.read()
            content_type = resp.headers.get("Content-Type", "")
            return content, content_type
    except asyncio.TimeoutError:
        logger.error(f"[crawler] Timeout: {url} — skipping")
        state.mark_error(url)
        state.save()
        return None
    except Exception as e:
        logger.error(f"[crawler] Error downloading {url}: {e} — skipping")
        state.mark_error(url)
        state.save()
        return None


# ---------------------------------------------------------------------------
# Catalog fetch (Story 2.2)
# ---------------------------------------------------------------------------


async def fetch_catalog_urls(
    source_config: SourceConfig,
    session: aiohttp.ClientSession,
    robots_cache: RobotsCache,
    logger: logging.Logger,
) -> list[str]:
    """Fetch catalog page(s) and extract absolute scripture URLs.

    Supports pagination via source_config.pagination_selector.
    Returns empty list on any error — never raises.
    """
    all_urls: list[str] = []
    page_url = source_config.seed_url
    visited_pages: set[str] = set()

    while page_url and page_url not in visited_pages:
        visited_pages.add(page_url)

        # robots.txt check before fetching catalog page
        if not robots_allowed(robots_cache, page_url):
            logger.warning(f"[crawler] robots.txt blocked catalog page: {page_url}")
            break

        try:
            async with session.get(page_url) as resp:
                if resp.status >= 400:
                    logger.error(
                        f"[crawler] HTTP {resp.status} fetching catalog page: {page_url}"
                    )
                    break
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

        # Pagination: follow next-page link if configured
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

    all_urls = list(dict.fromkeys(all_urls))  # deduplicate level-1 URLs, preserve order

    # Two-level catalog: follow each level-1 URL to collect sub-links
    sub_sel = source_config.catalog_sub_selector
    if sub_sel and all_urls:
        sub_urls: list[str] = []
        for idx_url in all_urls:
            if not robots_allowed(robots_cache, idx_url):
                logger.warning(f"[crawler] robots.txt blocked index page: {idx_url}")
                continue
            await asyncio.sleep(source_config.rate_limit_seconds)
            try:
                async with session.get(idx_url) as resp:
                    if resp.status >= 400:
                        logger.error(
                            f"[crawler] HTTP {resp.status} fetching index page: {idx_url}"
                        )
                        continue
                    text = await resp.text(encoding="utf-8", errors="replace")
            except Exception as e:
                logger.error(f"[crawler] Failed to fetch index {idx_url}: {e}")
                continue
            soup = BeautifulSoup(text, "html.parser")
            for tag in soup.select(sub_sel):
                href = tag.get("href", "")
                if href:
                    sub_urls.append(urljoin(idx_url, href))
        all_urls = list(dict.fromkeys(sub_urls))  # deduplicate, preserve order

    logger.info(
        f"[crawler] Found {len(all_urls)} scripture URLs from {source_config.name}"
    )
    return all_urls


# ---------------------------------------------------------------------------
# Main async crawl loop
# ---------------------------------------------------------------------------


async def crawl_all(
    sources: list[SourceConfig],
    cfg: CrawlerConfig,
    robots_cache: RobotsCache,
    logger: logging.Logger,
) -> None:
    """Async crawl loop — fetches catalog URLs per source, then downloads files."""
    state = CrawlState("data/crawl-state.json")
    seen_hashes: set[str] = set()  # Session-scoped: shared across all sources (cross-source dedup)
    connector = aiohttp.TCPConnector(limit_per_host=2)
    async with aiohttp.ClientSession(
        connector=connector,
        headers={"User-Agent": USER_AGENT},
    ) as session:
        for source in sources:
            logger.info(f"[crawler] Starting crawl for {source.name}")
            
            if getattr(source, "source_type", "html") == "api":
                from utils.api_adapter import VbetaApiAdapter
                adapter = VbetaApiAdapter(source, session, state, cfg.output_dir)
                await adapter.process_all()
                continue
                
            scripture_page_urls = await fetch_catalog_urls(
                source, session, robots_cache, logger
            )

            for page_url in scripture_page_urls:
                # Early skip: page_url already downloaded — no sleep or network call needed
                if state.is_downloaded(page_url):
                    logger.info(f"[crawler] Skip (state): {page_url}")
                    continue

                # Two-phase: resolve actual file URL, title, and category from scripture page
                resolution = await resolve_file_url(
                    page_url, source, session, robots_cache, logger
                )
                if resolution is None:
                    # Track failed/blocked pages to avoid re-fetching on resume
                    state.mark_skipped(page_url)
                    state.save()
                    continue

                file_url, title_slug, category_slug = resolution

                # Compute candidate file path for state check + disk repair
                provisional_format = detect_format(file_url, "", source.file_type_hints)
                provisional_filename = derive_filename(file_url, title_slug, provisional_format)
                output_dir = Path(cfg.output_dir) / "raw" / source.output_folder / category_slug
                file_path = output_dir / provisional_filename

                # 1. Check crawl-state.json FIRST (fast in-memory dict lookup)
                if state.is_downloaded(file_url):
                    logger.info(f"[crawler] Skip (state): {file_url}")
                    continue

                # 2. Disk repair: file exists but not tracked in state
                if file_path.exists() and file_path.stat().st_size > 0:
                    state.mark_downloaded(file_url)
                    state.save()
                    logger.info(f"[crawler] Skip (disk+state repaired): {file_url}")
                    continue

                # 3. robots.txt check before download
                if not robots_allowed(robots_cache, file_url):
                    logger.warning(f"[crawler] robots.txt blocked: {file_url}")
                    continue

                result = await download_scripture_file(
                    file_url, source, session, state, logger
                )
                if result is None:
                    continue

                content, content_type = result

                # Detect final format using actual Content-Type from response (AC 1 — tier 2)
                file_format = detect_format(file_url, content_type, source.file_type_hints)

                # Completeness check
                if not is_complete_html(content, file_format):
                    logger.warning(
                        f"[crawler] Incomplete download, skipping: {file_url}"
                    )
                    state.mark_error(file_url)
                    state.save()
                    continue

                # Deduplication check — BEFORE writing to disk
                file_hash = sha256_hash(content)
                if is_duplicate(file_hash, seen_hashes):
                    logger.info(
                        f"[crawler] Duplicate detected (hash match): {file_url} — skipping"
                    )
                    state.mark_skipped(file_url)
                    state.save()
                    continue

                # Not a duplicate — register hash, save to category subdir, update state
                seen_hashes.add(file_hash)
                filename = derive_filename(file_url, title_slug, file_format)
                file_path = output_dir / filename

                save_file(content, file_path)
                state.mark_downloaded(file_url)
                state.save()
                logger.info(f"[crawler] Downloaded: {file_url} → {file_path}")


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------


@app.command()
def crawl(
    source: str = typer.Option("all", help="Source name or 'all'"),
    config: str = typer.Option("config.yaml", help="Path to config file"),
) -> None:
    """Crawl Buddhist scripture sources and download files to data/raw/."""
    logger = setup_logger("crawler")
    cfg: CrawlerConfig = load_config(config)  # Fails loudly on invalid config

    sources = (
        [s for s in cfg.sources if getattr(s, "enabled", True)]
        if source == "all"
        else [s for s in cfg.sources if s.name == source]
    )
    if not sources:
        logger.error(f"[crawler] No source found: {source}")
        raise typer.Exit(code=1)

    robots_cache = RobotsCache()  # Initialized once per session
    try:
        asyncio.run(crawl_all(sources, cfg, robots_cache, logger))
    except KeyboardInterrupt:
        logger.info("[crawler] Interrupted — state saved, resumable")
        raise typer.Exit(code=0)


if __name__ == "__main__":
    app()
