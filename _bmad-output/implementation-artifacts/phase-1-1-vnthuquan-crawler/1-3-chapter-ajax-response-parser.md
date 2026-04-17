# Story 1.3: Chapter AJAX Response Parser

Status: review

## Story

As a developer,
I want to parse VNThuQuan's custom-delimited AJAX responses to extract chapter content and cover images,
So that I can reliably obtain the actual text content of each chapter.

## Acceptance Criteria

1. **Given** a saved fixture of a normal AJAX chapter response with `--!!tach_noi_dung!!--` delimiters
   **When** `parse_chapter_response(raw)` is called
   **Then** it returns a `ChapterParseResult` with: content_html from Part 2 (raw HTML preserved, no entity decoding), cover_image_url extracted from Part 0 CSS `background-image:url(...)` if present

2. **Given** a saved fixture of an AJAX response with empty Part 2 content
   **When** `parse_chapter_response(raw)` is called
   **Then** it returns a `ChapterParseResult` with content_html=None and cover_image_url if available

3. **Given** a malformed response with fewer than 3 delimiter-separated parts
   **When** `parse_chapter_response(raw)` is called
   **Then** it returns `None`

4. **Given** HTML entities like `&aacute;` in the chapter content
   **When** `parse_chapter_response(raw)` is called
   **Then** entities are preserved as-is in content_html (no decoding)

## Tasks / Subtasks

