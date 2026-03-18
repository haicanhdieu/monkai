# Design Log — Reader App

## Current
_No active work._

## Backlog
_No pending items._

---

## Progress

### [2026-03-18] — Bugfix: Manual bookmarks lost after browser F5 refresh

**Bug:** Custom (manual) bookmarks appeared correctly on the Bookmarks page after navigating back from the reader, but disappeared completely after a hard browser refresh (F5).

**Root Cause:** Identity mismatch between `Book.id` and the catalog UUID.

- The book JSON files store an internal slug as their `id` field (e.g. `"vbeta__bo-trung-quan"`)
- The catalog `index.json` assigns a UUID to each book (e.g. `"5cb15d2a-94d8-4c10-840d-cd934ac19627"`)
- `StaticJsonDataService.getBook(id)` was called with the UUID but returned a `Book` with `id = slug` (raw value from the JSON file)
- `ReaderEngine` correctly used `bookId` (UUID from URL params) for auto-bookmarks
- `ChromelessLayout` incorrectly used `book.id` (slug) for manual bookmarks
- On refresh, `useStorageHydration` filters bookmarks through `isValidBookId` (UUID regex) — slugs fail the filter and are discarded

Secondary effect: on the Bookmarks page, the same book appeared as two separate groups (one keyed by UUID for the auto-bookmark, one by slug for the manual bookmark).

**Fix:** `apps/reader/src/shared/services/data.service.ts` — `StaticJsonDataService.getBook()`.

Override the returned book's `id` with the catalog UUID used to fetch it:
```ts
// was:
return parsed.data

// now:
return { ...parsed.data, id }
```

This ensures `Book.id` is always the catalog UUID everywhere downstream.

**Files changed:**
- `src/shared/services/data.service.ts` — one-line fix (override id)
- `src/shared/services/data.service.test.ts` — regression test added

**Verification:** 246 tests pass, 0 regressions. Full suite green.
