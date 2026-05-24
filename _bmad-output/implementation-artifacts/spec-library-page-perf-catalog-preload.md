---
title: 'Library page perf: preload catalog from localforage on startup'
type: 'feature'
created: '2026-05-24'
status: 'done'
baseline_commit: 'da50be9ee6da5b64ea3a867e9645362a1e704e10'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Clicking the Library button takes 2–4 s before content appears because the catalog fetch (large vnthuquan `index.json`) starts only when `LibraryPage` renders, and React Query's memory cache is empty after each page refresh.

**Approach:** On app startup, read the cached catalog from localforage and seed the React Query cache; immediately invalidate so that when `LibraryPage` mounts it renders the stale data instantly while a background network refresh is in flight. For cold starts (no localforage cache), the existing skeleton loading state shows correctly.

## Boundaries & Constraints

**Always:**
- Use `storageService` from `@/shared/services/storage.service` — no direct localforage access.
- Use `catalogCacheKey(source)` from `@/shared/constants/storage.keys` for the localforage key.
- Use `queryKeys.catalog(source)` from `@/shared/constants/query.keys` for the React Query key.
- Validation: the stored value is already a validated `CatalogIndex` (set by `StaticJsonDataService.getCatalog`). Accept it if `Array.isArray(value.books)`.
- Storage errors must be caught and silently swallowed — preload failure must never crash the app.
- Skip seeding if `queryClient.getQueryData(queryKeys.catalog(source))` is already set (network beat us).

**Ask First:**
- If the preload hook causes `isLoading` to always be `false` but `isFetching: true`, and you want to add a fetching indicator to `LibraryPage` — ask before adding UI.

**Never:**
- Do not remove or change the existing `isLoading` skeleton in `LibraryPage`.
- Do not change `staleTime` or `gcTime` on the global `QueryClient`.
- Do not change `StaticJsonDataService.getCatalog` fetch logic.
- Do not preload both sources speculatively — only the active source.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Localforage has cached catalog | `storageService.getItem(catalogCacheKey(source))` returns `CatalogIndex` | RQ cache seeded → Library renders data immediately; query invalidated → background network refresh starts when LibraryPage mounts | — |
| Localforage empty | `getItem` returns `null` | Nothing set in RQ cache; Library shows skeleton while network fetch runs | — |
| Network beat localforage | `queryClient.getQueryData(...)` non-null before preload sets data | Skip `setQueryData` — do not overwrite fresh data | — |
| Storage read throws | `getItem` rejects | Catch, do nothing — degrade to normal skeleton load | Swallow error silently |
| Active source changes | User switches source pill | Hook effect re-runs for new source; seeds if cache available | Same as above |

</frozen-after-approval>

## Code Map

- `apps/reader/src/shared/hooks/useCatalogPreload.ts` -- **new** hook: reads localforage → seeds RQ cache → invalidates
- `apps/reader/src/App.tsx` (AppShell) -- call site: add `useCatalogPreload()` next to `useCatalogSync()`
- `apps/reader/src/shared/hooks/useCatalogIndex.ts` -- no change needed (hook reads from seeded cache automatically)
- `apps/reader/src/features/library/LibraryPage.tsx` -- no change needed (existing `isLoading` skeleton handles cold start)
- `apps/reader/src/shared/constants/storage.keys.ts` -- `catalogCacheKey(source)` — key used by preload
- `apps/reader/src/shared/constants/query.keys.ts` -- `queryKeys.catalog(source)` — RQ key used by preload
- `apps/reader/src/shared/services/storage.service.ts` -- `storageService` (via default export)
- `apps/reader/src/shared/stores/useActiveSource.ts` -- `useActiveSource()` — supplies `activeSource` to hook

## Tasks & Acceptance

**Execution:**
- [x] `apps/reader/src/shared/hooks/useCatalogPreload.ts` -- create hook: `useEffect([activeSource])` → `storageService.getItem(catalogCacheKey(activeSource))` → if `Array.isArray(cached?.books)` AND `queryClient.getQueryData(queryKeys.catalog(activeSource))` is nullish → `queryClient.setQueryData(queryKeys.catalog(activeSource), cached)` then `queryClient.invalidateQueries({ queryKey: queryKeys.catalog(activeSource) })` → catch and swallow errors
- [x] `apps/reader/src/App.tsx` -- add `useCatalogPreload()` call in `AppShell`, alongside `useCatalogSync()`
- [x] `apps/reader/src/shared/hooks/useCatalogPreload.test.ts` -- test: (a) seeds cache when localforage has data and RQ is empty, (b) skips when RQ already has data, (c) swallows storage errors, (d) re-seeds on source change

**Acceptance Criteria:**
- Given localforage has a cached catalog for the active source, when the app loads and user navigates to Library, then `LibraryPage` renders categories immediately without showing the skeleton loading state.
- Given localforage is empty (first launch), when user navigates to Library, then the existing skeleton loading state appears and data renders after the network fetch completes.
- Given the app is running and the preload hook throws a storage error, then the app continues to function normally (Library shows skeleton, no crash, no console error).
- Given the active source is changed by the user, when navigating to Library, then the preload runs for the new source and the same instant-or-skeleton behavior applies.

## Design Notes

**Why invalidate after seeding?**
`staleTime: Infinity` means TanStack Query never auto-marks data as stale. Calling `invalidateQueries` after `setQueryData` sets `isInvalidated: true` on the query — which forces a refetch when an observer subscribes, regardless of staleTime. This gives stale-while-revalidate: instant render from cache + silent background refresh.

**Why not `initialData` in `useCatalogIndex`?**
`initialData` must be synchronous; localforage is async. Seeding in a startup hook is the correct pattern.

## Verification

**Commands:**
- `cd apps/reader && pnpm test -- useCatalogPreload` -- expected: all tests pass
- `cd apps/reader && pnpm test` -- expected: all tests pass (no regressions)
- `cd apps/reader && pnpm lint` -- expected: zero warnings

**Manual checks (if no CLI):**
- Navigate to Library after first load (localforage empty): skeleton must appear, then categories render.
- Refresh the page, then navigate to Library: categories must appear immediately with no skeleton flash (localforage was populated on first load).
- Open DevTools Network tab; on second load the `index.json` request should still fire (background refresh), but the Library page should render before it completes.

## Suggested Review Order

**Core preload logic**

- Entry point: async IIFE reads storage, guards against RQ hit, seeds + invalidates
  [`useCatalogPreload.ts:14`](../../apps/reader/src/shared/hooks/useCatalogPreload.ts#L14)

- Guard prevents overwrite when network beat localforage; `await` ensures rejection is caught
  [`useCatalogPreload.ts:18`](../../apps/reader/src/shared/hooks/useCatalogPreload.ts#L18)

**Call site integration**

- Single-line hookup in AppShell alongside `useCatalogSync`
  [`App.tsx:23`](../../apps/reader/src/App.tsx#L23)

**Tests**

- Happy path: seeds cache and fires invalidation when localforage has data
  [`useCatalogPreload.test.ts:35`](../../apps/reader/src/shared/hooks/useCatalogPreload.test.ts#L35)

- Skip guard and error swallowing; source-change re-seed
  [`useCatalogPreload.test.ts:57`](../../apps/reader/src/shared/hooks/useCatalogPreload.test.ts#L57)

## Spec Change Log
