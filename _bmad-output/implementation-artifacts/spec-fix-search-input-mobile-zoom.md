---
title: 'Fix search input mobile zoom on focus'
type: 'bugfix'
created: '2026-05-11'
status: 'done'
route: 'one-shot'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** On iOS Safari (and other mobile browsers), focusing any `<input>` with `font-size < 16px` triggers an automatic page zoom. Both search bars used Tailwind `text-sm` (14px), causing the page to zoom in when the user tapped the search field.

**Approach:** Change `text-sm` to `text-base` (16px) on both search `<input>` elements — the minimum font size iOS requires to suppress auto-zoom.

</frozen-after-approval>

## Suggested Review Order

- [`apps/reader/src/features/library/LibrarySearchBar.tsx:27`](../../apps/reader/src/features/library/LibrarySearchBar.tsx) — `text-base` on library search input
- [`apps/reader/src/features/bookmarks/BookmarkSearchBar.tsx:32`](../../apps/reader/src/features/bookmarks/BookmarkSearchBar.tsx) — `text-base` on bookmark search input

## Code Map

- `apps/reader/src/features/library/LibrarySearchBar.tsx` — library search input (was `text-sm`)
- `apps/reader/src/features/bookmarks/BookmarkSearchBar.tsx` — bookmark search input (was `text-sm`)

## Tasks & Acceptance

**Execution:**
- [x] `apps/reader/src/features/library/LibrarySearchBar.tsx` -- change `text-sm` to `text-base` on `<input>` -- iOS zoom fix
- [x] `apps/reader/src/features/bookmarks/BookmarkSearchBar.tsx` -- change `text-sm` to `text-base` on `<input>` -- iOS zoom fix

**Acceptance Criteria:**
- Given a mobile browser (iOS Safari), when the user taps any search box, then the page does not zoom in
- Given any search box is focused, when the user types, then text is legible at 16px

## Spec Change Log

## Verification

**Manual checks:**
- Open the app on an iOS device or Chrome DevTools with an iPhone viewport; tap the library search bar and the bookmarks search bar — page must not zoom
