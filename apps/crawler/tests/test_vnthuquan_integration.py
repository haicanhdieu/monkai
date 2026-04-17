"""
Story 4.2: VNThuQuan End-to-End Integration Tests.

Tests that the crawler output integrates correctly with the indexer,
producing valid index.json entries that the reader UI can discover.
"""
from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from aioresponses import aioresponses as aioresponses_ctx

from indexer import build_book_data_index
from models import BookData, SourceConfig
from utils.state import CrawlState
from vnthuquan_crawler import CHAPTER_AJAX_URL, VnthuquanAdapter, create_session


# ---------------------------------------------------------------------------
# Shared helper: creates a minimal valid vnthuquan book.json
# ---------------------------------------------------------------------------

def make_vnthuquan_book_json(
    book_data_dir: Path,
    cat_seo: str,
    book_seo: str,
    book_id: int,
    num_chapters: int = 2,
) -> Path:
    """Write a minimal valid BookData (schema v2.0, source=vnthuquan) at
    book_data_dir/vnthuquan/{cat_seo}/{book_seo}/book.json.
    Returns the path to the written file.
    """
    book_folder = book_data_dir / "vnthuquan" / cat_seo / book_seo
    book_folder.mkdir(parents=True, exist_ok=True)

    chapters = [
        {
            "chapter_id": i + 1,
            "chapter_name": f"Chuong {i + 1}",
            "chapter_seo_name": f"chuong-{i + 1}",
            "chapter_view_count": 0,
            "page_count": 1,
            "pages": [
                {
                    "sort_number": 1,
                    "page_number": None,
                    "html_content": f"<p>Noi dung chuong {i + 1}</p>",
                    "original_html_content": None,
                }
            ],
        }
        for i in range(num_chapters)
    ]

    book_data = {
        "_meta": {
            "source": "vnthuquan",
            "schema_version": "2.0",
            "built_at": "2026-04-15T00:00:00+00:00",
        },
        "id": f"vnthuquan__{book_seo}",
        "book_id": book_id,
        "book_name": book_seo.replace("-", " ").title(),
        "book_seo_name": book_seo,
        "cover_image_url": None,
        "cover_image_local_path": None,
        "author": "Tac Gia Test",
        "author_id": None,
        "publisher": None,
        "publication_year": None,
        "category_id": 1,
        "category_name": cat_seo.replace("-", " ").title(),
        "category_seo_name": cat_seo,
        "total_chapters": num_chapters,
        "chapters": chapters,
    }

    out_path = book_folder / "book.json"
    out_path.write_text(json.dumps(book_data, ensure_ascii=False, indent=2), encoding="utf-8")
    return out_path


def make_vbeta_book_json(
    book_data_dir: Path,
    cat_seo: str,
    book_seo: str,
    book_id: int,
) -> Path:
    """Write a minimal valid BookData (schema v2.0, source=vbeta) at
    book_data_dir/vbeta/{cat_seo}/{book_seo}/book.json.
    """
    book_folder = book_data_dir / "vbeta" / cat_seo / book_seo
    book_folder.mkdir(parents=True, exist_ok=True)

    book_data = {
        "_meta": {
            "source": "vbeta",
            "schema_version": "2.0",
            "built_at": "2026-03-05T00:00:00+00:00",
        },
        "id": f"vbeta__{book_seo}",
        "book_id": book_id,
        "book_name": book_seo.replace("-", " ").title(),
        "book_seo_name": book_seo,
        "cover_image_url": None,
        "cover_image_local_path": None,
        "author": None,
        "author_id": None,
        "publisher": None,
        "publication_year": None,
        "category_id": 1,
        "category_name": cat_seo.replace("-", " ").title(),
        "category_seo_name": cat_seo,
        "total_chapters": 0,
        "chapters": [],
    }

    out_path = book_folder / "book.json"
    out_path.write_text(json.dumps(book_data, ensure_ascii=False, indent=2), encoding="utf-8")
    return out_path


@pytest.fixture
def mock_logger() -> MagicMock:
    return MagicMock(spec=["info", "warning", "error", "debug"])


# ---------------------------------------------------------------------------
# AC #4 — End-to-end: crawl output then index
# ---------------------------------------------------------------------------

