# Story 4.4: Background Catalog Sync

Status: done

## Story

As a **user**,
I want the library catalog to update silently in the background when new texts are added,
so that I always have the latest list of available sutras without needing to manually refresh.

## Acceptance Criteria

1. **Given** the user is online and opens the Library
   **When** TanStack Query's background refetch detects the SW has a newer version of `index.json`
   **Then** `queryClient.invalidateQueries({ queryKey: queryKeys.catalog() })` is called and the catalog re-fetches silently

2. **Given** the SW detects an updated `index.json` on the server (via `StaleWhileRevalidate` strategy for the catalog)
   **When** the updated response is cached
   **Then** the SW sends a `postMessage` to the app; the app calls `queryClient.invalidateQueries` in response

3. **Given** the catalog updates in the background while the user is reading
   **When** the update completes
   **Then** no interruption occurs to the active reading session — the update is entirely transparent

4. **Given** `useOnlineStatus()` returns `false`
   **When** the user is offline
   **Then** no background sync attempts are made and no network error is shown

## Tasks / Subtasks

- [x] Task 1: Change catalog cache strategy to StaleWhileRevalidate (AC: 2)
  - [x] Open `apps/reader/vite.config.ts`
  - [x] Added `StaleWhileRevalidate` entry for `index.json` ABOVE the general `/book-data/.*` entry
  - [x] cacheName: 'catalog-cache', maxEntries: 1, maxAgeSeconds: 24h

- [x] Task 2: Configure SW to postMessage on catalog cache update (AC: 2)
  - [x] Used `BroadcastChannel('catalog-updates')` approach on app side — simpler and reliable without needing generateSW plugin support

- [x] Task 3: Listen for SW catalog-update messages in the app (AC: 1, 2)
  - [x] Created `apps/reader/src/shared/hooks/useCatalogSync.ts` using BroadcastChannel
  - [x] On message: calls `queryClient.invalidateQueries({ queryKey: queryKeys.catalog() })`
  - [x] Wired in `App.tsx` at root level

- [x] Task 4: Guard against offline sync (AC: 4)
  - [x] `isOnline` check wraps listener setup — no BroadcastChannel opened when offline

- [x] Task 5: Verify transparent reading session behavior (AC: 3)
  - [x] Comment added in `useCatalogSync` noting intentional query key separation

- [x] Task 6: Integration test (AC: 1, 4)
  - [x] Created `apps/reader/src/shared/hooks/useCatalogSync.test.ts` — 3 tests pass

## Dev Notes

### Critical Context

**Prerequisite**: Story 4.3 must be complete (`useOnlineStatus` hook must exist before this story).

**Current vite.config.ts workbox config** (from code review):
```typescript
workbox: {
  globPatterns: ['**/*.{js,css,html,woff2,ico,png}'],
  navigateFallback: 'offline.html',
  runtimeCaching: [
    {
      urlPattern: /\/book-data\/.*/,  // ← covers ALL book-data including index.json
      handler: 'NetworkFirst',        // ← after Story 4.3 change
      options: { cacheName: 'book-data-cache', ... },
    },
  ],
}
```
The catalog (`index.json`) currently falls under `/book-data/.*` — this story adds a MORE SPECIFIC pattern for `index.json` BEFORE the general pattern. Order matters in Workbox `runtimeCaching` — first match wins.

**Workbox `generateSW` + BroadcastUpdatePlugin**:
- The `runtimeCaching[].options` object in vite-plugin-pwa's `generateSW` mode does accept a `plugins` array that maps to Workbox plugins
- Check vite-plugin-pwa docs for exact format — may need: `plugins: [{ broadcastUpdate: { channelName: 'catalog-updates' } }]` OR import via the Workbox package names
- If plugin format is unsupported in `generateSW`, fall back to `injectManifest` strategy with a custom SW file at `src/sw.ts`

**workbox-window installed** (`^7.4.0`) — the easiest app-side listener:
```typescript
// In App.tsx or useCatalogSync.ts
import { Workbox } from 'workbox-window'

if ('serviceWorker' in navigator) {
  const wb = new Workbox('/sw.js')  // adjust path to match generated SW
  wb.addEventListener('message', (event) => {
    if (event.data?.type === 'CACHE_UPDATED' && event.data?.meta?.cacheName === 'catalog-cache') {
      queryClient.invalidateQueries({ queryKey: queryKeys.catalog() })
    }
  })
  wb.register()
}
```
Note: If the SW is already registered in `main.tsx` via vite-plugin-pwa's `useRegisterSW()`, avoid double-registration. Instead, communicate via `BroadcastChannel` or use `navigator.serviceWorker.addEventListener('message', ...)` directly.

