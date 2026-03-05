# utils/api_adapter.py
import asyncio
import datetime
import hashlib
import logging
import random
import re
import shutil
from pathlib import Path
from urllib.parse import urlparse
import json

import aiohttp

from models import (
    SourceConfig,
    ApiCategory,
    ApiBookSelectItem,
    ApiTocItem,
    ApiBookDetail,
    ApiPage,
    PageEntry,
    BookMeta,
    ChapterEntry,
    BookData,
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

    def _raw_file_exists(self, path_parts: list[str]) -> bool:
        """Check if a raw file exists on disk."""
        raw_dir = self.output_dir / "raw" / self.config.output_folder
        return raw_dir.joinpath(*path_parts).exists()

    def _book_data_exists(self, cat_seo: str, book_seo: str) -> bool:
        """Check if a processed book folder already exists."""
        path = self.output_dir / "book-data" / self.config.output_folder / cat_seo / book_seo
        return path.is_dir()

    # ── Image helpers ──────────────────────────────────────────────────────

    @staticmethod
    def _extract_image_urls(pages_data_list: list[dict]) -> list[str]:
        """Extract unique <img src=...> URLs from a list of raw page dicts."""
        seen: set[str] = set()
        result: list[str] = []
        for page in pages_data_list:
            html = page.get("htmlContent", "")
            for url in re.findall(r'<img[^>]+src=["\']([^"\']+)["\']', html):
                if url not in seen:
                    seen.add(url)
                    result.append(url)
        return result

    @staticmethod
    def _derive_image_filename(url: str) -> str:
        """Derive a safe local filename from an image URL."""
        path = urlparse(url).path
        name = path.rsplit("/", 1)[-1] if "/" in path else path
        if not name or len(name) > 100:
            ext = path.rsplit(".", 1)[-1][:4] if "." in path else "img"
            name = f"img_{hashlib.md5(url.encode()).hexdigest()[:8]}.{ext}"
        return name

    def _save_raw_image(self, path_parts: list[str], data: bytes) -> Path:
        """Save raw image bytes to data/raw/vbeta/images/..."""
        raw_dir = self.output_dir / "raw" / self.config.output_folder
        file_path = raw_dir.joinpath(*path_parts)
        file_path.parent.mkdir(parents=True, exist_ok=True)
        file_path.write_bytes(data)
        return file_path

    def _raw_images_exist(self, book_id: int) -> bool:
        """Check if raw image folder for this book is non-empty."""
        img_dir = self.output_dir / "raw" / self.config.output_folder / "images" / str(book_id)
        return img_dir.is_dir() and any(img_dir.iterdir())

    async def _download_book_images(
        self,
        book_id: int,
        cover_url: str | None,
        pages_data_list: list[dict],
    ) -> None:
        """
        Download cover + content images for a book to raw/images/{book_id}/.
        Skips if raw/images/{book_id}/ already exists and is non-empty (idempotent).
        """
        if self._raw_images_exist(book_id):
            logger.info(f"[api_adapter] Skip (disk): raw images for book {book_id}")
            return

        urls: list[str] = []
        if cover_url:
            urls.append(cover_url)
        content_urls = self._extract_image_urls(pages_data_list)
        urls.extend(content_urls)

        for url in urls:
            filename = self._derive_image_filename(url)
            try:
                jitter = random.uniform(0.1, 0.3)
                await asyncio.sleep(self.config.rate_limit_seconds + jitter)
                async with self.session.get(url, allow_redirects=True) as resp:
                    if resp.status >= 400:
                        logger.warning(f"[api_adapter] Image download failed {resp.status}: {url}")
                        continue
                    data = await resp.read()
                self._save_raw_image(["images", str(book_id), filename], data)
                logger.info(f"[api_adapter] Downloaded image: images/{book_id}/{filename}")
            except Exception as e:
                logger.error(f"[api_adapter] Error downloading image {url}: {e}")

    def _copy_images_to_book_folder(
        self,
        book_id: int,
        book_folder: Path,
        cover_url: str | None,
    ) -> str | None:
        """
        Copy images from raw/images/{book_id}/ to {book_folder}/images/.
        Returns cover_local_path relative to data/book-data/ root, or None.
        """
        raw_img_dir = self.output_dir / "raw" / self.config.output_folder / "images" / str(book_id)
        if not raw_img_dir.exists():
            return None

        dest_img_dir = book_folder / "images"
        dest_img_dir.mkdir(parents=True, exist_ok=True)

        cover_local: str | None = None
        for src_file in raw_img_dir.iterdir():
            if src_file.is_file():
                shutil.copy2(src_file, dest_img_dir / src_file.name)
                rel_path = str((dest_img_dir / src_file.name).relative_to(
                    self.output_dir / "book-data"
                ))
                if cover_url:
                    cover_filename = self._derive_image_filename(cover_url)
                    if src_file.name == cover_filename:
                        cover_local = rel_path

        return cover_local

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

    async def process_all(self):
        """Main orchestrator: Phase 1 crawl raw data, Phase 2 build book JSONs."""
        logger.info(f"[api_adapter] Phase 1: Crawling raw data for {self.config.name}")
        book_registry = await self._crawl_phase()  # returns list of (book_id, cat_seo, book_seo)

        logger.info(f"[api_adapter] Phase 2: Building book-data for {len(book_registry)} books")
        self._build_phase(book_registry)

    async def _crawl_phase(self) -> list[tuple[int, str, str]]:
        """
        Fetch all levels from API → save raw JSON.
        Skips any level whose raw file already exists on disk.
        Books within a category are processed concurrently (up to CONCURRENCY at a time).
        Returns list of (book_id, cat_seo_name, book_seo_name).
        """
        CONCURRENCY = 5  # max simultaneous in-flight book/chapter coroutines
        semaphore = asyncio.Semaphore(CONCURRENCY)

        # Level 1: Categories
        if self._raw_file_exists(["categories.json"]):
            logger.info("[api_adapter] Skip (disk): categories.json")
            with open(self.output_dir / "raw" / self.config.output_folder / "categories.json") as f:
                raw = json.load(f)
            categories = [ApiCategory(**c) for c in raw.get("result", [])]
        else:
            categories = await self.fetch_categories()

        # Collect results from all concurrent book tasks
        book_registry: list[tuple[int, str, str]] = []

        async def _process_book(cat: ApiCategory, cat_seo: str, book_item: ApiBookSelectItem) -> tuple[int, str, str] | None:
            """Process one book (TOC + all chapters). Runs under semaphore."""
            async with semaphore:
                # Level 3a: TOC
                if self._raw_file_exists(["toc", f"book_{book_item.value}.json"]):
                    with open(self.output_dir / "raw" / self.config.output_folder / "toc" / f"book_{book_item.value}.json") as f:
                        toc_data = json.load(f)
                else:
                    toc_data = await self.fetch_toc_for_book(book_item.value)
                    if not toc_data:
                        return None

                try:
                    result = toc_data.get("result")
                    if not result:
                        return None
                    book_detail = ApiBookDetail(**result)
                    toc_items = [ApiTocItem(**item) for item in result.get("tableOfContents", {}).get("items", [])]
                except Exception as e:
                    logger.error(f"[api_adapter] Failed to parse TOC for book {book_item.value}: {e}")
                    return None

                # Level 3b: Chapter pages
                # Fast path: all chapters already on disk — skip the entire inner loop
                all_chapter_ids = [t.id for t in toc_items]
                missing_chapter_ids = [
                    cid for cid in all_chapter_ids
                    if not self._raw_file_exists(["chapters", f"{cid}.json"])
                ]

                if not missing_chapter_ids:
                    logger.info(
                        f"[api_adapter] Skip (disk): all {len(all_chapter_ids)} chapters for "
                        f"book {book_item.value} ({book_detail.seo_name})"
                    )
                else:
                    for toc_item in toc_items:
                        chapter_id = toc_item.id
                        api_chapter_url = self._get_chapter_url(chapter_id)

                        if self._raw_file_exists(["chapters", f"{chapter_id}.json"]):
                            continue  # already on disk, no log spam

                        if self.state.is_downloaded(api_chapter_url):
                            logger.info(f"[api_adapter] Skip (state): {api_chapter_url}")
                            continue

                        pages_data = await self.fetch_chapter_pages(chapter_id)
                        if not pages_data:
                            self.state.mark_error(api_chapter_url)
                            self.state.save()
                            continue

                        self.state.mark_downloaded(api_chapter_url)
                        self.state.save()
                        logger.info(f"[api_adapter] Crawled: chapters/{chapter_id}.json")

                # Collect all raw pages data and download images
                all_pages_data: list[dict] = []
                for toc_item in toc_items:
                    chapter_path = (
                        self.output_dir / "raw" / self.config.output_folder
                        / "chapters" / f"{toc_item.id}.json"
                    )
                    if chapter_path.exists():
                        with open(chapter_path) as f:
                            ch = json.load(f)
                        all_pages_data.extend(ch.get("result", {}).get("pages", []))

                await self._download_book_images(
                    book_item.value, book_detail.cover_image_url, all_pages_data
                )

                return (book_item.value, cat_seo, book_detail.seo_name)

        for cat in categories:
            cat_seo = cat.seo_name or slugify_title(cat.label)

            # Level 2: Books per category
            if self._raw_file_exists(["books", f"by_category_{cat.value}.json"]):
                logger.info(f"[api_adapter] Skip (disk): books/by_category_{cat.value}.json")
                with open(self.output_dir / "raw" / self.config.output_folder / "books" / f"by_category_{cat.value}.json") as f:
                    raw = json.load(f)
                books = [ApiBookSelectItem(**b) for b in raw.get("result", [])]
            else:
                books = await self.fetch_books_for_category(cat.value)

            # Process all books in this category concurrently
            logger.info(f"[api_adapter] Processing {len(books)} books for category '{cat_seo}' (concurrency={CONCURRENCY})")
            results = await asyncio.gather(
                *[_process_book(cat, cat_seo, book_item) for book_item in books],
                return_exceptions=False,
            )
            book_registry.extend(r for r in results if r is not None)

        return book_registry

    def _build_phase(self, book_registry: list[tuple[int, str, str]]) -> None:
        """
        Read raw data → aggregate → write one BookData JSON per book.
        Skips books whose output file already exists.
        """
        for book_id, cat_seo, book_seo in book_registry:
            if self._book_data_exists(cat_seo, book_seo):
                logger.info(f"[api_adapter] Skip (exists): book-data/{cat_seo}/{book_seo}.json")
                continue

            toc_path = self.output_dir / "raw" / self.config.output_folder / "toc" / f"book_{book_id}.json"
            if not toc_path.exists():
                logger.warning(f"[api_adapter] Missing TOC raw file for book {book_id}, skipping build")
                continue

            try:
                with open(toc_path) as f:
                    toc_data = json.load(f)

                result = toc_data["result"]
                book_detail = ApiBookDetail(**result)
                toc_items = [ApiTocItem(**item) for item in result.get("tableOfContents", {}).get("items", [])]

                chapters: list[ChapterEntry] = []
                for toc_item in toc_items:
                    chapter_path = self.output_dir / "raw" / self.config.output_folder / "chapters" / f"{toc_item.id}.json"
                    if not chapter_path.exists():
                        logger.warning(f"[api_adapter] Missing chapter raw file {toc_item.id}, skipping chapter")
                        continue

                    with open(chapter_path) as f:
                        ch_data = json.load(f)

                    raw_pages = ch_data["result"].get("pages", [])
                    pages = [PageEntry(
                        page_number=p.get("pageNumber"),
                        sort_number=p["sortNumber"],
                        html_content=p["htmlContent"]
                    ) for p in raw_pages]

                    chapters.append(ChapterEntry(
                        chapter_id=toc_item.id,
                        chapter_name=toc_item.name,
                        chapter_seo_name=toc_item.seo_name,
                        chapter_view_count=toc_item.view_count,
                        page_count=len(pages),
                        pages=pages
                    ))

                book_data = BookData(
                    _meta=BookMeta(built_at=datetime.datetime.now(datetime.timezone.utc)),
                    id=f"{self.config.name}__{book_seo}",
                    book_id=book_detail.id,
                    book_name=book_detail.name,
                    book_seo_name=book_detail.seo_name,
                    cover_image_url=book_detail.cover_image_url,
                    author=book_detail.author,
                    author_id=book_detail.author_id,
                    publisher=book_detail.publisher,
                    publication_year=book_detail.publication_year,
                    category_id=book_detail.category_id,
                    category_name=book_detail.category_name,
                    category_seo_name=cat_seo,
                    total_chapters=len(chapters),
                    chapters=chapters
                )

                # Copy images to book folder and set local cover path
                book_folder = (
                    self.output_dir / "book-data" / self.config.output_folder
                    / cat_seo / book_seo
                )
                cover_local = self._copy_images_to_book_folder(
                    book_id, book_folder, book_detail.cover_image_url
                )
                book_data.cover_image_local_path = cover_local

                self._save_book_data(book_data, cat_seo)
                logger.info(f"[api_adapter] Built: book-data/{cat_seo}/{book_seo}/book.json ({len(chapters)} chapters)")

            except Exception as e:
                logger.error(f"[api_adapter] Error building book {book_id} ({book_seo}): {e}")

    def _save_book_data(self, book_data: BookData, cat_seo: str) -> None:
        """Save canonical BookData JSON: {book_seo}/book.json inside book folder."""
        book_folder = (
            self.output_dir / "book-data" / self.config.output_folder
            / cat_seo / book_data.book_seo_name
        )
        book_folder.mkdir(parents=True, exist_ok=True)
        out_path = book_folder / "book.json"
        with open(out_path, "w", encoding="utf-8") as f:
            f.write(book_data.model_dump_json(by_alias=True, indent=2))
