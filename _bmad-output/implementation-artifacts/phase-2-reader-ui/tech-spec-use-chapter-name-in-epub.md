---
title: 'Use chapter_name from JSON in EPUB generation'
slug: 'use-chapter-name-in-epub'
created: '2026-03-27'
status: 'completed'
stepsCompleted: [1, 2, 3, 4]
tech_stack: ['TypeScript', 'Zod', 'JSZip 3.x', 'Node.js ESM', 'Vitest 4.x']
files_to_modify:
  - 'apps/reader/src/shared/schemas/book.schema.ts'
  - 'apps/reader/src/shared/lib/bookToEpub.ts'
  - 'apps/reader/scripts/build-epubs.mjs'
  - 'apps/reader/src/shared/constants/storage.keys.ts'
  - 'apps/reader/src/shared/schemas/book.schema.test.ts'
  - 'apps/reader/src/shared/lib/bookToEpub.test.ts'
code_patterns: ['chapter_name fallback to Chương N', 'EPUB_BLOB_CACHE_PREFIX bump on EPUB logic change']
test_patterns: ['vitest colocated *.test.ts', 'Given/When/Then ACs']
---

# Tech-Spec: Use chapter_name from JSON in EPUB generation

**Created:** 2026-03-27

## Overview

### Problem Statement

The raw book JSON contains a `chapter_name` field on each chapter object (e.g. `"Vào Rừng Thiền"`), but both the runtime EPUB builder (`bookToEpub.ts`) and the build-time script (`build-epubs.mjs`) ignore it. Instead, they generate synthetic chapter titles like `"BookTitle – Chương 1"`. The EPUB's `<h1>`, `<title>`, and TOC nav entries therefore show generic numbers instead of meaningful chapter names.

### Solution

Thread `chapter_name` from the raw JSON through the schema transformation and both EPUB builders. Use the real name as-is for `<h1>` headings and TOC entries; fall back to `Chương N` only when `chapter_name` is absent or empty.

### Scope

**In Scope:**
- `book.schema.ts`: add `chapter_name` to `chapterSchema`; use it as `EpubChapter.title` in `buildChaptersForEpub()`
- `bookToEpub.ts`: use `chapter.title` (with `Chương N` fallback) for chapter `<h1>` and `<title>` in XHTML files
- `storage.keys.ts`: bump `EPUB_BLOB_CACHE_PREFIX` from `v3` → `v4` (mandatory cache invalidation)
- `build-epubs.mjs`: use `rawChapters[chapter.index].chapter_name` (with fallback) for `chapterTitle` and `labelText`
- `book.schema.test.ts`: update helper and assertions to cover `chapter_name` propagation
- `bookToEpub.test.ts`: add test for AC3 (`<h1>` and `<title>` use chapter title)

**Out of Scope:**
- Flattened `content` array (`normalizeParagraphs`) — no change needed
- Reader UI display (uses `content`, not epub chapters)
- Catalog or index changes

## Context for Development

### Codebase Patterns

