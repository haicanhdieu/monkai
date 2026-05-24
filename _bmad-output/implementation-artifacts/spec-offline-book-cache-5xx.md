---
title: 'Fix offline fallback not triggered when server returns 5xx'
type: 'bugfix'
created: '2026-05-24'
status: 'done'
route: 'one-shot'
---

## Intent

**Problem:** When the Win server (Cloudflare quick tunnel) is stopped, Vercel's proxy returns a 5xx response. `fetchJson` threw `DataError('unknown')` for non-404 non-2xx responses, but the localforage fallback in `getCatalog`/`getBook` only fires on `DataError('network')` — so cached books were unreachable even though they existed in localforage.

**Approach:** Treat HTTP 5xx responses as network failures in `fetchJson` (throw `DataError('network')`). Also fix the SW catalog cache URL pattern which never matched the actual source-prefixed path `/book-data/vbeta/index.json`.

## Suggested Review Order

1. [`../../apps/reader/src/shared/services/data.service.ts`](../../apps/reader/src/shared/services/data.service.ts) — root fix: `fetchJson` now throws `DataError('network')` for `status >= 500`
2. [`../../apps/reader/src/shared/services/data.service.test.ts`](../../apps/reader/src/shared/services/data.service.test.ts) — three new unit tests in `offline fallback` block covering 5xx → localforage path
3. [`../../apps/reader/vite.config.ts`](../../apps/reader/vite.config.ts) — SW catalog cache pattern fixed: `/\/book-data\/index\.json/` → `/\/book-data\/[^/]+\/index\.json/`

## Code Map

- `apps/reader/src/shared/services/data.service.ts` — `fetchJson`: added `status >= 500` branch before `unknown` throw
- `apps/reader/src/shared/services/data.service.test.ts` — three new tests: 5xx→cache hit for catalog, 5xx→throw when cache miss, 5xx→book cache hit
- `apps/reader/vite.config.ts` — SW runtimeCaching: catalog `urlPattern` regex corrected

## Spec Change Log

<!-- empty — no review loops -->
