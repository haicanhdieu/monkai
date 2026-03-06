# tests/conftest.py
import pytest
import sys
import os
from datetime import datetime, UTC

# Add parent directory to sys.path so tests can import from utils without crawling module context issues
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from datetime import datetime, UTC


@pytest.fixture
def sample_metadata_fields():
    """Valid field dict for constructing ScriptureMetadata in tests."""
    return {
        "id": "thuvienhoasen__tam-kinh",
        "title": "Tâm Kinh",
        "category": "Đại Thừa",
        "subcategory": "Bát Nhã",
        "source": "thuvienhoasen",
        "url": "https://thuvienhoasen.org/tam-kinh",
        "file_path": "data/raw/thuvienhoasen/dai-thua/tam-kinh.html",
        "file_format": "html",
        "copyright_status": "public_domain",
        "created_at": datetime.now(UTC),
    }


@pytest.fixture
def tmp_state_file(tmp_path):
    """Temporary path for CrawlState — isolates tests from data/crawl-state.json."""
    return str(tmp_path / "crawl-state.json")
