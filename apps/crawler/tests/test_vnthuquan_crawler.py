"""
Tests for Story 2.1 & 2.2: HTTP Infrastructure & Listing Page Crawling.

Story 2.1 ACs:
  #1 — Session creation: cookie jar, User-Agent, timeouts
  #2 — Rate-limit sleep fires BEFORE the request
  #3 — Retry on 5xx / timeout with exponential backoff; exhaustion returns error result
  #4 — 4xx does NOT retry
  #5 — _refresh_session replaces session; refuses after 2 refreshes

Story 2.2 ACs:
  #1 — fetch_listing_page returns parsed BookListingEntry objects on 200
  #2 — fetch_all_listings auto-detects last page; fetches all pages sequentially
  #3 — fetch_all_listings filters to Text-only entries
  #4 — fetch_listing_page returns [] on error; fetch_all_listings skips failed pages
"""
from __future__ import annotations

import asyncio
import logging
import time
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import aiohttp
import pytest
from aioresponses import aioresponses as aioresponses_ctx
from typer.testing import CliRunner as TyCliRunner

import json as _json
from datetime import datetime, timezone

from models import SourceConfig
from utils.state import CrawlState
from vnthuquan_crawler import CHAPTER_AJAX_URL, assemble_book_data, write_book_json, app, _run_crawl
from vnthuquan_parser import BookDetail, BookListingEntry, ChapterParseResult, extract_last_page_number, parse_listing_page
from vnthuquan_crawler import VnthuquanAdapter, create_session


# ---------------------------------------------------------------------------
# Shared helpers / fixtures
# ---------------------------------------------------------------------------

def _make_source_config(rate_limit: float = 1.0) -> SourceConfig:
    return SourceConfig(
        name="vnthuquan",
        source_type="html",
        enabled=True,
        seed_url="https://vnthuquan.net/",
        rate_limit_seconds=rate_limit,
        output_folder="vnthuquan",
    )


TEST_URL = "https://vnthuquan.net/truyen/truyen.aspx?tid=abc"


# ---------------------------------------------------------------------------
# AC #1 — Session creation
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_create_session_user_agent():
    """create_session returns a session with User-Agent: MonkaiCrawler/1.1."""
    session = await create_session()
    try:
        assert session.headers.get("User-Agent") == "MonkaiCrawler/1.1"
    finally:
        await session.close()


@pytest.mark.asyncio
async def test_create_session_cookie_jar():
    """create_session pre-seeds the jar with AspxAutoDetectCookieSupport=1."""
    session = await create_session()
    try:
        # The cookie jar should contain our seed cookie
        cookies = {c.key: c.value for c in session.cookie_jar}
        assert cookies.get("AspxAutoDetectCookieSupport") == "1"
    finally:
        await session.close()


@pytest.mark.asyncio
async def test_create_session_timeouts():
    """create_session configures 30s connect / 60s read timeouts."""
    session = await create_session()
    try:
        timeout = session.timeout
        assert timeout.sock_connect == 30
        assert timeout.sock_read == 60
    finally:
        await session.close()


# ---------------------------------------------------------------------------
# AC #2 — Rate-limit sleep fires BEFORE the request
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_rate_limit_fires_before_request():
    """asyncio.sleep(rate_limit_seconds) must be called before the HTTP request."""
    session = await create_session()
    cfg = _make_source_config(rate_limit=1.5)
    adapter = VnthuquanAdapter(source_config=cfg, session=session, state=None, output_dir=Path("/tmp"))
    call_order: list[str] = []

    async def mock_sleep(seconds: float) -> None:
        call_order.append("sleep")

    with patch("asyncio.sleep", side_effect=mock_sleep):
        with aioresponses_ctx() as m:
            def _record_request(url, **kwargs):
                call_order.append("request")

            m.get(TEST_URL, status=200, body=b"OK", callback=_record_request)
            await adapter._rate_limited_request("GET", TEST_URL)

    await session.close()
    assert call_order[0] == "sleep", "sleep must fire before the HTTP request"
    assert "request" in call_order


# ---------------------------------------------------------------------------
# AC #3 — Retry on 5xx / timeout; exhaustion
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_retry_on_503_succeeds_on_third_attempt():
    """503 twice then 200: final result is 200, error_type is None."""
    session = await create_session()
    cfg = _make_source_config()
    adapter = VnthuquanAdapter(source_config=cfg, session=session, state=None, output_dir=Path("/tmp"))

    with patch("asyncio.sleep", new_callable=AsyncMock):
        with aioresponses_ctx() as m:
            m.get(TEST_URL, status=503)
            m.get(TEST_URL, status=503)
            m.get(TEST_URL, status=200, body=b"OK")
            result = await adapter._request_with_retry("GET", TEST_URL)

    await session.close()
    assert result.status == 200
    assert result.error_type is None


@pytest.mark.asyncio
async def test_retry_exhaustion_all_503():
    """All 4 attempts return 503: result has status=None, error_type='http_5xx'."""
    session = await create_session()
    cfg = _make_source_config()
    adapter = VnthuquanAdapter(source_config=cfg, session=session, state=None, output_dir=Path("/tmp"))

    with patch("asyncio.sleep", new_callable=AsyncMock):
        with aioresponses_ctx() as m:
            for _ in range(4):
                m.get(TEST_URL, status=503)
            result = await adapter._request_with_retry("GET", TEST_URL)

    await session.close()
    assert result.status is None
    assert result.error_type == "http_5xx"


@pytest.mark.asyncio
async def test_retry_exhaustion_timeout():
    """All 4 attempts raise ServerTimeoutError: result has error_type='timeout'."""
    session = await create_session()
    cfg = _make_source_config()
    adapter = VnthuquanAdapter(source_config=cfg, session=session, state=None, output_dir=Path("/tmp"))

    with patch("asyncio.sleep", new_callable=AsyncMock):
        with aioresponses_ctx() as m:
            for _ in range(4):
                m.get(TEST_URL, exception=aiohttp.ServerTimeoutError())
            result = await adapter._request_with_retry("GET", TEST_URL)

    await session.close()
    assert result.error_type == "timeout"
    assert result.status is None


# ---------------------------------------------------------------------------
# AC #4 — 4xx does NOT retry
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_4xx_does_not_retry():
    """A 404 response returns immediately without retrying."""
    session = await create_session()
    cfg = _make_source_config()
    adapter = VnthuquanAdapter(source_config=cfg, session=session, state=None, output_dir=Path("/tmp"))

    with patch("asyncio.sleep", new_callable=AsyncMock):
        with aioresponses_ctx() as m:
            m.get(TEST_URL, status=404)
            # Only 1 mock registered: if a second attempt is made, aioresponses raises ConnectionError
            result = await adapter._request_with_retry("GET", TEST_URL)

    await session.close()
    assert result.status == 404
    assert result.error_type == "http_4xx"


# ---------------------------------------------------------------------------
# AC #5 — Session refresh
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_refresh_session_replaces_session():
    """After _refresh_session(), _session is a new object and refresh count is 1."""
    session = await create_session()
    cfg = _make_source_config()
    adapter = VnthuquanAdapter(source_config=cfg, session=session, state=None, output_dir=Path("/tmp"))
    original_session = adapter._session

    await adapter._refresh_session()

    assert adapter._session is not original_session, "Session should be replaced"
    assert adapter._session_refresh_count == 1

    await adapter._session.close()


