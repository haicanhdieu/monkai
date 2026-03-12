# Story 3.1: reader.store Migration to CFI-Based Progress

Status: done

## Story

As a developer,
I want `reader.store` to track reading position as a CFI string instead of a page number,
so that the store's shape matches epub.js's location model and TypeScript enforces the migration everywhere.

## Acceptance Criteria

1. **Given** `reader.store.ts` is updated
   **When** the TypeScript compiler runs
   **Then** the store interface is exactly:
   ```typescript
   interface ReaderState {
     currentCfi: string | null
     isChromeVisible: boolean
     setCurrentCfi: (cfi: string) => void
     toggleChrome: () => void
     reset: () => void
   }
   ```
   **And** `currentPage`, `setCurrentPage`, `pages[]`, `pageBoundaries`, `lastReadTotalPages`, `setPages`, `setPageBoundaries`, `bookId`, `setBookId`, `bookTitle`, `setBookTitle`, `hasSeenHint`, `dismissHint`, `hydrate`, and `LastReadPosition` type no longer exist — any remaining references are compile errors

2. **Given** `storage.keys.ts` comment is updated to document the `LAST_READ_POSITION` value shape
   **When** a developer reads the file
   **Then** a JSDoc or inline comment on `LAST_READ_POSITION` states the value shape is `{ bookId: string, cfi: string }`

3. **Given** `useStorageHydration.ts` is updated
   **When** the app initialises and a saved `LAST_READ_POSITION` is found in storage
   **Then** `readerStore.setCurrentCfi(savedPosition.cfi)` is called with the stored CFI value
   **And** items with the old `page` shape (no `cfi` field) are gracefully ignored (no crash on stale data)

## Tasks / Subtasks

- [x] Rewrite `src/stores/reader.store.ts` with the new minimal interface (AC: 1)
  - [x] Remove: `bookId`, `bookTitle`, `pages`, `pageBoundaries`, `currentPage`, `lastReadTotalPages`, `hasSeenHint`
  - [x] Remove: `setBookId`, `setBookTitle`, `setPages`, `setPageBoundaries`, `setCurrentPage`, `dismissHint`, `hydrate`
  - [x] Remove: `LastReadPosition` export (type and interface)
  - [x] Add: `currentCfi: string | null` (initial: `null`)
  - [x] Add: `setCurrentCfi: (cfi: string) => void`
  - [x] Keep: `isChromeVisible: boolean` (initial: `true`), `toggleChrome()`, `reset()`
  - [x] `reset()` sets `currentCfi` to `null`, `isChromeVisible` to `true`
- [x] Add JSDoc comment to `LAST_READ_POSITION` in `src/shared/constants/storage.keys.ts` (AC: 2)
- [x] Update `src/shared/hooks/useStorageHydration.ts` (AC: 3)
  - [x] Remove import of `LastReadPosition` type from `reader.store`
  - [x] Define inline type for the new storage shape: `{ bookId: string; cfi: string }`
  - [x] Read `LAST_READ_POSITION` as `{ bookId?: string; cfi?: string }` (permissive read to handle stale data)
  - [x] If `cfi` field is present and non-empty, call `readerStore.setCurrentCfi(saved.cfi)`
  - [x] If `cfi` field is absent/null (old `page`-based shape), skip without error
- [x] Fix TypeScript errors in `ReaderPage.tsx` and `ReaderEngine.tsx` caused by removed store fields (AC: 1)
  - [x] `ReaderPage.tsx` — removed store interaction, added TODO stub comments
  - [x] `ReaderEngine.tsx` — `currentPage` is now local useState(0), `bookId` stubbed with ''
  - [x] `ChromelessLayout.tsx` — `hasSeenHint`/`dismissHint` moved to local state; `currentPage`/`pages` stubbed
  - [x] **Approach:** Replaced broken references with minimal stubs; full rewrite of ReaderPage/ReaderEngine/ChromelessLayout in Stories 2.2/2.3
- [x] Run `pnpm typecheck` — zero errors (AC: 1)
- [x] Run `pnpm test` — 180 passing, 12 skipped (TODOs for Story 2.2 rewrite), 25 test files pass

## Dev Notes

