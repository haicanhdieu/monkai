---
title: 'Library search state restore on back navigation'
type: 'feature'
created: '2026-06-08'
status: 'done'
baseline_commit: '996b403722232972e438f3da156587d6f91a5acc'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** When a user searches in the library, opens a book, then presses back, the library remounts and loses the search query and scroll position — forcing the user to re-enter their search and find their place again.

**Approach:** Persist library search query and scroll position in a lightweight Zustand store. On LibraryPage mount, restore both. On unmount, save scroll. On explicit clear/source-change, wipe the store.

## Boundaries & Constraints

**Always:**
- Store only via `storageService` / Zustand — never `localStorage`/`indexedDB` directly.
- Scroll is saved on LibraryPage unmount (not on every scroll event).
- Restore scroll with `requestAnimationFrame` to fire after virtual list renders.
- `initialQuery` also initializes `debouncedQuery` so results are available immediately (no 250ms delay).
- Clearing the search bar or changing the source resets the nav store.

**Ask First:**
- If scroll restoration causes visible layout jank or flicker in testing, ask whether a fade/delay is preferred.

**Never:**
- Persist the store to `localforage`/`StorageService` — this is in-memory session state only.
- Change the URL / use `useSearchParams` — query stays out of the URL.
- Touch `ChromelessLayout`, `SearchResultCard` link behavior, or `useEpubReader`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Back from book after search | `savedQuery = "Địa Tạng"`, `savedScrollTop = 420` | Library shows search results for "Địa Tạng", scroll restored to ~420px | If main element absent, skip scroll silently |
| First visit / no saved state | `savedQuery = ""`, `savedScrollTop = 0` | Normal library load, category grid, no search bar prefilled | N/A |
| Source changed then back | User changed source → `store.clear()` called | Library shows new source catalog, search bar empty | N/A |
| Catalog still loading on restore | `savedQuery` non-empty but `catalogQuery.isLoading = true` | Skeleton shown; scroll restored only after results render | N/A |
| Empty results for saved query | `results.length === 0` on restore | Search bar shows query, "no results" message shown; no scroll restore | N/A |

</frozen-after-approval>

## Code Map

- `apps/reader/src/stores/libraryNav.store.ts` — NEW: in-memory Zustand store `{ savedQuery, savedScrollTop, setSavedQuery, setSavedScrollTop, clear }`
- `apps/reader/src/features/library/useLibrarySearch.ts` — add optional `initialQuery?: string`; init both `query` and `debouncedQuery` states from it
- `apps/reader/src/features/library/LibraryPage.tsx` — consume nav store; init `searchEnabled` and `initialQuery`; unmount-save scroll; mount-restore scroll
- `apps/reader/src/features/library/useLibrarySearch.test.ts` — add `initialQuery` tests

## Tasks & Acceptance

**Execution:**
- [x] `apps/reader/src/stores/libraryNav.store.ts` -- CREATE Zustand store with `savedQuery: string`, `savedScrollTop: number`, `setSavedQuery(q: string)`, `setSavedScrollTop(n: number)`, `clear()` -- in-memory only, no persistence
- [x] `apps/reader/src/features/library/useLibrarySearch.ts` -- ADD optional second param `initialQuery = ''`; change `useState('')` to `useState(initialQuery)` for both `query` and `debouncedQuery` -- eliminates 250ms delay on restore
- [x] `apps/reader/src/features/library/LibraryPage.tsx` -- MODIFY: (1) import `useLibraryNavStore`; (2) derive `searchEnabled` initial value from `savedQuery.length > 0`; (3) pass `savedQuery` as `initialQuery` to `useLibrarySearch`; (4) wrap `setQuery` to also call `setSavedQuery`; (5) wrap `clearQuery` to also call `store.clear()`; (6) save scroll on unmount via `useEffect` cleanup; (7) restore scroll once via `useEffect` watching `normalizedQuery`, `results.length`, `savedScrollTop` + `useRef` guard; (8) pass wrapped handlers to all `LibrarySearchBar` and `SourceSelectorPill` usages
- [x] `apps/reader/src/features/library/useLibrarySearch.test.ts` -- ADD tests: `initialQuery` results available immediately without `advanceTimersByTime`; `initialQuery` is reflected in `query` and `normalizedQuery`

**Acceptance Criteria:**
- Given user has searched "Địa Tạng" and opened a book, when they press back, then the search bar shows "Địa Tạng" and the search results list is visible without re-typing.
- Given the list was scrolled to ~420px before navigation, when the user returns, then the scroll position is approximately restored (within one virtual-item height).
- Given user clears the search bar, when they navigate to a book and return, then the library shows the category grid (not search results).
- Given user changes the source via `SourceSelectorPill`, when they later navigate and return, then the search bar is empty and the nav store is cleared.
- Given catalog data is cached (TanStack Query `staleTime: Infinity`), when user returns, then search results appear without a skeleton loading flash.
- Existing `LibraryPage.test.tsx` suite passes unchanged (store initializes with `savedQuery = ''` so `searchEnabled` defaults to `false`, same as before).

## Spec Change Log

## Design Notes

Scroll restore uses a `useRef` guard (`scrollRestoredRef`) to fire exactly once — when `results.length` first becomes > 0 with a non-empty `normalizedQuery` and a positive `savedScrollTop`. This avoids double-scroll if results re-render (e.g. debounce fires again).

`getMain` helper (`() => document.querySelector('main') as HTMLElement | null`) is inlined in `LibraryPage.tsx` — same pattern as in `SearchResults.tsx`.

Zustand store is in-memory only (no `persist` middleware) — state lives for the browser session and resets on reload, which is the correct behavior for ephemeral navigation state.

## Verification

**Commands:**
- `cd apps/reader && pnpm test` -- expected: all tests pass, zero failures
- `cd apps/reader && pnpm lint` -- expected: exit 0, zero warnings

## Suggested Review Order

**State shape — new in-memory store**

- Single source of truth for query + scroll; no persistence middleware by design.
  [`libraryNav.store.ts:1`](../../apps/reader/src/stores/libraryNav.store.ts#L1)

**Hook change — instant restore without debounce lag**

- Both `query` and `debouncedQuery` seeded from `initialQuery` so results are immediate.
  [`useLibrarySearch.ts:24`](../../apps/reader/src/features/library/useLibrarySearch.ts#L24)

**Page wiring — store consumption and searchEnabled init**

- `searchEnabled` derived lazily from `savedQuery`; avoids eager MiniSearch index on fresh mount.
  [`LibraryPage.tsx:27`](../../apps/reader/src/features/library/LibraryPage.tsx#L27)

- Wrapped handlers keep `query` state and Zustand store in sync on every keystroke / clear.
  [`LibraryPage.tsx:37`](../../apps/reader/src/features/library/LibraryPage.tsx#L37)

**Scroll save / restore logic**

- Save: cleanup effect captures `main.scrollTop` at unmount, the only write site for savedScrollTop.
  [`LibraryPage.tsx:45`](../../apps/reader/src/features/library/LibraryPage.tsx#L45)

- Restore: `useRef` guard fires exactly once after `results.length > 0` in the same render that `normalizedQuery` is truthy.
  [`LibraryPage.tsx:51`](../../apps/reader/src/features/library/LibraryPage.tsx#L51)

**Tests**

- Three cases: immediate `query`/`normalizedQuery` reflect initialQuery; results present without timer advance; empty initialQuery → no results.
  [`useLibrarySearch.test.ts:93`](../../apps/reader/src/features/library/useLibrarySearch.test.ts#L93)
