# Story 2.1: Crawler CLI Shell + robots.txt Compliance

Status: done

## Story

As a developer,
I want a `crawler.py` CLI entry point that loads config and enforces robots.txt compliance before touching any source,
so that every crawl session is ethically compliant from the first request.

## Acceptance Criteria

1. **Given** `crawler.py` exists as a Typer CLI
   **When** I run `uv run python crawler.py --help`
   **Then** help text is displayed showing `--source` option with values `all` or `<source-name>` and `--config` option defaulting to `config.yaml`

2. **Given** I run `crawler.py --source thuvienhoasen`
   **When** the crawler initializes
   **Then** `load_config()` is called and the config is validated — a malformed config exits with a clear error before any network request
   **And** `RobotsCache` is initialized and thuvienhoasen.org's robots.txt is fetched and cached once at session start using USER_AGENT `"MonkaiCrawler/1.0"`
   **And** `setup_logger("crawler")` is called and all subsequent log output follows the format `{timestamp} [LEVEL] [crawler] {message}`

3. **Given** a source URL is disallowed by robots.txt
   **When** the crawler evaluates that URL
   **Then** it logs `[WARN] [crawler] robots.txt blocked: {url}` and skips it — no download attempted
   **And** the crawl continues to the next URL without crashing

## Tasks / Subtasks

- [x] Create `crawler.py` with Typer CLI skeleton (AC: 1, 2)
  - [x] Define `crawl` command with `--source` (default `all`) and `--config` (default `config.yaml`) options
  - [x] Import and call `load_config()` from `utils/config.py` — exit loudly on ValidationError before any network call
  - [x] Import and call `setup_logger("crawler")` from `utils/logging.py` at startup
  - [x] Initialize `RobotsCache` from `utils/robots.py` once per session (not per URL)
  - [x] Wire `--help` auto-generation via Typer (no manual help text needed)
- [x] Implement robots.txt check + skip logic (AC: 3)
  - [x] Before any URL fetch, call `robots_allowed(cache, url)` from `utils/robots.py`
  - [x] If blocked: `logger.warning(f"[crawler] robots.txt blocked: {url}")` and `continue`
  - [x] Never attempt download on blocked URL; log and move on
- [x] Stub out async crawl loop placeholder (for Story 2.2 to fill in)
  - [x] Accept resolved source list (all or single) and iterate
  - [x] `pass` or `logger.info(f"[crawler] Starting crawl for {source.name}")` as body
- [x] Verify `uv run python crawler.py --help` shows expected output (AC: 1)
- [x] Verify config validation fails loudly before any network call when config is malformed (AC: 2)

## Dev Notes

### What Exists (Epic 1 Complete)

All shared utilities are fully implemented and tested. Import from these — never reimplement:

| Module | Import | Purpose |
|---|---|---|
| `utils/config.py` | `from utils.config import load_config` | `load_config(path) -> CrawlerConfig` |
| `utils/logging.py` | `from utils.logging import setup_logger` | `setup_logger(name) -> Logger` |
| `utils/robots.py` | `from utils.robots import RobotsCache, robots_allowed, USER_AGENT` | robots.txt check |
| `utils/state.py` | `from utils.state import CrawlState` | crawl-state.json r/w |
| `utils/dedup.py` | `from utils.dedup import sha256_hash, is_duplicate` | SHA-256 dedup |
| `utils/slugify.py` | `from utils.slugify import make_id` | deterministic ID |
| `models.py` | `from models import CrawlerConfig, SourceConfig, ScriptureMetadata, IndexRecord` | Pydantic models |

**Do NOT redefine any of these. Do NOT call `logging.basicConfig()` in `crawler.py`.**

### crawler.py Architecture

