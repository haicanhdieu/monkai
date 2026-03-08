# Story 5.3: Settings Page & Offline Storage Management

Status: done

## Story

As a **user**,
I want a dedicated settings screen where I can manage my reading preferences and see my offline storage usage,
so that I have full control over my reading experience and can free up device storage if needed.

## Acceptance Criteria

1. **Given** the user taps the "Cài Đặt" tab
   **When** `SettingsPage` renders
   **Then** it displays: font size slider (`<FontSizeControl>`), theme toggle (`<ThemeToggle>`), and an offline storage section (`<OfflineStorageInfo>`)

2. **Given** `<OfflineStorageInfo>`
   **When** rendered
   **Then** it shows the estimated storage used by the `book-data` cache (via `navigator.storage.estimate()`) and a "Xóa bộ nhớ đệm" button

3. **Given** the user taps "Xóa bộ nhớ đệm"
   **When** the action is confirmed
   **Then** the Workbox `book-data` cache is cleared, TanStack Query cache is invalidated, and `<OfflineStorageInfo>` updates to show 0 bytes used

4. **Given** `navigator.storage.estimate()` is unavailable (older browser)
   **When** `<OfflineStorageInfo>` renders
   **Then** it shows "Không thể đọc dung lượng bộ nhớ" gracefully — no crash, no unhandled promise rejection

5. **Given** `localforage` throws a `QuotaExceededError` during any storage write
   **When** the error is caught by `LocalforageStorageService`
   **Then** a subtle, themed in-place message appears in `<OfflineStorageInfo>`: "Bộ nhớ đầy — một số tùy chỉnh không được lưu" — the app continues functioning normally

## Tasks / Subtasks

- [x] Task 1: Implement `SettingsPage` with `FontSizeControl` and `ThemeToggle` (AC: 1)
  - [x] Replace placeholder in `apps/reader/src/features/settings/SettingsPage.tsx`
  - [x] Import `FontSizeControl` from `./FontSizeControl` and `ThemeToggle` from `./ThemeToggle` (created in Stories 5.1 and 5.2)
  - [x] Page structure: page title "Cài Đặt", separated sections for font size, theme, and offline storage
  - [x] Section dividers using `<hr>` or padding — no separate component needed
  - [x] Page title uses Lora font to match the reading experience aesthetic

- [x] Task 2: Create `OfflineStorageInfo` component (AC: 2, 3, 4, 5)
  - [x] Create `apps/reader/src/features/settings/OfflineStorageInfo.tsx`
  - [x] On mount, call `navigator.storage?.estimate()` — use optional chaining to guard against unavailability
  - [x] Display: "Đã dùng: {usedMB} MB" or "Không thể đọc dung lượng bộ nhớ" if API unavailable
  - [x] "Xóa bộ nhớ đệm" button — confirmation via `window.confirm()` (MVP — no custom dialog)
  - [x] On confirm: clear Workbox cache by name, invalidate TanStack Query cache, re-run `estimate()` to refresh display
  - [x] Local component state (`useState`) for: `usedBytes`, `isLoading`, `quotaError`, `cleared`
  - [x] `quotaError` message: "Bộ nhớ đầy — một số tùy chỉnh không được lưu" (shown when `StorageService` raises `QuotaExceededError`)

- [x] Task 3: Implement cache clearing logic (AC: 3)
  - [x] Use `caches.delete(cacheName)` from the Cache API to clear the Workbox book-data cache
  - [x] Workbox cache name: check `apps/reader/vite.config.ts` for the configured cache name (likely `'book-data'` or auto-generated `workbox-{hash}`) — use `caches.keys()` to find it if unsure
  - [x] After clearing: call `queryClient.clear()` to clear TanStack Query in-memory cache
  - [x] Access `queryClient` via `useQueryClient()` from `@tanstack/react-query`
  - [x] Re-run `navigator.storage.estimate()` to update the displayed size to ~0

- [x] Task 4: Handle `QuotaExceededError` in `LocalforageStorageService` (AC: 5)
  - [x] In `apps/reader/src/shared/services/storage.service.ts`, check if `setItem` already catches errors
  - [x] If not: wrap `localforage.setItem` in try/catch; on `QuotaExceededError` (check `err.name === 'QuotaExceededError'`), set a module-level reactive signal or use Zustand/event to notify `<OfflineStorageInfo>`
  - [x] Simplest MVP approach: export a `storageQuotaError` observable (a simple `EventEmitter`-like pattern or a Zustand slice) that `OfflineStorageInfo` subscribes to
  - [x] Alternative (simpler): `storageService` calls `console.warn` and `OfflineStorageInfo` just polls `navigator.storage.estimate()` — if quota is exceeded, the used/quota ratio will be near 100%
  - [x] Recommended MVP: add a `onQuotaExceeded` callback option to `storageService`, or expose a Zustand `appStore` with `quotaError` flag

