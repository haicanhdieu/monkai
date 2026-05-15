# Tech Spec: VNThuQuan Chapter-Level Concurrency + Chapter Resume

**Status:** Completed
**Date:** 2026-04-26
**Scope:** `apps/crawler/vnthuquan_crawler.py`

## Review Notes
- Adversarial review completed 2026-04-26
- Findings: 4 total, 4 fixed, 0 skipped
- Resolution approach: auto-fix
- F1 (High): Added `_abort` check in `_fetch_detail` so stall-abort is honoured mid-page
- F2 (High): Removed `else 1` fallback in `num_workers` — `min(concurrency, total_to_fetch)` is sufficient and safe
- F3 (Medium): Unified `page_stats` mutations under a single `page_stats_lock` (was split across `collectors_lock` and `progress_lock`)
- F4 (Low): Time-skipped/abort-skipped books now counted in `page_stats["time_skipped"]` and surfaced in page summary log

---

## Problem 1: Concurrency bottleneck

The current `crawl_all` dispatches **books** concurrently via semaphore, but each book fetches its chapters **sequentially**. With `--concurrency=10`:

- Book A (3 chapters) finishes fast → slot freed
- Book B (4 chapters) finishes fast → slot freed
- Book C (100 chapters) holds 1 slot for 100 sequential requests
- Meanwhile freed slots wait for the next `asyncio.gather` batch (page-scoped)

**Result:** Throughput is bottlenecked by the largest book. The concurrency quota is underutilized most of the time.

## Problem 2: Crashed books re-fetch all chapters

The crawl state tracks books at the **URL level** only (`downloaded` | `error`). If a crawl crashes or is interrupted mid-book (e.g. 50/100 chapters fetched), the book URL is never marked `downloaded`. On resume:

1. `crawl_book` checks `state.is_downloaded(entry.url)` → `False` (book wasn't completed)
2. **All** chapters are re-fetched from scratch, even the ones already saved to disk

With large books (100+ chapters), this wastes significant time and bandwidth on every restart.

**Root cause:** There is no chapter-level state. The only artifact from a partial crawl is a `book.json` file written at the end (`write_book_json`) — but since it's written atomically after ALL chapters, a crash means no `book.json` exists at all for incomplete books.

**Fix:** Write a partial `book.json` progressively during crawl, so on resume we can read existing chapters from disk and only fetch the missing ones.

## Goals

### Goal 1: Chapter-level concurrency

Move concurrency from the **book level** to the **chapter level**. A pool of N concurrent workers pulls chapter-fetch tasks from a shared queue across ALL books on the current listing page, so that:

1. Every completed chapter immediately frees capacity for the next chapter from **any** book
2. The concurrency limit applies to chapter requests, not book-scoped locks
3. Small books complete quickly without waiting for large books
4. Assembly + write still happens per-book once all its chapters are fetched

#### Example

Books: A(3ch), B(4ch), C(100ch). Concurrency=10.

**Before (current):** 3 book slots occupied. A uses 1 slot sequentially for 3 requests. C blocks 1 slot for 100 requests. Max 3 requests in flight at any time.

**After (proposed):** 10 chapter slots. First tick: 3 from A + 4 from B + 3 from C = 10 in flight. As A and B chapters return, C chapters fill the freed slots. Always 10 in flight until <10 chapters remain.

### Goal 2: Chapter-level resume on crash recovery

On resume, detect partially-crawled books and only fetch missing chapters:

1. When building the `BookCollector`, check disk for an existing `book.json`
2. For each chapter in `detail.chapter_list`, check if the corresponding chapter in the existing `book.json` has non-empty `html_content`
3. Pre-populate `BookCollector` with existing chapter data — only enqueue chapters that are missing or empty
4. After all missing chapters are fetched, merge with existing data and write the complete `book.json`

#### Example

Book C has 100 chapters. Previous run crashed after fetching 60. On resume:
- Read existing `book.json` → 60 chapters have content
- Only enqueue 40 missing chapters
- Workers fetch 40 chapters (not 100)
- Assembler merges all 100 and writes final `book.json`

---

## Design

### 1. Chapter Work Queue

Replace the per-book sequential chapter loop with a **shared chapter queue** pattern:

```
┌─────────────────────────────────────────────────┐
│ For each listing page:                          │
│  1. Fetch all book details (concurrently, capped)│
│  2. Flatten all chapters into a work queue       │
│  3. N workers pull from queue, fetch chapters    │
│  4. Results route back to per-book collectors    │
│  5. When a book's chapters are all done → assemble│
└─────────────────────────────────────────────────┘
```

### 2. Data Structures

```python
@dataclass
class ChapterTask:
    """A single chapter fetch to enqueue."""
    collector: BookCollector      # parent book collector (back-reference)
    chapter_index: int            # position in detail.chapter_list
    chuongid: str                 # chapter ID for AJAX call
    chapter_name: str             # chapter name (for logging)

@dataclass
class BookCollector:
    """Accumulates chapter results for one book."""
    entry: BookListingEntry
    detail: BookDetail
    total_chapters: int
    chapters_html: list[str | None]   # pre-sized, indexed by chapter_index
    cover_url: str | None
    completed: asyncio.Event          # set when all chapters received
    pending_count: int                # chapters still to fetch (excludes pre-loaded from disk)
    received_count: int = 0
    has_error: bool = False
```

**Key change for resume:** `chapters_html` is pre-sized to `total_chapters`. On fresh crawl, all slots are `None`. On resume, slots with existing content from disk are pre-filled with the HTML string — only `None` slots get enqueued as `ChapterTask`s. `pending_count` reflects only the chapters that actually need fetching.

### 3. Modified Flow in `crawl_all`

Per listing page:

**Phase A — Gather book details + build collectors (semaphore-limited):**
- For each pending book entry, fetch `book_detail` concurrently (capped at `concurrency`)
- Skip books already marked `downloaded` in state (existing early-exit)
- For each successful detail: build a `BookCollector`, then run **chapter resume check** (see §3a)

**Phase A.1 — Chapter resume check (per book):**

```python
def _load_existing_chapters(entry, detail, output_dir) -> list[str | None]:
    """Read existing book.json from disk and extract chapter HTML by chapter_id."""
    # Derive expected book.json path from entry metadata
    book_seo = slugify_title(detail.title)
    cat_seo = slugify_title(entry.category_name)
    book_json_path = output_dir / "book-data" / "vnthuquan" / cat_seo / book_seo / "book.json"
    
    if not book_json_path.exists():
        return [None] * len(detail.chapter_list)
    
    existing = json.loads(book_json_path.read_text(encoding="utf-8"))
    existing_chapters = existing.get("chapters", [])
    
    # Build lookup: chapter_id → html_content
    existing_by_id: dict[int, str] = {}
    for ch in existing_chapters:
        ch_id = ch.get("chapter_id", 0)
        pages = ch.get("pages", [])
        html = pages[0].get("html_content", "") if pages else ""
        if html:  # only count non-empty content as "already fetched"
            existing_by_id[ch_id] = html
    
    # Map to detail.chapter_list order
    result: list[str | None] = []
    for chuongid, _ in detail.chapter_list:
        cid = int(chuongid) if chuongid else 0
        result.append(existing_by_id.get(cid))
    
    return result
```

- Pre-populate `BookCollector.chapters_html` with loaded data
- Set `pending_count` = number of `None` slots
- If `pending_count == 0` → book is already complete, mark downloaded immediately, skip enqueueing
- Log: `[vnthuquan] Book "{title}": {loaded}/{total} chapters from disk, {pending} to fetch`

**Phase B — Enqueue only missing chapters:**
- Iterate all `BookCollector` instances
- For each chapter where `chapters_html[i] is None`, enqueue a `ChapterTask`
- Use `asyncio.Queue` for backpressure

**Phase C — Worker pool fetches chapters:**
- Spawn `concurrency` worker coroutines
- Each worker loops: pull `ChapterTask` from queue → `fetch_chapter()` → store result in the correct `BookCollector.chapters_html[index]` → increment `received_count` → if `received_count == pending_count`, set `completed` event
- Workers exit when queue is exhausted (sentinel or `task_done`)

**Phase D — Assemble completed books:**
- A separate assembler coroutine `await`s each `BookCollector.completed` event
- On completion: `assemble_book_data` → `write_book_json` → `state.mark_downloaded` → `state.save()`
- On error (any chapter failed): `state.mark_error` → `state.save()`

**Phase D.1 — Progressive save (crash resilience):**
- After each chapter is fetched and stored in `BookCollector`, write a partial `book.json` to disk
- This ensures that even if the process crashes mid-book, the next resume picks up where it left off
- Use the same `write_book_json` path but with chapters that have content so far (empty string for unfetched chapters)
- **Throttle:** Only write partial save every N chapters (e.g. every 5) to avoid excessive disk I/O on large books. Always write on the last chapter.

### 4. Rate Limiting

No change needed. `_rate_limited_request` already sleeps `rate_limit_seconds` before each request. With N concurrent workers, the effective throughput is `N / rate_limit_seconds` requests/sec, which is correct — the rate limit is per-request, not global. If global rate limiting is needed later, it can be added via an `asyncio.Lock` or token bucket, but that's out of scope.

### 5. Book Detail Fetching Concurrency

Book detail fetches also hit the server. Two options:

**Option A (recommended):** Share the same concurrency pool — enqueue detail fetches AND chapter fetches into the same queue. Detail results spawn chapter tasks back into the queue.

**Option B:** Two-phase — detail fetches use a separate semaphore, then chapter fetches use the main pool. Simpler but slightly less efficient (detail phase can't overlap with chapter phase).

**Decision:** Go with **Option B** for simplicity. The detail-fetch phase is small (typically 20 books per page) and fast. Overlapping it with chapters adds complexity for minimal gain.

### 6. Error Handling

- If a chapter fetch fails after retries → store empty string `""` in collector (same as current behavior), count as received to unblock completion. Do NOT mark `has_error` — empty chapters are tolerable.
- If detail fetch fails → mark error in state, skip book entirely (same as current)
- **No change from current tolerance:** empty chapter content (`html=""`) is accepted. The book still gets written and marked downloaded. This is important for resume — a book with some empty chapters is still "done" and won't be re-crawled.

### 7. State & Cover URL

- Cover URL logic unchanged: prefer `entry.cover_image_url`, fall back to first chapter's `cover_image_url`
- The first chapter's result must be inspected for cover URL. Workers store the result; assembler reads `chapters_html[0]`'s parse result.
- **Refinement:** Store `ChapterParseResult` (not just html) in the collector so the assembler can access `cover_image_url` from chapter 0.

### 8. Progress Logging

- Current: per-book progress within a page
- New: per-chapter progress across all books on the page
  - `[vnthuquan] Page 3 chapters: 45/207 fetched (books: 2/20 complete, 0 err)`
- Keep `_PROGRESS_LOG_INTERVAL` but apply to chapters, not books

### 9. Stall Detection

- `_monitor_health` currently tracks books completed. Change to track chapters completed for more granular stall detection.
- Or keep book-level — a stall means no books finishing, which is the meaningful signal. **Keep as-is.**

---

## Files Changed

| File | Change |
|------|--------|
| `apps/crawler/vnthuquan_crawler.py` | Refactor `crawl_all` and `crawl_book` to chapter-level concurrency |

No new files needed. The `ChapterTask` and `BookCollector` dataclasses go in the same module.

## Acceptance Criteria

### Concurrency
1. **AC1:** With `--concurrency=10` and books of varying chapter counts, there are always up to 10 chapter requests in flight (verified via logging)
2. **AC2:** A completed chapter immediately frees a slot for the next chapter from any book (no per-book blocking)
3. **AC3:** Book assembly + JSON write only happens after ALL chapters for that book are fetched
4. **AC4:** State is updated per-book (mark_downloaded/mark_error) as before

### Chapter Resume
5. **AC5:** On resume, if a `book.json` exists on disk with N of M chapters populated (non-empty html_content), only M-N chapters are fetched from the server
6. **AC6:** Chapters already on disk are NOT re-fetched — verified by checking that `fetch_chapter` is not called for chapters with existing content
7. **AC7:** Progressive save writes partial `book.json` during crawl (every 5 chapters + on last chapter) so crashes mid-book preserve progress
8. **AC8:** A book with 0 missing chapters on resume is immediately marked `downloaded` without any network requests

### Unchanged Behavior
9. **AC9:** `--dry-run` behavior unchanged
10. **AC10:** Page-level crash recovery (`_load_page_progress` / `_save_page_progress`) unchanged
11. **AC11:** Existing tests pass (update test mocks as needed for new internal structure)
12. **AC12:** Rate limiting per-request unchanged — `_rate_limited_request` still called for every chapter fetch

## Out of Scope

- Global rate limiter (token bucket) — current per-request sleep is sufficient
- Cross-page chapter queuing (currently processes one listing page at a time, then moves to next)
- Retry at book level (re-enqueue all chapters if some failed)
- Chapter-level state in `CrawlState` — resume is file-based (read `book.json`), not state-based

## Migration

Drop-in replacement. CLI flags unchanged. State file format unchanged. No breaking changes to external behavior — only internal concurrency model and resume strategy change.
