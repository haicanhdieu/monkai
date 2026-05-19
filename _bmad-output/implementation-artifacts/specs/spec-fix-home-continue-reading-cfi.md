---
title: 'Fix: home continue-reading card navigates to wrong page on iOS'
type: 'bugfix'
created: '2026-05-19'
status: 'done'
baseline_commit: '63f3a5e982f625d779a864e4093120413cf24329'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The "Tiếp tục đọc" card on the home page opens the reader at the wrong position on iOS with larger font sizes (e.g. 28px), because it navigates without a CFI in router state — unlike the bookmark page, which passes a `cfi` and triggers the RAF-deferred re-display in `ReaderEngine` that corrects iOS/WebKit column offsets after font-size is applied.

**Approach:** Add `lastReadCfi` to the reader store and thread it through `setLastRead` / `hydrateLastRead` / storage hydration; pass it in the home card's `state.cfi` so `ReaderEngine` takes the same `initialCfi` code path (with RAF fix) as the bookmark card.

## Boundaries & Constraints

**Always:**
- Pass `cfi` in Link `state` only when non-empty; spread `source` into state as before
- `lastReadCfi` must survive app reload — it is already stored in `STORAGE_KEYS.LAST_READ_POSITION.cfi` and read back by `useStorageHydration`
- New `cfi` param on `setLastRead` / `hydrateLastRead` must be optional (default `''`) so all existing call sites compile unchanged

**Ask First:** None

**Never:**
- Don't change `ReaderEngine`'s RAF resume logic or the `initialCfi` code path
- Don't change how `BookmarkCard` navigates
- Don't restructure the reader store beyond adding the single field

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| CFI present | `lastReadCfi` is a valid CFI string | Link passes `state.cfi`; ReaderEngine uses `initialCfi` path with RAF re-display | N/A |
| CFI empty (fresh install) | `lastReadCfi === ''` | `state.cfi` omitted; falls back to storage-read path — no regression | N/A |
| iOS 28px font | CFI passed via state | RAF deferred re-display corrects column offset; page matches bookmark page | N/A |

</frozen-after-approval>

## Code Map

- `apps/reader/src/stores/reader.store.ts` -- reader state; add `lastReadCfi` field; update `setLastRead`/`hydrateLastRead` signatures
- `apps/reader/src/features/reader/ReaderEngine.tsx` -- calls `setLastRead` in `handleRelocated`; extract CFI before that call and pass it as 8th arg
- `apps/reader/src/shared/hooks/useStorageHydration.ts` -- calls `hydrateLastRead`; pass `lastRead.cfi` as 8th arg
- `apps/reader/src/features/home/HomePage.tsx` -- `ContinueReadingCard` Link; read `lastReadCfi` from store, include in navigation state

## Tasks & Acceptance

**Execution:**
- [x] `apps/reader/src/stores/reader.store.ts` -- Add `lastReadCfi: string` to `ReaderState` interface and `initialState`; add `cfi = ''` as 8th optional param to both `setLastRead` and `hydrateLastRead`, setting `lastReadCfi` in each
- [x] `apps/reader/src/features/reader/ReaderEngine.tsx` -- In `handleRelocated`, move `const cfi = location?.start?.cfi` to before the `if (displayed && displayed.total > 0)` block; pass `typeof cfi === 'string' ? cfi : ''` as 8th arg to `setLastRead`
- [x] `apps/reader/src/shared/hooks/useStorageHydration.ts` -- Pass `lastRead.cfi` as 8th arg to `hydrateLastRead`
- [x] `apps/reader/src/features/home/HomePage.tsx` -- Destructure `lastReadCfi` from `useReaderStore()`; set Link `state` to `{ ...(lastReadCfi ? { cfi: lastReadCfi } : {}), ...(lastReadSourceId ? { source: lastReadSourceId } : {}) }`

**Acceptance Criteria:**
- Given the user has previously read a book, when they tap "Tiếp tục đọc" on the home page, then the reader opens at the exact same position as tapping that book in the bookmarks page
- Given font size is 28px on iOS, when tapping the home card, then the reader opens at the correct page (not the first page or a misaligned page)
- Given no previous reading session (`lastReadCfi` is empty), when the home card would show (it doesn't, since `hasLastRead` is false), then no regression in other navigation

## Spec Change Log

## Design Notes

The iOS bug arises because `useEpubReader` calls `display(initialCfi)` early (before font-size is applied), then `ReaderEngine` calls `requestAnimationFrame(() => rendition.display(initialCfi))` to re-measure after font-size fires. Without `initialCfi`, this RAF path is skipped and `display` is called synchronously inside a `.then()` — font-size may not have been applied yet in WebKit, so column widths are computed at the default size, producing wrong page numbers.

## Verification

**Commands:**
- `cd apps/reader && pnpm test` -- expected: all tests pass with no failures
- `cd apps/reader && pnpm lint` -- expected: zero warnings

## Suggested Review Order

**Entry point — home card navigation fix**

- Link state now spreads CFI + source; non-empty CFI check prevents stale pass-through
  [`HomePage.tsx:67`](../../../apps/reader/src/features/home/HomePage.tsx#L67)

- `lastReadCfi` destructured from store — new field exposed to UI layer
  [`HomePage.tsx:34`](../../../apps/reader/src/features/home/HomePage.tsx#L34)

**State management — CFI threading**

- `lastReadCfi` field added; conditional spread guards against overwriting valid CFI with empty string
  [`reader.store.ts:29`](../../../apps/reader/src/stores/reader.store.ts#L29)

- `setLastRead` conditional spread: only updates `lastReadCfi` when non-empty, preserving valid prior value
  [`reader.store.ts:97`](../../../apps/reader/src/stores/reader.store.ts#L97)

**CFI capture — ReaderEngine**

- CFI extracted before `setLastRead` call so it can be threaded into store on every relocated event
  [`ReaderEngine.tsx:180`](../../../apps/reader/src/features/reader/ReaderEngine.tsx#L180)

- `setLastRead` now passes CFI (8th arg); empty string fallback when cfi unavailable
  [`ReaderEngine.tsx:187`](../../../apps/reader/src/features/reader/ReaderEngine.tsx#L187)

**Persistence — storage hydration**

- CFI read back from storage on app reload; passed to `hydrateLastRead` so home card works after refresh
  [`useStorageHydration.ts:48`](../../../apps/reader/src/shared/hooks/useStorageHydration.ts#L48)
