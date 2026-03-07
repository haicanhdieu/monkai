# tests/test_robots.py
from unittest.mock import patch, MagicMock
from utils.robots import RobotsCache, robots_allowed, USER_AGENT


def test_user_agent_constant():
    assert USER_AGENT == "MonkaiCrawler/1.0"


def test_allowed_url_returns_true():
    with patch.object(RobotsCache, "get_parser") as mock_parser:
        parser = MagicMock()
        parser.can_fetch.return_value = True
        mock_parser.return_value = parser
        cache = RobotsCache()
        assert robots_allowed(cache, "https://example.com/allowed") is True
        parser.can_fetch.assert_called_with(USER_AGENT, "https://example.com/allowed")


def test_disallowed_url_returns_false():
    with patch.object(RobotsCache, "get_parser") as mock_parser:
        parser = MagicMock()
        parser.can_fetch.return_value = False
        mock_parser.return_value = parser
        cache = RobotsCache()
        assert robots_allowed(cache, "https://example.com/private/doc") is False


def test_missing_robots_txt_returns_true():
    """If robots.txt can't be fetched, fail-open (allow all)."""
    cache = RobotsCache()
    with patch.object(cache, "get_parser") as mock_get:
        parser = MagicMock()
        parser.can_fetch.return_value = True  # fail-open default
        mock_get.return_value = parser
        assert robots_allowed(cache, "https://example.com/page") is True


def test_wildcard_disallow_all():
    with patch.object(RobotsCache, "get_parser") as mock_parser:
        parser = MagicMock()
        parser.can_fetch.return_value = False
        mock_parser.return_value = parser
        cache = RobotsCache()
        assert robots_allowed(cache, "https://example.com/anything") is False


def test_robots_cached_per_domain():
    """Verify robots.txt HTTP fetch happens only once per domain, not once per URL."""
    cache = RobotsCache()

    mock_response = MagicMock()
    mock_response.read.return_value = b"User-agent: *\nAllow: /"
    mock_response.__enter__ = lambda s: s
    mock_response.__exit__ = MagicMock(return_value=False)

    with patch("urllib.request.urlopen", return_value=mock_response) as mock_urlopen:
        robots_allowed(cache, "https://example.com/page1")
        robots_allowed(cache, "https://example.com/page2")

    # robots.txt must be fetched exactly once for the domain, not once per URL
    assert mock_urlopen.call_count == 1
