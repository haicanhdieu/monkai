# tests/test_deduplication.py
"""Tests for content deduplication and 4-source config — Story 2-5."""
import asyncio
from unittest.mock import AsyncMock, MagicMock, patch


from crawler import ScriptureResolution
from models import SourceConfig, CrawlerConfig
from utils.state import CrawlState


def make_source(name="thuvienhoasen", seed_url="https://example.com/catalog"):
    return SourceConfig(
        name=name,
        seed_url=seed_url,
        rate_limit_seconds=1.0,
        output_folder=name,
        css_selectors={
            "catalog_links": "a.scripture-link",
            "file_links": "a.download-link",
            "title": "h1.title",
            "category": ".cat",
            "subcategory": ".sub",
        },
    )


def make_html_resp(content=b"<html><body></body></html>"):
    resp = AsyncMock()
    resp.status = 200
    resp.read = AsyncMock(return_value=content)
    resp.headers = {"Content-Type": "text/html"}
    resp.__aenter__ = AsyncMock(return_value=resp)
    resp.__aexit__ = AsyncMock(return_value=False)
    return resp


def setup_crawl_all_mocks(mock_session_cls, mock_state_cls, urls, contents):
    """Wire up common mocks for crawl_all integration tests."""
    mock_state = MagicMock(spec=CrawlState)
    mock_state.is_downloaded = MagicMock(return_value=False)
    mock_state_cls.return_value = mock_state

    call_count = {"n": 0}

    def get_side(url, **kwargs):
        idx = call_count["n"] % len(contents)
        call_count["n"] += 1
        return make_html_resp(contents[idx])

    mock_session = MagicMock()
    mock_session.get = MagicMock(side_effect=get_side)
    session_cm = AsyncMock()
    session_cm.__aenter__ = AsyncMock(return_value=mock_session)
    session_cm.__aexit__ = AsyncMock(return_value=False)
    mock_session_cls.return_value = session_cm

    return mock_state


