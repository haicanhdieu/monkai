---
title: 'Placeholder Cover Cleanup Tool + Generated Book Covers'
slug: 'placeholder-cover-cleanup'
created: '2026-05-15'
status: 'done'
stepsCompleted: [1, 2, 3]
tech_stack:
  - Python 3.11 (cleanup tool)
  - TypeScript / React 18 (reader component)
  - Vitest (reader tests)
files_to_modify:
  - apps/crawler/tools/cleanup_placeholder_covers.py (NEW)
  - apps/reader/src/shared/components/BookCover.tsx (NEW)
  - apps/reader/src/shared/components/BookCover.test.tsx (NEW)
  - apps/reader/src/features/library/SutraListCard.tsx
  - apps/reader/src/features/home/DiscoverStrip.tsx
  - apps/reader/src/features/library/SearchResults.tsx
  - apps/reader/src/features/bookmarks/BookmarksPage.tsx
  - apps/reader/src/shared/constants/cover.ts
code_patterns:
  - Deterministic hash-to-color using book ID (djb2 hash → HSL)
  - SHA-256 file deduplication in Python
  - Inline JSON mutation for book.json and index.json
test_patterns:
  - Vitest colocated tests
  - vi.mock for data service
---

# Tech-Spec: Placeholder Cover Cleanup Tool + Generated Book Covers

**Created:** 2026-05-15

## Overview

### Problem Statement

Both `vbeta` and `vnthuquan` crawlers download placeholder cover images that are identical across many books. For vbeta, every book gets `item-general.svg` (23,294 bytes, same SHA-256) from `https://api.phapbao.org/images/item-general.svg` — a generic site icon, not a real book cover. For vnthuquan, some covers may also be identical placeholders. Storing and serving these wastes bandwidth and makes the UI look bad because all vbeta books show the same generic icon. The reader currently falls back to a flat gradient when `coverImageUrl` is null, which is equally uninspiring.

Two separate improvements are needed:
1. A **one-shot cleanup tool** (runs on the Windows server) to identify placeholder covers by file-content hash, null out their references, and clean up the image files.
2. A **generated cover component** in the reader that deterministically renders a visually distinct cover for any book with no image URL.

### Solution

**Cleanup tool** (`apps/crawler/tools/cleanup_placeholder_covers.py`): A standalone Python script that scans all `book.json` files, hashes every referenced local cover image, groups by hash, and considers any hash appearing in ≥2 books a "placeholder". In `--execute` mode it deletes the local image files, nulls `cover_image_local_path` + `cover_image_url` in each `book.json`, and patches the matching entries in each source's `index.json`. Defaults to `--dry-run`. No changes to the crawlers, no re-crawl required.

**Reader `BookCover` component** (`apps/reader/src/shared/components/BookCover.tsx`): A single shared component replacing the duplicated inline cover-display logic in `SutraListCard`, `SearchResults`, `DiscoverStrip`, and `BookmarksPage`. When `coverImageUrl` is null (or the image fails to load), it renders a deterministic CSS gradient + title initial(s) derived from the book ID. Colors are stable per book, making the generated covers visually distinct and recognizable.

### Scope

**In Scope:**
- `apps/crawler/tools/cleanup_placeholder_covers.py` (new standalone script, NOT integrated into pipeline)
- `apps/reader/src/shared/components/BookCover.tsx` — new shared component
- Refactor `SutraListCard`, `SearchResults`, `DiscoverStrip`, `BookmarksPage` to use `<BookCover>`
- Remove `coverPlaceholderStyle` usage from components (keep constant for non-cover uses like skeleton loaders)
- Tests for `BookCover` component

**Out of Scope:**
- Modifying any crawler code (`crawler.py`, `vnthuquan_crawler.py`)
- Re-running the crawler pipeline
- Modifying the deployer scripts
- Adding cover generation to the EPUB builder
- Handling non-`vbeta`/`vnthuquan` sources (tool is generic but tested against those two)
- A UI to trigger cleanup (CLI only)

---

## Context for Development

### Codebase Patterns

