---
title: 'Bookmark group expand/collapse with durable per-book state'
type: 'feature'
created: '2026-06-26'
status: 'done'
baseline_commit: '09bf1b1d8b8ac4e8ba83633335f6091c8c812342'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The Bookmarks page (`Đánh Dấu`) groups bookmarks by book, rendering every item under each book in a flat list. A book with many bookmarks produces a long, hard-to-scan page.

**Approach:** Make each book group collapsible. **Default = collapsed.** A collapsed group still shows the book cover/title (opens the book), source badge, a **count badge**, and a **last-read summary line** (`Đang đọc: «chapter» · N dấu khác`) so information scent is preserved. The user toggles a group open via a dedicated chevron button; the expand/collapse state is **persisted durably** (localforage, same layer as user settings) per book and **restored on revisit**. Collapse state hydrates in the same async load as bookmarks, so groups never render before their state is known (no flash-of-wrong-state).

**Default-state inversion (explicit):** Because default is collapsed, the persisted set stores the **expanded** bookIds (deviation-from-default). A bookId present in the set = user opened it; absent = collapsed. Bounds growth to user intent, not library size; a newly-bookmarked book is collapsed automatically with zero writes.

## Boundaries & Constraints

**Always:**
- Persist via `storageService` (localforage) under a new `STORAGE_KEYS.BOOKMARK_GROUP_STATE` — durable, mirrors how `USER_SETTINGS` / `BOOKMARKS` persist.
- Collapse state lives in a **new dedicated Zustand store** (`useBookmarkCollapseStore`) — NOT in `useBookmarksStore` (keep view-state separate from bookmark data).
- Hydrate collapse state inside the existing `useStorageHydration` `Promise.all`, alongside bookmarks, so both resolve together before groups render.
- **Reconcile-on-hydrate:** intersect the persisted expanded-set with the live bookmarked bookIds and write back the pruned result — prunes orphans (books whose bookmarks were all deleted).
- The chevron is a real `<button>` sibling of the existing header `<Link>` (two interactive elements in a flex row) with `aria-expanded` + `aria-controls`. Min 44×44px touch target.
- Default state = collapsed for any book not in the expanded-set.
- Collapsed groups show: count badge + `Đang đọc: «headerBookmark.chapterTitle» · N dấu khác` summary line.
- While a search query is active: **force-expand** any group containing a match and show only matching items; badge shows `matches/total`. This visual override must **not** be persisted to the store/localforage.
- Chevron rotates on toggle; respect `prefers-reduced-motion` (no animation when set).

**Ask First:**
- If extracting the group header into its own component (`BookmarkGroupHeader.tsx`) is needed for readability vs. inlining in `BookmarksPage.tsx`.

**Never:**
- Store collapse state in `useBookmarksStore` or in the persisted `BOOKMARKS` payload.
- Nest the chevron `<button>` inside the `<Link>` (invalid HTML) or rely on `stopPropagation`/`preventDefault` on the anchor.
- Persist search-driven force-expansion.
- Write collapse state on bookmark mutations (reconciliation happens on hydrate only, not in the delete path — keeps the dependency arrow one-way: view-state reads from data, never reverse).
- Make the whole header toggle collapse (cover/title keeps its current "open book" job).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Fresh page, no saved state | `expandedBookIds = []` | All groups render collapsed; each shows count + last-read summary line | N/A |
| User opens a group | tap chevron on book X | Group X expands (item list shown, summary line hidden); `X` added to expanded-set; persisted to localforage | If `setItem` throws QuotaExceeded, store update still applies (in-memory), persisted swallow per storage.service |
| Revisit after opening group X | saved `expandedBookIds = ['X']` | On mount, group X renders expanded, others collapsed — no flash (hydrated with bookmarks) | If load fails, fall back to all-collapsed default |
| Orphan prune | saved `['X','Y']`, but Y has no bookmarks anymore | After hydrate, store holds `['X']`; pruned `['X']` written back to localforage | N/A |
| Search active, match in collapsed group | query `"hoa"`, group X saved collapsed, has 1 match | Group X force-expanded showing only matching item; badge `1/12`; store unchanged (X still collapsed when query clears) | N/A |
| Clear search | query cleared after force-expand | Each group returns to its persisted state (X collapsed again) | N/A |
| Toggle a group while search active | user folds a noisy match group | Chevron still works on the visual layer; does not write search-state to store | N/A |
| Group with 1 bookmark | book has only the auto last-read item, collapsed | Summary line shows `Đang đọc: «chapter»` with no `· N dấu khác` suffix (N=0) | N/A |

