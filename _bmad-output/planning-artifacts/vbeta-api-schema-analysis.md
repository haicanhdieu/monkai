# vbeta API Schema Analysis & book-data JSON Format Definition

**Analyzed:** 2026-03-01  
**Source:** api.phapbao.org (live)

---

## Discovered API Endpoints

The following endpoints are confirmed live and working:

| Endpoint | Method | Parameters | Purpose |
|---|---|---|---|
| `/api/categories/get-selectlist-categories?hasAllOption=false` | GET | none | Get all top-level categories |
| `/api/search/get-books-selectlist-by-categoryId/{catId}` | GET | `catId` = category value | Get all books in a category |
| `/api/search/get-tableofcontents-by-bookId` | POST | `{ bookId: int }` | Get book metadata + all chapter TOC items |
| `/api/search/get-pages-by-tableofcontentid/{chapterId}` | GET | `chapterId` = TOC item id | Get all pages (htmlContent) for a chapter |

**Traversal order:** Categories → Books (per category) → Table of Contents (per book) → Pages (per chapter/TOC item)

---

## Raw API Response Shapes

### Level 1: Categories

**Endpoint:** `GET /api/categories/get-selectlist-categories?hasAllOption=false`

```json
{
  "result": [
    {
      "extraData": 1,
      "value": 1,
      "label": "Kinh",
      "seoName": "kinh"
    },
    {
      "extraData": 1,
      "value": 2,
      "label": "Luật",
      "seoName": "luat"
    },
    {
      "extraData": 1,
      "value": 3,
      "label": "Luận",
      "seoName": "luan"
    },
    {
      "extraData": 1,
      "value": 4,
      "label": "Sách",
      "seoName": "sach"
    },
    {
      "extraData": 1,
      "value": 8,
      "label": "Linh Sơn Đại Tạng",
      "seoName": "linh-son-dai-tang"
    },
    {
      "extraData": 1,
      "value": 7,
      "label": "Tạp Chí",
      "seoName": "tap-chi"
    }
  ],
  "success": true,
  "errors": []
}
```

**Key fields:** `value` = category ID, `label` = display name, `seoName` = URL slug.

---

### Level 2: Books per Category

**Endpoint:** `GET /api/search/get-books-selectlist-by-categoryId/1`

```json
{
  "result": [
    { "value": 1, "label": "Kinh Trường Bộ 1", "seoName": null },
    { "value": 319, "label": "Kinh Trường Bộ 2", "seoName": null }
  ],
  "success": true,
  "errors": []
}
```

**Note:** `seoName` is null at this level. Must use full book detail endpoint for slug and full metadata.

---

### Level 3a: Book Detail + Table of Contents

**Endpoint:** `POST /api/search/get-tableofcontents-by-bookId` body: `{"bookId": 1}`

```json
{
  "result": {
    "name": "Kinh Trường Bộ 1",
    "videoUrl": null,
    "videoContent": null,
    "coverImageUrl": "https://api.phapbao.org/uploads/kinhtruongbo_tap1.jpg",
    "isBookmarked": false,
    "seoName": "kinh-truong-bo-1",
    "tableOfContents": {
      "totalItems": 19,
      "items": [
        {
          "sourceId": "00000000-0000-0000-0000-000000000000",
          "id": 12439,
          "name": "1. Kinh Phạm Võng",
          "viewCount": 0,
          "minPageNumber": 11,
          "maxPageNumber": 92,
          "seoName": "1-kinh-pham-vong",
          "book": null,
          "pages": null,
          "highlightPages": [],
          "queryResultIds": null
        }
      ]
    },
    "id": 1,
    "categoryId": 1,
    "categoryName": "Kinh",
    "author": "Hòa thượng Thích Minh Châu dịch",
    "authorId": 1,
    "publisher": "Viện Nghiên Cứu Phật Học Việt Nam, TP. Hồ Chí Minh",
    "publicationYear": 1991
  },
  "success": true,
  "errors": []
}
```

---

### Level 3b: Chapter Pages

**Endpoint:** `GET /api/search/get-pages-by-tableofcontentid/12439`

