# Story 4.1: StorageService Layer

Status: ready-for-dev

## Story

As a **developer**,
I want a `StorageService` abstraction over `localforage` with typed constants,
so that all persistence operations go through a single, swappable interface and no component ever touches storage APIs directly.

## Acceptance Criteria

1. **Given** `StorageService` interface in `shared/services/storage.service.ts` with `getItem<T>`, `setItem<T>`, `removeItem`
   **When** `LocalforageStorageService` implements this interface
   **Then** all methods delegate to `localforage` and resolve as Promises — no synchronous storage calls exist anywhere in the codebase

2. **Given** `shared/constants/storage.keys.ts` exporting `STORAGE_KEYS` object with `SCREAMING_SNAKE_CASE` constants: `LAST_READ_POSITION`, `USER_SETTINGS`, `BOOKMARKS`
   **When** any store or service reads or writes to storage
   **Then** it imports a key from `STORAGE_KEYS` — no string literals appear in storage calls

3. **Given** `shared/hooks/useStorageHydration.ts` called once in `App.tsx`
   **When** the app mounts
   **Then** it reads `LAST_READ_POSITION`, `USER_SETTINGS`, and `BOOKMARKS` from `StorageService` and dispatches each to the corresponding Zustand store's `hydrate()` action

4. **Given** `localforage` throws a `QuotaExceededError` during `setItem`
   **When** `LocalforageStorageService.setItem()` catches the error
   **Then** it logs the error to console and does not crash the app — the UI continues functioning with the in-memory Zustand state

5. **Given** a Vitest unit test mocking `StorageService`
   **When** `useStorageHydration` runs
   **Then** each store's `hydrate()` action is called with the correct persisted values

## Tasks / Subtasks

