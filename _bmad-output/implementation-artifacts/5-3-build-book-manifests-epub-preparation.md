# Story 5.3: Build Book Manifests for EPUB Preparation (book_builder.py)

## Story

As a developer,
I want `book_builder.py` to group parsed chapter meta JSONs into ordered book manifest files,
So that the EPUB generation phase has a ready-to-use, sorted chapter list per book.

## Status: ready-for-dev

## Context

After Story 5.2, each meta JSON has correct `book_title`, `category`, `author_translator`, `chapter`, `url`.
We need to group them by `book_title` and sort chapters in filename numeric order.

### Output format: `data/books/thuvienkinhphat/{book-slug}.json`

```json
{
  "book_title": "Kinh Trường Bộ",
  "book_slug": "kinh-truong-bo",
  "category": "Kinh Tạng",
  "subcategory": "",
  "author_translator": "Hòa thượng Thích Minh Châu",
  "cover_image_url": null,
  "source": "thuvienkinhphat",
  "total_chapters": 34,
  "chapters": [
    {
      "order": 1,
      "chapter": "1. Kinh Phạm võng(Brahmajàla sutta)",
      "meta_file": "truong01.json",
      "url": "https://thuvienkinhphat.net/buddha-sasana/kinh-truongbo/truong01.html",
      "file_path": "data/raw/thuvienkinhphat/truong01.html"
    }
  ]
}
```

### Chapter Sort Order
Sort by extracting the numeric suffix from the filename stem:
- `truong01` → 1, `truong02` → 2, ..., `truong34` → 34
- `bkni01` → 1, `bkni02` → 2
- `vdp1-01` → 1 (extract last numeric run)

Python: `re.search(r'(\d+)$', stem)` — match digits at end of stem.

## Files to Create

- `/Users/minhtrucnguyen/working/monkai/book_builder.py` — new Typer CLI module

## Implementation

```python
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
    """Extract numeric sort order from meta filename stem."""
    stem = Path(meta_file).stem
    match = re.search(r'(\d+)$', stem)
    return int(match.group(1)) if match else 9999


def build_books(source_name: str, meta_dir: Path, books_dir: Path, logger) -> None:
    """Group meta JSONs by book_title and write ordered book manifests."""
    meta_files = sorted(meta_dir.glob("*.json"))
    books: dict[str, dict] = {}

    for meta_path in meta_files:
        try:
            data = json.loads(meta_path.read_text(encoding="utf-8"))
        except Exception as e:
            logger.warning(f"[book_builder] Cannot read {meta_path}: {e}")
            continue

        book_title = data.get("book_title")
        if not book_title:
            logger.debug(f"[book_builder] No book_title, skipping: {meta_path.name}")
            continue

        if book_title not in books:
            books[book_title] = {
                "book_title": book_title,
                "book_slug": make_id("", book_title).lstrip("__"),
                "category": data.get("category", ""),
                "subcategory": data.get("subcategory", ""),
                "author_translator": data.get("author_translator"),
                "cover_image_url": None,
                "source": source_name,
                "chapters": [],
            }

        books[book_title]["chapters"].append({
            "order": extract_chapter_order(meta_path.name),
            "chapter": data.get("chapter"),
            "meta_file": meta_path.name,
            "url": data.get("url", ""),
            "file_path": data.get("file_path", ""),
        })

    books_dir.mkdir(parents=True, exist_ok=True)
    for book_title, manifest in books.items():
        # Sort chapters by order
        manifest["chapters"].sort(key=lambda c: c["order"])
        manifest["total_chapters"] = len(manifest["chapters"])

        slug = manifest["book_slug"]
        out_path = books_dir / f"{slug}.json"
        out_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
        logger.info(f"[book_builder] Wrote {out_path} ({manifest['total_chapters']} chapters)")

    logger.info(f"[book_builder] Built {len(books)} book manifests for source '{source_name}'")


@app.command()
def build(
    source: str = typer.Option("thuvienkinhphat", help="Source name"),
    config: str = typer.Option("config.yaml", help="Config file path"),
) -> None:
    cfg = load_config(config)
    logger = setup_logger("book_builder")
    sources = cfg.sources if source == "all" else [s for s in cfg.sources if s.name == source]
    if not sources:
        logger.error(f"[book_builder] No source found: {source}")
        raise typer.Exit(1)
    for src in sources:
        meta_dir = Path(cfg.output_dir) / "meta" / src.name
        books_dir = Path(cfg.output_dir) / "books" / src.name
        build_books(src.name, meta_dir, books_dir, logger)


if __name__ == "__main__":
    app()
```

## Acceptance Criteria

- `uv run python book_builder.py --help` shows help
- After run, `data/books/thuvienkinhphat/` contains one JSON per book (expected ~30 books)
- `kinh-truong-bo.json` has 34 chapters in order 1..34
- `gioi-bon-ty-khuu-ni.json` has 2 chapters in order 1, 2
- Running twice produces identical output (idempotent)
- Books with multiple TOC sub-sections still appear as one manifest

## Testing

```bash
uv run python book_builder.py --source thuvienkinhphat

# Check output
python -c "
import json, os
books_dir = 'data/books/thuvienkinhphat'
files = sorted(os.listdir(books_dir))
print(f'Total books: {len(files)}')
for f in files[:5]:
    m = json.load(open(f'{books_dir}/{f}'))
    print(f'{m[\"book_title\"]}: {m[\"total_chapters\"]} chapters, translator={m[\"author_translator\"]}')
"

# Verify chapter ordering
python -c "
import json
m = json.load(open('data/books/thuvienkinhphat/kinh-truong-bo.json'))
orders = [c['order'] for c in m['chapters']]
print('Orders:', orders)
assert orders == sorted(orders), 'Chapter order not sorted!'
print('Order OK')
"
```
