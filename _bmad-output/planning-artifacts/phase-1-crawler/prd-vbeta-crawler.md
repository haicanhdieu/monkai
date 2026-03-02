---
stepsCompleted: [draft]
inputDocuments:
  - _bmad-output/planning-artifacts/phase-1-crawler/prd-phase1-crawler.md
  - _bmad-output/planning-artifacts/epics.md
workflowType: 'prd'
classification:
  projectType: data_pipeline_developer_tool
  domain: edtech_cultural
  complexity: medium
  projectContext: brownfield
---

# Product Requirements Document
# Thư Viện Kinh Phật Thông Minh — Phase 1 Extension: vbeta.vn API Crawler

**Author:** Minh
**Date:** 2026-02-28
**Version:** 1.1
**Status:** Draft

---

## Executive Summary

`thuvienhoasen.org` — one of the four originally planned crawl sources for Phase 1 — is protected by Cloudflare's bot detection and is not crawlable. This PRD defines a **new, additive epic** that replaces it by integrating `vbeta.vn` (Pháp Bảo — Thư viện số hóa kinh sách Phật giáo) as a crawl source.

**Key distinction from the original Phase 1 PRD:** `vbeta.vn` is an Angular SPA — traditional HTML scraping will not work. Instead, the crawler must call the public REST API hosted at `api.phapbao.org` to retrieve chapter content as structured JSON.

**Major Pivot:** We will retire all legacy HTML crawlers and parsers. We will keep only the `vbeta` implementation, re-defining our core domain models (Categories, Books, Chapters, Pages) to mirror the JSON structure returned by the vbeta API. All fetched data will be stored as JSON directly under the `data` folder.

---

## Background & Context

### Why vbeta.vn?

| Property | Detail |
|---|---|
| Full name | Pháp Bảo — Thư viện số hóa kinh sách Phật giáo |
| URL | https://www.vbeta.vn |
| Categories | Kinh (Sutras), Luật (Vinaya), Luận (Abhidhamma), Sách, Linh Sơn Đại Tạng, Tạp Chí |
| Technology | Angular SPA, content served via REST API |
| Backend API | `https://api.phapbao.org` (public, no authentication observed) |
| robots.txt | No restrictive rules found |
| Coverage | Vietnamese Buddhist scripture library — broad Theravada, Mahayana, and Vajrayana canon |

### API Architecture Discovered

The vbeta.vn site renders content by calling REST endpoints at `api.phapbao.org`. All content is available as JSON — no JavaScript rendering needed for the crawler.

**URL Structure (for navigation reference only):**
- Category page: `https://www.vbeta.vn/phap-bao/{slug}/{cat-id}`
  - Example: `https://www.vbeta.vn/phap-bao/kinh/1`
- Book/Title page: `https://www.vbeta.vn/phap-bao/{book-slug}/{cat-id}/{book-id}`
  - Example: `https://www.vbeta.vn/phap-bao/kinh-truong-bo-1/1/1`
- Chapter page: `https://www.vbeta.vn/phap-bao/{chapter-slug}/{cat-id}/{book-id}/{chapter-id}`
  - Example: `https://www.vbeta.vn/phap-bao/1-kinh-pham-vong/1/1/12439`

**Key API Endpoints:**
- Chapter content: `GET https://api.phapbao.org/api/search/get-pages-by-tableofcontentid/{chapter-id}`
  - Returns JSON with `result.pages[].htmlContent` — the scripture text as HTML string
- Additional endpoints for categories and table of contents to be confirmed during implementation (Epic 7, Story 7.1)

---

## Product Vision

Pivot the Thư Viện Kinh Phật project to exclusively use `vbeta.vn` as its singular, comprehensive data source. By directly consuming the structured JSON API at `api.phapbao.org`, we bypass the fragility of HTML scraping (and Cloudflare blocking).

**This epic's role:**
1. Build a new API-first crawler to fetch **all** categories, books, chapters, and pages from `vbeta.vn`.
2. Retire and delete all legacy crawlers and parsers.
3. Redefine the core data models (Category, Book, Chapter, Page) to align naturally with the structure provided by vbeta API JSON payloads.
4. Store all crawled artifacts directly as JSON files under the `data` folder.

---

## Success Criteria

| Metric | Target | Measurement |
|---|---|---|
| vbeta.vn chapters crawled | ≥ 200 unique chapter records in `data/index.json` | `indexer.py` count for source `vbeta` |
| API response parsing | 100% of API responses decoded to valid `.meta.json` | `validate.py` schema check |
| Metadata completeness | ≥ 90% of vbeta records have `title`, `category`, `book_title`, `chapter` | `validate.py` field coverage |
| Crawl compliance | Zero disallowed paths accessed; rate limit respected | Crawler audit log |
| No regression | All existing source pipelines (thuvienkinhphat, budsas, etc.) continue to pass | `devbox run test` |
| Vietnamese encoding | 100% Vietnamese text preserved without mojibake | Manual spot-check + UTF-8 validation |

---

## User Journeys

### Journey 1: Developer Crawls vbeta.vn

1. Runs `devbox run crawl -- --source vbeta`
2. Crawler detects `source_type: api` in config → switches to API adapter mode
3. API adapter fetches category lists, then book lists, then chapter IDs from `api.phapbao.org`
4. For each chapter ID, fetches chapter content JSON → extracts `htmlContent`
5. Saves content as `.html` file to `data/raw/vbeta/{category}/{chapter-slug}.html`
6. Generates paired `.meta.json` with full metadata schema
7. `data/index.json` updated with vbeta records

