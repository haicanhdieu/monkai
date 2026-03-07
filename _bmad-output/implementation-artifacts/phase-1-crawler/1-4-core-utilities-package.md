# Story 1.4: Core Utilities Package

Status: done

## Story

As a developer,
I want the `utils/` package with all 6 shared utility modules implemented,
so that all pipeline modules can import deterministic ID generation, config loading, logging, crawl state, robots.txt handling, and deduplication from a single trusted location.

## Acceptance Criteria

1. **Given** `utils/slugify.py` is implemented
   **When** I call `make_id("thuvienhoasen", "Tâm Kinh")`
   **Then** the result is `"thuvienhoasen__tam-kinh"` (Vietnamese diacritics stripped via unicodedata NFKD, double-underscore separator, lowercase, hyphens)
   **And** calling `make_id` twice with identical inputs always returns the same string (deterministic)
   **And** `make_id("THUVIENHOASEN", "TÂM KINH")` returns the same result as the lowercase form

2. **Given** `utils/logging.py::setup_logger("crawler")` is called
   **When** the logger emits INFO and WARNING messages
   **Then** messages appear on stdout AND are appended to `logs/crawl.log`
   **And** the format matches: `{ISO-timestamp} [INFO] [crawler] {message}`

3. **Given** `utils/state.py::CrawlState` loaded on a fresh `data/crawl-state.json`
   **When** I call `state.mark_downloaded("https://example.com/file")` then `state.save()`
   **Then** `state.is_downloaded("https://example.com/file")` returns `True`
   **And** `data/crawl-state.json` on disk reflects the persisted update

4. **Given** `utils/robots.py::RobotsCache` for a domain
   **When** I call `robots_allowed(cache, url)` for a disallowed path
   **Then** it returns `False` and the USER_AGENT used is `"MonkaiCrawler/1.0"`
   **And** robots.txt is fetched only once per domain per session (cached — no redundant fetches)

5. **Given** `utils/dedup.py::sha256_hash(file_bytes)` called twice with identical bytes
   **When** both results are compared
   **Then** both return the same lowercase hex digest
   **And** `is_duplicate(hash, seen_set)` returns `True` if hash is in the set, `False` otherwise

## Tasks / Subtasks

- [x] Implement `utils/slugify.py` (AC: 1)
  - [x] `make_id(source: str, title: str) -> str` — double-underscore separator format
  - [x] `slugify_title(title: str) -> str` — strips Vietnamese diacritics via NFKD normalization
  - [x] Ensure case-insensitive: lowercase source and title before slugifying
- [x] Implement `utils/logging.py` (AC: 2)
  - [x] `setup_logger(module_name: str) -> logging.Logger`
  - [x] `RotatingFileHandler("logs/crawl.log", maxBytes=10_000_000, backupCount=3)`
  - [x] `StreamHandler` for console output
  - [x] Format: `%(asctime)s [%(levelname)s] [%(name)s] %(message)s`
- [x] Implement `utils/state.py` (AC: 3)
  - [x] `CrawlState` class with `load()`, `save()`, `is_downloaded()`, `mark_downloaded()`, `mark_error()`, `mark_skipped()`
  - [x] Persists to `data/crawl-state.json`
  - [x] Creates `data/` directory if not exists on save
- [x] Implement `utils/robots.py` (AC: 4)
  - [x] `USER_AGENT = "MonkaiCrawler/1.0"` module-level constant
  - [x] `RobotsCache` class: fetches and caches `RobotFileParser` per domain
  - [x] `robots_allowed(cache: RobotsCache, url: str) -> bool`
- [x] Implement `utils/dedup.py` (AC: 5)
  - [x] `sha256_hash(file_bytes: bytes) -> str` — lowercase hex digest
  - [x] `is_duplicate(hash: str, seen_hashes: set[str]) -> bool`
- [x] Verify `utils/__init__.py` exists (from Story 1.1, should already be there)
- [x] Manual smoke tests (AC: 1–5)
  - [x] `make_id("thuvienhoasen", "Tâm Kinh")` → `thuvienhoasen__tam-kinh` ✅
  - [x] `sha256_hash(b"hello")` → `2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824` ✅

## Dev Notes

### Dependency on Stories 1.1–1.3

- `utils/__init__.py` must exist (Story 1.1)
- `models.py` with `CrawlerConfig` must exist (Story 1.2) — `utils/config.py` already done
- `logs/` directory must exist (Story 1.1)

### utils/slugify.py: Complete Implementation

