# Story 2.1: Accept EPUB-direct book records in the schema

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a reader developer,
I want `book.schema.ts` to validate a book that carries an `epubUrl` and no chapters,
so that EPUB-direct (onedrive) records parse correctly while still rejecting records that can render via no path.

## Acceptance Criteria

1. **Given** the current `rawBookSchema` (`apps/reader/src/shared/schemas/book.schema.ts:14`) (AR6)
   **When** the schema is updated
   **Then** `chapters` becomes explicitly optional (`z.array(chapterSchema).optional().default([])`), an `epubUrl: z.string().optional()` field is added, and a `.refine` requires `epubUrl !== undefined OR (chapters?.length ?? 0) > 0`.

2. **Given** the updated schema
   **When** Vitest runs
   **Then** a record with `epubUrl` and no `chapters` parses successfully (FR7), and a record with neither `epubUrl` nor `chapters` fails the refine with a clear message.

3. **Given** `catalog.schema.ts` already has `epubUrl: z.string().optional()` (line 20)
   **When** this story is implemented
   **Then** `catalog.schema.ts` is **unchanged** — no duplicate work there.

4. **Given** the `bookSchema.transform` and the `Book` type
   **When** an epubUrl-only record is parsed
   **Then** `transform` still produces a valid `Book` (empty `content`/`chaptersForEpub` is acceptable for onedrive books); add `epubUrl` to the transformed output if/when ReaderPage needs it from the book record — but note ReaderPage today reads `epubUrl` from the **catalog** record, not the book record (see Dev Notes), so a `Book.epubUrl` field is optional for this story.

## Tasks / Subtasks

- [ ] **Task 1: Update `rawBookSchema`** (AC: #1)
  - [ ] Add `epubUrl: z.string().optional()`.
  - [ ] Change `chapters: z.array(chapterSchema).default([])` → `z.array(chapterSchema).optional().default([])`.
  - [ ] Add `.refine((b) => b.epubUrl !== undefined || (b.chapters?.length ?? 0) > 0, { message: 'book must have either epubUrl or chapters' })` to the object (before/around `.transform`).
- [ ] **Task 2: Confirm transform tolerates empty chapters** (AC: #4)
  - [ ] `normalizeParagraphs([])` → `[]` and `buildChaptersForEpub([])` → `[]` already hold; verify no runtime error when `raw.chapters` is `[]`.
  - [ ] Decide whether to surface `raw.epubUrl` on the transformed `Book` object. Only add it if a consumer needs it; otherwise leave `Book` unchanged to avoid touching `global.types.ts`. Document the decision.
- [ ] **Task 3: Tests (Vitest, colocated)** (AC: #2)
  - [ ] Add `apps/reader/src/shared/schemas/book.schema.test.ts` (or extend existing): record with `epubUrl` + no `chapters` → `safeParse` success; record with neither → failure; record with `chapters` + no `epubUrl` → success (regression for existing crawler books).
- [ ] **Task 4: Verify** (AC: all)
  - [ ] `pnpm test` (or `devbox run test`) green; `pnpm lint` / `eslint src --max-warnings 0` clean; `tsc` strict passes.

## Dev Notes

- **This is the ONLY reader schema change needed (AR6, Risk #2).** The architecture's "reality check" found `catalog.schema.ts:20` already has `epubUrl: z.string().optional()` and carries it to `CatalogBook` (line 51). Do **not** edit `catalog.schema.ts`. The real diff is on `book.schema.ts` only. [Source: architecture-onedrive-import.md#Where-schema-change-needed, apps/reader/src/shared/schemas/catalog.schema.ts]
- **Why the refine matters:** today `chapters` defaults to `[]`, so an onedrive book detail *technically* parses — but into a `Book` with empty content, which would render a blank reader if `epubUrl` were ever absent. The refine makes "renderable by *some* path" an enforced invariant, not an accident. [Source: architecture-onedrive-import.md#Where-schema-change-needed]
- **ReaderPage reads epubUrl from the CATALOG record, not the book record** (`ReaderPage.tsx:39`: `epubUrlFromCatalog = catalogBook?.epubUrl ?? null`). So this schema change is primarily a *correctness/validation* guard; the actual render wiring is Story 2.3. Adding `epubUrl` to the `Book` type is therefore optional here. [Source: apps/reader/src/features/reader/ReaderPage.tsx]
- **Exact current shape to edit** (`book.schema.ts:14-24`):
  ```ts
  const rawBookSchema = z.object({
    id, book_name, category_name, category_seo_name?, author?,
    cover_image_url?, cover_image_local_path?, source?,
    chapters: z.array(chapterSchema).default([]),   // ← becomes .optional().default([])
  })
  // ← add epubUrl + .refine
  ```
  [Source: apps/reader/src/shared/schemas/book.schema.ts]
- **Note on `bookSchema` typing:** it is declared `z.ZodType<Book>` over a `.transform`. Adding `.refine` before `.transform` is fine; keep the final exported type assignable to `Book`. If TS complains, refine on the object then transform. [Source: apps/reader/src/shared/schemas/book.schema.ts]
- **Testing conventions:** Vitest + Testing Library, colocated `*.test.ts`, zero ESLint warnings, strict TS (`verbatimModuleSyntax`, `noUnusedLocals`). [Source: project-context.md#Reader-specific, #Tests]

### Project Structure Notes

- Single-file change: `apps/reader/src/shared/schemas/book.schema.ts` + a colocated test. No catalog, no types, no service changes.
- First story of Epic 2; subsequent reader stories (2.2–2.4) build on this.

### References

- [Source: architecture-onedrive-import.md#Where-a-schema-change-IS-needed — proposed diff]
- [Source: architecture-onedrive-import.md#Risks item 2 — catalog already supports epubUrl]
- [Source: epics-onedrive-import.md#Story-2.1, AR6]
- [Source: apps/reader/src/shared/schemas/book.schema.ts, catalog.schema.ts]
- [Source: prd-onedrive-import.md#FR7]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