- [x] Create `ChapterParseResult` dataclass in `vnthuquan_parser.py` (AC: #1)
  - [x] Fields: content_html (str|None), cover_image_url (str|None)
- [x] Define `DELIMITER = "--!!tach_noi_dung!!--"` constant in `vnthuquan_parser.py` (AC: #1)
- [x] Create fixture `tests/fixtures/vnthuquan_chapter_response.txt` (AC: #1, #4)
  - [x] Full AJAX response with 4 delimiter-separated parts (Part 0, Part 1, Part 2, Part 3)
  - [x] Part 0: HTML shell with CSS `background-image:url('http://example.com/cover.jpg')` for cover image
  - [x] Part 1: Title + Author metadata text (e.g. "Chuyến Du Hành Ngược Thời Gian\n nhiều tác giả")
  - [x] Part 2: Chapter content HTML with Vietnamese diacritics and HTML entities like `&aacute;`
  - [x] Part 3: Navigation text (e.g. "Lời Giới Thiệu\n Tiến >>")
- [x] Create fixture `tests/fixtures/vnthuquan_chapter_response_empty.txt` (AC: #2)
  - [x] AJAX response with empty Part 2 (just whitespace or empty string between delimiters)
  - [x] Part 0 may still have cover image URL
- [x] Implement `_extract_cover_image(part0_html: str) -> str | None` (AC: #1)
  - [x] Use regex: `background-image:\s*url\(['"]?([^'")\s]+)['"]?\)`
  - [x] Return the URL string or None if no match
- [x] Implement `parse_chapter_response(raw: str) -> ChapterParseResult | None` (AC: #1, #2, #3, #4)
  - [x] Split raw string on `DELIMITER`
  - [x] If fewer than 3 parts, return None
  - [x] Extract cover_image_url from parts[0] via `_extract_cover_image()`
  - [x] Extract content_html from parts[2]: strip whitespace, set to None if empty
  - [x] Do NOT decode HTML entities — preserve `&aacute;` etc. as-is (FR12, NFR9)
  - [x] Do NOT use BeautifulSoup on the content (it would decode entities)
- [x] Write tests in `tests/test_vnthuquan_parser.py` (AC: #1, #2, #3, #4)
  - [x] Test normal response: verify content_html contains expected text, cover_image_url extracted
  - [x] Test empty Part 2: verify content_html=None, cover_image_url still extracted
  - [x] Test malformed response (fewer than 3 parts): verify returns None
  - [x] Test HTML entity preservation: verify `&aacute;` remains undecoded in content_html
  - [x] Test response with no cover image in Part 0: verify cover_image_url=None
  - [x] Test Vietnamese diacritics preserved in content_html

## Dev Notes

### Architecture Compliance

- **File location:** Add to existing `apps/crawler/vnthuquan_parser.py` created in stories 1.1-1.2
- **No modifications** to `models.py` or any existing file
- **Pure functions only** — no I/O, no HTTP calls
- **Dataclass** for `ChapterParseResult` (internal intermediate type)
- **Critical: Do NOT use BeautifulSoup to parse chapter content** — BS4 decodes HTML entities, violating FR12/NFR9. Use string operations only for content extraction.

### Previous Stories Context

- Story 1.1: Created `vnthuquan_parser.py` with `BookListingEntry`, `parse_listing_page()`, `extract_last_page_number()`
- Story 1.2: Added `BookDetail`, `parse_book_detail()` to the same file
- This story completes the parser module with the final parsing function

### AJAX Response Format

The VNThuQuan chapter API returns a custom-delimited response (NOT JSON):

```
POST http://vietnamthuquan.eu/truyen/chuonghoi_moi.aspx
Body: tuaid=33201&chuongid=1
Cookie: AspxAutoDetectCookieSupport=1

Response format:
{Part 0: HTML shell with CSS/layout}--!!tach_noi_dung!!--{Part 1: "Title\n Author"}--!!tach_noi_dung!!--{Part 2: chapter HTML content}--!!tach_noi_dung!!--{Part 3: "ChapterTitle\n Nav"}
```

- **Part 0:** HTML shell — contains CSS including `background-image:url(...)` with cover image URL
- **Part 1:** Title + author metadata text
- **Part 2:** The actual chapter content HTML (PRIMARY DATA to store)
- **Part 3:** Navigation + chapter title

### Cover Image Extraction

Cover image URL is in Part 0's CSS, in a `background-image` property:
```css
style="background-image:url('http://vietnamthuquan.eu/truyen/images/covers/12345.jpg')"
```

Regex pattern: `background-image:\s*url\(['"]?([^'")\s]+)['"]?\)`

**Important:** Cover image extraction only needs to succeed on the FIRST chapter response per book. The adapter (story 2.3) will only use `cover_image_url` from the first chapter's parse result.

### HTML Entity Preservation (Critical)

FR12 and NFR9 mandate: **Content HTML stored as-is, no entity decoding.**

- Do NOT pass Part 2 through BeautifulSoup (it auto-decodes `&aacute;` to `á`)
- Do NOT call `html.unescape()` or any entity decoder
- Use plain string `.split()` and `.strip()` only
- The content_html field should contain the raw HTML exactly as received from the server

### Architecture Reference: ChapterParseResult

From the architecture document:
```python
DELIMITER = "--!!tach_noi_dung!!--"

@dataclass
class ChapterParseResult:
    """Parsed AJAX chapter response with all parts."""
    cover_image_url: str | None  # from Part 0 CSS background-image
    content_html: str | None     # from Part 2
```

### Testing Standards

- Add tests to existing `tests/test_vnthuquan_parser.py`
- Fixture files are plain text (`.txt`), not HTML
- Load fixtures with `Path(__file__).parent / "fixtures" / "filename.txt"`
- Run: `cd apps/crawler && uv run pytest tests/test_vnthuquan_parser.py -v`

### Project Structure Notes

- New files this story creates:
  - `apps/crawler/tests/fixtures/vnthuquan_chapter_response.txt`
  - `apps/crawler/tests/fixtures/vnthuquan_chapter_response_empty.txt`
- Files modified:
  - `apps/crawler/vnthuquan_parser.py` (add `ChapterParseResult`, `DELIMITER`, `parse_chapter_response()`, `_extract_cover_image()`)
  - `apps/crawler/tests/test_vnthuquan_parser.py` (add chapter response parser tests)

### Epic 1 Completion

This is the final story in Epic 1. After this story, the complete parser module (`vnthuquan_parser.py`) will contain:
- 3 dataclasses: `BookListingEntry`, `BookDetail`, `ChapterParseResult`
- 4 public functions: `parse_listing_page()`, `extract_last_page_number()`, `parse_book_detail()`, `parse_chapter_response()`
- 1 private function: `_extract_cover_image()`
- 1 constant: `DELIMITER`
- 5 test fixtures in `tests/fixtures/`

The parser module is fully tested with saved fixtures and has zero I/O dependencies — ready for the adapter in Epic 2.

### References

- [Source: _bmad-output/planning-artifacts/phase-1-1-vnthuquan-crawler/epics-vnthuquan-crawler.md#Story 1.3]
- [Source: _bmad-output/planning-artifacts/phase-1-1-vnthuquan-crawler/architecture-vnthuquan-crawler.md#Format Patterns]
- [Source: _bmad-output/planning-artifacts/phase-1-1-vnthuquan-crawler/prd-vnthuquan-crawler.md#Chapter AJAX API]
- [Source: _bmad-output/planning-artifacts/phase-1-1-vnthuquan-crawler/architecture-vnthuquan-crawler.md#Enforcement Guidelines]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- Added `DELIMITER`, `ChapterParseResult`, `_extract_cover_image()`, `parse_chapter_response()` to `vnthuquan_parser.py`
- Used plain string `.split(DELIMITER)` + `.strip()` — no BeautifulSoup on Part 2, preserving HTML entities (FR12/NFR9)
- `_COVER_RE` regex extracts `background-image:url(...)` from Part 0; handles both quoted and unquoted URL forms
- content_html is None when Part 2 is whitespace-only; cover_image_url extracted regardless
- Returns None when fewer than 3 delimiter-separated parts
- 2 fixtures: normal (4 parts, cover image, &aacute; entities, Vietnamese diacritics) and empty Part 2
- 26 tests pass total (10 + 7 + 9 across stories 1.1–1.3); 6 pre-existing failures unchanged; lint clean

### File List

- apps/crawler/vnthuquan_parser.py (modified — added ChapterParseResult, DELIMITER, parse_chapter_response, _extract_cover_image)
- apps/crawler/tests/fixtures/vnthuquan_chapter_response.txt (new)
- apps/crawler/tests/fixtures/vnthuquan_chapter_response_empty.txt (new)
- apps/crawler/tests/test_vnthuquan_parser.py (modified — added 9 tests)
