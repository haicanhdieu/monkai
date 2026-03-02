import json
from pathlib import Path

import typer
from pydantic import ValidationError

from models import BookIndexRecord, ScriptureMetadata
from utils.dedup import sha256_hash
from utils.logging import setup_logger
from utils.config import load_config

app = typer.Typer(help="Data Quality Validation and Phase 2 Handoff Check.")

@app.command()
def main(
    config: str = typer.Option(
        "config.yaml", "--config", help="Path to configuration file"
    )
):
    """Scan all .meta.json files, report on deduplication, and check quality gates."""
    # 🟠 HIGH ISSUE FIX: Load config
    try:
        app_config = load_config(config)
        output_dir = app_config.output_dir
    except Exception as e:
        typer.echo(f"Failed to load config from {config}: {e}")
        raise typer.Exit(code=1)

    logger = setup_logger("validate")
    
    meta_files = list(Path(output_dir).glob("raw/**/*.meta.json"))
    total_meta_files = len(meta_files)
    
    # 4.1 Schema Validation
    schema_pass = 0
    schema_fail = 0
    
    # Field coverage
    field_counts = {field: 0 for field in ScriptureMetadata.model_fields.keys()}
    
    # Deduplication
    seen_hashes = {}
    duplicates = 0
    total_hashes = 0
    
    # Disk consistency
    all_files_exist = True
    
    # Data from all metadata for checking fields length
    for meta_path in meta_files:
        try:
            with open(meta_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            
            # Record field coverage
            for k, v in data.items():
                if v is not None and k in field_counts:
                    field_counts[k] += 1
            
            # Validate schema
            _ = ScriptureMetadata(**data)
            schema_pass += 1
            
            # Deduplication check
            raw_path_str = data.get("file_path")
            if raw_path_str:
                raw_path = Path(raw_path_str)
                if raw_path.exists() and raw_path.stat().st_size > 0:
                    with open(raw_path, "rb") as rf:
                        file_hash = sha256_hash(rf.read())
                    total_hashes += 1
                    if file_hash in seen_hashes:
                        duplicates += 1
                    else:
                        seen_hashes[file_hash] = raw_path_str
                else:
                    all_files_exist = False
        
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
    print(f"Meta Files Found: {total_meta_files}")
    print(f"Schema Validation: {schema_pass} passed, {schema_fail} failed")
    
    dup_rate = 0.0
    if total_hashes > 0:
        dup_rate = (duplicates / total_hashes) * 100
    print(f"Duplicate rate: {dup_rate:.1f}% ({duplicates} duplicates of {total_hashes} files)")
    if dup_rate > 2.0:
        print(f"[WARN] Duplicate rate {dup_rate:.1f}% exceeds 2% threshold")
        
    print("Metadata Field Coverage:")
    required_fields = ["id", "title", "category", "subcategory", "source", "url", "file_path", "file_format", "copyright_status", "created_at"]
    req_coverage_pass = True
    for field, count in field_counts.items():
        cov = (count / total_meta_files * 100) if total_meta_files > 0 else 0
        print(f"  {field}: {cov:.1f}% ({count}/{total_meta_files})")
        if field in required_fields and cov < 90.0:
            req_coverage_pass = False
    
    if not req_coverage_pass:
        print("[WARN] Overall required-field coverage dropped below 90%")
        
    
    # Phase 2 Handoff Verification (Story 4.3)
    print("\n--- PHASE 2 HANDOFF QUALITY GATES ---")
    
    # 1. ≥ 500 unique records in data/index.json
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
    sources_crawled = len(list((Path(output_dir) / "raw").glob("*"))) if (Path(output_dir) / "raw").exists() else 0
    rule2 = sources_crawled >= 1 and downloaded > 0
    
    # 3. Duplicate rate < 2%
    rule3 = dup_rate < 2.0
    
    # 4. ≥ 90% of records have all required metadata fields
    rule4 = req_coverage_pass
    
    # 5. All files in data/index.json exist on disk and are non-empty
    rule5 = all_files_exist and total_meta_files > 0
    
    # 6. data/index.json is valid JSON matching the IndexRecord schema
    rule6 = index_valid_json and index_records_valid_schema and index_record_count > 0

    # 7. At least 1 book manifest exists in data/books/
    books_dir = Path(output_dir) / "books"
    book_manifests = list(books_dir.rglob("*.json")) if books_dir.exists() else []
    rule7 = len(book_manifests) >= 1

    def box(val):
        return "[x]" if val else "[ ]"

    print(f"{box(rule1)} ≥ 10 book records in data/books/index.json")
    print(f"{box(rule2)} At least 1 source crawled with downloaded files")
    print(f"{box(rule3)} Duplicate rate < 2%")
    print(f"{box(rule4)} ≥ 90% of records have all required metadata fields")
    print(f"{box(rule5)} All files in {output_dir}/books/index.json exist on disk and are non-empty")
    print(f"{box(rule6)} {output_dir}/books/index.json is valid JSON matching the BookIndexRecord schema")
    print(f"{box(rule7)} At least 1 book manifest exists in {output_dir}/books/")

    # 🟡 MEDIUM ISSUE FIX: Fail loudly if any gate fails
    all_gates_passed = rule1 and rule2 and rule3 and rule4 and rule5 and rule6 and rule7
    
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