@pytest.mark.asyncio
async def test_refresh_session_count_increments():
    """After two _refresh_session() calls, count is 2."""
    session = await create_session()
    cfg = _make_source_config()
    adapter = VnthuquanAdapter(source_config=cfg, session=session, state=None, output_dir=Path("/tmp"))

    await adapter._refresh_session()
    await adapter._refresh_session()

    assert adapter._session_refresh_count == 2
    await adapter._session.close()


@pytest.mark.asyncio
async def test_refresh_session_refuses_after_two():
    """Third call to _refresh_session() does not refresh (count stays at 2)."""
    session = await create_session()
    cfg = _make_source_config()
    adapter = VnthuquanAdapter(source_config=cfg, session=session, state=None, output_dir=Path("/tmp"))

    await adapter._refresh_session()
    await adapter._refresh_session()
    session_before_third = adapter._session

    # Third call should be a no-op (returns without refreshing)
    await adapter._refresh_session()

    assert adapter._session is session_before_third, "Session should not be replaced on 3rd call"
    assert adapter._session_refresh_count == 2, "Count should remain at 2"

    await adapter._session.close()


# ===========================================================================
# Story 2.2: Listing Page Crawling with Pagination
# ===========================================================================

LISTING_SEED_URL = "http://vietnamthuquan.eu/truyen/"
FIXTURE_PATH = Path(__file__).parent / "fixtures" / "vnthuquan_listing_page.html"


def _make_listing_config() -> MagicMock:
    cfg = MagicMock()
    cfg.seed_url = LISTING_SEED_URL
    cfg.rate_limit_seconds = 0.0  # no sleep in tests
    return cfg


def _listing_url(page_num: int) -> str:
    return f"{LISTING_SEED_URL}?tranghientai={page_num}"


@pytest.fixture
def listing_fixture() -> str:
    return FIXTURE_PATH.read_text(encoding="utf-8")


# ---------------------------------------------------------------------------
# AC #1 — fetch_listing_page returns parsed entries on HTTP 200
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_fetch_listing_page_success(listing_fixture):
    """fetch_listing_page returns non-empty list of BookListingEntry on 200."""
    session = await create_session()
    cfg = _make_listing_config()
    adapter = VnthuquanAdapter(source_config=cfg, session=session, state=None, output_dir=Path("/tmp"))

    with patch("asyncio.sleep", new_callable=AsyncMock):
        with aioresponses_ctx() as m:
            m.get(_listing_url(1), body=listing_fixture.encode("utf-8"), status=200)
            entries = await adapter.fetch_listing_page(1)

    await session.close()
    assert isinstance(entries, list)
    assert len(entries) > 0
    assert hasattr(entries[0], "format_type")
    assert hasattr(entries[0], "url")


# ---------------------------------------------------------------------------
# AC #4 — fetch_listing_page returns [] on errors
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_fetch_listing_page_404():
    """fetch_listing_page returns [] on 404 (no retry for 4xx)."""
    session = await create_session()
    cfg = _make_listing_config()
    adapter = VnthuquanAdapter(source_config=cfg, session=session, state=None, output_dir=Path("/tmp"))

    with patch("asyncio.sleep", new_callable=AsyncMock):
        with aioresponses_ctx() as m:
            m.get(_listing_url(99), status=404)
            entries = await adapter.fetch_listing_page(99)

    await session.close()
    assert entries == []


@pytest.mark.asyncio
async def test_fetch_listing_page_timeout():
    """fetch_listing_page returns [] when all 4 attempts timeout."""
    session = await create_session()
    cfg = _make_listing_config()
    adapter = VnthuquanAdapter(source_config=cfg, session=session, state=None, output_dir=Path("/tmp"))

    with patch("asyncio.sleep", new_callable=AsyncMock):
        with aioresponses_ctx() as m:
            for _ in range(4):
                m.get(_listing_url(5), exception=aiohttp.ServerTimeoutError())
            entries = await adapter.fetch_listing_page(5)

    await session.close()
    assert entries == []


# ---------------------------------------------------------------------------
# AC #2 — fetch_all_listings fetches all pages with explicit end_page
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_fetch_all_listings_explicit_end_page(listing_fixture):
    """fetch_all_listings fetches all pages 1-3 when end_page=3."""
    session = await create_session()
    cfg = _make_listing_config()
    adapter = VnthuquanAdapter(source_config=cfg, session=session, state=None, output_dir=Path("/tmp"))

    with patch("asyncio.sleep", new_callable=AsyncMock):
        with aioresponses_ctx() as m:
            for p in range(1, 4):
                m.get(_listing_url(p), body=listing_fixture.encode("utf-8"), status=200)
            entries = await adapter.fetch_all_listings(start_page=1, end_page=3)

    await session.close()
    assert all(e.format_type == "Text" for e in entries)
    # 3 pages × 2 Text entries per fixture page = 6 total
    text_per_page = len([e for e in parse_listing_page(listing_fixture) if e.format_type == "Text"])
    assert len(entries) == text_per_page * 3


@pytest.mark.asyncio
async def test_fetch_all_listings_auto_detect(listing_fixture):
    """fetch_all_listings auto-detects last page from fixture pagination."""
    session = await create_session()
    cfg = _make_listing_config()
    adapter = VnthuquanAdapter(source_config=cfg, session=session, state=None, output_dir=Path("/tmp"))

    detected = extract_last_page_number(listing_fixture)
    assert detected > 1, "Fixture must have multi-page pagination for this test"

    with patch("asyncio.sleep", new_callable=AsyncMock):
        with aioresponses_ctx() as m:
            for p in range(1, detected + 1):
                m.get(_listing_url(p), body=listing_fixture.encode("utf-8"), status=200)
            entries = await adapter.fetch_all_listings(start_page=1, end_page=0)

    await session.close()
    assert all(e.format_type == "Text" for e in entries)


# ---------------------------------------------------------------------------
# AC #3 — Text-only filtering
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_fetch_all_listings_text_only_filter(listing_fixture):
    """fetch_all_listings returns only Text entries even when fixture has PDF/Audio."""
    all_parsed = parse_listing_page(listing_fixture)
    non_text = [e for e in all_parsed if e.format_type != "Text"]
    if not non_text:
        pytest.skip("Fixture has no non-Text entries; update fixture to include PDF/Audio rows")

    session = await create_session()
    cfg = _make_listing_config()
    adapter = VnthuquanAdapter(source_config=cfg, session=session, state=None, output_dir=Path("/tmp"))

    with patch("asyncio.sleep", new_callable=AsyncMock):
        with aioresponses_ctx() as m:
            m.get(_listing_url(1), body=listing_fixture.encode("utf-8"), status=200)
            entries = await adapter.fetch_all_listings(start_page=1, end_page=1)

    await session.close()
    assert all(e.format_type == "Text" for e in entries)
    assert len(entries) < len(all_parsed)


