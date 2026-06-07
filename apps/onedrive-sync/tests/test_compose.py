from compose import build_record, compose, id_to_filename


# --- id_to_filename ---

def test_id_to_filename_replaces_colons():
    assert id_to_filename("onedrive:nhasachmienphi:dac-nhan-tam") == "onedrive__nhasachmienphi__dac-nhan-tam"


# --- build_record ---

def test_build_record_shape():
    from categories import CategoryResult
    from dedup import DeduplicatedBook
    from manifest import ManifestEntry

    entry = ManifestEntry(
        title="Đắc Nhân Tâm",
        category="Tâm Lý - Kỹ Năng Sống",
        author="Dale Carnegie",
        imageFile="output/images/dac-nhan-tam.jpg",
        epubFile="output/books/dac-nhan-tam.epub",
    )
    book = DeduplicatedBook(entry=entry, id="onedrive:nhasachmienphi:dac-nhan-tam")
    cat_result = CategoryResult(
        category_name="Tâm Lý, Xã Hội, Hiện Thực",
        action="map",
        original_category="Tâm Lý - Kỹ Năng Sống",
    )
    record = build_record(book, cat_result)

    assert record["id"] == "onedrive:nhasachmienphi:dac-nhan-tam"
    assert record["book_name"] == "Đắc Nhân Tâm"
    assert record["category_name"] == "Tâm Lý, Xã Hội, Hiện Thực"
    assert record["author"] == "Dale Carnegie"
    assert record["source"] == "onedrive"
    assert record["epubUrl"] == "onedrive/nhasachmienphi/dac-nhan-tam.epub"
    assert record["cover_image_url"] == "onedrive/cover/onedrive__nhasachmienphi__dac-nhan-tam.jpg"
    assert record["manifest_category"] == "Tâm Lý - Kỹ Năng Sống"


# --- compose ---

def test_compose_merges_and_sorts():
    existing = {
        "_meta": {"version": 1},
        "books": [
            {"id": "vnthuquan__some-book", "book_name": "X"},
            {"id": "onedrive:nhasachmienphi:old-book", "book_name": "Old"},
        ],
    }
    fragment = {
        "_meta": {},
        "books": [
            {"id": "onedrive:nhasachmienphi:new-book", "book_name": "New"},
        ],
    }
    result = compose(existing, fragment)
    ids = [b["id"] for b in result["books"]]
    assert "vnthuquan__some-book" in ids
    assert "onedrive:nhasachmienphi:new-book" in ids
    assert "onedrive:nhasachmienphi:old-book" not in ids
    assert ids == sorted(ids)


def test_compose_preserves_non_onedrive_records():
    existing = {
        "_meta": {},
        "books": [{"id": "vnthuquan__book-a", "book_name": "A"}],
    }
    fragment = {"_meta": {}, "books": []}
    result = compose(existing, fragment)
    assert len(result["books"]) == 1
    assert result["books"][0]["id"] == "vnthuquan__book-a"


def test_compose_idempotent():
    fragment = {
        "_meta": {},
        "books": [{"id": "onedrive:nhasachmienphi:foo", "book_name": "Foo"}],
    }
    r1 = compose({}, fragment)
    r2 = compose(r1, fragment)
    assert r1 == r2
