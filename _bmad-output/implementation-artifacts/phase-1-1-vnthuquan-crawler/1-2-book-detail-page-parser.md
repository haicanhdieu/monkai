# Story 1.2: Book Detail Page Parser

Status: review

## Story

As a developer,
I want to parse VNThuQuan book detail pages to extract chapter lists and `tuaid` values,
So that I know exactly which chapters to download for each book.

## Acceptance Criteria

1. **Given** a saved HTML fixture of a multi-chapter book detail page
   **When** `parse_book_detail(html)` is called
   **Then** it returns a `BookDetail` with: title, category_label, tuaid (int), chapter_list (list of (chuongid, chapter_title) tuples), is_single_chapter=False
   **And** tuaid is extracted from `onClick="noidung1('tuaid={id}&chuongid={n}')"` patterns
   **And** chapter titles are extracted from `<a class="normal8">` elements

2. **Given** a saved HTML fixture of a single-chapter book detail page
   **When** `parse_book_detail(html)` is called
   **Then** it returns a `BookDetail` with: tuaid extracted from `noidung1('tuaid={id}&chuongid=')`, chapter_list containing one entry with chuongid="" or 0, is_single_chapter=True

3. **Given** a book detail page with no chapter list and no auto-load script
   **When** `parse_book_detail(html)` is called
   **Then** it returns `None` (unparseable book)

## Tasks / Subtasks