# ---------------------------------------------------------------------------
# AC #4 — fetch_all_listings skips failed pages and continues
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_fetch_all_listings_skips_failed_page(listing_fixture):
    """fetch_all_listings skips page 2 (503 all retries) and includes pages 1 & 3."""
    session = await create_session()
    cfg = _make_listing_config()
    adapter = VnthuquanAdapter(source_config=cfg, session=session, state=None, output_dir=Path("/tmp"))

    with patch("asyncio.sleep", new_callable=AsyncMock):
        with aioresponses_ctx() as m:
            m.get(_listing_url(1), body=listing_fixture.encode("utf-8"), status=200)
            # Page 2 fails all 4 attempts
            for _ in range(4):
                m.get(_listing_url(2), status=503)
            m.get(_listing_url(3), body=listing_fixture.encode("utf-8"), status=200)
            entries = await adapter.fetch_all_listings(start_page=1, end_page=3)

    await session.close()
    assert isinstance(entries, list)
    assert len(entries) > 0  # pages 1 and 3 contributed entries


# ===========================================================================
# Story 2.3: Book Detail & Chapter Content Fetching
# ===========================================================================

FIXTURES = Path(__file__).parent / "fixtures"
BOOK_DETAIL_URL = "http://vietnamthuquan.eu/truyen.aspx?tid=12345"
SINGLE_CHAPTER_URL = "http://vietnamthuquan.eu/truyen.aspx?tid=xyz999"


def _make_entry(url: str = BOOK_DETAIL_URL) -> BookListingEntry:
    return BookListingEntry(
        url=url,
        title="Test Book",
        author_name="Test Author",
        author_id=99,
        category_name="Phật Giáo",
        category_id=1,
        chapter_count=4,
        date="9.4.2026",
        format_type="Text",
    )


def _make_adapter_23():
    """Return (adapter, session) for Story 2.3 tests; caller must close session."""
    cfg = MagicMock()
    cfg.seed_url = LISTING_SEED_URL
    cfg.rate_limit_seconds = 0.0
    mock_state = MagicMock()
    mock_state.is_downloaded.return_value = False
    return cfg, mock_state


@pytest.fixture
def book_detail_fixture() -> str:
    return (FIXTURES / "vnthuquan_book_detail.html").read_text(encoding="utf-8")


@pytest.fixture
def book_detail_single_fixture() -> str:
    return (FIXTURES / "vnthuquan_book_detail_single.html").read_text(encoding="utf-8")


@pytest.fixture
def chapter_response_fixture() -> str:
    return (FIXTURES / "vnthuquan_chapter_response.txt").read_text(encoding="utf-8")


@pytest.fixture
def chapter_response_empty_fixture() -> str:
    return (FIXTURES / "vnthuquan_chapter_response_empty.txt").read_text(encoding="utf-8")


# ---------------------------------------------------------------------------
# AC #1 — fetch_book_detail
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_fetch_book_detail_multi_chapter(book_detail_fixture):
    """fetch_book_detail returns BookDetail with chapters on 200."""
    session = await create_session()
    cfg, mock_state = _make_adapter_23()
    adapter = VnthuquanAdapter(source_config=cfg, session=session, state=mock_state, output_dir=Path("/tmp"))
    entry = _make_entry(BOOK_DETAIL_URL)

    with patch("asyncio.sleep", new_callable=AsyncMock):
        with aioresponses_ctx() as m:
            m.get(BOOK_DETAIL_URL, body=book_detail_fixture.encode("utf-8"), status=200)
            detail = await adapter.fetch_book_detail(entry)

    await session.close()
    assert detail is not None
    assert detail.is_single_chapter is False
    assert len(detail.chapter_list) > 0
    assert detail.title != ""


@pytest.mark.asyncio
async def test_fetch_book_detail_single_chapter(book_detail_single_fixture):
    """fetch_book_detail returns BookDetail with is_single_chapter=True."""
    session = await create_session()
    cfg, mock_state = _make_adapter_23()
    adapter = VnthuquanAdapter(source_config=cfg, session=session, state=mock_state, output_dir=Path("/tmp"))
    entry = _make_entry(SINGLE_CHAPTER_URL)

    with patch("asyncio.sleep", new_callable=AsyncMock):
        with aioresponses_ctx() as m:
            m.get(SINGLE_CHAPTER_URL, body=book_detail_single_fixture.encode("utf-8"), status=200)
            detail = await adapter.fetch_book_detail(entry)

    await session.close()
    assert detail is not None
    assert detail.is_single_chapter is True
    assert len(detail.chapter_list) == 1


@pytest.mark.asyncio
async def test_fetch_book_detail_404():
    """fetch_book_detail returns None on 404."""
    session = await create_session()
    cfg, mock_state = _make_adapter_23()
    adapter = VnthuquanAdapter(source_config=cfg, session=session, state=mock_state, output_dir=Path("/tmp"))
    entry = _make_entry(BOOK_DETAIL_URL)

    with patch("asyncio.sleep", new_callable=AsyncMock):
        with aioresponses_ctx() as m:
            m.get(BOOK_DETAIL_URL, status=404)
            detail = await adapter.fetch_book_detail(entry)

    await session.close()
    assert detail is None


@pytest.mark.asyncio
async def test_fetch_book_detail_timeout():
    """fetch_book_detail returns None when all retries timeout."""
    session = await create_session()
    cfg, mock_state = _make_adapter_23()
    adapter = VnthuquanAdapter(source_config=cfg, session=session, state=mock_state, output_dir=Path("/tmp"))
    entry = _make_entry(BOOK_DETAIL_URL)

    with patch("asyncio.sleep", new_callable=AsyncMock):
        with aioresponses_ctx() as m:
            for _ in range(4):
                m.get(BOOK_DETAIL_URL, exception=aiohttp.ServerTimeoutError())
            detail = await adapter.fetch_book_detail(entry)

    await session.close()
    assert detail is None


@pytest.mark.asyncio
async def test_fetch_book_detail_unparseable():
    """fetch_book_detail returns None on 200 with unparseable HTML."""
    session = await create_session()
    cfg, mock_state = _make_adapter_23()
    adapter = VnthuquanAdapter(source_config=cfg, session=session, state=mock_state, output_dir=Path("/tmp"))
    entry = _make_entry(BOOK_DETAIL_URL)

    with patch("asyncio.sleep", new_callable=AsyncMock):
        with aioresponses_ctx() as m:
            m.get(BOOK_DETAIL_URL, body=b"<html><body></body></html>", status=200)
            detail = await adapter.fetch_book_detail(entry)

    await session.close()
    assert detail is None


# ---------------------------------------------------------------------------
# AC #2, #3 — fetch_chapter
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_fetch_chapter_multi_chapter(chapter_response_fixture):
    """fetch_chapter returns ChapterParseResult with content on 200."""
    session = await create_session()
    cfg, mock_state = _make_adapter_23()
    adapter = VnthuquanAdapter(source_config=cfg, session=session, state=mock_state, output_dir=Path("/tmp"))

    with patch("asyncio.sleep", new_callable=AsyncMock):
        with aioresponses_ctx() as m:
            m.post(CHAPTER_AJAX_URL, body=chapter_response_fixture.encode("utf-8"), status=200)
            result = await adapter.fetch_chapter(tuaid=33201, chuongid=1)

    await session.close()
    assert result is not None
    assert result.content_html is not None
    assert len(result.content_html) > 0


