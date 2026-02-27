---
stepsCompleted: [step-01-init, step-02-discovery, step-02b-vision, step-02c-executive-summary, step-03-success, step-04-journeys, step-05-domain, step-06-innovation, step-07-project-type, step-08-scoping, step-09-functional, step-10-nonfunctional, step-11-polish, step-12-complete]
inputDocuments:
  - docs/ke-hoach-thu-vien-kinh-phat.md
workflowType: 'prd'
classification:
  projectType: data_pipeline_developer_tool
  domain: edtech_cultural
  complexity: medium
  projectContext: greenfield
---

# Product Requirements Document
# Thư Viện Kinh Phật Thông Minh — Phase 1: Web Crawler & Raw Data Corpus

**Author:** Minh
**Date:** 2026-02-27
**Version:** 1.0
**Status:** Draft

---

## Executive Summary

Phase 1 of the Smart Buddhist Scripture Library project builds the raw data foundation — a multi-source crawler that downloads Buddhist scripture files (HTML, PDF, EPUB, and other formats) from reputable Vietnamese sources, alongside structured metadata JSON files describing each document.

**The core problem:** Buddhist scripture texts are scattered across multiple Vietnamese websites with inconsistent formats and no unified collection. There is no single, locally-stored, well-attributed corpus of Vietnamese Buddhist texts that downstream tools can build on.

**The Phase 1 differentiator:** A clean, crawl-respecting, multi-source downloader that produces a well-organized local corpus of raw scripture files, each paired with a structured metadata JSON. This corpus becomes the single source of truth for all subsequent phases.

**Phase 1 success** means: a developer has a local directory of raw scripture files organized by tradition and source, each with a corresponding metadata JSON, and a flat index manifest — ready to be ingested by Phase 2's library and indexing pipeline.

---

## Product Vision

Build the first systematically-collected, ethically-crawled, locally-stored corpus of Vietnamese Buddhist scriptures — a raw data foundation that Phase 2 can index and browse, and Phase 3 can enrich with AI.

**Phase 1's role:** Download and preserve. Not process, not index, not embed. Just get the texts, store them faithfully, and document their provenance.

---

## Success Criteria

### Primary Success Metrics

| Metric | Target | Measurement Method |
|---|---|---|
| Scripture coverage | ≥ 500 unique texts downloaded | Count of records in `data/index.json` |
| Source coverage | All 4 target sources successfully crawled | Crawler run log per source |
| Metadata completeness | ≥ 90% of records have title, source, url, file_path, format populated | Schema validation script |
| Raw file integrity | 100% of referenced files exist on disk and are non-empty | File existence + size check |
| Deduplication | < 2% duplicate records in the corpus | Hash-based dedup check on file content |
| Crawl compliance | Zero violations of robots.txt rules across all 4 sources | Crawler audit log |

### Quality Gates (Must Pass Before Phase 2 Handoff)

- [ ] Manual spot-check of 50 random records — verify file content matches source page and metadata is accurate
- [ ] All metadata JSON files pass schema validation (no missing required fields)
- [ ] Crawler can be re-run incrementally without re-downloading already-stored files
- [ ] `data/index.json` accurately reflects all files on disk (no orphaned files, no missing entries)

---

## User Journeys

### Journey 1: Developer Runs the Full Crawl

**Actor:** Developer (Minh) building the initial corpus

1. Configures `config.yaml` — sets seed URLs, rate limits, output directory per source
2. Runs `crawler.py --source all` — crawl starts, progress logged to console (URL, status, file type saved)
3. Crawler visits catalog pages, extracts individual scripture links, downloads each file
4. Raw files land in `data/raw/<source>/<category>/` with original filenames preserved
5. For each file, `parser.py` extracts metadata from the page and writes a paired `.meta.json`
6. `data/index.json` is updated with each new record
7. Developer opens a few downloaded files — confirms content is complete and correct

**Success signal:** `data/raw/` is populated with organized scripture files; `data/index.json` lists all of them with full provenance.

---