- [x] Create `BookDetail` dataclass in `vnthuquan_parser.py` (AC: #1)
  - [x] Fields: title (str), category_label (str), tuaid (int), chapter_list (list[tuple[int|str, str]]), cover_image_url (str|None), is_single_chapter (bool)
- [x] Create HTML fixture `tests/fixtures/vnthuquan_book_detail.html` (AC: #1)
  - [x] Multi-chapter book with chapter list in `div#muluben_to`
  - [x] Multiple `<li class="menutruyen">` items with `onClick="noidung1('tuaid=NNNN&chuongid=N')"` and `<a class="normal8">Chapter Title</a>`
  - [x] Book title in `h3.mucluc > a > b`
  - [x] Category label in sidebar `h3 > a`
- [x] Create HTML fixture `tests/fixtures/vnthuquan_book_detail_single.html` (AC: #2)
  - [x] Single-chapter book with auto-load script containing `noidung1('tuaid=NNNN&chuongid=')`
  - [x] No chapter list / ToC section
- [x] Implement `parse_book_detail(html: str) -> BookDetail | None` (AC: #1, #2, #3)
  - [x] Extract title from `h3.mucluc > a > b` or fallback selectors
  - [x] Extract category_label from first `h3 > a` in sidebar
  - [x] Multi-chapter path: find all `onClick="noidung1('tuaid=...')"` patterns in `div#muluben_to`
    - [x] Parse tuaid (int) and chuongid (int) from the pattern
    - [x] Extract chapter titles from `<a class="normal8">` within same `<li>`
    - [x] Set is_single_chapter=False
  - [x] Single-chapter path: if no chapter list found, search for auto-load script `noidung1('tuaid={id}&chuongid=')`
    - [x] Parse tuaid from the pattern
    - [x] Create chapter_list with one entry: (0 or "", book_title)
    - [x] Set is_single_chapter=True
  - [x] If neither pattern found, return None
- [x] Write tests in `tests/test_vnthuquan_parser.py` (AC: #1, #2, #3)
  - [x] Test multi-chapter: verify title, category_label, tuaid, chapter_list length, chapter titles, is_single_chapter=False
  - [x] Test single-chapter: verify tuaid extraction, chapter_list has 1 entry, is_single_chapter=True
  - [x] Test unparseable page returns None
  - [x] Test Vietnamese diacritics in chapter titles are preserved

## Dev Notes

### Architecture Compliance

- **File location:** Add to existing `apps/crawler/vnthuquan_parser.py` created in story 1.1
- **No modifications** to `models.py` or any existing file
- **Pure functions only** — no I/O, no HTTP calls in the parser
- **Dataclass** for `BookDetail` (internal intermediate type, not shared model)
- **CSS selectors hardcoded** in parser — not from config.yaml

### Previous Story (1.1) Context

- `vnthuquan_parser.py` already exists with `BookListingEntry` dataclass and `parse_listing_page()`, `extract_last_page_number()` functions
- `tests/test_vnthuquan_parser.py` already exists — add new test functions to it
- `tests/fixtures/` directory already exists

### CSS Selectors Reference (from site analysis)

```
Book Detail Page (truyen.aspx?tid={opaque_id}):
  Title:          h3.mucluc > a > b
  Category:       h3 > a (first h3 in left sidebar)
  ToC container:  div#muluben_to
  Chapter items:  li.menutruyen (each chapter)
  Chapter link:   onClick="noidung1('tuaid={id}&chuongid={n}')"
  Chapter title:  a.normal8 (within each li.menutruyen)
  Single-chapter: script containing noidung1('tuaid={id}&chuongid=')
  Content area:   div#noidung > div#khungchinh
```

### tuaid Extraction Pattern

The `tuaid` value is the book's internal content ID, used for all chapter AJAX requests. It appears in two contexts:

1. **Multi-chapter:** Inside `onClick` attributes on chapter list items:
   ```
   onClick="noidung1('tuaid=33201&chuongid=1')"
   ```
   Extract `tuaid` as int from the first occurrence. All chapters share the same `tuaid`.

2. **Single-chapter:** Inside an auto-load script tag:
   ```javascript
   noidung1('tuaid=33201&chuongid=')
   ```
   Note: `chuongid=` is empty (no chapter number).

Use regex: `noidung1\('tuaid=(\d+)&chuongid=(\d*)'\)` to capture both tuaid and optional chuongid.

### chapter_list Format

- Multi-chapter: `[(1, "Lời Giới Thiệu"), (2, "Chương 1: ..."), ...]` — chuongid as int, title as str
- Single-chapter: `[(0, "Book Title")]` — chuongid=0, title=book title (since there's no separate chapter name)

### Testing Standards

- Add tests to existing `tests/test_vnthuquan_parser.py`
- Load fixtures with `Path(__file__).parent / "fixtures" / "filename.html"`
- Run: `cd apps/crawler && uv run pytest tests/test_vnthuquan_parser.py -v`

### Project Structure Notes

- New files this story creates:
  - `apps/crawler/tests/fixtures/vnthuquan_book_detail.html`
  - `apps/crawler/tests/fixtures/vnthuquan_book_detail_single.html`
- Files modified:
  - `apps/crawler/vnthuquan_parser.py` (add `BookDetail` dataclass + `parse_book_detail()`)
  - `apps/crawler/tests/test_vnthuquan_parser.py` (add detail parser tests)

### References

- [Source: _bmad-output/planning-artifacts/phase-1-1-vnthuquan-crawler/epics-vnthuquan-crawler.md#Story 1.2]
- [Source: _bmad-output/planning-artifacts/phase-1-1-vnthuquan-crawler/architecture-vnthuquan-crawler.md#Implementation Patterns]
- [Source: _bmad-output/planning-artifacts/phase-1-1-vnthuquan-crawler/prd-vnthuquan-crawler.md#Site Structure]
- [Source: _bmad-output/planning-artifacts/phase-1-1-vnthuquan-crawler/architecture-vnthuquan-crawler.md#Enforcement Guidelines]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- Added `BookDetail` dataclass to `vnthuquan_parser.py` with all required fields
- Implemented `parse_book_detail()`: multi-chapter path uses `div#muluben_to > li.menutruyen` with `noidung1()` regex; single-chapter path searches entire HTML for `noidung1('tuaid=N&chuongid=')` pattern; returns None when neither found
- Used compiled regex `_NOIDUNG_RE = re.compile(r"noidung1\('tuaid=(\d+)&chuongid=(\d*)'\)")` for both paths
- Single-chapter entry stored as `(0, book_title)` per spec
- Multi-chapter fixture: 4 chapters with Vietnamese diacritics, tuaid=33201; single-chapter fixture: tuaid=99999
- 17 tests pass (10 from 1.1 + 7 new for 1.2)

### File List

- apps/crawler/vnthuquan_parser.py (modified — added BookDetail, parse_book_detail)
- apps/crawler/tests/fixtures/vnthuquan_book_detail.html (new)
- apps/crawler/tests/fixtures/vnthuquan_book_detail_single.html (new)
- apps/crawler/tests/test_vnthuquan_parser.py (modified — added 7 tests)
