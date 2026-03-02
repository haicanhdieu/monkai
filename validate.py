import json
from pathlib import Path

import typer
from pydantic import ValidationError

import hashlib
from models import BookIndexRecord, ChapterBookData
from utils.config import load_config
from utils.logging import setup_logger

app = typer.Typer()

def sha256_hash(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()

@app.command()
def main(
    config: str = typer.Option(
        "config.yaml", "--config", help="Path to configuration file"
    )
):
    """Scan all Canonical ChapterBookData json files, report on deduplication, and check quality gates."""
    # 🟠 HIGH ISSUE FIX: Load config
    try:
        app_config = load_config(config)
        output_dir = app_config.output_dir
    except Exception as e:
        typer.echo(f"Failed to load config from {config}: {e}")
        raise typer.Exit(code=1)

    logger = setup_logger("validate")
    
    meta_files = list(Path(output_dir).glob("book-data/**/*.json"))
    total_meta_files = len(meta_files)
    
    # 4.1 Schema Validation
    schema_pass = 0
    schema_fail = 0
    
    # Deduplication
    seen_hashes = {}
    duplicates = 0
    total_hashes = 0
    
    for meta_path in meta_files:
        try:
            with open(meta_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            
            # Validate schema
            chapter_data = ChapterBookData(**data)
            schema_pass += 1
            
            # Deduplication check (pseudo hash using domain mapping)
            # In Phase 1 we hashed raw HTML, here we can hash the combined Canonical HTML
            combined_html = "".join([p.html_content for p in chapter_data.pages]).encode("utf-8")
            file_hash = sha256_hash(combined_html)
            
            total_hashes += 1
            if file_hash in seen_hashes:
                duplicates += 1
            else:
                seen_hashes[file_hash] = str(meta_path)
            
        except ValidationError as e:
            schema_fail += 1
            for error in e.errors():
                loc = ".".join(str(loc_item) for loc_item in error["loc"])
                msg = error["msg"]
                logger.warning(f"Schema error in {meta_path}: {loc} {msg}")
        except Exception as e:
            schema_fail += 1
            logger.warning(f"Error parsing in {meta_path}: {e}")
            
    # Crawl State stats
    downloaded = 0
    skipped = 0
    errored = 0
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
            
    # Print Run Summary Report (Story 4.2)
    print("\n--- RUN SUMMARY REPORT ---")
    print(f"Crawl State: {downloaded} downloaded, {skipped} skipped, {errored} errored")
    print(f"Canonical Chapter Files Found: {total_meta_files}")
    print(f"Schema Validation: {schema_pass} passed, {schema_fail} failed")
    
    dup_rate = 0.0
    if total_hashes > 0:
        dup_rate = (duplicates / total_hashes) * 100
    print(f"Duplicate rate: {dup_rate:.1f}% ({duplicates} duplicates of {total_hashes} files)")
    if dup_rate > 2.0:
        print(f"[WARN] Duplicate rate {dup_rate:.1f}% exceeds 2% threshold")
        
    # Phase 2 Handoff Verification (Story 4.3)
    print("\n--- PHASE 2 HANDOFF QUALITY GATES ---")
    
    # 1. ≥ 10 unique records in data/index.json
    index_record_count = 0
    index_valid_json = False
    index_records_valid_schema = True
    index_path = Path(output_dir) / "books" / "index.json"
    if index_path.exists():
        try:
            with open(index_path, "r", encoding="utf-8") as f:
                index_data = json.load(f)
            index_valid_json = isinstance(index_data, list)
            if index_valid_json:
                index_record_count = len(index_data)
                # Verify schema format
                for rec in index_data:
                    try:
                        _ = BookIndexRecord(**rec)
                    except ValidationError:
                        index_records_valid_schema = False
                        break
        except Exception:
            pass
            
    rule1 = index_record_count >= 10
    
    # 2. At least 1 source crawled with downloaded files (directory exists and files downloaded).
    sources_crawled = len(list((Path(output_dir) / "book-data").glob("*"))) if (Path(output_dir) / "book-data").exists() else 0
    rule2 = sources_crawled >= 1
    
    # 3. Duplicate rate < 2%
    rule3 = dup_rate < 2.0
    
    # 4. ≥ 90% schema coverage has been implicitly required through Pydantic
    rule4 = schema_fail == 0
    
    # 5. data/index.json is valid JSON matching the IndexRecord schema
    rule5 = index_valid_json and index_records_valid_schema and index_record_count > 0

    def box(val):
        return "[x]" if val else "[ ]"

    print(f"{box(rule1)} ≥ 10 book records in data/books/index.json")
    print(f"{box(rule2)} At least 1 source crawled with downloaded files")
    print(f"{box(rule3)} Duplicate rate < 2%")
    print(f"{box(rule4)} 100% of records passed strict Pydantic Canonical Validation")
    print(f"{box(rule5)} {output_dir}/books/index.json is valid JSON matching the BookIndexRecord schema")

    # 🟡 MEDIUM ISSUE FIX: Fail loudly if any gate fails
    all_gates_passed = rule1 and rule2 and rule3 and rule4 and rule5
    
    if schema_fail > 0 or not all_gates_passed:
        print("\n[ERROR] Phase 2 Handoff Quality Gates or Schema Validation FAILED.")
        import sys
        sys.exit(1)
    else:
        print(f"\nAll {schema_pass} records passed schema validation and all quality gates passed!")
        import sys
        sys.exit(0)

if __name__ == "__main__":
    app()
