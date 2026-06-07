"""Category mapping loader and quality/licensing gates."""

import os
from dataclasses import dataclass
from enum import Enum
from pathlib import Path

import yaml

from manifest import ManifestEntry


@dataclass
class CategoryEntry:
    target: str
    action: str  # "map" | "new" | "exclude"


@dataclass
class CategoryResult:
    category_name: str | None  # None when excluded
    action: str  # "map" | "new" | "exclude"
    original_category: str


class GateResult(Enum):
    PASS = "pass"
    FAIL_COVER = "fail-cover"
    FAIL_TITLE = "fail-title"


def build_category_lookup(mapping_path: Path) -> dict[str, CategoryEntry]:
    """Load category-mapping.yaml and build a flat category → CategoryEntry dict."""
    data = yaml.safe_load(mapping_path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError(f"category-mapping.yaml must be a YAML mapping: {mapping_path}")
    lookup: dict[str, CategoryEntry] = {}

    mapped = data.get("mapped") or {}
    if not isinstance(mapped, dict):
        raise ValueError("category-mapping.yaml: 'mapped' section must be a mapping")
    for cat, details in mapped.items():
        if not isinstance(details, dict) or "target" not in details:
            raise ValueError(f"category-mapping.yaml: 'mapped.{cat}' missing 'target' key")
        lookup[cat] = CategoryEntry(target=details["target"], action="map")

    new_cats = data.get("new_categories") or {}
    if not isinstance(new_cats, dict):
        raise ValueError("category-mapping.yaml: 'new_categories' section must be a mapping")
    for cat, details in new_cats.items():
        if cat in lookup:
            raise ValueError(f"category-mapping.yaml: category '{cat}' appears in multiple sections")
        if not isinstance(details, dict) or "target" not in details:
            raise ValueError(f"category-mapping.yaml: 'new_categories.{cat}' missing 'target' key")
        lookup[cat] = CategoryEntry(target=details["target"], action="new")

    excluded = data.get("excluded") or {}
    if not isinstance(excluded, dict):
        raise ValueError("category-mapping.yaml: 'excluded' section must be a mapping")
    for cat, _details in excluded.items():
        if cat in lookup:
            raise ValueError(f"category-mapping.yaml: category '{cat}' appears in multiple sections")
        lookup[cat] = CategoryEntry(target="", action="exclude")

    return lookup


def map_category(entry: ManifestEntry, lookup: dict[str, CategoryEntry]) -> CategoryResult:
    """Map a book's manifest category. Raises ValueError on unmapped category."""
    cat = entry.category
    mapping = lookup.get(cat)
    if mapping is None:
        raise ValueError(f"unmapped category: '{cat}'")
    return CategoryResult(
        category_name=mapping.target if mapping.action != "exclude" else None,
        action=mapping.action,
        original_category=cat,
    )


def apply_quality_gate(entry: ManifestEntry, staging_dir: Path) -> GateResult:
    """Check cover and title quality. Empty/whitespace title → FAIL_TITLE.
    Missing or unresolvable cover → FAIL_COVER. Author emptiness is tolerated.
    """
    if not entry.title or not entry.title.strip():
        return GateResult.FAIL_TITLE

    if not entry.imageFile:
        return GateResult.FAIL_COVER

    cover_path = staging_dir / "nhasachmienphi" / os.path.basename(entry.imageFile)
    if not cover_path.exists():
        return GateResult.FAIL_COVER

    return GateResult.PASS


def licensing_confirmed(confirmed: bool) -> bool:
    """Return True only if the operator has explicitly confirmed redistributability.

    nhasachmienphi.com = "free book house" — lower legal risk, but an explicit
    confirmation gate is required before public exposure (FR24, D7).
    Pass --licensing-confirmed flag or set licensing_confirmed=true in config.
    """
    return confirmed