@pytest.mark.asyncio
async def test_fetch_chapter_single_chapter_empty_chuongid(chapter_response_fixture):
    """fetch_chapter with chuongid='' (single-chapter) returns content."""
    session = await create_session()
    cfg, mock_state = _make_adapter_23()
    adapter = VnthuquanAdapter(source_config=cfg, session=session, state=mock_state, output_dir=Path("/tmp"))

    with patch("asyncio.sleep", new_callable=AsyncMock):
        with aioresponses_ctx() as m:
            m.post(CHAPTER_AJAX_URL, body=chapter_response_fixture.encode("utf-8"), status=200)
            result = await adapter.fetch_chapter(tuaid=33201, chuongid="")

    await session.close()
    assert result is not None


@pytest.mark.asyncio
async def test_fetch_chapter_empty_response(chapter_response_empty_fixture):
    """fetch_chapter with empty content fixture returns result with None content_html."""
    session = await create_session()
    cfg, mock_state = _make_adapter_23()
    adapter = VnthuquanAdapter(source_config=cfg, session=session, state=mock_state, output_dir=Path("/tmp"))

    with patch("asyncio.sleep", new_callable=AsyncMock):
        with aioresponses_ctx() as m:
            m.post(CHAPTER_AJAX_URL, body=chapter_response_empty_fixture.encode("utf-8"), status=200)
            result = await adapter.fetch_chapter(tuaid=33201, chuongid=2)

    await session.close()
    assert result is not None
    assert result.content_html is None


@pytest.mark.asyncio
async def test_fetch_chapter_http_error():
    """fetch_chapter returns None on HTTP 500 (all retries)."""
    session = await create_session()
    cfg, mock_state = _make_adapter_23()
    adapter = VnthuquanAdapter(source_config=cfg, session=session, state=mock_state, output_dir=Path("/tmp"))

    with patch("asyncio.sleep", new_callable=AsyncMock):
        with aioresponses_ctx() as m:
            for _ in range(4):
                m.post(CHAPTER_AJAX_URL, status=500)
            result = await adapter.fetch_chapter(tuaid=33201, chuongid=1)

    await session.close()
    assert result is None


# ---------------------------------------------------------------------------
# AC #4 — crawl_book: empty chapter handling
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_crawl_book_empty_chapter_logs_warning(caplog):
    """crawl_book appends '' for None chapter and logs warning."""
    import logging
    session = await create_session()
    cfg, mock_state = _make_adapter_23()
    adapter = VnthuquanAdapter(source_config=cfg, session=session, state=mock_state, output_dir=Path("/tmp"))
    entry = _make_entry(BOOK_DETAIL_URL)

    # Mock fetch_book_detail to return a 2-chapter BookDetail
    from vnthuquan_parser import BookDetail
    mock_detail = BookDetail(
        title="Test Book",
        category_label="Phật Giáo",
        tuaid=33201,
        chapter_list=[(1, "Chapter 1"), (2, "Chapter 2")],
        cover_image_url=None,
        is_single_chapter=False,
    )

    # Chapter 1 returns content, chapter 2 returns None
    from vnthuquan_parser import ChapterParseResult
    ch1_result = ChapterParseResult(cover_image_url=None, content_html="<p>Content</p>")

    async def mock_fetch_detail(e):
        return mock_detail

    async def mock_fetch_chapter(tuaid, chuongid):
        return ch1_result if chuongid == 1 else None

    with patch.object(adapter, "fetch_book_detail", side_effect=mock_fetch_detail):
        with patch.object(adapter, "fetch_chapter", side_effect=mock_fetch_chapter):
            with caplog.at_level(logging.WARNING):
                result = await adapter.crawl_book(entry)

    await session.close()
    assert result is True
    assert any("Empty chapter" in r.message for r in caplog.records)


@pytest.mark.asyncio
async def test_crawl_book_detail_failure_returns_false():
    """crawl_book returns False when fetch_book_detail returns None."""
    session = await create_session()
    cfg, mock_state = _make_adapter_23()
    adapter = VnthuquanAdapter(source_config=cfg, session=session, state=mock_state, output_dir=Path("/tmp"))
    entry = _make_entry(BOOK_DETAIL_URL)

    async def mock_fetch_detail(e):
        return None

    with patch.object(adapter, "fetch_book_detail", side_effect=mock_fetch_detail):
        result = await adapter.crawl_book(entry)

    await session.close()
    assert result is False


# ---------------------------------------------------------------------------
# AC #5 — crawl_all: semaphore, dry_run, max_hours
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_crawl_all_semaphore_limits_concurrency():
    """crawl_all respects concurrency limit via Semaphore."""
    session = await create_session()
    cfg, mock_state = _make_adapter_23()
    adapter = VnthuquanAdapter(source_config=cfg, session=session, state=mock_state, output_dir=Path("/tmp"))

    entries = [
        BookListingEntry(
            url=f"http://vietnamthuquan.eu/truyen.aspx?tid={i}",
            title=f"Book {i}",
            author_name="Author",
            author_id=i,
            category_name="Phật Giáo",
            category_id=1,
            chapter_count=1,
            date="1.1.2026",
            format_type="Text",
        )
        for i in range(6)
    ]

    peak = 0
    current = 0
    lock = asyncio.Lock()

    async def fake_crawl_book(entry):
        nonlocal peak, current
        async with lock:
            current += 1
            if current > peak:
                peak = current
        await asyncio.sleep(0.05)
        async with lock:
            current -= 1

    with patch.object(adapter, "_auto_detect_end_page", new=AsyncMock(return_value=1)):
        with patch.object(adapter, "fetch_listing_page", new=AsyncMock(return_value=entries)):
            with patch.object(adapter, "crawl_book", side_effect=fake_crawl_book):
                await adapter.crawl_all(concurrency=3)

    await session.close()
    assert peak <= 3


@pytest.mark.asyncio
async def test_crawl_all_dry_run_no_crawl_book(capsys):
    """crawl_all dry_run=True prints entries but never calls crawl_book."""
    session = await create_session()
    cfg, mock_state = _make_adapter_23()
    adapter = VnthuquanAdapter(source_config=cfg, session=session, state=mock_state, output_dir=Path("/tmp"))

    entries = [
        BookListingEntry(
            url=f"http://vietnamthuquan.eu/truyen.aspx?tid={i}",
            title=f"Book {i}",
            author_name="Author",
            author_id=i,
            category_name="Phật Giáo",
            category_id=1,
            chapter_count=1,
            date="1.1.2026",
            format_type="Text",
        )
        for i in range(2)
    ]
    mock_crawl_book = AsyncMock()

    with patch.object(adapter, "_auto_detect_end_page", new=AsyncMock(return_value=1)):
        with patch.object(adapter, "fetch_listing_page", new=AsyncMock(return_value=entries)):
            with patch.object(adapter, "crawl_book", mock_crawl_book):
                await adapter.crawl_all(dry_run=True)

    await session.close()
    mock_crawl_book.assert_not_called()
    captured = capsys.readouterr()
    assert "[vnthuquan] DRY RUN book:" in captured.out