**Crawler data layout (critical for the tool):**
```
apps/crawler/data/book-data/
  vbeta/
    {category_seo}/
      {book_seo}/
        book.json           ← has cover_image_url, cover_image_local_path
        images/
          item-general.svg  ← placeholder, 23294 bytes, same SHA-256 for ALL vbeta books
  vnthuquan/
    {category_seo}/
      {book_seo}/
        book.json
        cover.jpg           ← real or placeholder depending on hash duplicates
  vbeta/index.json          ← books[].cover_image_url must be patched
  vnthuquan/index.json      ← books[].cover_image_url must be patched
```

The `index.json` schema (verified in `indexer.py`):
```json
{
  "_meta": { "schema_version": "1.0", "built_at": "...", "total_books": N },
  "books": [
    { "id": "uuid", "source_book_id": "...", "book_name": "...", "cover_image_url": "...", ... }
  ]
}
```

The `cover_image_url` field in `index.json` is set by the indexer as:
```python
cover_image_url = book_data.cover_image_local_path or book_data.cover_image_url
```
So it holds the local relative path (e.g. `vbeta/kinh/.../images/item-general.svg`) if a local copy was downloaded, otherwise the original URL.

The indexer is **append-only** (line 299: `if book_key in existing_keys: return False`). So after patching `book.json`, the tool must also directly patch `index.json`.

**Reader cover display (current, before refactor):**

All four components follow the same inline pattern:
```tsx
const [coverError, setCoverError] = useState(false)
const [coverLoaded, setCoverLoaded] = useState(false)
const coverUrl = book.coverImageUrl ? resolveCoverUrl(book.coverImageUrl) : null

// In JSX:
<div className="relative h-16 w-11 ...">
  {coverUrl && !coverError ? (
    <>
      {!coverLoaded && <div className="absolute inset-0" style={coverPlaceholderStyle} />}
      <img src={coverUrl} ... onLoad={() => setCoverLoaded(true)} onError={() => setCoverError(true)} />
    </>
  ) : (
    <div className="h-full w-full" style={coverPlaceholderStyle} />
  )}
</div>
```

`BookmarksPage` is slightly different — no loading/error state, different placeholder color (`var(--color-border)`), size 88×70px.

**Reader's `resolveCoverUrl`** (in `data.service.ts`):
- `null/empty` → `null`
- Absolute URL → return as-is
- Relative path → `{bookDataBaseUrl}/book-data/{path}`

After cleanup, `coverImageUrl` in `CatalogBook` will be `null` for all vbeta books (since both fields are nulled in `index.json`). The `BookCover` component must handle this gracefully.

**`coverPlaceholderStyle`** in `apps/reader/src/shared/constants/cover.ts` — a CSS gradient object. Still used for skeleton loaders in `DiscoverStrip`. Do not remove the constant; just stop using it as the "no cover" fallback inside `BookCover`.

**Generated cover algorithm (deterministic):**
Use a djb2-style hash of the book ID string:
```ts
function hashId(id: string): number {
  let h = 5381
  for (let i = 0; i < id.length; i++) {
    h = ((h << 5) + h) ^ id.charCodeAt(i)
    h = h >>> 0  // keep 32-bit unsigned
  }
  return h
}
```
Derive hue: `hue = hash % 360`. Generate two HSL colors for a gradient:
- Primary: `hsl({hue}, 45%, 38%)`
- Secondary: `hsl({(hue + 40) % 360}, 35%, 28%)`
Direction: `140deg` (matching existing `coverPlaceholderStyle` angle).
Overlay text: first character(s) of title, capped to 2 chars, white with slight opacity.

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `apps/crawler/indexer.py` | Index append logic; lines 197–213 show how `cover_image_url` is set from book.json |
| `apps/crawler/models.py` | Lines 243–244: `cover_image_local_path`, `cover_image_url` field names |
| `apps/reader/src/shared/constants/cover.ts` | `coverPlaceholderStyle` constant (gradient style) |
| `apps/reader/src/shared/services/data.service.ts` | `resolveCoverUrl(path)` — used in BookCover |
| `apps/reader/src/features/library/SutraListCard.tsx` | Cover pattern to replace (44×64px, list card) |
| `apps/reader/src/features/home/DiscoverStrip.tsx` | Cover pattern to replace (88px wide, 2:3 tile) |
| `apps/reader/src/features/library/SearchResults.tsx` | Cover pattern to replace (44×64px, search card) |
| `apps/reader/src/features/bookmarks/BookmarksPage.tsx` | Cover pattern to replace (88×70px, bookmarks) |

