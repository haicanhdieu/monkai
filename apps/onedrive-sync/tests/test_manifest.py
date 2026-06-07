import json
from pathlib import Path

import pytest

from manifest import ManifestEntry, eligible_epub, epub_staging_path, load_manifest

EPUB_ENTRY = {
    "url": "https://example.com/book",
    "title": "Đắc Nhân Tâm",
    "imageUrl": "https://example.com/cover.jpg",
    "author": "Dale Carnegie",
    "category": "Sống Đẹp",
    "imageFile": "output/images/dac-nhan-tam.jpg",
    "epubUrl": "https://example.com/book.epub",
    "epubFile": "output/books/dac-nhan-tam.epub",
    "pdfUrl": None,
    "pdfFile": None,
}

PDF_ONLY_ENTRY = {
    "url": "https://example.com/pdf-book",
    "title": "Sách PDF",
    "imageUrl": None,
    "author": None,
    "category": "Khác",
    "imageFile": None,
    "epubUrl": None,
    "epubFile": None,
    "pdfUrl": "https://example.com/book.pdf",
    "pdfFile": "output/books/sach-pdf.pdf",
}

EPUB_AND_PDF_ENTRY = {
    "url": "https://example.com/both",
    "title": "Cuốn Sách",
    "imageUrl": None,
    "author": None,
    "category": "Khác",
    "imageFile": None,
    "epubUrl": "https://example.com/both.epub",
    "epubFile": "output/books/cuon-sach.epub",
    "pdfUrl": "https://example.com/both.pdf",
    "pdfFile": "output/books/cuon-sach.pdf",
}


def write_manifest(tmp_path: Path, data) -> Path:
    p = tmp_path / "__books.json"
    p.write_text(json.dumps(data), encoding="utf-8")
    return p


def test_load_manifest_valid(tmp_path):
    p = write_manifest(tmp_path, [EPUB_ENTRY])
    entries = load_manifest(p)
    assert len(entries) == 1
    assert entries[0].title == "Đắc Nhân Tâm"
    assert entries[0].epubFile == "output/books/dac-nhan-tam.epub"


def test_load_manifest_extra_fields_ignored(tmp_path):
    entry = {**EPUB_ENTRY, "unknownNewField": "value"}
    p = write_manifest(tmp_path, [entry])
    entries = load_manifest(p)
    assert len(entries) == 1


def test_load_manifest_missing_required_field_raises(tmp_path):
    bad = {k: v for k, v in EPUB_ENTRY.items() if k != "title"}
    p = write_manifest(tmp_path, [bad])
    with pytest.raises(ValueError, match="title"):
        load_manifest(p)


def test_load_manifest_not_array_raises(tmp_path):
    p = write_manifest(tmp_path, {"title": "not an array"})
    with pytest.raises(ValueError, match="list"):
        load_manifest(p)


def test_eligible_epub_keeps_only_epub_entries():
    entries = [
        ManifestEntry(**EPUB_ENTRY),
        ManifestEntry(**PDF_ONLY_ENTRY),
        ManifestEntry(**EPUB_AND_PDF_ENTRY),
    ]
    result = eligible_epub(entries)
    assert len(result) == 2
    titles = {e.title for e in result}
    assert "Đắc Nhân Tâm" in titles
    assert "Cuốn Sách" in titles
    assert "Sách PDF" not in titles


def test_epub_staging_path_basename(tmp_path):
    entry = ManifestEntry(**EPUB_ENTRY)
    staging_dir = tmp_path
    path = epub_staging_path(entry, staging_dir)
    assert path == staging_dir / "nhasachmienphi" / "dac-nhan-tam.epub"


def test_epub_staging_path_missing_file_reported(tmp_path):
    entry = ManifestEntry(**EPUB_ENTRY)
    missing = epub_staging_path(entry, tmp_path)
    assert not missing.exists()
