from __future__ import annotations

import json
import re
from pathlib import Path

import typer

from utils.config import load_config
from utils.logging import setup_logger
from utils.slugify import make_id

app = typer.Typer()


def extract_chapter_order(meta_file: str) -> int:
    """Extract numeric sort order from meta filename stem.

    Examples:
        truong01.json → 1
        truong34.json → 34
        bkni02.json   → 2
        vdp1-01.json  → 1 (uses last numeric run)
        tu5-56b.json  → 56 (uses last numeric run)
    """
    stem = Path(meta_file).stem
    # Match the last run of digits (handles cases like tu5-56b → 56)
    match = re.search(r"(\d+)[^0-9]*$", stem)
    return int(match.group(1)) if match else 9999


def build_books(source_name: str, meta_dir: Path, books_dir: Path, logger) -> None:
    """Group meta JSONs by book_title and write ordered book manifests.

    Output: one JSON per book at books_dir/{book-slug}.json
    Each manifest contains book-level metadata and a sorted chapters list.
    """
    meta_files = sorted(meta_dir.glob("*.json"))
    if not meta_files:
        logger.warning(f"[book_builder] No meta JSON files found in {meta_dir}")
        return

    # Group chapters by book_title
    books: dict[str, dict] = {}

    for meta_path in meta_files:
        try:
            data = json.loads(meta_path.read_text(encoding="utf-8"))
        except Exception as e:
            logger.warning(f"[book_builder] Cannot read {meta_path.name}: {e}")
            continue

        book_title = data.get("book_title")
        if not book_title:
            logger.debug(f"[book_builder] No book_title, skipping: {meta_path.name}")
            continue

        if book_title not in books:
            books[book_title] = {
                "book_title": book_title,
                "book_slug": make_id("", book_title).lstrip("_"),
                "category": data.get("category", ""),
                "subcategory": data.get("subcategory", ""),
                "author_translator": data.get("author_translator"),
                "cover_image_url": None,
                "source": source_name,
                "chapters": [],
            }
        else:
            # Warn when chapters within the same book disagree on these book-level fields
            book = books[book_title]
            if data.get("category", "") and data.get("category") != book["category"]:
                logger.warning(
                    f"[book_builder] category mismatch in '{book_title}': "
                    f"'{data['category']}' vs '{book['category']}' ({meta_path.name})"
                )
            if data.get("author_translator") and data.get("author_translator") != book["author_translator"]:
                logger.warning(
                    f"[book_builder] author_translator mismatch in '{book_title}': "
                    f"'{data['author_translator']}' vs '{book['author_translator']}' ({meta_path.name})"
                )

        books[book_title]["chapters"].append(
            {
                "order": extract_chapter_order(meta_path.name),
                "id": data.get("id", ""),
                "title": data.get("title", ""),
                "title_pali": data.get("title_pali"),
                "title_sanskrit": data.get("title_sanskrit"),
                "chapter": data.get("chapter"),
                "category": data.get("category", ""),
                "subcategory": data.get("subcategory", ""),
                "book_collection": data.get("book_collection"),
                "author_translator": data.get("author_translator"),
                "content": data.get("content"),
                "source": data.get("source", ""),
                "url": data.get("url", ""),
                "file_path": data.get("file_path", ""),
                "file_format": data.get("file_format", "other"),
                "copyright_status": data.get("copyright_status", "unknown"),
                "created_at": data.get("created_at", ""),
            }
        )

    # Write one manifest per book
    books_dir.mkdir(parents=True, exist_ok=True)
    for book_title, manifest in books.items():
        # Sort chapters by numeric order extracted from filename
        manifest["chapters"].sort(key=lambda c: c["order"])
        manifest["total_chapters"] = len(manifest["chapters"])

        slug = manifest["book_slug"]
        out_path = books_dir / f"{slug}.json"
        out_path.write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        logger.info(
            f"[book_builder] {out_path.name}: {manifest['total_chapters']} chapters"
        )

    logger.info(f"[book_builder] Built {len(books)} book manifests for '{source_name}'")


@app.command()
def build(
    source: str = typer.Option("thuvienkinhphat", help="Source name or 'all'"),
    config: str = typer.Option("config.yaml", help="Config file path"),
) -> None:
    """Group parsed chapter meta JSONs into ordered EPUB-ready book manifests."""
    cfg = load_config(config)
    logger = setup_logger("book_builder")

    sources = (
        cfg.sources
        if source == "all"
        else [s for s in cfg.sources if s.name == source]
    )
    if not sources:
        logger.error(f"[book_builder] No source found: {source}")
        raise typer.Exit(1)

    for src in sources:
        meta_dir = Path(cfg.output_dir) / "meta" / src.name
        books_dir = Path(cfg.output_dir) / "books" / src.name
        build_books(src.name, meta_dir, books_dir, logger)


if __name__ == "__main__":
    app()