```python
# utils/slugify.py
import re
import unicodedata


def slugify_title(title: str) -> str:
    """Convert title to ASCII slug: strip Vietnamese diacritics, lowercase, hyphens.

    Example: "Tâm Kinh" → "tam-kinh"
    Example: "Kinh Đại Bát Niết Bàn" → "kinh-dai-bat-niet-ban"
    """
    # Normalize to NFKD form — decomposes combined characters into base + combining marks
    normalized = unicodedata.normalize("NFKD", title.lower())
    # Encode to ASCII, ignoring combining marks (diacritics)
    ascii_bytes = normalized.encode("ascii", errors="ignore")
    ascii_str = ascii_bytes.decode("ascii")
    # Replace non-alphanumeric characters with hyphens
    slug = re.sub(r"[^a-z0-9]+", "-", ascii_str)
    # Strip leading/trailing hyphens
    return slug.strip("-")


def make_id(source: str, title: str) -> str:
    """Generate deterministic scripture ID: {source_slug}__{title_slug}.

    Always lowercase. Double underscore separates source from title.
    Example: make_id("thuvienhoasen", "Tâm Kinh") → "thuvienhoasen__tam-kinh"
    Example: make_id("THUVIENHOASEN", "TÂM KINH") → "thuvienhoasen__tam-kinh"
    """
    source_slug = slugify_title(source)
    title_slug = slugify_title(title)
    return f"{source_slug}__{title_slug}"
```

**Critical:** Double underscore `__` is the separator — not single `-` or `_`. This makes it possible to reliably split an ID back into source and title parts.

**Vietnamese diacritic examples to verify:**
- `Tâm` → `tam` (â → a)
- `Đại` → `dai` (Đ → D → d)
- `Ưu` → `uu` (Ư → U → u, but ư decomposes to u + combining hook)
- `Thiền` → `thien`
- `Mật` → `mat`
- `Niết Bàn` → `niet-ban`

### utils/logging.py: Complete Implementation

```python
# utils/logging.py
import logging
import os
from logging.handlers import RotatingFileHandler


def setup_logger(module_name: str, log_file: str = "logs/crawl.log") -> logging.Logger:
    """Create and configure a logger for a pipeline module.

    Outputs to both console (StreamHandler) and rotating log file.
    Format: "2026-02-27T10:30:00 [INFO] [crawler] message"

    Args:
        module_name: Name tag in log output, e.g. "crawler", "parser"
        log_file: Path to rotating log file (default: logs/crawl.log)
    """
    logger = logging.getLogger(module_name)

    # Avoid adding duplicate handlers if called multiple times
    if logger.handlers:
        return logger

    logger.setLevel(logging.DEBUG)

    # Ensure log directory exists
    os.makedirs(os.path.dirname(log_file), exist_ok=True)

    formatter = logging.Formatter(
        fmt="%(asctime)s [%(levelname)s] [%(name)s] %(message)s",
        datefmt="%Y-%m-%dT%H:%M:%S",
    )

    # Console handler
    console_handler = logging.StreamHandler()
    console_handler.setLevel(logging.INFO)
    console_handler.setFormatter(formatter)

    # Rotating file handler: 10MB max, keep 3 backups
    file_handler = RotatingFileHandler(
        log_file, maxBytes=10_000_000, backupCount=3, encoding="utf-8"
    )
    file_handler.setLevel(logging.DEBUG)
    file_handler.setFormatter(formatter)

    logger.addHandler(console_handler)
    logger.addHandler(file_handler)

    return logger
```

**Usage pattern in all CLI modules:**
```python
logger = setup_logger("crawler")
logger.info("[crawler] Downloaded: https://...")
logger.warning("[crawler] robots.txt blocked: https://...")
logger.error("[crawler] HTTP 503: https://... — skipping")
```

**Critical:** Call `setup_logger()` ONCE per module at module load time. Never call `logging.basicConfig()` directly in any module — that's only for one-off scripts.

### utils/state.py: Complete Implementation

```python
# utils/state.py
import json
import os
from typing import Literal

StatusValue = Literal["downloaded", "error", "skipped"]
STATE_FILE = "data/crawl-state.json"


class CrawlState:
    """Persistent URL status tracker backed by data/crawl-state.json.

    Tracks per-URL crawl outcomes: downloaded, error, or skipped.
    Supports incremental/resumable crawls (FR7, FR8, NFR5).
    """

    def __init__(self, state_file: str = STATE_FILE) -> None:
        self._state_file = state_file
        self._state: dict[str, StatusValue] = {}
        self._load()

    def _load(self) -> None:
        """Load state from disk. Silent no-op if file doesn't exist."""
        if os.path.exists(self._state_file):
            with open(self._state_file, encoding="utf-8") as f:
                self._state = json.load(f)

    def save(self) -> None:
        """Persist current state to disk atomically."""
        os.makedirs(os.path.dirname(self._state_file), exist_ok=True)
        with open(self._state_file, "w", encoding="utf-8") as f:
            json.dump(self._state, f, indent=2, ensure_ascii=False)

    def is_downloaded(self, url: str) -> bool:
        """Return True if URL is recorded as successfully downloaded."""
        return self._state.get(url) == "downloaded"

    def get_status(self, url: str) -> StatusValue | None:
        """Return current status for URL, or None if not tracked."""
        return self._state.get(url)

    def mark_downloaded(self, url: str) -> None:
        self._state[url] = "downloaded"

    def mark_error(self, url: str) -> None:
        self._state[url] = "error"

    def mark_skipped(self, url: str) -> None:
        self._state[url] = "skipped"
```

