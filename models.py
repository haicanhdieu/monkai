# models.py
from __future__ import annotations
from datetime import datetime
from typing import Literal
from pydantic import BaseModel, ConfigDict, field_validator, Field


class SourceConfig(BaseModel):
    """Configuration for a single crawl source. Loaded from config.yaml."""
    name: str
    source_type: Literal["html", "api"] = "html"
    enabled: bool = True
    seed_url: str | None = None
    api_base_url: str | None = None
    api_endpoints: dict[str, str] | None = None
    rate_limit_seconds: float = 1.5
    output_folder: str
    css_selectors: dict[str, str] = {}
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


class BookIndexRecord(BaseModel):
    """Book-level index record for data/books/index.json.

    One entry per book, aggregated from book manifests produced by book_builder.py.
    author_translator is null when absent — never omitted.
    """
    id: str                  # book_slug
    title: str               # book_title
    category: Literal[
        "Nikaya", "Đại Thừa", "Mật Tông", "Thiền", "Tịnh Độ"
    ]
    subcategory: str
    source: str
    author_translator: str | None
    total_chapters: int
    manifest_path: str       # relative path e.g. "data/books/thuvienkinhphat/slug.json"

# ─── Raw API Ingestion Models ───────────────────────────────────────────

class ApiCategory(BaseModel):
    """GET /api/categories/get-selectlist-categories"""
    value: int                              # category ID
    label: str                              # e.g. "Kinh"
    seo_name: str | None = Field(None, alias="seoName")
    model_config = ConfigDict(populate_by_name=True)


class ApiBookSelectItem(BaseModel):
    """GET /api/search/get-books-selectlist-by-categoryId/{catId}"""
    value: int                              # book ID
    label: str
    seo_name: str | None = Field(None, alias="seoName")
    model_config = ConfigDict(populate_by_name=True)


class ApiTocItem(BaseModel):
    """POST get-tableofcontents-by-bookId -> result.tableOfContents.items[]"""
    id: int                                 # chapter / TOC ID → used to fetch pages
    name: str
    seo_name: str = Field(..., alias="seoName")
    view_count: int = Field(0, alias="viewCount")
    min_page_number: int = Field(0, alias="minPageNumber")
    max_page_number: int = Field(0, alias="maxPageNumber")
    model_config = ConfigDict(populate_by_name=True)


class ApiBookDetail(BaseModel):
    """POST get-tableofcontents-by-bookId -> result"""
    id: int
    name: str
    seo_name: str = Field(..., alias="seoName")
    cover_image_url: str | None = Field(None, alias="coverImageUrl")
    category_id: int = Field(..., alias="categoryId")
    category_name: str = Field(..., alias="categoryName")
    author: str | None = None
    author_id: int | None = Field(None, alias="authorId")
    publisher: str | None = None
    publication_year: int | None = Field(None, alias="publicationYear")
    model_config = ConfigDict(populate_by_name=True)


class ApiPage(BaseModel):
    """GET get-pages-by-tableofcontentid/{id} -> result.pages[]"""
    page_number: int | None = Field(None, alias="pageNumber")
    sort_number: int = Field(..., alias="sortNumber")
    html_content: str = Field(..., alias="htmlContent")
    model_config = ConfigDict(populate_by_name=True)


# ─── Domain Layer (book-data output format) ─────────────────────────────

class ChapterMeta(BaseModel):
    source: str = "vbeta"
    schema_version: str = "1.0"
    fetched_at: datetime
    api_chapter_url: str


class BookInfo(BaseModel):
    id: int
    name: str
    seo_name: str
    cover_image_url: str | None = None
    author: str | None = None
    author_id: int | None = None
    publisher: str | None = None
    publication_year: int | None = None
    category_id: int
    category_name: str
    category_seo_name: str


class PageEntry(BaseModel):
    page_number: int | None = None
    sort_number: int
    html_content: str                        # may have local img paths post-build
    original_html_content: str | None = None # original HTML with remote URLs (set during build)


class ChapterBookData(BaseModel):
    """
    DEPRECATED: Canonical output format v1 — one file per chapter.
    Path: data/book-data/vbeta/{cat_seo}/{book_seo}/{chapter_seo}.json
    Do NOT remove — existing crawled data may still reference this schema.
    Use BookData (schema v2.0) for new output.
    """
    meta: ChapterMeta = Field(..., alias="_meta")
    id: str                                 # e.g. "vbeta__1-kinh-pham-vong"
    chapter_id: int
    chapter_name: str
    chapter_seo_name: str
    chapter_view_count: int = 0
    page_count: int
    book: BookInfo
    pages: list[PageEntry]
    model_config = ConfigDict(populate_by_name=True)


# ─── New Book-level Domain Layer (schema v2.0) ──────────────────────────

class BookMeta(BaseModel):
    source: str = "vbeta"
    schema_version: str = "2.0"
    built_at: datetime


class ChapterEntry(BaseModel):
    """A chapter with its pages, embedded inside BookData."""
    chapter_id: int
    chapter_name: str
    chapter_seo_name: str
    chapter_view_count: int = 0
    page_count: int
    pages: list[PageEntry]


class BookData(BaseModel):
    """
    Canonical output format v2: one file per book.
    Path: data/book-data/vbeta/{cat_seo}/{book_seo}/book.json
    """
    meta: BookMeta = Field(..., alias="_meta")
    id: str                                  # e.g. "vbeta__bo-trung-quan"
    book_id: int
    book_name: str
    book_seo_name: str
    cover_image_url: str | None = None
    cover_image_local_path: str | None = None  # relative path to local copy, e.g. "vbeta/kinh/slug/images/cover.jpg"
    author: str | None = None
    author_id: int | None = None
    publisher: str | None = None
    publication_year: int | None = None
    category_id: int
    category_name: str
    category_seo_name: str
    total_chapters: int
    chapters: list[ChapterEntry]
    model_config = ConfigDict(populate_by_name=True)


# ─── Index Layer (data/book-data/index.json) ─────────────────────────────

import uuid as _uuid  # noqa: E402 — local import to avoid polluting top-level namespace


class BookArtifact(BaseModel):
    """One retrievable format/source of a book."""
    source: str                    # e.g. "vbeta"
    format: str                    # "json", "epub", "mobi", "image" — no Literal constraint, extensible
    path: str                      # relative to data/book-data/, e.g. "vbeta/kinh/bo-trung-quan/book.json"
    built_at: datetime


class BookIndexEntry(BaseModel):
    """Lightweight book record in the central index. No chapter/page content."""
    id: str                        # UUID v4 — our system ID, stable across rebuilds
    source_book_id: str            # Source system's native book ID as string, e.g. "512" from vbeta
    book_name: str
    book_seo_name: str
    cover_image_url: str | None = None
    author: str | None = None
    publisher: str | None = None
    publication_year: int | None = None
    category_id: int
    category_name: str
    category_seo_name: str
    total_chapters: int
    artifacts: list[BookArtifact]


class BookIndexMeta(BaseModel):
    schema_version: str = "1.0"
    built_at: datetime
    total_books: int


class BookIndex(BaseModel):
    """Root model for data/book-data/index.json"""
    meta: BookIndexMeta = Field(..., alias="_meta")
    books: list[BookIndexEntry]
    model_config = ConfigDict(populate_by_name=True)

