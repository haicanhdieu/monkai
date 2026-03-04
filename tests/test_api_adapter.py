import pytest
from unittest.mock import MagicMock, AsyncMock, patch

from models import SourceConfig
from utils.api_adapter import VbetaApiAdapter
from utils.state import CrawlState

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
            "chapter": "/api/search/get-pages-by-tableofcontentid/"
        },
        output_folder="vbeta"
    )

@pytest.fixture
def mock_session():
    session = MagicMock()
    
    # helper to mock async with session.get()
    def make_async_context_manager(json_return, status=200):
        mock_resp = AsyncMock()
        mock_resp.status = status
        mock_resp.json = AsyncMock(return_value=json_return)
        
        ctx = AsyncMock()
        ctx.__aenter__ = AsyncMock(return_value=mock_resp)
        ctx.__aexit__ = AsyncMock(return_value=None)
        return ctx
        
    session.get = MagicMock()
    session.post = MagicMock()
    session.make_cm = make_async_context_manager
    return session

@pytest.fixture
def mock_state():
    state = MagicMock(spec=CrawlState)
    state.is_downloaded.return_value = False
    return state

@pytest.mark.asyncio
async def test_fetch_categories_success(source_config, mock_session, mock_state, tmp_path):
    adapter = VbetaApiAdapter(source_config, mock_session, mock_state, str(tmp_path))
    
    mock_data = {
        "success": True,
        "result": [
            {"value": 1, "label": "Kinh", "seoName": "kinh"}
        ]
    }
    
    # Mock the get request
    mock_session.get.return_value = mock_session.make_cm(mock_data)
    
    # We patch random.uniform and asyncio.sleep to run faster
    with patch("asyncio.sleep", new_callable=AsyncMock):
        with patch("random.uniform", return_value=0.1):
            categories = await adapter.fetch_categories()
            
    assert len(categories) == 1
    assert categories[0].value == 1
    assert categories[0].label == "Kinh"
    
    # Check if raw file was saved
    raw_file = tmp_path / "raw" / "vbeta" / "categories.json"
    assert raw_file.exists()

@pytest.mark.asyncio
async def test_error_handling_fetch_get(source_config, mock_session, mock_state, tmp_path):
    adapter = VbetaApiAdapter(source_config, mock_session, mock_state, str(tmp_path))
    
    # Mock an error response (500)
    mock_session.get.return_value = mock_session.make_cm({}, status=500)
    
    with patch("asyncio.sleep", new_callable=AsyncMock):
        with patch("random.uniform", return_value=0.1):
            categories = await adapter.fetch_categories()
            
    assert categories == []

@pytest.mark.asyncio
async def test_idempotency_skip_downloaded(source_config, mock_session, mock_state, tmp_path):
    adapter = VbetaApiAdapter(source_config, mock_session, mock_state, str(tmp_path))
    
    # Set the state to consider this chapter URL as downloaded
    expected_url = f"{source_config.api_base_url}{source_config.api_endpoints['chapter']}12439"
    mock_state.is_downloaded.side_effect = lambda url: url == expected_url
    
    # Provide necessary mock data for the traversal to reach the TOC check
    
    def get_side_effect(url, *args, **kwargs):
        if url.endswith("categories"):
            return mock_session.make_cm({"success": True, "result": [{"value": 1, "label": "Kinh", "seoName": "kinh"}]})
        elif "get-books" in url:
            return mock_session.make_cm({"success": True, "result": [{"value": 1, "label": "Book 1", "seoName": "book-1"}]})
        return mock_session.make_cm({}, status=404)
        
    mock_session.get.side_effect = get_side_effect
    
    # TOC
    toc_data = {
        "result": {
            "id": 1, "name": "Book 1", "seoName": "book-1", 
            "categoryId": 1, "categoryName": "Kinh",
            "tableOfContents": {
                "items": [{"id": 12439, "name": "Chapter 1", "seoName": "chapter-1", "viewCount": 0, "minPageNumber": 0, "maxPageNumber": 0}]
            }
        }
    }
    mock_session.post.return_value = mock_session.make_cm(toc_data)
    
    with patch("asyncio.sleep", new_callable=AsyncMock):
        await adapter.process_all()
        
    # The chapter fetch should NOT have happened because it's marked as downloaded.
    # We expect 2 GET calls: 1 for Categories, 1 for Books.
    assert mock_session.get.call_count == 2
    mock_state.is_downloaded.assert_called_with(expected_url)


# ─── New Phase Tests ─────────────────────────────────────────────────────────