### Technical Decisions

1. **Deduplication by SHA-256 hash, not filename or file size.** File size alone is not a reliable signal (two real 23KB covers could exist). SHA-256 is collision-resistant and handles both SVG (vbeta) and JPEG (vnthuquan) formats.

2. **Minimum duplicate threshold defaults to 2.** A cover hash appearing in ≥2 books is almost certainly a placeholder. A real book cover is never shared between two different books. The `--min-duplicates` flag lets operators raise this threshold for conservative runs.

3. **Tool nulls both `cover_image_local_path` AND `cover_image_url` in book.json.** The `cover_image_url` for vbeta is `https://api.phapbao.org/images/item-general.svg` — still a placeholder even if the local file is deleted. We don't want the reader to try to load it.

4. **Tool patches `index.json` in-place (read → mutate → atomic write).** The indexer uses append-only logic so we cannot re-run it to update existing entries. We write to a `.tmp` file and `os.replace()` atomically, matching the indexer's own pattern.

5. **`BookCover` receives `id`, `title`, `coverImageUrl` (not a full `Book` or `CatalogBook`).** Both types have these fields. Keeping the prop surface minimal makes it reusable.

6. **Size via `className` prop, not variant enum.** Callers already manage sizing via Tailwind wrapper divs. `BookCover` renders `h-full w-full` and the caller wraps it in a sized container — consistent with the existing pattern.

---

## Implementation Plan

### Tasks

Tasks are ordered by dependency (lowest-level first).

---

#### Task 1 — Create `apps/crawler/tools/` directory and cleanup script

**File:** `apps/crawler/tools/cleanup_placeholder_covers.py` (NEW)
**Also create:** `apps/crawler/tools/__init__.py` (empty, for package recognition)

The script is a standalone CLI with Typer. Run from `apps/crawler/` like any other crawler script:
```
uv run python tools/cleanup_placeholder_covers.py --data-dir data/book-data
uv run python tools/cleanup_placeholder_covers.py --data-dir data/book-data --execute
```

**Full script spec:**

```python
"""
cleanup_placeholder_covers.py

Scans all book.json files under data/book-data/, identifies "placeholder" cover
images (local files whose SHA-256 hash is shared by >= N books), and removes them.

Dry-run mode (default): prints a report without modifying anything.
Execute mode (--execute): deletes the image files, nulls cover fields in book.json,
and patches cover_image_url to null in index.json for each affected book.
"""
```

**CLI commands:**

```
# Dry-run (default — zero writes, just report)
uv run python tools/cleanup_placeholder_covers.py --data-dir data/book-data

# Execute with backup (creates backup dir, then cleans)
uv run python tools/cleanup_placeholder_covers.py --data-dir data/book-data --execute

# Restore from a specific backup
uv run python tools/cleanup_placeholder_covers.py --restore backups/covers-backup-20260515T094500
```

**`main(data_dir, execute, min_duplicates, restore)` flow:**

