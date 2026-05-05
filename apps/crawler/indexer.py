from __future__ import annotations

import json
import logging
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path

import typer

from models import BookArtifact, BookData, BookIndex, BookIndexEntry, BookIndexMeta, BookIndexRecord, CrawlerConfig
from utils.config import load_config
from utils.logging import setup_logger

app = typer.Typer()


def scan_book_manifests(output_dir: Path) -> list[Path]:
    """Find all book.json manifest files under output_dir/book-data/.

    New structure: data/book-data/vbeta/{cat}/{book_seo}/book.json
    Excludes index.json. Returns sorted list.
    """
    books_dir = output_dir / "book-data"
    if not books_dir.exists():
        return []
    return sorted(p for p in books_dir.rglob("book.json"))


def load_existing_index(index_path: Path, logger) -> dict[str, BookIndexRecord]:
    """Load data/books/index.json into a {record.id: BookIndexRecord} dict.

    Returns empty dict if index_path does not exist or is corrupt.
    Logs a warning for each malformed entry and skips it without crashing.
    """
    if not index_path.exists():
        return {}
    try:
        entries = json.loads(index_path.read_text(encoding="utf-8"))
        result: dict[str, BookIndexRecord] = {}
        for entry in entries:
            try:
                record = BookIndexRecord(**entry)
                result[record.id] = record
            except Exception as e:
                logger.warning(f"[indexer] Skipping malformed index entry: {e}")
        return result
    except Exception:
        return {}  # Corrupt index.json → start fresh


def manifest_to_book_record(manifest_path: Path, logger) -> BookIndexRecord | None:
    """Convert a vbeta ChapterBookData JSON into a book-level BookIndexRecord.

    Will use the BookInfo within the file to construct the top-level index record.
    Duplicate book records handled by id idempotency in `build_index`.
    """
    try:
        from models import ChapterBookData
        data = json.loads(manifest_path.read_text(encoding="utf-8"))
        
        # If it's a legacy manifest, try those fields
        if "book_slug" in data:
            return BookIndexRecord(
                id=data["book_slug"],
                title=data["book_title"],
                category=data.get("category", "Nikaya"),
                subcategory=data.get("subcategory", ""),
                source=data.get("source", "legacy"),
                author_translator=data.get("author_translator"),
                total_chapters=data.get("total_chapters", 0),
                manifest_path=str(manifest_path),
            )
            
        # Parse canonical ChapterBookData format    
        chapter_data = ChapterBookData(**data)
        book_info = chapter_data.book
        
        # Ensure category aligns with Literal type or defaults to Nikaya
        valid_cats = ["Nikaya", "Đại Thừa", "Mật Tông", "Thiền", "Tịnh Độ"]
        cat = book_info.category_name if book_info.category_name in valid_cats else "Nikaya"
        
        return BookIndexRecord(
            id=book_info.seo_name,
            title=book_info.name,
            category=cat,
            subcategory="",
            source=chapter_data.meta.source,
            author_translator=book_info.author,
            total_chapters=0,  # Or unknown without fetching the whole TOC again
            manifest_path=str(manifest_path.parent) # Just storing the directory for the book as manifest_path
        )
    except Exception as e:
        logger.error(f"[indexer] Failed to process {manifest_path}: {e}")
        return None


