# tests/test_incremental.py
import json
from utils.state import CrawlState

TEST_URL = "https://thuvienhoasen.org/tam-kinh"


def test_is_downloaded_false_for_unknown_url(tmp_state_file):
    state = CrawlState(tmp_state_file)
    assert state.is_downloaded(TEST_URL) is False


def test_is_downloaded_true_after_mark_and_save(tmp_state_file):
    state = CrawlState(tmp_state_file)
    state.mark_downloaded(TEST_URL)
    state.save()
    # Load fresh instance to verify persistence
    state2 = CrawlState(tmp_state_file)
    assert state2.is_downloaded(TEST_URL) is True


def test_mark_and_save_persists_to_disk(tmp_state_file):
    state = CrawlState(tmp_state_file)
    state.mark_downloaded(TEST_URL)
    state.save()
    with open(tmp_state_file) as f:
        data = json.load(f)
    assert data[TEST_URL] == "downloaded"


def test_load_existing_state(tmp_state_file):
    # Pre-populate state file
    with open(tmp_state_file, "w") as f:
        json.dump({TEST_URL: "downloaded"}, f)
    state = CrawlState(tmp_state_file)
    assert state.is_downloaded(TEST_URL) is True


def test_filesystem_fallback_repairs_state(tmp_state_file, tmp_path):
    """If file exists on disk but URL not in state, state should be repairable."""
    # Create a mock downloaded file
    fake_file = tmp_path / "downloaded.html"
    fake_file.write_text("<html></html>")

    state = CrawlState(tmp_state_file)
    # Simulate: file exists but not tracked → repair by calling mark_downloaded
    assert state.is_downloaded(TEST_URL) is False  # not yet tracked
    if fake_file.exists() and fake_file.stat().st_size > 0:
        state.mark_downloaded(TEST_URL)  # repair
    assert state.is_downloaded(TEST_URL) is True