### Codebase Context

**CRITICAL ORDERING NOTE:** This story **must be implemented before Stories 2.1/2.2**, even though it is in Epic 3. The `useEpubReader` hook (Story 2.1) and `ReaderEngine` rewrite (Story 2.2) depend on `readerStore.setCurrentCfi()` existing. If you implement in epic order (1→2→3), implement 3.1 as the first story of your work session before 2.1.

**Current `reader.store.ts` full interface (to be replaced):**
```typescript
export interface LastReadPosition {
  bookId: string
  page: number
  totalPages?: number
}

interface ReaderState {
  bookId: string
  bookTitle: string
  pages: string[][]
  pageBoundaries: number[]
  currentPage: number
  lastReadTotalPages: number
  isChromeVisible: boolean
  hasSeenHint: boolean
  setBookId: (id: string) => void
  setBookTitle: (title: string) => void
  setPages: (pages: string[][]) => void
  setPageBoundaries: (boundaries: number[]) => void
  setCurrentPage: (page: number) => void
  toggleChrome: () => void
  dismissHint: () => void
  hydrate: (data: LastReadPosition) => void
  reset: () => void
}
```

**New `reader.store.ts` interface (authoritative):**
```typescript
interface ReaderState {
  currentCfi: string | null
  isChromeVisible: boolean
  setCurrentCfi: (cfi: string) => void
  toggleChrome: () => void
  reset: () => void
}

const initialState = {
  currentCfi: null as string | null,
  isChromeVisible: true,
}

export const useReaderStore = create<ReaderState>((set) => ({
  ...initialState,
  setCurrentCfi: (currentCfi) => set({ currentCfi }),
  toggleChrome: () => set((state) => ({ isChromeVisible: !state.isChromeVisible })),
  reset: () => set(initialState),
}))
```

**`useStorageHydration.ts` changes:**
- Remove: `import type { LastReadPosition } from '@/stores/reader.store'`
- Read `LAST_READ_POSITION` with type `{ bookId?: string; cfi?: string } | null`
- Only call `setCurrentCfi` if `saved.cfi` is a non-empty string
- The `bookId` in `LAST_READ_POSITION` is still useful for `ReaderPage` to resume the correct book — but `ReaderPage` will read it directly from storage in Story 3.2, not via the store

**`ReaderPage.tsx` current broken imports after store migration:**
```typescript
const { setBookId, setBookTitle, setPages, setPageBoundaries, setCurrentPage } = useReaderStore()
```
These will be compile errors. Remove them (or replace with `const { } = useReaderStore()` no-op) and add a `// TODO: epub.js rewrite in Story 2.2` comment. The page will temporarily lose its pagination sync functionality but will not crash.

**`ReaderEngine.tsx` current broken destructuring:**
```typescript
const { bookId, currentPage, setPages, setCurrentPage, setPageBoundaries } = useReaderStore()
```
Same approach — remove and stub with TODO comment.

**`bookmarks.store.ts`** — Currently `upsertBookmark({ bookId, bookTitle, page, timestamp })` is called from `ReaderEngine`. After removing `ReaderEngine`'s pagination logic, bookmarks save will be wired in Story 3.2. For now, the bookmark logic in `ReaderEngine` just disappears with the rest of the old navigation code.

**`useStorageHydration.test.ts`** — This test imports `LastReadPosition` from `reader.store`. Update it to use the new inline type.

**Storage.keys.ts** — Add comment:
```typescript
export const STORAGE_KEYS = {
  /** Value shape: { bookId: string, cfi: string } — epub.js CFI string for current location */
  LAST_READ_POSITION: 'last_read_position',
  USER_SETTINGS: 'user_settings',
  BOOKMARKS: 'bookmarks',
} as const
```

### Project Structure Notes

- Modified files: `src/stores/reader.store.ts`, `src/shared/hooks/useStorageHydration.ts`, `src/shared/hooks/useStorageHydration.test.ts`, `src/shared/constants/storage.keys.ts`, `src/features/reader/ReaderPage.tsx` (stub cleanup), `src/features/reader/ReaderEngine.tsx` (stub cleanup)
- No new files

### Testing Standards

