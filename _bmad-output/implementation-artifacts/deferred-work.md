# Deferred Work

Pre-existing issues surfaced during review of `fix-oom-vnthuquan-batch-assembly` (2026-05-08).
None of these were introduced by that change.

---

## `_books_remaining` not decremented for cancelled assemblers on abort

**File:** `apps/crawler/vnthuquan_crawler.py` — `_assemble_book` closure  
**Issue:** When abort fires and assemblers are cancelled before reaching the `try/finally` block (i.e., while still awaiting `coll.completed.wait()`), `self._books_remaining` is never decremented for those books. This can cause `_monitor_health` to spin on a non-zero count until the stall timeout fires.  
**Pre-existing:** Same pattern was in the original single-pass code.

---

## `asyncio.wait(FIRST_COMPLETED)` — simultaneous completion race

**File:** `apps/crawler/vnthuquan_crawler.py` — both the Phase C queue-drain race and the Phase D assembler race  
**Issue:** If `abort_task` (or `abort_watch`) and the work task complete in the same event-loop tick, both appear in `done`. The `abort_task in done` check evaluates `True` even when all work completed successfully, causing the abort branch to fire and skip `state.mark_downloaded`. The batch re-downloads on next run.  
**Fix when addressed:** `aborted = abort_task in done and join_task not in done` (and same for assembler phase).  
**Pre-existing:** Same `asyncio.wait` pattern was in the original code.

---

## `ensure_future` wrapping `asyncio.gather(*tasks)` is redundant

**File:** `apps/crawler/vnthuquan_crawler.py` — Phase D assembler gather  
**Issue:** `asyncio.gather` on `Task` objects already returns a `Future`; wrapping in `ensure_future` adds a no-op indirection and a misleading comment. Cosmetic only.  
**Pre-existing:** Copied comment and pattern from original code.

---

## Path traversal check in `StaticJsonDataService.getBook` is incomplete

**File:** `apps/reader/src/shared/services/data.service.ts` — `getBook`  
**Issue:** `artifactPath.startsWith('/') || artifactPath.includes('..')` does not block URL-encoded traversal (`%2F`, `%2e%2e`) or Windows-style separators. Pre-existing before the offline-mode fix.  
**Fix when addressed:** Validate that the resolved fetch URL starts with the expected `/book-data/` prefix after URL construction, rather than string-matching the raw path.

---

## Concurrent `getBook` calls not deduplicated

**File:** `apps/reader/src/shared/services/data.service.ts` — `getBook`  
**Issue:** Unlike `getCatalog`, `getBook` has no in-flight promise deduplication. Multiple simultaneous calls for the same `(id, source)` each make independent network requests. Pre-existing before the offline-mode fix.  
**Fix when addressed:** Add a `bookPromises: Map<string, Promise<Book>>` similar to `catalogPromises`.

---

## `concurrency=0` silently skips all active collectors

**File:** `apps/crawler/vnthuquan_crawler.py` — `_chunked(active_collectors, 0)`  
**Issue:** `islice(it, 0)` yields nothing; the while loop never runs; all books are silently unprocessed and `_books_remaining` is never decremented.  
**Pre-existing:** Original code had `min(concurrency, total_to_fetch) = 0` workers with the same effect. Pydantic config validator likely prevents `concurrency < 1` in practice.  
**Fix when addressed:** Add `if concurrency <= 0: raise ValueError(...)` in `_chunked` or at call site.