```
[RESTORE MODE] if --restore path given:
  • Read manifest.json from backup dir
  • For each entry in manifest["book_jsons"]: copy backup copy → original path (overwrite)
  • For each entry in manifest["index_jsons"]: copy backup copy → original path (overwrite)
  • For each entry in manifest["images"]: copy backup image → original path (create dirs)
  • Print restored counts and exit

Step 1 — Collect
  • Walk data_dir recursively: find all book.json files
  • For each book.json:
    - Read JSON
    - Get field: local_path = data.get("cover_image_local_path")
    - If local_path is None or "": skip (already clean)
    - Resolve abs_cover_path = data_dir / local_path
    - If not abs_cover_path.exists(): record as "missing" and skip hashing
    - Compute sha256 of file bytes
    - Record: hash → list of (book_json_path, abs_cover_path, cover_image_url_field)

Step 2 — Identify placeholders
  • For each hash where len(books) >= min_duplicates:
    - Mark all N books as "placeholder"

Step 3 — Report
  • Print:
    - Total book.json scanned
    - Total with local covers
    - Total placeholder groups found (N hashes × M books each)
    - For each group: hash prefix, count, example book names
    - "Already clean" count (cover_image_local_path already null)
  • If not execute: print "Re-run with --execute to apply changes"

Step 4 (execute only) — Backup first
  • Create backup dir: data_dir/../backups/covers-backup-{ISO8601_timestamp}/
    e.g. data/backups/covers-backup-20260515T094500/
  • Create subdirs: images/, book_jsons/, index_jsons/
  • For each placeholder cover image file: copy → images/{relative_path_with_dirs_flattened}
    e.g. images/vbeta__kinh__bo-trung-quan__images__item-general.svg
    (flatten path using "__" as separator to avoid nested dirs in backup)
  • For each affected book.json: copy → book_jsons/{flattened_relative_path}.json
  • For each affected source index.json: copy → index_jsons/{source}_index.json
  • Write manifest.json:
    {
      "created_at": "<ISO8601>",
      "data_dir": "<abs path>",
      "images": [{"original": "<rel path>", "backup": "<filename>"}],
      "book_jsons": [{"original": "<rel path>", "backup": "<filename>"}],
      "index_jsons": [{"original": "<rel path>", "backup": "<filename>"}]
    }
  • Print: "Backup created: {backup_dir}"

Step 5 (execute only) — Clean
  For each placeholder book:
    a. Delete abs_cover_path (missing_ok=True)
    b. Read book.json, set cover_image_local_path = None, cover_image_url = None, write back
  For each source (derived from data_dir sub-paths):
    c. Patch index.json: load, for each affected book entry (matched by cover_image_url
       matching the old local path value), set cover_image_url = null, write atomically
  • Print final summary: N books cleaned, N files deleted, N index entries patched
  • Print: "To restore: uv run python tools/cleanup_placeholder_covers.py --restore {backup_dir}"
```

**Index patching detail:**

The tool matches `index.json` entries that have `cover_image_url` equal to either:
- The `cover_image_local_path` from the original book.json (most common, since indexer uses `cover_image_local_path or cover_image_url`), or
- The original `cover_image_url` from book.json

Per source (`vbeta`, `vnthuquan`), load `{data_dir}/{source}/index.json`, iterate `data["books"]`, null out matching entries. Write atomically with `os.replace`.

**Error handling:** wrap file ops in try/except; log warnings but continue. Never crash on a single bad file.

**CLI definition (Typer):**
```python
@app.command()
def main(
    data_dir: Path = typer.Option(Path("data/book-data"), help="Root of book-data dir"),
    execute: bool = typer.Option(False, "--execute", help="Actually apply changes (default: dry-run)"),
    min_duplicates: int = typer.Option(2, "--min-duplicates", help="Min books sharing a hash to be considered placeholder"),
    restore: Path | None = typer.Option(None, "--restore", help="Restore from a backup dir created by a prior --execute run"),
) -> None:
```

**Backup directory location:** `{data_dir}/../backups/covers-backup-{YYYYMMDDTHHMMSS}/`
So with `--data-dir data/book-data`, backups land at `data/backups/covers-backup-20260515T094500/`.
This keeps backups outside `book-data/` so they don't get accidentally served by Caddy.

**Path flattening for backup filenames:** Replace `/` and `\` with `__` in relative paths.
Example: `vbeta/kinh/bo-trung-quan/images/item-general.svg` → `vbeta__kinh__bo-trung-quan__images__item-general.svg`

---

#### Task 2 — Create `BookCover` component

**File:** `apps/reader/src/shared/components/BookCover.tsx` (NEW)

```tsx
interface BookCoverProps {
  id: string
  title: string
  coverImageUrl: string | null
}

