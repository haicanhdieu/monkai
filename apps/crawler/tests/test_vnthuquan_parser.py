# tests/test_vnthuquan_parser.py
"""Tests for vnthuquan_parser.py — Stories 1.1, 1.2, 1.3."""
from pathlib import Path

from vnthuquan_parser import (
    BookDetail,
    BookListingEntry,
    ChapterParseResult,
    extract_last_page_number,
    parse_book_detail,
    parse_chapter_response,
    parse_listing_page,
    DELIMITER,
)

FIXTURES = Path(__file__).parent / "fixtures"


# ---------------------------------------------------------------------------
# Story 1.1: Listing Page Parser
# ---------------------------------------------------------------------------


def _load_listing_fixture() -> str:
    return (FIXTURES / "vnthuquan_listing_page.html").read_text(encoding="utf-8")


def test_parse_listing_page_returns_list():
    html = _load_listing_fixture()
    result = parse_listing_page(html)
    assert isinstance(result, list)
    assert len(result) > 0


def test_parse_listing_entry_fields():
    """Verify all fields are populated correctly on the first known entry."""
    html = _load_listing_fixture()
    entries = parse_listing_page(html)
    # First entry: bầu trời chung
    e = entries[0]
    assert isinstance(e, BookListingEntry)
    assert e.url == "truyen.aspx?tid=abc123"
    assert e.title == "bầu trời chung"
    assert e.author_name == "trần hà yên"
    assert e.author_id == 9936
    assert e.category_name == "Truyện ngắn"
    assert e.category_id == 1
    assert e.chapter_count == 1
    assert e.date == "9.4.2026"
    assert e.format_type == "Text"


def test_parse_listing_vietnamese_diacritics():
    """Vietnamese diacritics in titles and author names must be preserved."""
    html = _load_listing_fixture()
    entries = parse_listing_page(html)
    titles = [e.title for e in entries]
    authors = [e.author_name for e in entries if e.author_name]
    assert "bầu trời chung" in titles
    assert "trần hà yên" in authors
    assert "Đường xưa mây trắng" in titles


def test_parse_listing_all_format_types_returned():
    """All format types (Text, PDF, Epub, Audio) must be returned — no filtering."""
    html = _load_listing_fixture()
    entries = parse_listing_page(html)
    formats = {e.format_type for e in entries}
    assert "Text" in formats
    assert "PDF" in formats
    assert "Audio" in formats
    assert "Epub" in formats


def test_parse_listing_cover_image_extracted():
    """Cover image URL from col-xs-3 sibling img must be populated."""
    html = _load_listing_fixture()
    entries = parse_listing_page(html)
    first = next(e for e in entries if e.title == "bầu trời chung")
    assert first.cover_image_url == "http://vietnamthuquan.eu/userfiles/images/covers/bau-troi-chung.jpg"


def test_parse_listing_cover_image_none_when_missing():
    """Entry with no img in col-xs-3 should have cover_image_url=None."""
    html = _load_listing_fixture()
    entries = parse_listing_page(html)
    no_cover = next(e for e in entries if e.title == "Sách không tác giả")
    assert no_cover.cover_image_url is None


def test_parse_listing_tacgia_avatar_excluded():
    """Images from /tacgia/ path (author avatars) must be treated as no cover."""
    html = """<!DOCTYPE html><html><body>
    <div class="row">
      <div class="col-xs-3">
        <a href="truyen.aspx?tid=x1"><img class="img-rounded" src="http://vietnamthuquan.eu/userfiles/images/tacgia/Author.jpg"/></a>
      </div>
      <div class="col-xs-7">
        <span class='label-title label-time'>1.1.2026</span>
        <span class='label-title label-scan'>Text</span>
        <div class='truyen-title'><span class='viethoachu'><a href='truyen.aspx?tid=x1'>Test Book</a></span></div>
        <span class='label-title label-theloai'><a href='theloai.aspx?theloaiid=1'>Cat</a></span>
        <span class='totalchuong'>1 Chương</span>
      </div>
    </div>
    </body></html>"""
    entries = parse_listing_page(html)
    assert len(entries) == 1
    assert entries[0].cover_image_url is None


def test_parse_listing_missing_author_is_none():
    """Entry without author link should have author_name=None, author_id=None."""
    html = _load_listing_fixture()
    entries = parse_listing_page(html)
    no_author = [e for e in entries if e.title == "Sách không tác giả"]
    assert len(no_author) == 1
    assert no_author[0].author_name is None
    assert no_author[0].author_id is None


def test_parse_listing_malformed_entry_skipped():
    """Malformed entry (missing title link) is skipped; other entries still returned."""
    html = _load_listing_fixture()
    entries = parse_listing_page(html)
    titles = [e.title for e in entries]
    # The malformed row (no anchor in truyen-title) must NOT produce an entry
    # but valid entries must still be there
    assert "bầu trời chung" in titles
    assert "Kinh Pháp Hoa" in titles
    # No blank/None titles
    for e in entries:
        assert e.title


def test_parse_listing_no_exception_on_malformed():
    """parse_listing_page must never raise on malformed input."""
    parse_listing_page("<html><body><div class='col-xs-7'></div></body></html>")


def test_extract_last_page_number_returns_max():
    html = _load_listing_fixture()
    assert extract_last_page_number(html) == 7


def test_extract_last_page_number_single_page():
    html = "<html><body><a href='?tranghientai=1'>1</a></body></html>"
    assert extract_last_page_number(html) == 1


def test_extract_last_page_number_no_pagination():
    html = "<html><body><p>No pagination here</p></body></html>"
    assert extract_last_page_number(html) == 1


# ---------------------------------------------------------------------------
# Story 1.2: Book Detail Page Parser
# ---------------------------------------------------------------------------