@pytest.mark.asyncio
async def test_crawl_all_max_hours_skips_all_pending(adapter_32):
    """When elapsed wall time exceeds max_hours, crawl_book is never invoked."""
    entries = [_make_entry_32(url=f"http://vnthuquan.net/truyen/mh{i}.aspx") for i in range(4)]
    mock_crawl = AsyncMock(return_value=True)
    tick = iter([0.0] + [5000.0] * 200)

    with (
        patch.object(adapter_32, "fetch_listing_page", new=AsyncMock(return_value=entries)),
        patch.object(adapter_32, "crawl_book", mock_crawl),
        patch("vnthuquan_crawler.time.time", side_effect=lambda: next(tick)),
    ):
        await adapter_32.crawl_all(
            start_page=1, end_page=1, concurrency=2, max_hours=1.0, dry_run=False
        )

    mock_crawl.assert_not_called()


# ===========================================================================
# Story 3.1: BookData v2.0 Assembly & File Writing
# ===========================================================================

def _make_entry_31() -> BookListingEntry:
    return BookListingEntry(
        url="truyen.aspx?tid=abc",
        title="bầu trời chung",
        author_name="trần hà yên",
        author_id=9936,
        category_name="Truyện ngắn",
        category_id=1,
        chapter_count=2,
        date="9.4.2026",
        format_type="Text",
    )


def _make_detail_31(num_chapters: int = 2) -> BookDetail:
    chapters = [(i + 1, f"Chương {i + 1}") for i in range(num_chapters)]
    return BookDetail(
        title="bầu trời chung",
        category_label="Truyện ngắn",
        tuaid=12345,
        chapter_list=chapters,
        cover_image_url=None,
        is_single_chapter=(num_chapters == 1),
    )


# ---------------------------------------------------------------------------
# AC #1 — assemble_book_data field mapping
# ---------------------------------------------------------------------------

def test_assemble_book_data_fields():
    """assemble_book_data maps all fields correctly."""
    from utils.slugify import slugify_title

    entry = _make_entry_31()
    detail = _make_detail_31(2)
    chapters_html = ["<p>Chapter 1 content</p>", "<p>Chapter 2 &amp; more</p>"]
    cover_url = "http://example.com/cover.jpg"

    book_data = assemble_book_data(entry, detail, chapters_html, cover_url)

    assert book_data.meta.source == "vnthuquan"
    assert book_data.meta.schema_version == "2.0"
    # built_at must be timezone-aware and recent
    now = datetime.now(timezone.utc)
    assert book_data.meta.built_at.tzinfo is not None
    delta = abs((now - book_data.meta.built_at).total_seconds())
    assert delta < 5

    assert book_data.book_id == detail.tuaid
    assert book_data.book_name == detail.title
    assert book_data.book_seo_name == slugify_title(detail.title)
    assert book_data.id == f"vnthuquan__{slugify_title(detail.title)}"
    assert book_data.category_seo_name == slugify_title(entry.category_name)
    assert book_data.chapters[0].chapter_seo_name == slugify_title(detail.chapter_list[0][1])
    assert book_data.publisher is None
    assert book_data.publication_year is None
    assert book_data.cover_image_url == cover_url
    assert book_data.total_chapters == len(detail.chapter_list)
    assert book_data.author == entry.author_name
    assert book_data.author_id == entry.author_id
    assert book_data.category_id == entry.category_id
    assert book_data.category_name == entry.category_name

    for i, chapter in enumerate(book_data.chapters):
        assert chapter.page_count == 1
        assert len(chapter.pages) == 1
        assert chapter.pages[0].sort_number == 1
        assert chapter.pages[0].page_number is None
        assert chapter.pages[0].html_content == chapters_html[i]
        assert chapter.chapter_id == detail.chapter_list[i][0]


def test_assemble_book_data_none_cover():
    """assemble_book_data with cover_url=None sets cover_image_url=None."""
    entry = _make_entry_31()
    detail = _make_detail_31(1)
    book_data = assemble_book_data(entry, detail, ["<p>content</p>"], None)
    assert book_data.cover_image_url is None


# ---------------------------------------------------------------------------
# AC #2 — write_book_json file output
# ---------------------------------------------------------------------------

def test_write_book_json_creates_file(tmp_path):
    """write_book_json creates book.json at correct path."""
    from utils.slugify import slugify_title

    entry = _make_entry_31()
    detail = _make_detail_31(1)
    book_data = assemble_book_data(entry, detail, ["<p>content &amp; test</p>"], None)

    out_path = write_book_json(book_data, tmp_path)

    cat_slug = slugify_title(entry.category_name)
    book_slug = slugify_title(detail.title)
    expected = tmp_path / "book-data" / "vnthuquan" / cat_slug / book_slug / "book.json"
    assert expected.exists()
    assert out_path == expected

    data = _json.loads(expected.read_text(encoding="utf-8"))
    assert data["book_id"] == detail.tuaid
    assert data["book_name"] == detail.title
    assert data["_meta"]["source"] == "vnthuquan"
    # HTML entities preserved verbatim
    assert data["chapters"][0]["pages"][0]["html_content"] == "<p>content &amp; test</p>"
    # ISO 8601 datetime
    built_at = data["_meta"]["built_at"]
    assert "T" in built_at  # crude ISO 8601 check


# ---------------------------------------------------------------------------
# AC #3 — slug collision handling
# ---------------------------------------------------------------------------

def test_write_book_json_slug_collision_different_id(tmp_path):
    """Slug collision with different book_id → suffixed directory."""
    from utils.slugify import slugify_title

    entry = _make_entry_31()
    detail = _make_detail_31(1)
    cat_slug = slugify_title(entry.category_name)
    book_slug = slugify_title(detail.title)

    # Pre-write a book with a DIFFERENT book_id at the same slug path
    existing_dir = tmp_path / "book-data" / "vnthuquan" / cat_slug / book_slug
    existing_dir.mkdir(parents=True)
    existing_content = {"book_id": 99999, "book_name": "Other Book"}
    (existing_dir / "book.json").write_text(_json.dumps(existing_content), encoding="utf-8")

    book_data = assemble_book_data(entry, detail, ["<p>content</p>"], None)
    out_path = write_book_json(book_data, tmp_path)

    # New file at suffixed path
    suffixed_slug = f"{book_slug}-{detail.tuaid}"
    expected = tmp_path / "book-data" / "vnthuquan" / cat_slug / suffixed_slug / "book.json"
    assert out_path == expected
    assert expected.exists()
    assert book_data.book_seo_name == suffixed_slug
    assert book_data.id == f"vnthuquan__{suffixed_slug}"

    # Original file untouched
    original = tmp_path / "book-data" / "vnthuquan" / cat_slug / book_slug / "book.json"
    assert _json.loads(original.read_text())["book_id"] == 99999


def test_write_book_json_slug_collision_same_id(tmp_path):
    """Slug collision with SAME book_id → silent overwrite (idempotent)."""
    from utils.slugify import slugify_title

    entry = _make_entry_31()
    detail = _make_detail_31(1)
    cat_slug = slugify_title(entry.category_name)
    book_slug = slugify_title(detail.title)

    # First write
    book_data = assemble_book_data(entry, detail, ["<p>first</p>"], None)
    write_book_json(book_data, tmp_path)

    # Second write with SAME book_id (e.g. re-crawl)
    book_data2 = assemble_book_data(entry, detail, ["<p>second</p>"], None)
    out_path2 = write_book_json(book_data2, tmp_path)

    # Should be the same path — no suffix
    expected = tmp_path / "book-data" / "vnthuquan" / cat_slug / book_slug / "book.json"
    assert out_path2 == expected
    data = _json.loads(expected.read_text(encoding="utf-8"))
    assert data["chapters"][0]["pages"][0]["html_content"] == "<p>second</p>"


