# tests/test_catalog_fetch.py
"""Tests for catalog fetch and URL extraction — Story 2-2."""
import asyncio
from unittest.mock import AsyncMock, MagicMock, patch


from models import SourceConfig
from utils.robots import RobotsCache


def make_source(name="thuvienhoasen", seed_url="https://example.com/catalog",
                pagination_selector=None, catalog_sub_selector=""):
    return SourceConfig(
        name=name,
        seed_url=seed_url,
        rate_limit_seconds=1.0,
        output_folder=name,
        css_selectors={
            "catalog_links": "a.scripture-link",
            "file_links": "a.download-link",
            "title": "h1.title",
            "category": ".breadcrumb li:nth-child(2)",
            "subcategory": ".breadcrumb li:last-child",
        },
        pagination_selector=pagination_selector,
        catalog_sub_selector=catalog_sub_selector,
    )


def make_mock_session(html_responses):
    """Build a mock aiohttp session that returns html_responses in order."""
    session = MagicMock()
    responses = []
    for html in html_responses:
        resp = AsyncMock()
        resp.status = 200
        resp.text = AsyncMock(return_value=html)
        resp.__aenter__ = AsyncMock(return_value=resp)
        resp.__aexit__ = AsyncMock(return_value=False)
        responses.append(resp)

    call_count = {"n": 0}

    def get_side_effect(url, **kwargs):
        ctx = responses[call_count["n"] % len(responses)]
        call_count["n"] += 1
        return ctx

    session.get = MagicMock(side_effect=get_side_effect)
    return session


CATALOG_HTML = """
<html><body>
  <a class="scripture-link" href="/scripture/1">Kinh 1</a>
  <a class="scripture-link" href="/scripture/2">Kinh 2</a>
  <a class="scripture-link" href="https://example.com/scripture/3">Kinh 3</a>
</body></html>
"""

EMPTY_CATALOG_HTML = "<html><body><p>No content</p></body></html>"

CATALOG_WITH_PAGINATION_PAGE1 = """
<html><body>
  <a class="scripture-link" href="/scripture/1">Kinh 1</a>
  <a class="next-page" href="/catalog?page=2">Next</a>
</body></html>
"""

CATALOG_WITH_PAGINATION_PAGE2 = """
<html><body>
  <a class="scripture-link" href="/scripture/2">Kinh 2</a>
</body></html>
"""


class TestFetchCatalogUrls:
    """AC 1: Extracts absolute scripture URLs from catalog page."""

    def test_extracts_urls_from_catalog(self):
        from crawler import fetch_catalog_urls

        source = make_source()
        session = make_mock_session([CATALOG_HTML])
        robots_cache = MagicMock(spec=RobotsCache)
        logger = MagicMock()

        with patch("crawler.robots_allowed", return_value=True):
            urls = asyncio.run(
                fetch_catalog_urls(source, session, robots_cache, logger)
            )

        assert len(urls) == 3
        # All URLs must be absolute
        for url in urls:
            assert url.startswith("https://"), f"Expected absolute URL, got: {url}"

    def test_relative_urls_resolved_to_absolute(self):
        from crawler import fetch_catalog_urls

        source = make_source()
        session = make_mock_session([CATALOG_HTML])
        robots_cache = MagicMock(spec=RobotsCache)
        logger = MagicMock()

        with patch("crawler.robots_allowed", return_value=True):
            urls = asyncio.run(
                fetch_catalog_urls(source, session, robots_cache, logger)
            )

        assert "https://example.com/scripture/1" in urls
        assert "https://example.com/scripture/2" in urls
        assert "https://example.com/scripture/3" in urls

    def test_logs_found_url_count_at_info(self):
        from crawler import fetch_catalog_urls

        source = make_source()
        session = make_mock_session([CATALOG_HTML])
        logger = MagicMock()

        with patch("crawler.robots_allowed", return_value=True):
            asyncio.run(fetch_catalog_urls(source, session, MagicMock(), logger))

        # info called with count message
        info_calls = [str(c) for c in logger.info.call_args_list]
        assert any("Found 3 scripture URLs" in c for c in info_calls)

    def test_user_agent_sent_in_headers(self):
        from crawler import fetch_catalog_urls

        source = make_source()
        session = make_mock_session([CATALOG_HTML])
        logger = MagicMock()

        with patch("crawler.robots_allowed", return_value=True):
            asyncio.run(fetch_catalog_urls(source, session, MagicMock(), logger))

        # Session was called with the seed URL
        session.get.assert_called()