</frozen-after-approval>

## Code Map

- `apps/reader/src/shared/constants/storage.keys.ts` — ADD `BOOKMARK_GROUP_STATE: 'bookmark_group_state'`
- `apps/reader/src/stores/bookmarkCollapse.store.ts` — NEW Zustand store: `expandedBookIds: string[]`, `isExpanded(bookId)`, `toggle(bookId)`, `hydrate(ids)`, `clear()`. Persists to localforage on `toggle`.
- `apps/reader/src/shared/hooks/useStorageHydration.ts` — load `BOOKMARK_GROUP_STATE`, reconcile against hydrated bookmark bookIds (prune orphans), write back pruned set, hydrate collapse store
- `apps/reader/src/features/bookmarks/BookmarksPage.tsx` — restructure group header (chevron button sibling of Link); compute effective-expanded per group (store state OR search-match override); gate `<ul>` render; render count badge + last-read summary line when collapsed; `matches/total` badge under search
- `apps/reader/src/stores/bookmarkCollapse.store.test.ts` — NEW store tests
- `apps/reader/src/features/bookmarks/BookmarksPage.test.tsx` — ADD collapse/toggle/aria/restore/search-override tests; existing header-navigation test must stay unchanged

## Tasks & Acceptance

**Execution:**
- [x] `apps/reader/src/shared/constants/storage.keys.ts` -- ADD `BOOKMARK_GROUP_STATE: 'bookmark_group_state'` to `STORAGE_KEYS`
- [x] `apps/reader/src/stores/bookmarkCollapse.store.ts` -- CREATE Zustand (immer) store. State: `expandedBookIds: string[]`. Actions: `isExpanded(bookId): boolean` (selector helper — presence in array), `toggle(bookId)` (add/remove + `void storageService.setItem(STORAGE_KEYS.BOOKMARK_GROUP_STATE, get().expandedBookIds)`), `hydrate(ids: string[])`, `clear()`. Default `[]` = all collapsed.
- [x] `apps/reader/src/shared/hooks/useStorageHydration.ts` -- ADD `storageService.getItem<string[]>(STORAGE_KEYS.BOOKMARK_GROUP_STATE)` to the `Promise.all`; in `.then`, after computing `validBookmarks`, build `liveIds = new Set(validBookmarks.map(b => b.bookId))`, prune saved ids to those in `liveIds`, call `useBookmarkCollapseStore.getState().hydrate(pruned)`, and if `pruned.length !== saved.length` write back via `storageService.setItem`
- [x] `apps/reader/src/features/bookmarks/BookmarksPage.tsx` -- MODIFY: (1) consume `useBookmarkCollapseStore`; (2) restructure each group `<section>` header: replace the single full-width `<Link>` with a flex row containing the existing `<Link data-testid="bookmark-group-header">` (cover+title+badge — KEEP testid) and a NEW trailing `<button data-testid="bookmark-group-toggle" aria-expanded={expanded} aria-controls={panelId}>` with a rotating chevron icon (44px target); (3) compute `expanded` per group = `searchActive ? groupHasMatch : isExpanded(bookId)`; (4) render the `<ul id={panelId}>` only when `expanded`; (5) when collapsed, render count badge + summary line `Đang đọc: {headerBookmark.chapterTitle} {N>0 ? `· ${N} dấu khác` : ''}`; (6) count badge shows `total` normally, `${matchCount}/${total}` when search active; (7) wire toggle button to `toggle(bookId)`; (8) `prefers-reduced-motion` guard on chevron transition (Tailwind `motion-reduce:transition-none`)
- [x] `apps/reader/src/stores/bookmarkCollapse.store.test.ts` -- CREATE tests: default empty/all-collapsed; `toggle` adds then removes; `toggle` persists via storageService mock; `hydrate` replaces set; `clear` empties
- [x] `apps/reader/src/features/bookmarks/BookmarksPage.test.tsx` -- ADD: groups render collapsed by default (item `<ul>` absent); collapsed group shows count badge + summary line; clicking `bookmark-group-toggle` expands (items appear) and flips `aria-expanded`; seeding store with an expanded bookId renders that group expanded on first render (no `await`/`findBy` — assert synchronously to catch flash); search query force-expands matching collapsed group and shows `matches/total` badge; existing "group header is a link…" navigation tests pass UNCHANGED. **FIX existing item-level tests broken by default-collapse:** the 6 non-search tests that assert on `bookmark-card`/`role="list"` (`BookmarkCard link navigates`, `items within a group are sorted…`, `manual bookmark renders before auto…`, both `…delete-btn` tests, `bookmark list uses divide-y…`) currently rely on the `<ul>` rendering by default — seed the collapse store as expanded for that bookId (preferred, synchronous) or click the toggle first. Do NOT relax the assertions; keep them asserting the same content once expanded.

