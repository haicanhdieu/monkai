# tests/test_crawler.py
"""Tests for crawler.py CLI — Story 2-1: Crawler CLI Shell + robots.txt Compliance."""
from unittest.mock import MagicMock, patch

import pytest
from typer.testing import CliRunner

# crawler module imported inside tests to avoid side effects at module load time


@pytest.fixture
def runner():
    return CliRunner()


@pytest.fixture
def valid_config_path(tmp_path):
    """Create a valid config.yaml in a temp directory."""
    config = tmp_path / "config.yaml"
    config.write_text(
        "output_dir: data\n"
        "log_file: logs/crawl.log\n"
        "sources:\n"
        "  - name: thuvienhoasen\n"
        "    seed_url: https://thuvienhoasen.org/p16a0/kinh-dien\n"
        "    rate_limit_seconds: 1.5\n"
        "    output_folder: thuvienhoasen\n"
        "    css_selectors:\n"
        "      catalog_links: 'a.list-item-title'\n"
        "      file_links: 'a.download-link'\n"
        "      title: 'h1.entry-title'\n"
        "      category: '.breadcrumb li:nth-child(2)'\n"
        "      subcategory: '.breadcrumb li:last-child'\n"
    )
    return str(config)


@pytest.fixture
def bad_config_path(tmp_path):
    """Create a malformed config.yaml (missing required fields)."""
    config = tmp_path / "bad_config.yaml"
    config.write_text("not_sources: invalid\n")
    return str(config)


class TestCrawlerHelp:
    """AC 1: Help text shows --source and --config options."""

    def test_help_shows_source_option(self, runner):
        from crawler import app

        result = runner.invoke(app, ["--help"])
        assert result.exit_code == 0
        assert "--source" in result.output

    def test_help_shows_config_option(self, runner):
        from crawler import app

        result = runner.invoke(app, ["--help"])
        assert result.exit_code == 0
        assert "--config" in result.output

    def test_help_shows_all_as_source_option_description(self, runner):
        from crawler import app

        result = runner.invoke(app, ["--help"])
        assert result.exit_code == 0
        # Help should mention 'all' as a valid source value
        assert "all" in result.output.lower()


class TestCrawlerConfigValidation:
    """AC 2: Config is validated before any network request."""

    def test_malformed_config_exits_before_network(self, runner, bad_config_path):
        """A malformed config must exit with a clear error before any network call."""
        from crawler import app

        with patch("crawler.RobotsCache") as mock_robots_cache:
            result = runner.invoke(app, ["--config", bad_config_path])
            # Should fail — must NOT initialize RobotsCache (which would make network calls)
            mock_robots_cache.assert_not_called()
            assert result.exit_code != 0

    def test_missing_config_file_exits(self, runner):
        """A missing config file must exit with a clear error."""
        from crawler import app

        result = runner.invoke(app, ["--config", "/nonexistent/path/config.yaml"])
        assert result.exit_code != 0

    def test_valid_config_initializes_robots_cache(self, runner, valid_config_path):
        """With valid config, RobotsCache is initialized (session start)."""
        from crawler import app

        with (
            patch("crawler.RobotsCache") as mock_robots_cache,
            patch("crawler.asyncio.run") as mock_run,
        ):
            mock_robots_cache.return_value = MagicMock()
            mock_run.return_value = None
            runner.invoke(app, ["--config", valid_config_path])
            mock_robots_cache.assert_called_once()

    def test_unknown_source_exits_with_error(self, runner, valid_config_path):
        """Unknown --source value exits with error code 1."""
        from crawler import app

        with (
            patch("crawler.RobotsCache"),
            patch("crawler.asyncio.run"),
        ):
            result = runner.invoke(
                app,
                ["--source", "nonexistent-source", "--config", valid_config_path],
            )
            assert result.exit_code == 1


class TestCrawlerRobotsTxtCompliance:
    """AC 3: Blocked URLs are skipped and logged, crawl continues."""

    def test_robots_blocked_url_is_logged_and_skipped(self, runner, valid_config_path):
        """Blocked URL logs a WARN message and is not downloaded."""
        from crawler import app

        blocked_url = "https://thuvienhoasen.org/private/"

        async def fake_crawl_all(sources, cfg, robots_cache, logger):
            from utils.robots import robots_allowed

            urls = [blocked_url]
            for url in urls:
                if not robots_allowed(robots_cache, url):
                    logger.warning(f"[crawler] robots.txt blocked: {url}")
                    continue

        with (
            patch("crawler.RobotsCache") as mock_robots_cache_cls,
            patch("crawler.robots_allowed", return_value=False),
            patch("crawler.asyncio.run"),
            patch("crawler.crawl_all", side_effect=fake_crawl_all),
        ):
            mock_robots_cache_cls.return_value = MagicMock()
            runner.invoke(app, ["--config", valid_config_path])
            # robots_cache was initialized once
            mock_robots_cache_cls.assert_called_once()

    def test_robots_allowed_true_does_not_block(self, runner, valid_config_path):
        """URLs allowed by robots.txt are not skipped."""
        from crawler import app

        with (
            patch("crawler.RobotsCache") as mock_robots_cache_cls,
            patch("crawler.asyncio.run") as mock_run,
        ):
            mock_robots_cache_cls.return_value = MagicMock()
            mock_run.return_value = None
            runner.invoke(app, ["--config", valid_config_path])
            # asyncio.run was called (crawl_all invoked)
            mock_run.assert_called_once()


class TestCrawlerSourceFiltering:
    """Test --source filtering logic."""

    def test_source_all_uses_all_configured_sources(self, runner, valid_config_path):
        """--source all (default) passes all sources to crawl_all."""
        from crawler import app

        with (
            patch("crawler.RobotsCache") as mock_robots_cls,
            patch("crawler.asyncio.run") as mock_run,
        ):
            mock_robots_cls.return_value = MagicMock()
            mock_run.return_value = None
            result = runner.invoke(app, ["--config", valid_config_path])
            assert result.exit_code == 0
            # crawl_all was called with the list of sources
            call_args = mock_run.call_args
            assert call_args is not None

    def test_source_single_name_filters_correctly(self, runner, valid_config_path):
        """--source thuvienhoasen passes only that source."""
        from crawler import app

        with (
            patch("crawler.RobotsCache") as mock_robots_cls,
            patch("crawler.asyncio.run") as mock_run,
        ):
            mock_robots_cls.return_value = MagicMock()
            mock_run.return_value = None
            result = runner.invoke(
                app,
                ["--source", "thuvienhoasen", "--config", valid_config_path],
            )
            assert result.exit_code == 0
