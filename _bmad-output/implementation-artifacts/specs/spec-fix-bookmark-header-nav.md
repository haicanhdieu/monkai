---
title: 'Fix: bookmark group header navigates to last reading position'
type: 'bugfix'
created: '2026-05-11'
status: 'done'
route: 'one-shot'
---

## Intent

**Problem:** On the Bookmarks page, clicking the book cover image or title in a group header does nothing — the elements are non-interactive `<div>` / `<span>` nodes with no navigation.

**Approach:** Convert the group header `<div>` to a React Router `<Link>` targeting `toRead(group.bookId)` with the auto bookmark's CFI in navigation state (falling back to the first manual bookmark when no auto bookmark exists). Add `aria-label` so screen readers announce "Tiếp tục đọc {title}" rather than the concatenated inner text.

## Suggested Review Order

- [`../../apps/reader/src/features/bookmarks/BookmarksPage.tsx:140`](../../apps/reader/src/features/bookmarks/BookmarksPage.tsx) — header `<div>` → `<Link>` with `to`, `state`, `aria-label`
- [`../../apps/reader/src/features/bookmarks/BookmarksPage.test.tsx:81`](../../apps/reader/src/features/bookmarks/BookmarksPage.test.tsx) — new tests: header link href, accessible name, manual-only fallback
