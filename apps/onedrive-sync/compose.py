"""Build index records and compose the onedrive/index.json fragment.

epubUrl decision: stored as book-data-relative path (onedrive/nhasachmienphi/<basename>)
so that it stays stable across cloudflared tunnel changes. Story 2.3 adds reader-side
resolution mirroring resolveCoverUrl ({base}/book-data/{epubUrl}).

id-in-filename: ids contain colons (onedrive:source:slug). Colons are valid in
URL path segments but cause issues on some filesystems. We sanitize the id to
onedrive__source__slug for filenames only; the canonical colon id is kept in the
record's `id` field and in cover_image_url/epubUrl values.
"""

import json
import os
import tempfile
from pathlib import Path

from categories import CategoryResult
from dedup import DeduplicatedBook


def id_to_filename(book_id: str) -> str:
    """Sanitize a book id for use in filenames: replace `:` with `__`."""
    return book_id.replace(":", "__")


def build_record(book: DeduplicatedBook, cat_result: CategoryResult) -> dict:
    """Build a catalog index record for one book."""
    entry = book.entry
    epub_basename = os.path.basename(entry.epubFile or "")
    safe_id = id_to_filename(book.id)

    return {
        "id": book.id,
        "book_name": entry.title,
        "category_name": cat_result.category_name,
        "author": entry.author,
        "cover_image_url": f"onedrive/cover/{safe_id}.jpg",
        "source": "onedrive",
        "epubUrl": f"onedrive/nhasachmienphi/{epub_basename}",
        "manifest_category": cat_result.original_category,
    }


def compose(existing_index: dict, onedrive_fragment: dict) -> dict:
    """Merge onedrive fragment into existing_index, namespace-scoped by 'onedrive:' prefix.

    All existing records with non-onedrive ids are preserved untouched.
    All onedrive: records from the fragment replace any prior onedrive: records.
    Result books[] is sorted by id. Atomic write is handled by the caller.
    """
    if not isinstance(existing_index, dict):
        existing_index = {}
    existing_books = [
        b for b in existing_index.get("books", [])
        if not b.get("id", "").startswith("onedrive:")
    ]
    od_books = onedrive_fragment.get("books", [])
    merged = existing_books + od_books
    merged.sort(key=lambda b: b.get("id", ""))
    return {
        "_meta": onedrive_fragment.get("_meta", existing_index.get("_meta", {})),
        "books": merged,
    }


def write_atomic(path: Path, data: dict) -> None:
    """Write JSON atomically using a temp file + os.replace."""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp_fd, tmp_path = tempfile.mkstemp(dir=path.parent, suffix=".tmp")
    try:
        with os.fdopen(tmp_fd, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        os.replace(tmp_path, path)
    except Exception:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        raise