export function BookCover({ id, title, coverImageUrl }: BookCoverProps)
```

**Internal state:**
- `coverError: boolean` (image failed to load)
- `coverLoaded: boolean` (image loaded successfully)

**Resolve URL:**
```ts
const resolvedUrl = coverImageUrl ? resolveCoverUrl(coverImageUrl) : null
```

**Render logic:**
```
if (resolvedUrl && !coverError):
  show <img src={resolvedUrl} onLoad/onError handlers>
  while !coverLoaded: show GeneratedCover behind image (absolute inset-0)
else:
  show <GeneratedCover id={id} title={title} />
```

**`GeneratedCover` (internal pure component):**
```tsx
function GeneratedCover({ id, title }: { id: string; title: string }) {
  const hue = djb2Hash(id) % 360
  const primary = `hsl(${hue}, 45%, 38%)`
  const secondary = `hsl(${(hue + 40) % 360}, 35%, 28%)`
  const initials = title.trim().slice(0, 2).toUpperCase() || '?'

  return (
    <div
      className="h-full w-full flex items-center justify-center select-none"
      style={{ background: `linear-gradient(140deg, ${primary} 0%, ${secondary} 100%)` }}
      aria-hidden="true"
    >
      <span
        className="text-white/80 font-bold leading-none"
        style={{ fontFamily: 'Lora, serif', fontSize: 'clamp(0.75rem, 3vw, 1.25rem)' }}
      >
        {initials}
      </span>
    </div>
  )
}
```

**`djb2Hash` (internal utility):**
```ts
function djb2Hash(str: string): number {
  let h = 5381
  for (let i = 0; i < str.length; i++) {
    h = (((h << 5) + h) ^ str.charCodeAt(i)) >>> 0
  }
  return h
}
```

**Root element:** `<div className="h-full w-full relative overflow-hidden">` — fills its parent container (caller controls sizing via wrapper).

---

#### Task 3 — Refactor `SutraListCard.tsx`

**File:** `apps/reader/src/features/library/SutraListCard.tsx`

Remove: `useState` for cover state, the inline cover JSX block, the `coverPlaceholderStyle` import, the `resolveCoverUrl` import.

Replace the `<div className="relative h-16 w-11 ...">...</div>` block with:
```tsx
<div className="h-16 w-11 shrink-0 overflow-hidden rounded">
  <BookCover id={book.id} title={book.title} coverImageUrl={book.coverImageUrl} />
</div>
```

Import `BookCover` from `@/shared/components/BookCover`.

---

#### Task 4 — Refactor `DiscoverStrip.tsx` (`BookCoverTile`)

**File:** `apps/reader/src/features/home/DiscoverStrip.tsx`

The `BookCoverTile` component contains the cover logic. Replace the inner cover div with `<BookCover>`.

Remove: `useState` for cover state, inline cover JSX, `coverPlaceholderStyle` import, `resolveCoverUrl` import.

The skeleton tiles still use `coverPlaceholderStyle` for the skeleton animation — keep the import in the file if still needed for `SkeletonTile`. If `SkeletonTile` is the only remaining use, keep the import; otherwise remove.

Updated `BookCoverTile` inner div:
```tsx
<div className="relative w-full overflow-hidden rounded" style={{ aspectRatio: '2/3' }}>
  <BookCover id={book.id} title={book.title} coverImageUrl={book.coverImageUrl} />
</div>
```

---

#### Task 5 — Refactor `SearchResults.tsx` (`SearchResultCard`)

**File:** `apps/reader/src/features/library/SearchResults.tsx`

The `SearchResultCard` function has the same inline pattern. Note: `SearchDocument` has `bookId` (not `id`) and `coverImageUrl`.

Remove: `useState` for cover state, inline cover JSX, `coverPlaceholderStyle` import, `resolveCoverUrl` import.

Updated cover div:
```tsx
<div className="h-16 w-11 shrink-0 overflow-hidden rounded">
  <BookCover id={result.bookId} title={result.title} coverImageUrl={result.coverImageUrl} />
