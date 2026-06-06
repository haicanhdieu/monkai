# Story 2.4: Search imported books by title and author

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a reader,
I want to find imported books by title and author within Sách Truyện,
so that I can discover the newly added titles even though full-text body search is not available for them.

## Acceptance Criteria

1. **Given** imported `onedrive` catalog metadata merged into the Sách Truyện bucket (Story 2.2)
   **When** the MiniSearch index is built
   **Then** imported books are indexed and findable by **title** AND **author** queries within Sách Truyện (FR25)
   **And** because the merged catalog (Story 2.2) feeds `useLibrarySearch`, onedrive books are already in the `documents` set — the change required is making **author searchable**.

2. **Given** the current `useLibrarySearch` MiniSearch config indexes `fields: ['title', 'category', 'subcategory']` (author/translator is only a `storeField`, NOT searchable)
   **When** the config is updated
   **Then** `translator` (the author field on `CatalogBook`) is added to MiniSearch `fields` so author queries return matches — for **both** onedrive and existing vnthuquan books (FR25).

3. **Given** the raw-epub serving model
   **When** a user runs a body/full-text query
   **Then** imported epub **bodies** are not covered — documented limitation, not a defect; metadata (title/author/category) search still returns the book (FR26, NFR5).

## Tasks / Subtasks

- [ ] **Task 1: Make author searchable** (AC: #1, #2)
  - [ ] In `apps/reader/src/features/library/useLibrarySearch.ts`, add `'translator'` to the MiniSearch `fields` array (currently `['title', 'category', 'subcategory']`). `translator` is already a `storeField` and is the author on `CatalogBook` (`catalog.schema.ts` maps `author` → `translator`).
  - [ ] Verify `toSearchDocuments` (`library.utils.ts`) includes `translator` in each `SearchDocument`; if not, add it so it's indexable. Check `SearchDocument` type in `library.types.ts`.
  - [ ] Keep the `processTerm` diacritic-stripping (so "nguyen du" matches "Nguyễn Du").
- [ ] **Task 2: Confirm onedrive books flow into search** (AC: #1)
  - [ ] `useLibrarySearch(books)` receives the bucket's `CatalogBook[]`. With Story 2.2's merge, the Sách Truyện bucket already contains onedrive books → they're indexed automatically. Add a test with a mixed list to prove an onedrive book is found by title and by author.
- [ ] **Task 3: Document the body-search limitation** (AC: #3)
  - [ ] No code for body search. Ensure no UI copy implies full-text search of imported books. (Optional: a note in code comments referencing FR26.)
- [ ] **Task 4: Tests** (AC: all)
  - [ ] author query returns a book whose only match is the author/translator field (proves AC #2) — regression-covers vnthuquan books too.
  - [ ] an onedrive book (source `'onedrive'`) in the merged list is returned by both a title query and an author query.
  - [ ] diacritic-insensitive author query works.
  - [ ] `pnpm test` green; `pnpm lint` clean; strict `tsc`.

## Dev Notes

- **Real gap found in code (disaster-prevention):** FR25 requires title AND author search, but `useLibrarySearch` currently indexes `fields: ['title', 'category', 'subcategory']` — **author/translator is NOT a searchable field**, only a `storeField`. Without this story's change, author search returns nothing for *any* source, onedrive or vnthuquan. The fix is adding `'translator'` to `fields`. [Source: apps/reader/src/features/library/useLibrarySearch.ts]
- **Field naming:** the catalog transform maps manifest/crawler `author` → `CatalogBook.translator` (`catalog.schema.ts` `toCatalogBook`). So the searchable field is `translator`, not `author`, on the reader side. [Source: apps/reader/src/shared/schemas/catalog.schema.ts]
- **Onedrive books need no special search wiring** beyond Story 2.2's merge — once they're in the bucket's `CatalogBook[]`, `toSearchDocuments` + MiniSearch index them. This story is mostly a one-line `fields` fix + tests. [Source: apps/reader/src/features/library/useLibrarySearch.ts]
- **Body search is intentionally out of scope (AD-1 consequence):** raw epub is served without a JSON body index, so MiniSearch indexes catalog metadata only. This is a documented limitation (FR26/NFR5), revisitable via a future spine-text sidecar without changing the render path. [Source: architecture-onedrive-import.md#AD-1, #Risks item 1, prd-onedrive-import.md#FR26]
- **Diacritic handling already correct:** `processTerm: stripVietnamese(term.toLowerCase())` is applied at both index and query time, and `prefix: true` + `boost: { title: 3 }`. Adding `translator` to `fields` inherits all of this. [Source: apps/reader/src/features/library/useLibrarySearch.ts]
- **Search placeholder copy** for Sách Truyện comes from `SOURCES` (`searchPlaceholder: 'Tìm kiếm sách & truyện...'`) — unchanged; no onedrive-specific copy. [Source: apps/reader/src/shared/constants/sources.ts]

### Project Structure Notes

- Touches: `useLibrarySearch.ts` (add `'translator'` to `fields`), possibly `library.utils.ts` / `library.types.ts` (ensure `translator` in `SearchDocument`), + colocated tests.
- Depends on Story 2.2 (merged bucket). Last story of Epic 2 — completes the user-visible outcome: browse + read + search imported books, two categories, no visible source.

### References

- [Source: apps/reader/src/features/library/useLibrarySearch.ts — fields config]
- [Source: apps/reader/src/shared/schemas/catalog.schema.ts — author→translator mapping]
- [Source: epics-onedrive-import.md#Story-2.4]
- [Source: prd-onedrive-import.md#FR25, FR26, NFR5]
- [Source: architecture-onedrive-import.md#AD-1, #Risks item 1]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