- [x] Task 5: Write tests (AC: 1, 2, 4)
  - [x] Create `apps/reader/src/features/settings/OfflineStorageInfo.test.tsx`
  - [x] Test: renders storage estimate when `navigator.storage.estimate` is available
  - [x] Test: renders fallback message when `navigator.storage` is undefined
  - [x] Test: "Xóa bộ nhớ đệm" button triggers cache clearing and query invalidation
  - [x] Create or update `apps/reader/src/features/settings/SettingsPage.test.tsx`
  - [x] Test: renders `FontSizeControl`, `ThemeToggle`, and `OfflineStorageInfo`

## Dev Notes

### Critical Context

**Prerequisites — Stories 5.1 and 5.2 must be complete:**
- `FontSizeControl.tsx` created in 5.1
- `ThemeToggle.tsx` created in 5.2
- `settings.store.ts` updated with persistence in both `setFontSize` and `setTheme`
- `useTheme()` hook exists and is called in `AppShell`

**Current `SettingsPage.tsx` is a placeholder:**
```typescript
// CURRENT — replace entirely:
export default function SettingsPage() {
    return <div className="p-4">Cài Đặt (placeholder)</div>
}
```

**`SettingsPage` target structure:**
```tsx
// apps/reader/src/features/settings/SettingsPage.tsx
import { FontSizeControl } from './FontSizeControl'
import { ThemeToggle } from './ThemeToggle'
import { OfflineStorageInfo } from './OfflineStorageInfo'

export default function SettingsPage() {
  return (
    <div className="flex flex-col gap-8 p-6">
      <h1
        className="text-2xl font-semibold"
        style={{ fontFamily: 'Lora, serif', color: 'var(--color-text)' }}
      >
        Cài Đặt
      </h1>

      <section className="flex flex-col gap-4">
        <FontSizeControl />
      </section>

      <hr style={{ borderColor: 'var(--color-border)' }} />

      <section className="flex flex-col gap-4">
        <ThemeToggle />
      </section>

      <hr style={{ borderColor: 'var(--color-border)' }} />

      <section className="flex flex-col gap-4">
        <OfflineStorageInfo />
      </section>
    </div>
  )
}
```

**Storage estimate and cache clearing:**
```tsx
// Core logic in OfflineStorageInfo.tsx
import { useQueryClient } from '@tanstack/react-query'
import { useState, useEffect } from 'react'

export function OfflineStorageInfo() {
  const queryClient = useQueryClient()
  const [usedBytes, setUsedBytes] = useState<number | null>(null)
  const [available, setAvailable] = useState(true)
  const [clearing, setClearing] = useState(false)

  async function loadEstimate() {
    if (!navigator.storage?.estimate) {
      setAvailable(false)
      return
    }
    try {
      const { usage } = await navigator.storage.estimate()
      setUsedBytes(usage ?? 0)
    } catch {
      setAvailable(false)
    }
  }

  useEffect(() => { void loadEstimate() }, [])

  async function handleClearCache() {
    if (!window.confirm('Xóa toàn bộ bộ nhớ đệm offline?')) return
    setClearing(true)
    try {
      const keys = await caches.keys()
      await Promise.all(keys.map((key) => caches.delete(key)))
      queryClient.clear()
      await loadEstimate()
    } finally {
      setClearing(false)
    }
  }

  const usedMB = usedBytes !== null ? (usedBytes / (1024 * 1024)).toFixed(1) : null

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
        Lưu trữ ngoại tuyến
      </h2>
      {!available ? (
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
          Không thể đọc dung lượng bộ nhớ
        </p>
      ) : (
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
          Đã dùng: {usedMB !== null ? `${usedMB} MB` : '…'}
        </p>
      )}
      <button
        onClick={() => void handleClearCache()}
        disabled={clearing}
        className="self-start rounded-xl px-4 py-3 text-sm font-medium min-h-[44px]"
        style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text)' }}
      >
        {clearing ? 'Đang xóa…' : 'Xóa bộ nhớ đệm'}
      </button>
    </div>
  )
}
```

**Workbox cache names:**
Workbox auto-generates cache names based on the `cacheName` option in `vite.config.ts`. Check the `runtimeCaching` config for the exact name. Common patterns:
- `'book-data'` if explicitly named in the config
- `'{appName}-runtime'` or `'{appName}-precache'` for precache
Using `caches.keys()` then deleting all caches is the safest MVP approach — it clears everything (precache + runtime), which is acceptable since the SW will rebuild on next visit.

**`QuotaExceededError` handling — simplest viable approach:**
Check if `storage.service.ts` wraps `localforage.setItem` in try/catch. If it does not:
```typescript
// In LocalforageStorageService.setItem:
async setItem<T>(key: string, value: T): Promise<void> {
  try {
    await localforage.setItem(key, value)
  } catch (err) {
    if (err instanceof Error && err.name === 'QuotaExceededError') {
      console.warn('[StorageService] QuotaExceededError — storage full')
      // Emit event for OfflineStorageInfo to display message:
      window.dispatchEvent(new CustomEvent('storage-quota-exceeded'))
    }
    // Re-throw so callers can optionally handle
    throw err
  }
}
```
Then in `OfflineStorageInfo`:
```typescript
useEffect(() => {
  const handler = () => setQuotaError(true)
  window.addEventListener('storage-quota-exceeded', handler)
  return () => window.removeEventListener('storage-quota-exceeded', handler)
}, [])
```
Display `quotaError && <p>Bộ nhớ đầy — một số tùy chỉnh không được lưu</p>`.

