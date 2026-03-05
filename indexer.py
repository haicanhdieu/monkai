from __future__ import annotations

import json
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


def build_book_data_index(output_dir: Path, logger) -> None:
    """Scan data/book-data/ for BookData (schema v2.0) JSON files and build
    a central data/book-data/index.json manifest.

    UUID stability: UUIDs are only generated once on first encounter of a book
    (matched by source + source_book_id). Subsequent rebuilds reuse the existing UUID.
    """
    book_data_dir = output_dir / "book-data"
    index_path = book_data_dir / "index.json"

    # Load existing index to preserve UUIDs across rebuilds.
    # existing_uuid_map: {(source, source_book_id_str) -> uuid_str}
    existing_uuid_map: dict[tuple[str, str], str] = {}
    if index_path.exists():
        try:
            raw = json.loads(index_path.read_text(encoding="utf-8"))
            for entry in raw.get("books", []):
                # Determine source from the first artifact entry
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
        p for p in book_data_dir.rglob("*.json") if p.name != "index.json"
    )

    # book_key → BookIndexEntry (merge artifacts for same book)
    book_map: dict[tuple[str, str], BookIndexEntry] = {}

    for file_path in json_files:
        try:
            data = json.loads(file_path.read_text(encoding="utf-8"))
            book_data = BookData(**data)
        except Exception as e:
            logger.error(f"[indexer] Failed to parse {file_path}: {e}")
            continue

        # Derive source from first path component relative to book_data_dir
        try:
            rel = file_path.relative_to(book_data_dir)
        except ValueError:
            logger.error(f"[indexer] Cannot compute relative path for {file_path}")
            continue

        source = rel.parts[0]  # e.g. "vbeta"
        source_book_id = str(book_data.book_id)
        book_key = (source, source_book_id)

        # Resolve or generate UUID (stable across rebuilds)
        book_uuid = existing_uuid_map.get(book_key) or str(uuid.uuid4())
        # Cache it so subsequent files for same book reuse the same UUID
        existing_uuid_map[book_key] = book_uuid

        # Build artifact entry (path relative to book_data_dir)
        artifact_path = str(rel)  # e.g. "vbeta/kinh/bo-trung-quan.json"
        artifact = BookArtifact(
            source=source,
            format="json",
            path=artifact_path,
            built_at=book_data.meta.built_at,
        )

        if book_key in book_map:
            # Merge artifact into existing entry (avoid duplicates by path)
            existing_entry = book_map[book_key]
            existing_paths = {a.path for a in existing_entry.artifacts}
            if artifact_path not in existing_paths:
                existing_entry.artifacts.append(artifact)
        else:
            book_map[book_key] = BookIndexEntry(
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
                artifacts=[artifact],
            )

        # Add image artifacts from images/ subfolder alongside book.json
        img_dir = file_path.parent / "images"
        if img_dir.exists():
            for img_file in sorted(img_dir.iterdir()):
                if img_file.is_file():
                    img_rel = str(img_file.relative_to(book_data_dir))
                    img_artifact = BookArtifact(
                        source=source,
                        format="image",
                        path=img_rel,
                        built_at=book_data.meta.built_at,
                    )
                    entry = book_map[book_key]
                    existing_paths = {a.path for a in entry.artifacts}
                    if img_rel not in existing_paths:
                        entry.artifacts.append(img_artifact)

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
) -> None:
    cfg = load_config(config)
    logger = setup_logger("indexer")
    build_book_data_index(Path(cfg.output_dir), logger)


if __name__ == "__main__":
    app()

