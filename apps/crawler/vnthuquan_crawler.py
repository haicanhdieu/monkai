"""
vnthuquan_crawler.py — HTTP infrastructure for VNThuQuan crawler.

Story 2.1: RequestResult dataclass, create_session() factory, VnthuquanAdapter skeleton.
Story 2.2: fetch_listing_page, fetch_all_listings with pagination and Text-only filter.
Story 2.3: fetch_book_detail, fetch_chapter, crawl_book, crawl_all, _monitor_health.
Story 3.1: assemble_book_data, write_book_json; integrate into crawl_book.
"""
from __future__ import annotations

import asyncio
import json
import logging
import random
import time
from dataclasses import dataclass, field, replace
from urllib.parse import urljoin
from datetime import datetime, timezone
from pathlib import Path

import aiohttp
import typer

from indexer import append_book_to_index
from models import BookData, BookMeta, ChapterEntry, PageEntry, SourceConfig
from utils.config import load_config
from utils.logging import setup_logger
from utils.slugify import slugify_title
from utils.state import CrawlState
from vnthuquan_parser import (
    BookDetail,
    BookListingEntry,
    ChapterParseResult,
    extract_last_page_number,
    parse_book_detail,
    parse_chapter_response,
    parse_listing_page,
)

# Stable name so logs work when this file is run as `python vnthuquan_crawler.py` (__name__ == "__main__").
_LOGGER_NAME = "vnthuquan"
logger = logging.getLogger(_LOGGER_NAME)

# Log a progress line every N books finished in this run (plus first and last).
_PROGRESS_LOG_INTERVAL = 10

# Chapter AJAX endpoint
CHAPTER_AJAX_URL = "http://vietnamthuquan.eu/truyen/chuonghoi_moi.aspx"


# ---------------------------------------------------------------------------
# Story 3.1: Assembly and file-writing helpers (module-level pure functions)
# ---------------------------------------------------------------------------