- `pnpm typecheck` must pass with zero errors
- `useStorageHydration.test.ts` must be updated to reflect the new store shape
- `ReaderEngine.test.tsx` tests for the old pagination logic will break — either skip them with `test.skip` and a `// TODO: rewrite in Story 2.2` comment, or delete them (they will be rewritten in Story 2.2)

### References

- Architecture decision: [Source: architecture-reader-ui-epubjs.md#Data Architecture — CFI-based Progress Persistence]
- Store shape: [Source: architecture-reader-ui-epubjs.md#Format Patterns]
- Storage value shape: [Source: architecture-reader-ui-epubjs.md#Format Patterns]
- Current reader.store: [Source: apps/reader/src/stores/reader.store.ts]
- Current useStorageHydration: [Source: apps/reader/src/shared/hooks/useStorageHydration.ts]
- Epics AC: [Source: epics-reader-ui-epubjs.md#Story 3.1 Acceptance Criteria]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- Rewrote `reader.store.ts`: new minimal interface with `currentCfi`, `isChromeVisible`, `setCurrentCfi`, `toggleChrome`, `reset`; removed all pagination/bookmark/hint state
- Added JSDoc to `LAST_READ_POSITION` in `storage.keys.ts` documenting `{ bookId: string, cfi: string }` shape
- Updated `useStorageHydration.ts`: reads new `{ bookId?, cfi? }` shape, calls `setCurrentCfi(saved.cfi)` when cfi present, ignores old page-based entries
- Updated `useStorageHydration.test.ts`: new tests for CFI shape, old-shape graceful ignore, UUID/SEO-slug filtering
- Updated `ReaderPage.tsx`: removed all broken store destructuring; TODO stubs for Story 2.2
- Updated `ReaderEngine.tsx`: `currentPage` is local useState(0); `bookId` stubbed with ''; navigation uses local state; `persistPageChange` stubs to empty CFI; TODO comments throughout
- Updated `ChromelessLayout.tsx`: `hasSeenHint`/`dismissHint` moved to local useState; `currentPage`/`pages` stubbed as 0/[] with TODOs
- Updated 3 test files: `ReaderEngine.test.tsx`, `ReaderPage.test.tsx`, `ChromelessLayout.test.tsx` — navigation/store-dependent tests skipped with TODO Story 2.2 markers; DOM/render/chrome tests still pass
- Final: 25 test files pass, 180 tests pass, 12 skipped, 0 typecheck errors
- **Code review fix (2026-03-12):** `persistPageChange` changed to no-op (was writing `{ bookId:'', cfi:'' }` to storage, corrupting valid saved LAST_READ_POSITION); removed now-unused `storageService`/`STORAGE_KEYS` imports from `ReaderEngine.tsx`

### File List

- apps/reader/src/stores/reader.store.ts (modified — full rewrite)
- apps/reader/src/shared/constants/storage.keys.ts (modified)
- apps/reader/src/shared/hooks/useStorageHydration.ts (modified)
- apps/reader/src/shared/hooks/useStorageHydration.test.ts (modified)
- apps/reader/src/features/reader/ReaderPage.tsx (modified)
- apps/reader/src/features/reader/ReaderEngine.tsx (modified)
- apps/reader/src/features/reader/ReaderEngine.test.tsx (modified)
- apps/reader/src/features/reader/ReaderPage.test.tsx (modified)
- apps/reader/src/features/reader/ChromelessLayout.tsx (modified)
- apps/reader/src/features/reader/ChromelessLayout.test.tsx (modified)
- apps/reader/src/features/reader/useDOMPagination.ts (modified — overlong paragraph splitting fix bundled with this sprint)
- apps/reader/src/lib/pagination/paginateBook.ts (modified — overlong paragraph splitting fix bundled with this sprint)
- apps/reader/src/lib/pagination/paginateBook.test.ts (modified — overlong paragraph splitting fix bundled with this sprint)
- apps/reader/e2e/reader-layout.spec.ts (modified — overflow and overlong paragraph E2E tests bundled with this sprint)
- _bmad-output/implementation-artifacts/tech-spec-sticky-appbar-main-screens.md (deleted — moved to phase-2-reader-ui/ subfolder)
