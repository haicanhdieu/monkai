"""Vendored helpers — copied from apps/crawler/utils/slugify.py and dedup.py.

Do NOT import from apps.crawler or crawler. These are intentional copies so
this app stays fully isolated. Tests in tests/test_shared.py pin output
against known values to catch drift from the crawler originals.
"""

import hashlib
import re
import unicodedata

# Characters that don't decompose via NFKD — explicit ASCII mapping required
_SPECIAL_CHARS = str.maketrans({
    "Đ": "D",  # Đ (Latin Capital Letter D with Stroke)
    "đ": "d",  # đ (Latin Small Letter D with Stroke)
})


def slugify_title(title: str) -> str:
    """Convert title to ASCII slug: strip Vietnamese diacritics, lowercase, hyphens."""
    text = title.translate(_SPECIAL_CHARS)
    normalized = unicodedata.normalize("NFKD", text.lower())
    ascii_bytes = normalized.encode("ascii", errors="ignore")
    ascii_str = ascii_bytes.decode("ascii")
    slug = re.sub(r"[^a-z0-9]+", "-", ascii_str)
    return slug.strip("-")


def sha256_hash(file_bytes: bytes) -> str:
    """Compute SHA-256 hex digest of file bytes."""
    return hashlib.sha256(file_bytes).hexdigest()


def make_onedrive_id(source: str, title: str, author: str | None = None) -> str:
    """Build a colon-namespaced onedrive id distinct from crawler's __ form.

    Examples:
        make_onedrive_id("nhasachmienphi", "Đắc Nhân Tâm")
            → "onedrive:nhasachmienphi:dac-nhan-tam"
        make_onedrive_id("nhasachmienphi", "Đắc Nhân Tâm", "Dale Carnegie")
            → "onedrive:nhasachmienphi:dac-nhan-tam-dale-carnegie"
    """
    base = f"onedrive:{slugify_title(source)}:{slugify_title(title)}"
    if author is not None:
        return f"{base}-{slugify_title(author)}"
    return base
