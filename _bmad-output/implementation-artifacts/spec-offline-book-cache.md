---
title: 'Fix offline book cache not served to reader'
type: 'bugfix'
created: '2026-05-24'
status: 'done'
route: 'one-shot'
---

## Intent

**Problem:** When the app is reloaded while `navigator.onLine === false`, TanStack Query's default `networkMode: 'online'` pauses `useBook` and `useCatalogIndex` queries — the `queryFn` never runs, so the localforage fallback in `StaticJsonDataService` is never reached. The reader shows a generic error instead of loading the previously-cached book.

**Approach:** Add `networkMode: 'always'` to both query hooks so the `queryFn` always executes regardless of online status, enabling the existing localforage fallback in `data.service.ts` to serve cached book and catalog data when offline.

## Suggested Review Order

1. [`../../apps/reader/src/shared/hooks/useBook.ts`](../../apps/reader/src/shared/hooks/useBook.ts) — one-line fix, the root change
2. [`../../apps/reader/src/shared/hooks/useCatalogIndex.ts`](../../apps/reader/src/shared/hooks/useCatalogIndex.ts) — mirror fix for catalog hook
3. [`../../apps/reader/src/shared/services/data.service.ts`](../../apps/reader/src/shared/services/data.service.ts) — confirm the localforage fallback exists in `getCatalog` and `getBook` (unchanged, context only)

## Code Map

- `apps/reader/src/shared/hooks/useBook.ts` — changed: added `networkMode: 'always'`
- `apps/reader/src/shared/hooks/useCatalogIndex.ts` — changed: added `networkMode: 'always'`
- `apps/reader/src/shared/services/data.service.ts` — unchanged; contains localforage fallback in `getCatalog` and `getBook` that this fix unlocks

## Spec Change Log

<!-- empty — no review loops -->