# ---------------------------------------------------------------------------
# AC #4 — crawl_book integration with assemble + write
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_crawl_book_calls_assemble_and_write(tmp_path):
    """crawl_book assembles and writes BookData, returns True."""
    session = await create_session()
    cfg, mock_state = _make_adapter_23()
    adapter = VnthuquanAdapter(source_config=cfg, session=session, state=mock_state, output_dir=tmp_path)
    entry = _make_entry_31()

    from vnthuquan_parser import ChapterParseResult
    mock_detail = _make_detail_31(2)
    ch_result = ChapterParseResult(cover_image_url="http://example.com/cover.jpg", content_html="<p>content</p>")

    async def mock_fetch_detail(e):
        return mock_detail

    async def mock_fetch_chapter(tuaid, chuongid):
        return ch_result

    with patch.object(adapter, "fetch_book_detail", side_effect=mock_fetch_detail):
        with patch.object(adapter, "fetch_chapter", side_effect=mock_fetch_chapter):
            result = await adapter.crawl_book(entry)

    await session.close()
    assert result is True

    # Verify book.json was written
    from utils.slugify import slugify_title
    cat_slug = slugify_title(entry.category_name)
    book_slug = slugify_title(mock_detail.title)
    expected = tmp_path / "book-data" / "vnthuquan" / cat_slug / book_slug / "book.json"
    assert expected.exists()

    data = _json.loads(expected.read_text(encoding="utf-8"))
    assert data["book_id"] == mock_detail.tuaid
    assert data["cover_image_url"] == "http://example.com/cover.jpg"


# ===========================================================================
# Story 3.2: Crawl State Management & Resume
# ===========================================================================


@pytest.fixture
def tmp_state(tmp_path) -> CrawlState:
    """A fresh CrawlState backed by a temp file."""
    state_file = str(tmp_path / "crawl-state-vnthuquan.json")
    return CrawlState(state_file=state_file)


@pytest.fixture
def adapter_32(tmp_path, tmp_state) -> VnthuquanAdapter:
    """A VnthuquanAdapter with real CrawlState and mock session."""
    session = MagicMock()
    source_config = MagicMock()
    source_config.rate_limit_seconds = 0
    return VnthuquanAdapter(
        source_config=source_config,
        session=session,
        state=tmp_state,
        output_dir=tmp_path,
    )


def _make_entry_32(url: str = "http://vnthuquan.net/truyen/abc.aspx") -> BookListingEntry:
    return BookListingEntry(
        url=url,
        title="Bầu Trời Chung",
        author_name="Tác Giả Test",
        author_id=1001,
        category_name="Truyen-ngan",
        category_id=1,
        chapter_count=2,
        date="1.1.2026",
        format_type="Text",
    )


def _make_detail_32() -> BookDetail:
    return BookDetail(
        title="Bau Troi Chung",
        category_label="Truyen-ngan",
        tuaid=9999,
        chapter_list=[(101, "Chuong 1"), (102, "Chuong 2")],
        cover_image_url=None,
        is_single_chapter=False,
    )


def _make_chapter_result_32(html: str = "<p>content</p>", cover: str | None = None) -> ChapterParseResult:
    return ChapterParseResult(content_html=html, cover_image_url=cover)


# ---------------------------------------------------------------------------
# AC #1 — State and lock initialized on adapter creation
# ---------------------------------------------------------------------------

def test_adapter_state_loaded_on_init(tmp_path, tmp_state):
    """CrawlState is initialized and accessible on adapter."""
    session = MagicMock()
    source_config = MagicMock()
    source_config.rate_limit_seconds = 0
    adapter = VnthuquanAdapter(
        source_config=source_config,
        session=session,
        state=tmp_state,
        output_dir=tmp_path,
    )
    assert adapter.state is tmp_state
    assert adapter._state_lock is not None


def test_state_lock_is_asyncio_lock(adapter_32):
    """_state_lock must be an asyncio.Lock, not a threading.Lock."""
    assert isinstance(adapter_32._state_lock, asyncio.Lock)


# ---------------------------------------------------------------------------
# AC #2 — State marked downloaded after write, saved immediately
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_crawl_book_marks_downloaded_after_write(adapter_32, tmp_path):
    """mark_downloaded is called only after write_book_json succeeds."""
    entry = _make_entry_32()
    detail = _make_detail_32()

    call_order = []

    with (
        patch.object(adapter_32, "fetch_book_detail", new=AsyncMock(return_value=detail)),
        patch.object(adapter_32, "fetch_chapter", new=AsyncMock(return_value=_make_chapter_result_32())),
        patch("vnthuquan_crawler.write_book_json", side_effect=lambda *a, **kw: call_order.append("write")),
        patch("vnthuquan_crawler.assemble_book_data", return_value=MagicMock()),
    ):
        original_mark = adapter_32.state.mark_downloaded

        def mark_and_record(url):
            call_order.append("mark_downloaded")
            original_mark(url)

        adapter_32.state.mark_downloaded = mark_and_record
        result = await adapter_32.crawl_book(entry)

    assert result is True
    assert call_order.index("write") < call_order.index("mark_downloaded"), \
        "write must happen before mark_downloaded"
    assert adapter_32.state.is_downloaded(entry.url)


@pytest.mark.asyncio
async def test_crawl_book_saves_state_immediately_on_success(adapter_32, tmp_path):
    """State file is written to disk after each successful book."""
    entry = _make_entry_32()
    detail = _make_detail_32()
    state_file = Path(adapter_32.state._state_file)

    with (
        patch.object(adapter_32, "fetch_book_detail", new=AsyncMock(return_value=detail)),
        patch.object(adapter_32, "fetch_chapter", new=AsyncMock(return_value=_make_chapter_result_32())),
        patch("vnthuquan_crawler.write_book_json"),
        patch("vnthuquan_crawler.assemble_book_data", return_value=MagicMock()),
    ):
        await adapter_32.crawl_book(entry)

    assert state_file.exists(), "State file must be saved to disk after crawl_book"
    saved = _json.loads(state_file.read_text(encoding="utf-8"))
    assert saved.get(entry.url) == "downloaded"


# ---------------------------------------------------------------------------
# AC #3 — State marked error on detail fetch failure
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_crawl_book_marks_error_on_detail_failure(adapter_32, tmp_path):
    """When fetch_book_detail returns None, URL is marked error and state is saved."""
    entry = _make_entry_32()
    state_file = Path(adapter_32.state._state_file)

    with patch.object(adapter_32, "fetch_book_detail", new=AsyncMock(return_value=None)):
        result = await adapter_32.crawl_book(entry)

    assert result is False
    assert adapter_32.state.get_status(entry.url) == "error"
    assert state_file.exists()
    saved = _json.loads(state_file.read_text(encoding="utf-8"))
    assert saved.get(entry.url) == "error"