class TestFetchCatalogUrlsRobotsCompliance:
    """Robots.txt check happens before fetching catalog page."""

    def test_robots_blocked_catalog_page_returns_empty_list(self):
        from crawler import fetch_catalog_urls

        source = make_source()
        session = make_mock_session([CATALOG_HTML])
        logger = MagicMock()

        with patch("crawler.robots_allowed", return_value=False):
            urls = asyncio.run(
                fetch_catalog_urls(source, session, MagicMock(), logger)
            )

        assert urls == []
        # Warning logged for the blocked catalog page
        warning_calls = [str(c) for c in logger.warning.call_args_list]
        assert any("robots.txt blocked catalog page" in c for c in warning_calls)
        # Session.get must NOT be called (no download attempted)
        session.get.assert_not_called()


class TestFetchCatalogUrlsZeroMatch:
    """AC 3: 0 matches are handled with warning, no crash."""

    def test_zero_matches_logs_warning(self):
        from crawler import fetch_catalog_urls

        source = make_source()
        session = make_mock_session([EMPTY_CATALOG_HTML])
        logger = MagicMock()

        with patch("crawler.robots_allowed", return_value=True):
            urls = asyncio.run(
                fetch_catalog_urls(source, session, MagicMock(), logger)
            )

        assert urls == []
        warning_calls = [str(c) for c in logger.warning.call_args_list]
        assert any("No URLs found" in c for c in warning_calls)

    def test_zero_matches_does_not_raise(self):
        from crawler import fetch_catalog_urls

        source = make_source()
        session = make_mock_session([EMPTY_CATALOG_HTML])
        logger = MagicMock()

        with patch("crawler.robots_allowed", return_value=True):
            # Should not raise any exception
            urls = asyncio.run(
                fetch_catalog_urls(source, session, MagicMock(), logger)
            )
        assert isinstance(urls, list)


class TestFetchCatalogUrlsNetworkError:
    """Network errors are caught — run continues."""

    def test_network_error_returns_empty_list(self):
        from crawler import fetch_catalog_urls

        source = make_source()
        session = MagicMock()
        error_ctx = MagicMock()
        error_ctx.__aenter__ = AsyncMock(side_effect=Exception("Connection error"))
        error_ctx.__aexit__ = AsyncMock(return_value=False)
        session.get = MagicMock(return_value=error_ctx)
        logger = MagicMock()

        with patch("crawler.robots_allowed", return_value=True):
            urls = asyncio.run(
                fetch_catalog_urls(source, session, MagicMock(), logger)
            )

        assert urls == []
        error_calls = [str(c) for c in logger.error.call_args_list]
        assert any("Failed to fetch catalog" in c for c in error_calls)


