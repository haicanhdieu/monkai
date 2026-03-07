# Story 4.4: Background Catalog Sync

Status: ready-for-dev

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

- [ ] Task 1: Change catalog cache strategy to StaleWhileRevalidate (AC: 2)
  - [ ] Open `apps/reader/vite.config.ts`
  - [ ] Add a new runtime caching entry for `index.json` (the catalog endpoint) ABOVE the `/book-data/.*` entry (more specific patterns first):
    ```typescript
    {
      urlPattern: /\/book-data\/index\.json/,
      handler: 'StaleWhileRevalidate',
      options: {
        cacheName: 'catalog-cache',
        expiration: { maxEntries: 1, maxAgeSeconds: 24 * 60 * 60 },
      },
    }
    ```
  - [ ] `StaleWhileRevalidate`: serves stale cache immediately, fetches update in background, caches new response — perfect for "always fast, eventually consistent" catalog

- [ ] Task 2: Configure SW to postMessage on catalog cache update (AC: 2)
  - [ ] Switch from `strategies: 'generateSW'` to `strategies: 'injectManifest'` in `vite.config.ts` to allow a custom SW file — OR use Workbox's `broadcastUpdate` plugin which works with `generateSW`
  - [ ] **Recommended approach**: Stay with `generateSW` and add the `BroadcastUpdatePlugin` to the catalog caching entry:
    ```typescript
    {
      urlPattern: /\/book-data\/index\.json/,
      handler: 'StaleWhileRevalidate',
      options: {
        cacheName: 'catalog-cache',
        expiration: { maxEntries: 1, maxAgeSeconds: 24 * 60 * 60 },
        plugins: [{ broadcastUpdate: { channelName: 'catalog-updates' } }],
      },
    }
    ```
  - [ ] **Note**: Workbox's `generateSW` config may NOT support `plugins` array directly in the `options` object — check vite-plugin-pwa docs for the correct way to add `BroadcastUpdatePlugin`. If not supported with `generateSW`, use the alternative approach (Task 2b).
  - [ ] **Alternative approach (Task 2b)**: Use `BroadcastChannel` from the app side polling, or use `workbox-window`'s `messageSkipWaiting` + custom message listener. Since `workbox-window` is installed (`^7.4.0`), use `wb.addEventListener('message', handler)` where the app listens for SW messages.

- [ ] Task 3: Listen for SW catalog-update messages in the app (AC: 1, 2)
  - [ ] Create `apps/reader/src/shared/hooks/useCatalogSync.ts`
  - [ ] Use `workbox-window`'s `Workbox` instance (or `BroadcastChannel('catalog-updates')`) to listen for update messages
  - [ ] On message received, call `queryClient.invalidateQueries({ queryKey: queryKeys.catalog() })`
  - [ ] Guard: only listen when `useOnlineStatus()` returns `true` (AC: 4)
  - [ ] Call this hook in `App.tsx` — once, at root level

- [ ] Task 4: Guard against offline sync (AC: 4)
  - [ ] In `useCatalogSync`, wrap the message listener setup with an online check
  - [ ] When offline: skip listener registration or remove it
  - [ ] No error state — failure is silent (architecture pattern: offline failures are invisible)

- [ ] Task 5: Verify transparent reading session behavior (AC: 3)
  - [ ] Manual test: open a book, read for a few seconds, trigger catalog invalidation (call `queryClient.invalidateQueries` from browser devtools)
  - [ ] Assert: reader page is unaffected — `queryKeys.catalog()` and `queryKeys.book(id)` are separate query keys; invalidating catalog does NOT invalidate the current book query
  - [ ] Add a comment in `useCatalogSync` noting this intentional separation

- [ ] Task 6: Integration test (AC: 1, 4)
  - [ ] Create `apps/reader/src/shared/hooks/useCatalogSync.test.ts`
  - [ ] Mock `useOnlineStatus` to return `false` → assert no listeners registered
  - [ ] Mock `useOnlineStatus` to return `true` and simulate a BroadcastChannel message → assert `queryClient.invalidateQueries` is called with `queryKeys.catalog()`

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

### File List
