---
title: 'Bookmark items sorted by creation time (latest first)'
type: 'bugfix'
created: '2026-05-29'
status: 'done'
route: 'one-shot'
---

## Intent

**Problem:** Bookmark items within each book group were ordered by type (auto first, then manual by page number) rather than by when they were created, making it hard to find recently added bookmarks.

**Approach:** Replace the type-then-page sort with a single timestamp-descending sort on all items within each group. Reuse the already-computed `sortedByTimestamp` array to eliminate the redundant sort pass.

## Suggested Review Order

1. [`../../apps/reader/src/features/bookmarks/BookmarksPage.tsx:56-64`](../../apps/reader/src/features/bookmarks/BookmarksPage.tsx) — core sort change in the `.map()` block; verify `sortedByTimestamp` reuse removes the duplicate sort
2. [`../../apps/reader/src/features/bookmarks/BookmarksPage.test.tsx:119-170`](../../apps/reader/src/features/bookmarks/BookmarksPage.test.tsx) — updated test + new complementary case; confirm both directions of timestamp ordering are covered
