# tests/test_download.py
"""Tests for async file download, storage, rate limiting — Story 2-3."""
import asyncio
from unittest.mock import AsyncMock, MagicMock, patch


from models import SourceConfig
from utils.state import CrawlState


def make_source(name="thuvienhoasen", seed_url="https://example.com/catalog",
                file_type_hints=None):
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
        file_type_hints=file_type_hints or [],
    )


class TestDetectFormat:
    """detect_format() — three-tier priority: URL ext > Content-Type > hints."""

    def test_html_extension(self):
        from crawler import detect_format
        assert detect_format("https://ex.com/file.html", "", []) == "html"

    def test_htm_extension(self):
        from crawler import detect_format
        assert detect_format("https://ex.com/file.htm", "", []) == "html"

    def test_pdf_extension(self):
        from crawler import detect_format
        assert detect_format("https://ex.com/doc.pdf", "", []) == "pdf"

    def test_epub_extension(self):
        from crawler import detect_format
        assert detect_format("https://ex.com/book.epub", "", []) == "epub"

    def test_content_type_html_when_no_ext(self):
        from crawler import detect_format
        assert detect_format("https://ex.com/page", "text/html; charset=utf-8", []) == "html"

    def test_content_type_pdf_when_no_ext(self):
        from crawler import detect_format
        assert detect_format("https://ex.com/doc", "application/pdf", []) == "pdf"

    def test_content_type_epub_when_no_ext(self):
        from crawler import detect_format
        assert detect_format("https://ex.com/book", "application/epub+zip", []) == "epub"

    def test_file_type_hints_fallback(self):
        from crawler import detect_format
        assert detect_format("https://ex.com/page", "", ["html"]) == "html"

    def test_unknown_format_returns_other(self):
        from crawler import detect_format
        assert detect_format("https://ex.com/file.xyz", "application/octet-stream", []) == "other"

    def test_url_extension_takes_priority_over_content_type(self):
        from crawler import detect_format
        # URL says .html, content-type says pdf → URL wins
        assert detect_format("https://ex.com/file.html", "application/pdf", []) == "html"


class TestDeriveFilename:
    """derive_filename() — URL last segment preferred, fallback to slug."""

    def test_url_has_clean_extension_uses_url_filename(self):
        from crawler import derive_filename
        name = derive_filename("https://ex.com/files/tam-kinh.html", "tam-kinh", "html")
        assert name == "tam-kinh.html"

    def test_url_with_query_string_uses_slug_fallback(self):
        from crawler import derive_filename
        name = derive_filename("https://ex.com/download?id=123", "tam-kinh", "html")
        assert name == "tam-kinh.html"

    def test_url_no_extension_uses_slug_fallback(self):
        from crawler import derive_filename
        name = derive_filename("https://ex.com/scripture/tam-kinh", "tam-kinh", "pdf")
        assert name == "tam-kinh.pdf"

    def test_never_returns_empty_string(self):
        from crawler import derive_filename
        name = derive_filename("https://ex.com/", "", "html")
        assert len(name) > 0


class TestSaveFile:
    """save_file() — writes raw bytes, creates dirs."""

    def test_creates_parent_directories(self, tmp_path):
        from crawler import save_file
        target = tmp_path / "deep" / "nested" / "file.html"
        save_file(b"<html></html>", target)
        assert target.exists()

    def test_writes_exact_bytes(self, tmp_path):
        from crawler import save_file
        content = b"\x00\x01\x02hello\xff"
        target = tmp_path / "file.bin"
        save_file(content, target)
        assert target.read_bytes() == content

    def test_overwrites_existing_file(self, tmp_path):
        from crawler import save_file
        target = tmp_path / "file.html"
        save_file(b"old", target)
        save_file(b"new content", target)
        assert target.read_bytes() == b"new content"


