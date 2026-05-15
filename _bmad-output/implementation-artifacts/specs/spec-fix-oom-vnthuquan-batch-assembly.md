---
title: 'Fix OOM: batch vnthuquan chapter assembly to bound peak memory'
type: 'bugfix'
created: '2026-05-08'
status: 'done'
context: []
baseline_commit: 'd20e9a1d7b159de05deb5592b94add965b29732b'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** On Raspberry Pi (905 MB RAM), the vnthuquan crawler OOM-crashes after a few hours because `_crawl_page_with_chapter_queue` holds all chapters for every book on a listing page (20–30 books × hundreds of chapters × large HTML) in memory at the same time.

**Approach:** Batch `active_collectors` into groups of `concurrency` size and run phases B (enqueue), C (workers), and D (assemblers) to completion per batch before moving to the next. After each batch's assemblers finish, clear `chapters_result` from each collector to release HTML memory.

## Boundaries & Constraints

**Always:**
- Preserve the `_abort_event` race on both queue drain and assembler gather — abort handling must not be simplified or removed.
- Preserve progressive partial saves (`_write_partial_book_json` every 5 chapters) — these run in the worker and are unaffected by batching.
- Use `concurrency` as batch size — no new config knob.
- Clear `coll.chapters_result` only *after* the batch's assemblers have fully completed (after `asyncio.gather` returns), never before.
- Pre-compute `total_to_fetch` in a single pass before the batch loop so `{done_n}/{total_to_fetch}` progress logs remain accurate across batches.

**Ask First:**
- None anticipated.

**Never:**
- Do NOT change `_write_partial_book_json`, `BookCollector`, `ChapterTask`, or `BookDetail`.
- Do NOT change how abort/resume/state persistence works for individual chapters or books.
- Do NOT change the public signature of `_crawl_page_with_chapter_queue`.
- Do NOT add a new config key.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Normal run, 20 active books, concurrency=5 | 20 books with pending chapters | 4 batches of 5 processed sequentially; peak memory ≈ 5 books at once | Assembler exceptions caught via `return_exceptions=True` |
| Abort fires during Phase C of batch 2 | `_abort_event` set mid-queue-drain | Workers cancelled; function returns; batches 3–4 not started | Partial saves from workers preserve in-flight chapters |
| Abort fires during Phase D (assembler) | `_abort_event` set mid-assembler-gather | Batch assemblers cancelled; function returns | Partial disk writes preserved |
| concurrency=2, 5 active books | 5 books | Batches of sizes [2, 2, 1] | Same abort semantics |
| All collectors already completed (Phase A.1) | `active_collectors` is empty | Batch loop is a no-op; function returns normally | N/A |

</frozen-after-approval>

## Code Map

- `apps/crawler/vnthuquan_crawler.py:192` -- `_write_partial_book_json` — NOT changed; called from worker during Phase C
- `apps/crawler/vnthuquan_crawler.py:228` -- `BookCollector` dataclass — `chapters_result` cleared after each batch's assemblers finish
- `apps/crawler/vnthuquan_crawler.py:795` -- `_crawl_page_with_chapter_queue` — primary refactor site
- `apps/crawler/vnthuquan_crawler.py:907` -- current Phase B single-queue creation — replaced by per-batch queue inside loop
- `apps/crawler/vnthuquan_crawler.py:930` -- `_chapter_worker` closure — add `q: asyncio.Queue[ChapterTask]` parameter; replace `chapter_queue.get()` / `chapter_queue.task_done()` with `q.get()` / `q.task_done()`
- `apps/crawler/vnthuquan_crawler.py:1032` -- current single-shot Phase C/D launch — replaced by batch loop
- `apps/crawler/tests/test_vnthuquan_crawler.py:1692` -- `test_chapter_queue_exits_promptly_on_abort` — verify still passes; add new batch tests nearby

## Tasks & Acceptance

**Execution:**
- [x] `apps/crawler/vnthuquan_crawler.py` -- Add module-level `_chunked` helper using `itertools.islice`; in `_crawl_page_with_chapter_queue`: (1) add a pre-compute pass that counts `total_to_fetch` without creating a queue, (2) change `_chapter_worker` to accept `q: asyncio.Queue[ChapterTask]` and use `q` instead of `chapter_queue`, (3) replace the single Phase B/C/D block (lines ~907–1082) with a `for batch in _chunked(active_collectors, concurrency):` loop — inside each iteration: create `batch_queue`, enqueue only that batch's pending chapters, launch workers with `_chapter_worker(batch_queue)`, race `batch_queue.join()` vs abort, cancel workers, if aborted return, launch batch assemblers, race assembler gather vs abort, if aborted cancel assemblers and return, then `for coll in batch: coll.chapters_result.clear()`
- [x] `apps/crawler/tests/test_vnthuquan_crawler.py` -- Add test(s) near line 1692: (a) after a successful `_crawl_page_with_chapter_queue` call, assert every collector's `chapters_result` is empty; (b) assert books are assembled in batch order (batches of `concurrency`) by checking state call counts or book write order

