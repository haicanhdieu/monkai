---
stepsCompleted: [research, site-analysis, prd-draft]
inputDocuments:
  - _bmad-output/planning-artifacts/phase-1-crawler/prd-phase1-crawler.md
  - apps/crawler/models.py
  - apps/crawler/config.yaml
workflowType: 'prd'
classification:
  projectType: data_pipeline_developer_tool
  domain: vietnamese_literature
  complexity: medium
  projectContext: extension_of_existing_crawler
---

# Product Requirements Document
# VNThuQuan Crawler — Phase 1.1: Vietnamese Literature Corpus

**Author:** Minh
**Date:** 2026-04-11
**Version:** 1.0
**Status:** Draft

---

## Executive Summary

Phase 1.1 extends the Monkai crawler pipeline with a new source: **vietnamthuquan.eu** — one of the largest Vietnamese online literature libraries with ~25,000 books spanning fiction, poetry, essays, historical texts, and more.

**The core problem:** Vietnamese literary works are scattered across aging web platforms with non-standard content delivery (ASP.NET AJAX, custom delimiters, cookie requirements). There is no locally-stored, well-structured corpus of this content.

**The Phase 1.1 deliverable:** A crawler module that navigates VNThuQuan's listing pages, extracts book metadata and chapter content via their AJAX API, and outputs data in the existing `BookData` v2.0 schema — fully compatible with the Phase 2 reader UI and book index pipeline.

**Phase 1.1 success** means: all ~25,000 books are crawled with their chapters, stored as `book.json` files in `data/book-data/vnthuquan/`, and indexed in the central `data/book-data/index.json` — ready for the reader app.

---

## Product Vision

Expand the Monkai corpus beyond Buddhist scriptures to encompass the breadth of Vietnamese literature — novels, short stories, poetry, essays, and reference works — creating a comprehensive offline-capable library of Vietnamese texts.

**Phase 1.1's role:** Crawl and preserve. Reuse the existing `BookData` v2.0 output format so the reader UI can consume VNThuQuan content with zero changes.

---

## Site Analysis

### Target Site

- **URL:** `http://vietnamthuquan.eu/truyen/`
- **Platform:** ASP.NET (IIS 10.0, .NET 4.0)
- **Total books:** ~25,380 (1,269 listing pages × 20 books/page)
- **Content types available:** Text, PDF, EPUB, Audio, Image (this crawler targets **Text** only)
- **robots.txt:** Not present (no crawling restrictions declared)

### Site Structure

```
Listing Page (?tranghientai={1..1269})
├── 20 books per page
│   ├── Title (a.truyen-title > a[href=truyen.aspx?tid=...])
│   ├── Author (span.author > a[href=tacpham.aspx?tacgiaid=...])
│   ├── Category (span.label-theloai > a[href=theloai.aspx?theloaiid=...])
│   ├── Chapter count (span.totalchuong)
│   ├── Date (span.label-time)
│   ├── Format type (span.label-scan: Text/PDF/Epub/Audio/Image)
│   └── Cover image (img.img-rounded)
└── Pagination: ?tranghientai=2, 3, ... 1269

Book Detail Page (truyen.aspx?tid={opaque_id})
├── Left sidebar:
│   ├── Category label (h3 > a) e.g. "Tuyển Tập, Tập Truyện"
│   ├── Book title (h3.mucluc > a > b)
│   ├── Read count (h4 > span#solan)
│   └── Table of Contents (div#muluben_to):
│       └── Chapter list via onClick="noidung1('tuaid={id}&chuongid={n}')"
│           ├── Each <li class="menutruyen"> = one chapter
│           └── Chapter title in <a class="normal8">
├── Content area (div#noidung > div#khungchinh)
└── Single-chapter books: auto-load via noidung1('tuaid={id}&chuongid=')

Chapter Content API (POST chuonghoi_moi.aspx)
├── Request: POST body "tuaid={id}&chuongid={n}"
├── Response: custom delimiter "--!!tach_noi_dung!!--"
│   ├── Part 0: HTML shell (discard)
│   ├── Part 1: Title + Author metadata
│   ├── Part 2: Chapter content HTML (the actual text)
│   └── Part 3: Navigation + chapter title
└── Cover image URL extractable from Part 0 CSS background-image
```