class TestIsCompleteHtml:
    """is_complete_html() — validates HTML completeness."""

    def test_complete_html_returns_true(self):
        from crawler import is_complete_html
        content = b"<html><body>text</body></html>"
        assert is_complete_html(content, "html") is True

    def test_incomplete_html_missing_closing_tag(self):
        from crawler import is_complete_html
        content = b"<html><body>truncated content"
        assert is_complete_html(content, "html") is False

    def test_empty_content_returns_false(self):
        from crawler import is_complete_html
        assert is_complete_html(b"", "html") is False

    def test_closing_tag_case_insensitive(self):
        from crawler import is_complete_html
        content = b"<HTML><BODY></BODY></HTML>"
        assert is_complete_html(content, "html") is True

    def test_pdf_only_needs_nonzero_size(self):
        from crawler import is_complete_html
        assert is_complete_html(b"%PDF-1.4 content", "pdf") is True

    def test_pdf_empty_returns_false(self):
        from crawler import is_complete_html
        assert is_complete_html(b"", "pdf") is False

    def test_epub_only_needs_nonzero_size(self):
        from crawler import is_complete_html
        assert is_complete_html(b"PK...epub content", "epub") is True

    def test_closing_tag_checked_in_last_512_bytes(self):
        from crawler import is_complete_html
        # Put closing tag beyond 512 bytes from end — should be detected
        content = b"<html>" + b"x" * 600 + b"</html>"
        assert is_complete_html(content, "html") is True

    def test_closing_tag_must_be_within_last_512_bytes(self):
        from crawler import is_complete_html
        # Closing tag is exactly at 512 bytes from end
        tail_content = b"</html>" + b"x" * 505  # 512 bytes from end
        content = b"<html>" + b"x" * 1000 + tail_content
        # Since we check last 512 bytes, and tag is 507 bytes from the end, it should be found
        assert is_complete_html(content, "html") is True


class TestResolveFileUrl:
    """resolve_file_url() — two-phase URL resolution for scripture pages."""

    def test_finds_file_link_on_scripture_page(self):
        from crawler import resolve_file_url

        source = make_source()
        html = """
        <html><body>
          <a class="download-link" href="/files/tam-kinh.html">Download</a>
        </body></html>
        """
        resp = AsyncMock()
        resp.status = 200
        resp.text = AsyncMock(return_value=html)
        resp.__aenter__ = AsyncMock(return_value=resp)
        resp.__aexit__ = AsyncMock(return_value=False)
        session = MagicMock()
        session.get = MagicMock(return_value=resp)
        logger = MagicMock()

        with (
            patch("crawler.robots_allowed", return_value=True),
            patch("crawler.asyncio.sleep", new_callable=AsyncMock),
        ):
            result = asyncio.run(
                resolve_file_url(
                    "https://example.com/scripture/tam-kinh",
                    source,
                    session,
                    MagicMock(),
                    logger,
                )
            )

        assert result is not None
        assert result.file_url == "https://example.com/files/tam-kinh.html"

    def test_falls_back_to_page_url_when_no_file_link(self):
        from crawler import resolve_file_url

        source = make_source()
        html = "<html><body>No download link here</body></html>"
        resp = AsyncMock()
        resp.status = 200
        resp.text = AsyncMock(return_value=html)
        resp.__aenter__ = AsyncMock(return_value=resp)
        resp.__aexit__ = AsyncMock(return_value=False)
        session = MagicMock()
        session.get = MagicMock(return_value=resp)
        logger = MagicMock()

        page_url = "https://example.com/scripture/tam-kinh"
        with (
            patch("crawler.robots_allowed", return_value=True),
            patch("crawler.asyncio.sleep", new_callable=AsyncMock),
        ):
            result = asyncio.run(
                resolve_file_url(page_url, source, session, MagicMock(), logger)
            )

        assert result is not None
        assert result.file_url == page_url

    def test_robots_blocked_returns_none(self):
        from crawler import resolve_file_url

        source = make_source()
        session = MagicMock()
        logger = MagicMock()

        with patch("crawler.robots_allowed", return_value=False):
            file_url = asyncio.run(
                resolve_file_url(
                    "https://example.com/blocked",
                    source,
                    session,
                    MagicMock(),
                    logger,
                )
            )

        assert file_url is None
        session.get.assert_not_called()

    def test_network_error_returns_none(self):
        from crawler import resolve_file_url

        source = make_source()
        error_ctx = MagicMock()
        error_ctx.__aenter__ = AsyncMock(side_effect=Exception("network error"))
        error_ctx.__aexit__ = AsyncMock(return_value=False)
        session = MagicMock()
        session.get = MagicMock(return_value=error_ctx)
        logger = MagicMock()

        with (
            patch("crawler.robots_allowed", return_value=True),
            patch("crawler.asyncio.sleep", new_callable=AsyncMock),
        ):
            result = asyncio.run(
                resolve_file_url(
                    "https://example.com/scripture/1",
                    source,
                    session,
                    MagicMock(),
                    logger,
                )
            )

        assert result is None
        error_calls = [str(c) for c in logger.error.call_args_list]
        assert any("Failed to resolve file URL" in c for c in error_calls)


