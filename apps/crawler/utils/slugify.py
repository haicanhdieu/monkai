# utils/slugify.py
import re
import unicodedata

# Characters that don't decompose via NFKD — explicit ASCII mapping required
_SPECIAL_CHARS = str.maketrans({
    "\u0110": "D",  # Đ (Latin Capital Letter D with Stroke)
    "\u0111": "d",  # đ (Latin Small Letter D with Stroke)
})


def slugify_title(title: str) -> str:
    """Convert title to ASCII slug: strip Vietnamese diacritics, lowercase, hyphens.

    Example: "Tâm Kinh" → "tam-kinh"
    Example: "Kinh Đại Bát Niết Bàn" → "kinh-dai-bat-niet-ban"
    """
    # Pre-process characters that don't decompose via NFKD (e.g., Đ/đ)
    text = title.translate(_SPECIAL_CHARS)
    # Normalize to NFKD form — decomposes combined characters into base + combining marks
    normalized = unicodedata.normalize("NFKD", text.lower())
    # Encode to ASCII, ignoring combining marks (diacritics)
    ascii_bytes = normalized.encode("ascii", errors="ignore")
    ascii_str = ascii_bytes.decode("ascii")
    # Replace non-alphanumeric characters with hyphens
    slug = re.sub(r"[^a-z0-9]+", "-", ascii_str)
    # Strip leading/trailing hyphens
    return slug.strip("-")


def make_id(source: str, title: str) -> str:
    """Generate deterministic scripture ID: {source_slug}__{title_slug}.

    Always lowercase. Double underscore separates source from title.
    Example: make_id("thuvienhoasen", "Tâm Kinh") → "thuvienhoasen__tam-kinh"
    Example: make_id("THUVIENHOASEN", "TÂM KINH") → "thuvienhoasen__tam-kinh"
    """
    source_slug = slugify_title(source)
    title_slug = slugify_title(title)
    return f"{source_slug}__{title_slug}"