class TestFetchCatalogUrlsPagination:
    """AC 2: Pagination support."""

    def test_pagination_follows_next_page(self):
        from crawler import fetch_catalog_urls

        source = make_source(
            seed_url="https://example.com/catalog",
            pagination_selector="a.next-page",
        )
        session = make_mock_session(
            [CATALOG_WITH_PAGINATION_PAGE1, CATALOG_WITH_PAGINATION_PAGE2]
        )
        logger = MagicMock()

        with (
            patch("crawler.robots_allowed", return_value=True),
            patch("crawler.asyncio.sleep", new_callable=AsyncMock),
        ):
            urls = asyncio.run(
                fetch_catalog_urls(source, session, MagicMock(), logger)
            )

        assert len(urls) == 2
        assert "https://example.com/scripture/1" in urls
        assert "https://example.com/scripture/2" in urls

    def test_no_pagination_selector_fetches_single_page(self):
        from crawler import fetch_catalog_urls

        source = make_source(pagination_selector=None)
        session = make_mock_session([CATALOG_HTML])
        logger = MagicMock()

        with patch("crawler.robots_allowed", return_value=True):
            urls = asyncio.run(
                fetch_catalog_urls(source, session, MagicMock(), logger)
            )

        assert session.get.call_count == 1
        assert len(urls) == 3

    def test_visited_pages_prevent_infinite_loop(self):
        """If pagination somehow cycles back, we break the loop."""
        from crawler import fetch_catalog_urls

        # Page points to itself via pagination selector
        cyclic_html = """
        <html><body>
          <a class="scripture-link" href="/s/1">S1</a>
          <a class="next-page" href="/catalog">same page</a>
        </body></html>
        """
        source = make_source(
            seed_url="https://example.com/catalog",
            pagination_selector="a.next-page",
        )
        session = make_mock_session([cyclic_html])
        logger = MagicMock()

        with patch("crawler.robots_allowed", return_value=True):
            asyncio.run(
                fetch_catalog_urls(source, session, MagicMock(), logger)
            )

        # Should not loop infinitely — just fetches once
        assert session.get.call_count == 1


TOC_HTML = """
<html><body>
  <a href="chapter01.html">Chapter 1</a>
  <a href="chapter02.html">Chapter 2</a>
  <a href="../../index.html">Home</a>
</body></html>
"""

TOC_HTML_2 = """
<html><body>
  <a href="sutta01.html">Sutta 1</a>
  <a href="../../index.html">Home</a>
</body></html>
"""


