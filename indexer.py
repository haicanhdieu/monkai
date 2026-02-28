from __future__ import annotations

import json
from pathlib import Path

import typer

from models import CrawlerConfig, IndexRecord, ScriptureMetadata
from utils.config import load_config
from utils.logging import setup_logger

app = typer.Typer()


def scan_meta_files(output_dir: Path) -> list[Path]:
    """Recursively find all .json metadata files under output_dir/meta.

    Returns a sorted list for deterministic processing order.
    """
    meta_dir = output_dir / "meta"
    if not meta_dir.exists():
        return []
    return sorted(meta_dir.rglob("*.json"))


def load_existing_index(index_path: Path, logger) -> dict[str, IndexRecord]:
    """Load data/index.json into a {record.id: IndexRecord} dict.

    Returns empty dict if index_path does not exist or is corrupt.
    Logs a warning for each malformed entry and skips it without crashing.
    """
    if not index_path.exists():
        return {}
    try:
        entries = json.loads(index_path.read_text(encoding="utf-8"))
        result: dict[str, IndexRecord] = {}
        for entry in entries:
            try:
                record = IndexRecord(**entry)
                result[record.id] = record
            except Exception as e:
                logger.warning(f"[indexer] Skipping malformed index entry: {e}")
        return result
    except Exception:
        return {}  # Corrupt index.json → start fresh


def meta_to_index_record(meta_path: Path, logger) -> IndexRecord | None:
    """Convert a .meta.json file to an IndexRecord, with disk consistency check.

    Returns None if:
    - meta.json is missing, unreadable, or fails ScriptureMetadata validation
    - The referenced file_path does not exist on disk or is empty (orphaned record)
    Never raises — all exceptions are caught and logged.
    """
    try:
        content = meta_path.read_text(encoding="utf-8")
        meta = ScriptureMetadata.model_validate_json(content)

        # Disk consistency check: raw file must exist and be non-empty
        file_path = Path(meta.file_path)
        if not file_path.exists() or file_path.stat().st_size == 0:
            logger.warning(
                f"[indexer] Orphaned meta.json (file missing): {meta_path}"
            )
            return None

        return IndexRecord(
            id=meta.id,
            title=meta.title,
            category=meta.category,
            subcategory=meta.subcategory,
            source=meta.source,
            url=meta.url,
            file_path=meta.file_path,
            file_format=meta.file_format,
            copyright_status=meta.copyright_status,
        )
    except Exception as e:
        logger.error(f"[indexer] Failed to process {meta_path}: {e}")
        return None


def build_index(cfg: CrawlerConfig, logger) -> None:
    """Build or incrementally update data/index.json from all .meta.json files.

    Idempotent: records already in the index (by id) are never overwritten.
    New records are appended. Orphaned records (missing raw file) are excluded.
    """
    output_dir = Path(cfg.output_dir)
    index_path = output_dir / "index.json"

    existing: dict[str, IndexRecord] = load_existing_index(index_path, logger)
    meta_files = scan_meta_files(output_dir)

    excluded_count = 0  # counts both orphans (missing file) and meta.json parse errors

    for meta_path in meta_files:
        record = meta_to_index_record(meta_path, logger)
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
        f"[indexer] Indexed {len(records)} records, {excluded_count} excluded (orphans or errors)"
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