```json
{
  "result": {
    "sourceId": "00000000-0000-0000-0000-000000000000",
    "id": 12439,
    "name": "1. Kinh Phạm Võng",
    "viewCount": 2889,
    "minPageNumber": 0,
    "maxPageNumber": 0,
    "seoName": "1-kinh-pham-vong",
    "book": {
      "name": "Kinh Trường Bộ 1",
      "videoUrl": null,
      "videoContent": null,
      "coverImageUrl": "https://api.phapbao.org/uploads/kinhtruongbo_tap1.jpg",
      "isBookmarked": false,
      "seoName": "kinh-truong-bo-1",
      "tableOfContents": null,
      "id": 1,
      "categoryId": 1,
      "categoryName": "Kinh",
      "isCategoryVideo": false,
      "author": "Hòa thượng Thích Minh Châu dịch",
      "authorId": 1,
      "seoAuthorName": "hoa-thuong-thich-minh-chau-dich",
      "seoCategoryName": "kinh",
      "publisher": "Viện Nghiên Cứu Phật Học Việt Nam, TP. Hồ Chí Minh",
      "publicationYear": 1991,
      "publicationYearString": "1991"
    },
    "pages": [
      {
        "sortNumber": 11,
        "htmlContent": "<div class=\"page-item\">...",
        "pageNumber": 11
      }
    ],
    "totalItems": 82
  },
  "success": true,
  "errors": []
}
```

---

## Data Hierarchy

```
Category (6 categories)
  └── Book (multiple per category — e.g., 80+ books in "Kinh" alone)
        └── Chapter / TOC Item  (multiple per book via POST tableofcontents-by-bookId)
              └── Pages  (multiple per chapter, each has htmlContent)
```

---

## book-data JSON Schema (Proposed)

The `book-data` files are the **canonical output format** saved under `data/book-data/vbeta/` after the crawler fetches and processes the API data. Each file represents **one chapter** (one TOC item).

**File naming convention:** `data/book-data/vbeta/{category_seo_name}/{book_seo_name}/{chapter_seo_name}.json`

Example: `data/book-data/vbeta/kinh/kinh-truong-bo-1/1-kinh-pham-vong.json`

### Single Chapter File Schema

```json
{
  "_meta": {
    "source": "vbeta",
    "schema_version": "1.0",
    "fetched_at": "2026-03-01T15:04:05Z",
    "api_chapter_url": "https://api.phapbao.org/api/search/get-pages-by-tableofcontentid/12439"
  },
  "id": "vbeta__1-kinh-pham-vong",
  "chapter_id": 12439,
  "chapter_name": "1. Kinh Phạm Võng",
  "chapter_seo_name": "1-kinh-pham-vong",
  "chapter_view_count": 2889,
  "page_count": 82,
  "book": {
    "id": 1,
    "name": "Kinh Trường Bộ 1",
    "seo_name": "kinh-truong-bo-1",
    "cover_image_url": "https://api.phapbao.org/uploads/kinhtruongbo_tap1.jpg",
    "author": "Hòa thượng Thích Minh Châu dịch",
    "author_id": 1,
    "publisher": "Viện Nghiên Cứu Phật Học Việt Nam, TP. Hồ Chí Minh",
    "publication_year": 1991,
    "category_id": 1,
    "category_name": "Kinh",
    "category_seo_name": "kinh"
  },
  "pages": [
    {
      "page_number": 11,
      "sort_number": 11,
      "html_content": "<div class=\"page-item\">...</div>"
    }
  ]
}
```

---

### Pydantic Model Definitions (for `models.py`)

