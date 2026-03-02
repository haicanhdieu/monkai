from __future__ import annotations

import json
from pathlib import Path

import typer

from models import BookIndexRecord, CrawlerConfig
from utils.config import load_config
from utils.logging import setup_logger

app = typer.Typer()


def scan_book_manifests(output_dir: Path) -> list[Path]:
    """Recursively find all book manifest .json files under output_dir/books.

    Excludes index.json itself. Returns a sorted list for deterministic processing order.
    Returns [] if output_dir/books does not exist.
    """
    books_dir = output_dir / "books"
    if not books_dir.exists():
        return []
    return sorted(p for p in books_dir.rglob("*.json") if p.name != "index.json")


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
    """Convert a book manifest JSON to a BookIndexRecord.

    Returns None on any exception; logs error.
    No disk consistency check needed (book manifests are always fresh from book_builder).
    """
    try:
        data = json.loads(manifest_path.read_text(encoding="utf-8"))
        return BookIndexRecord(
            id=data["book_slug"],
            title=data["book_title"],
            category=data["category"],
            subcategory=data.get("subcategory", ""),
            source=data["source"],
            author_translator=data.get("author_translator"),
            total_chapters=data.get("total_chapters", 0),
            manifest_path=str(manifest_path),
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
    manifest_files = scan_book_manifests(output_dir)

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


@app.command()
def index(
    config: str = typer.Option("config.yaml", help="Config file path"),
) -> None:
    cfg = load_config(config)
    logger = setup_logger("indexer")
    build_index(cfg, logger)


if __name__ == "__main__":
    app()
