# Story 1.1: Listing Page Parser & Data Types

Status: review

## Story

As a developer,
I want to parse VNThuQuan listing pages into structured `BookListingEntry` dataclasses,
So that I have reliable metadata extraction for all books on the site.

## Acceptance Criteria

1. **Given** a saved HTML fixture of a VNThuQuan listing page with multiple book entries (Text, PDF, Audio formats)
   **When** `parse_listing_page(html)` is called
   **Then** it returns a list of `BookListingEntry` objects with: url, title, author_name, author_id, category_name, category_id, chapter_count, date, format_type
   **And** Vietnamese diacritics in titles and author names are preserved correctly
   **And** author_id and category_id are parsed as integers from URL params (`tacgiaid`, `theloaiid`)
   **And** entries with all format types (Text, PDF, Epub, Audio, Image) are returned (filtering happens at adapter level)

2. **Given** a listing page with missing or malformed book entries
   **When** `parse_listing_page(html)` is called
   **Then** malformed entries are skipped and valid entries are still returned
   **And** no exception is raised

3. **Given** a listing page HTML
   **When** `extract_last_page_number(html)` is called
   **Then** it returns the highest page number from pagination links matching `?tranghientai={n}`

## Tasks / Subtasks

- [x] Create `BookListingEntry` dataclass in `vnthuquan_parser.py` (AC: #1)
  - [x] Fields: url, title, author_name (str|None), author_id (int|None), category_name, category_id (int), chapter_count (int), date (str), format_type (str)
- [x] Create HTML fixture `tests/fixtures/vnthuquan_listing_page.html` (AC: #1, #2)
  - [x] Include multiple book rows with Text, PDF, Audio format types
  - [x] Include at least one malformed/incomplete entry (missing author, missing category)
  - [x] Include pagination links with `?tranghientai={n}` params
  - [x] Include Vietnamese diacritics in titles and author names
- [x] Implement `parse_listing_page(html: str) -> list[BookListingEntry]` (AC: #1, #2)
  - [x] Use BeautifulSoup4 with `html.parser`
  - [x] Hardcode CSS selectors (NOT from config.yaml)
  - [x] Extract URL from `div.truyen-title a[href*='truyen.aspx?tid=']`
  - [x] Extract title from same `<a>` element text
  - [x] Extract author_name from `span.author a` text; author_id from `tacgiaid` URL param (int)
  - [x] Extract category_name from `span.label-theloai a` text; category_id from `theloaiid` URL param (int)
  - [x] Extract chapter_count from `span.totalchuong` text (parse integer from "N Chương")
  - [x] Extract date from `span.label-time` text
  - [x] Extract format_type from `span.label-scan` text ("Text", "PDF", etc.)
  - [x] Wrap individual entry parsing in try/except — skip malformed, continue
- [x] Implement `extract_last_page_number(html: str) -> int` (AC: #3)
  - [x] Find all `a[href*='tranghientai']` links
  - [x] Parse `tranghientai={n}` param from each href
  - [x] Return the maximum value
- [x] Write tests in `tests/test_vnthuquan_parser.py` (AC: #1, #2, #3)
  - [x] Test `parse_listing_page` with fixture — verify all fields on a known entry
  - [x] Test Vietnamese diacritics preservation (e.g. "bầu trời chung", "trần hà yên")
  - [x] Test that all format types are returned (Text + non-Text)
  - [x] Test malformed entry is skipped, valid entries still returned
  - [x] Test `extract_last_page_number` returns correct max page
  - [x] Test `extract_last_page_number` with single page (no pagination)

## Dev Notes

### Architecture Compliance

- **File location:** All parser code goes in `apps/crawler/vnthuquan_parser.py` — pure functions, NO I/O
- **No modifications** to `models.py`, `crawler.py`, `utils/state.py`, or any existing file
- **CSS selectors are hardcoded** in the parser module — `config.yaml` selectors are documentation only
- **Dataclasses, not Pydantic** for intermediate types (`BookListingEntry`) — these are internal to the VNThuQuan module, not part of the shared model layer
- **CWD = `apps/crawler`** — imports are unqualified: `from vnthuquan_parser import ...`

### CSS Selectors Reference (from site analysis)

```
Listing entry container: div.col-xs-7 (each book row)
Title:        div.truyen-title span.viethoachu > a[href*='truyen.aspx?tid=']
Author:       span.author.viethoachu > a[href*='tacpham.aspx?tacgiaid=']
Category:     span.label-theloai > a[href*='theloai.aspx?theloaiid=']
Chapters:     span.totalchuong (text: "N Chương")
Date:         span.label-time (text: "9.4.2026")
Format type:  span.label-scan (text: "Text" | "PDF" | "Epub" | "Audio" | "Image")
Pagination:   a[href*='tranghientai'] (parse ?tranghientai={n} from href)
```

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

### URL Param Parsing

- `author_id`: Extract integer from `tacgiaid=NNNN` in the author `<a>` href. If author link is missing, `author_id = None` and `author_name = None`.
- `category_id`: Extract integer from `theloaiid=NNNN` in the category `<a>` href.
- `url`: The full relative URL from the title link `href` (e.g. `truyen.aspx?tid=abc123`).

### Testing Standards

- **Framework:** pytest + `tests/fixtures/` for saved HTML
- **Test file:** `tests/test_vnthuquan_parser.py` — this file will grow across stories 1.1-1.3
- **Fixture loading:** Read fixture files with `Path(__file__).parent / "fixtures" / "filename.html"`
- **Run:** `cd apps/crawler && uv run pytest tests/test_vnthuquan_parser.py -v`

### Project Structure Notes

- New files this story creates:
  - `apps/crawler/vnthuquan_parser.py` (parser module — will grow in stories 1.2 and 1.3)
  - `apps/crawler/tests/fixtures/vnthuquan_listing_page.html`
  - `apps/crawler/tests/test_vnthuquan_parser.py` (test file — will grow in stories 1.2 and 1.3)
- No existing files modified

### References

- [Source: _bmad-output/planning-artifacts/phase-1-1-vnthuquan-crawler/epics-vnthuquan-crawler.md#Story 1.1]
- [Source: _bmad-output/planning-artifacts/phase-1-1-vnthuquan-crawler/architecture-vnthuquan-crawler.md#Implementation Patterns]
- [Source: _bmad-output/planning-artifacts/phase-1-1-vnthuquan-crawler/prd-vnthuquan-crawler.md#Appendix: Site Research Data]
- [Source: _bmad-output/planning-artifacts/phase-1-1-vnthuquan-crawler/architecture-vnthuquan-crawler.md#Enforcement Guidelines]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- Implemented `BookListingEntry` dataclass with all required fields (url, title, author_name, author_id, category_name, category_id, chapter_count, date, format_type)
- Implemented `parse_listing_page()` using BS4 html.parser with hardcoded CSS selectors; wraps per-entry parsing in try/except for graceful malformed-entry handling
- `_parse_int_param()` helper extracts integer URL query params (tacgiaid, theloaiid)
- Implemented `extract_last_page_number()` returning max tranghientai value or 1 as default
- Created HTML fixture with 4 valid entries (Text/PDF/Audio/Epub formats), 1 entry missing author (tests None handling), 1 fully malformed entry (no title link — skipped), and pagination up to page 7
- 10 tests all passing; 6 pre-existing failures in test_deduplication.py unrelated to this story

### File List

- apps/crawler/vnthuquan_parser.py (new)
- apps/crawler/tests/fixtures/vnthuquan_listing_page.html (new)
- apps/crawler/tests/test_vnthuquan_parser.py (new)
