# tests/test_e2e_pipeline.py
import json
import logging
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from models import SourceConfig
from utils.api_adapter import VbetaApiAdapter
from utils.state import CrawlState
from indexer import build_book_data_index

# ── shared raw data ──────────────────────────────────────────────────────────

_CATEGORIES_RAW = {
    "success": True,
    "result": [{"value": 1, "label": "Kinh", "seoName": "kinh"}],
}
_BOOKS_RAW = {
    "success": True,
    "result": [{"value": 42, "label": "Bộ Trung Quán", "seoName": "bo-trung-quan"}],
}
_TOC_RAW = {
    "result": {
        "id": 42,
        "name": "Bộ Trung Quán",
        "seoName": "bo-trung-quan",
        "categoryId": 1,
        "categoryName": "Kinh",
        "coverImageUrl": "https://cdn.example.com/images/cover.jpg",
        "author": "Thích Minh Châu",
        "authorId": 1,
        "publisher": "VNCPHVN",
        "publicationYear": 2000,
        "tableOfContents": {
            "items": [
                {
                    "id": 12439,
                    "name": "Chương Một",
                    "seoName": "chuong-mot",
                    "viewCount": 5,
                    "minPageNumber": 1,
                    "maxPageNumber": 2,
                }
            ]
        },
    },
    "success": True,
}
_CHAPTER_RAW = {
    "result": {
        "pages": [
            {"pageNumber": 1, "sortNumber": 1, "htmlContent": "<p>Page 1</p>"},
            {"pageNumber": 2, "sortNumber": 2, "htmlContent": "<p>Page 2</p><img src='https://cdn.example.com/images/fig1.png'>"},
        ]
    }
}
_COVER_BYTES = b"FAKE_COVER_IMAGE_BYTES"
_FIG1_BYTES = b"FAKE_FIG1_IMAGE_BYTES"


@pytest.fixture
def source_config():
    return SourceConfig(
        name="vbeta",
        source_type="api",
        enabled=True,
        api_base_url="https://api.phapbao.org",
        api_endpoints={
            "category": "/api/categories/get-selectlist-categories",
            "book": "/api/search/get-books-selectlist-by-categoryId/",
            "toc": "/api/search/get-tableofcontents-by-bookId",
            "chapter": "/api/search/get-pages-by-tableofcontentid/",
        },
        output_folder="vbeta",
    )


@pytest.fixture
def mock_state():
    state = MagicMock(spec=CrawlState)
    state.is_downloaded.return_value = False
    return state


def _make_mock_session():
    """Build a mock aiohttp session that returns appropriate responses per URL."""
    session = MagicMock()

    def make_acm(content, status=200, binary=False):
        mock_resp = AsyncMock()
        mock_resp.status = status
        if binary:
            mock_resp.read = AsyncMock(return_value=content)
        else:
            mock_resp.json = AsyncMock(return_value=content)
        ctx = AsyncMock()
        ctx.__aenter__ = AsyncMock(return_value=mock_resp)
        ctx.__aexit__ = AsyncMock(return_value=None)
        return ctx

    def get_side_effect(url, **kwargs):
        if "categories" in url:
            return make_acm(_CATEGORIES_RAW)
        elif "get-books" in url:
            return make_acm(_BOOKS_RAW)
        elif "get-pages" in url:
            return make_acm(_CHAPTER_RAW)
        elif "cover.jpg" in url:
            return make_acm(_COVER_BYTES, binary=True)
        elif "fig1.png" in url:
            return make_acm(_FIG1_BYTES, binary=True)
        return make_acm({}, status=404)

    session.get = MagicMock(side_effect=get_side_effect)
    session.post = MagicMock(return_value=make_acm(_TOC_RAW))
    return session


