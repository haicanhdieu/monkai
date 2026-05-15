"""
Tests for tools/cleanup_placeholder_covers.py

Uses tmp_path fixtures to build synthetic book-data trees.
Covers: dry-run detection, execute (backup + clean), idempotency, restore,
and no-false-positives for unique covers.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

# Make tools/ importable when running from apps/crawler/
sys.path.insert(0, str(Path(__file__).parent.parent / "tools"))

from cleanup_placeholder_covers import (
    clean,
    collect_cover_info,
    create_backup,
    restore_from_backup,
)


# ---------------------------------------------------------------------------
# Fixtures / helpers
# ---------------------------------------------------------------------------

PLACEHOLDER_BYTES = b"<svg>placeholder</svg>"  # shared by all "vbeta" books
REAL_COVER_A_BYTES = b"\xff\xd8\xff" + b"cover-a" * 100  # unique cover
REAL_COVER_B_BYTES = b"\xff\xd8\xff" + b"cover-b" * 100  # another unique cover


def _make_book(
    data_dir: Path,
    source: str,
    category: str,
    slug: str,
    cover_bytes: bytes | None,
    cover_filename: str | None = None,
) -> Path:
    """
    Create a minimal book.json (and optional cover image) under data_dir.
    Returns the path to book.json.
    """
    book_dir = data_dir / source / category / slug
    book_dir.mkdir(parents=True, exist_ok=True)

    local_path: str | None = None
    original_url: str | None = None

    if cover_bytes is not None and cover_filename is not None:
        img_dir = book_dir / "images"
        img_dir.mkdir(exist_ok=True)
        cover_file = img_dir / cover_filename
        cover_file.write_bytes(cover_bytes)
        local_path = str(Path(source) / category / slug / "images" / cover_filename)
        original_url = f"https://example.com/{cover_filename}"

    book_data = {
        "id": f"uuid-{slug}",
        "book_name": slug.replace("-", " ").title(),
        "cover_image_local_path": local_path,
        "cover_image_url": original_url,
    }
    book_json = book_dir / "book.json"
    book_json.write_text(json.dumps(book_data, ensure_ascii=False), encoding="utf-8")
    return book_json


def _make_index(data_dir: Path, source: str, books: list[dict]) -> Path:
    """Create a minimal index.json for the source."""
    index_path = data_dir / source / "index.json"
    index_path.parent.mkdir(parents=True, exist_ok=True)
    data = {
        "_meta": {"schema_version": "1.0", "built_at": "2026-01-01", "total_books": len(books)},
        "books": books,
    }
    index_path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    return index_path


# ---------------------------------------------------------------------------
# collect_cover_info
# ---------------------------------------------------------------------------


def test_collect_detects_placeholder_group(tmp_path: Path) -> None:
    data_dir = tmp_path / "book-data"
    _make_book(data_dir, "vbeta", "kinh", "book-a", PLACEHOLDER_BYTES, "item-general.svg")
    _make_book(data_dir, "vbeta", "kinh", "book-b", PLACEHOLDER_BYTES, "item-general.svg")
    _make_book(data_dir, "vbeta", "kinh", "book-c", PLACEHOLDER_BYTES, "item-general.svg")

    hash_groups, missing = collect_cover_info(data_dir)

    assert len(hash_groups) == 1, "All three books share one hash"
    assert len(missing) == 0
    only_hash = next(iter(hash_groups))
    assert len(hash_groups[only_hash]) == 3


def test_collect_no_false_positives_for_unique_covers(tmp_path: Path) -> None:
    data_dir = tmp_path / "book-data"
    _make_book(data_dir, "vnthuquan", "kiem-hiep", "book-x", REAL_COVER_A_BYTES, "cover.jpg")
    _make_book(data_dir, "vnthuquan", "kiem-hiep", "book-y", REAL_COVER_B_BYTES, "cover.jpg")

    hash_groups, missing = collect_cover_info(data_dir)

    placeholder_hashes = {h for h, books in hash_groups.items() if len(books) >= 2}
    assert len(placeholder_hashes) == 0, "Distinct covers must NOT be flagged as placeholders"


def test_collect_skips_already_clean_book(tmp_path: Path) -> None:
    data_dir = tmp_path / "book-data"
    _make_book(data_dir, "vbeta", "kinh", "clean-book", None, None)

    hash_groups, missing = collect_cover_info(data_dir)

    assert len(hash_groups) == 0
    assert len(missing) == 0


def test_collect_records_missing_cover(tmp_path: Path) -> None:
    data_dir = tmp_path / "book-data"
    book_json = _make_book(data_dir, "vbeta", "kinh", "missing-cover", PLACEHOLDER_BYTES, "item-general.svg")

    # Delete the image after book.json is created so local_path points to a ghost
    cover_path = data_dir / "vbeta" / "kinh" / "missing-cover" / "images" / "item-general.svg"
    cover_path.unlink()

    hash_groups, missing = collect_cover_info(data_dir)

    assert len(missing) == 1
    assert len(hash_groups) == 0


# ---------------------------------------------------------------------------
# clean (execute phase)
# ---------------------------------------------------------------------------


def _build_vbeta_fixture(tmp_path: Path, num_books: int = 3) -> tuple[Path, list[Path]]:
    """Build a vbeta fixture with `num_books` placeholder-cover books and an index."""
    data_dir = tmp_path / "book-data"
    book_jsons = []
    index_books = []

    for i in range(num_books):
        slug = f"book-{i}"
        bj = _make_book(data_dir, "vbeta", "kinh", slug, PLACEHOLDER_BYTES, "item-general.svg")
        book_jsons.append(bj)
        local = str(Path("vbeta") / "kinh" / slug / "images" / "item-general.svg")
        index_books.append({
            "id": f"uuid-{slug}",
            "book_name": slug,
            "cover_image_url": local,
        })

    _make_index(data_dir, "vbeta", index_books)
    return data_dir, book_jsons


def test_clean_deletes_cover_files(tmp_path: Path) -> None:
    data_dir, _ = _build_vbeta_fixture(tmp_path, num_books=3)
    hash_groups, _ = collect_cover_info(data_dir)
    placeholder_books = [rec for books in hash_groups.values() for rec in books]

    clean(data_dir, placeholder_books)

    for rec in placeholder_books:
        assert not rec["abs_cover"].exists(), "Placeholder image must be deleted"


def test_clean_nulls_book_json_cover_fields(tmp_path: Path) -> None:
    data_dir, book_jsons = _build_vbeta_fixture(tmp_path, num_books=2)
    hash_groups, _ = collect_cover_info(data_dir)
    placeholder_books = [rec for books in hash_groups.values() for rec in books]

    clean(data_dir, placeholder_books)

    for bj in book_jsons:
        data = json.loads(bj.read_text(encoding="utf-8"))
        assert data["cover_image_local_path"] is None
        assert data["cover_image_url"] is None


def test_clean_patches_index_json(tmp_path: Path) -> None:
    data_dir, _ = _build_vbeta_fixture(tmp_path, num_books=3)
    hash_groups, _ = collect_cover_info(data_dir)
    placeholder_books = [rec for books in hash_groups.values() for rec in books]

    clean(data_dir, placeholder_books)

    index_path = data_dir / "vbeta" / "index.json"
    raw = json.loads(index_path.read_text(encoding="utf-8"))
    for entry in raw["books"]:
        assert entry["cover_image_url"] is None, "All placeholder entries must be nulled in index"


def test_clean_is_idempotent(tmp_path: Path) -> None:
    data_dir, _ = _build_vbeta_fixture(tmp_path, num_books=3)
    hash_groups, _ = collect_cover_info(data_dir)
    placeholder_books = [rec for books in hash_groups.values() for rec in books]

    clean(data_dir, placeholder_books)

    # Second run: collect should find nothing to clean
    hash_groups2, _ = collect_cover_info(data_dir)
    placeholder_hashes2 = {h for h, books in hash_groups2.items() if len(books) >= 2}
    assert len(placeholder_hashes2) == 0, "Tool must be idempotent — no placeholders after clean"


# ---------------------------------------------------------------------------
# create_backup
# ---------------------------------------------------------------------------


def test_create_backup_produces_manifest(tmp_path: Path) -> None:
    data_dir, _ = _build_vbeta_fixture(tmp_path, num_books=2)
    hash_groups, _ = collect_cover_info(data_dir)
    placeholder_books = [rec for books in hash_groups.values() for rec in books]
    affected_sources = {"vbeta"}

    backup_dir = create_backup(data_dir, placeholder_books, affected_sources)

    manifest = json.loads((backup_dir / "manifest.json").read_text(encoding="utf-8"))
    assert "created_at" in manifest
    assert len(manifest["images"]) > 0
    assert len(manifest["book_jsons"]) == 2
    assert len(manifest["index_jsons"]) == 1


def test_create_backup_copies_image_files(tmp_path: Path) -> None:
    data_dir, _ = _build_vbeta_fixture(tmp_path, num_books=2)
    hash_groups, _ = collect_cover_info(data_dir)
    placeholder_books = [rec for books in hash_groups.values() for rec in books]

    backup_dir = create_backup(data_dir, placeholder_books, {"vbeta"})

    images_dir = backup_dir / "images"
    backed_up = list(images_dir.iterdir())
    assert len(backed_up) >= 1  # deduped: same content but possibly different paths


def test_create_backup_copies_index_json(tmp_path: Path) -> None:
    data_dir, _ = _build_vbeta_fixture(tmp_path, num_books=2)
    hash_groups, _ = collect_cover_info(data_dir)
    placeholder_books = [rec for books in hash_groups.values() for rec in books]

    backup_dir = create_backup(data_dir, placeholder_books, {"vbeta"})

    assert (backup_dir / "index_jsons" / "vbeta_index.json").exists()


# ---------------------------------------------------------------------------
# restore_from_backup
# ---------------------------------------------------------------------------


def test_restore_reinstates_book_jsons_and_index(tmp_path: Path) -> None:
    data_dir, book_jsons = _build_vbeta_fixture(tmp_path, num_books=2)
    hash_groups, _ = collect_cover_info(data_dir)
    placeholder_books = [rec for books in hash_groups.values() for rec in books]
    affected_sources = {"vbeta"}

    # Capture originals
    originals = {bj: bj.read_text(encoding="utf-8") for bj in book_jsons}
    index_path = data_dir / "vbeta" / "index.json"
    original_index = index_path.read_text(encoding="utf-8")

    # Backup then clean
    backup_dir = create_backup(data_dir, placeholder_books, affected_sources)
    clean(data_dir, placeholder_books)

    # Verify clean happened
    for bj in book_jsons:
        data = json.loads(bj.read_text(encoding="utf-8"))
        assert data["cover_image_url"] is None

    # Restore
    restore_from_backup(backup_dir)

    # Verify restoration
    for bj, original_text in originals.items():
        assert bj.read_text(encoding="utf-8") == original_text, f"{bj} not restored correctly"

    assert index_path.read_text(encoding="utf-8") == original_index, "index.json not restored"


def test_restore_reinstates_deleted_images(tmp_path: Path) -> None:
    data_dir, _ = _build_vbeta_fixture(tmp_path, num_books=2)
    hash_groups, _ = collect_cover_info(data_dir)
    placeholder_books = [rec for books in hash_groups.values() for rec in books]

    backup_dir = create_backup(data_dir, placeholder_books, {"vbeta"})
    clean(data_dir, placeholder_books)

    # Confirm images are gone
    for rec in placeholder_books:
        assert not rec["abs_cover"].exists()

    restore_from_backup(backup_dir)

    # Confirm images are back
    for rec in placeholder_books:
        assert rec["abs_cover"].exists(), f"Image {rec['abs_cover']} was not restored"


# ---------------------------------------------------------------------------
# Mixed sources: vbeta placeholders + vnthuquan unique covers
# ---------------------------------------------------------------------------


def test_mixed_sources_no_false_positives(tmp_path: Path) -> None:
    """vbeta has 3 identical placeholder covers; vnthuquan has 2 unique covers. Only vbeta should be flagged."""
    data_dir = tmp_path / "book-data"

    # vbeta: 3 books all with the same placeholder
    for i in range(3):
        _make_book(data_dir, "vbeta", "kinh", f"v-book-{i}", PLACEHOLDER_BYTES, "item-general.svg")

    # vnthuquan: 2 books with distinct covers
    _make_book(data_dir, "vnthuquan", "tieu-thuyet", "novel-a", REAL_COVER_A_BYTES, "cover.jpg")
    _make_book(data_dir, "vnthuquan", "tieu-thuyet", "novel-b", REAL_COVER_B_BYTES, "cover.jpg")

    hash_groups, _ = collect_cover_info(data_dir)
    placeholder_hashes = {h for h, books in hash_groups.items() if len(books) >= 2}

    assert len(placeholder_hashes) == 1, "Exactly one placeholder hash group (vbeta)"
    only_books = hash_groups[next(iter(placeholder_hashes))]
    for rec in only_books:
        assert "vbeta" in str(rec["book_json"]), "Only vbeta books should be in the placeholder group"
