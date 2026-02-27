# utils/robots.py
import urllib.error
from urllib.robotparser import RobotFileParser
from urllib.parse import urlparse

USER_AGENT = "MonkaiCrawler/1.0"  # Consistent across ALL sessions — never change


class RobotsCache:
    """Cache of RobotFileParser instances, one per domain.

    Fetches robots.txt once per domain per session. All subsequent
    calls use the cached parser — no redundant network requests (NFR13).
    """

    def __init__(self) -> None:
        self._cache: dict[str, RobotFileParser] = {}

    def get_parser(self, url: str) -> RobotFileParser:
        """Get or fetch RobotFileParser for the domain of the given URL."""
        parsed = urlparse(url)
        domain = f"{parsed.scheme}://{parsed.netloc}"

        if domain not in self._cache:
            parser = RobotFileParser()
            robots_url = f"{domain}/robots.txt"
            try:
                parser.set_url(robots_url)
                parser.read()
            except (OSError, urllib.error.URLError):
                # If robots.txt can't be fetched, treat as allow-all
                pass
            self._cache[domain] = parser

        return self._cache[domain]


def robots_allowed(cache: RobotsCache, url: str) -> bool:
    """Check if USER_AGENT is allowed to fetch the given URL per robots.txt.

    Returns True if allowed or if robots.txt is unavailable (fail-open).
    Returns False if explicitly disallowed.
    """
    parser = cache.get_parser(url)
    return parser.can_fetch(USER_AGENT, url)
