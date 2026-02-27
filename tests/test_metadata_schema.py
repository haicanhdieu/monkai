# tests/test_metadata_schema.py
import json
import pytest
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
        subcategory="Truong Bo",
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
