# Story 2.5: Content Deduplication + All 4 Sources Configured

Status: ready-for-dev

## Story

As a developer,
I want duplicate files detected and skipped at download time using SHA-256 hashing, and all 4 target sources fully configured in `config.yaml`,
so that the corpus has < 2% duplicate rate and any 5th source can be added via config alone.

## Acceptance Criteria

1. **Given** `utils/dedup.py` is integrated into the download loop
   **When** a file is downloaded
   **Then** its SHA-256 hash is computed and compared against all previously seen hashes in the current session
   **And** if a duplicate is detected, the file is not written to disk: `[INFO] [crawler] Duplicate detected (hash match): {url} — skipping`
   **And** `crawl-state.json` records `{"https://...": "skipped"}` for duplicate URLs

2. **Given** `config.yaml` is updated with all 4 sources: `thuvienhoasen`, `budsas`, `chuabaphung`, `dhammadownload`
   **When** I run `crawler.py --source all`
   **Then** all 4 sources are crawled in sequence, each respecting its own `rate_limit_seconds`
   **And** files land in `data/raw/thuvienhoasen/`, `data/raw/budsas/`, `data/raw/chuabaphung/`, `data/raw/dhammadownload/` respectively

3. **Given** a new 5th source is added to `config.yaml` with valid fields
   **When** I run `crawler.py --source new-source-name`
   **Then** it crawls the new source without any changes to `crawler.py` code (NFR9)

## Tasks / Subtasks

- [ ] Integrate `sha256_hash` deduplication into download loop (AC: 1)
  - [ ] Initialize `seen_hashes: set[str] = set()` at the start of each session (not per source)
  - [ ] After reading content bytes: `file_hash = sha256_hash(content)`
  - [ ] `if is_duplicate(file_hash, seen_hashes): log + state.mark_skipped(url) + continue`
  - [ ] After confirming not a duplicate: `seen_hashes.add(file_hash)` then save file
  - [ ] `is_duplicate()` MUST NOT mutate `seen_hashes` — add hash manually after confirming unique
- [ ] Add all 4 sources to `config.yaml` (AC: 2)
  - [ ] Keep existing `thuvienhoasen` entry unchanged
  - [ ] Add `budsas` with real seed URL, rate_limit_seconds ≥ 1.0, correct css_selectors
  - [ ] Add `chuabaphung` with real seed URL, rate_limit_seconds ≥ 1.0, correct css_selectors
  - [ ] Add `dhammadownload` with real seed URL, rate_limit_seconds ≥ 1.0, correct css_selectors
  - [ ] Validate all 4 sources pass Pydantic SourceConfig validation: `load_config("config.yaml")` succeeds
- [ ] Verify config-only extensibility (AC: 3)
  - [ ] No source names or URLs hardcoded in `crawler.py` — all driven from `config.yaml`
  - [ ] Any new source with valid fields in config works with `--source <name>` without code change
- [ ] Run full `--source all` and confirm 4 output directories are created (AC: 2)

## Dev Notes

### Deduplication Integration Point

`utils/dedup.py` is fully implemented (Story 1.4). The dedup check fits AFTER content is read AND BEFORE file is saved:

```python
from utils.dedup import sha256_hash, is_duplicate

# Initialize once per crawler session (not per source)
seen_hashes: set[str] = set()

async def process_url(url, ..., seen_hashes):
    # ... (robots check, skip check, rate limit, download) ...

    content = await resp.read()

    # Completeness check (Story 2.3)
    if not is_complete_html(content, file_format):
        state.mark_error(url); state.save(); return

    # Deduplication check — BEFORE writing to disk
    file_hash = sha256_hash(content)
    if is_duplicate(file_hash, seen_hashes):
        logger.info(f"[crawler] Duplicate detected (hash match): {url} — skipping")
        state.mark_skipped(url)
        state.save()
        return

    # Not a duplicate — add hash to seen set, then save
    seen_hashes.add(file_hash)
    save_file(content, file_path)
    state.mark_downloaded(url)
    state.save()
    logger.info(f"[crawler] Downloaded: {url} → {file_path}")
```

**Key**: `is_duplicate(hash, seen_hashes)` does NOT mutate `seen_hashes`. You must explicitly call `seen_hashes.add(file_hash)` for new unique files.

### config.yaml — All 4 Sources

Add the following 3 new sources to `config.yaml`. These are the known source URLs for the 4 Buddhist scripture sites. Use the best available CSS selectors (may need adjustment during actual crawl):

