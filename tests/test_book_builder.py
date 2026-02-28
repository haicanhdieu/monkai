"""Tests for book_builder.py — chapter metadata inlining.

Covers: build_books() inlines ScriptureMetadata fields, no meta_file key,
correct total_chapters, skips entries without book_title, sort order,
missing required fields, and multi-book output.
"""
from __future__ import annotations

import json
import logging
from pathlib import Path


from book_builder import build_books


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

CREATED_AT = "2026-02-28T00:00:00+00:00"


def make_chapter_meta(
    tmp_dir: Path,
    filename: str,
    *,
    book_title: str | None = "Kinh Tăng Chi Bộ",
    chapter: str | None = "Chương Một Pháp",
    title: str = "Kinh Tăng Chi Bộ - Chương Một",
    category: str = "Nikaya",
    subcategory: str = "Tăng Chi Bộ",
    source: str = "thuvienkinhphat",
    url: str = "https://thuvienkinhphat.net/test",
    file_path: str = "data/raw/thuvienkinhphat/test.html",
    file_format: str = "html",
    copyright_status: str = "unknown",
    content: str | None = "Nội dung kinh.",
    title_pali: str | None = "Anguttara Nikaya",
    title_sanskrit: str | None = None,
    book_collection: str | None = "Tăng Chi Bộ",
    author_translator: str | None = "Thích Minh Châu",
    scripture_id: str = "thuvienkinhphat__kinh-tang-chi-bo",
) -> None:
    data = {
        "id": scripture_id,
        "title": title,
        "title_pali": title_pali,
        "title_sanskrit": title_sanskrit,
        "chapter": chapter,
        "category": category,
        "subcategory": subcategory,
        "book_collection": book_collection,
        "book_title": book_title,
        "author_translator": author_translator,
        "content": content,
        "source": source,
        "url": url,
        "file_path": file_path,
        "file_format": file_format,
        "copyright_status": copyright_status,
        "created_at": CREATED_AT,
    }
    (tmp_dir / filename).write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")


def make_logger() -> logging.Logger:
    logger = logging.getLogger("test_book_builder")
    logger.setLevel(logging.DEBUG)
    return logger


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_build_books_inlines_all_metadata_fields(tmp_path):
    meta_dir = tmp_path / "meta"
    meta_dir.mkdir()
    books_dir = tmp_path / "books"

    make_chapter_meta(meta_dir, "tangchi01.json")

    build_books("thuvienkinhphat", meta_dir, books_dir, make_logger())

    manifests = list(books_dir.glob("*.json"))
    assert len(manifests) == 1

    manifest = json.loads(manifests[0].read_text(encoding="utf-8"))
    chapters = manifest["chapters"]
    assert len(chapters) == 1

    ch = chapters[0]
    assert ch["id"] == "thuvienkinhphat__kinh-tang-chi-bo"
    assert ch["title"] == "Kinh Tăng Chi Bộ - Chương Một"
    assert ch["title_pali"] == "Anguttara Nikaya"
    assert ch["title_sanskrit"] is None
    assert ch["chapter"] == "Chương Một Pháp"
    assert ch["category"] == "Nikaya"
    assert ch["subcategory"] == "Tăng Chi Bộ"
    assert ch["book_collection"] == "Tăng Chi Bộ"
    assert ch["author_translator"] == "Thích Minh Châu"
    assert ch["content"] == "Nội dung kinh."
    assert ch["source"] == "thuvienkinhphat"
    assert ch["url"] == "https://thuvienkinhphat.net/test"
    assert ch["file_path"] == "data/raw/thuvienkinhphat/test.html"
    assert ch["file_format"] == "html"
    assert ch["copyright_status"] == "unknown"
    assert ch["created_at"] == CREATED_AT


def test_build_books_no_meta_file_key(tmp_path):
    meta_dir = tmp_path / "meta"
    meta_dir.mkdir()
    books_dir = tmp_path / "books"

    make_chapter_meta(meta_dir, "tangchi01.json")

    build_books("thuvienkinhphat", meta_dir, books_dir, make_logger())

    manifest = json.loads(next(books_dir.glob("*.json")).read_text(encoding="utf-8"))
    ch = manifest["chapters"][0]
    assert "meta_file" not in ch