class TestDownloadScriptureFile:
    """download_scripture_file() — async download with rate limiting."""

    def make_resp(self, status=200, content=b"<html></html>", content_type="text/html"):
        resp = AsyncMock()
        resp.status = status
        resp.read = AsyncMock(return_value=content)
        resp.headers = {"Content-Type": content_type}
        resp.__aenter__ = AsyncMock(return_value=resp)
        resp.__aexit__ = AsyncMock(return_value=False)
        return resp

    def test_successful_download_returns_bytes(self, tmp_path):
        from crawler import download_scripture_file

        source = make_source()
        resp = self.make_resp(content=b"<html><body></body></html>")
        session = MagicMock()
        session.get = MagicMock(return_value=resp)
        state = MagicMock(spec=CrawlState)
        logger = MagicMock()

        with patch("crawler.asyncio.sleep", new_callable=AsyncMock):
            result = asyncio.run(
                download_scripture_file(
                    "https://example.com/file.html",
                    source,
                    session,
                    state,
                    logger,
                )
            )

        assert result is not None
        content, content_type = result
        assert content == b"<html><body></body></html>"
        assert content_type == "text/html"

    def test_rate_limit_sleep_called_before_download(self, tmp_path):
        from crawler import download_scripture_file

        source = make_source()
        resp = self.make_resp(content=b"<html></html>")
        session = MagicMock()
        session.get = MagicMock(return_value=resp)
        state = MagicMock(spec=CrawlState)
        logger = MagicMock()

        with patch("crawler.asyncio.sleep", new_callable=AsyncMock) as mock_sleep:
            asyncio.run(
                download_scripture_file(
                    "https://example.com/file.html",
                    source,
                    session,
                    state,
                    logger,
                )
            )
            mock_sleep.assert_called_once_with(source.rate_limit_seconds)

    def test_http_4xx_returns_none_and_marks_error(self):
        from crawler import download_scripture_file

        source = make_source()
        resp = self.make_resp(status=404)
        session = MagicMock()
        session.get = MagicMock(return_value=resp)
        state = MagicMock(spec=CrawlState)
        logger = MagicMock()

        with patch("crawler.asyncio.sleep", new_callable=AsyncMock):
            result = asyncio.run(
                download_scripture_file(
                    "https://example.com/missing.html",
                    source,
                    session,
                    state,
                    logger,
                )
            )

        assert result is None
        state.mark_error.assert_called_once()

    def test_http_5xx_returns_none_and_marks_error(self):
        from crawler import download_scripture_file

        source = make_source()
        resp = self.make_resp(status=500)
        session = MagicMock()
        session.get = MagicMock(return_value=resp)
        state = MagicMock(spec=CrawlState)
        logger = MagicMock()

        with patch("crawler.asyncio.sleep", new_callable=AsyncMock):
            result = asyncio.run(
                download_scripture_file(
                    "https://example.com/error.html",
                    source,
                    session,
                    state,
                    logger,
                )
            )

        assert result is None
        state.mark_error.assert_called_once()

    def test_network_exception_returns_none_and_marks_error(self):
        from crawler import download_scripture_file

        source = make_source()
        error_ctx = MagicMock()
        error_ctx.__aenter__ = AsyncMock(side_effect=Exception("Connection reset"))
        error_ctx.__aexit__ = AsyncMock(return_value=False)
        session = MagicMock()
        session.get = MagicMock(return_value=error_ctx)
        state = MagicMock(spec=CrawlState)
        logger = MagicMock()

        with patch("crawler.asyncio.sleep", new_callable=AsyncMock):
            result = asyncio.run(
                download_scripture_file(
                    "https://example.com/file.html",
                    source,
                    session,
                    state,
                    logger,
                )
            )

        assert result is None
        state.mark_error.assert_called_once()
