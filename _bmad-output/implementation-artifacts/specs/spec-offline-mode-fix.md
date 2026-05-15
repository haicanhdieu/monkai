---
title: 'Offline mode: persist catalog and book data to localforage'
type: 'bugfix'
created: '2026-05-11'
status: 'done'
baseline_commit: 'a6bc4e88f26b426228ec98464df4a59420a31ee4'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** When the book data server is unreachable, the reader app fails completely — even when catalog and book data were previously loaded — because TanStack Query's in-memory cache is cleared on page reload and the Service Worker's NetworkFirst strategy provides no reliable cold-start fallback.

**Approach:** Persist catalog and book JSON payloads to localforage via `StorageService` on each successful fetch. On network failure, load from localforage before propagating the error. No new dependencies needed.

## Boundaries & Constraints

**Always:** Use `storageService` (never direct `localforage`); follow `storage.keys.ts` key prefix pattern; preserve all existing `DataError` categories and error-page behavior for the not-cached case; pass a mock `StorageService` in all `StaticJsonDataService` test instantiations.

**Ask First:** Nothing.

**Never:** Cache books that were never fetched; introduce new npm packages; modify TanStack Query config, service-worker config, or Zod schemas; change what `DataError` categories mean to callers.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Server down, catalog cached | `catalogCacheKey(source)` in localforage, network fails | `getCatalog` returns cached `CatalogIndex` | — |
| Server down, book cached | `bookCacheKey(id, source)` in localforage, network fails | `getBook` returns cached `Book` | — |
| Server down, nothing cached | localforage empty, network fails | `getCatalog`/`getBook` throw `DataError('network')` | Error pages unchanged |
| Server down, catalog cached but book not | Catalog in localforage, book key absent | Library loads; reader shows `ReaderErrorPage(category='network')` | — |
| Server up | Normal fetch succeeds | Data fetched, saved to localforage, returned to caller | — |
| localforage write fails (quota) | `storageService.setItem` hits quota | `storageService` silently swallows it; fetched data still returned | No change to existing behavior |

</frozen-after-approval>

## Code Map

- `apps/reader/src/shared/constants/storage.keys.ts` — add `catalogCacheKey(source)` and `bookCacheKey(id, source)` helpers
- `apps/reader/src/shared/services/data.service.ts` — inject `StorageService`; write cache on success; read cache on network failure in `getCatalog` and `getBook`
- `apps/reader/src/shared/services/data.service.test.ts` — update all `StaticJsonDataService` constructions to pass a no-op mock storage; add offline fallback tests for each edge-case row

## Tasks & Acceptance

**Execution:**
- [x] `apps/reader/src/shared/constants/storage.keys.ts` -- add `CATALOG_CACHE_PREFIX = 'catalog_cache_v1_'`, `catalogCacheKey(source: SourceId): string`, `BOOK_CACHE_PREFIX = 'book_cache_v1_'`, `bookCacheKey(id: string, source: SourceId): string` -- stable key contracts so cache entries survive across sessions
- [x] `apps/reader/src/shared/services/data.service.ts` -- add optional third constructor param `storage: StorageService` defaulting to the imported `storageService` singleton; in `getCatalog` success path call `void this.storage.setItem(catalogCacheKey(source), parsed.data)` before returning; in `getCatalog` catch block, if `error instanceof DataError && error.category === 'network'`, call `this.storage.getItem<CatalogIndex>(catalogCacheKey(source))` and return the result if non-null before re-throwing; apply same pattern in `getBook` (wrap full method body in try/catch, save `book` before returning, read `bookCacheKey(id, source)` on network failure) -- makes previously-fetched data available offline across page reloads
- [x] `apps/reader/src/shared/services/data.service.test.ts` -- add a no-op `mockStorage` object satisfying `StorageService` (`getItem: vi.fn().mockResolvedValue(null)`, `setItem: vi.fn().mockResolvedValue(undefined)`, `removeItem/clear: vi.fn()`); pass it to all existing `new StaticJsonDataService(fetchMock, baseUrl)` calls as the third arg; add new `describe('offline fallback')` tests covering the I/O matrix rows -- ensures new param doesn't break existing tests and new behavior is regression-proof

**Acceptance Criteria:**
- Given catalog was previously fetched (localforage has `catalogCacheKey(source)`), when server is down and the app cold-starts, then `getCatalog` resolves with cached data and the Library page renders without an error page.
- Given a book was previously loaded (localforage has `bookCacheKey(id, source)`), when server is down, then `getBook` resolves with cached data and the reader renders the book.
- Given no cached data exists, when server is down, then `getCatalog` and `getBook` throw `DataError('network')` and the existing error pages are shown unchanged.
- Given server is up, when `getCatalog` or `getBook` succeeds, then the parsed data is written to localforage before returning (verified by spy on `storageService.setItem` in tests).

## Spec Change Log

## Design Notes

`getCatalog` uses a `catalogPromises` deduplication map. The localforage fallback sits inside the promise body's catch block, after the map entry is deleted, so a successful localforage read resolves the promise for all concurrent awaitors. A subsequent call to `getCatalog` (map is now empty) creates a new promise that will hit localforage again if still offline — fast, no network wait.

`getBook` calls `getCatalog` internally. If the catalog recovers from localforage but the specific book JSON is not in cache, the `fetchJson` call throws `DataError('network')`, which propagates to `getBook`'s outer catch. There, `bookCacheKey(id, source)` is checked; if absent, the original error is re-thrown — `ReaderErrorPage` shows as expected.

## Verification

**Commands:**
- `cd apps/reader && pnpm lint` -- expected: 0 warnings, 0 errors
- `cd apps/reader && pnpm test` -- expected: all tests pass, new offline fallback tests included

## Suggested Review Order

**Offline fallback logic — core change**

- Constructor gains injected `StorageService`; this is the seam for both production and test
  [`data.service.ts:87`](../../apps/reader/src/shared/services/data.service.ts#L87)

- `getCatalog` writes parsed data to storage on success — cache warming
  [`data.service.ts:113`](../../apps/reader/src/shared/services/data.service.ts#L113)

- `getCatalog` catch: on network error, read cache with shape guard; try/catch for storage read failure
  [`data.service.ts:117`](../../apps/reader/src/shared/services/data.service.ts#L117)

- `getBook` mirrors the same pattern: write on success, read on network error with shape guard
  [`data.service.ts:162`](../../apps/reader/src/shared/services/data.service.ts#L162)

**Storage key contracts**

- Versioned catalog and book key prefixes and helpers — bump version when schema changes
  [`storage.keys.ts:18`](../../apps/reader/src/shared/constants/storage.keys.ts#L18)

**Tests**

- `makeNoopStorage` factory — allows injecting a controlled `StorageService` in all test instantiations
  [`data.service.test.ts:5`](../../apps/reader/src/shared/services/data.service.test.ts#L5)

- Offline fallback tests covering all six I/O matrix scenarios
  [`data.service.test.ts:176`](../../apps/reader/src/shared/services/data.service.test.ts#L176)