def test_end_to_end_crawl_then_index(tmp_path: Path, mock_logger: MagicMock) -> None:
    """4 vnthuquan + 1 vbeta books → index has 5 total, both sources present."""
    book_data_dir = tmp_path / "book-data"

    # Write 4 vnthuquan book.json files
    for i in range(4):
        make_vnthuquan_book_json(
            book_data_dir, "phat-giao", f"book-{i + 1}", book_id=1000 + i
        )

    # Write 1 vbeta book.json
    make_vbeta_book_json(book_data_dir, "kinh", "bo-trung-quan", book_id=512)

    build_book_data_index(tmp_path, mock_logger)

    index_path = book_data_dir / "index.json"
    assert index_path.exists()
    data = json.loads(index_path.read_text(encoding="utf-8"))

    assert data["_meta"]["total_books"] == 5
    sources = {b["artifacts"][0]["source"] for b in data["books"]}
    assert "vnthuquan" in sources
    assert "vbeta" in sources

    vnthuquan_books = [b for b in data["books"] if b["artifacts"][0]["source"] == "vnthuquan"]
    assert len(vnthuquan_books) == 4

    # Each vnthuquan entry passes BookData schema validation
    for b in vnthuquan_books:
        artifact_path = book_data_dir / b["artifacts"][0]["path"]
        raw = json.loads(artifact_path.read_text(encoding="utf-8"))
        book = BookData(**raw)
        assert book.meta.source == "vnthuquan"
        assert len(book.chapters) >= 1


def test_end_to_end_existing_vbeta_entries_preserved(
    tmp_path: Path, mock_logger: MagicMock
) -> None:
    """Adding vnthuquan books does not corrupt existing vbeta entries or their UUIDs."""
    book_data_dir = tmp_path / "book-data"

    # Step 1: index with only vbeta
    make_vbeta_book_json(book_data_dir, "kinh", "bo-trung-quan", book_id=512)
    build_book_data_index(tmp_path, mock_logger)

    index_path = book_data_dir / "index.json"
    data1 = json.loads(index_path.read_text(encoding="utf-8"))
    vbeta_uuid_original = next(
        b["id"] for b in data1["books"] if b["book_seo_name"] == "bo-trung-quan"
    )

    # Step 2: add vnthuquan books and rebuild
    make_vnthuquan_book_json(book_data_dir, "phat-giao", "bat-nha-kinh", book_id=1001)
    make_vnthuquan_book_json(book_data_dir, "phat-giao", "kim-cuong-kinh", book_id=1002)
    build_book_data_index(tmp_path, mock_logger)

    data2 = json.loads(index_path.read_text(encoding="utf-8"))
    assert data2["_meta"]["total_books"] == 3

    # vbeta UUID preserved
    vbeta_uuid_after = next(
        b["id"] for b in data2["books"] if b["book_seo_name"] == "bo-trung-quan"
    )
    assert vbeta_uuid_after == vbeta_uuid_original, "vbeta UUID must not change after adding vnthuquan"

    # vbeta entry still present with correct name
    vbeta_entry = next(b for b in data2["books"] if b["book_seo_name"] == "bo-trung-quan")
    assert vbeta_entry["artifacts"][0]["source"] == "vbeta"

    # Both vnthuquan entries present
    vnthuquan_books = [b for b in data2["books"] if b["artifacts"][0]["source"] == "vnthuquan"]
    assert len(vnthuquan_books) == 2


def test_vnthuquan_book_json_schema_validates(tmp_path: Path) -> None:
    """BookData written by vnthuquan crawler validates against Pydantic schema."""
    book_data_dir = tmp_path / "book-data"
    out_path = make_vnthuquan_book_json(
        book_data_dir, "phat-giao", "bat-nha-kinh", book_id=9999, num_chapters=3
    )

    data = json.loads(out_path.read_text(encoding="utf-8"))
    book = BookData(**data)

    assert book.meta.source == "vnthuquan"
    assert book.meta.schema_version == "2.0"
    assert book.meta.built_at is not None
    assert len(book.chapters) == 3
    for chapter in book.chapters:
        assert chapter.page_count == 1
        assert len(chapter.pages) == 1
        assert chapter.pages[0].sort_number == 1
    assert book.book_id == 9999
    assert book.publisher is None
    assert book.publication_year is None


