"""Tests for parser.py — Stories 3.1 and 3.2.

Covers: scan_raw_files, build_url_index, select_text, map_category,
classify_copyright, extract_metadata, parse_source (idempotency, UTF-8, NFR6).
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from bs4 import BeautifulSoup

from models import CrawlerConfig, ScriptureMetadata, SourceConfig
from parser import (
    build_url_index,
    classify_copyright,
    extract_metadata,
    map_category,
    parse_source,
    scan_raw_files,
    select_text,
)

# ---------------------------------------------------------------------------
# HTML fixtures for testing
# ---------------------------------------------------------------------------

THUVIENHOASEN_HTML = """\
<!DOCTYPE html>
<html>
<head>
  <link rel="canonical" href="https://thuvienhoasen.org/a1234/tam-kinh" />
</head>
<body>
  <nav class="breadcrumb">
    <ol>
      <li>Trang chủ</li>
      <li>Đại Thừa</li>
      <li>Bát Nhã</li>
    </ol>
  </nav>
  <h1 class="entry-title">Tâm Kinh</h1>
  <div class="content">Nội dung kinh...</div>
</body>
</html>
"""

BUDSAS_HTML = """\
<!DOCTYPE html>
<html>
<body>
  <h1>Nikaya Section</h1>
  <h2>Kinh Trường Bộ</h2>
  <p>Content...</p>
</body>
</html>
"""

DHAMMADOWNLOAD_HTML = """\
<!DOCTYPE html>
<html>
<head><title>Tâm Bình Yên | Dhamma Download</title></head>
<body>
  <p>Content</p>
</body>
</html>
"""

CHUABAPHUNG_HTML = """\
<!DOCTYPE html>
<html>
<body>
  <nav class="breadcrumb">
    <ol>
      <li>Trang chủ</li>
      <li>Thiền</li>
      <li>Nhập Môn Thiền</li>
    </ol>
  </nav>
  <h1 class="entry-title">Thiền Định Căn Bản</h1>
  <div class="content">Nội dung...</div>
