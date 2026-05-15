---
title: 'Fix OOM: sentinel pattern to defer pre-existing chapter HTML loading to assembly'
type: 'bugfix'
created: '2026-05-08'
status: 'completed'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Phase A of `_crawl_page_with_chapter_queue` calls `_load_existing_chapters` for every book on a listing page and stores all pre-existing chapter HTML in `chapters_result` simultaneously. For a page with 20 books each having 1000–2000+ already-downloaded chapters (~11KB each), this loads 220–540MB before Phase B/C/D batching starts — exhausting the Pi's 905 MB RAM. The previous batch fix (Phase B/C/D only) left Phase A untouched.

**Approach:** Replace the pre-loaded `ChapterParseResult` objects in Phase A with a module-level `_PRE_LOADED_SENTINEL` instance (also a `ChapterParseResult`, but identity-checked). Free `existing_html` immediately after. In `_assemble_book` (Phase D), detect sentinel positions and load their HTML from disk once per book at assembly time. Skip `_write_partial_book_json` for books with any sentinel (pre-existing chapters are already crash-safe on disk; only fresh-book partial saves are needed).

## Boundaries & Constraints

**Always:**
- Use `is _PRE_LOADED_SENTINEL` (identity check), never `==`, to detect sentinel positions — freshly-downloaded chapters with `content_html=None` must not be confused with the sentinel.
- Free `existing_html` immediately after building `chapters_result` in Phase A.1 (`del existing_html`).
- Preserve all abort/resume/state-persistence logic untouched.
- Phase B enqueue logic (`if coll.chapters_result[i] is None`) stays unchanged — sentinel positions are not None and are correctly skipped.
- Partial saves still run for fresh books (`pending_count == total_chapters`).

**Ask First:**
- None anticipated.

**Never:**
- Do NOT change `_write_partial_book_json`, `BookCollector`, `ChapterTask`, `BookDetail`.
- Do NOT change the public signature of `_crawl_page_with_chapter_queue`.
- Do NOT add a new config key.
- Do NOT load `existing_html` into a per-collector cache field — that defeats the memory savings.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Fresh book (no prior download) | `pending_count == total_chapters` | `chapters_result` all None; partial saves work normally; assembler assembles from `chapters_result` only | N/A |
| Resume book (partial prior download) | `pending_count < total_chapters` | Sentinel positions in `chapters_result`; `_write_partial_book_json` skipped; assembler calls `_load_existing_chapters` once, merges with newly-fetched | Disk read in assembler wrapped in existing `try/except` |
| All chapters already on disk (`pending_count == 0`) | book in `pending` (state not marked done) | All sentinels; `completed` set immediately; NOT in `active_collectors`; `_assemble_book` never called; sentinels freed when `collectors` is GC'd | N/A |
| 20-book page, all resume | 20 books × 1000 pre-existing chapters | Phase A memory: negligible (sentinels only); peak memory ≤ 5 books' HTML at assembly time | N/A |

</frozen-after-approval>

## Code Map

- `apps/crawler/vnthuquan_crawler.py:52` -- `_chunked` helper (existing) — context for module-level helpers
- `apps/crawler/vnthuquan_crawler.py:~58` -- add `_PRE_LOADED_SENTINEL` after `_chunked`
- `apps/crawler/vnthuquan_crawler.py:844` -- Phase A.1 inside `_fetch_detail` — replace HTML-loading with sentinel; add `del existing_html`
- `apps/crawler/vnthuquan_crawler.py:979` -- `_write_partial_book_json` call site in `_chapter_worker` — add guard: skip when `coll.pending_count < coll.total_chapters`
- `apps/crawler/vnthuquan_crawler.py:993` -- `_assemble_book` inner function — add sentinel-resolution block before the `chapters_html` loop
- `apps/crawler/tests/test_vnthuquan_crawler.py:1848` -- existing batch tests — add sentinel tests nearby

## Tasks & Acceptance