def assemble_book_data(
    entry: BookListingEntry,
    detail: BookDetail,
    chapters_html: list[str],
    cover_url: str | None,
) -> BookData:
    """Assemble a BookData v2.0 object from crawled VNThuQuan data."""
    now = datetime.now(timezone.utc)
    book_seo_name = slugify_title(detail.title)
    category_seo_name = slugify_title(entry.category_name)

    chapters: list[ChapterEntry] = []
    for i, (chuongid, chapter_name) in enumerate(detail.chapter_list):
        html = chapters_html[i] if i < len(chapters_html) else ""
        chapters.append(
            ChapterEntry(
                chapter_id=int(chuongid) if chuongid else 0,
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
        "book_name": detail.title,
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


def write_book_json(book_data: BookData, output_dir: Path) -> Path:
    """Write a BookData object as book.json, with slug-collision resolution."""
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
                f"[vnthuquan] Slug collision: {slug} already exists for book_id={existing_id}, using {new_slug}"
            )
            book_data.book_seo_name = new_slug
            book_data.id = f"vnthuquan__{new_slug}"
            target_dir = target_dir.parent / new_slug

    target_dir.mkdir(parents=True, exist_ok=True)
    out_path = target_dir / "book.json"
    out_path.write_text(book_data.model_dump_json(by_alias=True), encoding="utf-8")
    return out_path


# ---------------------------------------------------------------------------
# Chapter resume helpers (module-level pure functions)
# ---------------------------------------------------------------------------

def _load_existing_chapters(
    entry: BookListingEntry,
    detail: BookDetail,
    output_dir: Path,
) -> list[str | None]:
    """Read existing book.json and return per-chapter HTML (None = missing/empty).

    Checks both the base slug path and the collision-resolved slug-{book_id} path so
    that crash-resume works correctly even for books that were disambiguated on a prior run.
    """
    book_seo = slugify_title(detail.title)
    cat_seo = slugify_title(entry.category_name)
    base_dir = output_dir / "book-data" / "vnthuquan" / cat_seo

    # Candidate paths: base slug first, then collision-resolved slug
    candidates = [
        base_dir / book_seo / "book.json",
        base_dir / f"{book_seo}-{detail.tuaid}" / "book.json",
    ]

    existing: dict | None = None
    for candidate in candidates:
        if not candidate.exists():
            continue
        try:
            data = json.loads(candidate.read_text(encoding="utf-8"))
        except Exception:
            continue
        if data.get("book_id") == detail.tuaid:
            existing = data
            break

    if existing is None:
        return [None] * len(detail.chapter_list)

    existing_by_id: dict[int, str] = {}
    for ch in existing.get("chapters", []):
        ch_id = ch.get("chapter_id", 0)
        pages = ch.get("pages", [])
        html = pages[0].get("html_content", "") if pages else ""
        if html:
            existing_by_id[ch_id] = html

    result: list[str | None] = []
    for chuongid, _ in detail.chapter_list:
        cid = int(chuongid) if chuongid else 0
        result.append(existing_by_id.get(cid))
    return result


def _write_partial_book_json(collector: BookCollector, output_dir: Path) -> None:
    """Write partial book.json with chapters fetched so far for crash resilience."""
    try:
        chapters_html_so_far: list[str] = [
            r.content_html if r is not None else ""
            for r in collector.chapters_result
        ]
        cover_url = collector.cover_url
        if cover_url is None:
            for r in collector.chapters_result:
                if r is not None and r.cover_image_url:
                    cover_url = r.cover_image_url
                    break
        book_data = assemble_book_data(collector.entry, collector.detail, chapters_html_so_far, cover_url)
        write_book_json(book_data, output_dir)
    except Exception as exc:
        logger.warning(f"[vnthuquan] Partial save failed for '{collector.detail.title}': {exc}")


# ---------------------------------------------------------------------------
# RequestResult dataclass
# ---------------------------------------------------------------------------

@dataclass
class RequestResult:
    response: aiohttp.ClientResponse | None
    status: int | None
    error_type: str | None  # "timeout" | "connection" | "dns" | "http_4xx" | "http_5xx" | None
    error_detail: str | None


# ---------------------------------------------------------------------------
# Chapter-level concurrency dataclasses
# ---------------------------------------------------------------------------

@dataclass
class BookCollector:
    """Accumulates chapter results for one book during chapter-queue crawl."""
    entry: BookListingEntry
    detail: BookDetail
    total_chapters: int
    chapters_result: list[ChapterParseResult | None]  # pre-sized; None = not yet fetched
    cover_url: str | None
    completed: asyncio.Event   # set when all pending chapters received
    pending_count: int         # chapters still to fetch (excludes pre-loaded from disk)
    received_count: int = field(default=0)
    has_error: bool = field(default=False)


@dataclass
class ChapterTask:
    """A single chapter fetch to enqueue into the shared chapter queue."""
    collector: BookCollector
    chapter_index: int
    chuongid: int | str
    chapter_name: str


# ---------------------------------------------------------------------------
# Session factory
# ---------------------------------------------------------------------------

async def create_session() -> aiohttp.ClientSession:
    """Create a correctly configured aiohttp.ClientSession for VNThuQuan."""
    jar = aiohttp.CookieJar()
    jar.update_cookies({"AspxAutoDetectCookieSupport": "1"})
    timeout = aiohttp.ClientTimeout(sock_connect=30, sock_read=60)
    session = aiohttp.ClientSession(
        cookie_jar=jar,
        timeout=timeout,
        headers={"User-Agent": "MonkaiCrawler/1.1"},
    )
    return session


# ---------------------------------------------------------------------------
# VnthuquanAdapter
# ---------------------------------------------------------------------------

MAX_ATTEMPTS = 4  # 1 initial + 3 retries


class VnthuquanAdapter:
    def __init__(
        self,
        source_config: SourceConfig,
        session: aiohttp.ClientSession,
        state: CrawlState,
        output_dir: Path,
    ) -> None:
        self._source_config = source_config
        self._session = session
        self.state = state
        self.output_dir = output_dir
        self._state_lock = asyncio.Lock()
        self._index_lock = asyncio.Lock()
        self.rate_limit_seconds: float = source_config.rate_limit_seconds
        self._session_refresh_count: int = 0
        self._done: bool = False
        self._shutdown_event = asyncio.Event()
        self._abort: bool = False
        self._last_activity: float = time.time()
        self._books_remaining: int = 0

    async def _rate_limited_request(self, method: str, url: str, **kwargs) -> RequestResult:
        """Rate-limited entry point for all outbound HTTP requests.

        Sleeps rate_limit_seconds BEFORE making the request, then delegates to _request_with_retry.
        All callers MUST use this method, never _request_with_retry directly.
        """
        await asyncio.sleep(self.rate_limit_seconds)
        return await self._request_with_retry(method, url, **kwargs)

    async def _request_with_retry(self, method: str, url: str, **kwargs) -> RequestResult:
        """Make an HTTP request with up to 4 total attempts and exponential backoff.

        Backoff schedule (attempts 1, 2, 3):
          Attempt 1: ~1.1–1.5s  (2^0 + jitter)
          Attempt 2: ~2.1–2.5s  (2^1 + jitter)
          Attempt 3: ~4.1–4.5s  (2^2 + jitter)

        Does NOT apply rate limiting (that is the caller's responsibility via _rate_limited_request).
        """
        last_error_type: str | None = None
        last_error_detail: str | None = None

        for attempt in range(MAX_ATTEMPTS):
            if attempt > 0:
                delay = 2 ** (attempt - 1) + random.uniform(0.1, 0.5)
                await asyncio.sleep(delay)

            try:
                # Use await (not async with) so the caller can read the response body
                # after this method returns. Caller is responsible for closing the response.
                resp = await self._session.request(method, url, **kwargs)
                status = resp.status
                if 400 <= status < 500:
                    return RequestResult(
                        response=resp,
                        status=status,
                        error_type="http_4xx",
                        error_detail=None,
                    )
                if status >= 500:
                    await resp.release()
                    last_error_type = "http_5xx"
                    last_error_detail = f"HTTP {status}"
                    continue  # retry
                self._last_activity = time.time()
                return RequestResult(
                    response=resp,
                    status=status,
                    error_type=None,
                    error_detail=None,
                )

            except (aiohttp.ServerTimeoutError, asyncio.TimeoutError) as exc:
                last_error_type = "timeout"
                last_error_detail = str(exc)
            except (aiohttp.ClientConnectionError, ConnectionError, OSError) as exc:
                exc_str = str(exc)
                if "Name or service not known" in exc_str or "nodename nor servname" in exc_str:
                    last_error_type = "dns"
                else:
                    last_error_type = "connection"
                last_error_detail = exc_str

        return RequestResult(
            response=None,
            status=None,
            error_type=last_error_type,
            error_detail=last_error_detail,
        )

    async def _refresh_session(self) -> None:
        """Close the current session and create a new one with a fresh cookie jar.

        Guards against more than 2 refreshes per crawl run.
        """
        if self._session_refresh_count >= 2:
            logger.warning("[vnthuquan] Max session refreshes (2) reached — skipping refresh")
            return
        await self._session.close()
        self._session = await create_session()
        self._session_refresh_count += 1

    # -----------------------------------------------------------------------
    # Story 2.2: Listing page crawling
    # -----------------------------------------------------------------------

    def _listing_url(self, page_num: int) -> str:
        """Build the listing page URL for a given page number."""
        base = self._source_config.seed_url.rsplit("?", 1)[0]
        return f"{base}?tranghientai={page_num}"

    def _resolve_entry_urls(
        self, listing_page_url: str, entries: list[BookListingEntry]
    ) -> list[BookListingEntry]:
        """Join relative book hrefs to the listing URL (site uses relative truyen.aspx links)."""
        return [replace(e, url=urljoin(listing_page_url, e.url)) for e in entries]

    async def fetch_listing_page(self, page_num: int) -> list[BookListingEntry]:
        """Fetch and parse a single listing page. Returns [] on any error."""
        url = self._listing_url(page_num)
        result = await self._rate_limited_request("GET", url)
        if result.error_type or not result.response:
            if result.response is not None:
                await result.response.release()
            logger.warning(f"[vnthuquan] Failed listing page {page_num}: {result.error_detail}")
            return []
        html = await result.response.text(encoding="utf-8")
        return self._resolve_entry_urls(url, parse_listing_page(html))

    async def fetch_all_listings(
        self, start_page: int = 1, end_page: int = 0
    ) -> list[BookListingEntry]:
        """Fetch all listing pages, auto-detecting last page if end_page==0.

        Returns only entries with format_type == "Text" (FR4).
        """
        all_entries: list[BookListingEntry] = []

        # Fetch first page directly to share one request for pagination detection and entries
        first_page_result = await self._rate_limited_request(
            "GET", self._listing_url(start_page)
        )
        if first_page_result.error_type or not first_page_result.response:
            if first_page_result.response is not None:
                await first_page_result.response.release()
            logger.error(
                f"[vnthuquan] Failed to fetch first listing page: {first_page_result.error_detail}"
            )
            return []

        first_html = await first_page_result.response.text(encoding="utf-8")
        first_listing_url = self._listing_url(start_page)
        first_entries = self._resolve_entry_urls(first_listing_url, parse_listing_page(first_html))

        if end_page == 0:
            end_page = extract_last_page_number(first_html)
            logger.info(f"[vnthuquan] Auto-detected last page: {end_page}")

        all_entries.extend(first_entries)

        for page_num in range(start_page + 1, end_page + 1):
            entries = await self.fetch_listing_page(page_num)
            all_entries.extend(entries)

        # Filter to Text-only (FR4) — non-Text entries silently dropped
        text_only = [e for e in all_entries if e.format_type == "Text"]
        logger.info(
            f"[vnthuquan] Found {len(text_only)} Text books from {len(all_entries)} total"
            f" across pages {start_page}-{end_page}"
        )
        return text_only

    # -----------------------------------------------------------------------
    # Story 2.3: Book detail and chapter content fetching
    # -----------------------------------------------------------------------

    async def fetch_book_detail(self, entry: BookListingEntry) -> BookDetail | None:
        """Fetch and parse a book detail page."""
        url = entry.url
        result = await self._rate_limited_request("GET", url)
        if result.error_type or not result.response:
            if result.response is not None:
                await result.response.release()
            logger.warning(f"[vnthuquan] Failed book detail {url}: {result.error_detail}")
            return None
        html = await result.response.text(encoding="utf-8")
        detail = parse_book_detail(html)
        if detail is None:
            logger.warning(f"[vnthuquan] Unparseable book detail: {url}")
            return None
        logger.info(f"[vnthuquan] Fetched book: {detail.title} ({len(detail.chapter_list)} chapters)")
        return detail

    async def fetch_chapter(self, tuaid: int, chuongid: int | str) -> ChapterParseResult | None:
        """Fetch and parse one chapter via AJAX POST."""
        data = {"tuaid": str(tuaid), "chuongid": str(chuongid)}
        result = await self._rate_limited_request("POST", CHAPTER_AJAX_URL, data=data)
        if result.error_type or not result.response:
            if result.response is not None:
                await result.response.release()
            logger.warning(
                f"[vnthuquan] Failed chapter {chuongid} for book {tuaid}: {result.error_detail}"
            )
            return None
        raw = await result.response.text(encoding="utf-8")
        return parse_chapter_response(raw)

    async def _download_cover(self, cover_url: str | None, book_data: "BookData") -> str | None:
        """Download cover image and save next to book.json. Returns relative local path or None."""
        if not cover_url:
            return None
        result = await self._rate_limited_request("GET", cover_url)
        if result.error_type or not result.response:
            if result.response is not None:
                await result.response.release()
            logger.warning(f"[vnthuquan] Failed to download cover {cover_url}")
            return None
        try:
            img_bytes = await result.response.read()
        except Exception as exc:
            logger.warning(f"[vnthuquan] Error reading cover bytes {cover_url}: {exc}")
            return None

        # Derive extension from URL; default to .jpg
        ext = Path(cover_url.split("?")[0]).suffix.lower() or ".jpg"
        if ext not in {".jpg", ".jpeg", ".png", ".webp", ".gif"}:
            ext = ".jpg"

        target_dir = (
            self.output_dir
            / "book-data"
            / "vnthuquan"
            / book_data.category_seo_name
            / book_data.book_seo_name
        )
        target_dir.mkdir(parents=True, exist_ok=True)
        cover_file = target_dir / f"cover{ext}"
        cover_file.write_bytes(img_bytes)

        # Return path relative to output_dir/book-data
        rel = cover_file.relative_to(self.output_dir / "book-data")
        logger.info(f"[vnthuquan] Cover saved: {rel}")
        return str(rel)

    async def crawl_book(self, entry: BookListingEntry) -> bool:
        """Process one book: fetch detail, chapters, assemble, write, update state."""
        # AC #6: early-exit if already downloaded
        if self.state.is_downloaded(entry.url):
            logger.info(f"[vnthuquan] Skip (state): {entry.url}")
            return True

        detail = await self.fetch_book_detail(entry)
        if detail is None:
            # AC #3: mark error on detail fetch failure
            async with self._state_lock:
                self.state.mark_error(entry.url)
                self.state.save()
            return False

        chapters_html: list[str] = []
        # Prefer listing-page cover; fall back to first-chapter AJAX cover
        cover_url: str | None = entry.cover_image_url

        for i, (chuongid, chapter_name) in enumerate(detail.chapter_list):
            logger.info(
                f"[vnthuquan]   Chapter {i + 1}/{len(detail.chapter_list)}: {chapter_name} (id={chuongid})"
            )
            result = await self.fetch_chapter(detail.tuaid, chuongid)
            html = result.content_html if result else None
            if html is None:
                logger.warning(f"[vnthuquan] Empty chapter {chuongid} in book {detail.tuaid}")
                html = ""
            chapters_html.append(html)
            if i == 0 and result and cover_url is None:
                cover_url = result.cover_image_url

        # AC #2 and #4: assemble, write, then update state
        try:
            book_data = assemble_book_data(entry, detail, chapters_html, cover_url)
            cover_local_path = await self._download_cover(cover_url, book_data)
            if cover_local_path:
                book_data.cover_image_local_path = cover_local_path
            write_book_json(book_data, self.output_dir)  # write FIRST
            async with self._state_lock:
                self.state.mark_downloaded(entry.url)    # only after successful write
                self.state.save()
            await self._append_to_index(
                self._book_json_path(book_data.category_seo_name, book_data.book_seo_name)
            )
            self._record_book_completed()
            logger.info(f"[vnthuquan] Downloaded: {entry.url} ({len(chapters_html)} chapters)")
            return True
        except Exception as e:
            async with self._state_lock:
                self.state.mark_error(entry.url)
                self.state.save()
            logger.error(f"[vnthuquan] Error writing book {entry.url}: {e}")
            return False

    def _record_book_completed(self) -> None:
        self._last_activity = time.time()

    def _book_json_path(self, category_seo: str, book_seo: str) -> Path:
        """Resolve the on-disk book.json path for a (category, book) slug pair."""
        return (
            self.output_dir
            / "book-data"
            / "vnthuquan"
            / category_seo
            / book_seo
            / "book.json"
        )

    async def _append_to_index(self, book_json_path: Path) -> None:
        """Append-only incremental update of data/book-data/vnthuquan/index.json.

        Serialized via _index_lock so concurrent assemblers can't trample each other.
        Reads BookData from book_json_path on disk — no need for an in-memory copy.
        """
        async with self._index_lock:
            await asyncio.to_thread(
                append_book_to_index,
                self.output_dir,
                "vnthuquan",
                book_json_path,
                logger,
            )

    # -----------------------------------------------------------------------
    # Page-level crash recovery
    # -----------------------------------------------------------------------

    @property
    def _meta_file(self) -> Path:
        """Sidecar JSON file that records the next listing page to process."""
        state_path = Path(self.state._state_file)
        return state_path.parent / (state_path.stem + "-meta.json")

    def _load_page_progress(self) -> int:
        """Return the next listing page number to process (1 if no saved progress)."""
        if self._meta_file.exists():
            try:
                data = json.loads(self._meta_file.read_text(encoding="utf-8"))
                return int(data.get("next_page", 1))
            except Exception:
                pass
        return 1

    def _save_page_progress(self, next_page: int) -> None:
        """Persist the next listing page number so a crashed run can resume."""
        self._meta_file.parent.mkdir(parents=True, exist_ok=True)
        self._meta_file.write_text(
            json.dumps({"next_page": next_page}, indent=2, ensure_ascii=False),
            encoding="utf-8",
        )

    async def _monitor_health(self) -> None:
        """Stall detection: abort if no successful HTTP response for 30 minutes."""
        check_interval = 60
        stall_threshold = 1800  # 30 min
        while True:
            if self._done:
                return
            try:
                await asyncio.wait_for(self._shutdown_event.wait(), timeout=check_interval)
                return
            except asyncio.TimeoutError:
                pass
            if self._done:
                return
            idle_sec = time.time() - self._last_activity
            if idle_sec > stall_threshold and self._books_remaining > 0:
                logger.error(
                    f"[vnthuquan] Aborting: no HTTP activity for {idle_sec / 60:.0f}min"
                )
                self._abort = True
                return

    async def _auto_detect_end_page(self, start_page: int) -> int:
        """Fetch the first listing page to extract the last page number.

        Falls back to start_page on any error (single-page crawl).
        """
        url = self._listing_url(start_page)
        result = await self._rate_limited_request("GET", url)
        if result.error_type or not result.response:
            if result.response is not None:
                await result.response.release()
            logger.error(
                f"[vnthuquan] Failed to fetch first listing page for pagination: {result.error_detail}"
            )
            return start_page
        html = await result.response.text(encoding="utf-8")
        last = extract_last_page_number(html)
        logger.info(f"[vnthuquan] Auto-detected last page: {last}")
        return last

    async def crawl_all(
        self,
        start_page: int = 1,
        end_page: int = 0,
        concurrency: int = 5,
        max_hours: float = 0.0,
        dry_run: bool = False,
    ) -> None:
        """Fetch one listing page, crawl its books via chapter-level concurrency, then repeat."""
        if end_page == 0:
            end_page = await self._auto_detect_end_page(start_page)

        total_pages = end_page - start_page + 1

        # Dry-run: list all books without downloading
        if dry_run:
            all_entries: list[BookListingEntry] = []
            for page_num in range(start_page, end_page + 1):
                all_entries.extend(await self.fetch_listing_page(page_num))
            text_only = [e for e in all_entries if e.format_type == "Text"]
            typer.echo(
                f"[vnthuquan] DRY RUN — {len(text_only)} Text books across {total_pages} pages"
            )
            for entry in text_only:
                typer.echo(
                    f"[vnthuquan] DRY RUN book: {entry.title} | {entry.author_name} | "
                    f"{entry.format_type} | {entry.url}"
                )
            typer.echo(f"[vnthuquan] DRY RUN complete. {len(text_only)} books found.")
            return

        # Page-level crash resume: skip listing pages already fully processed
        resume_from = self._load_page_progress()
        if resume_from > start_page:
            logger.info(
                f"[vnthuquan] Resuming from page {resume_from} "
                f"(pages {start_page}–{resume_from - 1} already completed)"
            )

        start_time = time.time()
        run_totals = {"ok": 0, "err": 0, "skipped": 0}

        monitor_task = asyncio.create_task(self._monitor_health())
        try:
            for page_num in range(start_page, end_page + 1):
                if self._abort:
                    logger.warning("[vnthuquan] Aborting page loop (stall detected)")
                    break
                if max_hours > 0 and (time.time() - start_time) / 3600 > max_hours:
                    logger.info(f"[vnthuquan] Max hours reached before page {page_num}")
                    break

                # Skip pages already completed in a prior (crashed) run
                if page_num < resume_from:
                    logger.info(
                        f"[vnthuquan] Page {page_num}/{end_page} — already completed, skipping"
                    )
                    continue

                logger.info(
                    f"[vnthuquan] ── Page {page_num}/{end_page} "
                    f"({page_num - start_page + 1}/{total_pages}) ──"
                )

                entries = await self.fetch_listing_page(page_num)
                text_entries = [e for e in entries if e.format_type == "Text"]
                pending = [e for e in text_entries if not self.state.is_downloaded(e.url)]
                already_done = len(text_entries) - len(pending)

                logger.info(
                    f"[vnthuquan] Page {page_num}: {len(text_entries)} Text books, "
                    f"{len(pending)} to fetch, {already_done} already done"
                )

                self._books_remaining = len(pending)
                page_stats = {"ok": 0, "err": 0, "time_skipped": 0}

                if pending:
                    await self._crawl_page_with_chapter_queue(
                        pending, page_num, page_stats, concurrency, max_hours, start_time
                    )

                run_totals["ok"] += page_stats["ok"]
                run_totals["err"] += page_stats["err"]
                run_totals["skipped"] += already_done + page_stats["time_skipped"]

                logger.info(
                    f"[vnthuquan] Page {page_num} complete — "
                    f"{page_stats['ok']} ok, {page_stats['err']} err, "
                    f"{page_stats['time_skipped']} time-skipped | "
                    f"Run total: {run_totals['ok']} ok, {run_totals['err']} err, "
                    f"{run_totals['skipped']} skipped"
                )

                # Persist page progress so a future run can skip this page
                self._save_page_progress(page_num + 1)

        finally:
            self._done = True
            self._shutdown_event.set()
            await monitor_task

        logger.info(
            f"[vnthuquan] Crawl complete — "
            f"{run_totals['ok']} ok, {run_totals['err']} err, "
            f"{run_totals['skipped']} already done"
        )

    async def _crawl_page_with_chapter_queue(
        self,
        pending: list[BookListingEntry],
        page_num: int,
        page_stats: dict[str, int],
        concurrency: int,
        max_hours: float,
        start_time: float,
    ) -> None:
        """Process a page's pending books using a shared chapter-level work queue.

        Phase A  — fetch book details concurrently (semaphore-limited).
        Phase A.1 — chapter resume check: pre-fill collectors from existing book.json.
        Phase B  — enqueue only missing chapters into a shared queue.
        Phase C  — N worker coroutines pull from the queue and fetch chapters.
        Phase D  — one assembler task per book awaits completion then writes book.json.
        """
        # ── Phase A: Fetch all book details concurrently ──
        detail_sem = asyncio.Semaphore(concurrency)
        collectors: list[BookCollector] = []
        collectors_lock = asyncio.Lock()
        page_stats_lock = asyncio.Lock()

        async def _fetch_detail(entry: BookListingEntry) -> None:
            if self._abort or (max_hours > 0 and (time.time() - start_time) / 3600 > max_hours):
                self._books_remaining = max(0, self._books_remaining - 1)
                async with page_stats_lock:
                    page_stats["time_skipped"] += 1
                return
            async with detail_sem:
                detail = await self.fetch_book_detail(entry)
            if detail is None:
                async with self._state_lock:
                    self.state.mark_error(entry.url)
                    self.state.save()
                async with page_stats_lock:
                    page_stats["err"] += 1
                self._books_remaining = max(0, self._books_remaining - 1)
                return

            # ── Phase A.1: Chapter resume check ──
            existing_html = _load_existing_chapters(entry, detail, self.output_dir)
            pending_count = sum(1 for h in existing_html if h is None)
            loaded = len(detail.chapter_list) - pending_count

            chapters_result: list[ChapterParseResult | None] = [
                ChapterParseResult(content_html=h, cover_image_url=None) if h is not None else None
                for h in existing_html
            ]

            collector = BookCollector(
                entry=entry,
                detail=detail,
                total_chapters=len(detail.chapter_list),
                chapters_result=chapters_result,
                cover_url=entry.cover_image_url,
                completed=asyncio.Event(),
                pending_count=pending_count,
            )

            if loaded > 0:
                logger.info(
                    f"[vnthuquan] Book \"{detail.title}\": "
                    f"{loaded}/{len(detail.chapter_list)} chapters from disk, "
                    f"{pending_count} to fetch"
                )

            if pending_count == 0:
                # All chapters already on disk — mark immediately, no network needed
                collector.completed.set()
                async with self._state_lock:
                    self.state.mark_downloaded(entry.url)
                    self.state.save()
                # book.json already exists on disk. Resolve to the actual file
                # (base slug OR collision-resolved {slug}-{tuaid}) and let the
                # indexer read it directly.
                cat_seo = slugify_title(entry.category_name)
                base_slug = slugify_title(detail.title)
                base_path = self._book_json_path(cat_seo, base_slug)
                resolved_path = (
                    base_path if base_path.exists()
                    else self._book_json_path(cat_seo, f"{base_slug}-{detail.tuaid}")
                )
                await self._append_to_index(resolved_path)
                self._record_book_completed()
                logger.info(
                    f"[vnthuquan] Downloaded (from disk): {entry.url} ({loaded} chapters)"
                )
                async with page_stats_lock:
                    page_stats["ok"] += 1
                self._books_remaining = max(0, self._books_remaining - 1)

            async with collectors_lock:
                collectors.append(collector)

        await asyncio.gather(*[_fetch_detail(e) for e in pending])

        # ── Phase B: Enqueue only missing chapters ──
        chapter_queue: asyncio.Queue[ChapterTask] = asyncio.Queue()
        active_collectors = [c for c in collectors if not c.completed.is_set()]
        total_to_fetch = 0

        for coll in active_collectors:
            for i, (chuongid, chapter_name) in enumerate(coll.detail.chapter_list):
                if coll.chapters_result[i] is None:
                    await chapter_queue.put(ChapterTask(
                        collector=coll,
                        chapter_index=i,
                        chuongid=chuongid,
                        chapter_name=chapter_name,
                    ))
                    total_to_fetch += 1

        if not active_collectors:
            return

        chapters_fetched = {"n": 0}
        progress_lock = asyncio.Lock()

        # ── Phase C: Worker pool — N coroutines pull chapters from the shared queue ──
        async def _chapter_worker() -> None:
            while True:
                task = await chapter_queue.get()
                try:
                    coll = task.collector
                    result = await self.fetch_chapter(coll.detail.tuaid, task.chuongid)

                    if result is None:
                        logger.warning(
                            f"[vnthuquan] Empty chapter {task.chuongid} in book {coll.detail.tuaid}"
                        )
                        coll.chapters_result[task.chapter_index] = ChapterParseResult(
                            content_html="", cover_image_url=None
                        )
                    else:
                        coll.chapters_result[task.chapter_index] = result
                        if task.chapter_index == 0 and result.cover_image_url and coll.cover_url is None:
                            coll.cover_url = result.cover_image_url

                    coll.received_count += 1

                    # Progress logging
                    async with progress_lock:
                        chapters_fetched["n"] += 1
                        done_n = chapters_fetched["n"]
                        if (
                            done_n == 1
                            or done_n == total_to_fetch
                            or (_PROGRESS_LOG_INTERVAL > 0 and done_n % _PROGRESS_LOG_INTERVAL == 0)
                        ):
                            books_complete = sum(1 for c in active_collectors if c.completed.is_set())
                            logger.info(
                                f"[vnthuquan] Page {page_num} chapters: "
                                f"{done_n}/{total_to_fetch} fetched "
                                f"(books: {books_complete}/{len(active_collectors)} complete, "
                                f"{page_stats['err']} err)"
                            )

                    # Progressive save every 5 chapters + on last chapter for this book
                    if (
                        coll.received_count % 5 == 0
                        or coll.received_count == coll.pending_count
                    ):
                        _write_partial_book_json(coll, self.output_dir)

                    if coll.received_count == coll.pending_count:
                        coll.completed.set()

                finally:
                    chapter_queue.task_done()

        # ── Phase D: Assembler tasks — one per active collector ──
        async def _assemble_book(coll: BookCollector) -> None:
            await coll.completed.wait()
            entry = coll.entry
            detail = coll.detail

            chapters_html: list[str] = []
            cover_url = coll.cover_url
            for i, res in enumerate(coll.chapters_result):
                if res is not None:
                    if i == 0 and res.cover_image_url and cover_url is None:
                        cover_url = res.cover_image_url
                    chapters_html.append(res.content_html or "")
                else:
                    chapters_html.append("")

            try:
                book_data = assemble_book_data(entry, detail, chapters_html, cover_url)
                cover_local_path = await self._download_cover(cover_url, book_data)
                if cover_local_path:
                    book_data.cover_image_local_path = cover_local_path
                write_book_json(book_data, self.output_dir)
                async with self._state_lock:
                    self.state.mark_downloaded(entry.url)
                    self.state.save()
                await self._append_to_index(
                    self._book_json_path(book_data.category_seo_name, book_data.book_seo_name)
                )
                self._record_book_completed()
                logger.info(
                    f"[vnthuquan] Downloaded: {entry.url} ({len(chapters_html)} chapters)"
                )
                async with page_stats_lock:
                    page_stats["ok"] += 1
            except Exception as e:
                async with self._state_lock:
                    self.state.mark_error(entry.url)
                    self.state.save()
                logger.error(f"[vnthuquan] Error writing book {entry.url}: {e}")
                async with page_stats_lock:
                    page_stats["err"] += 1
            finally:
                self._books_remaining = max(0, self._books_remaining - 1)

        # Launch workers and assemblers; wait for queue to drain then clean up
        num_workers = min(concurrency, total_to_fetch)
        workers = [asyncio.create_task(_chapter_worker()) for _ in range(num_workers)]
        assemblers = [asyncio.create_task(_assemble_book(c)) for c in active_collectors]

        await chapter_queue.join()
        for w in workers:
            w.cancel()
        await asyncio.gather(*workers, return_exceptions=True)
        await asyncio.gather(*assemblers)


# ---------------------------------------------------------------------------
# Story 4.1: Typer CLI
# ---------------------------------------------------------------------------

app = typer.Typer()


@app.command()
def crawl(
    start_page: int = typer.Option(1, "--start-page", help="First listing page to crawl"),
    end_page: int = typer.Option(0, "--end-page", help="Last page (0 = auto-detect)"),
    resume: bool = typer.Option(True, "--resume/--no-resume", help="Resume from existing state"),
    rate_limit: float = typer.Option(-1.0, "--rate-limit", help="Rate limit per request in seconds (-1 = use config, 0 = no limit)"),
    concurrency: int = typer.Option(5, "--concurrency", help="Number of concurrent book workers"),
    max_hours: float = typer.Option(0.0, "--max-hours", help="Max hours to crawl (0 = unlimited)"),
    dry_run: bool = typer.Option(False, "--dry-run", help="List books without downloading"),
) -> None:
    """Crawl VNThuQuan books and write to book.json files."""
    asyncio.run(_run_crawl(start_page, end_page, resume, rate_limit, concurrency, max_hours, dry_run))


async def _run_crawl(
    start_page: int,
    end_page: int,
    resume: bool,
    rate_limit: float,
    concurrency: int,
    max_hours: float,
    dry_run: bool,
) -> None:
    cfg = load_config("config.yaml")
    setup_logger(_LOGGER_NAME, cfg.log_file)
    try:
        vnthuquan_src = next(s for s in cfg.sources if s.name == "vnthuquan")
    except StopIteration:
        raise typer.BadParameter("No 'vnthuquan' source found in config.yaml")

    if rate_limit >= 0:
        vnthuquan_src.rate_limit_seconds = rate_limit

    state = CrawlState(state_file="data/crawl-state-vnthuquan.json")

    session = await create_session()
    try:
        adapter = VnthuquanAdapter(
            vnthuquan_src,
            session,
            state,
            output_dir=Path("data"),
        )
        if not resume:
            state._state.clear()  # discard loaded state, start fresh
            if adapter._meta_file.exists():
                adapter._meta_file.unlink()  # reset page-level progress too
            # Reset incremental index — append-only from a clean slate.
            index_path = adapter.output_dir / "book-data" / "vnthuquan" / "index.json"
            index_path.unlink(missing_ok=True)
            index_path.with_suffix(".json.tmp").unlink(missing_ok=True)
        try:
            await adapter.crawl_all(start_page, end_page, concurrency, max_hours, dry_run)
        except KeyboardInterrupt:
            state.save()
            _print_summary(state)
            typer.echo("Interrupted. State saved.")
    finally:
        await session.close()


def _print_summary(state: CrawlState) -> None:
    completed = sum(1 for s in state._state.values() if s == "downloaded")
    errors = sum(1 for s in state._state.values() if s == "error")
    total = len(state._state)
    remaining = total - completed - errors
    typer.echo(f"Summary — completed: {completed}, errors: {errors}, remaining: {remaining}")


@app.command()
def backfill_covers(
    start_page: int = typer.Option(1, "--start-page", help="First listing page to scan"),
    end_page: int = typer.Option(0, "--end-page", help="Last page (0 = auto-detect)"),
    rate_limit: float = typer.Option(-1.0, "--rate-limit", help="Rate limit per request in seconds (-1 = use config, 0 = no limit)"),
    concurrency: int = typer.Option(3, "--concurrency", help="Number of concurrent cover downloads"),
) -> None:
    """Download missing cover images for already-crawled books without re-downloading chapters."""
    asyncio.run(_run_backfill_covers(start_page, end_page, rate_limit, concurrency))


async def _run_backfill_covers(
    start_page: int,
    end_page: int,
    rate_limit: float,
    concurrency: int,
) -> None:
    cfg = load_config("config.yaml")
    setup_logger(_LOGGER_NAME, cfg.log_file)
    try:
        vnthuquan_src = next(s for s in cfg.sources if s.name == "vnthuquan")
    except StopIteration:
        raise typer.BadParameter("No 'vnthuquan' source found in config.yaml")

    if rate_limit >= 0:
        vnthuquan_src.rate_limit_seconds = rate_limit

    state = CrawlState(state_file="data/crawl-state-vnthuquan.json")
    output_dir = Path("data")
    session = await create_session()

    try:
        adapter = VnthuquanAdapter(vnthuquan_src, session, state, output_dir=output_dir)
        all_entries = await adapter.fetch_all_listings(start_page, end_page)
        text_entries = [e for e in all_entries if e.format_type.strip() == "Text"]

        semaphore = asyncio.Semaphore(concurrency)
        updated = 0
        skipped = 0

        async def backfill_one(entry: BookListingEntry) -> None:
            nonlocal updated, skipped
            if not entry.cover_image_url:
                skipped += 1
                return

            from utils.slugify import slugify_title
            import json as _json
            cat = slugify_title(entry.category_name)
            book = slugify_title(entry.title)
            book_dir = output_dir / "book-data" / "vnthuquan" / cat / book
            book_json_path = book_dir / "book.json"

            if not book_json_path.exists():
                skipped += 1
                return  # not yet crawled

            data = _json.loads(book_json_path.read_text(encoding="utf-8"))
            if data.get("cover_image_local_path"):
                skipped += 1
                return  # already has local cover

            async with semaphore:
                # Build minimal stub with correct seo names from existing book.json
                stub_seo_name = data.get("book_seo_name") or book
                stub_cat_seo = data.get("category_seo_name") or cat
                # Temporarily override to match actual book dir
                import types
                stub = types.SimpleNamespace(
                    category_seo_name=stub_cat_seo,
                    book_seo_name=stub_seo_name,
                )
                local_path = await adapter._download_cover(entry.cover_image_url, stub)  # type: ignore[arg-type]

            if local_path:
                data["cover_image_url"] = entry.cover_image_url
                data["cover_image_local_path"] = local_path
                book_json_path.write_text(
                    _json.dumps(data, ensure_ascii=False, indent=None), encoding="utf-8"
                )
                updated += 1
                logger.info(f"[vnthuquan] Backfilled cover: {entry.title} → {local_path}")
            else:
                skipped += 1

        await asyncio.gather(*[backfill_one(e) for e in text_entries])
        typer.echo(f"Backfill done — updated: {updated}, skipped: {skipped}")
    finally:
        await session.close()


if __name__ == "__main__":
    app()