- [ ] Task 1: Install immer and create StorageService (AC: 1)
  - [ ] Run `pnpm add immer` in `apps/reader` (required for Zustand immer middleware in stores/*)
  - [ ] Create `apps/reader/src/shared/services/storage.service.ts` with `StorageService` interface and `LocalforageStorageService` class
  - [ ] Wrap all `localforage` calls in try/catch — QuotaExceededError must be caught, logged, not rethrown
  - [ ] Export a singleton: `export const storageService = new LocalforageStorageService()`

- [ ] Task 2: Create storage keys constants (AC: 2)
  - [ ] Create `apps/reader/src/shared/constants/storage.keys.ts`
  - [ ] Export `STORAGE_KEYS = { LAST_READ_POSITION: 'last_read_position', USER_SETTINGS: 'user_settings', BOOKMARKS: 'bookmarks' } as const`

- [ ] Task 3: Add `hydrate()` to reader.store (AC: 3)
  - [ ] Add `LastReadPosition` type: `{ bookId: string; page: number }`
  - [ ] Add `hydrate(data: LastReadPosition)` action to `useReaderStore` that sets `bookId` and `currentPage`
  - [ ] Keep all existing actions intact (setBookId, setPages, setCurrentPage, toggleChrome, dismissHint, reset)

- [ ] Task 4: Create bookmarks.store.ts (AC: 3)
  - [ ] Create `apps/reader/src/stores/bookmarks.store.ts`
  - [ ] Use Zustand with immer middleware (import from `zustand/middleware`)
  - [ ] State: `bookmarks: Bookmark[]` where `Bookmark = { bookId: string; bookTitle: string; page: number; timestamp: number }`
  - [ ] Actions: `upsertBookmark(bookmark: Bookmark)`, `hydrate(bookmarks: Bookmark[])`, `clear()`
  - [ ] `upsertBookmark` does an upsert by `bookId` (one bookmark per book, not append)

- [ ] Task 5: Create settings.store.ts (AC: 3)
  - [ ] Create `apps/reader/src/stores/settings.store.ts`
  - [ ] Use Zustand with immer middleware
  - [ ] State: `fontSize: number` (default 18), `theme: 'sepia' | 'light' | 'dark'` (default 'sepia')
  - [ ] Actions: `setFontSize(value: number)`, `setTheme(theme: ...)`, `hydrate(settings: UserSettings)`, `reset()`
  - [ ] Export `UserSettings` type: `{ fontSize: number; theme: 'sepia' | 'light' | 'dark' }`

- [ ] Task 6: Create useStorageHydration hook (AC: 3)
  - [ ] Create `apps/reader/src/shared/hooks/useStorageHydration.ts`
  - [ ] On mount (useEffect with empty deps), read all 3 keys from `storageService` in parallel (Promise.all or sequential)
  - [ ] Call `useReaderStore.getState().hydrate(...)` if LAST_READ_POSITION data exists
  - [ ] Call `useSettingsStore.getState().hydrate(...)` if USER_SETTINGS data exists
  - [ ] Call `useBookmarksStore.getState().hydrate(...)` if BOOKMARKS data exists
  - [ ] Null checks required — if key doesn't exist yet, skip hydration

- [ ] Task 7: Wire useStorageHydration in App.tsx (AC: 3)
  - [ ] Import and call `useStorageHydration()` at the top of `App.tsx`
  - [ ] Must be called before any route rendering so hydrated state is available immediately

- [ ] Task 8: Unit test useStorageHydration (AC: 5)
  - [ ] Create `apps/reader/src/shared/hooks/useStorageHydration.test.ts`
  - [ ] Mock `storageService` to return fixture data for each key
  - [ ] Assert that each store's `hydrate()` is called with the correct fixture data
  - [ ] Assert that null storage values → no hydrate() calls made

## Dev Notes

### Critical Context

**localforage is already installed** (`^1.10.0` in package.json) — do NOT install it again.

**immer is NOT installed yet** — `pnpm add immer` must be run as the first task. This is needed for `zustand/middleware/immer` used in `bookmarks.store.ts` and `settings.store.ts`. The existing `reader.store.ts` does NOT use immer and should remain unchanged (no immer migration needed for 4.1).

**Zustand version is v5** (`^5.0.11`) — Zustand v5 breaking changes:
- `create` is still the default export from `zustand`
- Middleware imports: `import { immer } from 'zustand/middleware/immer'`
- `devtools`, `persist` middleware also from `zustand/middleware`
- No `createWithEqualityFn` — use `useStore` with a selector instead
- Immer usage: `create(immer((set) => ({...})))` or `create<State>()(immer((set, get) => ({...})))`

### StorageService Interface (exact shape required)

```typescript
// apps/reader/src/shared/services/storage.service.ts
import localforage from 'localforage'

export interface StorageService {
  getItem<T>(key: string): Promise<T | null>
  setItem<T>(key: string, value: T): Promise<void>
  removeItem(key: string): Promise<void>
}

export class LocalforageStorageService implements StorageService {
  async getItem<T>(key: string): Promise<T | null> {
    return localforage.getItem<T>(key)
  }
  async setItem<T>(key: string, value: T): Promise<void> {
    try {
      await localforage.setItem(key, value)
    } catch (err) {
      console.error('[StorageService] setItem failed:', err)
      // Do NOT rethrow — UI must continue with in-memory state
    }
  }
  async removeItem(key: string): Promise<void> {
    await localforage.removeItem(key)
  }
}

export const storageService = new LocalforageStorageService()
```

### Storage Keys (exact shape required)

```typescript
// apps/reader/src/shared/constants/storage.keys.ts
export const STORAGE_KEYS = {
  LAST_READ_POSITION: 'last_read_position',
  USER_SETTINGS: 'user_settings',
  BOOKMARKS: 'bookmarks',
} as const
```

### Bookmarks Store Shape

```typescript
// apps/reader/src/stores/bookmarks.store.ts
import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'

export interface Bookmark {
  bookId: string
  bookTitle: string
  page: number
  timestamp: number
}

interface BookmarksState {
  bookmarks: Bookmark[]
  upsertBookmark: (bookmark: Bookmark) => void
  hydrate: (bookmarks: Bookmark[]) => void
  clear: () => void
}

export const useBookmarksStore = create<BookmarksState>()(
  immer((set) => ({
    bookmarks: [],
    upsertBookmark: (bookmark) =>
      set((state) => {
        const idx = state.bookmarks.findIndex((b) => b.bookId === bookmark.bookId)
        if (idx >= 0) {
          state.bookmarks[idx] = bookmark
        } else {
          state.bookmarks.push(bookmark)
        }
      }),
    hydrate: (bookmarks) =>
      set((state) => {
        state.bookmarks = bookmarks
      }),
    clear: () =>
      set((state) => {
        state.bookmarks = []
      }),
  }))
)
```

### Settings Store Shape

```typescript
// apps/reader/src/stores/settings.store.ts
import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'

export type ReadingTheme = 'sepia' | 'light' | 'dark'

export interface UserSettings {
  fontSize: number
  theme: ReadingTheme
}

interface SettingsState {
  fontSize: number
  theme: ReadingTheme
  setFontSize: (value: number) => void
  setTheme: (theme: ReadingTheme) => void
  hydrate: (settings: UserSettings) => void
  reset: () => void
}

const DEFAULT_SETTINGS: UserSettings = {
  fontSize: 18,
  theme: 'sepia',
}

export const useSettingsStore = create<SettingsState>()(
  immer((set) => ({
    ...DEFAULT_SETTINGS,
    setFontSize: (value) =>
      set((state) => {
        state.fontSize = value
      }),
    setTheme: (theme) =>
      set((state) => {
        state.theme = theme
      }),
    hydrate: (settings) =>
      set((state) => {
        state.fontSize = settings.fontSize
        state.theme = settings.theme
      }),
    reset: () =>
      set((state) => {
        state.fontSize = DEFAULT_SETTINGS.fontSize
        state.theme = DEFAULT_SETTINGS.theme
      }),
  }))
)
```

### reader.store.ts — hydrate() addition

Add these to the existing `reader.store.ts` — DO NOT change any existing actions:

```typescript
// Add to ReaderState interface:
hydrate: (data: { bookId: string; page: number }) => void

// Add to create() call:
hydrate: ({ bookId, page }) => set({ bookId, currentPage: page }),
```

### useStorageHydration Shape

```typescript
// apps/reader/src/shared/hooks/useStorageHydration.ts
import { useEffect } from 'react'
import { storageService } from '@/shared/services/storage.service'
import { STORAGE_KEYS } from '@/shared/constants/storage.keys'
import { useReaderStore } from '@/stores/reader.store'
import { useSettingsStore } from '@/stores/settings.store'
import { useBookmarksStore } from '@/stores/bookmarks.store'
import type { UserSettings, Bookmark } from '...'

export function useStorageHydration() {
  useEffect(() => {
    Promise.all([
      storageService.getItem<{ bookId: string; page: number }>(STORAGE_KEYS.LAST_READ_POSITION),
      storageService.getItem<UserSettings>(STORAGE_KEYS.USER_SETTINGS),
      storageService.getItem<Bookmark[]>(STORAGE_KEYS.BOOKMARKS),
    ]).then(([lastRead, settings, bookmarks]) => {
      if (lastRead) useReaderStore.getState().hydrate(lastRead)
      if (settings) useSettingsStore.getState().hydrate(settings)
      if (bookmarks) useBookmarksStore.getState().hydrate(bookmarks)
    })
  }, [])
}
```

### App.tsx Integration

Call `useStorageHydration()` inside `App` function component, before the routing JSX:

```typescript
import { useStorageHydration } from '@/shared/hooks/useStorageHydration'

export default function App() {
  useStorageHydration()
  // ... rest of App
}
```

### Project Structure Notes

New files to create:
- `apps/reader/src/shared/services/storage.service.ts`
- `apps/reader/src/shared/constants/storage.keys.ts`
- `apps/reader/src/shared/hooks/useStorageHydration.ts`
- `apps/reader/src/shared/hooks/useStorageHydration.test.ts`
- `apps/reader/src/stores/bookmarks.store.ts`
- `apps/reader/src/stores/settings.store.ts`

Files to modify:
- `apps/reader/src/stores/reader.store.ts` — add `hydrate()` action and type
- `apps/reader/src/App.tsx` — call `useStorageHydration()`
- `apps/reader/package.json` — add `immer`

Do NOT create barrel `index.ts` files in `shared/hooks/` or `shared/services/` — the architecture says barrel exports only at `features/*` and `shared/*` level.

### Architecture Compliance

- **StorageService is the ONLY storage access point** — no direct `localforage`, `localStorage`, or `indexedDB` calls anywhere except inside `LocalforageStorageService`
- **Storage keys must come from `STORAGE_KEYS`** — no string literals in storage calls
- **ESLint rule**: `no-restricted-imports` blocks direct `localStorage` and `indexedDB` usage (already in `.eslintrc.cjs`)
- **TypeScript strict mode**: all `getItem<T>` returns `T | null` — handle both cases
- **Zustand v5 note**: use `.getState()` to call actions outside React components (as in `useStorageHydration`)
- **Immer middleware**: only use for stores with nested state (bookmarks.store, settings.store) — reader.store is simple enough without it

### References

- [Source: _bmad-output/planning-artifacts/phase-2-reader-ui/epics-reader-ui.md#Story 4.1]
- [Source: _bmad-output/planning-artifacts/phase-2-reader-ui/architecture-reader-ui.md#Storage Abstraction]
- [Source: _bmad-output/planning-artifacts/phase-2-reader-ui/architecture-reader-ui.md#Naming Patterns]
- [Source: _bmad-output/planning-artifacts/phase-2-reader-ui/architecture-reader-ui.md#Zustand Hydration Pattern]
- [Source: _bmad-output/planning-artifacts/phase-2-reader-ui/architecture-reader-ui.md#Format Patterns - Zustand Store Structure]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

### File List