**Acceptance Criteria:**
- Given a book with many bookmarks, when the Bookmarks page loads fresh, then the group is collapsed showing only cover/title, source badge, count badge, and a `Đang đọc: …` last-read line.
- Given the user taps the chevron on a collapsed group, when it expands, then the full bookmark item list is shown and `aria-expanded` is `true`.
- Given the user expanded group X and navigated away, when they return to the Bookmarks page (including after a full app reload), then group X is still expanded and others collapsed, with no visible flash of the wrong state.
- Given a book whose bookmarks were all deleted, when the page hydrates, then its stale id is pruned from the persisted expanded-set.
- Given a search query matching a bookmark inside a collapsed group, when results render, then that group is force-expanded showing only matching items with a `matches/total` count badge; when the query is cleared, the group returns to its persisted collapsed state.
- Given the chevron and the cover/title are separate controls, when the user taps the cover/title, then the book opens (navigation unchanged); when they tap the chevron, then only the collapse toggles.
- Given `prefers-reduced-motion`, when a group toggles, then the chevron/list change is instant (no animation).
- Existing `BookmarksPage.test.tsx` navigation test passes unchanged.

## Spec Change Log

## Design Notes

**Why a separate store + same-hydration trick.** Collapse is view-state, so it gets its own `bookmarkCollapse.store.ts` rather than polluting the persisted `BOOKMARKS` payload. The flash-of-wrong-state risk that normally comes with durable+async localforage is avoided because the bookmark groups themselves derive from `useBookmarksStore`, which only populates after the async hydrate. Loading collapse state in the **same `Promise.all`** means the expanded-set is known by the time any group can render — no render gate, no synchronous mirror needed.

**Deviation-from-default representation.** Default collapsed → persist the expanded bookIds. New books inherit collapsed with no write; the set grows only with deliberate user expansion.

**Reconcile-on-hydrate, not on mutation.** Orphan pruning runs once during hydration using the authoritative live bookId set, keeping the data→view dependency one-directional. The bookmark delete path is untouched.

**Search override is a pure render-time layer.** `expanded = searchActive ? groupHasMatch : isExpanded(bookId)` — the store is never written during search, so clearing the query restores remembered state.

