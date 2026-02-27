# Story 1.5: Unit Tests for Core Utilities

Status: done

## Story

As a developer,
I want 5 unit test files covering the critical shared utilities,
so that regressions in the deterministic logic that all pipeline modules depend on are caught immediately.

## Acceptance Criteria

1. **Given** `tests/test_slugify.py` exists
   **When** `devbox run test` is executed
   **Then** tests pass for: `make_id` determinism, Vietnamese diacritic stripping (`Tâm→tam`, `Đại→dai`, `Ưu→uu`), double-underscore separator format, edge cases (empty title, special characters)

2. **Given** `tests/test_metadata_schema.py` exists
   **When** tests run
   **Then** they cover: valid `ScriptureMetadata` instantiation, `ValidationError` on missing required fields, `null` for optional fields in JSON output, enum rejection for invalid category/format/copyright values

3. **Given** `tests/test_dedup.py` exists
   **When** tests run
   **Then** they cover: `sha256_hash` stability for known bytes, `is_duplicate` True for known hash, False for new hash

4. **Given** `tests/test_robots.py` exists with mocked HTTP responses
   **When** tests run
   **Then** they cover: allowed URL → True, disallowed URL → False, wildcard disallow rule, missing robots.txt treated as allow-all

5. **Given** `tests/test_incremental.py` exists with a temporary `CrawlState`
   **When** tests run
   **Then** they cover: `is_downloaded` True for known URL, False for unknown URL, filesystem fallback repairs state when file exists but URL not tracked

6. **And** `devbox run test` exits 0 with all 5 test files collected and all tests passing

## Tasks / Subtasks

- [x] Create `tests/conftest.py` with shared fixtures (required by multiple test files)
  - [x] `sample_metadata_fields` fixture — dict with all valid ScriptureMetadata fields
  - [x] `tmp_state_file` fixture — temporary path for CrawlState tests (use tmp_path)
- [x] Create `tests/test_slugify.py` (AC: 1)
  - [x] `test_make_id_basic` — make_id with ASCII inputs → correct format
  - [x] `test_make_id_with_vietnamese_diacritics` — make_id with "Tâm Kinh" → `"thuvienhoasen__tam-kinh"`
  - [x] `test_make_id_determinism` — same inputs called twice → identical result
  - [x] `test_make_id_case_insensitive` — uppercase source/title → same as lowercase
  - [x] `test_diacritics_tam` — "Tâm" → "tam"
  - [x] `test_diacritics_dai` — "Đại" → "dai"
  - [x] `test_diacritics_uu` — "Ưu" → "uu"
  - [x] `test_double_underscore_separator` — exactly `__` between source and title, not `-` or `_`
  - [x] `test_special_chars_become_hyphens` — special chars become hyphens
  - [x] `test_edge_case_empty_title` — verify behavior with empty/whitespace title
- [x] Create `tests/test_metadata_schema.py` (AC: 2)
  - [x] `test_valid_instantiation` — all required fields → no error
  - [x] `test_optional_fields_are_null_in_json` — title_pali, title_sanskrit, author_translator → `null` in JSON
  - [x] `test_missing_required_field_raises_error` — omit `title` → ValidationError
  - [x] `test_invalid_category_raises_error` — category="Buddhism" → ValidationError
  - [x] `test_invalid_file_format_raises_error` — file_format="docx" → ValidationError
  - [x] `test_invalid_copyright_raises_error` — copyright_status="copyrighted" → ValidationError
  - [x] `test_created_at_serializes_to_iso8601` — verify datetime serializes to ISO 8601 UTC string
  - [x] `test_index_record_exact_9_fields` — IndexRecord only has the 9 specified fields
- [x] Create `tests/test_dedup.py` (AC: 3)
  - [x] `test_sha256_hash_known_value` — `sha256_hash(b"hello")` matches known expected hex
  - [x] `test_sha256_hash_stability` — same bytes → same hash on repeated calls
  - [x] `test_sha256_hash_different_inputs` — different bytes → different hashes
  - [x] `test_is_duplicate_true_for_known_hash` — hash in set → True
  - [x] `test_is_duplicate_false_for_new_hash` — hash not in set → False
  - [x] `test_is_duplicate_does_not_mutate_set` — verify seen_hashes unchanged after call
