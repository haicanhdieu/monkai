import json
from pathlib import Path

from dedup import (
    candidate_key,
    dedup_candidates,
    normalize_key,
)
from manifest import ManifestEntry


def make_entry(title: str, author: str | None, epub: str = "output/books/test.epub") -> ManifestEntry:
    return ManifestEntry(
        title=title,
        category="Khác",
        author=author,
        epubFile=epub,
    )


def write_vnthuquan_index(tmp_path: Path, books: list[dict]) -> Path:
    idx_dir = tmp_path / "vnthuquan"
    idx_dir.mkdir()
    idx_path = idx_dir / "index.json"
    idx_path.write_text(json.dumps({"_meta": {}, "books": books}), encoding="utf-8")
    return idx_path


# --- normalize_key ---

def test_normalize_key_strips_diacritics():
    assert normalize_key("Đắc Nhân Tâm") == normalize_key("dac nhan tam")


def test_normalize_key_collapses_punctuation():
    result = normalize_key("abc, def!")
    assert result == "abc def"


def test_normalize_key_trims_whitespace():
    assert normalize_key("  hello  ") == "hello"


# --- candidate_key ---

def test_candidate_key_equal_regardless_of_case_diacritics():
    k1 = candidate_key("Đắc Nhân Tâm", "Dale Carnegie")
    k2 = candidate_key("dac nhan tam", "dale carnegie")
    assert k1 == k2


def test_candidate_key_empty_author():
    k = candidate_key("Some Book", None)
    assert k == (normalize_key("Some Book"), "")


# --- dedup_candidates ---

def test_dedup_skips_vnthuquan_match(tmp_path):
    idx_path = write_vnthuquan_index(tmp_path, [
        {"book_name": "Đắc Nhân Tâm", "author": "Dale Carnegie"},
    ])
    candidate = make_entry("Đắc Nhân Tâm", "Dale Carnegie", "output/books/dac-nhan-tam.epub")
    result = dedup_candidates(
        [candidate],
        vnthuquan_index_path=idx_path,
        onedrive_index_path=None,
    )
    assert len(result.kept) == 0
    assert len(result.skipped) == 1
    assert result.skipped[0].reason == "vnthuquan"


def test_dedup_skips_in_batch_duplicate(tmp_path):
    idx_path = write_vnthuquan_index(tmp_path, [])
    a = make_entry("Cuốn Sách", "Tác Giả", "output/books/cuon-sach-1.epub")
    b = make_entry("Cuốn Sách", "Tác Giả", "output/books/cuon-sach-2.epub")
    result = dedup_candidates([a, b], vnthuquan_index_path=idx_path, onedrive_index_path=None)
    assert len(result.kept) == 1
    assert len(result.skipped) == 1
    assert result.skipped[0].reason == "in-batch"


def test_dedup_flags_empty_author_title_match(tmp_path):
    idx_path = write_vnthuquan_index(tmp_path, [
        {"book_name": "Kinh Nào Đó", "author": ""},
    ])
    candidate = make_entry("Kinh Nào Đó", None, "output/books/kinh.epub")
    result = dedup_candidates([candidate], vnthuquan_index_path=idx_path, onedrive_index_path=None)
    # Kept (not auto-skipped) but flagged
    assert len(result.kept) == 1
    assert len(result.flagged) == 1


def test_dedup_assigns_unique_ids(tmp_path):
    idx_path = write_vnthuquan_index(tmp_path, [])
    a = make_entry("Trùng Tên", "Tác Giả A", "output/books/a.epub")
    b = make_entry("Trùng Tên", "Tác Giả B", "output/books/b.epub")
    result = dedup_candidates([a, b], vnthuquan_index_path=idx_path, onedrive_index_path=None)
    assert len(result.kept) == 2
    ids = [k.id for k in result.kept]
    assert len(set(ids)) == 2