# ---------------------------------------------------------------------------
# AC #4 — State marked error on write exception
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_crawl_book_marks_error_on_write_exception(adapter_32, tmp_path, caplog):
    """When write_book_json raises, URL is marked error and state is saved."""
    entry = _make_entry_32()
    detail = _make_detail_32()

    with caplog.at_level(logging.ERROR, logger="vnthuquan"):
        with (
            patch.object(adapter_32, "fetch_book_detail", new=AsyncMock(return_value=detail)),
            patch.object(adapter_32, "fetch_chapter", new=AsyncMock(return_value=_make_chapter_result_32())),
            patch("vnthuquan_crawler.assemble_book_data", return_value=MagicMock()),
            patch("vnthuquan_crawler.write_book_json", side_effect=OSError("disk full")),
        ):
            result = await adapter_32.crawl_book(entry)

    assert result is False
    assert adapter_32.state.get_status(entry.url) == "error"
    assert not adapter_32.state.is_downloaded(entry.url)
    assert "Error writing book" in caplog.text


# ---------------------------------------------------------------------------
# AC #6 — Already-downloaded books skipped in crawl_book
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_crawl_book_skips_downloaded_url(adapter_32, caplog):
    """If URL is already downloaded in state, crawl_book skips all HTTP and returns True."""
    entry = _make_entry_32()
    adapter_32.state.mark_downloaded(entry.url)

    with caplog.at_level(logging.INFO, logger="vnthuquan"):
        with patch.object(adapter_32, "fetch_book_detail", new=AsyncMock()) as mock_detail:
            result = await adapter_32.crawl_book(entry)
            mock_detail.assert_not_called()

    assert result is True
    assert "Skip (state)" in caplog.text


# ---------------------------------------------------------------------------
# AC #5 — crawl_all resume: skips downloaded, re-attempts errors
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_crawl_all_skips_downloaded_entries(adapter_32):
    """crawl_all filters out downloaded entries before dispatching crawl_book."""
    entry_done = _make_entry_32(url="http://vnthuquan.net/truyen/done.aspx")
    entry_todo = _make_entry_32(url="http://vnthuquan.net/truyen/todo.aspx")

    adapter_32.state.mark_downloaded(entry_done.url)

    with (
        patch.object(adapter_32, "fetch_listing_page", new=AsyncMock(return_value=[entry_done, entry_todo])),
        patch.object(adapter_32, "crawl_book", new=AsyncMock(return_value=True)) as mock_crawl,
    ):
        await adapter_32.crawl_all(start_page=1, end_page=1, concurrency=1, max_hours=0, dry_run=False)

    called_urls = [call.args[0].url for call in mock_crawl.call_args_list]
    assert entry_done.url not in called_urls, "Downloaded entry must not be passed to crawl_book"
    assert entry_todo.url in called_urls, "Pending entry must be passed to crawl_book"


@pytest.mark.asyncio
async def test_crawl_all_reattempts_error_entries(adapter_32):
    """crawl_all does NOT skip entries with 'error' status — they are re-attempted."""
    entry_error = _make_entry_32(url="http://vnthuquan.net/truyen/error.aspx")
    adapter_32.state.mark_error(entry_error.url)

    with (
        patch.object(adapter_32, "fetch_listing_page", new=AsyncMock(return_value=[entry_error])),
        patch.object(adapter_32, "crawl_book", new=AsyncMock(return_value=True)) as mock_crawl,
    ):
        await adapter_32.crawl_all(start_page=1, end_page=1, concurrency=1, max_hours=0, dry_run=False)

    called_urls = [call.args[0].url for call in mock_crawl.call_args_list]
    assert entry_error.url in called_urls, "Error entry must be re-attempted"


# ---------------------------------------------------------------------------
# AC #7 — Concurrent state updates do not corrupt state
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_concurrent_state_updates_no_corruption(adapter_32, tmp_path):
    """Multiple concurrent crawl_book calls serialize state writes without data loss."""
    entries = [_make_entry_32(url=f"http://vnthuquan.net/truyen/{i}.aspx") for i in range(10)]
    detail = _make_detail_32()

    with (
        patch.object(adapter_32, "fetch_book_detail", new=AsyncMock(return_value=detail)),
        patch.object(adapter_32, "fetch_chapter", new=AsyncMock(return_value=_make_chapter_result_32())),
        patch("vnthuquan_crawler.write_book_json"),
        patch("vnthuquan_crawler.assemble_book_data", return_value=MagicMock()),
    ):
        results = await asyncio.gather(*[adapter_32.crawl_book(e) for e in entries])

    assert all(results), "All books should succeed"
    for entry in entries:
        assert adapter_32.state.is_downloaded(entry.url), f"{entry.url} not marked downloaded"


# ===========================================================================
# Story 4.1: Typer CLI & Config Entry
# ===========================================================================


# ---------------------------------------------------------------------------
# AC #1, #2 — CLI wiring
# ---------------------------------------------------------------------------

def test_cli_crawl_default_options():
    """CLI crawl command invokes _run_crawl with all defaults."""
    runner = TyCliRunner()

    with patch("vnthuquan_crawler._run_crawl", new_callable=AsyncMock) as mock_run:
        result = runner.invoke(app, ["crawl"])

    assert result.exit_code == 0, result.output
    mock_run.assert_called_once()
    args = mock_run.call_args
    assert args.args[0] == 1       # start_page
    assert args.args[1] == 0       # end_page
    assert args.args[2] is True    # resume
    assert args.args[3] == 0.0     # rate_limit
    assert args.args[4] == 5       # concurrency
    assert args.args[5] == 0.0     # max_hours
    assert args.args[6] is False   # dry_run


def test_cli_crawl_all_options():
    """CLI crawl command passes all overridden options to _run_crawl."""
    runner = TyCliRunner()

    with patch("vnthuquan_crawler._run_crawl", new_callable=AsyncMock) as mock_run:
        result = runner.invoke(app, [
            "crawl",
            "--start-page", "2",
            "--end-page", "10",
            "--no-resume",
            "--rate-limit", "2.5",
            "--concurrency", "3",
            "--max-hours", "4.0",
            "--dry-run",
        ])

    assert result.exit_code == 0, result.output
    args = mock_run.call_args
    assert args.args[0] == 2
    assert args.args[1] == 10
    assert args.args[2] is False   # --no-resume
    assert args.args[3] == 2.5
    assert args.args[4] == 3
    assert args.args[5] == 4.0
    assert args.args[6] is True    # --dry-run


def test_cli_crawl_rate_limit_override():
    """--rate-limit is forwarded as the rate_limit argument to _run_crawl."""
    runner = TyCliRunner()
    with patch("vnthuquan_crawler._run_crawl", new_callable=AsyncMock) as mock_run:
        result = runner.invoke(app, ["crawl", "--rate-limit", "3.0"])
    assert result.exit_code == 0, result.output
    assert mock_run.call_args.args[3] == 3.0