def build_index(cfg: CrawlerConfig, logger) -> None:
    """Build or incrementally update data/books/index.json from all book manifests.

    Idempotent: records already in the index (by id) are never overwritten.
    New records are appended.
    """
    output_dir = Path(cfg.output_dir)
    index_path = output_dir / "books" / "index.json"

    existing: dict[str, BookIndexRecord] = load_existing_index(index_path, logger)
    # Legacy scan: finds chapter-level JSON files (not book.json or index.json)
    # scan_book_manifests() now only finds book.json (new structure); build_index is legacy
    legacy_books_dir = output_dir / "book-data"
    if legacy_books_dir.exists():
        manifest_files = sorted(
            p for p in legacy_books_dir.rglob("*.json")
            if p.name not in ("index.json", "book.json")
        )
    else:
        manifest_files = []

    excluded_count = 0

    for manifest_path in manifest_files:
        record = manifest_to_book_record(manifest_path, logger)
        if record is None:
            excluded_count += 1
            continue
        if record.id not in existing:
            existing[record.id] = record  # only add genuinely new records

    # Serialize with stable insertion order (Python 3.7+ dicts preserve order)
    records = list(existing.values())
    index_path.parent.mkdir(parents=True, exist_ok=True)
    index_path.write_text(
        json.dumps([r.model_dump() for r in records], ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    logger.info(
        f"[indexer] Indexed {len(records)} books, {excluded_count} excluded (errors)"
    )


def _entry_from_book_json(
    file_path: Path,
    book_data_dir: Path,
    source: str | None,
    existing_uuid_map: dict[tuple[str, str], str],
    logger: logging.Logger,
) -> tuple[tuple[str, str], BookIndexEntry, list[BookArtifact]] | None:
    """Parse one book.json into a BookIndexEntry plus its image artifacts.

    Returns (book_key, entry, image_artifacts) on success, None on parse failure.
    Updates existing_uuid_map in place so callers can persist UUIDs across calls.
    """
    try:
        data = json.loads(file_path.read_text(encoding="utf-8"))
        book_data = BookData(**data)
    except Exception as e:
        logger.error(f"[indexer] Failed to parse {file_path}: {e}")
        return None

    try:
        rel = file_path.relative_to(book_data_dir)
    except ValueError:
        logger.error(f"[indexer] Cannot compute relative path for {file_path}")
        return None

    derived_source = source if source else rel.parts[0]
    source_book_id = str(book_data.book_id)
    book_key = (derived_source, source_book_id)

    book_uuid = existing_uuid_map.get(book_key) or str(uuid.uuid4())
    existing_uuid_map[book_key] = book_uuid

    artifact_path = str(rel)
    json_artifact = BookArtifact(
        source=derived_source,
        format="json",
        path=artifact_path,
        built_at=book_data.meta.built_at,
    )

    image_artifacts: list[BookArtifact] = []
    img_dir = file_path.parent / "images"
    if img_dir.exists():
        for img_file in sorted(img_dir.iterdir()):
            if img_file.is_file():
                image_artifacts.append(
                    BookArtifact(
                        source=derived_source,
                        format="image",
                        path=str(img_file.relative_to(book_data_dir)),
                        built_at=book_data.meta.built_at,
                    )
                )

    entry = BookIndexEntry(
        id=book_uuid,
        source_book_id=source_book_id,
        book_name=book_data.book_name,
        book_seo_name=book_data.book_seo_name,
        cover_image_url=book_data.cover_image_local_path or book_data.cover_image_url,
        author=book_data.author,
        publisher=book_data.publisher,
        publication_year=book_data.publication_year,
        category_id=book_data.category_id,
        category_name=book_data.category_name,
        category_seo_name=book_data.category_seo_name,
        total_chapters=book_data.total_chapters,
        artifacts=[json_artifact],
        source=derived_source,
    )
    return book_key, entry, image_artifacts


def append_book_to_index(
    output_dir: Path,
    source: str,
    book_json_path: Path,
    logger: logging.Logger,
) -> bool:
    """Append-only incremental update of data/book-data/{source}/index.json.

    Single-writer assumption: this helper does not coordinate across processes.
    Run only one crawler at a time against a given index file.

    Behavior:
      - If the new book's (source, source_book_id) is already present → no write.
      - If the index is corrupt, it is quarantined (renamed to index.json.corrupt-{ts})
        rather than silently overwritten — preserving prior entries for recovery.
      - Existing entries are kept as-is (raw dicts), so unknown/extra fields survive
        across appends.
      - _meta.built_at is preserved across appends; only the very first write
        (or a fresh start after quarantine / --no-resume) sets it to now.

    Returns True if a new entry was added, False if skipped (already present,
    parse failure, etc.).
    """
    book_data_dir = output_dir / "book-data"
    index_path = book_data_dir / source / "index.json"
    tmp_path = index_path.with_suffix(index_path.suffix + ".tmp")

    # Clean up stragglers from a SIGKILL'd prior run before starting our own write.
    tmp_path.unlink(missing_ok=True)

    existing_uuid_map: dict[tuple[str, str], str] = {}
    existing_books: list[dict] = []
    existing_keys: set[tuple[str, str]] = set()
    existing_meta: dict | None = None
    index_loaded_ok = False
    if index_path.exists():
        try:
            raw = json.loads(index_path.read_text(encoding="utf-8"))
            existing_books = list(raw.get("books", []))
            existing_meta = raw.get("_meta")
            for entry_dict in existing_books:
                entry_source = entry_dict.get("source", "") or (
                    entry_dict.get("artifacts", [{}])[0].get("source", "")
                    if entry_dict.get("artifacts")
                    else ""
                )
                entry_book_id = str(entry_dict.get("source_book_id", ""))
                if entry_source and entry_book_id:
                    key = (entry_source, entry_book_id)
                    existing_keys.add(key)
                    if "id" in entry_dict:
                        existing_uuid_map[key] = entry_dict["id"]
            index_loaded_ok = True
        except Exception as e:
            # Quarantine the corrupt index so prior entries are preserved for recovery.
            quarantine_path = index_path.with_name(
                f"index.json.corrupt-{int(datetime.now(tz=timezone.utc).timestamp())}"
            )
            try:
                os.replace(index_path, quarantine_path)
                logger.error(
                    f"[indexer] Corrupt index quarantined: {index_path} → "
                    f"{quarantine_path.name} ({e})"
                )
            except Exception as quarantine_err:
                logger.error(
                    f"[indexer] Index unreadable AND quarantine failed: "
                    f"{quarantine_err}; refusing to write"
                )
                return False
            existing_books = []
            existing_meta = None
            existing_keys = set()
            existing_uuid_map = {}

    parsed = _entry_from_book_json(
        book_json_path, book_data_dir, source, existing_uuid_map, logger
    )
    if parsed is None:
        return False
    book_key, entry, image_artifacts = parsed

    if book_key in existing_keys:
        return False  # append-only: never overwrite

    entry.artifacts.extend(image_artifacts)
    new_book_dict = json.loads(entry.model_dump_json(by_alias=True))
    existing_books.append(new_book_dict)

    # Preserve _meta.built_at across appends; refresh only on first creation
    # (no prior meta present) so caches keyed on built_at don't churn per book.
    if existing_meta and "built_at" in existing_meta:
        built_at_str = existing_meta["built_at"]
    else:
        built_at_str = datetime.now(tz=timezone.utc).isoformat()
    schema_version = (
        existing_meta.get("schema_version") if existing_meta else None
    ) or "1.0"

    out_doc = {
        "_meta": {
            "schema_version": schema_version,
            "built_at": built_at_str,
            "total_books": len(existing_books),
        },
        "books": existing_books,
    }

    index_path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path.write_text(
        json.dumps(out_doc, ensure_ascii=False, indent=2, default=str),
        encoding="utf-8",
    )
    os.replace(tmp_path, index_path)

    if not index_loaded_ok:
        logger.info(f"[indexer] Created new index: {index_path}")
    logger.info(
        f"[indexer] Appended book to index: {entry.book_name} → {index_path}"
    )
    return True


def build_book_data_index(output_dir: Path, logger, source: str | None = None) -> None:
    """Scan data/book-data/ for BookData (schema v2.0) JSON files and build
    a central data/book-data/index.json manifest.

    UUID stability: UUIDs are only generated once on first encounter of a book
    (matched by source + source_book_id). Subsequent rebuilds reuse the existing UUID.

    If `source` is provided, only books under book-data/{source}/ are scanned and the
    index is written to book-data/{source}/index.json.
    """
    book_data_dir = output_dir / "book-data"
    scan_root = book_data_dir / source if source else book_data_dir
    index_path = scan_root / "index.json"

    # Load existing index to preserve UUIDs across rebuilds.
    # existing_uuid_map: {(derived_source, source_book_id_str) -> uuid_str}
    existing_uuid_map: dict[tuple[str, str], str] = {}
    if index_path.exists():
        try:
            raw = json.loads(index_path.read_text(encoding="utf-8"))
            for entry in raw.get("books", []):
                # Prefer the top-level source field; fall back to artifacts[0] for
                # legacy indexes written before the source field was added.
                src = entry.get("source", "")
                if not src:
                    artifacts = entry.get("artifacts", [])
                    if artifacts:
                        src = artifacts[0].get("source", "")
                src_book_id = str(entry.get("source_book_id", ""))
                if src and src_book_id:
                    existing_uuid_map[(src, src_book_id)] = entry["id"]
        except Exception as e:
            logger.warning(f"[indexer] Could not load existing index for UUID preservation: {e}")

    # Scan all *.json files, excluding index.json itself
    if not book_data_dir.exists():
        logger.warning(f"[indexer] book-data directory not found: {book_data_dir}")
        return

    json_files = sorted(
        p for p in scan_root.rglob("*.json") if p.name != "index.json"
    )

    # book_key → BookIndexEntry (merge artifacts for same book)
    book_map: dict[tuple[str, str], BookIndexEntry] = {}

    for file_path in json_files:
        result = _entry_from_book_json(
            file_path, book_data_dir, source, existing_uuid_map, logger
        )
        if result is None:
            continue
        book_key, entry, image_artifacts = result

        if book_key in book_map:
            existing_entry = book_map[book_key]
            existing_paths = {a.path for a in existing_entry.artifacts}
            for artifact in entry.artifacts:
                if artifact.path not in existing_paths:
                    existing_entry.artifacts.append(artifact)
                    existing_paths.add(artifact.path)
            for img_artifact in image_artifacts:
                if img_artifact.path not in existing_paths:
                    existing_entry.artifacts.append(img_artifact)
                    existing_paths.add(img_artifact.path)
        else:
            entry.artifacts.extend(image_artifacts)
            book_map[book_key] = entry

    books = list(book_map.values())
    index = BookIndex(
        **{
            "_meta": BookIndexMeta(
                schema_version="1.0",
                built_at=datetime.now(tz=timezone.utc),
                total_books=len(books),
            )
        },
        books=books,
    )

    index_path.parent.mkdir(parents=True, exist_ok=True)
    index_path.write_text(
        index.model_dump_json(by_alias=True, indent=2),
        encoding="utf-8",
    )

    logger.info(
        f"[indexer] Built book-data index: {len(books)} books → {index_path}"
    )


@app.command()
def index(
    config: str = typer.Option("config.yaml", help="Config file path"),
) -> None:
    cfg = load_config(config)
    logger = setup_logger("indexer")
    build_index(cfg, logger)


@app.command(name="build-index")
def build_index_cmd(
    config: str = typer.Option("config.yaml", help="Config file path"),
    source: str = typer.Option(None, help="Source name to index (e.g. vnthuquan). Omit for default full scan."),
) -> None:
    cfg = load_config(config)
    logger = setup_logger("indexer")
    build_book_data_index(Path(cfg.output_dir), logger, source=source)


if __name__ == "__main__":
    app()

