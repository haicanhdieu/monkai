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
from dataclasses import dataclass, replace
from urllib.parse import urljoin
from datetime import datetime, timezone
from pathlib import Path

import aiohttp
import typer

from models import BookData, BookMeta, ChapterEntry, PageEntry, SourceConfig
from utils.config import load_config
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

logger = logging.getLogger(__name__)

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
# RequestResult dataclass
# ---------------------------------------------------------------------------

@dataclass
class RequestResult:
    response: aiohttp.ClientResponse | None
    status: int | None
    error_type: str | None  # "timeout" | "connection" | "dns" | "http_4xx" | "http_5xx" | None
    error_detail: str | None


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
        self.rate_limit_seconds: float = source_config.rate_limit_seconds
        self._session_refresh_count: int = 0
        self._done: bool = False
        self._shutdown_event = asyncio.Event()
        self._abort: bool = False
        self._stall_count: int = 0
        self._completed_timestamps: list[float] = []
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
                return RequestResult(
                    response=resp,
                    status=status,
                    error_type=None,
                    error_detail=None,
                )

            except (aiohttp.ServerTimeoutError, asyncio.TimeoutError) as exc:
                last_error_type = "timeout"
                last_error_detail = str(exc)
            except aiohttp.ClientConnectorError as exc:
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

        for i, (chuongid, _) in enumerate(detail.chapter_list):
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
        """Record a successful book completion timestamp."""
        self._completed_timestamps.append(time.time())

    def _books_completed_since(self, since_ts: float) -> int:
        """Count books completed at or after since_ts."""
        return sum(1 for ts in self._completed_timestamps if ts >= since_ts)

    async def _monitor_health(self) -> None:
        """Stall detection monitor: aborts crawl after 30min of zero throughput."""
        window_sec = 600
        while True:
            if self._done:
                return
            try:
                await asyncio.wait_for(self._shutdown_event.wait(), timeout=window_sec)
                return
            except asyncio.TimeoutError:
                pass
            if self._done:
                return
            recent = self._books_completed_since(time.time() - window_sec)
            if recent == 0 and self._books_remaining > 0:
                self._stall_count += 1
                logger.warning(
                    f"[vnthuquan] Stall detected: 0 books in last 10min (stall #{self._stall_count})"
                )
                if self._stall_count >= 3:
                    logger.error("[vnthuquan] Aborting: 30min with zero throughput")
                    self._abort = True
                    return
            else:
                self._stall_count = 0

    async def crawl_all(
        self,
        start_page: int = 1,
        end_page: int = 0,
        concurrency: int = 5,
        max_hours: float = 0.0,
        dry_run: bool = False,
    ) -> None:
        """Discover all listings and concurrently crawl each book."""
        all_entries = await self.fetch_all_listings(start_page, end_page)

        if dry_run:
            typer.echo("[vnthuquan] DRY RUN — listing books only (no download)")
            for entry in all_entries:
                typer.echo(
                    f"[vnthuquan] DRY RUN book: {entry.title} | {entry.author_name} | "
                    f"{entry.format_type} | {entry.url}"
                )
            typer.echo(f"[vnthuquan] DRY RUN complete. {len(all_entries)} books found.")
            return

        # AC #5: skip downloaded, re-attempt errors
        pending = [e for e in all_entries if not self.state.is_downloaded(e.url)]
        total = len(all_entries)
        done = total - len(pending)
        logger.info(f"[vnthuquan] {total} books total, {len(pending)} pending, {done} already done")

        self._books_remaining = len(pending)
        start_time = time.time()
        semaphore = asyncio.Semaphore(concurrency)

        async def process_book(entry: BookListingEntry) -> bool:
            if self._abort:
                return False
            if max_hours > 0 and (time.time() - start_time) / 3600 > max_hours:
                return False
            async with semaphore:
                result = await self.crawl_book(entry)
            self._books_remaining = max(0, self._books_remaining - 1)
            return result

        monitor_task = asyncio.create_task(self._monitor_health())
        try:
            await asyncio.gather(*[process_book(e) for e in pending])
        finally:
            self._done = True
            self._shutdown_event.set()
            await monitor_task


# ---------------------------------------------------------------------------
# Story 4.1: Typer CLI
# ---------------------------------------------------------------------------

app = typer.Typer()


@app.command()
def crawl(
    start_page: int = typer.Option(1, "--start-page", help="First listing page to crawl"),
    end_page: int = typer.Option(0, "--end-page", help="Last page (0 = auto-detect)"),
    resume: bool = typer.Option(True, "--resume/--no-resume", help="Resume from existing state"),
    rate_limit: float = typer.Option(0.0, "--rate-limit", help="Rate limit override in seconds (0 = use config)"),
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
    try:
        vnthuquan_src = next(s for s in cfg.sources if s.name == "vnthuquan")
    except StopIteration:
        raise typer.BadParameter("No 'vnthuquan' source found in config.yaml")

    if rate_limit > 0:
        vnthuquan_src.rate_limit_seconds = rate_limit

    state = CrawlState(state_file="data/crawl-state-vnthuquan.json")
    if not resume:
        state._state.clear()  # discard loaded state, start fresh

    session = await create_session()
    try:
        adapter = VnthuquanAdapter(
            vnthuquan_src,
            session,
            state,
            output_dir=Path("data"),
        )
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
    rate_limit: float = typer.Option(0.0, "--rate-limit", help="Rate limit override in seconds (0 = use config)"),
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
    try:
        vnthuquan_src = next(s for s in cfg.sources if s.name == "vnthuquan")
    except StopIteration:
        raise typer.BadParameter("No 'vnthuquan' source found in config.yaml")

    if rate_limit > 0:
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
                from models import BookData
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