### Technical Challenges

1. **Cookie requirement:** Server sends 302 redirect without `AspxAutoDetectCookieSupport=1` cookie
2. **AJAX content loading:** Chapter text is not in the initial page HTML — requires POST to `chuonghoi_moi.aspx`
3. **Custom response format:** Content delimited by `--!!tach_noi_dung!!--`, not JSON
4. **Opaque URL IDs:** `tid` parameter is encoded/opaque — cannot be constructed, only scraped
5. **Scale:** ~25K books × ~5 avg chapters = ~125K+ HTTP requests at minimum
6. **Single vs multi-chapter:** Single-chapter books use `chuongid=` (empty), multi-chapter use `chuongid={1,2,...}`

---

## Success Criteria

### Primary Success Metrics

| Metric | Target | Measurement Method |
|---|---|---|
| Book coverage | ≥ 20,000 books crawled | Count of book.json files in `data/book-data/vnthuquan/` |
| Chapter completeness | ≥ 95% of chapters per book have non-empty content | Validation script on book.json files |
| Metadata completeness | 100% of books have title, author, category populated | Schema validation |
| Output compatibility | 100% of book.json files pass BookData v2.0 schema validation | Pydantic model validation |
| Index integration | All crawled books appear in `data/book-data/index.json` | Index rebuild + count check |
| Crawl resilience | Crawler can resume from any interruption point | Manual interrupt + resume test |

### Quality Gates

- [ ] 50 random books spot-checked — chapter content matches website
- [ ] All book.json files parse with existing `BookData` Pydantic model
- [ ] Crawler resumes correctly after Ctrl+C at any point
- [ ] `data/book-data/index.json` accurately reflects all VNThuQuan books on disk
- [ ] Reader UI can load and display VNThuQuan books without code changes

---

## User Journeys

### Journey 1: Developer Runs the VNThuQuan Crawl

1. Adds/enables `vnthuquan` source in `config.yaml`
2. Runs `uv run python apps/crawler/vnthuquan_crawler.py` (or via CLI command)
3. Crawler iterates listing pages 1..1269, extracting book URLs
4. For each book: fetches detail page, extracts chapter list, downloads each chapter via AJAX API
5. Outputs `data/book-data/vnthuquan/{category_slug}/{book_slug}/book.json` per book
6. State saved after every book — safe to interrupt and resume
7. On completion: rebuilds `data/book-data/index.json` with new entries

### Journey 2: Reader App Displays VNThuQuan Books

1. Index rebuild includes VNThuQuan books in `data/book-data/index.json`
2. Reader UI reads the index — VNThuQuan books appear alongside existing sources
3. User opens a VNThuQuan book — chapters and content render identically to vbeta books
4. No reader code changes required — same `BookData` schema

### Journey 3: Resuming an Interrupted Crawl

1. Crawl is interrupted at page 500 / book 10,000
2. Developer re-runs the crawler
3. Crawler checks state file — skips already-crawled books
4. Resumes from the first un-crawled book
5. No duplicate downloads, no data corruption

---

## Scope

### In Scope (MVP)

- Crawler for `vietnamthuquan.eu` — Text format books only
- Listing page pagination (pages 1..1269)
- Book detail page parsing (title, author, category, chapter list)
- Chapter content fetching via `chuonghoi_moi.aspx` POST API
- Output in `BookData` v2.0 schema (one `book.json` per book)
- Cover image URL extraction (stored in metadata, not downloaded)
- Persistent crawl state (resumable after interruption)
- Deduplication by book URL
- Rate limiting (configurable, default 1.5s between requests)
- Integration with existing `data/book-data/index.json`

### Out of Scope