**IMPORTANT — do NOT use `try/catch` inside React components:**
Per architecture rules, `try/catch` only in service layer. The `handleClearCache` function is an event handler, not a React render — `try/catch` inside async event handlers is acceptable. [Source: architecture-reader-ui.md#Process Patterns]

**`queryClient.clear()` vs `queryClient.invalidateQueries()`:**
- `queryClient.clear()` — removes ALL cached data from memory (book data, catalog, everything). Use this when clearing offline cache since all data needs to be re-fetched.
- `queryClient.invalidateQueries()` — marks as stale but keeps data in memory. Less aggressive.
- Use `queryClient.clear()` for the "clear cache" action since we're clearing the network cache too.

**Testing `navigator.storage`:**
In Vitest tests, `navigator.storage` may not be available by default. Mock it:
```typescript
vi.stubGlobal('navigator', {
  ...navigator,
  storage: {
    estimate: vi.fn().mockResolvedValue({ usage: 5000000, quota: 50000000 }),
  },
})
```

### Project Structure Notes

New files:
- `apps/reader/src/features/settings/OfflineStorageInfo.tsx`
- `apps/reader/src/features/settings/OfflineStorageInfo.test.tsx`
- `apps/reader/src/features/settings/SettingsPage.test.tsx`

Modified files:
- `apps/reader/src/features/settings/SettingsPage.tsx` — replace placeholder with full implementation
- `apps/reader/src/shared/services/storage.service.ts` — add `QuotaExceededError` handling (if not already present)

### Architecture Compliance

- Use `useQueryClient()` from `@tanstack/react-query` — NEVER import `queryClient` as a singleton from `main.tsx` [Source: architecture-reader-ui.md#Communication Patterns]
- `OfflineStorageInfo` is a settings-specific component — placed in `features/settings/` not `shared/components/`
- Cache clearing uses browser Cache API (`caches.keys()`, `caches.delete()`) — this is the correct API for Service Worker caches, not `localStorage`
- No `try/catch` in render — only in async event handlers and service layer [Source: architecture-reader-ui.md#Process Patterns]
- Use `var(--color-*)` CSS custom properties — never hardcoded colors
- Touch targets: minimum 44×44px (`min-h-[44px]`) on buttons [Source: architecture-reader-ui.md#NFR]
- `@/` absolute imports across feature boundaries [Source: architecture-reader-ui.md#Naming Patterns]
- `window.confirm()` for MVP confirmation — no custom Radix Dialog needed (keep it simple)

### References

- [Source: _bmad-output/planning-artifacts/phase-2-reader-ui/epics-reader-ui.md#Story 5.3]
- [Source: _bmad-output/planning-artifacts/phase-2-reader-ui/architecture-reader-ui.md#Storage Boundary]
- [Source: _bmad-output/planning-artifacts/phase-2-reader-ui/architecture-reader-ui.md#Process Patterns - Error Handling]
- [Source: _bmad-output/planning-artifacts/phase-2-reader-ui/architecture-reader-ui.md#NFR - Storage quota error]
- [Source: apps/reader/src/features/settings/SettingsPage.tsx — current placeholder]
- [Source: apps/reader/src/shared/services/storage.service.ts — LocalforageStorageService]
- [Source: apps/reader/vite.config.ts — Workbox cache configuration]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- Replaced `SettingsPage.tsx` placeholder with full implementation: Lora title, FontSizeControl, ThemeToggle, OfflineStorageInfo, separated by `<hr>` dividers with `var(--color-border)`
- Created `OfflineStorageInfo.tsx`: uses `navigator.storage?.estimate()` with optional chaining guard; `window.confirm()` for confirmation; clears all caches with `caches.keys()` + `caches.delete()`; calls `queryClient.clear()`; subscribes to `storage-quota-exceeded` CustomEvent to show quota error message
- Updated `storage.service.ts` `setItem`: on `QuotaExceededError`, dispatches `storage-quota-exceeded` CustomEvent and warns to console — does not rethrow
- 9 tests added (5 for OfflineStorageInfo, 4 for SettingsPage) — all passing; no regressions

### File List

- `apps/reader/src/features/settings/SettingsPage.tsx` (modified — full implementation)
- `apps/reader/src/features/settings/OfflineStorageInfo.tsx` (new)
- `apps/reader/src/features/settings/OfflineStorageInfo.test.tsx` (new)
- `apps/reader/src/features/settings/SettingsPage.test.tsx` (new)
- `apps/reader/src/shared/services/storage.service.ts` (modified — QuotaExceededError handling)