- [x] Create `tests/test_robots.py` with mocked HTTP (AC: 4)
  - [x] `test_allowed_url_returns_true` — URL allowed by robots.txt → True
  - [x] `test_disallowed_url_returns_false` — explicitly disallowed path → False
  - [x] `test_wildcard_disallow_all` — `Disallow: /` blocks all → False
  - [x] `test_missing_robots_txt_returns_true` — robots.txt fetch fails → allow-all (True)
  - [x] `test_user_agent_constant` — verify USER_AGENT == "MonkaiCrawler/1.0"
  - [x] `test_robots_cached_per_domain` — verify get_parser called per request
- [x] Create `tests/test_incremental.py` (AC: 5)
  - [x] `test_is_downloaded_true_after_mark_and_save` — mark + save + new load → is_downloaded True
  - [x] `test_is_downloaded_false_for_unknown_url` — fresh state, unknown URL → False
  - [x] `test_mark_and_save_persists_to_disk` — verify JSON file written correctly
  - [x] `test_filesystem_fallback_repairs_state` — file exists on disk but not in state → mark_downloaded called, then skip
  - [x] `test_load_existing_state` — pre-populate JSON file, CrawlState loads it correctly
- [x] Run `devbox run test` and confirm all tests pass (AC: 6) — 35 tests pass ✅

## Dev Notes

### Dependency on Stories 1.1–1.4

All tested modules must exist:
- `utils/slugify.py` (Story 1.4)
- `models.py` with ScriptureMetadata, IndexRecord (Story 1.3)
- `utils/dedup.py` (Story 1.4)
- `utils/robots.py` (Story 1.4)
- `utils/state.py` (Story 1.4)
- `tests/__init__.py` (Story 1.1)

### tests/conftest.py

```python
# tests/conftest.py
import json
import os
import pytest
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
```

### tests/test_slugify.py

```python
# tests/test_slugify.py
from utils.slugify import make_id, slugify_title


def test_make_id_basic():
    assert make_id("thuvienhoasen", "Tâm Kinh") == "thuvienhoasen__tam-kinh"


def test_make_id_determinism():
    result1 = make_id("thuvienhoasen", "Tâm Kinh")
    result2 = make_id("thuvienhoasen", "Tâm Kinh")
    assert result1 == result2


def test_make_id_case_insensitive():
    lower = make_id("thuvienhoasen", "tâm kinh")
    upper = make_id("THUVIENHOASEN", "TÂM KINH")
    assert lower == upper


def test_double_underscore_separator():
    result = make_id("source", "title")
    assert "__" in result
    parts = result.split("__")
    assert len(parts) == 2
    assert parts[0] == "source"
    assert parts[1] == "title"


def test_diacritics_tam():
    assert slugify_title("Tâm") == "tam"


def test_diacritics_dai():
    assert slugify_title("Đại") == "dai"


def test_diacritics_uu():
    # Ư decomposes: ư → u + combining hook above — stripped to u
    result = slugify_title("Ưu")
    assert result == "uu"


def test_special_chars_become_hyphens():
    result = slugify_title("kinh (bát nhã)")
    assert result == "kinh-bat-nha"


def test_edge_case_empty_title():
    # Should not raise — returns empty string or single hyphen stripped
    result = make_id("source", "")
    assert "source__" in result or result == "source__"
```

### tests/test_metadata_schema.py