**Zustand reactivity.** The component must subscribe to the raw `expandedBookIds` array (`useBookmarkCollapseStore((s) => s.expandedBookIds)`) and derive `expanded` from it — calling an `isExpanded(bookId)` action via `getState()` reads a snapshot and will NOT re-render on toggle. The `isExpanded`/`toggle` actions follow the existing `bookmarks.store` immer pattern (`create<…>()(immer((set, get) => …))`); `toggle` persists with `void storageService.setItem(STORAGE_KEYS.BOOKMARK_GROUP_STATE, get().expandedBookIds)` after mutating. Store tests mock `@/shared/services/storage.service` (see `useEpubFromBook` test pattern) and reset via `setState({ expandedBookIds: [] })` in `beforeEach`, mirroring `bookmarks.store.test.ts`.

## Verification

**Commands:**
- `cd apps/reader && pnpm test` -- expected: all tests pass, zero failures
- `cd apps/reader && pnpm lint` -- expected: exit 0, zero warnings

## Suggested Review Order

**Page wiring (entry point — read first to grasp design intent)**

- Effective-expanded = search-match OR persisted store state; pure render-time override.
  [`BookmarksPage.tsx:160`](../../apps/reader/src/features/bookmarks/BookmarksPage.tsx#L160)
- Subscribes to the raw `expandedBookIds` array (not `isExpanded` snapshot) for toggle reactivity.
  [`BookmarksPage.tsx:21`](../../apps/reader/src/features/bookmarks/BookmarksPage.tsx#L21)
- Chevron `<button>` is a sibling of the header `<Link>`; inert+no `aria-controls` during search.
  [`BookmarksPage.tsx:227`](../../apps/reader/src/features/bookmarks/BookmarksPage.tsx#L227)
- `<ul>` gated on expanded; collapsed shows count badge + last-read summary line.
  [`BookmarksPage.tsx:244`](../../apps/reader/src/features/bookmarks/BookmarksPage.tsx#L244)

**Durable store**

- `toggle` mutates the expanded-set and persists it to localforage.
  [`bookmarkCollapse.store.ts:23`](../../apps/reader/src/stores/bookmarkCollapse.store.ts#L23)
- Default `[]` = all collapsed (deviation-from-default representation).
  [`bookmarkCollapse.store.ts:21`](../../apps/reader/src/stores/bookmarkCollapse.store.ts#L21)

**Hydration + orphan prune**

- Loaded in the same `Promise.all` as bookmarks (no flash-of-wrong-state).
  [`useStorageHydration.ts:39`](../../apps/reader/src/shared/hooks/useStorageHydration.ts#L39)
- Array-guarded, pruned against live bookIds, written back only when changed.
  [`useStorageHydration.ts:74`](../../apps/reader/src/shared/hooks/useStorageHydration.ts#L74)

**Storage key**

- New durable key alongside `USER_SETTINGS` / `BOOKMARKS`.
  [`storage.keys.ts:8`](../../apps/reader/src/shared/constants/storage.keys.ts#L8)

**Tests (supporting)**

- Store unit tests (default/toggle/persist/hydrate/clear).
  [`bookmarkCollapse.store.test.ts:1`](../../apps/reader/src/stores/bookmarkCollapse.store.test.ts#L1)
- Page tests: default-collapsed, toggle/aria, synchronous first-render restore, search override+disabled, navigation unchanged.
  [`BookmarksPage.test.tsx:1`](../../apps/reader/src/features/bookmarks/BookmarksPage.test.tsx#L1)
- Hydration tests: orphan prune, no-write-when-unchanged, corrupted-value guard.
  [`useStorageHydration.test.ts:1`](../../apps/reader/src/shared/hooks/useStorageHydration.test.ts#L1)

## Mockup

Static HTML mockup (3 states: default-collapsed, one-expanded, search-active) produced during design — see session scratchpad `bookmark-collapse-mockup.html`. Recommend copying into `_bmad-output/implementation-artifacts/specs/` if a durable reference is wanted.