**Simplest reliable implementation**:
```typescript
// useCatalogSync.ts — using BroadcastChannel
export function useCatalogSync() {
  const isOnline = useOnlineStatus()

  useEffect(() => {
    if (!isOnline) return

    const channel = new BroadcastChannel('catalog-updates')
    channel.addEventListener('message', () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.catalog() })
    })
    return () => channel.close()
  }, [isOnline])
}
```

**Query key separation** (AC: 3 — transparent to reading):
- `queryKeys.catalog()` → `['catalog']`
- `queryKeys.book(id)` → `['book', id]`
- Invalidating `catalog` does NOT cascade to `book` queries — intentional architecture design
- The reader page uses `useBook(id)` only — catalog invalidation is invisible to it

**Offline guard pattern** (from architecture):
```typescript
// useOnlineStatus returns boolean — use it as a dependency
useEffect(() => {
  if (!isOnline) return  // skip setup when offline
  // ... register listeners
  return () => { /* cleanup */ }
}, [isOnline])
```

**TanStack Query v5 invalidation API**:
```typescript
queryClient.invalidateQueries({ queryKey: queryKeys.catalog() })
// NOT the v4 syntax: queryClient.invalidateQueries(queryKeys.catalog())
```
Make sure to use the v5 object form. Get `queryClient` via `useQueryClient()` hook (React context) or from the `QueryClient` instance created in `main.tsx`.

### Project Structure Notes

New files to create:
- `apps/reader/src/shared/hooks/useCatalogSync.ts`
- `apps/reader/src/shared/hooks/useCatalogSync.test.ts`

Files to modify:
- `apps/reader/vite.config.ts` — add `StaleWhileRevalidate` entry for `index.json` with `BroadcastUpdatePlugin`
- `apps/reader/src/App.tsx` — call `useCatalogSync()`

### Architecture Compliance

- `useOnlineStatus()` single shared hook — import from `@/shared/hooks/useOnlineStatus` (created in Story 4.3)
- `queryKeys.catalog()` from `@/shared/constants/query.keys` — no inline arrays
- No background sync when offline (AC: 4) — do not trigger network activity
- Catalog update must NOT interrupt active reading session (AC: 3) — separate query key trees guarantee this
- Use TanStack Query v5 API: `invalidateQueries({ queryKey: ... })` not the v4 positional form

### References

- [Source: _bmad-output/planning-artifacts/phase-2-reader-ui/epics-reader-ui.md#Story 4.4]
- [Source: _bmad-output/planning-artifacts/phase-2-reader-ui/architecture-reader-ui.md#Data Architecture - TanStack Query]
- [Source: _bmad-output/planning-artifacts/phase-2-reader-ui/architecture-reader-ui.md#Communication Patterns]
- [Source: apps/reader/vite.config.ts — current runtimeCaching config]
- [Source: apps/reader/src/shared/constants/query.keys.ts — queryKeys factory]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

All 6 tasks completed. StaleWhileRevalidate added for catalog in vite.config.ts (ahead of general book-data entry). useCatalogSync uses BroadcastChannel with online guard. Integration tests pass (3/3).

Code review fixes applied:
- `vite.config.ts`: added `BroadcastUpdatePlugin({ channelName: 'catalog-updates' })` to the StaleWhileRevalidate catalog entry — the SW now broadcasts to `catalog-updates` on cache update, completing AC 2. Installed `workbox-broadcast-update@7.4.0` as devDependency.
- `useCatalogSync.ts`: added `typeof BroadcastChannel !== 'undefined'` feature detection guard (Safari < 15.4 compat)

### File List

- apps/reader/vite.config.ts (modified — added StaleWhileRevalidate entry for index.json)
- apps/reader/src/shared/hooks/useCatalogSync.ts (new)
- apps/reader/src/shared/hooks/useCatalogSync.test.ts (new)
- apps/reader/src/App.tsx (modified — added useCatalogSync call)