```python
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


# ─── Raw API Layer (ingestion / validation only) ───────────────────────

class ApiCategory(BaseModel):
    """Maps from GET /api/categories/get-selectlist-categories"""
    value: int                     # category ID
    label: str                     # e.g. "Kinh"
    seo_name: Optional[str] = Field(None, alias="seoName")

    model_config = {"populate_by_name": True}


class ApiBookSelectItem(BaseModel):
    """Maps from GET /api/search/get-books-selectlist-by-categoryId/{catId}"""
    value: int                     # book ID
    label: str                     # e.g. "Kinh Trường Bộ 1"
    seo_name: Optional[str] = Field(None, alias="seoName")

    model_config = {"populate_by_name": True}


class ApiTocItem(BaseModel):
    """Maps from POST /api/search/get-tableofcontents-by-bookId -> result.tableOfContents.items[]"""
    id: int                        # chapter / TOC ID — used to fetch pages
    name: str
    seo_name: str = Field(..., alias="seoName")
    view_count: int = Field(0, alias="viewCount")
    min_page_number: int = Field(0, alias="minPageNumber")
    max_page_number: int = Field(0, alias="maxPageNumber")

    model_config = {"populate_by_name": True}


class ApiBookDetail(BaseModel):
    """Maps from POST /api/search/get-tableofcontents-by-bookId -> result"""
    id: int
    name: str
    seo_name: str = Field(..., alias="seoName")
    cover_image_url: Optional[str] = Field(None, alias="coverImageUrl")
    category_id: int = Field(..., alias="categoryId")
    category_name: str = Field(..., alias="categoryName")
    author: Optional[str] = None
    author_id: Optional[int] = Field(None, alias="authorId")
    publisher: Optional[str] = None
    publication_year: Optional[int] = Field(None, alias="publicationYear")

    model_config = {"populate_by_name": True}


class ApiPage(BaseModel):
    """Maps from GET /api/search/get-pages-by-tableofcontentid/{id} -> result.pages[]"""
    page_number: int = Field(..., alias="pageNumber")
    sort_number: int = Field(..., alias="sortNumber")
    html_content: str = Field(..., alias="htmlContent")

    model_config = {"populate_by_name": True}


# ─── Domain Layer (book-data output format) ────────────────────────────

class ChapterMeta(BaseModel):
    """Metadata block stored in _meta field"""
    source: str = "vbeta"
    schema_version: str = "1.0"
    fetched_at: datetime
    api_chapter_url: str


class BookInfo(BaseModel):
    """Embeds book context inside each chapter file"""
    id: int
    name: str
    seo_name: str
    cover_image_url: Optional[str] = None
    author: Optional[str] = None
    author_id: Optional[int] = None
    publisher: Optional[str] = None
    publication_year: Optional[int] = None
    category_id: int
    category_name: str
    category_seo_name: str


class PageEntry(BaseModel):
    """Stored page within a chapter"""
    page_number: int
    sort_number: int
    html_content: str


class ChapterBookData(BaseModel):
    """
    The canonical book-data format for a single chapter.
    Saved to: data/book-data/vbeta/{category_seo}/{book_seo}/{chapter_seo}.json
    """
    meta: ChapterMeta = Field(..., alias="_meta")
    id: str                        # e.g. "vbeta__1-kinh-pham-vong"
    chapter_id: int
    chapter_name: str
    chapter_seo_name: str
    chapter_view_count: int = 0
    page_count: int
    book: BookInfo
    pages: list[PageEntry]

    model_config = {"populate_by_name": True}
```

---

## File Storage Layout (Concrete)

```
data/
├── raw/vbeta/
│   ├── categories.json                   # Raw GET categories response
│   ├── books/
│   │   └── by_category_{cat_id}.json     # Raw book list per category
│   ├── toc/
│   │   └── book_{book_id}.json           # Raw TOC per book (POST response)
│   └── chapters/
│       └── {chapter_id}.json             # Raw chapter pages response
│
└── book-data/vbeta/
    └── {category_seo_name}/
        └── {book_seo_name}/
            └── {chapter_seo_name}.json   # Canonical ChapterBookData schema
```

---

## Crawler Traversal Flow

```
1. GET /api/categories → save to data/raw/vbeta/categories.json
   │
   └─ for each category:
      2. GET /api/search/get-books-selectlist-by-categoryId/{cat_id}
         │  → save to data/raw/vbeta/books/by_category_{cat_id}.json
         │
         └─ for each book:
            3. POST /api/search/get-tableofcontents-by-bookId {bookId}
               │  → save to data/raw/vbeta/toc/book_{book_id}.json
               │  → extract: book metadata + list of TOC items (chapters)
               │
               └─ for each TOC item (chapter):
                  4. GET /api/search/get-pages-by-tableofcontentid/{chapter_id}
                     │  → save raw to data/raw/vbeta/chapters/{chapter_id}.json
                     │  → transform to ChapterBookData
                     └─ save to data/book-data/vbeta/{cat_seo}/{book_seo}/{ch_seo}.json
```

---

## Coverage vs. PRD Requirements

| Requirement | Field | Source API Level | Status |
|---|---|---|---|
| FR-V2: Fetch all categories | `book.category_name`, `book.category_id` | Level 1 | ✅ Covered |
| FR-V2: Fetch all books | `book.name`, `book.id` | Level 2 | ✅ Covered |
| FR-V2: Fetch all chapters | `chapter_name`, `chapter_id` | Level 3a (TOC) | ✅ Covered |
| FR-V2: Fetch page content | `pages[].html_content` | Level 3b (pages) | ✅ Covered |
| FR-V3: Pydantic models | All `ApiXxx` + `ChapterBookData` | models.py | ✅ Defined |
| FR-V4: Save raw JSON | `data/raw/vbeta/` tree | Storage | ✅ Defined |
| FR-V5: Save book-data | `data/book-data/vbeta/` | Storage | ✅ Defined |
| Success: title | `chapter_name` | ✅ | — |
| Success: category | `book.category_name` | ✅ | — |
| Success: book_title | `book.name` | ✅ | — |
| Success: author | `book.author` | ✅ | — |
| Success: publisher | `book.publisher` | ✅ | — |
| Success: publication_year | `book.publication_year` | ✅ | — |
| Success: cover image | `book.cover_image_url` | ✅ | — |