**Acceptance Criteria:**
- Given 20 active books and concurrency=5, when `_crawl_page_with_chapter_queue` completes, then all books are written to disk and every collector's `chapters_result` is `[]`
- Given abort fires during Phase C of batch 2, when the function returns, then batch 1 books are on disk and no books from batches 3–4 were assembled
- Given concurrency=2 and 5 active books, when the function runs, then exactly 3 batches execute (sizes 2, 2, 1)
- Given the existing `test_chapter_queue_exits_promptly_on_abort` test, when run after the refactor, then it passes unchanged

## Design Notes

**Why batch the full Phase B/C/D pipeline, not just assemblers:**
Assemblers only start after their book's workers have finished writing to `chapters_result`. If Phase C runs for all 20–30 books before any assembler fires, peak memory is already `all_books × chapters × html_size`. Batching Phase B/C/D together caps peak memory to `concurrency × chapters × html_size`.

**`_chunked` helper:**
```python
from itertools import islice

def _chunked(iterable, n):
    it = iter(iterable)
    while chunk := list(islice(it, n)):
        yield chunk
```

**Progress counter across batches:**
`chapters_fetched = {"n": 0}` and `total_to_fetch` (pre-computed) are defined before the batch loop. The worker closure captures both by reference, so `{done_n}/{total_to_fetch}` progress logs remain accurate across batches without changes to the logging code.

## Verification

**Commands:**
- `cd apps/crawler && uv run pytest tests/test_vnthuquan_crawler.py -x -q` -- expected: all tests pass, 0 failures
- `cd apps/crawler && uv run ruff check vnthuquan_crawler.py` -- expected: no errors

**Manual checks:**
- SSH to Pi: `watch -n5 free -h` during a short crawl run (1–2 listing pages); confirm memory stabilizes rather than growing page-over-page

## Spec Change Log

## Suggested Review Order

**Batch loop design**

- Core batch entry point — understand the full loop structure first
  [`vnthuquan_crawler.py:1037`](../../apps/crawler/vnthuquan_crawler.py#L1037)

- Early-abort guard added at top of each iteration to skip wasted enqueue work
  [`vnthuquan_crawler.py:1038`](../../apps/crawler/vnthuquan_crawler.py#L1038)

- Per-batch queue created; only this batch's missing chapters enqueued
  [`vnthuquan_crawler.py:1041`](../../apps/crawler/vnthuquan_crawler.py#L1041)

- Workers launched per-batch via parameterised `_chapter_worker(q)`
  [`vnthuquan_crawler.py:1056`](../../apps/crawler/vnthuquan_crawler.py#L1056)

- Queue-drain vs abort race (same asyncio.wait pattern as original)
  [`vnthuquan_crawler.py:1062`](../../apps/crawler/vnthuquan_crawler.py#L1062)

- Phase D assemblers per-batch; abort race preserved
  [`vnthuquan_crawler.py:1090`](../../apps/crawler/vnthuquan_crawler.py#L1090)

- Memory freed here — only after assemblers have fully completed
  [`vnthuquan_crawler.py:1114`](../../apps/crawler/vnthuquan_crawler.py#L1114)

**Supporting changes**

- `_chunked` helper — yields n-sized slices without a third-party dep
  [`vnthuquan_crawler.py:52`](../../apps/crawler/vnthuquan_crawler.py#L52)

- `total_to_fetch` pre-computed once so progress logs remain accurate across batches
  [`vnthuquan_crawler.py:923`](../../apps/crawler/vnthuquan_crawler.py#L923)

- `_chapter_worker` receives `q` parameter instead of closing over shared queue
  [`vnthuquan_crawler.py:934`](../../apps/crawler/vnthuquan_crawler.py#L934)

**Tests**

- Verifies `chapters_result == []` by capturing BookCollector via module-level patch
  [`test_vnthuquan_crawler.py:1848`](../../apps/crawler/tests/test_vnthuquan_crawler.py#L1848)

- AC2: abort during batch 2 Phase C — batch 1 written, batch 2+ not assembled
  [`test_vnthuquan_crawler.py:1915`](../../apps/crawler/tests/test_vnthuquan_crawler.py#L1915)

- AC3: concurrency=2, 5 books → strict batch ordering (2,2,1)
  [`test_vnthuquan_crawler.py:1976`](../../apps/crawler/tests/test_vnthuquan_crawler.py#L1976)