- `chapterSchema` in `book.schema.ts` uses Zod; nullable/optional raw fields use `.optional()`. The declaration is at line 9 (`const chapterSchema = z.object({`) and `pages` is the only field inside it (line 10). The new `chapter_name` field goes alongside `pages` inside the object literal.
- `buildChaptersForEpub()` maps raw chapters to `EpubChapter[]` — already filters out empty chapters (paragraphs.length === 0); `chapterIndex` is the index in the original raw array, not the filtered result.
- `bookToEpub.ts` consumes `Book.chaptersForEpub` (already-transformed `EpubChapter[]`); it never reads raw JSON. The `navPoints` block at line 116–117 already uses `chapter.title || \`Chương ${index + 1}\`` correctly. Only the `contentFiles` map at line 94–95 uses the old synthetic title — that is the only line to fix in this file.
- `build-epubs.mjs` reads raw JSON directly. Its `effectiveChapters` array carries `{ index, paragraphs }` where `index` is the original position in `rawChapters`. The `contentFiles` map starts at line 153; the `chapterTitle` assignment is at lines 159–160. The `navPoints` map starts at line 178; the `labelText` assignment is at lines 181–182. **Note:** `navPoints` in `build-epubs.mjs` uses the synthetic `Chương N` (unlike `bookToEpub.ts` which already uses `chapter.title`) — both lines need fixing.
- Raw JSON chapter keys confirmed: `chapter_id`, `chapter_name`, `chapter_seo_name`, `chapter_view_count`, `page_count`, `pages`

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `apps/reader/src/shared/schemas/book.schema.ts` | Zod schema + `buildChaptersForEpub()` — primary fix |
| `apps/reader/src/shared/lib/bookToEpub.ts` | Runtime EPUB builder — fix `chapterTitle` at line 94–95 only |
| `apps/reader/scripts/build-epubs.mjs` | Build-time EPUB script — fix lines 159–160 (`contentFiles`) and 181–182 (`navPoints`) |
| `apps/reader/src/shared/constants/storage.keys.ts` | Bump `EPUB_BLOB_CACHE_PREFIX` v3→v4 |
| `apps/reader/src/shared/schemas/book.schema.test.ts` | Update `makeRawBook` helper + chaptersForEpub assertions |
| `apps/reader/src/shared/lib/bookToEpub.test.ts` | Add AC3 test case |
| `apps/reader/src/shared/types/global.types.ts` | `EpubChapter` interface — read-only reference, no changes |

### Technical Decisions

- **Chapter `<h1>` is just `chapter_name`** — no book title prefix, per user direction. The `<title>` tag in each XHTML file also uses the same `chapterTitle` variable and is fixed automatically.
- **Fallback**: `chapter_name?.trim() || \`Chương ${N}\`` — N is 1-based. In `book.schema.ts` N = `chapterIndex + 1` (original array position). In `build-epubs.mjs` N = `chapter.index + 1` (same, via stored index).
- **Cache invalidation is mandatory**: `EPUB_BLOB_CACHE_PREFIX` must go `epub_blob_v3_` → `epub_blob_v4_` per `project-context.md`. Without this, users with cached v3 blobs would still see `Chương N` titles.
- **Tasks 1 and 5 must be applied together**: after Task 1, the existing `chaptersForEpub` tests at lines 267–268 and 287 of `book.schema.test.ts` will fail (they assert `'Chương 1'`, `'Chương 2'` but the schema now reads `chapter_name` from input). Apply Task 5 in the same commit to keep tests green.

## Implementation Plan

### Tasks

> **Important:** Apply Tasks 1 and 5 in the same commit — tests will fail between them if applied separately.

- [x] Task 1: Add `chapter_name` to `chapterSchema` and use it in `buildChaptersForEpub()`
  - File: `apps/reader/src/shared/schemas/book.schema.ts`
  - Inside `chapterSchema` (the `z.object({...})` block that starts at line 9), add a new field alongside the existing `pages` field:
    ```ts
    chapter_name: z.string().optional(),
    ```
  - In `buildChaptersForEpub()`, find the `result.push({...})` block (lines 119–122). Replace only the `title` line:
    ```ts
    // Before (line 120):
    title: `Chương ${chapterIndex + 1}`,
    // After:
    title: chapter.chapter_name?.trim() || `Chương ${chapterIndex + 1}`,
    ```
  - Leave `paragraphs,` and the closing `})` untouched.

- [x] Task 2: Fix `bookToEpub.ts` to use `chapter.title` for XHTML heading
  - File: `apps/reader/src/shared/lib/bookToEpub.ts`
  - Replace lines 94–95 (inside the `contentFiles` map):
    ```ts
    const chapterTitle =
      effectiveChapters.length === 1 ? title : `${title} – Chương ${index + 1}`
    ```
    with:
    ```ts
    const chapterTitle =
      effectiveChapters.length === 1 ? title : chapter.title || `Chương ${index + 1}`
    ```
  - This fixes both the `<title>` tag (line 102) and the `<h1>` (line 105) since both use the `chapterTitle` variable.
  - Do NOT change the `navPoints` block (lines 113–124) — it already uses `chapter.title || \`Chương ${index + 1}\`` correctly.

