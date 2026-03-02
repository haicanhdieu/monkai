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
