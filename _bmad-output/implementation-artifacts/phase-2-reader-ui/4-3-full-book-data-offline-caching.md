# Story 4.3: Full Book-Data Offline Caching

Status: ready-for-dev

## Story

As a **user**,
I want every sutra I open to be available the next time I visit — even without internet,
so that I can read during flights, retreats, or anywhere without a network connection.

## Acceptance Criteria

1. **Given** Workbox `generateSW` config in `vite.config.ts` with a `NetworkFirst` runtime strategy for `/book-data/**`
   **When** `useBook(id)` fetches a book JSON for the first time while online
   **Then** the SW intercepts the response and caches it under the `book-data` Workbox cache

2. **Given** the book has been fetched at least once
   **When** the user opens the same book while offline
   **Then** the SW serves the cached JSON; the reader loads identically to the online experience

3. **Given** the user opens a book for the first time while offline (never cached)
   **When** the SW fetch fails
   **Then** `useBook` returns an error and `<ReaderErrorPage>` shows "Nội dung này chưa được tải về."

4. **Given** a Playwright E2E test that:
   1. Loads a book while online
   2. Switches to offline (via CDP network interception or Playwright `page.context().setOffline(true)`)
   3. Reloads and navigates to the same book
   **When** the test runs
   **Then** the book content renders without any network requests (served from SW cache)

5. **Given** the `<OfflineBanner>` component in `shared/components/`
   **When** `useOnlineStatus()` returns `false`
   **Then** a subtle, themed banner appears at the top of the screen: "Đang offline — đọc từ bộ nhớ đệm"

## Tasks / Subtasks

- [ ] Task 1: Switch book-data cache strategy to NetworkFirst (AC: 1, 2, 3)
  - [ ] Open `apps/reader/vite.config.ts`
  - [ ] In `workbox.runtimeCaching`, change the `/book-data/.*` handler from `'CacheFirst'` to `'NetworkFirst'`
  - [ ] Add `networkTimeoutSeconds: 3` to options so offline fallback is fast
  - [ ] Keep `cacheName: 'book-data-cache'`, `expiration.maxEntries: 200`, `expiration.maxAgeSeconds: 7 * 24 * 60 * 60`
  - [ ] Final config shape:
    ```typescript
    {
      urlPattern: /\/book-data\/.*/,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'book-data-cache',
        networkTimeoutSeconds: 3,
        expiration: { maxEntries: 200, maxAgeSeconds: 7 * 24 * 60 * 60 },
      },
    }
    ```

- [ ] Task 2: Create useOnlineStatus hook (AC: 5)
  - [ ] Create `apps/reader/src/shared/hooks/useOnlineStatus.ts`
  - [ ] Use `navigator.onLine` as initial value
  - [ ] Subscribe to `window.addEventListener('online', ...)` and `window.addEventListener('offline', ...)`
  - [ ] Return `isOnline: boolean`
  - [ ] Cleanup event listeners on unmount

- [ ] Task 3: Create OfflineBanner component (AC: 5)
  - [ ] Create `apps/reader/src/shared/components/OfflineBanner.tsx`
  - [ ] Import `useOnlineStatus`
  - [ ] When offline: render a themed banner using CSS custom properties (matches active reading theme)
  - [ ] Banner text: "Đang offline — đọc từ bộ nhớ đệm"
  - [ ] When online: render nothing (`return null`)
  - [ ] Style: subtle, non-intrusive — fixed at top of viewport or inside the app layout shell, low z-index

- [ ] Task 4: Wire OfflineBanner in App layout (AC: 5)
  - [ ] In `apps/reader/src/App.tsx`, render `<OfflineBanner />` above the route outlet
  - [ ] Should be visible on all screens including the reader

- [ ] Task 5: Write Playwright E2E test for offline reading (AC: 4)
  - [ ] Create or extend `apps/reader/e2e/offline.spec.ts`
  - [ ] Test flow:
    1. Navigate to a book reader page (use a mocked book ID from the mock server)
    2. Wait for content to fully load
    3. Call `await page.context().setOffline(true)` to simulate offline
    4. Reload the page
    5. Navigate to the same book
    6. Assert book content is rendered (check for reader content text)
    7. Assert no failed network requests (check console errors or use `page.on('requestfailed', ...)`)
  - [ ] Note: SW must be active for this test — in Playwright config, ensure `devOptions.enabled: true` for E2E environment OR run against production build (`pnpm build && pnpm preview`)
  - [ ] See `playwright.config.ts` for existing configuration patterns

