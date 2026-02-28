import subprocess
import sys
import os
import json

from utils.logging import setup_logger

def main():
    logger = setup_logger("pipeline")
    logger.info("Starting End-to-End Crawler Pipeline")
    
    stages = [
        ("crawler", ["uv", "run", "python", "crawler.py", "--source", "all"]),
        ("parser", ["uv", "run", "python", "parser.py", "--source", "all"]),
        ("indexer", ["uv", "run", "python", "indexer.py"]),
        ("validate", ["uv", "run", "python", "validate.py"]),
    ]
    
    for name, cmd in stages:
        logger.info(f"--- Running Stage: {name} ---")
        try:
            result = subprocess.run(cmd, check=False)
            if result.returncode != 0:
                logger.error(f"Pipeline HALTED: Stage '{name}' failed with exit code {result.returncode}")
                sys.exit(result.returncode)
            logger.info(f"Stage '{name}' completed successfully.")
        except Exception as e:
            logger.error(f"Pipeline HALTED: Failed to execute stage '{name}': {e}")
            sys.exit(1)
            
    # 🔴 CRITICAL and 🟠 HIGH ISSUE FIX: Output final pipeline summary
    logger.info("End-to-End Pipeline Completed Successfully!")
    logger.info("--- FINAL SUMMARY ---")
    index_path = "data/index.json"
    if os.path.exists(index_path):
        try:
            with open(index_path, "r", encoding="utf-8") as f:
                index_data = json.load(f)
                logger.info(f"Total records processed end-to-end: {len(index_data)}")
        except Exception as e:
            logger.error(f"Failed to read {index_path}: {e}")
    else:
        logger.warning(f"Index file {index_path} not found after pipeline completion.")

if __name__ == "__main__":
    main()
