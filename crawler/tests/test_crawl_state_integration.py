# tests/test_crawl_state_integration.py
"""Tests for crawl state tracking, incremental skip, KeyboardInterrupt — Story 2-4."""
import asyncio
from unittest.mock import AsyncMock, MagicMock, patch


from models import CrawlerConfig, SourceConfig
from utils.state import CrawlState


def make_source():
    return SourceConfig(
        name="thuvienhoasen",
        seed_url="https://example.com/catalog",
        rate_limit_seconds=1.0,
        output_folder="thuvienhoasen",
        css_selectors={
            "catalog_links": "a.scripture-link",
            "file_links": "a.download-link",
            "title": "h1.title",
            "category": ".breadcrumb li:nth-child(2)",
            "subcategory": ".breadcrumb li:last-child",
        },
    )


class TestStateSavedAfterEveryUrl:
    """State must be persisted after EVERY URL outcome — success or failure."""

    def test_state_saved_after_successful_download(self, tmp_path):
        """State is marked downloaded and saved after a successful full pipeline run."""
        from crawler import crawl_all, ScriptureResolution

        cfg = MagicMock(spec=CrawlerConfig)
        cfg.output_dir = str(tmp_path)
        source = make_source()
        url = "https://example.com/file.html"
        content = b"<html><body>text</body></html>"

        resp = AsyncMock()
        resp.status = 200
        resp.read = AsyncMock(return_value=content)
        resp.headers = {"Content-Type": "text/html"}
        resp.__aenter__ = AsyncMock(return_value=resp)
        resp.__aexit__ = AsyncMock(return_value=False)

        with (
            patch("crawler.CrawlState") as mock_state_cls,
            patch("crawler.fetch_catalog_urls", new_callable=AsyncMock, return_value=[url]),
            patch(
                "crawler.resolve_file_url",
                new_callable=AsyncMock,
                return_value=ScriptureResolution(url, "untitled", "uncategorized"),
            ),
            patch("crawler.robots_allowed", return_value=True),
            patch("crawler.asyncio.sleep", new_callable=AsyncMock),
            patch("crawler.aiohttp.ClientSession") as mock_session_cls,
        ):
            mock_state = MagicMock(spec=CrawlState)
            mock_state.is_downloaded = MagicMock(return_value=False)
            mock_state_cls.return_value = mock_state

            mock_session = MagicMock()
            mock_session.get = MagicMock(return_value=resp)
            session_cm = AsyncMock()
            session_cm.__aenter__ = AsyncMock(return_value=mock_session)
            session_cm.__aexit__ = AsyncMock(return_value=False)
            mock_session_cls.return_value = session_cm

            asyncio.run(crawl_all([source], cfg, MagicMock(), MagicMock()))

        mock_state.mark_downloaded.assert_called_once_with(url)
        mock_state.save.assert_called()

    def test_state_saved_after_4xx_error(self):
        from crawler import download_scripture_file

        source = make_source()
        resp = AsyncMock()
        resp.status = 404
        resp.read = AsyncMock(return_value=b"Not found")
        resp.__aenter__ = AsyncMock(return_value=resp)
        resp.__aexit__ = AsyncMock(return_value=False)
        session = MagicMock()
        session.get = MagicMock(return_value=resp)
        state = MagicMock(spec=CrawlState)
        logger = MagicMock()

        with patch("crawler.asyncio.sleep", new_callable=AsyncMock):
            asyncio.run(
                download_scripture_file(
                    "https://example.com/missing.html", source, session, state, logger
                )
            )

        state.mark_error.assert_called_once_with("https://example.com/missing.html")
        state.save.assert_called()

    def test_state_saved_after_network_exception(self):
        from crawler import download_scripture_file

        source = make_source()
        error_ctx = MagicMock()
        error_ctx.__aenter__ = AsyncMock(side_effect=Exception("Network error"))
        error_ctx.__aexit__ = AsyncMock(return_value=False)
        session = MagicMock()
        session.get = MagicMock(return_value=error_ctx)
        state = MagicMock(spec=CrawlState)
        logger = MagicMock()

        with patch("crawler.asyncio.sleep", new_callable=AsyncMock):
            asyncio.run(
                download_scripture_file(
                    "https://example.com/error.html", source, session, state, logger
                )
            )

        state.mark_error.assert_called_once()
        state.save.assert_called()


