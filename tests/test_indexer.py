"""Tests for indexer.py — Story 3.3.

Covers: scan_meta_files, load_existing_index, meta_to_index_record,
build_index (idempotency, incremental update, orphan exclusion).
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import MagicMock

import pytest

from models import CrawlerConfig, IndexRecord, ScriptureMetadata
from indexer import (
    build_index,
    load_existing_index,
    meta_to_index_record,
    scan_meta_files,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def make_meta_json(
    tmp_path: Path,
    filename: str = "kinh-test.html",
    title: str = "Kinh Test",
    category: str = "Nikaya",
    subcategory: str = "Trường Bộ",
    source: str = "thuvienhoasen",
    url: str = "https://thuvienhoasen.org/test",
    file_format: str = "html",
    copyright_status: str = "unknown",
    *,
    create_raw_file: bool = True,
    meta_dir: Path | None = None,
) -> tuple[Path, Path]:
    """Create a metadata JSON and (optionally) the raw file it references.

    If meta_dir is provided, writes to meta_dir/{stem}.json (new data/meta/ layout).
    Otherwise writes a sidecar .meta.json alongside the raw file (for meta_to_index_record tests).
    Returns (raw_file_path, meta_path).
    """
    raw_file = tmp_path / filename
    if create_raw_file:
        raw_file.write_bytes(b"<html>content</html>")

    meta = ScriptureMetadata(
        id=f"{source}__{title.lower().replace(' ', '-')}",
        title=title,
        category=category,
        subcategory=subcategory,
        source=source,
        url=url,
        file_path=str(raw_file),
        file_format=file_format,
        copyright_status=copyright_status,
        created_at=datetime.now(timezone.utc),
    )
    if meta_dir is not None:
        meta_dir.mkdir(parents=True, exist_ok=True)
        meta_path = meta_dir / (Path(filename).stem + ".json")
    else:
        meta_path = Path(str(raw_file) + ".meta.json")
    meta_path.write_text(meta.model_dump_json(indent=2), encoding="utf-8")
    return raw_file, meta_path


@pytest.fixture
def mock_logger() -> MagicMock:
    return MagicMock(spec=logging.Logger)


# ---------------------------------------------------------------------------
# scan_meta_files
# ---------------------------------------------------------------------------

def test_scan_meta_files_finds_all_meta_json(tmp_path: Path) -> None:
    meta_dir = tmp_path / "meta"
    sub = meta_dir / "thuvienhoasen"
    sub.mkdir(parents=True)
    (sub / "a.json").touch()
    (sub / "b.json").touch()
    (meta_dir / "budsas").mkdir()
    (meta_dir / "budsas" / "c.json").touch()

    result = scan_meta_files(tmp_path)
    assert len(result) == 3


def test_scan_meta_files_skips_non_json(tmp_path: Path) -> None:
    meta_dir = tmp_path / "meta"
    meta_dir.mkdir(parents=True)
    (meta_dir / "a.json").touch()
    (meta_dir / "a.html").touch()  # non-json should be skipped

    result = scan_meta_files(tmp_path)
    assert len(result) == 1
    assert result[0].name == "a.json"


def test_scan_meta_files_sorted(tmp_path: Path) -> None:
    meta_dir = tmp_path / "meta"
    meta_dir.mkdir(parents=True)
    (meta_dir / "c.json").touch()
    (meta_dir / "a.json").touch()
    (meta_dir / "b.json").touch()

    result = scan_meta_files(tmp_path)
    assert [f.name for f in result] == ["a.json", "b.json", "c.json"]


def test_scan_meta_files_returns_empty_if_meta_missing(tmp_path: Path) -> None:
    result = scan_meta_files(tmp_path)  # no meta/ dir
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
        "id": "test__record",
        "title": "Test",
        "category": "Nikaya",
        "subcategory": "Trường Bộ",
        "source": "budsas",
        "url": "https://budsas.org/test",
        "file_path": "data/raw/budsas/test.html",
        "file_format": "html",
        "copyright_status": "public_domain",
    }
    index_file = tmp_path / "index.json"
    index_file.write_text(json.dumps([record]), encoding="utf-8")

    result = load_existing_index(index_file, mock_logger)
    assert "test__record" in result
    assert isinstance(result["test__record"], IndexRecord)
    assert result["test__record"].title == "Test"


def test_load_existing_index_skips_malformed_entries(
    tmp_path: Path, mock_logger: MagicMock
) -> None:
    valid_record = {
        "id": "valid__record",
        "title": "Valid",
        "category": "Nikaya",
        "subcategory": "",
        "source": "budsas",
        "url": "https://budsas.org/valid",
        "file_path": "data/raw/valid.html",
        "file_format": "html",
        "copyright_status": "public_domain",
    }
    bad_record = {"id": "bad", "missing": "fields"}  # malformed

    index_file = tmp_path / "index.json"
    index_file.write_text(json.dumps([valid_record, bad_record]), encoding="utf-8")

    result = load_existing_index(index_file, mock_logger)
    assert "valid__record" in result
    assert "bad" not in result  # skipped without crashing


def test_load_existing_index_warns_on_malformed_entry(
    tmp_path: Path, mock_logger: MagicMock
) -> None:
    """A warning must be logged for each malformed entry (H1 fix)."""
    bad_record = {"id": "bad", "missing": "fields"}
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
# meta_to_index_record
# ---------------------------------------------------------------------------

def test_meta_to_index_record_valid_meta_and_file(
    tmp_path: Path, mock_logger: MagicMock
) -> None:
    raw_file, meta_path = make_meta_json(tmp_path, create_raw_file=True)

    result = meta_to_index_record(meta_path, mock_logger)

    assert result is not None
    assert isinstance(result, IndexRecord)
    assert result.title == "Kinh Test"
    assert result.source == "thuvienhoasen"
    mock_logger.warning.assert_not_called()
    mock_logger.error.assert_not_called()


def test_meta_to_index_record_orphan_returns_none(
    tmp_path: Path, mock_logger: MagicMock
) -> None:
    """meta.json references a file_path that does not exist → orphan → None."""
    raw_file, meta_path = make_meta_json(tmp_path, create_raw_file=False)

    result = meta_to_index_record(meta_path, mock_logger)

    assert result is None
    mock_logger.warning.assert_called_once()
    warning_msg = str(mock_logger.warning.call_args)
    assert "Orphaned" in warning_msg


def test_meta_to_index_record_malformed_json_returns_none(
    tmp_path: Path, mock_logger: MagicMock
) -> None:
    """Corrupt meta.json → None, no exception propagates."""
    meta_path = tmp_path / "bad.html.meta.json"
    meta_path.write_text("NOT VALID JSON", encoding="utf-8")

    result = meta_to_index_record(meta_path, mock_logger)

    assert result is None
    mock_logger.error.assert_called_once()


def test_meta_to_index_record_empty_file_is_orphan(
    tmp_path: Path, mock_logger: MagicMock
) -> None:
    """Raw file exists but is empty → orphan."""
    raw_file, meta_path = make_meta_json(tmp_path, create_raw_file=True)
    raw_file.write_bytes(b"")  # make it empty

    result = meta_to_index_record(meta_path, mock_logger)

    assert result is None
    mock_logger.warning.assert_called_once()


def test_meta_to_index_record_has_exact_9_fields(
    tmp_path: Path, mock_logger: MagicMock
) -> None:
    raw_file, meta_path = make_meta_json(tmp_path, create_raw_file=True)

    result = meta_to_index_record(meta_path, mock_logger)

    assert result is not None
    data = result.model_dump()
    assert len(data) == 9
    expected_keys = {
        "id", "title", "category", "subcategory", "source",
        "url", "file_path", "file_format", "copyright_status",
    }
    assert set(data.keys()) == expected_keys
    # ScriptureMetadata-only fields must NOT appear
    assert "created_at" not in data
    assert "title_pali" not in data
    assert "author_translator" not in data


# ---------------------------------------------------------------------------
# build_index
# ---------------------------------------------------------------------------

def _make_cfg(tmp_path: Path) -> CrawlerConfig:
    from models import SourceConfig
    return CrawlerConfig(
        sources=[
            SourceConfig(
                name="thuvienhoasen",
                seed_url="https://thuvienhoasen.org",
                rate_limit_seconds=1.5,
                output_folder="thuvienhoasen",
                css_selectors={},
            )
        ],
        output_dir=str(tmp_path),
    )


def _setup_raw_meta(tmp_path: Path, filename: str, title: str) -> tuple[Path, Path]:
    """Create raw file under tmp_path/raw/thuvienhoasen/ and meta JSON under tmp_path/meta/thuvienhoasen/."""
    source_dir = tmp_path / "raw" / "thuvienhoasen"
    source_dir.mkdir(parents=True, exist_ok=True)
    meta_dir = tmp_path / "meta" / "thuvienhoasen"
    return make_meta_json(source_dir, filename=filename, title=title, create_raw_file=True, meta_dir=meta_dir)


def test_build_index_creates_index_json(tmp_path: Path, mock_logger: MagicMock) -> None:
    _setup_raw_meta(tmp_path, "a.html", "Kinh A")
    cfg = _make_cfg(tmp_path)

    build_index(cfg, mock_logger)

    index_path = tmp_path / "index.json"
    assert index_path.exists()
    data = json.loads(index_path.read_text(encoding="utf-8"))
    assert isinstance(data, list)
    assert len(data) == 1
    assert data[0]["title"] == "Kinh A"


def test_build_index_idempotent(tmp_path: Path, mock_logger: MagicMock) -> None:
    """Running build_index twice with same inputs produces identical output."""
    _setup_raw_meta(tmp_path, "a.html", "Kinh A")
    _setup_raw_meta(tmp_path, "b.html", "Kinh B")
    cfg = _make_cfg(tmp_path)

    build_index(cfg, mock_logger)
    index_path = tmp_path / "index.json"
    content1 = index_path.read_text(encoding="utf-8")

    build_index(cfg, mock_logger)
    content2 = index_path.read_text(encoding="utf-8")

    assert content1 == content2


def test_build_index_incremental_append(tmp_path: Path, mock_logger: MagicMock) -> None:
    """New .meta.json files after first run are appended; existing records unchanged."""
    _setup_raw_meta(tmp_path, "a.html", "Kinh A")
    cfg = _make_cfg(tmp_path)

    # First run: 1 record
    build_index(cfg, mock_logger)
    index_path = tmp_path / "index.json"
    data1 = json.loads(index_path.read_text(encoding="utf-8"))
    assert len(data1) == 1

    # Add new meta file
    _setup_raw_meta(tmp_path, "b.html", "Kinh B")

    # Second run: 2 records, existing unchanged
    build_index(cfg, mock_logger)
    data2 = json.loads(index_path.read_text(encoding="utf-8"))
    assert len(data2) == 2
    titles = {r["title"] for r in data2}
    assert "Kinh A" in titles
    assert "Kinh B" in titles


def test_build_index_no_duplicate_on_second_run(
    tmp_path: Path, mock_logger: MagicMock
) -> None:
    """Running with same meta files twice must not duplicate records."""
    _setup_raw_meta(tmp_path, "a.html", "Kinh A")
    cfg = _make_cfg(tmp_path)

    build_index(cfg, mock_logger)
    build_index(cfg, mock_logger)

    index_path = tmp_path / "index.json"
    data = json.loads(index_path.read_text(encoding="utf-8"))
    assert len(data) == 1  # not 2


def test_build_index_excludes_orphans(tmp_path: Path, mock_logger: MagicMock) -> None:
    """meta.json pointing to missing raw file is excluded from index.json."""
    _setup_raw_meta(tmp_path, "a.html", "Kinh A")  # valid

    # Create orphaned meta: meta exists in meta/ but raw file does not
    source_dir = tmp_path / "raw" / "thuvienhoasen"
    source_dir.mkdir(parents=True, exist_ok=True)
    meta_dir = tmp_path / "meta" / "thuvienhoasen"
    orphan_raw, orphan_meta = make_meta_json(
        source_dir,
        filename="missing.html",
        title="Kinh Missing",
        create_raw_file=True,
        meta_dir=meta_dir,
    )
    orphan_raw.unlink()  # remove the raw file → orphan

    cfg = _make_cfg(tmp_path)
    build_index(cfg, mock_logger)

    index_path = tmp_path / "index.json"
    data = json.loads(index_path.read_text(encoding="utf-8"))
    assert len(data) == 1
    assert data[0]["title"] == "Kinh A"


def test_build_index_output_is_valid_json(tmp_path: Path, mock_logger: MagicMock) -> None:
    """Output file must be parseable by json.loads()."""
    _setup_raw_meta(tmp_path, "a.html", "Kinh Tâm Bình Yên")
    cfg = _make_cfg(tmp_path)

    build_index(cfg, mock_logger)

    index_path = tmp_path / "index.json"
    data = json.loads(index_path.read_text(encoding="utf-8"))
    # Vietnamese characters preserved (ensure_ascii=False)
    assert data[0]["title"] == "Kinh Tâm Bình Yên"


def test_build_index_logs_summary(tmp_path: Path, mock_logger: MagicMock) -> None:
    """Summary log line must include record count and orphan count."""
    _setup_raw_meta(tmp_path, "a.html", "Kinh A")
    cfg = _make_cfg(tmp_path)

    build_index(cfg, mock_logger)

    mock_logger.info.assert_called_once()
    log_msg = str(mock_logger.info.call_args)
    assert "Indexed" in log_msg
    assert "orphans" in log_msg