**Success signal:** `data/raw/vbeta/` is populated; `data/index.json` entries for `source: "vbeta"` appear.

### Journey 2: Developer Adds Another API-Based Source in Future

1. New source uses `source_type: api` with its own `api_base_url` and endpoint templates
2. Configures endpoint paths in `config.yaml` — no code changes
3. API adapter handles the new source automatically

**Success signal:** The API adapter is reusable without code modification (NFR9 extension).

---

## Scope

### In Scope

- Retire and remove all legacy crawler and parser implementations.
- Implement an API-driven crawler to fetch **all** categories, books, and chapters from `vbeta.vn`.
- Define new core domain models (Categories, Books, Chapters, Pages) to closely mirror vbeta's JSON structure.
- Save fetched data directly as JSON files into the `data` directory hierarchy.
- Traverse the entire category → book → chapter tree via the API.

### Out of Scope

- HTML scraping or DOM parsing of any kind.
- Cloudflare bypass (abandoned).
- PDF or EPUB download from vbeta (chapters are HTML content via API).
- Book builder / EPUB generation for vbeta (deferred to a future epic).

---

## Functional Requirements

### Core Models & Crawler Updates

- **FR-V1:** Completely remove existing legacy HTML parsing logic and deprecated crawlers.
- **FR-V2:** The crawler iterates over all Categories, Books, and Chapters provided by the `api.phapbao.org` endpoint.
- **FR-V3:** Define new Pydantic models for Category, Book, Chapter, and Page that map 1:1 or closely to the JSON responses from vbeta. 
- **FR-V4:** Save the raw fetched JSON responses as `.json` files under the `data/raw/vbeta` folder (e.g., `data/raw/vbeta/categories.json`, `data/raw/vbeta/chapters/[book_id].json`). 
- **FR-V5:** Save the processed JSON data (or directly copy if no transformation is needed) into the `data/book-data` folder for final consumption.

### Config & Settings

- **FR-V6:** Simplify `config.yaml` to only represent the `vbeta` API details, removing complex scraping selectors and fallback configurations.

---

## Non-Functional Requirements

- **NFR-V1:** API adapter must handle HTTP 4xx/5xx and timeouts gracefully — log and skip, never crash
- **NFR-V2:** All existing NFRs (NFR1–NFR13) from the Phase 1 PRD continue to apply
- **NFR-V3:** Adding a second API-based source in future requires only a new `config.yaml` entry — no code changes to the adapter (extends NFR9)
- **NFR-V4:** `devbox run test` must pass with no regressions after adapter is integrated

---

## Technical Constraints

| Constraint | Detail |
|---|---|
| API client | `aiohttp` (reuse existing async client) |
| API response format | JSON — parse `result.pages[].htmlContent` |
| Storage | Same `data/raw/vbeta/{category}/` path pattern as other sources |
| Config | `source_type: api`, `api_base_url`, `api_endpoints` added to `SourceConfig` in `models.py` |
| No new dependencies | Use existing `aiohttp`, `pydantic`, `typer` — no new packages |
| Python version | 3.11 (unchanged) |

---

## Open Questions

1. **Full API endpoint map:** The chapter-content endpoint (`get-pages-by-tableofcontentid`) is confirmed. Category-list and book-list endpoints need discovery during Story 7.1. If the API is not fully enumerable, may need a fallback to driving navigation via the SPA URLs with Playwright.
2. **API rate limits:** No rate limit headers observed during research. Story 7.1 should probe this and set a conservative `rate_limit_seconds: 2.0` as default.
3. **Category taxonomy alignment:** vbeta categories (Kinh, Luật, Luận, Sách, Linh Sơn Đại Tạng, Tạp Chí) need to be mapped to the existing `ScriptureMetadata.category` literals. This mapping should be defined in Story 7.2.

---

## Deliverables

| File / Change | Description |
|---|---|
| `models.py` (extended) | `source_type`, `enabled`, `api_base_url`, `api_endpoints` fields added to `SourceConfig` |
| `crawler.py` (extended) | Enabled-source filter + API dispatch path added; HTML path unchanged |
| `utils/api_adapter.py` (new) | API crawler adapter — category/book/chapter traversal + content fetch |
| `config.yaml` (extended) | `vbeta` entry (`enabled: true`, `source_type: api`); `thuvienkinhphat` set to `enabled: false` |
| `tests/test_api_adapter.py` (new) | Unit tests for API adapter with mocked HTTP responses |
| `tests/test_crawler.py` (extended) | Tests for enabled/disabled source filter logic |
| `data/raw/vbeta/` | Crawled chapter HTML files |
| `data/raw/vbeta/**/*.meta.json` | Paired metadata per chapter |

---

## Relationship to Existing Epics

> This PRD adds **Epic 7** to the sprint plan. All Epics 1–6 remain unchanged.

| Epic | Status | Relationship |
|---|---|---|
| Epic 1 — Project Foundation | ✅ Done | `models.py` and `utils/` extended (not replaced) |
| Epic 2 — Web Crawler | ✅ Done | `crawler.py` extended with API dispatch; HTML path unchanged |
| Epic 3 — Metadata & Index | ✅ Done | `parser.py` and `indexer.py` reused as-is |
| Epic 4 — Data Quality | ✅ Done | `validate.py` applies automatically to vbeta `.meta.json` files |
| Epic 5 — ThuvienKinhPhat Fix | ✅ Done | No changes |
| Epic 6 — Data Architecture | 🔄 In-progress | No changes |
| **Epic 7 — vbeta.vn API Crawler** | 🆕 New | This PRD |