class TestIncrementalSkipLogic:
    """State-based skip must use the correct log message."""

    def test_skip_already_downloaded_url_logs_skip_state(self, tmp_path):
        """State check first — logs '[crawler] Skip (state): {url}'."""
        from crawler import crawl_all, ScriptureResolution

        cfg = MagicMock(spec=CrawlerConfig)
        cfg.output_dir = str(tmp_path)

        source = make_source()
        robots_cache = MagicMock()
        logger = MagicMock()

        skip_url = "https://example.com/scripture/1"

        with (
            patch("crawler.CrawlState") as mock_state_cls,
            patch("crawler.fetch_catalog_urls", new_callable=AsyncMock, return_value=[skip_url]),
            patch(
                "crawler.resolve_file_url",
                new_callable=AsyncMock,
                return_value=ScriptureResolution(skip_url, "untitled", "uncategorized"),
            ),
            patch("crawler.aiohttp.ClientSession") as mock_session_cls,
        ):
            mock_state = MagicMock(spec=CrawlState)
            mock_state.is_downloaded = MagicMock(return_value=True)
            mock_state_cls.return_value = mock_state

            session_cm = AsyncMock()
            session_cm.__aenter__ = AsyncMock(return_value=MagicMock())
            session_cm.__aexit__ = AsyncMock(return_value=False)
            mock_session_cls.return_value = session_cm

            asyncio.run(crawl_all([source], cfg, robots_cache, logger))

        # Must log "Skip (state): {url}"
        info_calls = " ".join(str(c) for c in logger.info.call_args_list)
        assert "Skip (state)" in info_calls

    def test_disk_repair_when_file_exists_but_not_in_state(self, tmp_path):
        """File on disk but not in state → repair state.mark_downloaded and skip."""
        from crawler import crawl_all, ScriptureResolution

        cfg = MagicMock(spec=CrawlerConfig)
        cfg.output_dir = str(tmp_path)

        source = make_source()
        robots_cache = MagicMock()
        logger = MagicMock()

        file_url = "https://example.com/file.html"

        # Create the file on disk at the category-structured path (uncategorized default)
        disk_file = tmp_path / "raw" / "thuvienhoasen" / "uncategorized" / "file.html"
        disk_file.parent.mkdir(parents=True, exist_ok=True)
        disk_file.write_bytes(b"<html></html>")

        with (
            patch("crawler.CrawlState") as mock_state_cls,
            patch("crawler.fetch_catalog_urls", new_callable=AsyncMock, return_value=[file_url]),
            patch(
                "crawler.resolve_file_url",
                new_callable=AsyncMock,
                return_value=ScriptureResolution(file_url, "untitled", "uncategorized"),
            ),
            patch("crawler.robots_allowed", return_value=True),
            patch("crawler.aiohttp.ClientSession") as mock_session_cls,
        ):
            mock_state = MagicMock(spec=CrawlState)
            mock_state.is_downloaded = MagicMock(return_value=False)
            mock_state_cls.return_value = mock_state

            session_cm = AsyncMock()
            mock_session_obj = MagicMock()
            session_cm.__aenter__ = AsyncMock(return_value=mock_session_obj)
            session_cm.__aexit__ = AsyncMock(return_value=False)
            mock_session_cls.return_value = session_cm

            asyncio.run(crawl_all([source], cfg, robots_cache, logger))

        # State should be repaired
        mock_state.mark_downloaded.assert_called()
        mock_state.save.assert_called()


class TestKeyboardInterruptHandling:
    """KeyboardInterrupt results in clean exit with informative log message."""

    def test_keyboard_interrupt_caught_cleanly(self, tmp_path):
        """KeyboardInterrupt during crawl_all is caught and logged."""
        from typer.testing import CliRunner
        from crawler import app

        config_path = tmp_path / "config.yaml"
        config_path.write_text(
            "output_dir: data\n"
            "log_file: logs/crawl.log\n"
            "sources:\n"
            "  - name: thuvienhoasen\n"
            "    seed_url: https://example.com/catalog\n"
            "    rate_limit_seconds: 1.0\n"
            "    output_folder: thuvienhoasen\n"
            "    css_selectors:\n"
            "      catalog_links: 'a.list'\n"
            "      file_links: 'a.dl'\n"
            "      title: 'h1'\n"
            "      category: '.cat'\n"
            "      subcategory: '.sub'\n"
        )

        runner = CliRunner()

        with (
            patch("crawler.RobotsCache"),
            patch("crawler.asyncio.run", side_effect=KeyboardInterrupt),
            patch("crawler.setup_logger") as mock_setup_logger,
        ):
            mock_logger = MagicMock()
            mock_setup_logger.return_value = mock_logger
            result = runner.invoke(app, ["--config", str(config_path)])

        # Should exit cleanly (exit code 0), not crash with unhandled exception
        assert result.exit_code == 0

        # Must log the interrupted message
        info_calls = " ".join(str(c) for c in mock_logger.info.call_args_list)
        assert "Interrupted" in info_calls


class TestStateInitialization:
    """CrawlState is initialized at session start and loaded with existing state."""

    def test_crawl_state_initialized_in_crawl_all(self):
        """crawl_all() initializes CrawlState (loading existing state from disk)."""
        from crawler import crawl_all
        from models import CrawlerConfig

        cfg = MagicMock(spec=CrawlerConfig)
        cfg.output_dir = "data"

        source = make_source()
        robots_cache = MagicMock()
        logger = MagicMock()

        with (
            patch("crawler.CrawlState") as mock_state_cls,
            patch("crawler.fetch_catalog_urls", new_callable=AsyncMock, return_value=[]),
            patch("crawler.aiohttp.ClientSession") as mock_session_cls,
        ):
            mock_state_cls.return_value = MagicMock(spec=CrawlState)
            session_cm = AsyncMock()
            session_cm.__aenter__ = AsyncMock(return_value=MagicMock())
            session_cm.__aexit__ = AsyncMock(return_value=False)
            mock_session_cls.return_value = session_cm

            asyncio.run(crawl_all([source], cfg, robots_cache, logger))

        mock_state_cls.assert_called_once_with("data/crawl-state.json")

    def test_error_urls_are_retried_on_resume(self, tmp_path):
        """URLs with 'error' status in state are NOT skipped — they are retried."""
        from utils.state import CrawlState

        state_file = tmp_path / "crawl-state.json"
        state_file.write_text('{"https://example.com/fail.html": "error"}')
        state = CrawlState(str(state_file))

        # Error status does NOT count as downloaded
        assert state.is_downloaded("https://example.com/fail.html") is False

    def test_downloaded_urls_skipped_on_resume(self, tmp_path):
        """URLs with 'downloaded' status ARE skipped."""
        from utils.state import CrawlState

        state_file = tmp_path / "crawl-state.json"
        state_file.write_text('{"https://example.com/done.html": "downloaded"}')
        state = CrawlState(str(state_file))

        assert state.is_downloaded("https://example.com/done.html") is True
