from _shared import make_onedrive_id, sha256_hash, slugify_title


def test_slugify_vietnamese_diacritics():
    assert slugify_title("Kinh Đại Bát Niết Bàn") == "kinh-dai-bat-niet-ban"


def test_slugify_dac_nhan_tam():
    assert slugify_title("Đắc Nhân Tâm") == "dac-nhan-tam"


def test_sha256_known_value():
    assert (
        sha256_hash(b"hello")
        == "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"
    )


def test_make_onedrive_id_basic():
    assert (
        make_onedrive_id("nhasachmienphi", "Đắc Nhân Tâm")
        == "onedrive:nhasachmienphi:dac-nhan-tam"
    )


def test_make_onedrive_id_with_author():
    result = make_onedrive_id("nhasachmienphi", "Đắc Nhân Tâm", author="Dale Carnegie")
    assert result == "onedrive:nhasachmienphi:dac-nhan-tam-dale-carnegie"
