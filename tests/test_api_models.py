from models import (
    ApiCategory,
    ApiBookSelectItem,
    ApiTocItem,
    ApiBookDetail,
    ApiPage,
    ChapterBookData,
)

def test_api_category_mapping():
    data = {
        "value": 1,
        "label": "Kinh",
        "seoName": "kinh"
    }
    cat = ApiCategory(**data)
    assert cat.value == 1
    assert cat.label == "Kinh"
    assert cat.seo_name == "kinh"

def test_api_book_select_item_mapping():
    data = {
        "value": 1,
        "label": "Kinh Trường Bộ 1",
        "seoName": "kinh-truong-bo-1"
    }
    book = ApiBookSelectItem(**data)
    assert book.value == 1
    assert book.label == "Kinh Trường Bộ 1"
    assert book.seo_name == "kinh-truong-bo-1"

def test_api_toc_item_mapping():
    data = {
        "id": 12439,
        "name": "1. Kinh Phạm Võng",
        "seoName": "1-kinh-pham-vong",
        "viewCount": 2889,
        "minPageNumber": 11,
        "maxPageNumber": 92
    }
    toc = ApiTocItem(**data)
    assert toc.id == 12439
    assert toc.name == "1. Kinh Phạm Võng"
    assert toc.seo_name == "1-kinh-pham-vong"
    assert toc.view_count == 2889
    assert toc.min_page_number == 11
    assert toc.max_page_number == 92

def test_api_book_detail_mapping():
    data = {
        "id": 1,
        "name": "Kinh Trường Bộ 1",
        "seoName": "kinh-truong-bo-1",
        "coverImageUrl": "https://api.phapbao.org/uploads/kinhtruongbo_tap1.jpg",
        "categoryId": 1,
        "categoryName": "Kinh",
        "author": "Hòa thượng Thích Minh Châu dịch",
        "authorId": 1,
        "publisher": "Viện Nghiên Cứu Phật Học Việt Nam, TP. Hồ Chí Minh",
        "publicationYear": 1991
    }
    book_detail = ApiBookDetail(**data)
    assert book_detail.id == 1
    assert book_detail.name == "Kinh Trường Bộ 1"
    assert book_detail.seo_name == "kinh-truong-bo-1"
    assert book_detail.cover_image_url == "https://api.phapbao.org/uploads/kinhtruongbo_tap1.jpg"
    assert book_detail.category_id == 1
    assert book_detail.category_name == "Kinh"
    assert book_detail.author == "Hòa thượng Thích Minh Châu dịch"
    assert book_detail.author_id == 1
    assert book_detail.publisher == "Viện Nghiên Cứu Phật Học Việt Nam, TP. Hồ Chí Minh"
    assert book_detail.publication_year == 1991

def test_api_page_mapping():
    data = {
        "pageNumber": 11,
        "sortNumber": 11,
        "htmlContent": "<div class=\"page-item\">...</div>"
    }
    page = ApiPage(**data)
    assert page.page_number == 11
    assert page.sort_number == 11
    assert page.html_content == "<div class=\"page-item\">...</div>"

def test_chapter_book_data_mapping():
    data = {
        "_meta": {
            "source": "vbeta",
            "schema_version": "1.0",
            "fetched_at": "2026-03-01T15:04:05Z",
            "api_chapter_url": "https://api.phapbao.org/api/search/get-pages-by-tableofcontentid/12439"
        },
        "id": "vbeta__1-kinh-pham-vong",
        "chapter_id": 12439,
        "chapter_name": "1. Kinh Phạm Võng",
        "chapter_seo_name": "1-kinh-pham-vong",
        "chapter_view_count": 2889,
        "page_count": 82,
        "book": {
            "id": 1,
            "name": "Kinh Trường Bộ 1",
            "seo_name": "kinh-truong-bo-1",
            "cover_image_url": "https://api.phapbao.org/uploads/kinhtruongbo_tap1.jpg",
            "author": "Hòa thượng Thích Minh Châu dịch",
            "author_id": 1,
            "publisher": "Viện Nghiên Cứu Phật Học Việt Nam, TP. Hồ Chí Minh",
            "publication_year": 1991,
            "category_id": 1,
            "category_name": "Kinh",
            "category_seo_name": "kinh"
        },
        "pages": [
            {
                "page_number": 11,
                "sort_number": 11,
                "html_content": "<div class=\"page-item\">...</div>"
            }
        ]
    }
    chapter_data = ChapterBookData(**data)
    assert chapter_data.meta.source == "vbeta"
    assert chapter_data.meta.schema_version == "1.0"
    assert chapter_data.meta.api_chapter_url == "https://api.phapbao.org/api/search/get-pages-by-tableofcontentid/12439"
    assert chapter_data.id == "vbeta__1-kinh-pham-vong"
    assert chapter_data.chapter_id == 12439
    assert chapter_data.chapter_name == "1. Kinh Phạm Võng"
    assert chapter_data.chapter_seo_name == "1-kinh-pham-vong"
    assert chapter_data.book.id == 1
    assert chapter_data.book.name == "Kinh Trường Bộ 1"
    assert chapter_data.pages[0].page_number == 11
    assert chapter_data.pages[0].html_content == "<div class=\"page-item\">...</div>"