</div>
```

---

#### Task 6 — Refactor `BookmarksPage.tsx`

**File:** `apps/reader/src/features/bookmarks/BookmarksPage.tsx`

Currently uses a simpler pattern (no loading/error state, different placeholder color):
```tsx
{bookMap[group.bookId]?.coverUrl ? (
  <img src={bookMap[group.bookId]!.coverUrl!} ... />
) : (
  <div className="h-full w-full rounded" style={{ backgroundColor: 'var(--color-border)' }} />
)}
```

`bookMap` currently stores only `{ coverUrl, source }`. We need `id` and `title` too to pass to `BookCover`.

**Update `bookMap` type and builder:**
```ts
const bookMap = useMemo(() => {
  const map: Record<string, { coverImageUrl: string | null; source: string; id: string; title: string }> = {}
  for (const catalog of [vbetaCatalog, vnthuquanCatalog]) {
    if (!catalog) continue
    for (const book of catalog.books) {
      map[book.id] = {
        coverImageUrl: book.coverImageUrl,  // pass raw, BookCover will resolveCoverUrl internally
        source: book.source,
        id: book.id,
        title: book.title,
      }
    }
  }
  return map
}, [vbetaCatalog, vnthuquanCatalog])
```

Remove the `resolveCoverUrl` call here — `BookCover` handles it internally.

Replace the cover block with:
```tsx
<div className="h-[88px] w-[70px] shrink-0 overflow-hidden rounded">
  <BookCover
    id={bookMap[group.bookId]?.id ?? group.bookId}
    title={bookMap[group.bookId]?.title ?? group.bookTitle}
    coverImageUrl={bookMap[group.bookId]?.coverImageUrl ?? null}
  />
