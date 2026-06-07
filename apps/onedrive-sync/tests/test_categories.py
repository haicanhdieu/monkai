import yaml
from pathlib import Path

import pytest

from categories import (
    GateResult,
    apply_quality_gate,
    build_category_lookup,
    map_category,
)
from manifest import ManifestEntry


SAMPLE_MAPPING = {
    "mapped": {
        "Tiểu Thuyết Phương Tây": {"target": "Tiểu Thuyết", "count": 1},
    },
    "new_categories": {
        "Triết Học": {"target": "Triết Học", "count": 1, "new": True},
    },
    "excluded": {
        "Kinh Tế - Quản Lý": {"count": 1, "reason": "utility-business"},
    },
    "on_unmapped": "error",
}


def write_mapping(tmp_path: Path, data: dict) -> Path:
    p = tmp_path / "category-mapping.yaml"
    p.write_text(yaml.dump(data, allow_unicode=True), encoding="utf-8")
    return p


def make_entry(category: str, title: str = "Test", image: str | None = "output/images/cover.jpg") -> ManifestEntry:
    return ManifestEntry(title=title, category=category, imageFile=image)


# --- build_category_lookup ---

def test_lookup_mapped_genre(tmp_path):
    path = write_mapping(tmp_path, SAMPLE_MAPPING)
    lookup = build_category_lookup(path)
    r = lookup.get("Tiểu Thuyết Phương Tây")
    assert r is not None
    assert r.target == "Tiểu Thuyết"
    assert r.action == "map"


def test_lookup_new_category(tmp_path):
    path = write_mapping(tmp_path, SAMPLE_MAPPING)
    lookup = build_category_lookup(path)
    r = lookup.get("Triết Học")
    assert r is not None
    assert r.target == "Triết Học"
    assert r.action == "new"


def test_lookup_excluded_genre(tmp_path):
    path = write_mapping(tmp_path, SAMPLE_MAPPING)
    lookup = build_category_lookup(path)
    r = lookup.get("Kinh Tế - Quản Lý")
    assert r is not None
    assert r.action == "exclude"


# --- map_category ---

def test_map_category_returns_target(tmp_path):
    path = write_mapping(tmp_path, SAMPLE_MAPPING)
    lookup = build_category_lookup(path)
    entry = make_entry("Tiểu Thuyết Phương Tây")
    result = map_category(entry, lookup)
    assert result.category_name == "Tiểu Thuyết"
    assert result.action == "map"


def test_map_category_excluded_drops(tmp_path):
    path = write_mapping(tmp_path, SAMPLE_MAPPING)
    lookup = build_category_lookup(path)
    entry = make_entry("Kinh Tế - Quản Lý")
    result = map_category(entry, lookup)
    assert result.action == "exclude"


def test_map_category_unmapped_raises(tmp_path):
    path = write_mapping(tmp_path, SAMPLE_MAPPING)
    lookup = build_category_lookup(path)
    entry = make_entry("Không Có Trong Danh Sách")
    with pytest.raises(ValueError, match="unmapped category"):
        map_category(entry, lookup)


# --- apply_quality_gate ---

def test_quality_gate_passes_with_cover_and_title(tmp_path):
    staging = tmp_path / "staging"
    cover_path = staging / "nhasachmienphi" / "cover.jpg"
    cover_path.parent.mkdir(parents=True)
    cover_path.touch()
    entry = ManifestEntry(
        title="Good Book",
        category="Triết Học",
        imageFile="output/images/cover.jpg",
    )
    result = apply_quality_gate(entry, staging_dir=staging)
    assert result == GateResult.PASS


def test_quality_gate_fails_missing_cover(tmp_path):
    staging = tmp_path / "staging"
    staging.mkdir()
    entry = ManifestEntry(
        title="Good Book",
        category="Triết Học",
        imageFile="output/images/missing.jpg",
    )
    result = apply_quality_gate(entry, staging_dir=staging)
    assert result == GateResult.FAIL_COVER


def test_quality_gate_fails_empty_title(tmp_path):
    staging = tmp_path / "staging"
    staging.mkdir()
    entry = ManifestEntry(
        title="   ",
        category="Triết Học",
        imageFile=None,
    )
    result = apply_quality_gate(entry, staging_dir=staging)
    assert result == GateResult.FAIL_TITLE


# --- licensing gate ---

def test_licensing_gate_confirmed():
    from categories import licensing_confirmed
    assert licensing_confirmed(True) is True


def test_licensing_gate_unconfirmed():
    from categories import licensing_confirmed
    assert licensing_confirmed(False) is False