# ---------------------------------------------------------------------------
# Story 4.2 AC #5 — Full crawl pipeline (mocked HTTP → book.json files)
# ---------------------------------------------------------------------------

def _listing_text_book_row(tid: int, title: str) -> str:
    return f"""
<div class="col-xs-7">
  <span class='label-title label-time'>9.4.2026</span>
  <span class='label-title label-scan'>Text</span>
  <div class='truyen-title' itemprop='name'>
    <span class='viethoachu'>
      <a href='http://vtq.test/truyen.aspx?tid={tid}'>{title}</a>
    </span>
  </div>
  <span class='author viethoachu' itemprop='author'>
    <a href='http://vtq.test/tacpham.aspx?tacgiaid=1'>Tac Gia</a>
  </span>
  <span class='label-title label-theloai'>
    <a href='http://vtq.test/theloai.aspx?theloaiid=3'>Phật giáo</a>
  </span>
  <span class='totalchuong'>1 Chương</span>
</div>
"""


def _listing_page_html(rows: str) -> str:
    return f"""<!DOCTYPE html>
<html><head><meta charset="UTF-8"/></head><body>
{rows}
<div class="pagination">
  <a href='?tranghientai=1'>1</a>
  <a href='?tranghientai=2'>2</a>
</div>
</body></html>"""


def _book_detail_html(tuaid: int, title: str) -> str:
    return f"""<!DOCTYPE html>
<html><head><meta charset="UTF-8"/></head><body>
<div class="left-sidebar">
  <h3><a href="theloai.aspx?theloaiid=3">Phật giáo</a></h3>
</div>
<h3 class="mucluc">
  <a href="truyen.aspx?tid=x"><b>{title}</b></a>
</h3>
<script type="text/javascript">
  noidung1('tuaid={tuaid}&chuongid=');
</script>
</body></html>"""


@pytest.mark.asyncio
async def test_end_to_end_crawl_two_pages_produces_book_json(tmp_path: Path) -> None:
    """Two listing pages (mocked), four Text books → four book.json files on disk."""
    chapter_body = (
        Path(__file__).parent / "fixtures" / "vnthuquan_chapter_response.txt"
    ).read_bytes()

    url_base = "http://vtq.test/theloai.aspx"
    seed = f"{url_base}?theloaiid=1"
    url_p1 = f"{url_base}?tranghientai=1"
    url_p2 = f"{url_base}?tranghientai=2"

    rows1 = _listing_text_book_row(6001, "Sach Mot") + _listing_text_book_row(6002, "Sach Hai")
    rows2 = _listing_text_book_row(6003, "Sach Ba") + _listing_text_book_row(6004, "Sach Bon")
    html1 = _listing_page_html(rows1)
    html2 = _listing_page_html(rows2)

    cfg = SourceConfig(
        name="vnthuquan",
        source_type="html",
        enabled=True,
        seed_url=seed,
        rate_limit_seconds=1.0,
        output_folder="vnthuquan",
    )
    state = CrawlState(state_file=str(tmp_path / "crawl-state-e2e.json"))
    session = await create_session()
    adapter = VnthuquanAdapter(cfg, session, state, tmp_path)

    try:
        with aioresponses_ctx() as m:
            m.get(url_p1, body=html1.encode())
            m.get(url_p2, body=html2.encode())
            for tid, title in [
                (6001, "Sach Mot"),
                (6002, "Sach Hai"),
                (6003, "Sach Ba"),
                (6004, "Sach Bon"),
            ]:
                m.get(
                    f"http://vtq.test/truyen.aspx?tid={tid}",
                    body=_book_detail_html(tid, title).encode(),
                )
            m.post(CHAPTER_AJAX_URL, body=chapter_body, repeat=True)
            with patch("asyncio.sleep", new_callable=AsyncMock):
                await adapter.crawl_all(
                    start_page=1, end_page=2, concurrency=2, max_hours=0, dry_run=False
                )
    finally:
        await session.close()

    paths = sorted((tmp_path / "book-data" / "vnthuquan").rglob("book.json"))
    assert len(paths) == 4
    book_ids = set()
    for p in paths:
        raw = json.loads(p.read_text(encoding="utf-8"))
        book = BookData(**raw)
        assert book.meta.source == "vnthuquan"
        book_ids.add(book.book_id)
    assert book_ids == {6001, 6002, 6003, 6004}