```python
# crawler.py — Typer CLI entry point for FR1–FR8
import asyncio
import typer
from pathlib import Path
from models import CrawlerConfig
from utils.config import load_config
from utils.logging import setup_logger
from utils.robots import RobotsCache, robots_allowed

app = typer.Typer()

@app.command()
def crawl(
    source: str = typer.Option("all", help="Source name or 'all'"),
    config: str = typer.Option("config.yaml", help="Path to config file"),
):
    """Crawl Buddhist scripture sources and download files to data/raw/."""
    logger = setup_logger("crawler")
    cfg: CrawlerConfig = load_config(config)  # Fails loudly on invalid config

    sources = cfg.sources if source == "all" else [
        s for s in cfg.sources if s.name == source
    ]
    if not sources:
        logger.error(f"[crawler] No source found: {source}")
        raise typer.Exit(code=1)

    robots_cache = RobotsCache()  # Initialized once per session
    asyncio.run(crawl_all(sources, cfg, robots_cache, logger))

if __name__ == "__main__":
    app()
```

### Robots.txt Enforcement Pattern

```python
# Check before every URL — robots_allowed returns True if allowed, False if blocked
for url in urls_to_process:
    if not robots_allowed(robots_cache, url):
        logger.warning(f"[crawler] robots.txt blocked: {url}")
        continue  # Skip — never download
    # proceed with download
```

**KEY**: `RobotsCache` is initialized ONCE at session start, NOT per URL. This satisfies caching requirement (NFR13).

### config.yaml Current State

Only `thuvienhoasen` is configured. This story focuses on CLI + robots.txt — no actual downloads yet. The crawler should cleanly initialize, validate config, check robots.txt, and log ready state.

```yaml
sources:
  - name: thuvienhoasen
    seed_url: https://thuvienhoasen.org/p16a0/kinh-dien
    rate_limit_seconds: 1.5
    output_folder: thuvienhoasen
    css_selectors:
      catalog_links: "a.list-item-title"
      file_links: "a.download-link"
      title: "h1.entry-title"
      category: ".breadcrumb li:nth-child(2)"
      subcategory: ".breadcrumb li:last-child"
```

### Log Format Reference

```
2026-02-27T10:30:00Z [INFO]  [crawler] Starting crawl for thuvienhoasen
2026-02-27T10:30:01Z [WARN]  [crawler] robots.txt blocked: https://thuvienhoasen.org/private/
2026-02-27T10:30:02Z [ERROR] [crawler] No source found: unknown-source
```

Format: `{timestamp} [{LEVEL}] [{module}] {message}` — enforced by `setup_logger("crawler")`.

### Project Structure Notes

- `crawler.py` lives at project root — same level as `parser.py`, `indexer.py`, `validate.py`
- Story 2.1 creates the CLI scaffold; Stories 2.2–2.5 fill in the async crawl logic
- `devbox run crawl` maps to `uv run python crawler.py` (already in devbox.json)
- Do NOT import `requests` in this story — async fetching comes in Story 2.3

### USER_AGENT Constant

```python
from utils.robots import USER_AGENT  # = "MonkaiCrawler/1.0"
```

Never hardcode this string in `crawler.py` — always import from `utils/robots.py`.

### References

- [Source: _bmad-output/planning-artifacts/phase-1-crawler/architecture-phase1-crawler.md#Core Architectural Decisions]
- [Source: _bmad-output/planning-artifacts/phase-1-crawler/architecture-phase1-crawler.md#Process Patterns — Robots.txt Check]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.1: Crawler CLI Shell + robots.txt Compliance]
- [Source: _bmad-output/planning-artifacts/phase-1-crawler/architecture-phase1-crawler.md#Project Structure & Boundaries]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- Implemented `crawler.py` at project root with Typer CLI: `--source` (default `all`) and `--config` (default `config.yaml`) options
- `load_config()` called before `RobotsCache` init — malformed configs exit before any network call (AC: 2 satisfied)
- `RobotsCache` initialized once per session, passed to `crawl_all` async function (NFR13 satisfied)
- `crawl_all` is a stub async loop logging "Starting crawl for {source.name}" — ready for Story 2.2 to expand
- robots.txt enforcement pattern implemented: `robots_allowed()` checked before any URL fetch, warning logged and URL skipped if blocked (AC: 3 satisfied)
- 11 new tests in `tests/test_crawler.py`; all 46 tests pass with no regressions
- `uv run python crawler.py --help` shows `--source` (values: any or 'all') and `--config` options ✓

### File List

- crawler.py (created)
- tests/test_crawler.py (created)

### Change Log

- 2026-02-27: Story 2.1 implemented — crawler.py CLI shell with robots.txt compliance, 11 tests added
