from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal
from urllib.parse import urlparse

import typer
from bs4 import BeautifulSoup

from models import CrawlerConfig, ScriptureMetadata, SourceConfig
from utils.config import load_config
from utils.logging import setup_logger
from utils.slugify import make_id

app = typer.Typer()

# Extension → file_format mapping (local; do NOT import detect_format from crawler.py)
EXT_TO_FORMAT: dict[str, str] = {
    ".html": "html",
    ".htm": "html",
    ".pdf": "pdf",
    ".epub": "epub",
}

# Vietnamese category string → Literal value
CATEGORY_MAP: dict[str, str] = {
    "nikaya": "Nikaya",
    "kinh nikaya": "Nikaya",
    "đại thừa": "Đại Thừa",
    "dai thua": "Đại Thừa",
    "kinh đại thừa": "Đại Thừa",
    "mật tông": "Mật Tông",
    "mat tong": "Mật Tông",
    "thiền": "Thiền",
    "thien": "Thiền",
    "tịnh độ": "Tịnh Độ",
    "tinh do": "Tịnh Độ",
}


def scan_raw_files(source_dir: Path) -> list[Path]:
    """Recursively find .html, .htm, .pdf, .epub files under source_dir.

    Excludes any file whose name ends in .meta.json.
    Returns a sorted list for deterministic processing order.
    """
    if not source_dir.exists():
        return []
    extensions = {".html", ".htm", ".pdf", ".epub"}
    files = [
        f
        for f in source_dir.rglob("*")
        if f.is_file() and f.suffix.lower() in extensions
    ]
    return sorted(files)


def build_url_index(state_path: Path) -> dict[str, str]:
    """Build {url_basename: url} index from crawl-state.json downloaded entries.

    Returns empty dict if state file does not exist.
    """
    if not state_path.exists():
        return {}
    state_data: dict[str, str] = json.loads(state_path.read_text(encoding="utf-8"))
    index: dict[str, str] = {}
    for url, status in state_data.items():
        if status == "downloaded":
            segment = Path(urlparse(url).path).name
            if segment:
                index[segment] = url
    return index


def select_text(soup: BeautifulSoup, selector: str) -> str | None:
    """Return stripped text from first element matching selector, or None.

    Returns None immediately if selector is empty string.
    Supports compound CSS selectors (e.g. 'h2, h3', 'h1, h2, title').
    """
    if not selector:
        return None
    el = soup.select_one(selector)
    return el.get_text(strip=True) if el else None


def map_category(text: str) -> Literal["Nikaya", "Đại Thừa", "Mật Tông", "Thiền", "Tịnh Độ"]:
    """Map category text to valid Literal value. Defaults to 'Nikaya' for unknowns."""
    normalized = text.strip().lower()
    return CATEGORY_MAP.get(normalized, "Nikaya")  # type: ignore[return-value]


def classify_copyright(
    source_name: str, category: str
) -> Literal["public_domain", "unknown"]:
    """Classify copyright based on source origin and text category.

    Only budsas Nikaya texts are unambiguously public domain (ancient Pali canon).
    All other source/category combinations are 'unknown'.
    """
    if source_name == "budsas" and category == "Nikaya":
        return "public_domain"
    return "unknown"