```yaml
  - name: budsas
    seed_url: https://www.budsas.org/uni/u-kinh-nikaya/nikaya00.htm
    rate_limit_seconds: 1.5
    output_folder: budsas
    file_type_hints:
      - html
    css_selectors:
      catalog_links: "a[href*='.htm']"       # links to nikaya text pages
      file_links: ""                          # page itself is the file (no separate download)
      title: "h2, h3"                        # title in content
      category: ""                           # always Nikaya for budsas
      subcategory: "h1"                      # section heading

  - name: chuabaphung
    seed_url: https://chuabaphung.vn/category/kinh-dien/
    rate_limit_seconds: 2.0
    output_folder: chuabaphung
    file_type_hints:
      - html
    css_selectors:
      catalog_links: "h2.entry-title a"      # post links on category page
      file_links: ""                          # post page itself is the file
      title: "h1.entry-title"
      category: ".breadcrumb li:nth-child(2)"
      subcategory: ".breadcrumb li:last-child"
    pagination_selector: "a.next.page-numbers"

  - name: dhammadownload
    seed_url: https://dhammadownload.com/Canon-text-List.htm
    rate_limit_seconds: 1.5
    output_folder: dhammadownload
    file_type_hints:
      - html
      - pdf
    css_selectors:
      catalog_links: "table a[href]"          # links in the canon text table
      file_links: "a[href$='.pdf'], a[href$='.html']"  # direct file links
      title: "h1, h2, title"
      category: ""
      subcategory: ""
```

**Note**: CSS selectors above are best-effort approximations based on known site structures. The dev agent should verify selectors work against the actual live pages. If selectors return 0 results, update config.yaml — NOT crawler.py.

### Source Rate Limits

| Source | rate_limit_seconds | Rationale |
|---|---|---|
| thuvienhoasen | 1.5 | High-quality Vietnamese site, polite delay |
| budsas | 1.5 | Established text archive |
| chuabaphung | 2.0 | WordPress site, slightly more conservative |
| dhammadownload | 1.5 | Archive site with mixed file types |

All are ≥ 1.0 (enforced by SourceConfig Pydantic validator — a lower value will raise ValidationError).

### Config-Only Extensibility Check

Verify these conditions in crawler.py to ensure NFR9 is satisfied:
- No `if source.name == "thuvienhoasen":` branches — all source-specific behavior comes from config
- No hardcoded URLs in crawler.py
- `--source all` iterates `cfg.sources` (the full list from config)
- `--source <name>` filters `cfg.sources` by `name` field

### seen_hashes Session Scope

`seen_hashes` must be initialized ONCE at session start and passed through to all source crawls in `crawl_all()`. This allows deduplication ACROSS sources (a file on budsas that duplicates thuvienhoasen will be caught).

```python
async def crawl_all(sources, cfg, robots_cache, logger):
    seen_hashes: set[str] = set()  # shared across all sources
    connector = aiohttp.TCPConnector(limit_per_host=2)
    async with aiohttp.ClientSession(connector=connector, ...) as session:
        for source in sources:
            await crawl_source(source, session, robots_cache, logger, seen_hashes)
```

### Duplicate Rate Target

The corpus must have < 2% duplicate rate (NFR8). Deduplication at download time (SHA-256 hash comparison) prevents duplicates from being written to disk at all. Story 4.2 will validate the final rate.

### Project Structure Notes

After this story, `crawler.py` is fully functional end-to-end:
- CLI: `uv run python crawler.py --source all` crawls all 4 sources
- `devbox run crawl` is the shortcut (already in devbox.json)
- All 4 `data/raw/<source>/` directories will be populated
- `data/crawl-state.json` tracks every URL outcome
- `logs/crawl.log` records all activity

Epic 2 is complete after this story. Epic 3 (parser.py) can begin.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.5: Content Deduplication + All 4 Sources Configured]
- [Source: _bmad-output/planning-artifacts/phase-1-crawler/architecture-phase1-crawler.md#Data Architecture — Content Hash Algorithm]
- [Source: _bmad-output/planning-artifacts/epics.md#Additional Requirements — Content Hash Algorithm]
- [Source: _bmad-output/planning-artifacts/epics.md#Additional Requirements — Shared Utilities Package — dedup.py]
- [Source: _bmad-output/implementation-artifacts/1-4-core-utilities-package.md#utils/dedup.py]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

### File List