**Execution:**
- [x] `apps/crawler/vnthuquan_crawler.py` -- Add `_PRE_LOADED_SENTINEL = ChapterParseResult(content_html=None, cover_image_url=None)` as a module-level constant after `_chunked`. In `_fetch_detail`'s Phase A.1 block (around line 849): replace `ChapterParseResult(content_html=h, ...) if h is not None else None` with `_PRE_LOADED_SENTINEL if h is not None else None`; add `del existing_html` immediately after the list comprehension. In `_chapter_worker`: wrap the `_write_partial_book_json` call to skip when `coll.pending_count < coll.total_chapters`. In `_assemble_book`: before the `chapters_html` loop, if `coll.pending_count < coll.total_chapters`, call `existing_html = _load_existing_chapters(entry, detail, self.output_dir)` else `existing_html = None`; in the loop, handle `res is _PRE_LOADED_SENTINEL` → `chapters_html.append(existing_html[i] or "" if existing_html else "")`
- [x] `apps/crawler/tests/test_vnthuquan_crawler.py` -- Add tests near line 1848: (a) after a `_crawl_page_with_chapter_queue` call with pre-existing chapters mocked, assert `_write_partial_book_json` was NOT called for resume books; (b) assert the assembled book contains correct HTML for both pre-existing and freshly-downloaded chapters; (c) assert `chapters_result` after completion is empty (existing AC1 still passes)

**Acceptance Criteria:**
- Given a book with 1000 pre-existing chapters, when Phase A completes, then `chapters_result` contains `_PRE_LOADED_SENTINEL` at those positions and `existing_html` has been freed (no `ChapterParseResult` objects holding HTML strings)
- Given a resume book with sentinel positions, when `_chapter_worker` would normally call `_write_partial_book_json`, then it is skipped
- Given a resume book, when `_assemble_book` runs, then `_load_existing_chapters` is called exactly once and the final `book.json` contains correct HTML for all chapters
- Given a fresh book (no prior download), when `_chapter_worker` reaches the 5-chapter interval, then `_write_partial_book_json` is called normally (unchanged behavior)
- Given 20 resume books on a page, when Phase A completes for all 20, then total memory for `chapters_result` across all collectors is O(N pointers) not O(N × chapter_html_size)

## Design Notes

**Why sentinel instead of a separate flag field:**
`chapters_result[i]` already encodes three states: `None` (pending), `ChapterParseResult` (fetched/pre-existing). Adding a sentinel reuses the existing slot without changing `BookCollector`, Phase B logic, or worker logic. A fourth state via a new field would require more invasive changes.

**Why skip partial saves for resume books rather than load-from-disk inside `_write_partial_book_json`:**
Reading the full book.json inside `_write_partial_book_json` (called every 5 chapters) would add N disk reads per book per run. The pre-existing chapters are already safely on disk — partial saves exist for crash-recovery of in-flight new chapters. A clean restart will re-download those; the pre-existing chapters are never at risk.

**Sentinel identity check example:**
```python
# Correct — identity check ignores freshly-downloaded ChapterParseResult(content_html=None)
if res is _PRE_LOADED_SENTINEL:
    ...
# Wrong — would also match legitimately-empty fetched results
if res is not None and res.content_html is None:
    ...
```

## Review Notes

- Adversarial review completed
- Findings: 14 total, 9 fixed, 5 dismissed (noise/design decisions)
- Resolution approach: auto-fix all real findings
- F3: Documented sentinel mutability invariant in comment
- F6: Explicit parentheses for operator precedence clarity
- F7: Moved `_load_existing_chapters` inside `try/except` in assembler
- F8: Added test for `pending_count == 0` (fully-cached book)
- F9: Added chapter order assertion to assembly test
- F5: Added warning log when sentinel position has no HTML on disk
- F10: Moved `slugify_title` import to module level in test file
- F11: Added test for `fetch_chapter` returning `None` on pending chapter in resume book
- F12: Extracted `is_fresh_book` local variable before hot loop in `_chapter_worker`

## Verification

**Commands:**
- `cd apps/crawler && uv run pytest tests/test_vnthuquan_crawler.py -x -q` -- expected: all tests pass, 0 failures
- `cd apps/crawler && uv run ruff check vnthuquan_crawler.py` -- expected: no errors

**Manual checks:**
- SSH to Pi: `watch -n5 free -h` during crawl from a page with prior partial downloads; Phase A should complete without memory spike; memory should grow only during active chapter downloading (Phase C) and peak at ≤ concurrency × book_size