### Journey 2: Developer Extends to a New Source

**Actor:** Developer adding a 5th crawl source

1. Adds a new source block to `config.yaml` (seed URL, file type hints, rate limit, folder name)
2. Runs `crawler.py --source new-source-name`
3. New files downloaded to `data/raw/new-source/`
4. Metadata JSONs generated; `data/index.json` updated with new entries
5. No changes required to core crawler logic

**Success signal:** Adding a new source is a config-only change.

---

### Journey 3: Phase 2 Team Picks Up the Corpus

**Actor:** Developer starting Phase 2 (library UI and indexing)

1. Reads `data/index.json` — gets a complete manifest of all files, formats, categories, and source URLs
2. Picks any record from the index — opens the corresponding raw file and `.meta.json`
3. Has everything needed to build an ingestion pipeline: file path, format, title, tradition, translator, canonical URL
4. Does not need to re-crawl or re-parse anything — Phase 1 corpus is complete and stable

**Success signal:** Phase 2 can start from `data/index.json` alone with no dependency on re-running any Phase 1 script.

---

## Domain Requirements

### Content Integrity (Critical)

The corpus will eventually ground an AI system that attributes quotes to Buddhist scripture. Corrupted or mislabeled files undermine trust.

- Raw files must be stored exactly as downloaded — no modification to content
- Each file must be paired with a metadata JSON that captures `source`, `url`, and `author_translator` (where available) to enable citation traceability in later phases
- File format must be preserved faithfully (HTML saved as `.html`, PDF as `.pdf`, EPUB as `.epub`)

### Legal & Ethical Crawling

- All crawling must respect each site's `robots.txt` before crawling any path
- Rate limiting: minimum 1–2 seconds per request; configurable per source
- Priority: classical texts (Pali canon, ancient sutras) are public domain
- Modern Vietnamese translations: potentially copyrighted — download for internal research; flag records with `copyright_status: unknown` for legal review before any redistribution
- Do not bypass login walls, CAPTCHAs, or access controls

### Multilingual Handling

- Primary language: Vietnamese (`vi`)
- `title_pali` and `title_sanskrit` captured where present in the source page
- All text metadata stored in UTF-8; raw HTML files preserve original encoding then normalized on read

---

## Innovation Patterns

### Multi-Tradition Unified Metadata Schema

Unifying Theravada (Pali Nikayas), Mahayana, Zen, and Vajrayana texts under a single metadata schema with a consistent `category`/`subcategory` taxonomy is the key architectural decision of Phase 1. This unified structure is what enables Phase 2 to browse across traditions and Phase 3 to search across them semantically — without custom handling per source.

### Incremental, Resumable Crawling

The crawler is designed for long-running, interruptible execution — tracking what has already been downloaded and resuming without duplication. This is essential for a corpus of this scale (500+ texts across 4 sources) that may take multiple sessions to complete.

---

## Scope

### MVP — Phase 1 Deliverable

**In scope:**
- Crawler for all 4 target sources: thuvienhoasen.org, chuabaphung.vn, budsas.org, dhammadownload.com
- Catalog crawl → individual scripture URL extraction → file download
- Metadata extraction and `.meta.json` generation per file
- Deduplication by URL and content hash
- `data/index.json` — flat manifest of all downloaded texts
- `data/raw/` — organized directory of downloaded files
- Schema validation utility
- Incremental / resumable crawl mode

**Explicitly out of scope for Phase 1:**
- Any database (SQLite, ChromaDB, or otherwise) — raw files + JSON only
- Vector embeddings or semantic indexing
- Any web UI or API
- Full-text search
- Summary generation or LLM processing
- `key_concepts`, `related_suttas`, `summary` fields (require LLM — Phase 3)
- Audio (text-to-speech)
- User accounts

---

## Functional Requirements

### Source Crawling