# ---------------------------------------------------------------------------
# AC #1, #2 — _run_crawl integration
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_run_crawl_keyboard_interrupt_saves_state(tmp_path):
    """_run_crawl saves state on KeyboardInterrupt."""
    mock_source = MagicMock()
    mock_source.name = "vnthuquan"
    mock_source.rate_limit_seconds = 1.5
    mock_cfg = MagicMock()
    mock_cfg.sources = [mock_source]

    saved = []

    with (
        patch("vnthuquan_crawler.load_config", return_value=mock_cfg),
        patch("vnthuquan_crawler.CrawlState") as mock_state_cls,
        patch("vnthuquan_crawler.create_session", new_callable=AsyncMock) as mock_create,
        patch("vnthuquan_crawler.VnthuquanAdapter") as mock_adapter_cls,
    ):
        mock_state = MagicMock()
        mock_state._state = {}
        mock_state.save.side_effect = lambda: saved.append(True)
        mock_state_cls.return_value = mock_state

        mock_session = MagicMock()
        mock_session.close = AsyncMock()
        mock_create.return_value = mock_session

        mock_adapter = MagicMock()
        mock_adapter.crawl_all = AsyncMock(side_effect=KeyboardInterrupt)
        mock_adapter_cls.return_value = mock_adapter

        await _run_crawl(1, 0, True, 0.0, 5, 0.0, False)

    assert len(saved) > 0, "state.save() must be called on KeyboardInterrupt"
    mock_session.close.assert_awaited_once()


@pytest.mark.asyncio
async def test_run_crawl_loads_config_and_state():
    """resume=True does not discard CrawlState loaded from disk."""
    mock_source = MagicMock()
    mock_source.name = "vnthuquan"
    mock_source.rate_limit_seconds = 2.0
    mock_cfg = MagicMock()
    mock_cfg.sources = [mock_source]

    mock_state = MagicMock()
    mock_state._state = MagicMock()

    mock_session = MagicMock()
    mock_session.close = AsyncMock()
    mock_adapter = MagicMock()
    mock_adapter.crawl_all = AsyncMock()

    with (
        patch("vnthuquan_crawler.load_config", return_value=mock_cfg),
        patch("vnthuquan_crawler.CrawlState", return_value=mock_state),
        patch("vnthuquan_crawler.create_session", new_callable=AsyncMock, return_value=mock_session),
        patch("vnthuquan_crawler.VnthuquanAdapter", return_value=mock_adapter),
    ):
        await _run_crawl(1, 2, True, 0.0, 5, 0.0, False)

    mock_state._state.clear.assert_not_called()
    mock_session.close.assert_awaited_once()


@pytest.mark.asyncio
async def test_run_crawl_no_resume_skips_state_load():
    """resume=False clears in-memory state before crawling."""
    mock_source = MagicMock()
    mock_source.name = "vnthuquan"
    mock_source.rate_limit_seconds = 1.0
    mock_cfg = MagicMock()
    mock_cfg.sources = [mock_source]

    mock_state = MagicMock()
    mock_state._state = MagicMock()

    mock_session = MagicMock()
    mock_session.close = AsyncMock()
    mock_adapter = MagicMock()
    mock_adapter.crawl_all = AsyncMock()

    with (
        patch("vnthuquan_crawler.load_config", return_value=mock_cfg),
        patch("vnthuquan_crawler.CrawlState", return_value=mock_state),
        patch("vnthuquan_crawler.create_session", new_callable=AsyncMock, return_value=mock_session),
        patch("vnthuquan_crawler.VnthuquanAdapter", return_value=mock_adapter),
    ):
        await _run_crawl(1, 0, False, 0.0, 5, 0.0, False)

    mock_state._state.clear.assert_called_once()
    mock_session.close.assert_awaited_once()


# ---------------------------------------------------------------------------
# AC #5 — Stall detection unit tests
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_books_completed_since(adapter_32):
    """_books_completed_since returns correct count."""
    now = time.time()
    adapter_32._completed_timestamps = [now - 700, now - 300, now - 100]
    count = adapter_32._books_completed_since(now - 600)
    assert count == 2  # only the last two are within 600s


def _close_coroutine_arg(aw) -> None:
    """Avoid RuntimeWarning when tests stub asyncio.wait_for without awaiting aw."""
    if asyncio.iscoroutine(aw):
        aw.close()


@pytest.mark.asyncio
async def test_monitor_health_stall_increments_count(adapter_32):
    """_monitor_health increments _stall_count when no progress."""
    adapter_32._books_remaining = 5
    call_count = 0

    async def fake_wait_for(aw, timeout):
        nonlocal call_count
        _close_coroutine_arg(aw)
        call_count += 1
        if call_count >= 2:
            adapter_32._done = True  # safety exit after 2 windows
        raise asyncio.TimeoutError()

    with patch("asyncio.wait_for", side_effect=fake_wait_for):
        await adapter_32._monitor_health()

    assert adapter_32._stall_count >= 1


@pytest.mark.asyncio
async def test_monitor_health_abort_after_3_stalls(adapter_32):
    """_monitor_health sets _abort=True after 3 consecutive stall windows."""
    adapter_32._books_remaining = 10
    call_count = 0

    async def fake_wait_for(aw, timeout):
        nonlocal call_count
        _close_coroutine_arg(aw)
        call_count += 1
        if call_count > 10:
            adapter_32._done = True  # safety exit if abort path not taken
        raise asyncio.TimeoutError()

    with patch("asyncio.wait_for", side_effect=fake_wait_for):
        await adapter_32._monitor_health()

    assert adapter_32._abort is True
    assert adapter_32._stall_count == 3


@pytest.mark.asyncio
async def test_monitor_health_resets_stall_on_progress(adapter_32):
    """_monitor_health resets _stall_count to 0 when progress is detected."""
    adapter_32._books_remaining = 5
    call_count = 0

    async def fake_wait_for(aw, timeout):
        nonlocal call_count
        _close_coroutine_arg(aw)
        call_count += 1
        if call_count == 2:
            adapter_32._record_book_completed()
        elif call_count >= 4:
            adapter_32._done = True
        raise asyncio.TimeoutError()

    with patch("asyncio.wait_for", side_effect=fake_wait_for):
        await adapter_32._monitor_health()

    # stall count should have been reset after progress was detected
    assert adapter_32._stall_count == 0


@pytest.mark.asyncio
async def test_monitor_health_exits_when_done(adapter_32):
    """_monitor_health exits immediately when _done=True before first wait."""
    adapter_32._done = True
    await adapter_32._monitor_health()


# ---------------------------------------------------------------------------
# Dry-run test
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_dry_run_prints_books_without_fetching_detail(adapter_32, capsys):
    """dry_run=True prints book entries without calling fetch_book_detail."""
    entries = [
        _make_entry_32(url=f"http://vnthuquan.net/truyen/{i}.aspx") for i in range(3)
    ]
    for e in entries:
        e = e  # entries already have titles from _make_entry_32

    with (
        patch.object(adapter_32, "fetch_listing_page", new=AsyncMock(return_value=entries)),
        patch.object(adapter_32, "fetch_book_detail", new=AsyncMock()) as mock_detail,
    ):
        await adapter_32.crawl_all(start_page=1, end_page=1, concurrency=1, max_hours=0, dry_run=True)
        mock_detail.assert_not_called()

    captured = capsys.readouterr()
    assert "[vnthuquan] DRY RUN book:" in captured.out