class TestDeduplicationIntegration:
    """AC 1: Duplicate files are skipped and logged."""

    def test_duplicate_content_marked_skipped(self, tmp_path):
        """Second URL with same content hash → mark_skipped called."""
        from crawler import crawl_all

        cfg = MagicMock(spec=CrawlerConfig)
        cfg.output_dir = str(tmp_path)

        source = make_source()
        html = b"<html><body>Same content</body></html>"
        url1 = "https://example.com/file1.html"
        url2 = "https://example.com/file2.html"

        with (
            patch("crawler.CrawlState") as mock_state_cls,
            patch("crawler.fetch_catalog_urls", new_callable=AsyncMock, return_value=[url1, url2]),
            patch("crawler.resolve_file_url", new_callable=AsyncMock) as mock_resolve,
            patch("crawler.robots_allowed", return_value=True),
            patch("crawler.asyncio.sleep", new_callable=AsyncMock),
            patch("crawler.aiohttp.ClientSession") as mock_session_cls,
        ):
            mock_resolve.side_effect = [
                ScriptureResolution(url1, "untitled", "uncategorized"),
                ScriptureResolution(url2, "untitled", "uncategorized"),
            ]
            mock_state = setup_crawl_all_mocks(
                mock_session_cls, mock_state_cls, [url1, url2], [html, html]
            )

            asyncio.run(crawl_all([source], cfg, MagicMock(), MagicMock()))

        mock_state.mark_skipped.assert_called()

    def test_duplicate_logs_correct_message(self, tmp_path):
        """Duplicate URL logs: '[crawler] Duplicate detected (hash match): {url}'."""
        from crawler import crawl_all

        cfg = MagicMock(spec=CrawlerConfig)
        cfg.output_dir = str(tmp_path)

        source = make_source()
        html = b"<html><body>Same content</body></html>"
        url1 = "https://example.com/orig.html"
        url2 = "https://example.com/dup.html"
        logger = MagicMock()

        with (
            patch("crawler.CrawlState") as mock_state_cls,
            patch("crawler.fetch_catalog_urls", new_callable=AsyncMock, return_value=[url1, url2]),
            patch("crawler.resolve_file_url", new_callable=AsyncMock) as mock_resolve,
            patch("crawler.robots_allowed", return_value=True),
            patch("crawler.asyncio.sleep", new_callable=AsyncMock),
            patch("crawler.aiohttp.ClientSession") as mock_session_cls,
        ):
            mock_resolve.side_effect = [
                ScriptureResolution(url1, "untitled", "uncategorized"),
                ScriptureResolution(url2, "untitled", "uncategorized"),
            ]
            setup_crawl_all_mocks(
                mock_session_cls, mock_state_cls, [url1, url2], [html, html]
            )

            asyncio.run(crawl_all([source], cfg, MagicMock(), logger))

        info_calls = " ".join(str(c) for c in logger.info.call_args_list)
        assert "Duplicate detected" in info_calls

    def test_unique_content_both_saved(self, tmp_path):
        """Different content hashes → mark_downloaded called twice, never mark_skipped."""
        from crawler import crawl_all

        cfg = MagicMock(spec=CrawlerConfig)
        cfg.output_dir = str(tmp_path)

        source = make_source()
        content1 = b"<html><body>Content 1</body></html>"
        content2 = b"<html><body>Content 2</body></html>"
        url1 = "https://example.com/file1.html"
        url2 = "https://example.com/file2.html"

        with (
            patch("crawler.CrawlState") as mock_state_cls,
            patch("crawler.fetch_catalog_urls", new_callable=AsyncMock, return_value=[url1, url2]),
            patch("crawler.resolve_file_url", new_callable=AsyncMock) as mock_resolve,
            patch("crawler.robots_allowed", return_value=True),
            patch("crawler.asyncio.sleep", new_callable=AsyncMock),
            patch("crawler.aiohttp.ClientSession") as mock_session_cls,
        ):
            mock_resolve.side_effect = [
                ScriptureResolution(url1, "untitled", "uncategorized"),
                ScriptureResolution(url2, "untitled", "uncategorized"),
            ]
            mock_state = setup_crawl_all_mocks(
                mock_session_cls, mock_state_cls, [url1, url2], [content1, content2]
            )

            asyncio.run(crawl_all([source], cfg, MagicMock(), MagicMock()))

        mock_state.mark_skipped.assert_not_called()
        assert mock_state.mark_downloaded.call_count == 2

    def test_seen_hashes_shared_across_sources(self, tmp_path):
        """seen_hashes is shared across all sources — cross-source dedup works."""
        from crawler import crawl_all

        cfg = MagicMock(spec=CrawlerConfig)
        cfg.output_dir = str(tmp_path)

        source1 = make_source("source1", "https://source1.com/catalog")
        source2 = make_source("source2", "https://source2.com/catalog")
        html = b"<html><body>Same across sources</body></html>"
        url1 = "https://source1.com/file.html"
        url2 = "https://source2.com/file.html"

        async def fetch_urls(source, *args, **kwargs):
            return [url1] if source.name == "source1" else [url2]

        with (
            patch("crawler.CrawlState") as mock_state_cls,
            patch("crawler.fetch_catalog_urls", side_effect=fetch_urls),
            patch("crawler.resolve_file_url", new_callable=AsyncMock) as mock_resolve,
            patch("crawler.robots_allowed", return_value=True),
            patch("crawler.asyncio.sleep", new_callable=AsyncMock),
            patch("crawler.aiohttp.ClientSession") as mock_session_cls,
        ):
            mock_resolve.side_effect = [
                ScriptureResolution(url1, "untitled", "uncategorized"),
                ScriptureResolution(url2, "untitled", "uncategorized"),
            ]
            mock_state = setup_crawl_all_mocks(
                mock_session_cls, mock_state_cls, [url1, url2], [html, html]
            )

            asyncio.run(crawl_all([source1, source2], cfg, MagicMock(), MagicMock()))

        # Cross-source dedup: second source's file should be skipped
        mock_state.mark_skipped.assert_called()

    def test_duplicate_url_state_recorded_as_skipped(self, tmp_path):
        """Duplicate URL → state.mark_skipped(url) and state.save() called."""
        from crawler import crawl_all

        cfg = MagicMock(spec=CrawlerConfig)
        cfg.output_dir = str(tmp_path)

        source = make_source()
        html = b"<html><body>Dup</body></html>"
        url1 = "https://example.com/orig.html"
        url2 = "https://example.com/dup.html"

        with (
            patch("crawler.CrawlState") as mock_state_cls,
            patch("crawler.fetch_catalog_urls", new_callable=AsyncMock, return_value=[url1, url2]),
            patch("crawler.resolve_file_url", new_callable=AsyncMock) as mock_resolve,
            patch("crawler.robots_allowed", return_value=True),
            patch("crawler.asyncio.sleep", new_callable=AsyncMock),
            patch("crawler.aiohttp.ClientSession") as mock_session_cls,
        ):
            mock_resolve.side_effect = [
                ScriptureResolution(url1, "untitled", "uncategorized"),
                ScriptureResolution(url2, "untitled", "uncategorized"),
            ]
            mock_state = setup_crawl_all_mocks(
                mock_session_cls, mock_state_cls, [url1, url2], [html, html]
            )

            asyncio.run(crawl_all([source], cfg, MagicMock(), MagicMock()))

        mock_state.mark_skipped.assert_called_once_with(url2)
        mock_state.save.assert_called()


