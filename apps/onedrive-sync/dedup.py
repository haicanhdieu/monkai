"""Deduplication pass — removes books already in vnthuquan or a prior onedrive import."""

import json
import re
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path

from manifest import ManifestEntry
from _shared import make_onedrive_id

_SOURCE = "nhasachmienphi"

_SPECIAL = str.maketrans({"Đ": "D", "đ": "d"})


def normalize_key(s: str) -> str:
    """Normalize a string for dedup matching: no diacritics, lowercase, spaces, trimmed.

    Distinct from slugify_title (hyphens) — this form preserves spaces for key tuples.
    """
    text = s.translate(_SPECIAL)
    nfd = unicodedata.normalize("NFD", text.lower())
    ascii_str = nfd.encode("ascii", errors="ignore").decode("ascii")
    collapsed = re.sub(r"[^a-z0-9]+", " ", ascii_str).strip()
    return collapsed


def candidate_key(title: str, author: str | None) -> tuple[str, str]:
    """Return (norm_title, norm_author) dedup key; empty string when author is absent."""
    return (normalize_key(title), normalize_key(author or ""))


@dataclass
class SkippedBook:
    title: str
    author: str | None
    reason: str  # "vnthuquan" | "in-batch" | "prior-onedrive"
    matched_against: str = ""


@dataclass
class FlaggedBook:
    title: str
    author: str | None
    note: str


@dataclass
class DeduplicatedBook:
    entry: ManifestEntry
    id: str


@dataclass
class DedupReport:
    kept: list[DeduplicatedBook] = field(default_factory=list)
    skipped: list[SkippedBook] = field(default_factory=list)
    flagged: list[FlaggedBook] = field(default_factory=list)


# Legacy alias used in sync.py
DedupeRun = DedupReport


def load_existing_keys(index_path: Path | None) -> set[tuple[str, str]]:
    """Load (norm_title, norm_author) key set from a book-data index.json.

    Returns empty set if path is None, file is absent, or file is malformed.
    Supports both vnthuquan format ({books: [{book_name, author}]})
    and onedrive format ({books: [{title, author}]}).
    """
    if index_path is None or not index_path.exists():
        return set()
    try:
        data = json.loads(index_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return set()
    if not isinstance(data, dict):
        return set()
    books = data.get("books", [])
    if not isinstance(books, list):
        return set()
    keys: set[tuple[str, str]] = set()
    for b in books:
        if not isinstance(b, dict):
            continue
        title = b.get("book_name") or b.get("title") or ""
        author = b.get("author") or ""
        keys.add(candidate_key(title, author))
    return keys


def dedup_candidates(
    entries: list[ManifestEntry],
    *,
    vnthuquan_index_path: Path | None,
    onedrive_index_path: Path | None,
    fuzzy: bool = False,  # reserved; token-set-ratio ≥ 0.95 pass (not implemented)
) -> DedupReport:
    """Run dedup pass. Returns DedupReport with kept/skipped/flagged lists.

    Skips candidates matching vnthuquan, prior onedrive, or an earlier entry in the batch.
    Flags (keeps but records) title-only matches when either author is empty.
    Assigns deterministic onedrive IDs; disambiguates slug collisions with author slug.
    """
    vnt_keys = load_existing_keys(vnthuquan_index_path)
    od_keys = load_existing_keys(onedrive_index_path)

    report = DedupReport()
    seen: set[tuple[str, str]] = set()
    slug_counts: dict[str, int] = {}  # title-slug → count, for collision detection

    # First pass: determine which entries to keep and collect title slugs
    kept_entries: list[tuple[ManifestEntry, str]] = []  # (entry, id)
    for entry in entries:
        key = candidate_key(entry.title, entry.author)
        norm_title = key[0]
        norm_author = key[1]

        # Check in-batch exact duplicate first (full key)
        if key in seen:
            report.skipped.append(SkippedBook(entry.title, entry.author, "in-batch"))
            continue

        # _already_flagged prevents double-flagging when title matches multiple source indexes
        _already_flagged = [False]

        # Check exact full-key match against existing sources — ONLY skip when both authors non-empty
        # Per AC#2: if either author empty, a title-only match is flagged, never auto-skipped
        def _check_existing_skip(key_set: set[tuple[str, str]], source_name: str) -> bool:
            if key in key_set:
                if norm_author == "" or _matched_has_empty_author(norm_title, norm_author, key_set):
                    # Either party has empty author → title-only match → flag, keep
                    if not _already_flagged[0]:
                        report.flagged.append(FlaggedBook(
                            title=entry.title,
                            author=entry.author,
                            note=f"title-only match against {source_name}; kept pending review",
                        ))
                        _already_flagged[0] = True
                    return False  # do NOT skip
                else:
                    # Both have non-empty authors and keys match exactly → skip
                    report.skipped.append(SkippedBook(entry.title, entry.author, source_name))
                    return True  # skip
            # Check title-only match: same title, different (or empty) author in existing
            if any(nk == norm_title and (na == "" or norm_author == "") for (nk, na) in key_set):
                if not _already_flagged[0]:
                    report.flagged.append(FlaggedBook(
                        title=entry.title,
                        author=entry.author,
                        note=f"title-only match against {source_name}; kept pending review",
                    ))
                    _already_flagged[0] = True
            return False  # keep

        if _check_existing_skip(vnt_keys, "vnthuquan"):
            continue
        if _check_existing_skip(od_keys, "prior-onedrive"):
            continue

        seen.add(key)
        # Tentative id without disambiguation
        base_id = make_onedrive_id(_SOURCE, entry.title)
        slug_counts[base_id] = slug_counts.get(base_id, 0) + 1
        kept_entries.append((entry, base_id))

    # Second pass: disambiguate colliding ids
    for entry, base_id in kept_entries:
        count = slug_counts[base_id]
        if count > 1:
            final_id = make_onedrive_id(_SOURCE, entry.title, entry.author or "")
        else:
            final_id = base_id
        report.kept.append(DeduplicatedBook(entry=entry, id=final_id))

    # Guarantee uniqueness (should always hold given disambiguation logic)
    ids = [k.id for k in report.kept]
    if len(ids) != len(set(ids)):
        raise RuntimeError("ID collision after disambiguation — manual review required")

    return report


def _matched_has_empty_author(
    norm_title: str, norm_author: str, key_set: set[tuple[str, str]]
) -> bool:
    """True if the matching entry in key_set has an empty author."""
    return (norm_title, "") in key_set