- FR1: The crawler can fetch the catalog/listing page of each configured source and extract individual scripture URLs
- FR2: The crawler can download the full raw file (HTML, PDF, EPUB, or other detected format) for each scripture URL
- FR3: The crawler enforces a configurable per-source rate limit (delay between requests)
- FR4: The crawler reads and respects each source's `robots.txt` before crawling any path
- FR5: The crawler can be invoked for a single source or all sources via a CLI argument
- FR6: The crawler logs each URL's status (downloaded, skipped, error) to a persistent log file
- FR7: The crawler skips URLs whose files already exist locally (incremental mode — no re-download)
- FR8: The crawler can resume a previously interrupted run without re-downloading completed files

### File Storage

- FR9: Downloaded files are saved to `data/raw/<source>/<category>/` with the original filename or a slug derived from the title
- FR10: Each raw file is saved in its original format (HTML → `.html`, PDF → `.pdf`, EPUB → `.epub`)
- FR11: No modification is made to the raw file content — stored exactly as received

### Metadata Extraction & Normalization

- FR12: For each downloaded file, a paired `.meta.json` is generated in the same directory
- FR13: The metadata extractor captures: `id`, `title`, `title_pali`, `title_sanskrit`, `category`, `subcategory`, `source`, `url`, `author_translator`, `file_path`, `file_format`, `copyright_status`, `created_at`
- FR14: `category` is mapped to one of: `Nikaya | Đại Thừa | Mật Tông | Thiền | Tịnh Độ`
- FR15: `subcategory` is derived from the source catalog structure (e.g., "Trường Bộ", "Bát Nhã")
- FR16: `id` is deterministic — derived from source slug + title slug (stable across re-runs)
- FR17: `copyright_status` is set to `public_domain` for classical texts or `unknown` for modern translations

### Index Management

- FR18: The pipeline maintains `data/index.json` — a flat array of all records with: `id`, `title`, `category`, `subcategory`, `source`, `url`, `file_path`, `file_format`, `copyright_status`
- FR19: `data/index.json` is updated incrementally (new records appended; no full rebuild required)
- FR20: `data/index.json` is always consistent with files on disk (no orphaned entries, no missing files)

### Data Quality

- FR21: The pipeline detects and skips duplicate files (same content from different URLs)
- FR22: A schema validation utility scans all `.meta.json` files and reports records with missing required fields
- FR23: The pipeline generates a run summary report: records downloaded, skipped, errors, duplicates detected

### Operational

- FR24: All scripts are runnable as standalone CLI commands with `--help` documentation
- FR25: Source configuration (seed URLs, rate limits, CSS selectors, output paths) lives in a single `config.yaml` — nothing hardcoded
- FR26: The full pipeline (crawl → extract metadata → update index) can be executed end-to-end via a single command

---

## Non-Functional Requirements

### Performance

- NFR1: With async mode enabled, crawler must process ≥ 30 pages/minute net of rate-limit delays
- NFR2: Metadata extraction must complete within 5 seconds per file on a standard laptop

### Reliability

- NFR3: The crawler must handle HTTP errors (4xx, 5xx), timeouts, and malformed HTML gracefully — log and skip, never crash the full run
- NFR4: All scripts must be idempotent — re-running with the same inputs produces the same outputs, no duplicates or corrupt state
- NFR5: An interrupted crawl must be resumable from where it stopped — no data loss, no full restart

### Data Quality

- NFR6: ≥ 90% of downloaded records must have all required metadata fields populated
- NFR7: All metadata text must preserve original Vietnamese Unicode — no encoding corruption
- NFR8: Duplicate file rate in the final corpus must be < 2%

### Maintainability

- NFR9: Adding a new crawl source requires only a new entry in `config.yaml` — no changes to core crawler code
- NFR10: Crawler, parser, and index modules must be independently runnable and testable
- NFR11: All public functions must have inline documentation

### Compliance

- NFR12: Crawler must never exceed the configured rate limit — enforced in both sync and async modes
- NFR13: Any path disallowed by `robots.txt` must be logged as a warning and skipped

---

## Technical Constraints

