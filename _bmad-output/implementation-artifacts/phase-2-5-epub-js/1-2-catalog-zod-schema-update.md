# Story 1.2: Catalog Zod Schema Update

Status: done

## Story

As a developer,
I want the catalog item Zod schema to include an optional `epubUrl` field,
so that TypeScript enforces the correct shape when the build script patches `index.json` and when the reader reads EPUB URLs.

## Acceptance Criteria

1. **Given** `src/shared/schemas/catalog.schema.ts` is updated
   **When** the TypeScript compiler runs
   **Then** `rawCatalogBookSchema` includes `epubUrl: z.string().optional()` and the inferred output type exposes `epubUrl?: string` on `CatalogBook`
   **And** existing catalog items without `epubUrl` continue to parse without errors (field is optional)

2. **Given** a catalog item with `epubUrl` set
   **When** `DataService` fetches the catalog and `useCatalogIndex` returns results
   **Then** `epubUrl` is accessible on each `CatalogBook` object in the returned data
   **And** no existing catalog-consuming components (`LibrarySearchHub`, `CategoryPage`, `BookmarksPage`, home page continue reading) require changes

3. **Given** `src/shared/types/global.types.ts` is updated
   **When** TypeScript compiles
   **Then** `CatalogBook` interface has `epubUrl?: string` as an optional field

## Tasks / Subtasks

- [x] Add `epubUrl?: string` to `CatalogBook` in `src/shared/types/global.types.ts` (AC: 3)
- [x] Add `epubUrl: z.string().optional()` to `rawCatalogBookSchema` in `src/shared/schemas/catalog.schema.ts` (AC: 1)
- [x] Update `toCatalogBook` mapping function to include `epubUrl` (AC: 2)
  - [x] Map `raw.epubUrl` to the output `CatalogBook`
- [x] Run `pnpm typecheck` to confirm no type errors (AC: 1, 2, 3)
- [x] Run `pnpm test` to confirm no regressions in `catalog.schema.test.ts` (if it exists) and `data.service.test.ts` (AC: 2)

## Dev Notes

### Codebase Context

**Files to modify:**

**`src/shared/types/global.types.ts`** — Add to `CatalogBook` interface:
```typescript
export interface CatalogBook {
  id: string
  title: string
  category: string
  categorySlug: string
  subcategory: string
  translator: string
  coverImageUrl: string | null
  artifacts: CatalogArtifact[]
  epubUrl?: string  // ← ADD THIS
}
```

**`src/shared/schemas/catalog.schema.ts`** — Current `rawCatalogBookSchema`:
```typescript
const rawCatalogBookSchema = z.object({
  id: z.string(),
  book_name: z.string(),
  book_seo_name: z.string().optional(),
  author: z.string().nullable().optional(),
  category_name: z.string(),
  category_seo_name: z.string().optional(),
  cover_image_url: z.string().nullable().optional(),
  artifacts: z.array(catalogArtifactSchema).optional(),
})
```

Add `epubUrl: z.string().optional()` to this schema.

Current `toCatalogBook` function:
```typescript
function toCatalogBook(raw: z.infer<typeof rawCatalogBookSchema>): CatalogBook {
  return {
    id: raw.id,
    title: raw.book_name,
    category: raw.category_name,
    categorySlug: raw.category_seo_name ?? slugify(raw.category_name),
    subcategory: raw.book_seo_name ?? 'General',
    translator: raw.author ?? 'Unknown translator',
    coverImageUrl: raw.cover_image_url ?? null,
    artifacts: (raw.artifacts ?? []).map((a) => ({
      format: a.format,
      path: a.path,
    })),
  }
}
```

Add `epubUrl: raw.epubUrl` to the return object.

### Impact Analysis

- `DataService.fetchCatalog()` returns `CatalogIndex` which has `books: CatalogBook[]` — no change needed
- `useCatalogIndex()` returns TanStack Query result of `CatalogIndex` — no change needed
- Components reading `CatalogBook` properties: `LibrarySearchHub`, `CategoryPage`, `BookCard`, home `ContinueReading` — none currently read `epubUrl`, so no changes needed
- `ReaderPage.tsx` will read `epubUrl` in Story 2.2 — not yet in this story

### Downstream consumers to be aware of (NOT changing in this story):

- `ReaderPage.tsx` — will use `epubUrl` in Story 2.2
- `useCatalogIndex` + `DataService` — read-through, no changes

### Project Structure Notes

- 2 files modified: `src/shared/types/global.types.ts` and `src/shared/schemas/catalog.schema.ts`
- No new files
- Maintain the existing `catalogSchema` transform chain; do not restructure

### Testing Standards

- Run `pnpm typecheck` and `pnpm test` after changes
- Check `src/shared/services/data.service.test.ts` still passes — it likely uses mock catalog data
- If `book.schema.test.ts` exists, verify no breakage (different schema, but related)

### References

- Architecture decision: [Source: architecture-reader-ui-epubjs.md#Data Architecture — Catalog schema update]
- Epics AC: [Source: epics-reader-ui-epubjs.md#Story 1.2 Acceptance Criteria]
- Current schema code: [Source: apps/reader/src/shared/schemas/catalog.schema.ts]
- Current type definitions: [Source: apps/reader/src/shared/types/global.types.ts]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- Added `epubUrl?: string` to `CatalogBook` interface in `global.types.ts`
- Added `epubUrl: z.string().optional()` to `rawCatalogBookSchema` in `catalog.schema.ts`
- Added `epubUrl: raw.epubUrl` to `toCatalogBook` return object
- `pnpm typecheck` passes with zero errors
- No regressions in catalog/data service tests (one pre-existing test failure in `ReaderEngine.test.tsx` is unrelated — will be addressed in Story 3-1)

### File List

- apps/reader/src/shared/types/global.types.ts (modified)
- apps/reader/src/shared/schemas/catalog.schema.ts (modified)