</div>
```

Remove `resolveCoverUrl` import if no longer used elsewhere in the file.

---

#### Task 7 — Tests for `BookCover`

**File:** `apps/reader/src/shared/components/BookCover.test.tsx` (NEW)

```tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { BookCover } from './BookCover'
```

Mock `resolveCoverUrl`:
```tsx
vi.mock('@/shared/services/data.service', () => ({
  resolveCoverUrl: (url: string | null) => url,
}))
```

**Test cases:**
1. `given coverImageUrl is null, when rendered, then no <img> is shown` — query for `img` should be null, the generated cover div should be present
2. `given coverImageUrl is a URL, when rendered, then <img> is shown with correct src`
3. `given image load fails (fireEvent error on img), when rendered, then generated cover is shown`
4. `given two different book IDs, when rendered, then the generated covers have visually distinct backgrounds` — verify the style attribute contains different gradient values
5. `given same book ID, when rendered twice, then both generated covers have the same background` — determinism check
6. `given title is "Kinh A Di Đà", when no cover, then initials "KI" are shown` — check text content

---

### Acceptance Criteria

**AC 1 — Cleanup tool dry-run (vbeta)**
- Given: run `uv run python tools/cleanup_placeholder_covers.py --data-dir data/book-data` from `apps/crawler/`
- When: there are N vbeta books all using `item-general.svg` (same SHA-256)
- Then: the tool prints a report listing 1 placeholder hash group with N books, and exits without modifying any files

**AC 2 — Cleanup tool execute creates backup then cleans**
- Given: dry-run has been verified
- When: run with `--execute`
- Then:
  - A backup dir is created at `data/backups/covers-backup-{timestamp}/` before any deletion
  - The backup dir contains `manifest.json`, `images/`, `book_jsons/`, `index_jsons/` subdirs
  - `manifest.json` lists every file backed up with original → backup filename mapping
  - All `item-general.svg` files under `vbeta/` are deleted
  - All `book.json` files previously referencing them have `cover_image_local_path: null` and `cover_image_url: null`
  - `vbeta/index.json` entries previously having `cover_image_url` pointing to those paths now have `cover_image_url: null`
  - Output includes the restore command: `--restore data/backups/covers-backup-{timestamp}`
  - Running the tool again produces "0 placeholder groups found" (idempotent)

**AC 2b — Restore undoes execute**
- Given: `--execute` was run and a backup dir was created
- When: run `--restore data/backups/covers-backup-{timestamp}`
- Then:
  - All deleted image files are restored to their original paths
  - All patched `book.json` files are restored to their pre-cleanup content
  - All patched `index.json` files are restored to their pre-cleanup content
  - The reader shows the original (placeholder) covers again — confirming full undo

**AC 3 — Cleanup tool handles vnthuquan (no false positives)**
- Given: vnthuquan books with distinct per-book covers
- When: run the tool with `--min-duplicates 2`
- Then: books with unique covers are NOT marked as placeholders

**AC 4 — Generated cover is deterministic**
- Given: book with id `"vbeta__kinh-a-di-da"`, title `"Kinh A Di Đà"`
- When: `BookCover` is rendered with `coverImageUrl={null}`
- Then: the rendered div always has the same gradient background color for that ID

**AC 5 — Generated cover falls back on image error**
- Given: `coverImageUrl` is a non-null URL
- When: the `<img>` fires `onError`
- Then: the generated cover replaces the image (no broken image icon shown)

**AC 6 — BookCover fills its container**
- Given: a wrapper `<div className="h-16 w-11">` in `SutraListCard`
- When: `BookCover` is rendered inside it
- Then: the cover (whether image or generated) fills `h-full w-full` of the wrapper

**AC 7 — No regressions in existing cover-showing components**
- Given: books with real cover URLs (vnthuquan books)
- When: rendered in `SutraListCard`, `DiscoverStrip`, `SearchResults`, `BookmarksPage`
- Then: real covers still load and display correctly (no broken images)

**AC 8 — Reader passes lint and tests**
- `pnpm lint` → 0 warnings
- `pnpm test` → all tests pass

---

## Additional Context

### Dependencies

- Python `hashlib` (stdlib, already available) — no new deps for cleanup tool
- Typer (already in crawler deps) — CLI for cleanup tool
- No new npm packages for the reader

### Testing Strategy

**Cleanup tool:** Manual testing on a copy of the real data. Verify dry-run output matches expected book count, then verify execute mode with `ls` and `cat book.json` spot-checks. Not adding pytest tests (this is a one-shot ops tool, not part of the pipeline test suite).

**`BookCover` component:** Vitest unit tests as described in Task 7. Mock `resolveCoverUrl`. Test all branches: null URL, valid URL, error fallback, determinism.

**Integration:** After deploying to Windows server:
1. SSH to server
2. Run cleanup tool in dry-run, review report
3. Run with `--execute`
4. Restart Docker Compose (or just Caddy — static file server picks up changes automatically)
5. Verify reader shows generated covers for vbeta books

### Notes

- The cleanup tool is in `apps/crawler/tools/` rather than a top-level `scripts/` because it operates on crawler data and follows crawler Python conventions (uv, Typer, same imports style).
- The tool does NOT modify the `images/` directory listing artifacts in `index.json`. After deleting `item-general.svg`, those artifact entries will reference a non-existent file. This is acceptable — the images artifacts array is not used by the reader (only `cover_image_url` is consumed). If this bothers operators, a future pass can strip orphan image artifacts.
- `coverPlaceholderStyle` in `cover.ts` is retained because `DiscoverStrip`'s `SkeletonTile` still uses it for loading animation. The constant is not the cover fallback anymore; it's just a gradient style utility.
- On the Windows server the data lives at `D:\ntm\monkai\apps\crawler\data\book-data`. The tool should be run with SSH from the Windows server with CWD = `D:\ntm\monkai\apps\crawler` and `--data-dir data/book-data`.
- Backup dir lands at `data/backups/` (sibling to `book-data/`), outside the Caddy-served path so backups are never accidentally exposed over HTTP.
- Backup is intentionally minimal: only the specific files being modified/deleted, not the entire `book-data/` tree (which can be several GB).
- The `--restore` path can be absolute or relative to CWD.