- PDF, EPUB, Audio, Image format downloads (Text only for MVP)
- Cover image file downloads (URL stored in metadata only)
- Author page crawling (`tacpham.aspx` — author bibliography)
- Category-filtered crawling (crawl all categories)
- Full-text search indexing (Phase 2 responsibility)
- Content cleaning or HTML-to-text conversion (raw HTML preserved)
- Any UI changes to the reader app

### Future Enhancements (Post-MVP)

- Download PDF/EPUB versions where available (`dangsach.aspx?dangsach=2|4`)
- Author metadata enrichment from `tacpham.aspx` pages
- Category-based filtering and selective crawling
- Cover image download and local storage
- Parallel/async crawling for faster throughput

---

## Functional Requirements

### Listing Page Crawling

- **FR1:** Crawler fetches listing pages sequentially from `?tranghientai=1` to the last page
- **FR2:** Last page number is auto-detected from pagination links (currently 1269)
- **FR3:** For each listing page, extract all book entries with: URL (`tid`), title, author name, author ID, category name, category ID, chapter count, date, format type
- **FR4:** Only books with format type "Text" are queued for content crawling
- **FR5:** Cookie `AspxAutoDetectCookieSupport=1` is set on all requests

### Book Detail Parsing

- **FR6:** For each book URL, fetch the detail page and extract:
  - Book title (from `h3.mucluc > a > b`)
  - Category label (from sidebar `h3 > a`)
  - Chapter list (from `onClick="noidung1('tuaid={id}&chuongid={n}')"` patterns)
  - `tuaid` value (the book's internal content ID)
  - Cover image URL (from meta or book page elements)
- **FR7:** For single-chapter books (no chapter list), extract `tuaid` from the auto-load script `noidung1('tuaid={id}&chuongid=')`
- **FR8:** Author metadata from the listing page is carried through to the book record

### Chapter Content Fetching

- **FR9:** For each chapter, send POST request to `chuonghoi_moi.aspx` with body `tuaid={id}&chuongid={n}`
- **FR10:** Parse response by splitting on `--!!tach_noi_dung!!--` delimiter:
  - Part 2 = chapter content HTML (primary content to store)
  - Part 1 = title/author confirmation
- **FR11:** For single-chapter books, POST with `tuaid={id}&chuongid=` (empty chapter ID)
- **FR12:** Content HTML is stored as-is — no cleaning or transformation

### Output Format

- **FR13:** Each book produces one `book.json` at `data/book-data/vnthuquan/{category_slug}/{book_slug}/book.json`
- **FR14:** `book.json` conforms to the existing `BookData` v2.0 Pydantic model schema
- **FR15:** Field mapping:

| BookData Field | VNThuQuan Source |
|---|---|
| `meta.source` | `"vnthuquan"` |
| `meta.schema_version` | `"2.0"` |
| `meta.built_at` | UTC timestamp at crawl time |
| `id` | `"vnthuquan__{book_slug}"` |
| `book_id` | `tuaid` (integer) |
| `book_name` | Book title from detail page |
| `book_seo_name` | Slugified book title |
| `cover_image_url` | Extracted from page/API response |
| `author` | Author name from listing page |
| `author_id` | Author ID from `tacgiaid` URL param |
| `category_id` | Category ID from `theloaiid` URL param |
| `category_name` | Category name from listing page |
| `category_seo_name` | Slugified category name |
| `total_chapters` | Length of chapters list |
| `chapters[].chapter_id` | `chuongid` integer |
| `chapters[].chapter_name` | Chapter title from ToC |
| `chapters[].pages[].html_content` | Part 2 of AJAX response |

- **FR16:** The `publisher` and `publication_year` fields are set to `None` (not available from this source)

### State Management & Resumability

- **FR17:** Crawler maintains a state file (`data/crawl-state-vnthuquan.json`) tracking:
  - Last completed listing page number
  - Set of completed book URLs (or `tid` values)
  - Per-book status: `downloaded | error | skipped`
- **FR18:** On startup, crawler reads state file and skips already-completed books
- **FR19:** State is saved after every book completion (not batched)
- **FR20:** A book is only marked `downloaded` after its `book.json` is successfully written to disk

### Rate Limiting & Compliance

- **FR21:** Configurable rate limit (default 1.5s) enforced before each HTTP request
- **FR22:** All requests include a descriptive User-Agent header (e.g., `MonkaiCrawler/1.1`)
- **FR23:** HTTP errors (4xx, 5xx) are logged and the book is marked as `error` in state — crawler continues to next book
- **FR24:** Connection timeouts are handled gracefully (default 30s connect, 60s read)

### Index Integration

- **FR25:** After crawling completes (or on demand), rebuild `data/book-data/index.json` to include VNThuQuan books
- **FR26:** Each VNThuQuan book gets a `BookIndexEntry` with `source: "vnthuquan"` and a `BookArtifact` pointing to its `book.json`

### CLI Interface

- **FR27:** Crawler is invocable as a standalone CLI command: `uv run python apps/crawler/vnthuquan_crawler.py`
- **FR28:** CLI options:
  - `--start-page` / `--end-page`: Limit crawl to a page range (default: all)
  - `--resume`: Resume from last state (default: true)
  - `--rate-limit`: Override rate limit in seconds
  - `--dry-run`: List books that would be crawled without downloading

---

## Non-Functional Requirements

### Performance

- **NFR1:** Crawler must sustain ≥ 20 books/minute net of rate-limit delays (listing + detail + chapters)
- **NFR2:** Memory usage must stay under 500MB regardless of corpus size (stream processing, no full corpus in memory)

### Reliability

- **NFR3:** Crawler must handle HTTP errors, timeouts, malformed HTML, and empty AJAX responses gracefully — log and skip, never crash
- **NFR4:** Interrupted crawl must resume from exact point of interruption — no data loss
- **NFR5:** Crawler must handle the ASP.NET cookie redirect dance automatically
- **NFR6:** Retry failed requests up to 3 times with exponential backoff before marking as error

### Data Quality

- **NFR7:** All output files must be valid UTF-8
- **NFR8:** Vietnamese Unicode characters (diacritics, special characters) must be preserved correctly
- **NFR9:** Content HTML entities (e.g., `&aacute;`) must be preserved as-is (no decoding)
- **NFR10:** Empty chapters (server returns empty Part 2) must be flagged but not block the book

### Maintainability

- **NFR11:** Crawler module is self-contained under `apps/crawler/` — no modifications to existing crawler code
- **NFR12:** Reuses existing Pydantic models from `models.py` — no model changes needed
- **NFR13:** VNThuQuan-specific parsing logic is isolated in its own module (easy to maintain as site changes)

### Compatibility

- **NFR14:** Output `book.json` files must be loadable by the existing reader UI without any reader code changes
- **NFR15:** VNThuQuan books must appear in `data/book-data/index.json` alongside existing vbeta books

---

## Technical Architecture

### New Files

```
apps/crawler/
├── vnthuquan_crawler.py      # Main crawler module + CLI entry point
├── vnthuquan_parser.py       # HTML parsing: listing pages, book details, AJAX responses
└── tests/
    ├── test_vnthuquan_crawler.py
    └── test_vnthuquan_parser.py
```

### Data Output Structure

```
data/book-data/vnthuquan/
├── truyen-ngan/                    # category slug
│   ├── bau-troi-chung/
│   │   └── book.json               # BookData v2.0
│   └── trai-dat-bi-ca/
│       └── book.json
├── tuyen-tap-tap-truyen/
│   └── chuyen-du-hanh-nguoc-thoi-gian/
│       └── book.json
├── tieu-thuyet/
│   └── .../
└── tho/
    └── .../
```

### Dependencies

- **Existing:** aiohttp (HTTP client), BeautifulSoup4 (HTML parsing), Pydantic v2 (models)
- **New:** None — all existing dependencies are sufficient

### Config Addition

```yaml
# config.yaml — new source entry
- name: vnthuquan
  source_type: html
  enabled: true
  seed_url: "http://vietnamthuquan.eu/truyen/?tranghientai=1"
  rate_limit_seconds: 1.5
  output_folder: vnthuquan
  file_type_hints:
    - html
  css_selectors:
    listing_book: "div.truyen-title a"
    listing_author: "span.author a"
    listing_category: "span.label-theloai a"
    listing_chapters: "span.totalchuong"
    book_title: "h3.mucluc a b"
    book_category: "h3 > a"  # first h3 in sidebar
    chapter_item: "li.menutruyen a.normal8"
  pagination_selector: "a[href*='tranghientai']"
```

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Site goes offline during crawl | Medium | High | Resumable state; partial corpus still usable |
| Site blocks our User-Agent | Low | High | Respectful rate limiting; configurable UA |
| AJAX API response format changes | Low | Medium | Parser isolated in single module; easy to update |
| 25K books × chapters exceeds storage | Low | Low | ~25K × 50KB avg = ~1.2GB; manageable |
| ASP.NET session/ViewState requirements | Medium | Medium | Test thoroughly; may need to maintain session state |
| Encoding issues with Vietnamese text | Medium | Medium | Force UTF-8; test with accent-heavy titles |
| Some books have zero loadable chapters | Medium | Low | Log as warning; skip and continue |

---

## Implementation Phases

### Phase A: Foundation (Listing Crawl)
- Implement listing page fetcher with pagination
- Extract book metadata from listing entries
- State management for listing progress
- Tests with saved HTML fixtures

### Phase B: Book Detail + Chapter Fetch
- Book detail page parser (chapter list extraction)
- `chuonghoi_moi.aspx` AJAX content fetcher
- Custom delimiter response parser
- Single-chapter and multi-chapter handling
- Tests with saved response fixtures

### Phase C: Output + Integration
- `BookData` v2.0 assembly from crawled data
- `book.json` file writing with correct directory structure
- Index rebuild integration
- End-to-end test: list → detail → chapters → book.json

### Phase D: Hardening
- Resume/retry logic
- Error handling for all edge cases
- Dry-run mode
- Performance tuning
- Full crawl execution and validation

---

## Appendix: Site Research Data

### Sample Listing Entry HTML
```html
<div class="col-xs-7">
  <span class='label-title label-time'>9.4.2026</span>
  <span class='label-title label-scan'>Text</span>
  <div class='truyen-title' itemprop='name'>
    <span class='viethoachu'>
      <a href='truyen.aspx?tid={opaque_id}'>bầu trời chung</a>
    </span>
  </div>
  <span class='author viethoachu' itemprop='author'>
    <a href='tacpham.aspx?tacgiaid=9936'>trần hà yên</a>
  </span>
  <span class='label-title label-theloai'>
    <a href='theloai.aspx?theloaiid=1'>Truyện ngắn</a>
  </span>
  <span class='totalchuong'>1 Chương</span>
</div>
```

### Chapter AJAX API
```
POST http://vietnamthuquan.eu/truyen/chuonghoi_moi.aspx
Body: tuaid=33201&chuongid=1
Cookie: AspxAutoDetectCookieSupport=1

Response delimiter: --!!tach_noi_dung!!--
Part 0: HTML shell (CSS, layout)
Part 1: "Chuyến Du Hành Ngược Thời Gian\n nhiều tác giả"
Part 2: <actual chapter HTML content>
Part 3: "Lời Giới Thiệu\n Tiến >>"
```

### Known Categories (from listing)
- Truyện ngắn (Short stories)
- Tuyển Tập, Tập Truyện (Collections)
- Tiểu Thuyết (Novels)
- Thơ (Poetry)
- And others discoverable during crawl

### Pagination
- Pages: 1 to 1269
- 20 books per page
- Last page has 17 books (partial)
- URL pattern: `?tranghientai={page_number}`