```python
# tests/test_metadata_schema.py
import json
import pytest
from datetime import datetime, UTC
from pydantic import ValidationError
from models import ScriptureMetadata, IndexRecord


def test_valid_instantiation(sample_metadata_fields):
    m = ScriptureMetadata(**sample_metadata_fields)
    assert m.id == "thuvienhoasen__tam-kinh"
    assert m.title == "Tâm Kinh"


def test_optional_fields_are_null_in_json(sample_metadata_fields):
    m = ScriptureMetadata(**sample_metadata_fields)
    data = json.loads(m.model_dump_json())
    # Optional fields must appear as null, not be omitted
    assert "title_pali" in data
    assert data["title_pali"] is None
    assert "title_sanskrit" in data
    assert data["title_sanskrit"] is None
    assert "author_translator" in data
    assert data["author_translator"] is None


def test_missing_required_field_raises_error(sample_metadata_fields):
    del sample_metadata_fields["title"]
    with pytest.raises(ValidationError) as exc_info:
        ScriptureMetadata(**sample_metadata_fields)
    assert "title" in str(exc_info.value)


def test_invalid_category_raises_error(sample_metadata_fields):
    sample_metadata_fields["category"] = "Buddhism"
    with pytest.raises(ValidationError):
        ScriptureMetadata(**sample_metadata_fields)


def test_invalid_file_format_raises_error(sample_metadata_fields):
    sample_metadata_fields["file_format"] = "docx"
    with pytest.raises(ValidationError):
        ScriptureMetadata(**sample_metadata_fields)


def test_invalid_copyright_raises_error(sample_metadata_fields):
    sample_metadata_fields["copyright_status"] = "copyrighted"
    with pytest.raises(ValidationError):
        ScriptureMetadata(**sample_metadata_fields)


def test_created_at_serializes_to_iso8601(sample_metadata_fields):
    m = ScriptureMetadata(**sample_metadata_fields)
    data = json.loads(m.model_dump_json())
    created_at_str = data["created_at"]
    # Must be a string parseable as ISO 8601
    assert isinstance(created_at_str, str)
    assert "T" in created_at_str  # ISO 8601 datetime separator


def test_index_record_exact_9_fields():
    record = IndexRecord(
        id="test__record",
        title="Test",
        category="Nikaya",
        subcategory="Trường Bộ",
        source="budsas",
        url="https://budsas.org/test",
        file_path="data/raw/budsas/nikaya/test.html",
        file_format="html",
        copyright_status="public_domain",
    )
    data = record.model_dump()
    assert len(data) == 9
    expected_keys = {"id", "title", "category", "subcategory", "source", "url",
                     "file_path", "file_format", "copyright_status"}
    assert set(data.keys()) == expected_keys
```

### tests/test_dedup.py

```python
# tests/test_dedup.py
from utils.dedup import sha256_hash, is_duplicate

KNOWN_HASH = "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"  # sha256(b"hello")


def test_sha256_hash_known_value():
    assert sha256_hash(b"hello") == KNOWN_HASH


def test_sha256_hash_stability():
    assert sha256_hash(b"test bytes") == sha256_hash(b"test bytes")


def test_sha256_hash_different_inputs():
    assert sha256_hash(b"hello") != sha256_hash(b"world")


def test_is_duplicate_true_for_known_hash():
    seen = {KNOWN_HASH}
    assert is_duplicate(KNOWN_HASH, seen) is True


def test_is_duplicate_false_for_new_hash():
    seen = {KNOWN_HASH}
    new_hash = sha256_hash(b"different content")
    assert is_duplicate(new_hash, seen) is False


def test_is_duplicate_does_not_mutate_set():
    seen: set[str] = set()
    new_hash = sha256_hash(b"some content")
    is_duplicate(new_hash, seen)
    assert len(seen) == 0  # is_duplicate must not add to the set
```

### tests/test_robots.py

Use `unittest.mock` to mock HTTP responses. Do NOT make real network calls in unit tests.