**Usage pattern in crawler.py:**
```python
state = CrawlState()
# ...
if state.is_downloaded(url):
    logger.info(f"[crawler] Skip (state): {url}")
    continue
if file_exists_and_nonempty(expected_path):
    state.mark_downloaded(url)   # repair state
    continue
# ... download ...
state.mark_downloaded(url)
state.save()  # persist after each URL or batch
```

### utils/robots.py: Complete Implementation

```python
# utils/robots.py
from urllib.robotparser import RobotFileParser
from urllib.parse import urlparse
import urllib.request

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
            except Exception:
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
```

**Usage pattern in crawler.py:**
```python
robots_cache = RobotsCache()
# For each URL:
if not robots_allowed(robots_cache, url):
    logger.warning(f"[crawler] robots.txt blocked: {url}")
    state.mark_skipped(url)
    continue
```

### utils/dedup.py: Complete Implementation

```python
# utils/dedup.py
import hashlib


def sha256_hash(file_bytes: bytes) -> str:
    """Compute SHA-256 hex digest of file bytes.

    Returns lowercase hex string. Consistent across calls with same input.
    Example: sha256_hash(b"hello") → "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"
    """
    return hashlib.sha256(file_bytes).hexdigest()


def is_duplicate(file_hash: str, seen_hashes: set[str]) -> bool:
    """Return True if file_hash is already in seen_hashes (duplicate detected).

    Does NOT mutate seen_hashes — caller is responsible for adding new hashes.
    """
    return file_hash in seen_hashes
```

**Usage pattern in crawler.py download loop:**
```python
seen_hashes: set[str] = set()
# ...
file_hash = sha256_hash(content)
if is_duplicate(file_hash, seen_hashes):
    logger.info(f"[crawler] Duplicate detected (hash match): {url} — skipping")
    state.mark_skipped(url)
    continue
seen_hashes.add(file_hash)
# ... write file to disk ...
```

### Architecture Compliance

- **One import location:** All modules import utilities from `utils.*` — never copy-paste utility logic
- **USER_AGENT constant:** `"MonkaiCrawler/1.0"` defined ONCE in `utils/robots.py` — import it in any other module that needs it: `from utils.robots import USER_AGENT`
- **No circular imports:** `utils/` modules do NOT import from each other, and do NOT import from root-level `models.py` (except `utils/config.py` which imports `CrawlerConfig`)
- **State file path:** `data/crawl-state.json` is the canonical path — hardcoded as default in `CrawlState.__init__` but overridable for testing

### Anti-Patterns

- ❌ Implementing `make_id()` logic inline in `parser.py` or `indexer.py` — always import from `utils.slugify`
- ❌ `logging.basicConfig()` in any module — always `from utils.logging import setup_logger`
- ❌ Writing directly to `data/crawl-state.json` without `CrawlState` — always use the class
- ❌ `hashlib.md5()` for dedup — must be SHA-256
- ❌ Re-fetching robots.txt per URL — cache once per domain per session
- ❌ `USER_AGENT = "bot"` or any other value — must be exactly `"MonkaiCrawler/1.0"`

### Project Structure Notes

- All 5 utility modules live in `utils/` — never at project root
- `utils/__init__.py` may remain empty or can re-export commonly used functions for convenience
- Test files in `tests/` that test these utilities are created in Story 1.5

### References

- [Source: _bmad-output/planning-artifacts/phase-1-crawler/architecture-phase1-crawler.md#Shared Utilities Location]
- [Source: _bmad-output/planning-artifacts/phase-1-crawler/architecture-phase1-crawler.md#Naming Patterns — Deterministic ID Format]
- [Source: _bmad-output/planning-artifacts/phase-1-crawler/architecture-phase1-crawler.md#Logging — stdlib + RotatingFileHandler]
- [Source: _bmad-output/planning-artifacts/phase-1-crawler/architecture-phase1-crawler.md#Process Patterns]
- [Source: _bmad-output/planning-artifacts/phase-1-crawler/architecture-phase1-crawler.md#Enforcement Guidelines]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.4: Core Utilities Package]
- [Source: _bmad-output/planning-artifacts/epics.md#Additional Requirements — Shared Utilities Package]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- Implemented all 5 utility modules: slugify, logging, state, robots, dedup
- Bug found and fixed in `slugify_title`: `Đ` (U+0110, D-with-stroke) doesn't decompose via NFKD — added `_SPECIAL_CHARS` translation table for `Đ/đ` before NFKD normalization
- `CrawlState._load()` updated to check file size > 0 before JSON parsing (handles empty files gracefully)
- All 5 ACs verified: slugify determinism + Vietnamese diacritics, logging dual-output, CrawlState persistence, USER_AGENT constant, sha256 dedup
- Lint passes cleanly (`devbox run lint` → exit 0)

### File List

- utils/slugify.py
- utils/logging.py (code review: added logger.propagate=False; fixed makedirs on bare filename)
- utils/state.py (code review: save() now truly atomic via tempfile+os.replace; fixed makedirs on bare filename)
- utils/robots.py (code review: narrowed broad except Exception to OSError/URLError)
- utils/dedup.py