def extract_metadata(
    file_path: Path,
    url: str,
    source: SourceConfig,
    logger,
) -> ScriptureMetadata | None:
    """Extract structured metadata from a raw scripture file.

    Returns ScriptureMetadata on success, None on any error (never raises).
    Handles HTML (BeautifulSoup), PDF, and EPUB (filename stem fallback).
    All source-specific behavior is driven by source.css_selectors — no hardcoded
    source-name branches in core extraction logic.
    """
    try:
        suffix = file_path.suffix.lower()
        file_format = EXT_TO_FORMAT.get(suffix, "other")

        if suffix in {".pdf", ".epub"}:
            # Non-HTML: derive title from filename; no HTML parsing
            title = file_path.stem.replace("-", " ").title()
            raw_cat = source.css_selectors.get("category", "")
            category: str = map_category(raw_cat) if raw_cat else "Nikaya"
            subcategory = ""
        else:
            # HTML/HTM: parse with BeautifulSoup
            content = file_path.read_text(encoding="utf-8", errors="replace")
            soup = BeautifulSoup(content, "html.parser")

            # Title: compound selectors (e.g. "h2, h3", "h1, h2, title") handled by select_one
            raw_title = select_text(soup, source.css_selectors.get("title", ""))
            # Strip trailing site-name suffix (e.g. "Title | Site Name")
            if raw_title and "|" in raw_title:
                raw_title = raw_title.split("|")[0].strip()
            if not raw_title:
                logger.warning(f"[parser] No title extracted: {file_path}")
            title = raw_title or file_path.stem

            # Category: empty selector → "Nikaya" unconditionally (e.g. budsas, dhammadownload)
            cat_sel = source.css_selectors.get("category", "")
            if not cat_sel:
                category = "Nikaya"
            else:
                raw_category = select_text(soup, cat_sel)
                if raw_category:
                    category = map_category(raw_category)
                else:
                    category = "Nikaya"
                    logger.warning(
                        f"[parser] No category for {file_path}, defaulting to Nikaya"
                    )

            # Subcategory: empty string is valid
            raw_subcategory = select_text(soup, source.css_selectors.get("subcategory", ""))
            subcategory = raw_subcategory or ""

            # Try canonical URL for HTML files whose URL wasn't in url_index
            if url == source.seed_url:
                canonical_tag = soup.find("link", rel="canonical")
                if canonical_tag and canonical_tag.get("href"):
                    url = canonical_tag["href"]

        scripture_id = make_id(source.name, title)
        copyright_status = classify_copyright(source.name, category)

        return ScriptureMetadata(
            id=scripture_id,
            title=title,
            title_pali=None,
            title_sanskrit=None,
            category=category,
            subcategory=subcategory,
            source=source.name,
            url=url,
            author_translator=None,
            file_path=str(file_path),
            file_format=file_format,
            copyright_status=copyright_status,
            created_at=datetime.now(timezone.utc),
        )
    except Exception as e:
        logger.error(f"[parser] Extraction failed: {file_path} — {e}")
        return None


def parse_source(source: SourceConfig, cfg: CrawlerConfig, logger) -> None:
    """Parse all raw files for a source, writing .meta.json sidecar files.

    Idempotent: skips files whose .meta.json already exists.
    Logs NFR6 coverage warning if < 90% of files are successfully parsed.
    """
    source_dir = Path(cfg.output_dir) / "raw" / source.output_folder
    state_path = Path(cfg.output_dir) / "crawl-state.json"

    url_index = build_url_index(state_path)
    raw_files = scan_raw_files(source_dir)

    parsed_count = 0
    skipped_count = 0
    error_count = 0

    for file_path in raw_files:
        meta_path = Path(str(file_path) + ".meta.json")
        if meta_path.exists():
            logger.debug(f"[parser] Skip (exists): {file_path}")
            skipped_count += 1
            continue

        url = url_index.get(file_path.name, source.seed_url)
        try:
            metadata = extract_metadata(file_path, url, source, logger)
            if metadata is None:
                error_count += 1
                continue
            meta_path.write_text(metadata.model_dump_json(indent=2), encoding="utf-8")
            parsed_count += 1
        except Exception as e:
            logger.error(f"[parser] Failed to write meta.json: {file_path} — {e}")
            error_count += 1
            continue

    # NFR6: warn if coverage drops below 90%
    total = parsed_count + error_count
    if total > 0:
        coverage_pct = parsed_count / total * 100
        if coverage_pct < 90:
            logger.warning(
                f"[parser] Coverage {coverage_pct:.1f}% below 90% threshold for {source.name}"
            )

    logger.info(
        f"[parser] Parsed {parsed_count} files, {skipped_count} skipped, {error_count} errors for source {source.name}"
    )


@app.command()
def parse(
    source: str = typer.Option("all", help="Source name or 'all'"),
    config: str = typer.Option("config.yaml", help="Config file path"),
) -> None:
    cfg = load_config(config)
    logger = setup_logger("parser")
    sources = (
        cfg.sources if source == "all" else [s for s in cfg.sources if s.name == source]
    )
    if not sources:
        logger.error(f"[parser] No source found: {source}")
        raise typer.Exit(1)
    for src in sources:
        parse_source(src, cfg, logger)


if __name__ == "__main__":
    app()