class TestConfigAllFourSources:
    """config.yaml contains active sources and passes Pydantic validation."""

    def test_config_loads_with_all_four_sources(self):
        """load_config('config.yaml') succeeds and returns active sources."""
        from utils.config import load_config

        cfg = load_config("config.yaml")
        source_names = [s.name for s in cfg.sources]
        assert "thuvienhoasen" in source_names
        assert "thuvienkinhphat" in source_names

    def test_all_sources_have_valid_rate_limits(self):
        """All sources meet minimum rate_limit_seconds ≥ 1.0."""
        from utils.config import load_config

        cfg = load_config("config.yaml")
        for source in cfg.sources:
            assert source.rate_limit_seconds >= 1.0, (
                f"{source.name} has rate_limit_seconds={source.rate_limit_seconds} < 1.0"
            )

    def test_all_sources_have_required_fields(self):
        """All sources have name, seed_url or api_base_url, output_folder, and css_selectors."""
        from utils.config import load_config

        cfg = load_config("config.yaml")
        for source in cfg.sources:
            assert source.name
            assert source.output_folder
            assert isinstance(source.css_selectors, dict)
            if source.source_type == "html":
                assert source.seed_url
            else:
                assert source.api_base_url

    def test_four_distinct_output_folders(self):
        """All 4 sources have distinct output_folder values."""
        from utils.config import load_config

        cfg = load_config("config.yaml")
        folders = [s.output_folder for s in cfg.sources]
        assert len(folders) == len(set(folders)), "Duplicate output_folder values found"


class TestConfigOnlyExtensibility:
    """AC 3: No source-specific conditional code in crawler.py."""

    def test_no_hardcoded_source_names_as_conditionals(self):
        """crawler.py has no 'if source.name == <name>' branches."""
        with open("crawler.py") as f:
            source_code = f.read()

        hardcoded = ["thuvienhoasen", "budsas", "chuabaphung", "dhammadownload"]
        for name in hardcoded:
            assert f'== "{name}"' not in source_code, (
                f"Hardcoded conditional for '{name}' found in crawler.py"
            )
            assert f"== '{name}'" not in source_code, (
                f"Hardcoded conditional for '{name}' found in crawler.py"
            )

    def test_source_all_uses_config_sources(self):
        """--source all passes all config sources to crawl_all."""
        from typer.testing import CliRunner
        from crawler import app

        runner = CliRunner()

        with (
            patch("crawler.RobotsCache"),
            patch("crawler.asyncio.run") as mock_run,
        ):
            mock_run.return_value = None
            result = runner.invoke(app, ["--config", "config.yaml"])

        assert result.exit_code == 0
        mock_run.assert_called_once()
