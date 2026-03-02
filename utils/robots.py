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
            parser.set_url(robots_url)
            try:
                import urllib.request
                req = urllib.request.Request(robots_url, headers={'User-Agent': USER_AGENT})
                with urllib.request.urlopen(req, timeout=10) as response:
                    raw = response.read()
                    lines = raw.decode("utf-8", errors="ignore").splitlines()
                parser.parse(lines)
            except urllib.error.HTTPError as err:
                # RobotFileParser.read() considers 401/403 as disallow_all=True.
                # We fail-open because WAFs often block bots from /robots.txt
                parser.allow_all = True
            except (OSError, urllib.error.URLError):
                # If robots.txt can't be fetched (timeout/dns), treat as allow-all
                parser.allow_all = True


            self._cache[domain] = parser

        return self._cache[domain]


def robots_allowed(cache: RobotsCache, url: str) -> bool:
    """Check if USER_AGENT is allowed to fetch the given URL per robots.txt.

    Returns True if allowed or if robots.txt is unavailable (fail-open).
    Returns False if explicitly disallowed.
    """
    parser = cache.get_parser(url)
    return parser.can_fetch(USER_AGENT, url)
