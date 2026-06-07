# Story 2.2: Register onedrive as a source mapped to Sách Truyện

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a reader,
I want imported books pulled in under the existing Sách Truyện category with no new category or visible source,
so that the library grows while my mental model stays exactly two categories.

## Acceptance Criteria

1. **Given** the reader fetches per-source `/book-data/{source}/index.json` (`data.service.ts` `getCatalog`) (AR7)
   **When** `onedrive` is registered as a fetchable data source
   **Then** the reader fetches `/book-data/onedrive/index.json` and **merges** its books into the **Sách Truyện** user bucket (the same bucket currently fed by `vnthuquan`) (FR1).

2. **Given** the two-category invariant (FR2)
   **When** the source selector / category list renders
   **Then** exactly **two** user-facing buckets remain — **Kinh Phật** and **Sách Truyện** — with **no** third pill/category for `onedrive`
   **And** the `onedrive` tag never appears as a user-facing source label or filter anywhere (FR3)
   **And** the Sách Truyện view shows the **union** of vnthuquan + onedrive categories (including the 4 new category names from Story 1.5).

3. **Given** the merged bucket
   **When** catalog data loads
   **Then** category counts in Sách Truyện reflect vnthuquan + onedrive combined, and books from both data sources coexist in one catalog list.

## Tasks / Subtasks

