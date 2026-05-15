"""
cleanup_placeholder_covers.py

Scans all book.json files under a book-data directory, identifies "placeholder"
cover images (local files whose SHA-256 hash is shared by >= N books), and
optionally removes them.

Usage:
  # Dry-run (default — zero writes, report only)
  uv run python tools/cleanup_placeholder_covers.py --data-dir data/book-data

  # Execute (backup first, then clean)
  uv run python tools/cleanup_placeholder_covers.py --data-dir data/book-data --execute

  # Restore from a backup created by a prior --execute run
  uv run python tools/cleanup_placeholder_covers.py --restore data/backups/covers-backup-20260515T094500

Run from apps/crawler/ directory.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import shutil
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

import typer

app = typer.Typer(help="Cleanup placeholder cover images from book-data.")
logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    h.update(path.read_bytes())
    return h.hexdigest()


def flatten_path(rel: str) -> str:
    """Turn a relative path into a flat filename using '__' as separator."""
    return rel.replace("/", "__").replace("\\", "__")


def atomic_write_json(path: Path, data: object) -> None:
    """Write JSON atomically via a .tmp file + os.replace."""
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=None), encoding="utf-8")
    os.replace(tmp, path)


# ---------------------------------------------------------------------------
# Collect phase
# ---------------------------------------------------------------------------


def collect_cover_info(
    data_dir: Path,
) -> tuple[
    dict[str, list[dict]],  # hash → list of book records
    list[dict],  # "missing local cover" records
]:
    """
    Walk data_dir for book.json files with a cover_image_local_path.
    Returns:
      hash_groups: sha256 → [{ book_json, abs_cover, local_path, original_url }]
      missing:     records where the cover path doesn't exist on disk
    """
    hash_groups: dict[str, list[dict]] = defaultdict(list)
    missing: list[dict] = []

    for book_json_path in sorted(data_dir.rglob("book.json")):
        try:
            data = json.loads(book_json_path.read_text(encoding="utf-8"))
        except Exception as exc:
            logger.warning(f"Could not read {book_json_path}: {exc}")
            continue

        local_path = data.get("cover_image_local_path")
        if not local_path:
            continue  # already clean or never had a local cover

        abs_cover = data_dir / local_path
        if not abs_cover.exists():
            missing.append(
                {
                    "book_json": book_json_path,
                    "local_path": local_path,
                    "original_url": data.get("cover_image_url"),
                }
            )
            continue

        file_hash = sha256_file(abs_cover)
        hash_groups[file_hash].append(
            {
                "book_json": book_json_path,
                "abs_cover": abs_cover,
                "local_path": local_path,
                "original_url": data.get("cover_image_url"),
            }
        )

    return hash_groups, missing


# ---------------------------------------------------------------------------
# Report phase
# ---------------------------------------------------------------------------


def report(
    hash_groups: dict[str, list[dict]],
    missing: list[dict],
    min_duplicates: int,
    placeholder_hashes: set[str],
) -> None:
    total_with_covers = sum(len(v) for v in hash_groups.values())
    total_scanned = total_with_covers + len(missing)

    print(f"\n{'=' * 60}")
    print("  Cover cleanup report")
    print(f"{'=' * 60}")
    print(f"  book.json files scanned          : {total_scanned}")
    print(f"  book.json files with local cover : {total_with_covers}")
    print(f"  book.json with missing cover file : {len(missing)}")
    print(f"  Placeholder hash groups found     : {len(placeholder_hashes)}")

    total_placeholder_books = sum(len(hash_groups[h]) for h in placeholder_hashes)
    print(f"  Books using placeholder covers    : {total_placeholder_books}")
    print()

    if placeholder_hashes:
        print("  Placeholder groups (hash prefix → count × example):")
        for h in sorted(placeholder_hashes):
            books = hash_groups[h]
            example = books[0]["book_json"].parent.name
            print(f"    {h[:12]}…  ×{len(books):4d}  e.g. {example}")
    else:
        print("  No placeholder groups found — data is clean.")

    if missing:
        print(f"\n  Books with missing cover files ({len(missing)}):")
        for rec in missing[:5]:
            print(f"    {rec['book_json']} → {rec['local_path']}")
        if len(missing) > 5:
            print(f"    … and {len(missing) - 5} more")

    print(f"{'=' * 60}\n")


# ---------------------------------------------------------------------------
# Backup phase
# ---------------------------------------------------------------------------


def create_backup(
    data_dir: Path,
    placeholder_books: list[dict],
    affected_sources: set[str],
) -> Path:
    """
    Copy affected images, book.jsons, and index.jsons to a timestamped backup dir.
    Returns the backup directory path.
    """
    ts = datetime.now(tz=timezone.utc).strftime("%Y%m%dT%H%M%S")
    backup_root = data_dir.parent / "backups" / f"covers-backup-{ts}"

    (backup_root / "images").mkdir(parents=True, exist_ok=True)
    (backup_root / "book_jsons").mkdir(parents=True, exist_ok=True)
    (backup_root / "index_jsons").mkdir(parents=True, exist_ok=True)

    manifest: dict = {
        "created_at": datetime.now(tz=timezone.utc).isoformat(),
        "data_dir": str(data_dir.resolve()),
        "images": [],
        "book_jsons": [],
        "index_jsons": [],
    }

    # Deduplicate: same image may appear multiple times (all vbeta books share one file content
    # but each has its own copy).
    seen_covers: set[Path] = set()
    for rec in placeholder_books:
        abs_cover: Path = rec["abs_cover"]
        if abs_cover in seen_covers:
            continue
        seen_covers.add(abs_cover)

        rel = abs_cover.relative_to(data_dir)
        backup_name = flatten_path(str(rel))
        shutil.copy2(abs_cover, backup_root / "images" / backup_name)
        manifest["images"].append({"original": str(rel), "backup": backup_name})

    seen_jsons: set[Path] = set()
    for rec in placeholder_books:
        bj: Path = rec["book_json"]
        if bj in seen_jsons:
            continue
        seen_jsons.add(bj)

        rel = bj.relative_to(data_dir)
        backup_name = flatten_path(str(rel))
        shutil.copy2(bj, backup_root / "book_jsons" / backup_name)
        manifest["book_jsons"].append({"original": str(rel), "backup": backup_name})

    for source in sorted(affected_sources):
        index_path = data_dir / source / "index.json"
        if not index_path.exists():
            continue
        backup_name = f"{source}_index.json"
        shutil.copy2(index_path, backup_root / "index_jsons" / backup_name)
        rel = index_path.relative_to(data_dir)
        manifest["index_jsons"].append({"original": str(rel), "backup": backup_name})

    (backup_root / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    return backup_root


# ---------------------------------------------------------------------------
# Clean phase
# ---------------------------------------------------------------------------


def clean(
    data_dir: Path,
    placeholder_books: list[dict],
) -> tuple[int, int, int]:
    """
    Delete cover files, null fields in book.json, patch index.json.
    Returns (files_deleted, jsons_updated, index_entries_patched).
    """
    files_deleted = 0
    jsons_updated = 0
    index_entries_patched = 0

    # --- 1. Patch book.json files and collect which local_paths we're clearing ---
    cleared_local_paths: set[str] = set()
    for rec in placeholder_books:
        abs_cover: Path = rec["abs_cover"]
        book_json: Path = rec["book_json"]
        local_path: str = rec["local_path"]

        # Delete image file
        try:
            abs_cover.unlink(missing_ok=True)
            files_deleted += 1
        except Exception as exc:
            logger.warning(f"Could not delete {abs_cover}: {exc}")

        # Null out fields in book.json
        try:
            data = json.loads(book_json.read_text(encoding="utf-8"))
            data["cover_image_local_path"] = None
            data["cover_image_url"] = None
            book_json.write_text(
                json.dumps(data, ensure_ascii=False, indent=None), encoding="utf-8"
            )
            jsons_updated += 1
        except Exception as exc:
            logger.warning(f"Could not update {book_json}: {exc}")

        cleared_local_paths.add(local_path)
        # Also track original URL in case index uses that
        if rec["original_url"]:
            cleared_local_paths.add(rec["original_url"])

    # --- 2. Patch index.json for each source ---
    sources = {
        rec["book_json"].relative_to(data_dir).parts[0] for rec in placeholder_books
    }

    for source in sources:
        index_path = data_dir / source / "index.json"
        if not index_path.exists():
            continue
        try:
            raw = json.loads(index_path.read_text(encoding="utf-8"))
            changed = False
            for entry in raw.get("books", []):
                url = entry.get("cover_image_url")
                if url and url in cleared_local_paths:
                    entry["cover_image_url"] = None
                    index_entries_patched += 1
                    changed = True
            if changed:
                atomic_write_json(index_path, raw)
        except Exception as exc:
            logger.warning(f"Could not patch {index_path}: {exc}")

    return files_deleted, jsons_updated, index_entries_patched


# ---------------------------------------------------------------------------
# Restore phase
# ---------------------------------------------------------------------------


def restore_from_backup(backup_dir: Path) -> None:
    manifest_path = backup_dir / "manifest.json"
    if not manifest_path.exists():
        typer.echo(f"ERROR: No manifest.json found in {backup_dir}", err=True)
        raise typer.Exit(code=1)

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    data_dir = Path(manifest["data_dir"])

    restored_images = 0
    restored_jsons = 0
    restored_indexes = 0

    for entry in manifest.get("images", []):
        src = backup_dir / "images" / entry["backup"]
        dst = data_dir / entry["original"]
        dst.parent.mkdir(parents=True, exist_ok=True)
        try:
            shutil.copy2(src, dst)
            restored_images += 1
        except Exception as exc:
            logger.warning(f"Could not restore {dst}: {exc}")

    for entry in manifest.get("book_jsons", []):
        src = backup_dir / "book_jsons" / entry["backup"]
        dst = data_dir / entry["original"]
        dst.parent.mkdir(parents=True, exist_ok=True)
        try:
            shutil.copy2(src, dst)
            restored_jsons += 1
        except Exception as exc:
            logger.warning(f"Could not restore {dst}: {exc}")

    for entry in manifest.get("index_jsons", []):
        src = backup_dir / "index_jsons" / entry["backup"]
        dst = data_dir / entry["original"]
        dst.parent.mkdir(parents=True, exist_ok=True)
        try:
            shutil.copy2(src, dst)
            restored_indexes += 1
        except Exception as exc:
            logger.warning(f"Could not restore {dst}: {exc}")

    print(f"\n{'=' * 60}")
    print("  Restore complete")
    print(f"{'=' * 60}")
    print(f"  Cover images restored : {restored_images}")
    print(f"  book.json restored    : {restored_jsons}")
    print(f"  index.json restored   : {restored_indexes}")
    print(f"  Source backup         : {backup_dir}")
    print(f"{'=' * 60}\n")


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------


@app.command()
def main(
    data_dir: Path = typer.Option(
        Path("data/book-data"),
        help="Root of book-data directory (relative to CWD or absolute).",
    ),
    execute: bool = typer.Option(
        False,
        "--execute",
        help="Apply changes. Default is dry-run (report only).",
    ),
    min_duplicates: int = typer.Option(
        2,
        "--min-duplicates",
        help="Minimum number of books sharing the same cover hash to be considered a placeholder.",
    ),
    restore: Path | None = typer.Option(
        None,
        "--restore",
        help="Restore from a backup dir created by a prior --execute run.",
    ),
) -> None:
    """
    Identify and remove placeholder cover images shared across multiple books.

    Dry-run by default — add --execute to apply changes (a backup is created first).
    """
    if restore is not None:
        restore_from_backup(restore)
        return

    data_dir = data_dir.resolve()
    if not data_dir.exists():
        typer.echo(f"ERROR: data-dir not found: {data_dir}", err=True)
        raise typer.Exit(code=1)

    print(f"\nScanning: {data_dir}")
    print(f"Mode    : {'EXECUTE' if execute else 'DRY-RUN'}")
    print(f"Min dup : {min_duplicates}\n")

    hash_groups, missing = collect_cover_info(data_dir)
    placeholder_hashes = {
        h for h, books in hash_groups.items() if len(books) >= min_duplicates
    }

    report(hash_groups, missing, min_duplicates, placeholder_hashes)

    if not execute:
        if placeholder_hashes:
            print(
                "Re-run with --execute to apply changes (a backup is created first).\n"
            )
        return

    if not placeholder_hashes:
        print("Nothing to clean.\n")
        return

    placeholder_books: list[dict] = []
    for h in placeholder_hashes:
        placeholder_books.extend(hash_groups[h])

    affected_sources = {
        rec["book_json"].relative_to(data_dir).parts[0] for rec in placeholder_books
    }

    # Backup first
    backup_dir = create_backup(data_dir, placeholder_books, affected_sources)
    print(f"Backup created: {backup_dir}\n")

    # Clean
    files_deleted, jsons_updated, index_entries_patched = clean(
        data_dir, placeholder_books
    )

    print(f"{'=' * 60}")
    print("  Cleanup complete")
    print(f"{'=' * 60}")
    print(f"  Cover files deleted      : {files_deleted}")
    print(f"  book.json updated        : {jsons_updated}")
    print(f"  index.json entries nulled: {index_entries_patched}")
    print("\nTo restore:")
    print(f"  uv run python tools/cleanup_placeholder_covers.py --restore {backup_dir}")
    print(f"{'=' * 60}\n")


if __name__ == "__main__":
    app()
