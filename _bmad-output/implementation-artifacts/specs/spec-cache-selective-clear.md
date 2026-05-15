---
title: 'Split cache clear: preserve user data and book content'
type: 'feature'
created: '2026-05-15'
status: 'done'
baseline_commit: '2c9656ef47809620ca08f2e41cf0b431476ad898'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The Settings page "Xóa bộ nhớ đệm" button calls `storageService.clear()`, wiping all localforage — including user settings, bookmarks, reading positions, and downloaded book JSON. This destroys the user's data and takes bookmarked books offline-unreadable.

**Approach:** Split localforage into two groups: *cache* (EPUB blobs, catalog caches — regeneratable) and *user data* (settings, bookmarks, reading positions, book JSON — must survive). The clear button only deletes the cache group; service worker caches and TanStack Query cache are also cleared as before.

## Boundaries & Constraints

**Always:**
- Use `storageService` exclusively — no direct localforage/IndexedDB calls.
- Preserve keys: `user_settings`, `bookmarks`, `last_read_position`, all `book_cache_v1_*` entries.
- Clear keys with prefix `epub_blob_v4_` and `catalog_cache_v1_`, plus service worker caches and query client cache.
- UI and copy remain Vietnamese.

**Ask First:** If future storage key prefixes are ambiguous (neither clearly user data nor clearly cache), halt and ask before deciding which group they belong to.

**Never:**
- Add a second "clear all" button or change the existing button label to something scary.
- Change the `StorageService.clear()` method behavior — other callers may depend on it.
- Introduce a source-aware bookmark lookup to selectively spare book caches — all `book_cache_v1_*` keys are kept unconditionally.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Normal clear | Storage has EPUB blobs, catalog caches, book caches, bookmarks, settings | EPUB + catalog keys removed; book caches, bookmarks, settings intact; SW caches and query cache cleared | `clearError` shown if any step throws |
| No cache keys | `storageService.keys()` returns only `user_settings`, `bookmarks`, `last_read_position` | No keys deleted from localforage; SW cache and query cache still cleared | — |
| `keys()` throws | `storageService.keys()` rejects | `clearError` shown; nothing partially deleted | Caught in existing `try/catch` |
| User cancels | Dialog shown, user clicks Huỷ | Nothing cleared | — |

</frozen-after-approval>

## Code Map

- `apps/reader/src/shared/services/storage.service.ts` — `StorageService` interface + `LocalforageStorageService`; add `keys(): Promise<string[]>`
- `apps/reader/src/shared/constants/storage.keys.ts` — defines `EPUB_BLOB_CACHE_PREFIX`, `CATALOG_CACHE_PREFIX`, `STORAGE_KEYS` — read; no changes needed
- `apps/reader/src/features/settings/OfflineStorageInfo.tsx` — contains `handleClearCache` and the confirm dialog; primary change target
- `apps/reader/src/shared/constants/offline.copy.ts` — `settingsExplanation` string shown under storage size; update to reflect preserved vs cleared groups
- `apps/reader/src/features/settings/OfflineStorageInfo.test.tsx` — unit tests; update to mock `keys()` and assert selective deletion

## Tasks & Acceptance

**Execution:**
- [x] `apps/reader/src/shared/services/storage.service.ts` -- Add `keys(): Promise<string[]>` to `StorageService` interface; implement in `LocalforageStorageService` via `localforage.keys()` — let errors propagate (no internal try/catch) so the caller's try/catch in `handleClearCache` can set `clearError`
- [x] `apps/reader/src/features/settings/OfflineStorageInfo.tsx` -- Replace `await storageService.clear()` in `handleClearCache` with: get all keys via `storageService.keys()`, filter to those starting with `EPUB_BLOB_CACHE_PREFIX` or `CATALOG_CACHE_PREFIX`, call `storageService.removeItem` on each in parallel; import the two prefix constants; update the dialog description to state what is preserved vs cleared
- [x] `apps/reader/src/shared/constants/offline.copy.ts` -- Update `settingsExplanation` to: `'Dữ liệu tạm thời (file epub, danh mục) được lưu để đọc offline. Cài đặt, dấu trang và nội dung sách không bị xóa khi xóa bộ nhớ đệm.'`
- [x] `apps/reader/src/features/settings/OfflineStorageInfo.test.tsx` -- Add `mockLocalforageKeys` hoisted mock; update existing "confirm clears all caches" test to verify EPUB/catalog keys are deleted but user-data keys are not; add a test for the no-cache-keys edge case