- [x] Task 3: Bump `EPUB_BLOB_CACHE_PREFIX` to invalidate stale blobs
  - File: `apps/reader/src/shared/constants/storage.keys.ts`
  - Change line 12: `'epub_blob_v3_'` → `'epub_blob_v4_'`

- [x] Task 4: Fix `build-epubs.mjs` to use `chapter_name` from raw JSON
  - File: `apps/reader/scripts/build-epubs.mjs`
  - **Fix 1 — `contentFiles` map** (lines 153–175): The `chapterTitle` assignment is at lines 159–160. Replace:
    ```js
    const chapterTitle =
      effectiveChapters.length === 1 ? title : `${title} – Chương ${chapter.index + 1}`
    ```
    with:
    ```js
    const rawChapterName = (rawChapters[chapter.index]?.chapter_name ?? '').trim()
    const chapterTitle =
      effectiveChapters.length === 1 ? title : rawChapterName || `Chương ${chapter.index + 1}`
    ```
  - **Fix 2 — `navPoints` map** (lines 178–189): The `labelText` assignment is at lines 181–182. Replace:
    ```js
    const labelText =
      effectiveChapters.length === 1 ? title : `Chương ${chapter.index + 1}`
    ```
    with:
    ```js
    const rawChapterName = (rawChapters[chapter.index]?.chapter_name ?? '').trim()
    const labelText =
      effectiveChapters.length === 1 ? title : rawChapterName || `Chương ${chapter.index + 1}`
    ```
  - Note: `rawChapterName` is declared separately in each `.map()` callback — this is intentional to avoid restructuring the closures.

- [x] Task 5: Update `book.schema.test.ts` — cover `chapter_name` propagation  *(apply with Task 1)*
  - File: `apps/reader/src/shared/schemas/book.schema.test.ts`
  - **Update `makeRawBook` helper** (line 4) to accept optional `chapter_name` per chapter:
    ```ts
    function makeRawBook(chapters: { chapter_name?: string; pages: { html_content?: string | null; original_html_content?: string | null }[] }[])
    ```
  - **Update `'creates one EpubChapter per non-empty chapter in order'` test** (lines 253–271): add `chapter_name` to both chapters and update `title` assertions:
    ```ts
    // Input chapters:
    { chapter_name: 'Chương Một', pages: [{ html_content: '<p>Chap1 Page1</p>' }] },
    { chapter_name: 'Chương Hai', pages: [{ html_content: '<p>Chap2 Page1</p>' }] },
    // Assertions (lines 267–268):
    expect(book.chaptersForEpub?.[0].title).toBe('Chương Một')
    expect(book.chaptersForEpub?.[1].title).toBe('Chương Hai')
    ```
  - **Update `'skips completely empty chapters'` test** (lines 273–288): add `chapter_name` to the non-empty chapter (index 1) and update assertion:
    ```ts
    // Input chapter at index 1:
    { chapter_name: 'Thật Sự', pages: [{ html_content: '<p>Non-empty</p>' }] },
    // Assertion (line 287):
    expect(book.chaptersForEpub?.[0].title).toBe('Thật Sự')
    ```
  - **Add new test** in `describe('bookSchema – chaptersForEpub')`:
    ```ts
    it('falls back to Chương N when chapter_name is absent', () => {
      const raw = makeRawBook([
        { pages: [{ html_content: '<p>Content</p>' }] },
      ])
      const book = bookSchema.parse(raw)
      expect(book.chaptersForEpub?.[0].title).toBe('Chương 1')
    })
    ```

