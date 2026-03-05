import hashlib
import json
import sys
from pathlib import Path

import typer
from pydantic import ValidationError

from models import BookData, BookIndex
from utils.config import load_config
from utils.logging import setup_logger

app = typer.Typer()


def sha256_hash(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


@app.command()
def main(
    config: str = typer.Option(
        "config.yaml", "--config", help="Path to configuration file"
    ),
):
    """Scan all BookData (schema v2.0) json files and check quality gates."""
    try:
        app_config = load_config(config)
        output_dir = app_config.output_dir
    except Exception as e:
        typer.echo(f"Failed to load config from {config}: {e}")
        raise typer.Exit(code=1)

    logger = setup_logger("validate")

    book_data_dir = Path(output_dir) / "book-data"

    # Collect all *.json files excluding index.json
    book_files = sorted(
        p for p in book_data_dir.rglob("*.json") if p.name != "index.json"
    ) if book_data_dir.exists() else []

    total_files = len(book_files)

    # ── 4.1 Schema Validation (BookData v2.0) ────────────────────────────
    schema_pass = 0
    schema_fail = 0

    # ── Deduplication (hash pages HTML across all chapters) ───────────────
    seen_hashes: dict[str, str] = {}
    duplicates = 0
    total_hashes = 0

    for book_path in book_files:
        try:
            with open(book_path, "r", encoding="utf-8") as f:
                data = json.load(f)

            book_data = BookData(**data)
            schema_pass += 1

            # Combine all page html across all chapters for dedup
            combined_html = "".join(
                p.html_content
                for ch in book_data.chapters
                for p in ch.pages
            ).encode("utf-8")

            # Skip empty books from dedup — they all hash identically but are
            # not real content duplicates (source may not have pages yet)
            if not combined_html.strip():
                continue

            file_hash = sha256_hash(combined_html)

            total_hashes += 1
            if file_hash in seen_hashes:
                duplicates += 1
            else:
                seen_hashes[file_hash] = str(book_path)

        except ValidationError as e:
            schema_fail += 1
            for error in e.errors():
                loc = ".".join(str(loc_item) for loc_item in error["loc"])
                msg = error["msg"]
                logger.warning(f"Schema error in {book_path}: {loc} {msg}")
        except Exception as e:
            schema_fail += 1
            logger.warning(f"Error parsing {book_path}: {e}")

    # ── Crawl State stats ─────────────────────────────────────────────────
    downloaded = skipped = errored = 0
    crawl_state_path = Path(output_dir) / "crawl-state.json"
    if crawl_state_path.exists():
        try:
            with open(crawl_state_path, "r", encoding="utf-8") as f:
                state_dict = json.load(f)
            for status in state_dict.values():
                if status == "downloaded":
                    downloaded += 1
                elif status == "skipped":
                    skipped += 1
                elif status == "error":
                    errored += 1
        except Exception:
            pass

    # ── Run Summary Report ────────────────────────────────────────────────
    dup_rate = (duplicates / total_hashes * 100) if total_hashes > 0 else 0.0

    print("\n--- RUN SUMMARY REPORT ---")
    print(f"Crawl State: {downloaded} downloaded, {skipped} skipped, {errored} errored")
    print(f"BookData (v2) Files Found: {total_files}")
    print(f"Schema Validation: {schema_pass} passed, {schema_fail} failed")
    print(f"Duplicate rate: {dup_rate:.1f}% ({duplicates} duplicates of {total_hashes} files)")
    if dup_rate > 2.0:
        print(f"[WARN] Duplicate rate {dup_rate:.1f}% exceeds 2% threshold")

    # ── Phase 2 Handoff Quality Gates ────────────────────────────────────
    print("\n--- PHASE 2 HANDOFF QUALITY GATES ---")

    # Gate 1: ≥ 10 books in data/book-data/index.json
    index_record_count = 0
    index_valid = False
    index_path = Path(output_dir) / "book-data" / "index.json"
    if index_path.exists():
        try:
            with open(index_path, "r", encoding="utf-8") as f:
                index_raw = json.load(f)
            # Validate against BookIndex schema
            book_index = BookIndex(**index_raw)
            index_record_count = book_index.meta.total_books
            index_valid = True
        except Exception as e:
            logger.warning(f"Could not validate {index_path}: {e}")

    rule1 = index_record_count >= 10

    # Gate 2: At least 1 source dir exists under book-data/
    sources_crawled = (
        len([p for p in book_data_dir.iterdir() if p.is_dir()])
        if book_data_dir.exists()
        else 0
    )
    rule2 = sources_crawled >= 1

    # Gate 3: Duplicate rate < 2%
    rule3 = dup_rate < 2.0

    # Gate 4: All book files pass strict Pydantic validation
    rule4 = schema_fail == 0

    # Gate 5: index.json is valid BookIndex JSON with at least 1 entry
    rule5 = index_valid and index_record_count > 0

    def box(val: bool) -> str:
        return "[x]" if val else "[ ]"

    print(f"{box(rule1)} ≥ 10 book records in data/book-data/index.json ({index_record_count} found)")
    print(f"{box(rule2)} At least 1 source crawled with downloaded files")
    print(f"{box(rule3)} Duplicate rate < 2%")
    print(f"{box(rule4)} 100% of records passed strict Pydantic Canonical Validation")
    print(f"{box(rule5)} data/book-data/index.json is valid JSON matching the BookIndex schema")

    all_gates_passed = rule1 and rule2 and rule3 and rule4 and rule5

    if schema_fail > 0 or not all_gates_passed:
        print("\n[ERROR] Phase 2 Handoff Quality Gates or Schema Validation FAILED.")
        sys.exit(1)
    else:
        print(f"\nAll {schema_pass} records passed schema validation and all quality gates passed!")
        sys.exit(0)


if __name__ == "__main__":
    app()