**Acceptance Criteria:**
- Given the settings page is open, when the user clicks "Xóa bộ nhớ đệm" and confirms, then `storageService.removeItem` is called only for keys with the `epub_blob_v4_` or `catalog_cache_v1_` prefix.
- Given keys `user_settings`, `bookmarks`, `last_read_position`, and `book_cache_v1_vnthuquan_abc` exist in storage, when cache is cleared, then all four keys remain in storage.
- Given `storageService.keys()` returns `[]`, when cache is cleared, then no `removeItem` calls are made, but SW caches and query cache are still cleared.
- Given the user clicks "Xóa bộ nhớ đệm" then clicks "Huỷ", then nothing is cleared.

## Spec Change Log

- **Iteration 1**: Finding: `keys()` suppressing errors with try/catch+return-[] violates the I/O matrix row "`keys()` throws → clearError shown". The task description said "returning [] on failure" but that prevents the outer catch from ever firing on a keys() failure, silently reporting success while localforage blobs survive. Amendment: task for `storage.service.ts` changed to "let errors propagate — no internal try/catch". Known-bad state avoided: keys() failure → outer catch never fires → UI shows success despite incomplete clear. KEEP: all filter logic, dialog copy, test assertions, interface extension, queryClient/SW cache clearing.

## Design Notes

The selective deletion iterates `storageService.keys()` once and calls `removeItem` for each matched key in parallel — no sequential reads of values needed, since prefix matching is sufficient. Book JSON caches (`book_cache_v1_*`) are intentionally left to a future eviction strategy; clearing them now would make bookmarked books unreadable offline.

Dialog description change (Vietnamese):
- Before: `Toàn bộ dữ liệu đã lưu offline (sách, vị trí đọc, dấu trang) sẽ bị xóa. Tiếp tục?`
- After: `Dữ liệu tạm thời (file epub, danh mục đã cache) sẽ bị xóa. Dấu trang, cài đặt và nội dung sách vẫn được giữ lại. Tiếp tục?`

## Verification

**Commands:**
- `cd apps/reader && pnpm test -- --reporter=verbose src/features/settings/OfflineStorageInfo.test.tsx` -- expected: all tests pass
- `cd apps/reader && pnpm test` -- expected: full test suite green
- `cd apps/reader && pnpm lint` -- expected: 0 warnings

## Suggested Review Order

**Storage contract**

- Entry point: `keys()` added to interface — propagates errors, no suppression
  [`storage.service.ts:8`](../../apps/reader/src/shared/services/storage.service.ts#L8)

- Implementation: bare delegation to `localforage.keys()` so caller catches failures
  [`storage.service.ts:47`](../../apps/reader/src/shared/services/storage.service.ts#L47)

**Selective clear logic**

- Core change: filter to cache-only prefixes; queryClient.clear() after removeItem to avoid race
  [`OfflineStorageInfo.tsx:45`](../../apps/reader/src/features/settings/OfflineStorageInfo.tsx#L45)

**Copy**

- Dialog description clarifies what survives vs what is removed
  [`OfflineStorageInfo.tsx:120`](../../apps/reader/src/features/settings/OfflineStorageInfo.tsx#L120)

- Settings explanation updated to match two-group model
  [`offline.copy.ts:19`](../../apps/reader/src/shared/constants/offline.copy.ts#L19)

**Tests**

- Updated test: asserts selective key deletion; `localforageClear` never called
  [`OfflineStorageInfo.test.tsx:71`](../../apps/reader/src/features/settings/OfflineStorageInfo.test.tsx#L71)

- New test: no-cache-keys edge case — SW+query still cleared, no removeItem calls
  [`OfflineStorageInfo.test.tsx:116`](../../apps/reader/src/features/settings/OfflineStorageInfo.test.tsx#L116)

- Cancel path: now also asserts `keys()` not called
  [`OfflineStorageInfo.test.tsx:141`](../../apps/reader/src/features/settings/OfflineStorageInfo.test.tsx#L141)