- [x] Task 6: Add AC3 test to `bookToEpub.test.ts` — `<h1>` and `<title>` use chapter title
  - File: `apps/reader/src/shared/lib/bookToEpub.test.ts`
  - Add a new test in `describe('bookToEpubBuffer – multi-chapter structure')`:
    ```ts
    it('uses chapter.title as the <h1> and <title> in each chapter XHTML', async () => {
      const book: Book = {
        id: 'named-chapters',
        title: 'Trang Rời Rừng Thiền',
        category: 'Thiền',
        subcategory: 'test',
        translator: 'Tester',
        coverImageUrl: null,
        content: [],
        chaptersForEpub: [
          { title: 'Vào Rừng', paragraphs: ['Đoạn 1'] },
          { title: 'Ra Rừng', paragraphs: ['Đoạn 2'] },
        ],
      }
      const buffer = await bookToEpubBuffer(book)
      const { readFile } = await unzip(buffer)

      const ch1 = await readFile('OEBPS/content-1.xhtml')
      expect(ch1).toContain('<h1>Vào Rừng</h1>')
      expect(ch1).toContain('<title>Vào Rừng</title>')

      const ch2 = await readFile('OEBPS/content-2.xhtml')
      expect(ch2).toContain('<h1>Ra Rừng</h1>')
      expect(ch2).toContain('<title>Ra Rừng</title>')
    })
    ```

### Acceptance Criteria

- [x] AC1: Given a raw book JSON chapter with `chapter_name: "Vào Rừng Thiền"`, when `bookSchema.parse()` is called, then `chaptersForEpub[N].title === "Vào Rừng Thiền"`
- [x] AC2: Given a raw book JSON chapter with no `chapter_name`, when `bookSchema.parse()` is called, then `chaptersForEpub[0].title === "Chương 1"`
- [x] AC3: Given `chaptersForEpub` with `title: "Vào Rừng"`, when `bookToEpubBuffer()` is called and unzipped, then `content-1.xhtml` contains `<h1>Vào Rừng</h1>` and `<title>Vào Rừng</title>`
- [x] AC4: Given a book JSON where chapters have `chapter_name` values, when `buildEpub()` in `build-epubs.mjs` is called, then each `content-N.xhtml` `<h1>` equals the chapter's `chapter_name` and each NCX `<navLabel><text>` equals the chapter's `chapter_name`
- [x] AC5: Given a book with only one chapter, when either EPUB builder runs, then the single chapter uses the book title (single-chapter fallback path unchanged)
- [x] AC6: Given `EPUB_BLOB_CACHE_PREFIX` is `epub_blob_v4_`, when `epubBlobCacheKey('some-id')` is called, then it returns `"epub_blob_v4_some-id"`

## Review Notes

- Adversarial review completed
- Findings: 10 total, 8 fixed, 2 skipped (noise/informational)
- Resolution approach: auto-fix
- Post-review fixes: XML-escaped `chapter.title` in `bookToEpub.ts` contentFiles; XML-escaped `rawChapterName` in `build-epubs.mjs` contentFiles and navPoints; restored original-index fallback test; added tests for empty/whitespace `chapter_name` and XML-special-char chapter titles

## Additional Context

### Dependencies

None. All changes are internal to the monorepo; no new packages required.

### Testing Strategy

- **Automated (Vitest):** Tasks 5 and 6 add/update tests covering AC1, AC2, AC3, AC5, AC6. Run with `devbox run test` or `cd apps/reader && pnpm test`.
- **Lint:** Run `cd apps/reader && pnpm lint` (zero warnings) — TypeScript strict mode catches type errors from the schema change.
- **Manual (AC4):** `build-epubs.mjs` has no Vitest coverage. Verify by running `node apps/reader/scripts/build-epubs.mjs` with a sample JSON in `book-data/`, then unzip the generated EPUB and inspect `toc.ncx` and `content-1.xhtml`. Risk: `build-epubs.mjs` changes are unguarded by automated tests and can silently regress. Consider adding a Node.js test script in a future sprint.

### Notes

- `rawChapterName` is declared inside each `.map()` callback in `build-epubs.mjs` (once for `contentFiles`, once for `navPoints`) rather than hoisted, to avoid changing the existing closure structure.
- The `chapterSchema` change is backward-compatible: `chapter_name` is optional, so existing JSONs without it will still parse and fall back to `Chương N`.
- **Do not** change `normalizeParagraphs` — the flat `content` array is what the Reader UI paginates from and must remain unchanged.
- `build-epubs.mjs` `navPoints` does not apply `xmlEscape` to `labelText` (pre-existing behaviour, not introduced here). If `chapter_name` values contain `&` or `<`, the NCX could be malformed. This is a pre-existing latent bug outside the scope of this spec.
