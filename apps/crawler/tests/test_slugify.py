# tests/test_slugify.py
from utils.slugify import make_id, slugify_title


def test_make_id_basic():
    # Primary use case: Vietnamese title with diacritics
    assert make_id("thuvienhoasen", "T\u00e2m Kinh") == "thuvienhoasen__tam-kinh"


def test_make_id_with_vietnamese_diacritics():
    # Tâm Kinh with actual Vietnamese characters
    tam_kinh = "T\u00e2m Kinh"  # Tâm Kinh
    assert make_id("thuvienhoasen", tam_kinh) == "thuvienhoasen__tam-kinh"


def test_make_id_determinism():
    result1 = make_id("thuvienhoasen", "T\u00e2m Kinh")
    result2 = make_id("thuvienhoasen", "T\u00e2m Kinh")
    assert result1 == result2


def test_make_id_case_insensitive():
    lower = make_id("thuvienhoasen", "tam kinh")
    upper = make_id("THUVIENHOASEN", "TAM KINH")
    assert lower == upper


def test_double_underscore_separator():
    result = make_id("source", "title")
    assert "__" in result
    parts = result.split("__")
    assert len(parts) == 2
    assert parts[0] == "source"
    assert parts[1] == "title"


def test_diacritics_tam():
    # Tâm: T + a-circumflex + m → tam
    tam = "T\u00e2m"
    assert slugify_title(tam) == "tam"


def test_diacritics_dai():
    # Đại: D-stroke + a-below + i → dai
    dai = "\u0110\u1ea1i"
    assert slugify_title(dai) == "dai"


def test_diacritics_uu():
    # Ưu: U-hook + u → uu
    uu = "\u01b0u"
    assert slugify_title(uu) == "uu"


def test_special_chars_become_hyphens():
    # Use actual Vietnamese with diacritics + parentheses — the real use case
    result = slugify_title("kinh (b\u00e1t nh\u00e3)")  # "kinh (bát nhã)"
    assert result == "kinh-bat-nha"


def test_edge_case_empty_title():
    result = make_id("source", "")
    assert "source__" in result or result == "source__"