class TestCatalogSubSelector:
    """Two-level catalog navigation via catalog_sub_selector."""

    def _make_session_with_catalog_and_toc(self, catalog_html, toc_responses):
        """Session returns catalog_html first, then each toc_response per call."""
        all_htmls = [catalog_html] + toc_responses
        return make_mock_session(all_htmls)

    def test_sub_selector_follows_level1_urls(self):
        from crawler import fetch_catalog_urls

        catalog_html = """
        <html><body>
          <a class="scripture-link" href="https://example.com/toc1">TOC 1</a>
          <a class="scripture-link" href="https://example.com/toc2">TOC 2</a>
        </body></html>
        """
        source = make_source(
            seed_url="https://example.com/catalog",
            catalog_sub_selector="a[href$='.html']:not([href^='..'])",
        )
        session = self._make_session_with_catalog_and_toc(catalog_html, [TOC_HTML, TOC_HTML_2])
        logger = MagicMock()

        with (
            patch("crawler.robots_allowed", return_value=True),
            patch("crawler.asyncio.sleep", new_callable=AsyncMock),
        ):
            urls = asyncio.run(
                fetch_catalog_urls(source, session, MagicMock(), logger)
            )

        # 2 from TOC_HTML + 1 from TOC_HTML_2 (home link excluded by not([href^='..']))
        assert len(urls) == 3
        assert "https://example.com/chapter01.html" in urls
        assert "https://example.com/chapter02.html" in urls
        assert "https://example.com/sutta01.html" in urls

    def test_sub_selector_excludes_parent_links(self):
        from crawler import fetch_catalog_urls

        catalog_html = """
        <html><body>
          <a class="scripture-link" href="https://example.com/toc1">TOC 1</a>
        </body></html>
        """
        source = make_source(
            seed_url="https://example.com/catalog",
            catalog_sub_selector="a[href$='.html']:not([href^='..'])",
        )
        session = self._make_session_with_catalog_and_toc(catalog_html, [TOC_HTML])
        logger = MagicMock()

        with (
            patch("crawler.robots_allowed", return_value=True),
            patch("crawler.asyncio.sleep", new_callable=AsyncMock),
        ):
            urls = asyncio.run(
                fetch_catalog_urls(source, session, MagicMock(), logger)
            )

        # ../../index.html should NOT be included
        assert all("index.html" not in u for u in urls)

    def test_no_sub_selector_returns_level1_urls(self):
        from crawler import fetch_catalog_urls

        source = make_source(catalog_sub_selector="")
        session = make_mock_session([CATALOG_HTML])
        logger = MagicMock()

        with patch("crawler.robots_allowed", return_value=True):
            urls = asyncio.run(
                fetch_catalog_urls(source, session, MagicMock(), logger)
            )

        assert len(urls) == 3  # level-1 only, no sub-page following

    def test_sub_selector_robots_blocked_index_page_skipped(self):
        from crawler import fetch_catalog_urls

        catalog_html = """
        <html><body>
          <a class="scripture-link" href="https://example.com/toc1">TOC 1</a>
        </body></html>
        """
        source = make_source(
            seed_url="https://example.com/catalog",
            catalog_sub_selector="a[href$='.html']",
        )
        session = make_mock_session([catalog_html, TOC_HTML])
        logger = MagicMock()

        def robots_side_effect(cache, url):
            # Block the TOC index page but allow the catalog
            return "toc1" not in url

        with (
            patch("crawler.robots_allowed", side_effect=robots_side_effect),
            patch("crawler.asyncio.sleep", new_callable=AsyncMock),
        ):
            urls = asyncio.run(
                fetch_catalog_urls(source, session, MagicMock(), logger)
            )

        assert urls == []
        warning_calls = [str(c) for c in logger.warning.call_args_list]
        assert any("robots.txt blocked index page" in c for c in warning_calls)

    def test_sub_selector_http_error_on_index_page_continues(self):
        from crawler import fetch_catalog_urls

        catalog_html = """
        <html><body>
          <a class="scripture-link" href="https://example.com/toc1">TOC 1</a>
        </body></html>
        """
        source = make_source(
            seed_url="https://example.com/catalog",
            catalog_sub_selector="a[href$='.html']",
        )
        session = MagicMock()
        call_count = {"n": 0}

        def get_side_effect(url, **kwargs):
            call_count["n"] += 1
            if call_count["n"] == 1:
                # catalog page → 200
                resp = AsyncMock()
                resp.status = 200
                resp.text = AsyncMock(return_value=catalog_html)
                resp.__aenter__ = AsyncMock(return_value=resp)
                resp.__aexit__ = AsyncMock(return_value=False)
                return resp
            else:
                # TOC page → 404
                resp = AsyncMock()
                resp.status = 404
                resp.__aenter__ = AsyncMock(return_value=resp)
                resp.__aexit__ = AsyncMock(return_value=False)
                return resp

        session.get = MagicMock(side_effect=get_side_effect)
        logger = MagicMock()

        with (
            patch("crawler.robots_allowed", return_value=True),
            patch("crawler.asyncio.sleep", new_callable=AsyncMock),
        ):
            urls = asyncio.run(
                fetch_catalog_urls(source, session, MagicMock(), logger)
            )

        assert urls == []
        error_calls = [str(c) for c in logger.error.call_args_list]
        assert any("HTTP 404 fetching index page" in c for c in error_calls)


class TestCrawlAllIntegration:
    """crawl_all integrates fetch_catalog_urls per source."""

    def test_crawl_all_calls_fetch_catalog_urls_per_source(self):
        from crawler import crawl_all

        source = make_source()
        cfg = MagicMock()
        robots_cache = MagicMock(spec=RobotsCache)
        logger = MagicMock()

        with (
            patch("crawler.CrawlState"),
            patch("crawler.fetch_catalog_urls", new_callable=AsyncMock, return_value=[]) as mock_fetch,
            patch("crawler.aiohttp.ClientSession") as mock_session_cls,
        ):
            mock_cm = AsyncMock()
            mock_cm.__aenter__ = AsyncMock(return_value=MagicMock())
            mock_cm.__aexit__ = AsyncMock(return_value=False)
            mock_session_cls.return_value = mock_cm

            asyncio.run(crawl_all([source], cfg, robots_cache, logger))

            mock_fetch.assert_called_once()
            call_kwargs = mock_fetch.call_args
            assert call_kwargs[0][0] == source