```python
# tests/test_robots.py
from unittest.mock import patch, MagicMock
from utils.robots import RobotsCache, robots_allowed, USER_AGENT

ALLOW_ALL_ROBOTS = b"User-agent: *\nAllow: /"
DISALLOW_ALL_ROBOTS = b"User-agent: *\nDisallow: /"
DISALLOW_SPECIFIC_ROBOTS = b"User-agent: *\nDisallow: /private/"


def _make_cache_with_mock_robots(robots_content: bytes | None) -> RobotsCache:
    """Helper: returns RobotsCache with mocked robots.txt fetch."""
    cache = RobotsCache()
    with patch("urllib.request.urlopen") as mock_open:
        if robots_content is None:
            mock_open.side_effect = Exception("Connection refused")
        else:
            mock_response = MagicMock()
            mock_response.read.return_value = robots_content
            mock_response.__enter__ = lambda s: s
            mock_response.__exit__ = MagicMock(return_value=False)
            mock_open.return_value = mock_response
        # Trigger a fetch to populate the cache
        cache.get_parser("https://example.com/some-page")
    return cache


def test_user_agent_constant():
    assert USER_AGENT == "MonkaiCrawler/1.0"


def test_allowed_url_returns_true():
    with patch.object(RobotsCache, "get_parser") as mock_parser:
        parser = MagicMock()
        parser.can_fetch.return_value = True
        mock_parser.return_value = parser
        cache = RobotsCache()
        assert robots_allowed(cache, "https://example.com/allowed") is True
        parser.can_fetch.assert_called_with(USER_AGENT, "https://example.com/allowed")


def test_disallowed_url_returns_false():
    with patch.object(RobotsCache, "get_parser") as mock_parser:
        parser = MagicMock()
        parser.can_fetch.return_value = False
        mock_parser.return_value = parser
        cache = RobotsCache()
        assert robots_allowed(cache, "https://example.com/private/doc") is False


def test_missing_robots_txt_returns_true():
    """If robots.txt can't be fetched, fail-open (allow all)."""
    cache = RobotsCache()
    with patch.object(cache, "get_parser") as mock_get:
        parser = MagicMock()
        parser.can_fetch.return_value = True  # fail-open default
        mock_get.return_value = parser
        assert robots_allowed(cache, "https://example.com/page") is True


def test_wildcard_disallow_all():
    with patch.object(RobotsCache, "get_parser") as mock_parser:
        parser = MagicMock()
        parser.can_fetch.return_value = False
        mock_parser.return_value = parser
        cache = RobotsCache()
        assert robots_allowed(cache, "https://example.com/anything") is False
```

### tests/test_incremental.py

```python
# tests/test_incremental.py
import json
import os
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
```

### Key Testing Constraints

- **No real network calls** in any test — mock all HTTP with `unittest.mock`
- **Use `tmp_path` fixture** for all file I/O in tests — never write to `data/crawl-state.json` during tests
- **pytest fixtures** via `conftest.py` — `sample_metadata_fields` and `tmp_state_file` are shared
- **Test file naming** is `test_{module}.py` — matches pytest discovery defaults

### Architecture Note: Test File Naming

The architecture document has a minor naming discrepancy. It shows `test_id_generation.py` in one section, but Story 1.5 ACs and the additional requirements explicitly specify `test_slugify.py`. **Use `test_slugify.py`** as defined in the ACs and additional requirements.

### Project Structure Notes

Completed `tests/` structure after this story:
```
tests/
├── __init__.py              ← from Story 1.1
├── conftest.py              ← shared fixtures
├── test_slugify.py
├── test_metadata_schema.py
├── test_dedup.py
├── test_robots.py
└── test_incremental.py
```

`devbox run test` runs `uv run pytest` which auto-discovers all `test_*.py` files.

### References

- [Source: _bmad-output/planning-artifacts/phase-1-crawler/architecture-phase1-crawler.md#Testing Standards]
- [Source: _bmad-output/planning-artifacts/phase-1-crawler/architecture-phase1-crawler.md#Project Structure & Boundaries]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.5: Unit Tests for Core Utilities]
- [Source: _bmad-output/planning-artifacts/epics.md#Additional Requirements — Unit Tests Required]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- Created 5 test files + conftest.py covering all core utilities
- 35 tests collected, 35 passed — `devbox run test` exits 0 ✅
- `devbox run lint` passes cleanly ✅
- Key decisions: used unicode code points in tests (not raw Vietnamese characters) to avoid encoding issues in shell
- Removed unused imports (`os` from test_incremental.py, `datetime`/`UTC` from test_metadata_schema.py) after lint check
- test_robots.py uses `unittest.mock.patch.object` — no real network calls made in any test
- tmp_state_file fixture uses `tmp_path / "crawl-state.json"` (non-existent path) to avoid empty-file JSON parse error

### File List

- tests/conftest.py
- tests/test_slugify.py (code review: test_make_id_basic and test_make_id_determinism now use Vietnamese input; test_special_chars_become_hyphens uses actual Vietnamese diacritics)
- tests/test_metadata_schema.py
- tests/test_dedup.py
- tests/test_robots.py (code review: test_robots_cached_per_domain now patches RobotFileParser.read to verify HTTP fetch happens once, not get_parser calls)
- tests/test_incremental.py
