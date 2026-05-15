---
title: 'Cache book cover images for offline access'
type: 'bugfix'
created: '2026-05-15'
status: 'done'
baseline_commit: '8863e51d63e3d2ed736e0fb376fcc9432e1676be'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Book cover images on the HomePage (continue-reading card, DiscoverStrip) and BookmarksPage are not reliably available offline. The general `book-data-cache` (NetworkFirst, `maxEntries: 200`) pools all `/book-data/` requests; with 470+ books plus their JSON files, cache entries exceed the limit and covers are LRU-evicted before they can be served when the server is down.

**Approach:** Add a dedicated `cover-image-cache` Workbox runtimeCaching rule (CacheFirst, `maxEntries: 600`) matching cover image extensions under `/book-data/`, ordered before the existing general `book-data-cache` rule so cover requests route to their own cache.

## Boundaries & Constraints

**Always:**
- Use Workbox `runtimeCaching` in `vite.config.ts` — do not use `StorageService`/localforage for image caching.
- New rule must be ordered BEFORE the existing `/book-data/.*` NetworkFirst rule.
- Pattern must match extensions found in real crawled data: `.jpg`, `.jpeg`, `.png`, `.svg`, `.webp`; use a case-insensitive flag.
- Strategy: `CacheFirst` — covers are immutable per book, so serve from cache immediately.

**Ask First:**
- If any cover image extension not in the list above is discovered during implementation.

**Never:**
- Change the `NetworkFirst` rule for `/book-data/.*` — book JSON files must remain NetworkFirst.
- Simply increase `maxEntries` on the existing `book-data-cache` as a substitute; covers need their own dedicated cache.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Cover served offline | Cover was fetched while online; server is now down | Image displays from `cover-image-cache` | n/a |
| Cover never cached | User is offline; cover was never loaded while online | Placeholder (`coverPlaceholderStyle`) shown; `onError` fires | Existing `coverError` state handles gracefully |
| 470+ covers all loaded | All book covers fetched while online | All entries within `maxEntries: 600`; no LRU eviction of recently-seen covers | n/a |
| Non-image `/book-data/` requests | JSON book files, index.json | Still routed to `catalog-cache` or `book-data-cache` — unaffected | n/a |

</frozen-after-approval>

## Code Map

- `apps/reader/vite.config.ts` — Workbox `runtimeCaching` array; new rule inserted before the general `book-data-cache` entry at the third position
- `apps/reader/src/features/home/HomePage.tsx` — renders `<img src={coverUrl}>` for continue-reading card; no changes needed
- `apps/reader/src/features/home/DiscoverStrip.tsx` — `BookCoverTile` renders `<img src={coverUrl}>`; no changes needed
- `apps/reader/src/features/bookmarks/BookmarksPage.tsx` — resolves `coverUrl` via `resolveCoverUrl`; no changes needed
- `apps/reader/src/shared/services/data.service.ts` — `resolveCoverUrl()`: relative path → `{BOOK_DATA_BASE_URL}/book-data/{path}`; no changes needed

## Tasks & Acceptance

**Execution:**
- [x] `apps/reader/vite.config.ts` -- insert `cover-image-cache` runtimeCaching entry (CacheFirst, maxEntries 600, 30-day expiry) matching `/\/book-data\/.*\.(jpg|jpeg|png|svg|webp)$/i`, placed before the existing `/book-data/.*` NetworkFirst rule

**Acceptance Criteria:**
- Given a user has previously visited the home or bookmarks page while online, when the book data server goes offline, then cover images are visible (served from `cover-image-cache`).
- Given a book cover URL ends in `.jpg`, `.jpeg`, `.png`, `.svg`, or `.webp`, when the service worker intercepts the request, then it is routed to `cover-image-cache` and NOT to `book-data-cache`.
- Given `pnpm lint` runs in `apps/reader`, then zero ESLint warnings or errors.
- Given `pnpm test` runs in `apps/reader`, then all existing tests pass.

## Spec Change Log

## Design Notes

Ordering matters: Workbox evaluates `runtimeCaching` in order and stops at the first match. The new rule (image-extension-specific) must precede the general `/book-data/.*` entry, otherwise all covers still fall into the NetworkFirst pool.

`cover_image_url` in `index.json` is a relative path (e.g. `vbeta/kinh/.../cover.jpg`). `resolveCoverUrl()` converts it to an absolute URL (`{BOOK_DATA_BASE_URL}/book-data/vbeta/...`). The regex `/\/book-data\/.*\.(jpg|jpeg|png|svg|webp)$/i` matches this resolved URL path segment.

## Verification

**Commands:**
- `cd apps/reader && pnpm lint` -- expected: exit 0, zero warnings
- `cd apps/reader && pnpm test` -- expected: all tests pass

## Suggested Review Order

- New `cover-image-cache` rule: CacheFirst, maxEntries 600, 30-day expiry — the entire fix
  [`vite.config.ts:105`](../../apps/reader/vite.config.ts#L105)

- Adjacent `book-data-cache` rule unchanged at position 4 — confirms ordering is correct
  [`vite.config.ts:117`](../../apps/reader/vite.config.ts#L117)