# Shared fixture data
_TOC_RAW = {
    "result": {
        "id": 1,
        "name": "Book 1",
        "seoName": "book-1",
        "categoryId": 1,
        "categoryName": "Kinh",
        "coverImageUrl": None,
        "author": None,
        "authorId": None,
        "publisher": None,
        "publicationYear": None,
        "tableOfContents": {
            "items": [
                {
                    "id": 12439,
                    "name": "Chapter One",
                    "seoName": "chapter-one",
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
            {"pageNumber": 2, "sortNumber": 2, "htmlContent": "<p>Page 2</p>"},
        ]
    }
}


@pytest.mark.asyncio
async def test_crawl_phase_skips_chapter_if_raw_exists(source_config, mock_session, mock_state, tmp_path):
    """Given chapters/12439.json exists on disk, _crawl_phase should NOT call session.get for that chapter."""
    adapter = VbetaApiAdapter(source_config, mock_session, mock_state, str(tmp_path))

    # Pre-seed raw files so every level is skipped from disk
    raw_dir = tmp_path / "raw" / "vbeta"
    (raw_dir).mkdir(parents=True, exist_ok=True)

    # categories.json on disk
    import json as _json
    cats_data = {"result": [{"value": 1, "label": "Kinh", "seoName": "kinh"}]}
    (raw_dir / "categories.json").write_text(_json.dumps(cats_data))

    # books on disk
    (raw_dir / "books").mkdir(parents=True, exist_ok=True)
    books_data = {"result": [{"value": 1, "label": "Book 1", "seoName": "book-1"}]}
    (raw_dir / "books" / "by_category_1.json").write_text(_json.dumps(books_data))

    # toc on disk
    (raw_dir / "toc").mkdir(parents=True, exist_ok=True)
    (raw_dir / "toc" / "book_1.json").write_text(_json.dumps(_TOC_RAW))

    # chapters/12439.json on disk — this is the key pre-condition
    (raw_dir / "chapters").mkdir(parents=True, exist_ok=True)
    (raw_dir / "chapters" / "12439.json").write_text(_json.dumps(_CHAPTER_RAW))

    with patch("asyncio.sleep", new_callable=AsyncMock):
        registry = await adapter._crawl_phase()

    # session.get should NOT be called at all because every level hit disk
    mock_session.get.assert_not_called()
    mock_session.post.assert_not_called()
    # Still returns the book registry
    assert registry == [(1, "kinh", "book-1")]


@pytest.mark.asyncio
async def test_crawl_phase_skips_categories_if_raw_exists(source_config, mock_session, mock_state, tmp_path):
    """Given categories.json exists on disk, _crawl_phase should NOT call session.get for categories endpoint."""
    adapter = VbetaApiAdapter(source_config, mock_session, mock_state, str(tmp_path))

    raw_dir = tmp_path / "raw" / "vbeta"
    raw_dir.mkdir(parents=True, exist_ok=True)

    import json as _json
    # Only categories on disk — books/toc/chapters will not exist, so network would be called for them
    cats_data = {"result": []}  # empty result → no books to traverse
    (raw_dir / "categories.json").write_text(_json.dumps(cats_data))

    with patch("asyncio.sleep", new_callable=AsyncMock):
        registry = await adapter._crawl_phase()

    # categories endpoint was NOT called because file was read from disk
    for call in mock_session.get.call_args_list:
        url = call.args[0] if call.args else call.kwargs.get("url", "")
        assert "categories" not in url, f"categories endpoint was unexpectedly called: {url}"

    assert registry == []


def test_build_phase_creates_book_json(source_config, mock_state, tmp_path):
    """Given raw toc and chapter files, _build_phase should create book-data/{cat}/{book}.json."""
    adapter = VbetaApiAdapter(source_config, MagicMock(), mock_state, str(tmp_path))

    import json as _json
    raw_dir = tmp_path / "raw" / "vbeta"
    (raw_dir / "toc").mkdir(parents=True, exist_ok=True)
    (raw_dir / "chapters").mkdir(parents=True, exist_ok=True)

    (raw_dir / "toc" / "book_1.json").write_text(_json.dumps(_TOC_RAW))
    (raw_dir / "chapters" / "12439.json").write_text(_json.dumps(_CHAPTER_RAW))

    adapter._build_phase([(1, "kinh", "book-1")])

    out_path = tmp_path / "book-data" / "vbeta" / "kinh" / "book-1.json"
    assert out_path.exists(), "Expected book-data output file to be created"

    with open(out_path) as f:
        result = _json.load(f)

    assert len(result["chapters"]) == 1
    assert result["total_chapters"] == 1
    assert result["chapters"][0]["chapter_id"] == 12439
    assert len(result["chapters"][0]["pages"]) == 2


def test_build_phase_skips_if_book_json_exists(source_config, mock_state, tmp_path):
    """Given the output book JSON already exists, _build_phase should not overwrite it."""
    adapter = VbetaApiAdapter(source_config, MagicMock(), mock_state, str(tmp_path))

    import json as _json
    # Create the existing output file with a sentinel value
    out_dir = tmp_path / "book-data" / "vbeta" / "kinh"
    out_dir.mkdir(parents=True, exist_ok=True)
    sentinel_content = {"sentinel": True}
    out_file = out_dir / "book-1.json"
    out_file.write_text(_json.dumps(sentinel_content))

    # Also seed the raw files (in case skip logic fails and build runs)
    raw_dir = tmp_path / "raw" / "vbeta"
    (raw_dir / "toc").mkdir(parents=True, exist_ok=True)
    (raw_dir / "chapters").mkdir(parents=True, exist_ok=True)
    (raw_dir / "toc" / "book_1.json").write_text(_json.dumps(_TOC_RAW))
    (raw_dir / "chapters" / "12439.json").write_text(_json.dumps(_CHAPTER_RAW))

    mtime_before = out_file.stat().st_mtime
    adapter._build_phase([(1, "kinh", "book-1")])
    mtime_after = out_file.stat().st_mtime

    # File should not have been touched (mtime unchanged)
    assert mtime_before == mtime_after, "book-data output file was unexpectedly overwritten"

    # Content should still be the sentinel, not a real BookData JSON
    with open(out_file) as f:
        content = _json.load(f)
    assert content == sentinel_content