@pytest.mark.asyncio
async def test_full_pipeline_crawl_build_index(source_config, mock_state, tmp_path):
    """Full E2E: Phase 1 crawl (with image download) → Phase 2 build folder → indexer index.

    Verifies:
    - data/raw/vbeta/{categories,books,toc,chapters,images} all populated
    - data/book-data/vbeta/kinh/bo-trung-quan/book.json created
    - data/book-data/vbeta/kinh/bo-trung-quan/images/ has cover.jpg + fig1.png
    - book.json cover_image_local_path is not null
    - data/book-data/index.json has 1 book with json + image artifacts
    """
    adapter = VbetaApiAdapter(source_config, _make_mock_session(), mock_state, str(tmp_path))

    with patch("asyncio.sleep", new_callable=AsyncMock):
        with patch("random.uniform", return_value=0.1):
            await adapter.process_all()

    # ── Phase 1 raw assertions ──────────────────────────────────────────────
    raw_dir = tmp_path / "raw" / "vbeta"
    assert (raw_dir / "categories.json").exists(), "categories.json missing from raw"
    assert (raw_dir / "books" / "by_category_1.json").exists(), "books raw missing"
    assert (raw_dir / "toc" / "book_42.json").exists(), "toc raw missing"
    assert (raw_dir / "chapters" / "12439.json").exists(), "chapter raw missing"

    # Image raw files
    img_raw_dir = raw_dir / "images" / "42"
    assert img_raw_dir.is_dir(), "raw images dir missing for book 42"
    raw_image_names = {f.name for f in img_raw_dir.iterdir()}
    assert any("cover" in n or n.endswith(".jpg") for n in raw_image_names), \
        f"cover image not found in raw images: {raw_image_names}"

    # ── Phase 2 book-data assertions ────────────────────────────────────────
    book_folder = tmp_path / "book-data" / "vbeta" / "kinh" / "bo-trung-quan"
    assert book_folder.is_dir(), "book folder not created"

    book_json_path = book_folder / "book.json"
    assert book_json_path.exists(), "book.json not created inside book folder"

    with open(book_json_path) as f:
        book_data = json.load(f)

    assert book_data["book_seo_name"] == "bo-trung-quan"
    assert book_data["total_chapters"] == 1
    assert len(book_data["chapters"]) == 1
    assert len(book_data["chapters"][0]["pages"]) == 2
    assert book_data["cover_image_local_path"] is not None, \
        "cover_image_local_path must be set after build phase"

    images_dir = book_folder / "images"
    assert images_dir.is_dir(), "images/ subdir not created in book folder"
    copied_image_names = {f.name for f in images_dir.iterdir()}
    assert len(copied_image_names) >= 1, "no images copied to book folder"

    # ── Indexer assertions ──────────────────────────────────────────────────
    logger = MagicMock(spec=logging.Logger)
    build_book_data_index(tmp_path, logger)

    index_path = tmp_path / "book-data" / "index.json"
    assert index_path.exists(), "index.json not created by indexer"

    index_data = json.loads(index_path.read_text(encoding="utf-8"))
    assert index_data["_meta"]["total_books"] == 1

    book_entry = index_data["books"][0]
    assert book_entry["book_seo_name"] == "bo-trung-quan"

    artifact_formats = {a["format"] for a in book_entry["artifacts"]}
    assert "json" in artifact_formats, "json artifact missing from index"
    assert "image" in artifact_formats, "image artifact missing from index"

    json_artifact = next(a for a in book_entry["artifacts"] if a["format"] == "json")
    assert json_artifact["path"].endswith("book.json"), \
        f"json artifact path should end with book.json, got: {json_artifact['path']}"


@pytest.mark.asyncio
async def test_full_pipeline_idempotent(source_config, mock_state, tmp_path):
    """Running process_all() twice produces identical output (no rewrites)."""

    with patch("asyncio.sleep", new_callable=AsyncMock):
        with patch("random.uniform", return_value=0.1):
            # First run
            adapter1 = VbetaApiAdapter(source_config, _make_mock_session(), mock_state, str(tmp_path))
            await adapter1.process_all()

            book_json = tmp_path / "book-data" / "vbeta" / "kinh" / "bo-trung-quan" / "book.json"
            mtime_after_first = book_json.stat().st_mtime

            # Second run — fresh session, same tmp_path
            adapter2 = VbetaApiAdapter(source_config, _make_mock_session(), mock_state, str(tmp_path))
            await adapter2.process_all()

            mtime_after_second = book_json.stat().st_mtime

    # book.json must not be rewritten on second run
    assert mtime_after_first == mtime_after_second, \
        "book.json was overwritten on second run — idempotency broken"

    # adapter2's get-request count should be zero (all data already on disk)
    assert adapter2.session.get.call_count == 0, \
        "HTTP GET was called on second run — disk-existence skip failed"