| Constraint | Detail |
|---|---|
| Language | Python 3.10+ |
| HTTP layer | `requests` (sync) + `aiohttp` + `asyncio` (async crawl) |
| HTML parsing | `BeautifulSoup4` |
| Rate limiting | Minimum 1–2 sec/request, configurable per source |
| Raw file storage | `data/raw/<source>/<category>/` — files as-is |
| Metadata storage | `.meta.json` per file + `data/index.json` flat manifest |
| No database | Phase 1 uses only JSON files — no SQLite, no ChromaDB |
| No embeddings | Sentence-transformers deferred to Phase 3 |
| No LLM calls | No external AI API calls in Phase 1 |
| Encoding | UTF-8 enforced for all metadata; raw files stored as-is |

---

## Deliverables

| File / Directory | Description |
|---|---|
| `crawler.py` | Multi-source async crawler — catalog crawl, file download, rate limiting, robots.txt, incremental mode |
| `parser.py` | Metadata extractor — reads crawled pages and writes `.meta.json` per file |
| `indexer.py` | Index manager — builds and updates `data/index.json` from `.meta.json` files |
| `validate.py` | Schema validation utility — reports records with missing required fields |
| `config.yaml` | Source configs: seed URLs, CSS selectors, rate limits, output paths |
| `data/raw/<source>/<category>/` | Raw downloaded files (HTML, PDF, EPUB, etc.) |
| `data/raw/<source>/<category>/*.meta.json` | Paired metadata JSON per downloaded file |
| `data/index.json` | Flat manifest of all indexed records |

---

## Timeline

| Week | Milestone |
|---|---|
| Week 1 | Crawler prototype for thuvienhoasen.org; config structure defined; file storage layout established; logging in place |
| Week 2 | Crawler extended to all 4 sources; `parser.py` metadata extraction complete; deduplication working |
| Week 3 | `indexer.py` and `data/index.json` finalized; `validate.py` passing; quality audit complete; Phase 2 handoff ready |

---

## Open Questions

1. **Modern translation copyright:** Flag with `copyright_status: unknown` in metadata, or exclude from crawl entirely? Decision needed before crawling chuabaphung.vn and dhammadownload.com.
2. **HTML vs rendered content:** Some sources may use JavaScript rendering. Is Playwright/Selenium in scope for Phase 1, or do we restrict to static HTML sources only?
3. **Minimum corpus size:** Is 500 texts the formal "done" threshold, or is full crawl of all 4 sources the definition of complete regardless of count?
4. **`key_concepts`, `summary`, `related_suttas`:** Confirm these fields are deferred entirely to Phase 3 — should they even be in the schema placeholder now, or added later?

---

## Remaining Phases — Reference Note

> This PRD covers Phase 1 only. The following is a high-level reference for context and continuity planning.

### Phase 2 — Library Indexing & Browse UI

**Input:** `data/raw/` + `data/index.json` from Phase 1

**Goal:** Build a structured database from the raw corpus and a UI to browse it.

- Parse raw files (HTML, PDF, EPUB) into clean structured text
- Load into a relational/document store (SQLite or similar) with full-text search
- Build a React/HTML library UI: browse by tradition, category, translator
- Reading mode for individual texts
- No AI/LLM in this phase — pure browse and keyword search

### Phase 3 — LLM Integration & Semantic Search

**Input:** Structured text from Phase 2 database

**Goal:** Enable natural-language querying of the scripture corpus via AI.

- Generate multilingual vector embeddings (sentence-transformers) from Phase 2 structured text
- Load embeddings into ChromaDB (vector database)
- Build RAG (Retrieval-Augmented Generation) pipeline using Claude API
- AI chat interface: users ask questions in Vietnamese, AI responds with cited scripture passages
- System prompt configured as a Buddhist dharma guide — cites only from the corpus, no hallucination
- Semantic search across all traditions

### Phase 4 (Vision) — Advanced Features

- User accounts, bookmarks, personal notes
- Learning path recommendations
- Community annotations
- Text-to-speech (kinh tụng mode)
- Public API for third-party integrations
- Multi-language support (English, Khmer, Thai, Chinese)