def _load_detail_fixture(name: str = "vnthuquan_book_detail.html") -> str:
    return (FIXTURES / name).read_text(encoding="utf-8")


def test_parse_book_detail_multi_chapter_returns_book_detail():
    html = _load_detail_fixture()
    result = parse_book_detail(html)
    assert isinstance(result, BookDetail)


def test_parse_book_detail_multi_chapter_fields():
    html = _load_detail_fixture()
    result = parse_book_detail(html)
    assert result is not None
    assert result.title == "Đường Xưa Mây Trắng"
    assert result.category_label == "Phật Giáo"
    assert result.tuaid == 33201
    assert result.is_single_chapter is False


def test_parse_book_detail_multi_chapter_list():
    html = _load_detail_fixture()
    result = parse_book_detail(html)
    assert result is not None
    assert len(result.chapter_list) == 4
    assert result.chapter_list[0] == (1, "Lời Giới Thiệu")
    assert result.chapter_list[1] == (2, "Chương 1: Thái Tử Ra Đời")
    assert result.chapter_list[2] == (3, "Chương 2: Tuổi Thơ")
    assert result.chapter_list[3] == (4, "Chương 3: Xuất Gia")


def test_parse_book_detail_chapter_titles_vietnamese():
    html = _load_detail_fixture()
    result = parse_book_detail(html)
    assert result is not None
    titles = [ch[1] for ch in result.chapter_list]
    assert "Chương 2: Tuổi Thơ" in titles
    assert "Chương 3: Xuất Gia" in titles


def test_parse_book_detail_single_chapter():
    html = _load_detail_fixture("vnthuquan_book_detail_single.html")
    result = parse_book_detail(html)
    assert result is not None
    assert result.tuaid == 99999
    assert result.is_single_chapter is True
    assert len(result.chapter_list) == 1
    assert result.chapter_list[0][0] == 0


def test_parse_book_detail_single_chapter_title():
    html = _load_detail_fixture("vnthuquan_book_detail_single.html")
    result = parse_book_detail(html)
    assert result is not None
    assert result.title == "Tâm Kinh Bát Nhã"
    assert result.category_label == "Kinh Điển"


def test_parse_book_detail_unparseable_returns_none():
    html = "<html><body><p>No chapter info here</p></body></html>"
    result = parse_book_detail(html)
    assert result is None


# ---------------------------------------------------------------------------
# Story 1.3: Chapter AJAX Response Parser
# ---------------------------------------------------------------------------


def _load_chapter_fixture(name: str) -> str:
    return (FIXTURES / name).read_text(encoding="utf-8")


def test_parse_chapter_response_normal():
    raw = _load_chapter_fixture("vnthuquan_chapter_response.txt")
    result = parse_chapter_response(raw)
    assert isinstance(result, ChapterParseResult)
    assert result.content_html is not None
    assert result.content_html.strip() != ""


def test_parse_chapter_response_cover_image_extracted():
    raw = _load_chapter_fixture("vnthuquan_chapter_response.txt")
    result = parse_chapter_response(raw)
    assert result is not None
    assert result.cover_image_url == "http://example.com/images/covers/33201.jpg"


def test_parse_chapter_response_content_has_vietnamese():
    raw = _load_chapter_fixture("vnthuquan_chapter_response.txt")
    result = parse_chapter_response(raw)
    assert result is not None
    assert "Đường xưa mây trắng" in result.content_html


def test_parse_chapter_response_html_entities_preserved():
    """HTML entities must NOT be decoded — &aacute; stays as &aacute;."""
    raw = _load_chapter_fixture("vnthuquan_chapter_response.txt")
    result = parse_chapter_response(raw)
    assert result is not None
    # The fixture has &aacute; in the raw text — it must remain undecoded
    assert "&aacute;" in result.content_html


def test_parse_chapter_response_empty_part2():
    raw = _load_chapter_fixture("vnthuquan_chapter_response_empty.txt")
    result = parse_chapter_response(raw)
    assert result is not None
    assert result.content_html is None


def test_parse_chapter_response_empty_part2_cover_still_extracted():
    raw = _load_chapter_fixture("vnthuquan_chapter_response_empty.txt")
    result = parse_chapter_response(raw)
    assert result is not None
    assert result.cover_image_url == "http://example.com/images/covers/33201.jpg"


def test_parse_chapter_response_malformed_returns_none():
    raw = "only one part — no delimiters"
    result = parse_chapter_response(raw)
    assert result is None


def test_parse_chapter_response_two_parts_returns_none():
    raw = f"part0{DELIMITER}part1"
    result = parse_chapter_response(raw)
    assert result is None


def test_parse_chapter_response_all_empty_parts_returns_none():
    """Two delimiters with all-empty parts: both fields None → should return None."""
    raw = f"{DELIMITER}{DELIMITER}"
    result = parse_chapter_response(raw)
    assert result is None


def test_parse_chapter_response_exactly_three_parts():
    """Minimum-valid input: exactly 3 parts (2 delimiters) should return a result."""
    raw = f"<div style='background-image:url(http://x.com/cover.jpg)'></div>{DELIMITER}Title\nAuthor{DELIMITER}<p>Content</p>"
    result = parse_chapter_response(raw)
    assert result is not None
    assert result.content_html == "<p>Content</p>"
    assert result.cover_image_url == "http://x.com/cover.jpg"


def test_parse_chapter_response_no_cover_image():
    """Part 0 with no background-image CSS — cover_image_url should be None."""
    raw = f"<div>no image here</div>{DELIMITER}Title\nAuthor{DELIMITER}<p>Content here</p>{DELIMITER}Nav"
    result = parse_chapter_response(raw)
    assert result is not None
    assert result.cover_image_url is None
    assert result.content_html is not None