</body>
</html>
"""


# ---------------------------------------------------------------------------
# Source config fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def thuvienhoasen_source() -> SourceConfig:
    return SourceConfig(
        name="thuvienhoasen",
        seed_url="https://thuvienhoasen.org/p16a0/kinh-dien",
        rate_limit_seconds=1.5,
        output_folder="thuvienhoasen",
        css_selectors={
            "catalog_links": "a.list-item-title",
            "file_links": "a.download-link",
            "title": "h1.entry-title",
            "category": ".breadcrumb li:nth-child(2)",
            "subcategory": ".breadcrumb li:last-child",
        },
    )


@pytest.fixture
def budsas_source() -> SourceConfig:
    return SourceConfig(
        name="budsas",
        seed_url="https://www.budsas.org/uni/u-kinh-nikaya/nikaya00.htm",
        rate_limit_seconds=1.5,
        output_folder="budsas",
        css_selectors={
            "catalog_links": "a[href*='.htm']",
            "file_links": "",
            "title": "h2, h3",
            "category": "",
            "subcategory": "h1",
        },
    )


@pytest.fixture
def chuabaphung_source() -> SourceConfig:
    return SourceConfig(
        name="chuabaphung",
        seed_url="https://chuabaphung.vn/category/kinh-dien/",
        rate_limit_seconds=2.0,
        output_folder="chuabaphung",
        pagination_selector="a.next.page-numbers",
        css_selectors={
            "catalog_links": "h2.entry-title a",
            "file_links": "",
            "title": "h1.entry-title",
            "category": ".breadcrumb li:nth-child(2)",
            "subcategory": ".breadcrumb li:last-child",
        },
    )


@pytest.fixture
def dhammadownload_source() -> SourceConfig:
    return SourceConfig(
        name="dhammadownload",
        seed_url="https://dhammadownload.com/Canon-text-List.htm",
        rate_limit_seconds=1.5,
        output_folder="dhammadownload",
        file_type_hints=["html", "pdf"],
        css_selectors={
            "catalog_links": "table a[href]",
            "file_links": "a[href$='.pdf'], a[href$='.html']",
            "title": "h1, h2, title",
            "category": "",
            "subcategory": "",
        },
    )


@pytest.fixture
def mock_logger() -> MagicMock:
    return MagicMock(spec=logging.Logger)


# ---------------------------------------------------------------------------
# scan_raw_files
# ---------------------------------------------------------------------------

def test_scan_raw_files_finds_html_pdf_epub(tmp_path: Path) -> None:
    (tmp_path / "a.html").touch()
    (tmp_path / "b.pdf").touch()
    (tmp_path / "c.epub").touch()
    sub = tmp_path / "sub"
    sub.mkdir()
    (sub / "d.htm").touch()

    result = scan_raw_files(tmp_path)
    names = [f.name for f in result]
    assert "a.html" in names
    assert "b.pdf" in names
    assert "c.epub" in names
    assert "d.htm" in names


def test_scan_raw_files_skips_meta_json(tmp_path: Path) -> None:
    (tmp_path / "a.html").touch()
    (tmp_path / "a.html.meta.json").touch()

    result = scan_raw_files(tmp_path)
    assert len(result) == 1
    assert result[0].name == "a.html"


def test_scan_raw_files_sorted(tmp_path: Path) -> None:
    (tmp_path / "c.html").touch()
    (tmp_path / "a.html").touch()
    (tmp_path / "b.html").touch()

    result = scan_raw_files(tmp_path)
    assert [f.name for f in result] == ["a.html", "b.html", "c.html"]


def test_scan_raw_files_returns_empty_for_missing_dir() -> None:
    result = scan_raw_files(Path("/nonexistent/path/that/does/not/exist"))
    assert result == []


# ---------------------------------------------------------------------------
# build_url_index
# ---------------------------------------------------------------------------

def test_build_url_index_returns_empty_if_state_absent(tmp_path: Path) -> None:
    result = build_url_index(tmp_path / "nonexistent.json")
    assert result == {}


def test_build_url_index_maps_basename_to_url(tmp_path: Path) -> None:
    state = {
        "https://thuvienhoasen.org/a1234/tam-kinh.html": "downloaded",
        "https://thuvienhoasen.org/a1234/other.html": "error",
        "https://thuvienhoasen.org/a1234/third.html": "downloaded",
    }
    state_file = tmp_path / "crawl-state.json"
    state_file.write_text(json.dumps(state), encoding="utf-8")

    result = build_url_index(state_file)

    assert "tam-kinh.html" in result
    assert result["tam-kinh.html"] == "https://thuvienhoasen.org/a1234/tam-kinh.html"
    assert "third.html" in result
    assert "other.html" not in result  # only "downloaded" entries are indexed


# ---------------------------------------------------------------------------
# select_text
# ---------------------------------------------------------------------------

def test_select_text_returns_text_on_match() -> None:
    soup = BeautifulSoup("<h1>Title</h1>", "html.parser")
    assert select_text(soup, "h1") == "Title"


def test_select_text_returns_none_on_no_match() -> None:
    soup = BeautifulSoup("<p>Content</p>", "html.parser")
    assert select_text(soup, "h1") is None


def test_select_text_returns_none_on_empty_selector() -> None:
    soup = BeautifulSoup("<h1>Title</h1>", "html.parser")
    assert select_text(soup, "") is None


def test_select_text_handles_compound_selector() -> None:
    soup = BeautifulSoup("<h3>Sub</h3>", "html.parser")
    # "h2, h3" compound selector finds h3 when h2 absent
    assert select_text(soup, "h2, h3") == "Sub"


# ---------------------------------------------------------------------------
# map_category
# ---------------------------------------------------------------------------

def test_map_category_nikaya() -> None:
    assert map_category("nikaya") == "Nikaya"
    assert map_category("Nikaya") == "Nikaya"
    assert map_category("kinh nikaya") == "Nikaya"


def test_map_category_dai_thua() -> None:
    assert map_category("đại thừa") == "Đại Thừa"
    assert map_category("Đại Thừa") == "Đại Thừa"
    assert map_category("dai thua") == "Đại Thừa"


def test_map_category_mat_tong() -> None:
    assert map_category("mật tông") == "Mật Tông"
    assert map_category("mat tong") == "Mật Tông"


def test_map_category_thien() -> None:
    assert map_category("thiền") == "Thiền"
    assert map_category("thien") == "Thiền"


def test_map_category_tinh_do() -> None:
    assert map_category("tịnh độ") == "Tịnh Độ"
    assert map_category("tinh do") == "Tịnh Độ"


def test_map_category_unknown_defaults_to_nikaya() -> None:
    assert map_category("unknown value") == "Nikaya"
    assert map_category("") == "Nikaya"
    assert map_category("   ") == "Nikaya"


# ---------------------------------------------------------------------------
# classify_copyright
# ---------------------------------------------------------------------------

def test_classify_copyright_budsas_nikaya() -> None:
    assert classify_copyright("budsas", "Nikaya") == "public_domain"


def test_classify_copyright_budsas_dai_thua() -> None:
    assert classify_copyright("budsas", "Đại Thừa") == "unknown"


def test_classify_copyright_chuabaphung_nikaya() -> None:
    assert classify_copyright("chuabaphung", "Nikaya") == "unknown"


def test_classify_copyright_thuvienhoasen_nikaya() -> None:
    assert classify_copyright("thuvienhoasen", "Nikaya") == "unknown"


# ---------------------------------------------------------------------------
# extract_metadata — thuvienhoasen HTML (Story 3.1)
# ---------------------------------------------------------------------------

def test_extract_metadata_thuvienhoasen_html(
    tmp_path: Path, thuvienhoasen_source: SourceConfig, mock_logger: MagicMock
) -> None:
    html_file = tmp_path / "tam-kinh.html"
    html_file.write_text(THUVIENHOASEN_HTML, encoding="utf-8")

    result = extract_metadata(
        html_file,
        "https://thuvienhoasen.org/a1234/tam-kinh",
        thuvienhoasen_source,
        mock_logger,
    )

    assert result is not None
    assert result.title == "Tâm Kinh"
    assert result.category == "Đại Thừa"
    assert result.subcategory == "Bát Nhã"
    assert result.source == "thuvienhoasen"
    assert result.file_format == "html"
    assert result.copyright_status == "unknown"
    assert result.title_pali is None
    assert result.title_sanskrit is None
    assert result.author_translator is None
    assert result.created_at.tzinfo is not None  # UTC-aware


def test_extract_metadata_malformed_html_returns_none(
    tmp_path: Path, thuvienhoasen_source: SourceConfig, mock_logger: MagicMock
) -> None:
    """Force an internal exception — verifies no exception propagates to caller."""
    html_file = tmp_path / "garbage.html"
    html_file.write_bytes(b"\xff\xfe garbage <unclosed")

    with patch("parser.BeautifulSoup", side_effect=Exception("forced parse error")):
        result = extract_metadata(
            html_file, "https://example.com", thuvienhoasen_source, mock_logger
        )

    assert result is None
    mock_logger.error.assert_called_once()


# ---------------------------------------------------------------------------
# extract_metadata — budsas (Story 3.2)
# ---------------------------------------------------------------------------

def test_extract_metadata_budsas_html(
    tmp_path: Path, budsas_source: SourceConfig, mock_logger: MagicMock
) -> None:
    html_file = tmp_path / "truong-bo.html"
    html_file.write_text(BUDSAS_HTML, encoding="utf-8")

    result = extract_metadata(
        html_file,
        "https://www.budsas.org/uni/u-kinh-nikaya/truong-bo.html",
        budsas_source,
        mock_logger,
    )

    assert result is not None
    assert result.title == "Kinh Trường Bộ"  # from h2 via "h2, h3" selector
    assert result.category == "Nikaya"  # empty category selector → default
    assert result.subcategory == "Nikaya Section"  # from h1 selector
    assert result.copyright_status == "public_domain"  # budsas + Nikaya


# ---------------------------------------------------------------------------
# extract_metadata — dhammadownload (Story 3.2)
# ---------------------------------------------------------------------------

def test_extract_metadata_dhammadownload_pdf(
    tmp_path: Path, dhammadownload_source: SourceConfig, mock_logger: MagicMock
) -> None:
    pdf_file = tmp_path / "truong-bo-kinh-01.pdf"
    pdf_file.write_bytes(b"%PDF-1.4 fake content")

    result = extract_metadata(
        pdf_file,
        "https://dhammadownload.com/truong-bo-kinh-01.pdf",
        dhammadownload_source,
        mock_logger,
    )

    assert result is not None
    assert result.title == "Truong Bo Kinh 01"  # stem.replace("-", " ").title()
    assert result.file_format == "pdf"
    assert result.category == "Nikaya"  # empty category selector → default


def test_extract_metadata_chuabaphung_html(
    tmp_path: Path, chuabaphung_source: SourceConfig, mock_logger: MagicMock
) -> None:
    """chuabaphung uses same breadcrumb selectors as thuvienhoasen; copyright is unknown."""
    html_file = tmp_path / "thien-dinh.html"
    html_file.write_text(CHUABAPHUNG_HTML, encoding="utf-8")

    result = extract_metadata(
        html_file,
        "https://chuabaphung.vn/thien-dinh-can-ban/",
        chuabaphung_source,
        mock_logger,
    )

    assert result is not None
    assert result.title == "Thiền Định Căn Bản"
    assert result.category == "Thiền"
    assert result.subcategory == "Nhập Môn Thiền"
    assert result.source == "chuabaphung"
    assert result.copyright_status == "unknown"
    assert result.file_format == "html"


def test_extract_metadata_missing_category_logs_warning(
    tmp_path: Path, thuvienhoasen_source: SourceConfig, mock_logger: MagicMock
) -> None:
    """Non-empty category selector that finds no element must log a warning and default to Nikaya."""
    # HTML has no breadcrumb → category selector returns None
    html_file = tmp_path / "no-breadcrumb.html"
    html_file.write_text(
        "<html><body><h1 class='entry-title'>Kinh Test</h1></body></html>",
        encoding="utf-8",
    )

    result = extract_metadata(
        html_file,
        "https://thuvienhoasen.org/test",
        thuvienhoasen_source,
        mock_logger,
    )

    assert result is not None
    assert result.category == "Nikaya"  # defaulted
    warning_calls = [str(c) for c in mock_logger.warning.call_args_list]
    assert any("No category" in c for c in warning_calls)


def test_extract_metadata_dhammadownload_html_strips_pipe(
    tmp_path: Path, dhammadownload_source: SourceConfig, mock_logger: MagicMock
) -> None:
    html_file = tmp_path / "tam-binh-yen.html"
    html_file.write_text(DHAMMADOWNLOAD_HTML, encoding="utf-8")

    result = extract_metadata(
        html_file,
        "https://dhammadownload.com/tam-binh-yen.html",
        dhammadownload_source,
        mock_logger,
    )

    assert result is not None
    assert result.title == "Tâm Bình Yên"  # pipe + site name stripped


# ---------------------------------------------------------------------------
# parse_source — idempotency and UTF-8 roundtrip (Story 3.1 AC1, AC3)
# ---------------------------------------------------------------------------

def test_parse_source_writes_meta_json(
    tmp_path: Path, thuvienhoasen_source: SourceConfig, mock_logger: MagicMock
) -> None:
    source_dir = tmp_path / "raw" / "thuvienhoasen"
    source_dir.mkdir(parents=True)
    html_file = source_dir / "tam-kinh.html"
    html_file.write_text(THUVIENHOASEN_HTML, encoding="utf-8")

    cfg = CrawlerConfig(sources=[thuvienhoasen_source], output_dir=str(tmp_path))
    parse_source(thuvienhoasen_source, cfg, mock_logger)

    meta_path = tmp_path / "meta" / "thuvienhoasen" / "tam-kinh.json"
    assert meta_path.exists()
    data = json.loads(meta_path.read_text(encoding="utf-8"))
    assert data["title"] == "Tâm Kinh"


def test_parse_source_idempotent(
    tmp_path: Path, thuvienhoasen_source: SourceConfig, mock_logger: MagicMock
) -> None:
    """Second run must skip existing metadata JSON without modifying it."""
    source_dir = tmp_path / "raw" / "thuvienhoasen"
    source_dir.mkdir(parents=True)
    html_file = source_dir / "tam-kinh.html"
    html_file.write_text(THUVIENHOASEN_HTML, encoding="utf-8")

    cfg = CrawlerConfig(sources=[thuvienhoasen_source], output_dir=str(tmp_path))

    parse_source(thuvienhoasen_source, cfg, mock_logger)
    meta_path = tmp_path / "meta" / "thuvienhoasen" / "tam-kinh.json"
    mtime1 = meta_path.stat().st_mtime

    parse_source(thuvienhoasen_source, cfg, mock_logger)
    mtime2 = meta_path.stat().st_mtime

    assert mtime1 == mtime2  # file not modified on second run


def test_parse_source_utf8_roundtrip(
    tmp_path: Path, thuvienhoasen_source: SourceConfig, mock_logger: MagicMock
) -> None:
    """Vietnamese diacritics must be preserved through write → read cycle."""
    source_dir = tmp_path / "raw" / "thuvienhoasen"
    source_dir.mkdir(parents=True)
    html_file = source_dir / "tam-kinh.html"
    html_file.write_text(THUVIENHOASEN_HTML, encoding="utf-8")

    cfg = CrawlerConfig(sources=[thuvienhoasen_source], output_dir=str(tmp_path))
    parse_source(thuvienhoasen_source, cfg, mock_logger)

    meta_path = tmp_path / "meta" / "thuvienhoasen" / "tam-kinh.json"
    raw = json.loads(meta_path.read_text(encoding="utf-8"))
    assert raw["title"] == "Tâm Kinh"
    assert raw["category"] == "Đại Thừa"
    assert raw["subcategory"] == "Bát Nhã"


# ---------------------------------------------------------------------------
# parse_source — NFR6 coverage warning (Story 3.2)
# ---------------------------------------------------------------------------

def test_nfr6_coverage_warning_logged(
    tmp_path: Path, thuvienhoasen_source: SourceConfig
) -> None:
    """Warning logged when < 90% of files are successfully parsed."""
    mock_logger = MagicMock()

    source_dir = tmp_path / "raw" / "thuvienhoasen"
    source_dir.mkdir(parents=True)
    for i in range(3):
        (source_dir / f"file{i}.html").write_text("<html></html>", encoding="utf-8")

    cfg = CrawlerConfig(sources=[thuvienhoasen_source], output_dir=str(tmp_path))

    valid_meta = ScriptureMetadata(
        id="thuvienhoasen__test",
        title="Test",
        category="Nikaya",
        subcategory="",
        source="thuvienhoasen",
        url="https://thuvienhoasen.org",
        file_path=str(source_dir / "file0.html"),
        file_format="html",
        copyright_status="unknown",
        created_at=datetime.now(timezone.utc),
    )

    # 1 success, 2 failures → 33% coverage → warning expected
    with patch("parser.extract_metadata", side_effect=[valid_meta, None, None]):
        parse_source(thuvienhoasen_source, cfg, mock_logger)

    warning_calls = [str(c) for c in mock_logger.warning.call_args_list]
    assert any("Coverage" in c and "below 90%" in c for c in warning_calls)
