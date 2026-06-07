"""Parse and filter the __books.json manifest from OneDrive staging."""

import json
import os
from pathlib import Path

from pydantic import BaseModel, ConfigDict


class ManifestEntry(BaseModel):
    model_config = ConfigDict(extra="ignore")

    title: str
    category: str
    url: str | None = None
    imageUrl: str | None = None
    author: str | None = None
    imageFile: str | None = None
    epubUrl: str | None = None
    epubFile: str | None = None
    pdfUrl: str | None = None
    pdfFile: str | None = None


def load_manifest(path: Path) -> list[ManifestEntry]:
    """Load and validate __books.json. Raises ValueError on malformed input."""
    if not path.exists():
        raise FileNotFoundError(
            f"Manifest not found: {path}\n"
            "Run 'devbox run sync-books:pull' first to download files from OneDrive."
        )
    raw = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(raw, list):
        raise ValueError(f"Manifest must be a JSON list, got {type(raw).__name__}: {path}")
    entries: list[ManifestEntry] = []
    for i, item in enumerate(raw):
        try:
            entries.append(ManifestEntry.model_validate(item))
        except Exception as exc:
            raise ValueError(f"Manifest entry {i} invalid: {exc}") from exc
    return entries


def eligible_epub(entries: list[ManifestEntry]) -> list[ManifestEntry]:
    """Keep only entries with a non-empty, non-whitespace epubFile."""
    return [e for e in entries if e.epubFile and e.epubFile.strip()]


def epub_staging_path(entry: ManifestEntry, staging_dir: Path) -> Path:
    """Resolve the local staging path for an entry's epub file.

    staging_dir / "nhasachmienphi" / basename(entry.epubFile)
    """
    return staging_dir / "nhasachmienphi" / os.path.basename(entry.epubFile or "")
