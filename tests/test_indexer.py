"""Tests for indexer.py — Story 6.1.

Covers: scan_book_manifests, load_existing_index (BookIndexRecord),
manifest_to_book_record, build_index (idempotency, incremental, output path).
"""
from __future__ import annotations

import json
import logging
from pathlib import Path
from unittest.mock import MagicMock

import pytest

from models import BookIndexRecord, CrawlerConfig, SourceConfig
from indexer import (
    build_index,
    load_existing_index,
    manifest_to_book_record,
    scan_book_manifests,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def make_book_manifest(
    books_dir: Path,
    source: str,
    slug: str,
    book_title: str,
    category: str = "Nikaya",
    subcategory: str = "",
    author_translator: str | None = None,
    total_chapters: int = 5,
) -> Path:
    """Write a minimal book manifest JSON and return its path."""
    source_dir = books_dir / source
    source_dir.mkdir(parents=True, exist_ok=True)
    manifest = {
        "book_title": book_title,
        "book_slug": slug,
        "category": category,
        "subcategory": subcategory,
        "author_translator": author_translator,
        "cover_image_url": None,
        "source": source,
        "total_chapters": total_chapters,
        "chapters": [],
    }
    out_path = source_dir / f"{slug}.json"
    out_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    return out_path


@pytest.fixture
def mock_logger() -> MagicMock:
    return MagicMock(spec=logging.Logger)


def _make_cfg(tmp_path: Path) -> CrawlerConfig:
    return CrawlerConfig(
        sources=[
            SourceConfig(
                name="thuvienkinhphat",
                seed_url="https://thuvienkinhphat.net",
                rate_limit_seconds=1.5,
                output_folder="thuvienkinhphat",
                css_selectors={},
            )
        ],
        output_dir=str(tmp_path),
    )


# ---------------------------------------------------------------------------
# scan_book_manifests
# ---------------------------------------------------------------------------

def test_scan_book_manifests_finds_all_json(tmp_path: Path) -> None:
    books_dir = tmp_path / "books"
    make_book_manifest(books_dir, "thuvienkinhphat", "kinh-a", "Kinh A")
    make_book_manifest(books_dir, "thuvienkinhphat", "kinh-b", "Kinh B")
    make_book_manifest(books_dir, "thuvienkinhphat", "kinh-c", "Kinh C")

    result = scan_book_manifests(tmp_path)
    assert len(result) == 3


def test_scan_book_manifests_excludes_index_json(tmp_path: Path) -> None:
    books_dir = tmp_path / "books"
    make_book_manifest(books_dir, "thuvienkinhphat", "kinh-a", "Kinh A")
    # Place an index.json in books/
    (books_dir / "index.json").write_text("[]", encoding="utf-8")

    result = scan_book_manifests(tmp_path)
    assert len(result) == 1
    assert all(p.name != "index.json" for p in result)


def test_scan_book_manifests_returns_sorted(tmp_path: Path) -> None:
    books_dir = tmp_path / "books"
    make_book_manifest(books_dir, "thuvienkinhphat", "c-kinh", "C Kinh")
    make_book_manifest(books_dir, "thuvienkinhphat", "a-kinh", "A Kinh")
    make_book_manifest(books_dir, "thuvienkinhphat", "b-kinh", "B Kinh")

    result = scan_book_manifests(tmp_path)
    names = [p.stem for p in result]
    assert names == sorted(names)


def test_scan_book_manifests_returns_empty_if_books_missing(tmp_path: Path) -> None:
    result = scan_book_manifests(tmp_path)  # no books/ dir
    assert result == []


# ---------------------------------------------------------------------------
# load_existing_index
# ---------------------------------------------------------------------------

def test_load_existing_index_returns_empty_if_absent(
    tmp_path: Path, mock_logger: MagicMock
) -> None:
    result = load_existing_index(tmp_path / "nonexistent.json", mock_logger)
    assert result == {}


def test_load_existing_index_parses_valid_array(
    tmp_path: Path, mock_logger: MagicMock
) -> None:
    record = {
        "id": "kinh-phap-cu",
        "title": "Kinh Pháp Cú",
        "category": "Nikaya",
        "subcategory": "Tiểu Bộ",
        "source": "thuvienkinhphat",
        "author_translator": "Thích Minh Châu",
        "total_chapters": 26,
        "manifest_path": "data/books/thuvienkinhphat/kinh-phap-cu.json",
    }
    index_file = tmp_path / "index.json"
    index_file.write_text(json.dumps([record]), encoding="utf-8")

    result = load_existing_index(index_file, mock_logger)
    assert "kinh-phap-cu" in result
    assert isinstance(result["kinh-phap-cu"], BookIndexRecord)
    assert result["kinh-phap-cu"].title == "Kinh Pháp Cú"


def test_load_existing_index_skips_malformed_entries(
    tmp_path: Path, mock_logger: MagicMock
) -> None:
    valid_record = {
        "id": "kinh-a",
        "title": "Kinh A",
        "category": "Nikaya",
        "subcategory": "",
        "source": "thuvienkinhphat",
        "author_translator": None,
        "total_chapters": 3,
        "manifest_path": "data/books/thuvienkinhphat/kinh-a.json",
    }
    bad_record = {"id": "bad", "missing": "required fields"}

    index_file = tmp_path / "index.json"
    index_file.write_text(json.dumps([valid_record, bad_record]), encoding="utf-8")

    result = load_existing_index(index_file, mock_logger)
    assert "kinh-a" in result
    assert "bad" not in result  # skipped without crashing


def test_load_existing_index_warns_on_malformed_entry(
    tmp_path: Path, mock_logger: MagicMock
) -> None:
    bad_record = {"id": "bad", "missing": "required fields"}
    index_file = tmp_path / "index.json"
    index_file.write_text(json.dumps([bad_record]), encoding="utf-8")

    load_existing_index(index_file, mock_logger)

    mock_logger.warning.assert_called_once()
    warning_msg = str(mock_logger.warning.call_args)
    assert "malformed" in warning_msg.lower() or "Skipping" in warning_msg


def test_load_existing_index_handles_corrupt_json(
    tmp_path: Path, mock_logger: MagicMock
) -> None:
    index_file = tmp_path / "index.json"
    index_file.write_text("NOT VALID JSON {{{{", encoding="utf-8")

    result = load_existing_index(index_file, mock_logger)
    assert result == {}  # corrupt → start fresh


# ---------------------------------------------------------------------------
# manifest_to_book_record
# ---------------------------------------------------------------------------

def test_manifest_to_book_record_valid_manifest(
    tmp_path: Path, mock_logger: MagicMock
) -> None:
    books_dir = tmp_path / "books"
    manifest_path = make_book_manifest(
        books_dir, "thuvienkinhphat", "kinh-truong-bo", "Kinh Trường Bộ",
        category="Nikaya", subcategory="Trường Bộ",
        author_translator="Hòa thượng Thích Minh Châu", total_chapters=34,
    )

    result = manifest_to_book_record(manifest_path, mock_logger)

    assert result is not None
    assert isinstance(result, BookIndexRecord)
    assert result.id == "kinh-truong-bo"
    assert result.title == "Kinh Trường Bộ"
    assert result.category == "Nikaya"
    assert result.subcategory == "Trường Bộ"
    assert result.source == "thuvienkinhphat"
    assert result.author_translator == "Hòa thượng Thích Minh Châu"
    assert result.total_chapters == 34
    mock_logger.error.assert_not_called()


def test_manifest_to_book_record_missing_json_returns_none(
    tmp_path: Path, mock_logger: MagicMock
) -> None:
    missing = tmp_path / "nonexistent.json"

    result = manifest_to_book_record(missing, mock_logger)

    assert result is None
    mock_logger.error.assert_called_once()


def test_manifest_to_book_record_corrupt_json_returns_none(
    tmp_path: Path, mock_logger: MagicMock
) -> None:
    bad_path = tmp_path / "bad.json"
    bad_path.write_text("NOT VALID JSON", encoding="utf-8")

    result = manifest_to_book_record(bad_path, mock_logger)

    assert result is None
    mock_logger.error.assert_called_once()


def test_manifest_to_book_record_manifest_path_field(
    tmp_path: Path, mock_logger: MagicMock
) -> None:
    books_dir = tmp_path / "books"
    manifest_path = make_book_manifest(
        books_dir, "thuvienkinhphat", "kinh-phap-cu", "Kinh Pháp Cú"
    )

    result = manifest_to_book_record(manifest_path, mock_logger)

    assert result is not None
    assert result.manifest_path == str(manifest_path)


def test_manifest_to_book_record_null_author_translator(
    tmp_path: Path, mock_logger: MagicMock
) -> None:
    books_dir = tmp_path / "books"
    manifest_path = make_book_manifest(
        books_dir, "thuvienkinhphat", "kinh-test", "Kinh Test",
        author_translator=None,
    )

    result = manifest_to_book_record(manifest_path, mock_logger)

    assert result is not None
    assert result.author_translator is None


# ---------------------------------------------------------------------------
# build_index
# ---------------------------------------------------------------------------

def test_build_index_creates_books_index_json(
    tmp_path: Path, mock_logger: MagicMock
) -> None:
    books_dir = tmp_path / "books"
    make_book_manifest(books_dir, "thuvienkinhphat", "kinh-a", "Kinh A")
    cfg = _make_cfg(tmp_path)

    build_index(cfg, mock_logger)

    index_path = tmp_path / "books" / "index.json"
    assert index_path.exists()
    data = json.loads(index_path.read_text(encoding="utf-8"))
    assert isinstance(data, list)
    assert len(data) == 1
    assert data[0]["title"] == "Kinh A"


def test_build_index_output_path_is_books_index_not_root(
    tmp_path: Path, mock_logger: MagicMock
) -> None:
    """Output must be at tmp_path/books/index.json, not tmp_path/index.json."""
    books_dir = tmp_path / "books"
    make_book_manifest(books_dir, "thuvienkinhphat", "kinh-a", "Kinh A")
    cfg = _make_cfg(tmp_path)

    build_index(cfg, mock_logger)

    assert (tmp_path / "books" / "index.json").exists()
    assert not (tmp_path / "index.json").exists()


def test_build_index_idempotent(tmp_path: Path, mock_logger: MagicMock) -> None:
    """Running build_index twice with same inputs produces identical output."""
    books_dir = tmp_path / "books"
    make_book_manifest(books_dir, "thuvienkinhphat", "kinh-a", "Kinh A")
    make_book_manifest(books_dir, "thuvienkinhphat", "kinh-b", "Kinh B")
    cfg = _make_cfg(tmp_path)

    build_index(cfg, mock_logger)
    index_path = tmp_path / "books" / "index.json"
    content1 = index_path.read_text(encoding="utf-8")

    build_index(cfg, mock_logger)
    content2 = index_path.read_text(encoding="utf-8")

    assert content1 == content2


def test_build_index_incremental_append(tmp_path: Path, mock_logger: MagicMock) -> None:
    """New book manifests after first run are appended; existing records unchanged."""
    books_dir = tmp_path / "books"
    make_book_manifest(books_dir, "thuvienkinhphat", "kinh-a", "Kinh A")
    cfg = _make_cfg(tmp_path)

    # First run: 1 book
    build_index(cfg, mock_logger)
    index_path = tmp_path / "books" / "index.json"
    data1 = json.loads(index_path.read_text(encoding="utf-8"))
    assert len(data1) == 1

    # Add new manifest
    make_book_manifest(books_dir, "thuvienkinhphat", "kinh-b", "Kinh B")

    # Second run: 2 books, existing unchanged
    build_index(cfg, mock_logger)
    data2 = json.loads(index_path.read_text(encoding="utf-8"))
    assert len(data2) == 2
    titles = {r["title"] for r in data2}
    assert "Kinh A" in titles
    assert "Kinh B" in titles


def test_build_index_no_duplicate_on_second_run(
    tmp_path: Path, mock_logger: MagicMock
) -> None:
    """Running with same manifests twice must not duplicate records."""
    books_dir = tmp_path / "books"
    make_book_manifest(books_dir, "thuvienkinhphat", "kinh-a", "Kinh A")
    cfg = _make_cfg(tmp_path)

    build_index(cfg, mock_logger)
    build_index(cfg, mock_logger)

    index_path = tmp_path / "books" / "index.json"
    data = json.loads(index_path.read_text(encoding="utf-8"))
    assert len(data) == 1  # not 2


def test_build_index_output_valid_json_preserves_vietnamese(
    tmp_path: Path, mock_logger: MagicMock
) -> None:
    """Output must be parseable JSON with Vietnamese characters preserved."""
    books_dir = tmp_path / "books"
    make_book_manifest(
        books_dir, "thuvienkinhphat", "kinh-phap-cu", "Kinh Pháp Cú",
        author_translator="Hòa thượng Thích Minh Châu",
    )
    cfg = _make_cfg(tmp_path)

    build_index(cfg, mock_logger)

    index_path = tmp_path / "books" / "index.json"
    data = json.loads(index_path.read_text(encoding="utf-8"))
    assert data[0]["title"] == "Kinh Pháp Cú"
    assert data[0]["author_translator"] == "Hòa thượng Thích Minh Châu"


def test_build_index_logs_summary_with_books_and_excluded(
    tmp_path: Path, mock_logger: MagicMock
) -> None:
    """Summary log line must mention 'books' and 'excluded'."""
    books_dir = tmp_path / "books"
    make_book_manifest(books_dir, "thuvienkinhphat", "kinh-a", "Kinh A")
    cfg = _make_cfg(tmp_path)

    build_index(cfg, mock_logger)

    mock_logger.info.assert_called_once()
    log_msg = str(mock_logger.info.call_args)
    assert "books" in log_msg.lower()
    assert "excluded" in log_msg.lower()