def test_build_books_correct_total_chapters(tmp_path):
    meta_dir = tmp_path / "meta"
    meta_dir.mkdir()
    books_dir = tmp_path / "books"

    for i in range(1, 5):
        make_chapter_meta(
            meta_dir,
            f"tangchi0{i}.json",
            chapter=f"Chương {i}",
            scripture_id=f"thuvienkinhphat__kinh-tang-chi-bo-{i}",
        )

    build_books("thuvienkinhphat", meta_dir, books_dir, make_logger())

    manifest = json.loads(next(books_dir.glob("*.json")).read_text(encoding="utf-8"))
    assert manifest["total_chapters"] == 4
    assert len(manifest["chapters"]) == 4


def test_build_books_skips_no_book_title(tmp_path):
    meta_dir = tmp_path / "meta"
    meta_dir.mkdir()
    books_dir = tmp_path / "books"

    # One chapter with no book_title — should be skipped
    make_chapter_meta(meta_dir, "no-book.json", book_title=None, scripture_id="id-no-book")
    # One valid chapter
    make_chapter_meta(meta_dir, "tangchi01.json", book_title="Kinh Tăng Chi Bộ")

    build_books("thuvienkinhphat", meta_dir, books_dir, make_logger())

    manifests = list(books_dir.glob("*.json"))
    assert len(manifests) == 1  # Only the valid book was written

    manifest = json.loads(manifests[0].read_text(encoding="utf-8"))
    assert manifest["total_chapters"] == 1


def test_build_books_chapters_sorted_by_order(tmp_path):
    meta_dir = tmp_path / "meta"
    meta_dir.mkdir()
    books_dir = tmp_path / "books"

    # Write meta files in reverse numeric order; sorted() on glob will give alphabetical
    # order, which may differ from numeric order — verify numeric sort wins
    make_chapter_meta(meta_dir, "tangchi10.json", chapter="Chương 10", scripture_id="id-10")
    make_chapter_meta(meta_dir, "tangchi02.json", chapter="Chương 2", scripture_id="id-02")
    make_chapter_meta(meta_dir, "tangchi01.json", chapter="Chương 1", scripture_id="id-01")

    build_books("thuvienkinhphat", meta_dir, books_dir, make_logger())

    manifest = json.loads(next(books_dir.glob("*.json")).read_text(encoding="utf-8"))
    orders = [ch["order"] for ch in manifest["chapters"]]
    assert orders == sorted(orders), "chapters must be sorted by numeric order"
    assert manifest["chapters"][0]["chapter"] == "Chương 1"
    assert manifest["chapters"][1]["chapter"] == "Chương 2"
    assert manifest["chapters"][2]["chapter"] == "Chương 10"


def test_build_books_missing_required_fields_defaults_to_empty_string(tmp_path):
    meta_dir = tmp_path / "meta"
    meta_dir.mkdir()
    books_dir = tmp_path / "books"

    # Write a meta file with required fields absent (malformed)
    (meta_dir / "malformed.json").write_text(
        json.dumps({"book_title": "Kinh Test"}), encoding="utf-8"
    )

    build_books("thuvienkinhphat", meta_dir, books_dir, make_logger())

    manifest = json.loads(next(books_dir.glob("*.json")).read_text(encoding="utf-8"))
    ch = manifest["chapters"][0]
    assert ch["id"] == ""
    assert ch["title"] == ""
    assert ch["category"] == ""
    assert ch["subcategory"] == ""
    assert ch["file_format"] == "other"
    assert ch["copyright_status"] == "unknown"
    assert ch["created_at"] == ""


def test_build_books_multi_book_produces_separate_manifests(tmp_path):
    meta_dir = tmp_path / "meta"
    meta_dir.mkdir()
    books_dir = tmp_path / "books"

    make_chapter_meta(
        meta_dir, "truong01.json",
        book_title="Kinh Trường Bộ",
        chapter="Kinh Phạm Võng",
        scripture_id="id-truong-01",
    )
    make_chapter_meta(
        meta_dir, "tangchi01.json",
        book_title="Kinh Tăng Chi Bộ",
        chapter="Chương Một Pháp",
        scripture_id="id-tangchi-01",
    )

    build_books("thuvienkinhphat", meta_dir, books_dir, make_logger())

    manifests = list(books_dir.glob("*.json"))
    assert len(manifests) == 2

    titles = {json.loads(p.read_text(encoding="utf-8"))["book_title"] for p in manifests}
    assert titles == {"Kinh Trường Bộ", "Kinh Tăng Chi Bộ"}
