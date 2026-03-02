from __future__ import annotations

import json
import re
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

# ThuvienKinhPhat: URL path-segment → translator name
# Keyed by the 2nd path segment in the URL (e.g. "kinh-truongbo")
THUVIENKINHPHAT_TRANSLATORS: dict[str, str] = {
    "kinh-truongbo": "Hòa thượng Thích Minh Châu",
    "kinh-trungbo": "Hòa thượng Thích Minh Châu",
    "kinh-tangchibo": "Hòa thượng Thích Minh Châu",
    "kinh-tuongungbo": "Hòa thượng Thích Minh Châu",
    "kinh-tieubo1": "Hòa thượng Thích Minh Châu",
    "kinh-tieubo2": "Gs Trần Phương Lan",
    "kinh-tieubo3": "Hòa thượng Thích Minh Châu",
    "kinh-tieubo4": "Hòa thượng Thích Minh Châu",
    "kinh-tieubo5": "Hòa thượng Thích Minh Châu & Gs Trần Phương Lan",
    "kinh-tieubo6": "Hòa thượng Thích Minh Châu & Gs Trần Phương Lan",
    "kinh-tieubo7": "Gs Trần Phương Lan",
    "kinh-tieubo8": "Gs Trần Phương Lan",
    "kinh-tieubo9": "Gs Trần Phương Lan",
    "kinh-tieubo10": "Gs Trần Phương Lan",
    "luat-ptg": "Tỳ khưu Indacanda",
    "luat-tykheo": "Indacanda Bhikkhu (Trương đình Dũng)",
    "luat-daipham": "Tỳ khưu Indacanda",
    "luat-tieupham": "Tỳ khưu Indacanda",
    "luat-tapyeu": "Tỳ khưu Indacanda",
    "luat-tk": "Tỳ khưu Indacanda",
    "luat-tk1": "Tỳ khưu Indacanda",
    "luat-tk2": "Tỳ khưu Indacanda",
    "luat-tkn": "Tỳ khưu Indacanda",
    "vdp": "Hòa thượng Tịnh Sự",
    "vdp1": "Hòa thượng Tịnh Sự",
    "vdp2": "Hòa thượng Tịnh Sự",
    "vdp3": "Hòa thượng Tịnh Sự",
    "vdp4": "Hòa thượng Tịnh Sự",
    "vdp5": "Tâm An & Minh Tuệ",
    "vdp6": "Hòa thượng Tịnh Sự",
    "vdp7": "Hòa thượng Tịnh Sự",
    "tl-thichthonglac": "Trưởng lão Thích Thông Lạc",
    "tipitaka": "Bình Anson",
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


def map_category(text: str) -> Literal[
    "Nikaya", "Đại Thừa", "Mật Tông", "Thiền", "Tịnh Độ",
    "Kinh Tạng", "Luật Tạng", "Thắng Pháp Tạng",
]:
    """Map category text to valid Literal value. Defaults to 'Nikaya' for unknowns."""
    normalized = text.strip().lower()
    return CATEGORY_MAP.get(normalized, "Nikaya")  # type: ignore[return-value]


def extract_thuvienkinhphat_metadata(
    soup: "BeautifulSoup", url: str
) -> dict[str, str | None]:
    """Extract thuvienkinhphat-specific fields using URL-path maps + title-tag splitting.

    Raw HTML files use relative links only, so DOM-based breadcrumb scanning is
    not reliable. Instead, we use the URL path segment (e.g. 'kinh-truongbo') to
    look up category and book_title from maps.
    Chapter is extracted by splitting the <title> tag on ':', or from a [NN] marker.
    Translator is detected from inline text or URL-path map.

    Returns a dict with keys: category, book_title, chapter, author_translator.
    """
    result: dict[str, str | None] = {}

    # URL path maps (raw HTML has relative links — must use the passed-in URL)
    PATH_TO_SUBCATEGORY: dict[str, str] = {
        "kinh-truongbo": "Kinh Tạng", "kinh-trungbo": "Kinh Tạng",
        "kinh-tangchibo": "Kinh Tạng", "kinh-tuongungbo": "Kinh Tạng",
        "kinh-tieubo1": "Kinh Tạng", "kinh-tieubo2": "Kinh Tạng",
        "kinh-tieubo3": "Kinh Tạng", "kinh-tieubo4": "Kinh Tạng",
        "kinh-tieubo5": "Kinh Tạng", "kinh-tieubo6": "Kinh Tạng",
        "kinh-tieubo7": "Kinh Tạng", "kinh-tieubo8": "Kinh Tạng",
        "kinh-tieubo9": "Kinh Tạng", "kinh-tieubo10": "Kinh Tạng",
        "luat-ptg": "Luật Tạng", "luat-tykheo": "Luật Tạng",
        "luat-daipham": "Luật Tạng", "luat-tieupham": "Luật Tạng",
        "luat-tapyeu": "Luật Tạng", "luat-tk": "Luật Tạng",
        "luat-tk1": "Luật Tạng", "luat-tk2": "Luật Tạng",
        "luat-tkn": "Luật Tạng",
        "vdp": "Thắng Pháp Tạng", "vdp1": "Thắng Pháp Tạng",
        "vdp2": "Thắng Pháp Tạng", "vdp3": "Thắng Pháp Tạng",
        "vdp4": "Thắng Pháp Tạng", "vdp5": "Thắng Pháp Tạng",
        "vdp6": "Thắng Pháp Tạng", "vdp7": "Thắng Pháp Tạng",
        "tl-thichthonglac": "Kinh Tạng", "tipitaka": "Kinh Tạng",
    }
    PATH_TO_BOOK_TITLE: dict[str, str] = {
        "kinh-truongbo": "Kinh Trường Bộ", "kinh-trungbo": "Kinh Trung Bộ",
        "kinh-tangchibo": "Kinh Tăng Chi Bộ", "kinh-tuongungbo": "Kinh Tương ưng Bộ",
        "kinh-tieubo1": "Kinh Tiểu Bộ I", "kinh-tieubo2": "Kinh Tiểu Bộ II",
        "kinh-tieubo3": "Kinh Tiểu Bộ III", "kinh-tieubo4": "Kinh Tiểu Bộ IV",
        "kinh-tieubo5": "Kinh Tiểu Bộ V", "kinh-tieubo6": "Kinh Tiểu Bộ VI",
        "kinh-tieubo7": "Kinh Tiểu Bộ VII", "kinh-tieubo8": "Kinh Tiểu Bộ VIII",
        "kinh-tieubo9": "Kinh Tiểu Bộ IX", "kinh-tieubo10": "Kinh Tiểu Bộ X",
        "luat-ptg": "Luật Tạng: Phân Tích Giới Bổn",
        "luat-tykheo": "Giới Bổn Tỳ-khưu Ni",
        "luat-daipham": "Luật Tạng: Đại Phẩm",
        "luat-tieupham": "Luật Tạng: Tiểu Phẩm",
        "luat-tapyeu": "Luật Tạng: Tập Yếu",
        "luat-tk": "Luật Tạng: Phân Tích Giới Tỳ Khưu",
        "luat-tk1": "Luật Tạng: Phân Tích Giới Tỳ Khưu I",
        "luat-tk2": "Luật Tạng: Phân Tích Giới Tỳ Khưu II",
        "luat-tkn": "Luật Tạng: Phân Tích Giới Tỳ Khưu Ni",
        "vdp": "Vi Diệu Pháp: Mục lục",
        "vdp1": "Vi Diệu Pháp: Bộ Pháp Tụ",
        "vdp2": "Vi Diệu Pháp: Bộ Phân Tích",
        "vdp3": "Vi Diệu Pháp: Bộ Chất Ngữ",
        "vdp4": "Vi Diệu Pháp: Bộ Nhân Chế Định",
        "vdp5": "Vi Diệu Pháp: Bộ Ngữ Tông",
        "vdp6": "Vi Diệu Pháp: Bộ Song Đối",
        "vdp7": "Vi Diệu Pháp: Bộ Vị Trí",
        "tl-thichthonglac": "Những Lời Phật Dạy",
        "tipitaka": "Tam Tạng Kinh Điển",
    }

    # Extract path key from URL (e.g. 'kinh-truongbo' from buddha-sasana/kinh-truongbo/file.html)
    path_parts = urlparse(url).path.strip("/").split("/")
    path_key = path_parts[1] if len(path_parts) >= 2 else ""

    # All thuvienkinhphat texts are Theravada (Nikaya)
    result["category"] = "Nikaya"

    # Look up subcategory and book_title from URL-path maps
    if path_key in PATH_TO_SUBCATEGORY:
        result["subcategory"] = PATH_TO_SUBCATEGORY[path_key]
    if path_key in PATH_TO_BOOK_TITLE:
        result["book_title"] = PATH_TO_BOOK_TITLE[path_key]

    # --- Title tag: extract chapter from various separator patterns ---
    # Observed patterns:
    #   "Kinh Trường Bộ: 1. Kinh Phạm võng"      → ':' split, right side
    #   "Kinh Trung Bộ - 10. Kinh Niệm xứ"        → '-' split, right side
    #   "Kinh Tăng Chi Bộ - Chương 1 - Phẩm 01-14" → '-' split, last 2 parts
    #   "Luật Tạng - Đại Phẩm - Chương 1 (phần 1)" → '-' split, last part
    #   "Giới Bổn Tỳ kheo Ni - Phần 1"             → '-' split, "Phần 1"
    #   "Vi Diệu Pháp - Bộ Vị Trí II - Mục lục"   → TOC page, skip chapter
    title_tag = soup.find("title")
    is_toc = False
    if title_tag:
        title_text = title_tag.get_text(strip=True)
        # Skip TOC index pages (contain "Mục lục" or "Muc luc")
        is_toc = "mục lục" in title_text.lower() or "muc luc" in title_text.lower()
        if not is_toc:
            if ":" in title_text:
                # Colon format: "Book Title: Chapter Title"
                result["chapter"] = title_text.split(":", 1)[1].strip()
            else:
                # Dash format: "Book - [intermediate -] Chapter Part"
                dash_parts = [p.strip() for p in title_text.split(" - ")]
                if len(dash_parts) >= 2:
                    last = dash_parts[-1]
                    second_last = dash_parts[-2] if len(dash_parts) >= 2 else ""
                    if second_last and second_last.lower().startswith("chương"):
                        # "Chương 1 - Phẩm 01-14" → combine both parts
                        result["chapter"] = f"{second_last} - {last}"
                    else:
                        result["chapter"] = last
                elif len(dash_parts) == 1 and dash_parts[0] != title_text:
                    result["chapter"] = dash_parts[0]

    # Only apply fallbacks if this is not a TOC page
    if not is_toc:
        # Supplement chapter with h1/h2 heading text if still missing
        if not result.get("chapter"):
            for tag in ("h1", "h2", "h3"):
                el = soup.find(tag)
                if el:
                    h_text = el.get_text(strip=True)
                    if h_text and len(h_text) > 3:
                        result["chapter"] = h_text
                        break

        # Final fallback: use alphanumeric filename stem suffix as chapter ID
        # e.g. dp-01a.html → "01a", bkni01.html → "01", tangchi01-0114 → "01-0114"
        if not result.get("chapter"):
            file_stem = Path(urlparse(url).path).stem  # e.g. "dp-01a"
            id_match = re.search(r"(\d+[a-z]?(?:-\d+)?)$", file_stem)
            if id_match:
                result["chapter"] = id_match.group(1)

    # --- Translator ---
    # Strategy 1: explicit "Lời tiếng Việt:" prefix on the page (common in Luật Tạng)
    body_text = soup.get_text(separator=" ")
    viet_match = re.search(r"Lời tiếng Việt\s*:\s*(.+?)(?:\n|\.|\s{2,}|$)", body_text)
    if viet_match:
        result["author_translator"] = viet_match.group(1).strip()
    else:
        # Strategy 2: URL-path translator map
        translator = THUVIENKINHPHAT_TRANSLATORS.get(path_key)
        if translator:
            result["author_translator"] = translator

    return result


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
            book_collection = None
            book_title = None
            chapter = None
            author_translator = None
            content = None
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

            # Book collection, book title, chapter
            book_collection = select_text(soup, source.css_selectors.get("book_collection", ""))
            book_title = select_text(soup, source.css_selectors.get("book_title", ""))
            chapter = select_text(soup, source.css_selectors.get("chapter", ""))

            # Author/translator via CSS selector
            author_translator = select_text(soup, source.css_selectors.get("author_translator", ""))

            # Content: full text of selector element
            content_sel = source.css_selectors.get("content", "")
            content: str | None = None
            if content_sel:
                el = soup.select_one(content_sel)
                if el:
                    # thuvienkinhphat: strip all navigation/breadcrumb elements
                    # before extracting text to avoid polluting content with:
                    #   1. div#main-menu  → site breadcrumb e.g. "Trang chính ▪ Luật Tạng ▪ Đại Phẩm"
                    #   2. Book-title <p> header → "Trung Bộ Kinh / Majjhima Nikaya" etc.
                    #   3. Inline chapter-nav <p> → "Mục lục | 01a | 01b | 01c | ..."
                    if source.name == "thuvienkinhphat":
                        # 1. Remove the main-menu navigation div (always present)
                        for nav in el.select("#main-menu"):
                            nav.decompose()

                        # 2. Remove book-title/collection header <p> elements anywhere
                        # in the page (blockquote-based or table-based layouts).
                        # Pattern: <p> containing <font color="#800000"> with short text
                        # that doesn't look like body prose (< 150 chars, no sentence).
                        for p in el.find_all("p"):
                            colored_font = p.find("font", attrs={"color": re.compile(r"(?i)#800000|maroon")})
                            p_text = p.get_text(strip=True)
                            if colored_font and len(p_text) < 150:
                                p.decompose()

                        # 3. Remove inline chapter-navigation <p> elements.
                        # These are centered paragraphs that contain 2+ <a> tags
                        # linking to sibling .html files (e.g. "Mục lục | 01a | 01b").
                        for p in el.find_all("p"):
                            links = p.find_all("a", href=True)
                            html_links = [
                                a for a in links
                                if a["href"].endswith(".html") and "/" not in a["href"]
                            ]
                            if len(html_links) >= 2:
                                p.decompose()
                    content = el.get_text(separator="\n", strip=True)

            # Try canonical URL for HTML files whose URL wasn't in url_index
            if url == source.seed_url:
                canonical_tag = soup.find("link", rel="canonical")
                if canonical_tag and canonical_tag.get("href"):
                    url = canonical_tag["href"]

            # Source-specific overrides for thuvienkinhphat
            if source.name == "thuvienkinhphat":
                overrides = extract_thuvienkinhphat_metadata(soup, url)
                if overrides.get("category"):
                    category = overrides["category"]  # type: ignore[assignment]
                if overrides.get("book_title"):
                    book_title = overrides["book_title"]
                if overrides.get("subcategory"):
                    subcategory = overrides["subcategory"]
                if overrides.get("chapter"):
                    chapter = overrides["chapter"]
                if overrides.get("author_translator"):
                    author_translator = overrides["author_translator"]
                # title = chapter (no separate title concept for thuvienkinhphat)
                title = chapter or file_path.stem

        # Include book_title in ID so chapters with the same number across
        # different books produce unique IDs (e.g. Kinh Trường Bộ 01 ≠ Kinh Trung Bộ 01).
        # Fall back to the file stem (always unique per file) when book_title is absent.
        id_title = f"{book_title} {title}" if book_title else file_path.stem
        scripture_id = make_id(source.name, id_title)
        copyright_status = classify_copyright(source.name, category)

        return ScriptureMetadata(
            id=scripture_id,
            title=title,
            title_pali=None,
            title_sanskrit=None,
            category=category,
            subcategory=subcategory,
            book_collection=book_collection,
            book_title=book_title,
            chapter=chapter,
            source=source.name,
            url=url,
            author_translator=author_translator,
            content=content,
            file_path=str(file_path),
            file_format=file_format,
            copyright_status=copyright_status,
            created_at=datetime.now(timezone.utc),
        )
    except Exception as e:
        logger.error(f"[parser] Extraction failed: {file_path} — {e}")
        return None


def parse_source(source: SourceConfig, cfg: CrawlerConfig, logger, force: bool = False) -> None:
    """Parse all raw files for a source, writing metadata to data/meta/{source}/{stem}.json.

    Idempotent: skips files whose metadata JSON already exists in data/meta/.
    Set force=True to overwrite existing meta JSONs.
    Logs NFR6 coverage warning if < 90% of files are successfully parsed.
    """
    source_dir = Path(cfg.output_dir) / "raw" / source.output_folder
    meta_dir = Path(cfg.output_dir) / "meta" / source.name
    meta_dir.mkdir(parents=True, exist_ok=True)
    state_path = Path(cfg.output_dir) / "crawl-state.json"

    url_index = build_url_index(state_path)
    raw_files = scan_raw_files(source_dir)

    parsed_count = 0
    skipped_count = 0
    error_count = 0

    for file_path in raw_files:
        meta_path = meta_dir / (file_path.stem + ".json")
        if meta_path.exists() and not force:
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
            logger.error(f"[parser] Failed to write meta JSON: {file_path} — {e}")
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
    force: bool = typer.Option(False, "--force", help="Overwrite existing meta JSONs"),
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
        parse_source(src, cfg, logger, force=force)


if __name__ == "__main__":
    app()
