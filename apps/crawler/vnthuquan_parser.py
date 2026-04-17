"""
vnthuquan_parser.py — Pure HTML/text parsers for VNThuQuan site.

Stories 1.1, 1.2, 1.3 — no I/O, no HTTP calls.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from urllib.parse import parse_qs, urlparse

from bs4 import BeautifulSoup


# ---------------------------------------------------------------------------
# Story 1.1: Listing Page
# ---------------------------------------------------------------------------

@dataclass
class BookListingEntry:
    url: str
    title: str
    author_name: str | None
    author_id: int | None
    category_name: str
    category_id: int
    chapter_count: int
    date: str
    format_type: str
    cover_image_url: str | None = None


def _parse_int_param(href: str, param: str) -> int | None:
    """Extract a single integer query parameter from a URL fragment or full URL."""
    # href may be relative like 'tacpham.aspx?tacgiaid=9936'
    parsed = urlparse(href)
    qs = parse_qs(parsed.query)
    values = qs.get(param)
    if values:
        try:
            return int(values[0])
        except (ValueError, IndexError):
            return None
    return None


def parse_listing_page(html: str) -> list[BookListingEntry]:
    """Parse a VNThuQuan listing page and return a list of BookListingEntry objects.

    Malformed entries are skipped silently; no exception is raised.
    All format types are returned (no filtering).
    """
    soup = BeautifulSoup(html, "html.parser")
    entries: list[BookListingEntry] = []

    for div in soup.select("div.col-xs-7"):
        try:
            # Title + URL
            title_a = div.select_one("div.truyen-title span.viethoachu a[href*='truyen.aspx?tid=']")
            if title_a is None:
                continue
            url = title_a["href"]
            title = title_a.get_text(strip=True)
            if not title:
                continue

            # Author (optional)
            author_a = div.select_one("span.author a[href*='tacgiaid=']")
            if author_a:
                author_name: str | None = author_a.get_text(strip=True) or None
                author_id: int | None = _parse_int_param(author_a["href"], "tacgiaid")
            else:
                author_name = None
                author_id = None

            # Category
            cat_a = div.select_one("span.label-theloai a[href*='theloaiid=']")
            if cat_a is None:
                continue
            category_name = cat_a.get_text(strip=True)
            category_id_val = _parse_int_param(cat_a["href"], "theloaiid")
            if category_id_val is None:
                continue
            category_id = category_id_val

            # Chapter count — text like "N Chương"
            chuong_span = div.select_one("span.totalchuong")
            chapter_count = 0
            if chuong_span:
                m = re.search(r"(\d+)", chuong_span.get_text())
                if m:
                    chapter_count = int(m.group(1))

            # Date
            date_span = div.select_one("span.label-time")
            date = date_span.get_text(strip=True) if date_span else ""

            # Format type
            scan_span = div.select_one("span.label-scan")
            format_type = scan_span.get_text(strip=True) if scan_span else ""

            # Cover image — in sibling div.col-xs-3 > a > img within the parent row.
            # Reject author-avatar images (path contains /tacgia/).
            cover_image_url: str | None = None
            parent = div.parent
            if parent:
                cover_img = parent.select_one("div.col-xs-3 a img[src]")
                if cover_img:
                    src = cover_img.get("src", "").strip()
                    if src and "/tacgia/" not in src:
                        cover_image_url = src

            entries.append(BookListingEntry(
                url=url,
                title=title,
                author_name=author_name,
                author_id=author_id,
                category_name=category_name,
                category_id=category_id,
                chapter_count=chapter_count,
                date=date,
                format_type=format_type,
                cover_image_url=cover_image_url,
            ))
        except Exception:
            # Skip malformed entries silently
            continue

    return entries


def extract_last_page_number(html: str) -> int:
    """Return the highest page number from pagination links matching ?tranghientai={n}.

    Returns 1 if no pagination links are found.
    """
    soup = BeautifulSoup(html, "html.parser")
    max_page = 1
    for a in soup.select("a[href*='tranghientai']"):
        href = a.get("href", "")
        m = re.search(r"tranghientai=(\d+)", href)
        if m:
            n = int(m.group(1))
            if n > max_page:
                max_page = n
    return max_page


# ---------------------------------------------------------------------------
# Story 1.2: Book Detail Page
# ---------------------------------------------------------------------------

@dataclass
class BookDetail:
    title: str
    category_label: str
    tuaid: int
    chapter_list: list[tuple[int | str, str]]
    cover_image_url: str | None
    is_single_chapter: bool


_NOIDUNG_RE = re.compile(r"noidung1\('tuaid=(\d+)&chuongid=(\d*)'\)")


def parse_book_detail(html: str) -> BookDetail | None:
    """Parse a VNThuQuan book detail page.

    Returns BookDetail for multi-chapter or single-chapter books, or None
    if neither pattern is found (unparseable).
    """
    soup = BeautifulSoup(html, "html.parser")

    # Title
    title_b = soup.select_one("h3.mucluc > a > b")
    title = title_b.get_text(strip=True) if title_b else ""
    if not title:
        # Fallback: any h3 > a > b
        b = soup.select_one("h3 a b")
        title = b.get_text(strip=True) if b else ""

    # Category label — first h3 > a in document (sidebar)
    category_label = ""
    for h3 in soup.select("h3"):
        a = h3.select_one("a")
        if a:
            category_label = a.get_text(strip=True)
            break

    # Multi-chapter path: find chapter items in div#muluben_to
    toc_div = soup.select_one("div#muluben_to")
    if toc_div:
        chapter_items = toc_div.select("li.menutruyen")
        if chapter_items:
            tuaid: int | None = None
            chapter_list: list[tuple[int | str, str]] = []
            for li in chapter_items:
                # The onclick handler is on the wrapping <div>, not the <li> itself
                onclick = li.get("onclick", "") or li.parent.get("onclick", "")
                m = _NOIDUNG_RE.search(onclick)
                if not m:
                    continue
                if tuaid is None:
                    tuaid = int(m.group(1))
                chuongid_str = m.group(2)
                chuongid: int | str = int(chuongid_str) if chuongid_str else 0
                chapter_a = li.select_one("a.normal8")
                ch_title = chapter_a.get_text(strip=True) if chapter_a else ""
                chapter_list.append((chuongid, ch_title))

            if tuaid is not None and chapter_list:
                return BookDetail(
                    title=title,
                    category_label=category_label,
                    tuaid=tuaid,
                    chapter_list=chapter_list,
                    cover_image_url=None,
                    is_single_chapter=False,
                )

    # Single-chapter path: search all script tags for auto-load pattern
    full_text = html
    m = _NOIDUNG_RE.search(full_text)
    if m:
        tuaid = int(m.group(1))
        return BookDetail(
            title=title,
            category_label=category_label,
            tuaid=tuaid,
            chapter_list=[(0, title)],
            cover_image_url=None,
            is_single_chapter=True,
        )

    return None


# ---------------------------------------------------------------------------
# Story 1.3: Chapter AJAX Response Parser
# ---------------------------------------------------------------------------

DELIMITER = "--!!tach_noi_dung!!--"

_COVER_RE = re.compile(r"background-image:\s*url\(['\"]?([^'\"]+?)['\"]?\)")


@dataclass
class ChapterParseResult:
    cover_image_url: str | None
    content_html: str | None


def _extract_cover_image(part0_html: str) -> str | None:
    """Extract cover image URL from Part 0 CSS background-image property."""
    m = _COVER_RE.search(part0_html)
    return m.group(1) if m else None


def parse_chapter_response(raw: str) -> ChapterParseResult | None:
    """Parse a VNThuQuan custom-delimited AJAX chapter response.

    Returns ChapterParseResult or None if the response is malformed (< 3 parts).
    HTML entities in content_html are preserved as-is (no decoding).
    """
    parts = raw.split(DELIMITER)
    if len(parts) < 3:
        return None

    cover_image_url = _extract_cover_image(parts[0])

    # Part 2 is always the chapter content slot; parts[3] onward are navigation.
    # If the server embeds DELIMITER literally inside content, parts[2] will be
    # truncated — this is a known limitation of the server's own delimiter scheme.
    content = parts[2].strip()
    content_html: str | None = content if content else None

    if cover_image_url is None and content_html is None:
        return None

    return ChapterParseResult(
        cover_image_url=cover_image_url,
        content_html=content_html,
    )
