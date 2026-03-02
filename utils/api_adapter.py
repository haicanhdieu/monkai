# utils/api_adapter.py
import asyncio
import logging
import random
from pathlib import Path
import json

import aiohttp

from models import (
    SourceConfig,
    ApiCategory,
    ApiBookSelectItem,
    ApiTocItem,
    ApiBookDetail,
    ApiPage,
    ChapterBookData,
    ChapterMeta,
    BookInfo,
    PageEntry,
)
from utils.slugify import slugify_title
from utils.state import CrawlState

logger = logging.getLogger("crawler")


class VbetaApiAdapter:
    """Orchestrates fetching and parsing vbeta.vn's API."""

    def __init__(self, source_config: SourceConfig, session: aiohttp.ClientSession, state: CrawlState, output_dir: str):
        self.config = source_config
        self.session = session
        self.state = state
        self.output_dir = Path(output_dir)
        self.base_url = source_config.api_base_url.rstrip("/")
        self.endpoints = source_config.api_endpoints or {}

    async def _fetch_get(self, url: str) -> dict | None:
        """Fetch GET endpoint with rate limiting, jitter, and error handling."""
        # AC 2: Rate limit with random jitter to prevent strict cadence detection
        jitter = random.uniform(0.1, 0.5)
        await asyncio.sleep(self.config.rate_limit_seconds + jitter)

        try:
            async with self.session.get(url) as resp:
                if resp.status >= 400:
                    logger.error(f"[api_adapter] HTTP {resp.status} GET {url}")
                    return None
                return await resp.json()
        except asyncio.TimeoutError:
            logger.error(f"[api_adapter] Timeout GET: {url}")
            return None
        except Exception as e:
            logger.error(f"[api_adapter] Error GET {url}: {e}")
            return None

    async def _fetch_post(self, url: str, json_data: dict) -> dict | None:
        """Fetch POST endpoint with rate limiting, jitter, and error handling."""
        jitter = random.uniform(0.1, 0.5)
        await asyncio.sleep(self.config.rate_limit_seconds + jitter)

        try:
            async with self.session.post(url, json=json_data, headers={"Content-Type": "application/json"}) as resp:
                if resp.status >= 400:
                    logger.error(f"[api_adapter] HTTP {resp.status} POST {url}")
                    return None
                return await resp.json()
        except asyncio.TimeoutError:
            logger.error(f"[api_adapter] Timeout POST: {url}")
            return None
        except Exception as e:
            logger.error(f"[api_adapter] Error POST {url}: {e}")
            return None

    def _save_raw(self, path_parts: list[str], data: dict) -> Path:
        """Save raw unaltered JSON response."""
        raw_dir = self.output_dir / "raw" / self.config.output_folder
        file_path = raw_dir.joinpath(*path_parts)
        file_path.parent.mkdir(parents=True, exist_ok=True)
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        return file_path

    async def fetch_categories(self) -> list[ApiCategory]:
        """Level 1: Fetch all categories."""
        url = f"{self.base_url}{self.endpoints.get('category', '/category')}"
        data = await self._fetch_get(url)
        if not data or not data.get("success"):
            logger.warning(f"[api_adapter] Failed to load categories from {url}")
            return []

        self._save_raw(["categories.json"], data)
        return [ApiCategory(**c) for c in data.get("result", [])]

    async def fetch_books_for_category(self, cat_id: int) -> list[ApiBookSelectItem]:
        """Level 2: Fetch books for a category."""
        # The schema analysis says: /api/search/get-books-selectlist-by-categoryId/{catId}
        # In config yaml this was just configured as '/book'. We assume the url format here
        # or append it. Based on PRD we construct the rest.
        url_stub = self.endpoints.get("book", "/api/search/get-books-selectlist-by-categoryId")
        # Ensure it has trailing slash if not templated
        if "{" not in url_stub and not url_stub.endswith("/"):
             url_stub += "/"
        if "{catId}" in url_stub:
            url = f"{self.base_url}{url_stub.format(catId=cat_id)}"
        else:
             url = f"{self.base_url}{url_stub}{cat_id}"

        data = await self._fetch_get(url)
        if not data or not data.get("success"):
            return []

        self._save_raw(["books", f"by_category_{cat_id}.json"], data)
        return [ApiBookSelectItem(**b) for b in data.get("result", [])]

    async def fetch_toc_for_book(self, book_id: int) -> dict | None:
        """Level 3a: Fetch TOC for book."""
        url_stub = self.endpoints.get("toc", "/search/get-tableofcontents-by-bookId")
        url = f"{self.base_url}{url_stub}"
        data = await self._fetch_post(url, json_data={"id": book_id})
        if not data or "result" not in data:
            return None

        self._save_raw(["toc", f"book_{book_id}.json"], data)
        return data

    def _get_chapter_url(self, chapter_id: int) -> str:
        url_stub = self.endpoints.get("chapter", "/api/search/get-pages-by-tableofcontentid")
        if "{" not in url_stub and not url_stub.endswith("/"):
             url_stub += "/"
        if "{chapterId}" in url_stub:
             return f"{self.base_url}{url_stub.format(chapterId=chapter_id)}"
        else:
             return f"{self.base_url}{url_stub}{chapter_id}"

    async def fetch_chapter_pages(self, chapter_id: int) -> dict | None:
        """Level 3b: Fetch Pages for a chapter."""
        url = self._get_chapter_url(chapter_id)

        data = await self._fetch_get(url)
        if not data or "result" not in data:
            return None

        self._save_raw(["chapters", f"{chapter_id}.json"], data)
        return data

    def _save_canonical(self, chapter_data: ChapterBookData) -> None:
        """Save canonical Domain model output."""
        canonical_dir = self.output_dir / "book-data" / self.config.output_folder
        file_path = canonical_dir / chapter_data.book.category_seo_name / chapter_data.book.seo_name / f"{chapter_data.chapter_seo_name}.json"
        file_path.parent.mkdir(parents=True, exist_ok=True)
        with open(file_path, "w", encoding="utf-8") as f:
             # Use model_dump_json directly for canonical serialization
             f.write(chapter_data.model_dump_json(by_alias=True, indent=2))

    async def process_all(self):
        """Main orchestrator for API traversal."""
        logger.info(f"[api_adapter] Starting traversal for source: {self.config.name}")
        categories = await self.fetch_categories()
        
        for cat in categories:
            books = await self.fetch_books_for_category(cat.value)
            
            for book_item in books:
                toc_data = await self.fetch_toc_for_book(book_item.value)
                if not toc_data:
                    continue
                
                try:
                    if not toc_data.get("result"):
                        logger.warning(f"[api_adapter] Book {book_item.value} has no TOC result (null), skipping.")
                        continue
                        
                    book_detail = ApiBookDetail(**toc_data["result"])
                    toc_items = [ApiTocItem(**item) for item in toc_data["result"].get("tableOfContents", {}).get("items", [])]
                except Exception as e:
                     logger.error(f"[api_adapter] Failed to parse TOC for book {book_item.value}: {e}")
                     continue

                for toc_item in toc_items:
                     chapter_id = toc_item.id
                     # Check idempotency
                     api_chapter_url = self._get_chapter_url(chapter_id)
                     
                     if self.state.is_downloaded(api_chapter_url):
                         logger.info(f"[api_adapter] Skip (state): {api_chapter_url}")
                         continue
                         
                     pages_data = await self.fetch_chapter_pages(chapter_id)
                     if not pages_data:
                         self.state.mark_error(api_chapter_url)
                         self.state.save()
                         continue
                         
                     try:
                         # Ensure pages map correctly
                         raw_pages = pages_data["result"].get("pages", [])
                         api_pages = [ApiPage(**p) for p in raw_pages]
                         
                         domain_pages = [PageEntry(
                             page_number=p.page_number, 
                             sort_number=p.sort_number, 
                             html_content=p.html_content
                         ) for p in api_pages]
                         
                         import datetime
                         now = datetime.datetime.now(datetime.timezone.utc)
                         
                         book_info = BookInfo(
                             id=book_detail.id,
                             name=book_detail.name,
                             seo_name=book_detail.seo_name,
                             cover_image_url=book_detail.cover_image_url,
                             author=book_detail.author,
                             author_id=book_detail.author_id,
                             publisher=book_detail.publisher,
                             publication_year=book_detail.publication_year,
                             category_id=book_detail.category_id,
                             category_name=book_detail.category_name,
                             category_seo_name=cat.seo_name or slugify_title(book_detail.category_name)
                         )
                         
                         chapter_seo = toc_item.seo_name
                         
                         canonical_data = ChapterBookData(
                             _meta=ChapterMeta(fetched_at=now, api_chapter_url=api_chapter_url),
                             id=f"{self.config.name}__{chapter_seo}",
                             chapter_id=chapter_id,
                             chapter_name=toc_item.name,
                             chapter_seo_name=chapter_seo,
                             chapter_view_count=toc_item.view_count,
                             page_count=len(domain_pages),
                             book=book_info,
                             pages=domain_pages
                         )
                         
                         self._save_canonical(canonical_data)
                         self.state.mark_downloaded(api_chapter_url)
                         self.state.save()
                         logger.info(f"[api_adapter] Downloaded: {api_chapter_url}")
                         
                     except Exception as e:
                         logger.error(f"[api_adapter] Error transforming/saving chapter {chapter_id}: {e}")
                         self.state.mark_error(api_chapter_url)
                         self.state.save()
