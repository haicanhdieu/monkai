# models.py
from __future__ import annotations
from datetime import datetime
from typing import Literal
from pydantic import BaseModel, ConfigDict, field_validator


class SourceConfig(BaseModel):
    """Configuration for a single crawl source. Loaded from config.yaml."""
    name: str
    seed_url: str
    rate_limit_seconds: float = 1.5
    output_folder: str
    css_selectors: dict[str, str]
    file_type_hints: list[str] = []
    pagination_selector: str | None = None
    catalog_sub_selector: str = ""

    @field_validator("rate_limit_seconds")
    @classmethod
    def enforce_minimum_rate_limit(cls, v: float) -> float:
        if v < 1.0:
            raise ValueError(
                f"rate_limit_seconds must be ≥ 1.0 for ethical crawling, got {v}"
            )
        return v


class CrawlerConfig(BaseModel):
    """Top-level crawler configuration. Contains all sources."""
    sources: list[SourceConfig]
    output_dir: str = "data"
    log_file: str = "logs/crawl.log"


class ScriptureMetadata(BaseModel):
    """Full metadata record for a single downloaded scripture file.

    Written as {filename}.meta.json alongside each raw file.
    Optional fields are always serialized as null — never omitted.
    """
    model_config = ConfigDict(populate_by_name=True)

    id: str                          # e.g. "thuvienhoasen__kinh-tam-kinh"
    title: str                       # Original title in Vietnamese
    title_pali: str | None = None    # Pali title if present, else null
    title_sanskrit: str | None = None  # Sanskrit title if present, else null
    category: Literal[
        "Nikaya", "Đại Thừa", "Mật Tông", "Thiền", "Tịnh Độ"
    ]
    subcategory: str                 # e.g. "Trường Bộ", "Bát Nhã"
    book_collection: str | None = None  # e.g. "Tiểu Bộ - Khuddhaka Nikaya"
    book_title: str | None = None    # e.g. "Tập II - Ngạ Quỷ Sự"
    chapter: str | None = None       # e.g. "Phẩm Ubbari"
    source: str                      # Source name from config, e.g. "thuvienhoasen"
    url: str                         # Canonical source URL
    author_translator: str | None = None  # Translator name if present, else null
    content: str | None = None       # Full text content of the scripture page
    file_path: str                   # Relative path: "data/raw/thuvienhoasen/nikaya/tam-kinh.html"
    file_format: Literal["html", "pdf", "epub", "other"]
    copyright_status: Literal["public_domain", "unknown"]
    created_at: datetime             # UTC datetime; serializes to ISO 8601

    @field_validator("created_at")
    @classmethod
    def enforce_utc(cls, v: datetime) -> datetime:
        if v.tzinfo is None:
            raise ValueError(
                "created_at must be timezone-aware (UTC); got naive datetime"
            )
        return v


class IndexRecord(BaseModel):
    """Lightweight record in data/index.json — the Phase 2 handoff contract.

    Contains exactly 9 fields. Do NOT add metadata-only fields here.
    This schema is frozen after Phase 1 — changes break Phase 2.
    """
    id: str
    title: str
    category: Literal[
        "Nikaya", "Đại Thừa", "Mật Tông", "Thiền", "Tịnh Độ"
    ]
    subcategory: str
    source: str
    url: str
    file_path: str
    file_format: Literal["html", "pdf", "epub", "other"]
    copyright_status: Literal["public_domain", "unknown"]