- [ ] Task 6: Unit test useOnlineStatus (AC: 5)
  - [ ] Create `apps/reader/src/shared/hooks/useOnlineStatus.test.ts`
  - [ ] Mock `navigator.onLine` via `Object.defineProperty`
  - [ ] Test: fires 'offline' event → hook returns false
  - [ ] Test: fires 'online' event → hook returns true

## Dev Notes

### Critical Context

**vite.config.ts current state** (IMPORTANT — from code review):
- Current handler is `'CacheFirst'` for `/book-data/.*`
- This story changes it to `'NetworkFirst'` — understand the difference:
  - `CacheFirst`: serves from cache if available, network only on cache miss. Good for immutable assets, but doesn't auto-refresh stale cached book data.
  - `NetworkFirst`: tries network first with a timeout, falls back to cache if offline. Better for book data that might be updated by the crawler.
- With `networkTimeoutSeconds: 3`, offline fallback is fast — no 30-second timeout

**SW in dev mode**: `devOptions.enabled: false` in current vite.config.ts. This means the SW does NOT run during `devbox run dev`. The E2E test for offline must run against a production build.

**Playwright E2E offline testing patterns**:
```typescript
// apps/reader/e2e/offline.spec.ts
import { test, expect } from '@playwright/test'

test('serves cached book while offline', async ({ page, context }) => {
  // 1. Load book while online
  await page.goto('/read/some-book-id')
  await page.waitForSelector('[data-testid="reader-content"]') // or appropriate selector

  // 2. Go offline
  await context.setOffline(true)

  // 3. Reload and navigate back
  await page.reload()

  // 4. Assert content still renders
  await expect(page.locator('[data-testid="reader-content"]')).toBeVisible()
})
```

**Workbox NetworkFirst with generateSW**:
Workbox v7 is installed (`workbox-core: ^7.3.0`, `workbox-window: ^7.4.0`). The `VitePWA` plugin generates SW using Workbox via `strategies: 'generateSW'`. The `runtimeCaching` array in `workbox` config maps directly to Workbox's runtime caching setup. `NetworkFirst` is a valid Workbox strategy string.

**OfflineBanner styling** — use CSS custom properties already defined:
```tsx
<div
  className="fixed top-0 left-0 right-0 z-50 px-4 py-2 text-center text-sm"
  style={{
    backgroundColor: 'var(--color-border)',
    color: 'var(--color-text-muted)',
  }}
>
  Đang offline — đọc từ bộ nhớ đệm
</div>
```
Adjust z-index to be below the reader chrome (ChromelessLayout uses high z-index) — test visually.

**useOnlineStatus shape**:
```typescript
// apps/reader/src/shared/hooks/useOnlineStatus.ts
import { useState, useEffect } from 'react'

export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState(navigator.onLine)

  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  return isOnline
}
```

**AC 3 — already handled**: `ReaderErrorPage` already displays "Nội dung này chưa được tải về." for offline-not-cached books (implemented in Story 3.5). The `useBook` hook's TanStack Query error state already flows to `ReaderErrorPage`. This AC is covered — just verify the error message text is correct.

### Project Structure Notes

New files to create:
- `apps/reader/src/shared/hooks/useOnlineStatus.ts`
- `apps/reader/src/shared/hooks/useOnlineStatus.test.ts`
- `apps/reader/src/shared/components/OfflineBanner.tsx`
- `apps/reader/e2e/offline.spec.ts` (or extend existing reader.spec.ts)

Files to modify:
- `apps/reader/vite.config.ts` — change `CacheFirst` to `NetworkFirst` for book-data
- `apps/reader/src/App.tsx` — render `<OfflineBanner />`

### Architecture Compliance

- Single `useOnlineStatus` hook — not replicated per component (architecture rule)
- `OfflineBanner` goes in `shared/components/` — correct placement for truly shared UI
- No try/catch in components — SW handles network errors transparently; TanStack Query surfaces them via `error` state
- Theme consistency: use CSS custom properties for OfflineBanner, not hardcoded colors

### References

- [Source: _bmad-output/planning-artifacts/phase-2-reader-ui/epics-reader-ui.md#Story 4.3]
- [Source: _bmad-output/planning-artifacts/phase-2-reader-ui/architecture-reader-ui.md#Infrastructure and Deployment]
- [Source: _bmad-output/planning-artifacts/phase-2-reader-ui/architecture-reader-ui.md#Process Patterns - Offline Detection]
- [Source: apps/reader/vite.config.ts — current CacheFirst config (must be changed to NetworkFirst)]
- [Source: apps/reader/src/features/reader/ReaderErrorPage.tsx — already handles offline error message]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

### File List