- [x] **Task 1: Introduce the bucket ↔ data-source distinction** (AC: #1, #2)
  - [ ] **Critical:** today `SOURCES` (`apps/reader/src/shared/constants/sources.ts`) is 1:1 with user-facing pills (`SourceSelectorPill` maps over `SOURCES`; `useActiveSource` validates against `SOURCES` ids). Naively appending `onedrive` to `SOURCES` would create a **third pill** and break FR2.
  - [x] Keep `SOURCES` = the two **user buckets** (`vbeta`, `vnthuquan`) unchanged. Add a separate concept: a mapping from user bucket → list of **data sources** to fetch. E.g. `BUCKET_DATA_SOURCES: Record<SourceId, string[]> = { vbeta: ['vbeta'], vnthuquan: ['vnthuquan', 'onedrive'] }`.
  - [x] Add `'onedrive'` to the fetchable-source string union/type used by `getCatalog` (a `DataSourceId` distinct from the user-facing `SourceId`), so types stay honest without exposing `onedrive` to the UI.
- [x] **Task 2: Fetch + merge in the data/catalog layer** (AC: #1, #3)
  - [x] Update `useCatalogIndex(source)` (or `data.service.getCatalog`) so that when the user bucket is `vnthuquan`, it fetches both `vnthuquan` and `onedrive` per-source indexes and merges their `books[]` into one `CatalogIndex` (rebuild `categories` via the existing `buildCategories` over the merged list).
  - [x] Preserve the existing caching/promise-dedup behaviour in `StaticJsonDataService` (`catalogPromises` map is keyed per data source — fetch each source once, merge results).
  - [x] Handle partial failure gracefully: if `onedrive/index.json` 404s or fails, still render vnthuquan (onedrive is additive, never a hard dependency). Log/swallow the onedrive miss; do not blank the bucket.
- [x] **Task 3: Keep query keys / invalidation consistent** (AC: #1)
  - [x] `query.keys.ts` `catalog(source)` and `useCatalogSync`'s `invalidateQueries({ queryKey: ['catalog'] })` should still cover the merged bucket. If merging happens inside `getCatalog`, the existing `['catalog', source]` key still works. Verify book lookups (`getBook`) resolve onedrive ids — `getBook` searches the catalog by id, so a merged catalog makes onedrive books findable.
- [x] **Task 4: book detail resolution for onedrive ids** (AC: #1)
  - [x] `getBook(id, source)` finds the entry in the catalog then fetches a JSON artifact. **Onedrive books have no JSON artifact** (no `artifacts` with `format: 'json'`) — they render from `epubUrl`. Story 2.3 owns the render path, but ensure `getBook`/the route doesn't hard-fail for an onedrive id that lacks a json artifact. Coordinate the exact handling with Story 2.3 (the catalog `epubUrl` is what's used; a full book-detail fetch may be skippable for onedrive). Document the decision.
- [x] **Task 5: Tests** (AC: #1, #2, #3)
  - [x] `SOURCES` still has exactly 2 entries (guard test for FR2).
  - [x] `getCatalog('vnthuquan')` merges vnthuquan + onedrive books and rebuilds categories (mock fetch returning two indexes).
  - [x] onedrive `index.json` fetch failure → vnthuquan still returned.
  - [x] no UI surface renders the string `onedrive` (FR3) — assert source pills/labels derive only from `SOURCES`.
  - [x] `pnpm test` green; `pnpm lint` clean; strict `tsc` passes.

## Dev Notes

- **THE key architectural risk in Epic 2 (verified in code):** `SOURCES` is consumed as the user-facing pill list in `SourceSelectorPill.tsx` (`SOURCES.map(...)`), `CategoryPage.tsx`, `LibraryPage.tsx`, `BookmarksPage.tsx`, `SutraListCard.tsx`, and validated in `useActiveSource.ts`. It is BOTH the data-source list AND the UI category list today. Phase 5 must split these concepts: **2 user buckets, but `vnthuquan` is backed by 2 data sources (vnthuquan + onedrive).** Do not just append to `SOURCES`. [Source: apps/reader/src/shared/constants/sources.ts + grep of SOURCES usages]
- **AR7 confirms the mapping intent:** "register `onedrive` as a source and map it to the **Sách Truyện** user bucket (same bucket as `vnthuquan`), so the category browser shows the union." [Source: architecture-onedrive-import.md#Index-placement, epics-onedrive-import.md#AR7]
- **`getCatalog` shape (verified):** `StaticJsonDataService.getCatalog(source)` fetches `/book-data/${source}/index.json`, validates with `catalogSchema`, caches via `catalogPromises` + `storage`. Merging is cleanest *inside* this method (or a wrapper) so callers stay unchanged. `catalogSchema` already accepts `epubUrl` and `source` per book. [Source: apps/reader/src/shared/services/data.service.ts]
- **`buildCategories` already unions by `categorySlug`** and sorts by Vietnamese locale — feed it the merged book list and it produces the union of categories (incl. the 4 new ones) for free. [Source: apps/reader/src/shared/schemas/catalog.schema.ts]
- **`SourceSelectorPill` only shows a pill when there are ≥2 sources** — keep it driven by `SOURCES` (2 entries) so it keeps showing exactly Kinh Phật / Sách & Truyện. [Source: apps/reader/src/features/library/SourceSelectorPill.tsx]
- **`SutraListCard` looks up `SOURCES.find(s => s.id === book.source)` to render a source badge.** An onedrive book's `source` is `'onedrive'`, which won't be in `SOURCES` → `.find` returns undefined → no badge. Verify this degrades gracefully (no badge, no crash) so FR3/FR4 (indistinguishable, no source label) hold. This is actually the desired behaviour — confirm with a test. [Source: apps/reader/src/features/library/SutraListCard.tsx:13]
- **Two-category invariant is a measurable success criterion** ("Reader category count remains exactly 2"). Add a guard test. [Source: prd-onedrive-import.md#Measurable-Outcomes, #FR2]
- **Reader-side change is the ONLY reader task for surfacing (per architecture);** verify `data.service.ts` + `useCatalogSync` as the touch points. [Source: architecture-onedrive-import.md#Index-placement]

### Project Structure Notes

- Touches: `sources.ts` (add data-source mapping, NOT a new pill), `data.service.ts` (merge), possibly `useCatalogIndex.ts` / `query.keys.ts` (types). Adds colocated tests.
- Do NOT modify `SOURCES` array length or `SourceSelectorPill` rendering logic.
- Depends on Story 2.1 (schema) and Epic 1 (served `onedrive/index.json`). Pairs tightly with Story 2.3.

### References

- [Source: architecture-onedrive-import.md#Index-placement (Risk #3 resolution)]
- [Source: epics-onedrive-import.md#Story-2.2, AR7]
- [Source: prd-onedrive-import.md#FR1, FR2, FR3]
- [Source: apps/reader/src/shared/constants/sources.ts]
- [Source: apps/reader/src/shared/services/data.service.ts]
- [Source: apps/reader/src/shared/schemas/catalog.schema.ts — buildCategories]
- [Source: apps/reader/src/features/library/SourceSelectorPill.tsx, SutraListCard.tsx]

## Dev Agent Record

### Agent Model Used
claude-sonnet-4-6

### Debug Log References
None

### Completion Notes List
- Added `DataSourceId = SourceId | 'onedrive'` and `BUCKET_DATA_SOURCES` to `sources.ts`. `SOURCES` array unchanged (still 2 entries).
- Exported `buildCategories` from `catalog.schema.ts` so `data.service.ts` can rebuild categories after merge.
- `getCatalog` now uses `BUCKET_DATA_SOURCES` to decide which data sources to fetch. Single-source (vbeta) path unchanged. Multi-source (vnthuquan) uses `Promise.allSettled` — primary source failure throws, supplemental (onedrive) failure is swallowed with a `console.warn`.
- `getBook` returns minimal `Book` (empty content, source=SourceId bucket) for onedrive books that have `epubUrl` but no JSON artifact. This is cached to storage like regular books.
- Caching: `catalogCacheKey('vnthuquan')` stores the merged+resolved index. Offline fallback unchanged.
- Decision for Task 4: `getBook` for onedrive returns a minimal Book so ReaderPage gets a valid `book` object for title/source. The epub itself renders via `epubUrlFromCatalog` (Story 2.3). `book.source = 'vnthuquan'` (the SourceId bucket), ensuring `catalogSource` in ReaderPage resolves to the merged catalog.

### File List
- apps/reader/src/shared/constants/sources.ts (modified — added DataSourceId, BUCKET_DATA_SOURCES)
- apps/reader/src/shared/schemas/catalog.schema.ts (modified — exported buildCategories)
- apps/reader/src/shared/services/data.service.ts (modified — getCatalog merge, getBook onedrive, resolveEpubUrl)
- apps/reader/src/shared/services/data.service.test.ts (modified — added merge + getBook tests)

### Change Log
- 2026-06-07: Implemented Story 2.2 — onedrive source registration and catalog merge
