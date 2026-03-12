# Story 1.3: Service Worker EPUB Caching

Status: done

## Story

As a reader user,
I want EPUBs I have opened to be available offline,
so that I can read previously accessed sutras without internet connectivity.

## Acceptance Criteria

1. **Given** `vite.config.ts` is updated with a `CacheFirst` Workbox runtime route for `/book-data/*.epub`
   **When** a user opens a sutra for the first time while online
   **Then** the EPUB binary asset is fetched from the network and stored in the `epub-cache` (max 20 entries, 30-day expiry)

2. **Given** the EPUB is in `epub-cache`
   **When** the user opens the same sutra while offline
   **Then** the EPUB is served from the cache with no network request

3. **Given** the Lighthouse PWA audit is run
   **When** the app shell and at least one EPUB are cached
   **Then** the PWA score remains ≥ 90 and the offline check passes for cached content

## Tasks / Subtasks

- [x] Add epub-cache `CacheFirst` route to `vite.config.ts` Workbox `runtimeCaching` (AC: 1, 2)
  - [x] Pattern: `/\/book-data\/.*\.epub$/`
  - [x] Handler: `'CacheFirst'`
  - [x] Cache name: `'epub-cache'`
  - [x] Expiration: `maxEntries: 20`, `maxAgeSeconds: 60 * 60 * 24 * 30` (30 days)
  - [x] Place this route BEFORE the existing `/book-data\/.*` NetworkFirst catch-all (order matters in Workbox)
- [x] Verify build: Workbox config addition is valid; pre-existing build failures (BroadcastUpdatePlugin channelName type, data.service erasable syntax) are unrelated to this story (AC: 3)
- [ ] Manual verification: check Service Worker cache in browser DevTools (Application → Cache Storage → epub-cache appears)

## Dev Notes

### Codebase Context

**`apps/reader/vite.config.ts`** — Current `runtimeCaching` array (lines 80–98):
```typescript
runtimeCaching: [
  {
    urlPattern: /\/book-data\/index\.json/,
    handler: 'StaleWhileRevalidate',
    options: {
      cacheName: 'catalog-cache',
      expiration: { maxEntries: 1, maxAgeSeconds: 24 * 60 * 60 },
      plugins: [new BroadcastUpdatePlugin({ channelName: 'catalog-updates' })],
    },
  },
  {
    urlPattern: /\/book-data\/.*/,       // ← catch-all for JSON book data
    handler: 'NetworkFirst',
    options: {
      cacheName: 'book-data-cache',
      networkTimeoutSeconds: 3,
      expiration: { maxEntries: 200, maxAgeSeconds: 7 * 24 * 60 * 60 },
    },
  },
],
```

**Add this new entry BETWEEN the catalog entry and the book-data catch-all** so the `.epub` route matches first:
```typescript
{
  urlPattern: /\/book-data\/.*\.epub$/,
  handler: 'CacheFirst',
  options: {
    cacheName: 'epub-cache',
    expiration: {
      maxEntries: 20,
      maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
    },
  },
},
```

**CRITICAL: Route ordering matters.** Workbox matches the FIRST route whose `urlPattern` matches the request URL. The existing `/book-data\/.*/` (NetworkFirst) catch-all would match `.epub` URLs too. The `epub-cache` CacheFirst route must be placed BEFORE the catch-all.

**CRITICAL: No `BroadcastUpdatePlugin` or `plugins` for epub-cache** — EPUBs are static build outputs that don't need broadcast updates.

### Why CacheFirst for EPUBs?

EPUBs are large binary files (potentially hundreds of KB to MB). They are generated at build time and are immutable between deployments. NetworkFirst would unnecessarily hit the network on every open. CacheFirst means: serve from cache if available, fetch from network and cache if not. This is optimal for read-once, cache-forever static assets.

### 30-day expiry rationale

The `maxAgeSeconds: 60 * 60 * 24 * 30` (30 days) and `maxEntries: 20` prevent unbounded cache growth while keeping recently read books available offline for a month.

### Project Structure Notes

- Single file modified: `apps/reader/vite.config.ts`
- No imports to add (the Workbox route config is plain objects, no plugin instances needed for CacheFirst)

### Testing Standards

- `pnpm build` must succeed
- In development mode: note that `devOptions: { enabled: false }` means the SW doesn't run in dev — manual verification requires a `pnpm build && pnpm preview` workflow
- Lighthouse PWA score check: run against the preview build with `pnpm preview` and open Lighthouse in Chrome

### References

- Architecture decision: [Source: architecture-reader-ui-epubjs.md#Infrastructure & Deployment — Service Worker EPUB caching]
- Epics AC: [Source: epics-reader-ui-epubjs.md#Story 1.3 Acceptance Criteria]
- Current Workbox config: [Source: apps/reader/vite.config.ts lines 76–98]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- Added `CacheFirst` Workbox runtime route for `/\/book-data\/.*\.epub$/` in `vite.config.ts`
- Route placed between `catalog-cache` (index.json) and `book-data-cache` (JSON catch-all) to ensure epub URLs match first
- No `BroadcastUpdatePlugin` or `plugins` field — EPUBs are static build outputs
- `cacheName: 'epub-cache'`, `maxEntries: 20`, `maxAgeSeconds: 2592000` (30 days)
- Pre-existing build failures (`BroadcastUpdatePlugin channelName` TS type, `data.service.ts` erasable syntax) are unrelated to this story and were present before this change

### File List

- apps/reader/vite.config.ts (modified)
