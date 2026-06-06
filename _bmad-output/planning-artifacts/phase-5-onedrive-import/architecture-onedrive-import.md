---
workflowType: 'architecture'
projectName: 'monkai'
phase: 'Phase 5 — OneDrive book import'
author: 'Minh'
date: '2026-06-04'
status: 'draft'
---

# Architecture — Phase 5: OneDrive book import

## Overview

Phase 5 adds a new ingestion path: EPUB books that live in a shared OneDrive
folder become first-class entries in the monkai library, served by the Pi and
rendered by the reader's existing epub.js engine.

This is deliberately *not* a new crawler. The crawler (`apps/crawler/`) scrapes
HTML/API sources and emits structured per-chapter JSON. OneDrive books arrive as
finished `.epub` files plus a hand-authored `manifest.json` per source folder.
The work is therefore a thin **sync + index** tool, not a content extractor — we
serve the EPUB verbatim and only mine its OPF for metadata when the manifest is
incomplete.

The single most consequential decision: **serve the raw `.epub` directly to the
reader via `epubUrl`; do not transform EPUB into our chapter-JSON shape.** The
reader already supports this — `ReaderPage.tsx:46` resolves
`epubUrl = epubUrlFromCatalog ?? epubUrlFromBook`, and `useEpubReader.ts:49`
calls `ePub(epubUrl)` directly on a regular URL. The JSON→EPUB build path
(`useEpubFromBook` → `bookToEpub.ts`) is the fallback for crawler books that have
no `epubUrl`; for OneDrive books that path is never exercised.

Topology is **Mac-mediated and manual**: the Mac runs the OneDrive auth, the
`rclone copy`, and the only real CPU work (EPUB metadata/cover extraction), then
`rsync`s finished files to the Pi. The Pi stays a dumb file host — it runs no
Python for this feature. OneDrive is upstream staging only; the Pi serves local
copies. There is no Windows mid-tier (server retired 2026-06-01).

## Architecture Decisions

### AD-1 — Serve raw `.epub`; no EPUB→JSON transformation

**Decision.** Publish the EPUB file as-is to `/book-data/onedrive/...` and point
the catalog record's `epubUrl` at it. The reader renders it with epub.js.

**Rationale.** The reader's EPUB-direct path is already wired and tested
(`ReaderPage.tsx`, `useEpubReader.ts`). Writing an EPUB parser that flattens
arbitrary third-party EPUBs into our `chapters[]/pages[]/html_content` shape would
be a permanent maintenance liability — every publisher's EPUB structure differs.

**Trade-off accepted.** We inherit epub.js's rendering fidelity (good but not
ours to fully control) instead of owning an EPUB parser forever. Consequence:
**full-text body search is not covered** for OneDrive books in Phase 1 — MiniSearch
indexes catalog metadata only (title/author/category), not chapter prose, because
we never crack the body into searchable text. Flagged in Risks.

### AD-2 — OneDrive is upstream staging only; Pi serves local copies

**Decision.** Files are pulled from OneDrive to the Mac, then pushed to the Pi.
The reader never links to a OneDrive URL.

**Rationale.** OneDrive now requires authentication on file *access* — anonymous
hot-linking to share URLs no longer returns content. This is exactly why the
earlier Graph-API URL-resolution commit (git `9ddff8f`,
"resolve book-data URLs via OneDrive Graph API") was reverted. A public reader
cannot carry OneDrive credentials, so OneDrive cannot be a live origin.

**Trade-off accepted.** Storage is duplicated (OneDrive copy + Pi copy) and there
is a publish lag (books are live only after a sync run). In exchange the read path
stays anonymous, fast, and CORS-friendly via Caddy on the Pi.

### AD-3 — Transport is rclone

**Decision.** Use `rclone copy` for the OneDrive→Mac pull, scoped with
`--include "*.epub" --include "manifest.json"`.

**Rationale.** rclone is already established in this project — the
`onedrive-monkai` remote and the whole OAuth dance were set up in
`_bmad-output/implementation-artifacts/spec-book-data-onedrive-migration-p1.md`.
It gives us SSO/OAuth token handling, incremental copy by size+modtime (so reruns
are cheap), include globs, resumable transfers, and a single static Go binary
with no daemon.

**Rejected alternatives.**
- *abraunegg/onedrive daemon* — wrong shape: a continuous bidirectional syncer
  aimed at full-folder mirroring on a always-on host. We want a bursty,
  one-directional, human-initiated pull.
- *Custom Microsoft Graph API client* — we literally just reverted this
  (git `9ddff8f`). Re-owning token refresh and pagination is the pain we are
  escaping.

### AD-4 — Topology is Mac-mediated and manual

**Decision.** Auth + `rclone copy` + EPUB metadata/cover extraction run on the
Mac. Finished EPUBs, covers, and the composed index `rsync` to the Pi at
`/mnt/data/book-data/onedrive/`. No Python runs on the Pi for this feature.

**Rationale.** OneDrive token refresh is fragile on a headless Pi — that was the
historical pain point. The Mac is a strong machine with a browser present for
interactive SSO, and EPUB cover/OPF extraction (the only meaningful CPU cost) is
better placed there than on the Pi. Ingestion is bursty and human-initiated, so a
long-running daemon is not justified.

**Trade-off accepted.** Ingestion is manual — a human must run it on the Mac. In
exchange we get reliability (no headless token refresh), no Pi-side auth surface,
and CPU on the strong machine.

**Documented upgrade path (not built now).** If automation demand proves out,
move rclone onto the Pi with a token-health alert and a scheduled pull. Until
then, manual-on-Mac is the chosen shape.

### AD-5 — Standalone `apps/onedrive-sync/` app, not a deployer subcommand

**Decision.** New app `apps/onedrive-sync/` with its own `uv` `pyproject.toml`,
its own tests, and a devbox script.

**Rationale.** `apps/deployer/` is bash/Node tooling that runs *on the Pi* and
ships data. This feature is Mac-side Python CPU work (Pydantic validation, `lxml`
OPF parsing, image extraction). It does not belong inside the deployer. Keeping it
standalone preserves the monorepo's per-app isolation.

**Trade-off accepted.** A small amount of duplication: `make_id`/`sha256` helpers
are **vendored** into `_shared.py` rather than imported from `apps/crawler/`.
Cross-app imports would couple two otherwise-isolated apps and break the
"CWD = app dir, unqualified imports" convention each app relies on. The vendored
copies are tiny and pinned by tests.

## Data Flow

```
                        ┌─────────────────────────────────────────────┐
                        │  OneDrive (upstream staging, auth-required)   │
                        │  onedrive-monkai:PUBLIC-DATA/LIBERET/         │
                        │     BOOK-FILES/{source}/                      │
                        │        ├─ manifest.json                       │
                        │        ├─ book-a.epub                         │
                        │        ├─ book-b.epub                         │
                        │        └─ book-c.pdf  (ignored)               │
                        └───────────────────────┬─────────────────────┘
                                                 │  (1) rclone copy
                                                 │  --include "*.epub"
                                                 │  --include "manifest.json"
                                                 ▼
   ┌──────────────────────────── MAC (all CPU work here) ────────────────────────────┐
   │                                                                                   │
   │  apps/onedrive-sync/staging/onedrive/{source}/  (gitignored)                      │
   │        ├─ manifest.json   ──(2a) manifest.py: load + Pydantic validate            │
   │        ├─ book-a.epub     ──(2b) filter: epub-only (drop pdf)                      │
   │        └─ book-b.epub          │                                                  │
   │                                ▼                                                  │
   │              per book:  prefer manifest fields                                    │
   │                         else extract.from_opf(epub)  → title / author             │
   │                         else extract cover  → onedrive/cover/{id}.png             │
   │                         id = onedrive:{source}:{slug}  (make_id, vendored)         │
   │                                │                                                  │
   │                                ▼  (3) emit fragment                                │
   │                    index.onedrive.json   (this namespace only)                    │
   │                                │                                                  │
   │                                ▼  (4) compose.py: merge fragments                 │
   │       crawler fragment  +  onedrive fragment  → index.json  (non-destructive,     │
   │                                                  keyed by id, atomic write)        │
   │                                                                                   │
   └────────────────────────────────────┬──────────────────────────────────────────┘
                                         │  (5) rsync -a  (NO --delete)
                                         │      payload: *.epub + cover/*.png
                                         │      index.json: rsync to temp + mv (atomic)
                                         ▼
                  ┌──────────────────────────────────────────────┐
                  │  Pi  /mnt/data/book-data/onedrive/            │
                  │     ├─ index.json        (served by Caddy)    │
                  │     ├─ cover/{id}.png                          │
                  │     └─ {source}/book-a.epub                    │
                  │                                                │
                  │  Caddy → cloudflared quick-tunnel → reader    │
                  │  reader: epubUrl → ePub(url)  (no JSON build)  │
                  └──────────────────────────────────────────────┘
```

## Component / Module Design

New app rooted at `apps/onedrive-sync/`. Modules:

| Module | Responsibility |
|---|---|
| `sync.py` | Typer entry point. Commands: `pull`, `index`, `all`. `all` = pull → index → compose → publish. |
| `manifest.py` | Pydantic models for the per-source `manifest.json`; load + validate; reject malformed manifests with a clear error. |
| `extract.py` | OPF-crack fallback. stdlib `zipfile` + `lxml.etree`. `from_opf(epub) -> (title, author)` and cover extraction. Used only when the manifest omits a field. |
| `compose.py` | Merge index fragments into the published per-source `index.json`. Non-destructive, namespace-scoped, atomic. |
| `rclone.py` | Thin `subprocess` wrapper around `rclone copy`. Surfaces stderr, non-zero exit. |
| `_shared.py` | **Vendored** `make_id` / `slugify_title` / `sha256_hash` copied from `apps/crawler/utils/`. Do NOT cross-import the crawler. |

Devbox script (add to root `devbox.json` `shell.scripts`):

```json
"sync-books": "cd apps/onedrive-sync && uv run python sync.py all",
"sync-books:pull": "cd apps/onedrive-sync && uv run python sync.py pull",
"sync-books:index": "cd apps/onedrive-sync && uv run python sync.py index"
```

### `extract.py` design (OPF crack)

Use the EPUB container spec directly, no `ebooklib` (too heavy a dependency for a
two-field read):

1. Open the `.epub` with stdlib `zipfile`.
2. Read `META-INF/container.xml`, parse with `lxml.etree`, find the
   `<rootfile full-path="...">` → the OPF path.
3. Parse the OPF: `dc:title` → title, `dc:creator` → author.
4. Cover: read `<meta name="cover" content="{id}"/>`, resolve `{id}` to the
   `<manifest><item id="{id}" href="...">`, extract that image, write to
   `onedrive/cover/{id}.png`.
5. Every field is best-effort; the manifest always wins when it provides a value.

### Pipeline (`sync all`)

1. **pull** — `rclone copy onedrive:.../PUBLIC-DATA/LIBERET/BOOK-FILES ./staging/onedrive/ --include "*.epub" --include "manifest.json"`.
2. **per source dir** — `manifest.py` loads + validates `manifest.json`; filter to
   EPUB-only (drop any PDF entries); per book: prefer manifest fields, else
   `extract.from_opf(epub)` for title/author + cover; write cover to
   `onedrive/cover/{id}.png`; `id = make_id`-derived, namespaced.
3. **emit** — write `index.onedrive.json` fragment (the onedrive namespace only).
4. **compose** — merge crawler fragment + onedrive fragment → `index.json`.
5. **publish** — `rsync` payload to the Pi; atomic-swap the index.

## Data Contract & Schema Changes

### Reality check (verified, not assumed)

The reader does **not** fetch one global `index.json`. It fetches a **per-source**
catalog at `/book-data/{source}/index.json`
(`apps/reader/src/shared/services/data.service.ts:104`). On disk that file is the
Pydantic `BookIndex` root object — `{ "_meta": {...}, "books": [...] }`
(verified: `apps/crawler/data/book-data/vnthuquan/index.json`).

The reader's `catalogSchema`
(`apps/reader/src/shared/schemas/catalog.schema.ts`) parses
`rawCatalogSchema = z.object({ books: z.array(...) })` — it reads the `books`
array and ignores `_meta`. **`epubUrl` already exists** as
`epubUrl: z.string().optional()` (line 20) and is already carried through to
`CatalogBook` (line 51). So for the *catalog*, OneDrive books need **no schema
change** — we just populate `epubUrl`.

This is a pleasant surprise and is called out in Risks/Open Items as something
that de-scopes part of the planned diff.

### Where a schema change IS needed: `book.schema.ts`

The planned change targets the *book detail* schema, not the catalog. Current
shape (`apps/reader/src/shared/schemas/book.schema.ts:14`):

```ts
const rawBookSchema = z.object({
  id: z.string(),
  book_name: z.string(),
  category_name: z.string(),
  category_seo_name: z.string().optional(),
  author: z.string().nullable().optional(),
  cover_image_url: z.string().nullable().optional(),
  cover_image_local_path: z.string().nullable().optional(),
  source: z.string().optional(),
  chapters: z.array(chapterSchema).default([]),   // crawler books carry content here
})
```

A OneDrive book has **no `chapters`** — its content lives entirely in the EPUB,
reached via the catalog's `epubUrl`. Today `chapters` already defaults to `[]`,
so a OneDrive book detail record technically parses — but it parses into a `Book`
with empty `content` and empty `chaptersForEpub`, which would render a blank
reader if the catalog `epubUrl` were ever absent. We make the contract explicit
and self-validating.

**Proposed diff** (book.schema.ts):

```diff
 const rawBookSchema = z.object({
   id: z.string(),
   book_name: z.string(),
   category_name: z.string(),
   category_seo_name: z.string().optional(),
   author: z.string().nullable().optional(),
   cover_image_url: z.string().nullable().optional(),
   cover_image_local_path: z.string().nullable().optional(),
   source: z.string().optional(),
-  chapters: z.array(chapterSchema).default([]),
+  // EPUB-direct books (e.g. source 'onedrive') carry no chapters; they are
+  // served via the catalog's epubUrl and rendered by epub.js directly.
+  epubUrl: z.string().optional(),
+  chapters: z.array(chapterSchema).optional().default([]),
 })
+.refine(
+  (b) => b.epubUrl !== undefined || (b.chapters?.length ?? 0) > 0,
+  { message: 'book must have either epubUrl or chapters' }
+)
```

The `.transform()` already tolerates empty chapters (it produces empty
`content`/`chaptersForEpub`); the refine guarantees a record can actually be
rendered by *some* path. No new field is required on the catalog side.

### Crawler index record shape (for reference, do not change)

`BookIndexEntry` (`apps/crawler/models.py:270`) is the per-book catalog record the
crawler emits. OneDrive fragments must be shape-compatible with the `books[]`
entries the reader's `catalogSchema` accepts. The minimum the reader reads:
`id`, `book_name`, `category_name`, optional `author`, `cover_image_url`,
`epubUrl`, `source`. OneDrive records populate exactly those plus `epubUrl`.

## Index Composition

OneDrive books are published under their own source namespace, so the natural
home is `/book-data/onedrive/index.json` — a sibling of
`/book-data/vnthuquan/index.json`, fetched the same way by the reader. The
"compose with the crawler fragment" step therefore composes **within the onedrive
namespace**: it never has to touch `vnthuquan/index.json` or `vbeta/index.json` at
all, which is the cleanest possible isolation.

**Compose contract (non-destructive):**

- Records are keyed by `id`.
- A fragment **owns its namespace prefix** (`onedrive:`). Compose replaces only
  records whose id is in the fragment's namespace; records outside that namespace
  are preserved untouched.
- Output `books[]` is sorted by `id` for stable, diff-friendly output.
- Write is atomic: write to a temp file, `os.replace()` over the target.
- Re-running the OneDrive sync therefore can never drop a crawler book, even if a
  shared index file is used.

Practically, because OneDrive lives in its own `/book-data/onedrive/` directory,
the cross-namespace guarantee is structural (separate files) *and* enforced in
code (namespace-scoped overwrite) — belt and suspenders.

## Idempotency & Re-sync

The whole pipeline is re-runnable any number of times with no drift:

- **rclone** skips unchanged files (size + modtime), so re-pull is cheap and
  copies only new/changed EPUBs.
- **Deterministic ids** — `id = onedrive:{source}:{slug}` via vendored `make_id`.
  The same input EPUB always yields the same id, so re-indexing overwrites its own
  record rather than creating a duplicate.
- **Compose is non-destructive** and namespace-scoped — re-runs converge, never
  accumulate.
- **rsync deltas** — only changed files cross to the Pi; the index swap is atomic.

## Security / Auth

- **Never commit `rclone.conf` or any credentials.** rclone keeps its OAuth token
  in `~/.config/rclone/rclone.conf` on the Mac; it stays there.
- `.gitignore` additions in `apps/onedrive-sync/`:
  ```
  staging/
  *.conf
  ```
- SSO is **interactive on the Mac** (browser present). The Pi never sees a
  OneDrive credential — this is the core reason for the Mac-mediated topology
  (AD-4).
- The Pi serves only the finished, anonymous artifacts (EPUB, cover, index) via
  Caddy with `access-control-allow-origin: *`, exactly as it already serves
  crawler book-data.

## Pi Resource Constraints

- The Pi runs **no Python** for this feature — no `lxml`, no `zipfile` extraction,
  no Pydantic. All CPU stays on the Mac. The Pi's job is file hosting + Caddy +
  cloudflared, unchanged from today.
- Storage: EPUBs land on the external USB drive at `/mnt/data/book-data/onedrive/`
  (the same 465 GB `monkai-data` volume Caddy already serves). EPUBs are typically
  small (low single-digit MB); covers are PNGs. No new storage pressure of note.
- `rsync -a` without `--delete` for payload means the Pi never has files yanked
  out from under a reader mid-request.

## Repo Layout & Invocation

```
apps/onedrive-sync/
├── pyproject.toml          # own uv project (lxml, pydantic, typer)
├── sync.py                 # typer entry: pull | index | all
├── manifest.py             # Pydantic manifest models + validation
├── extract.py              # OPF crack (zipfile + lxml), cover extraction
├── compose.py              # non-destructive, namespace-scoped index merge
├── rclone.py               # subprocess wrapper
├── _shared.py              # VENDORED make_id / slugify_title / sha256
├── .gitignore              # staging/  *.conf
├── staging/                # gitignored — rclone copy target
│   └── onedrive/{source}/...
└── tests/
    ├── conftest.py
    ├── fixtures/sample.epub        # minimal committed EPUB
    ├── test_manifest.py
    ├── test_extract.py
    ├── test_compose.py
    └── test_sync.py
```

Invocation (from repo root):

```
devbox run sync-books          # full pipeline: pull → index → compose → publish
devbox run sync-books:pull     # rclone copy only
devbox run sync-books:index    # index + compose from existing staging
```

Per the monorepo convention (project-context.md), commands run with CWD =
`apps/onedrive-sync` and use unqualified imports (`from manifest import ...`).

## Testing Strategy

Red-first (write the failing test before the code). Vitest is for the reader;
this app uses **pytest** like the crawler (`uv run pytest`, ruff for lint).

Python tests (`apps/onedrive-sync/tests/`):

- **manifest parse / reject** — a well-formed `manifest.json` validates; a
  malformed one raises a clear error (missing required field, wrong type).
- **epub-only filter drops pdf** — a manifest/staging dir containing a `.pdf`
  entry produces no index record for it; only `.epub` survives.
- **OPF fallback extraction** — given `fixtures/sample.epub` and a manifest
  *missing* title/author, `extract.from_opf` returns the OPF's `dc:title` /
  `dc:creator`.
- **cover extraction** — `extract` pulls the cover image referenced by
  `<meta name="cover">` and writes `cover/{id}.png`.
- **idempotent recopy** — running `index` twice over the same staging yields a
  byte-identical (sorted) index; ids do not duplicate.
- **compose non-destructive + namespace-scoped overwrite** — composing an
  onedrive fragment over an index that already holds crawler records preserves the
  crawler records and replaces only `onedrive:`-prefixed ones.

Reader test (`apps/reader`, Vitest, colocated):

- **Zod accepts EPUB-direct record** — `bookSchema` (and/or `catalogSchema`)
  parses a record with `epubUrl` and no `chapters`.
- **Zod rejects neither-epubUrl-nor-content** — the refine fails a record that has
  neither `epubUrl` nor `chapters`.

Fixtures: a minimal, committed `fixtures/sample.epub` (valid container.xml + OPF +
one cover image + one xhtml) so OPF/cover tests are hermetic and offline.

## Risks & Open Items

1. **No body-text search for OneDrive books (Phase 1).** Because we never crack
   the EPUB body, MiniSearch indexes metadata only. Acceptable for Phase 1; a
   future phase could extract spine text into a search-only sidecar without
   changing the render path. (Consequence of AD-1.)

2. **Surprise: catalog already supports `epubUrl`; book-detail does not need a new
   field.** The planned "catalog/book record — `epubUrl` optional-but-present"
   change is mostly already true. `catalog.schema.ts:20` already has
   `epubUrl: z.string().optional()`. The only real diff is on `book.schema.ts`:
   make `chapters` explicitly optional and add a `.refine` (epubUrl OR chapters).
   This *narrows* the planned scope — flag for the PM so the story doesn't
   over-specify.

3. **Surprise: there is no single global `index.json` the reader reads.** The
   reader fetches **per-source** `/book-data/{source}/index.json`
   (`data.service.ts:104`), each an object `{_meta, books[]}`. The doc's "compose
   into index.json" is therefore most cleanly realized as its own
   `/book-data/onedrive/index.json`. The cross-namespace compose guarantee still
   matters if a shared file is ever introduced, but day one it's structurally
   isolated. Confirm the reader is told to load `onedrive` as a source (its source
   list / `useCatalogSync` may need `onedrive` added — verify
   `apps/reader/src/shared/services/data.service.ts` and any source registry).

4. **`make_id` produces `source__slug`, not `source:slug`.** Vendored `make_id`
   (`apps/crawler/utils/slugify.py:31`) emits `{source_slug}__{title_slug}` with a
   double underscore. The spec asks for `onedrive:{source}:{slug}`. Decide: either
   adapt `_shared.py` to emit the colon-namespaced form, or accept
   `onedrive__{source}__{slug}`. Either is collision-free vs crawler ids
   (`vnthuquan__...`, `vbeta__...`) as long as the `onedrive` prefix is present.
   Recommend documenting the chosen exact format in the story.

5. **OneDrive folder path is assumed.** `PUBLIC-DATA/LIBERET/BOOK-FILES` is the
   working assumption; confirm the actual remote path and that `onedrive-monkai`
   is the live remote name (it is the name established in the Phase-1 migration
   spec). A wrong path fails fast at `rclone copy`, so low risk but worth a
   one-line verification step in the story.

6. **Manifest authorship is manual.** Someone must hand-write `manifest.json` per
   source folder in OneDrive. If a book lacks both manifest fields and usable OPF
   metadata, it gets weak title/author. Mitigation: OPF fallback covers most
   real-world EPUBs; log and surface books that fall through to slug-only titles.

7. **Cover normalization.** Spec writes covers as `.png`; source EPUB covers are
   often JPEG. Decide whether to transcode to PNG (needs an image lib — Pillow on
   the Mac) or keep the original extension. Recommend keeping original format and
   naming `cover/{id}.{ext}` to avoid pulling in Pillow; update the contract if
   PNG is truly required.

---

## Confirmed Data & Simplifications (2026-06-04 manifest inspection)

A live `rclone` walk of `onedrive-monkai:PUBLIC-DATA/LIBERET/BOOK-FILES` (remote
configured: personal drive `6416CBB4AB103737`, `drive_type=personal`) replaced
several assumptions with facts. **20,284 files, 3 source folders.**

### Confirmed remote layout

| Source | Objects | Epub | Manifest | Phase-1 |
|---|---|---|---|---|
| `nhasachmienphi` | 9,030 | **2,343** | ✅ `__books.json` (3.13 MB, 4,374 entries) | import |
| `thuviensach` | 10,376 | 0 | ❌ | deferred (pdf-only) |
| `thuviensach-14011-15810` | 878 | 0 | ❌ | deferred (pdf-only) |

Files are **flat** inside each source folder, named `<sha256>-<id>-<slug>.{epub,pdf,jpg}`.
Only `nhasachmienphi` has a manifest; the pdf-only sources have none — irrelevant for
Phase 1 since they contribute no epub.

### Real manifest schema (resolves Risk #6)

`__books.json` is a **flat JSON array** (not the assumed per-source `manifest.json`
with a wrapper). Per-entry keys:

```
url, title, imageUrl, author, category, imageFile,
epubUrl (2361), epubFile (2343), pdfUrl (2309), pdfFile (2302)
```

`epubFile`/`pdfFile`/`imageFile` are repo-relative paths like
`output/books/<basename>`. **Path mapping verified:** `basename(epubFile)` matches a
real file under `nhasachmienphi/` for **2,343/2,343** epub entries. The sync resolves
a book's epub by `rclone copyto nhasachmienphi/<basename>`.

Manifest authorship is **not** manual — it is the crawler output of nhasachmienphi
and already carries clean `title`, `author`, `category`, and cover (`imageFile`).

### AD-update: OPF cracking is now a rare fallback (revises AD on `extract.py`)

Because the manifest supplies title/author/cover for all 2,343 epub books, the
`extract.py` OPF path is **not on the Phase-1 critical path**. Phase-1 metadata comes
from the manifest; OPF cracking remains only as a defensive fallback for entries that
ever lack a field. Net effect: `lxml`/`zipfile` epub parsing can be deferred or kept
minimal. This simplifies the Mac-side CPU step and removes the cover-extraction risk
(covers come from `imageFile`).

### Cover (resolves Risk #7)

Covers are taken from the manifest `imageFile` (jpg) and copied as-is to
`onedrive/cover/{id}.jpg` — **no transcoding, no Pillow.** Keep original extension.

### Dedup — measured (implements the PRD D2 methodology)

Normalized-key dedup (`(norm_title, norm_author)`, diacritic-stripped) against
vnthuquan's 57 books: **0 collisions.** Internal nhasachmienphi epub dups: **0**
title+author pairs (4 title-only collisions are genuinely distinct books, kept and
id-disambiguated by author slug). So all eligible epub are net-new; the dedup pass is
still wired in for future re-syncs and cross-source safety.

### Category mapping → `category-mapping.yaml` (sibling file)

Authoritative sync-tool config. 25 manifest genres (among epub books) resolve to:
- **1,742** fiction → existing vnthuquan categories;
- **278** vision-aligned non-fiction → **4 new** `category_name` strings
  (`Triết Học`, `Lịch Sử - Chính Trị`, `Khoa Học - Kỹ Thuật`, `Văn Hóa - Tôn Giáo`);
- **323** utility → excluded (Phase 1).
`category_name` is a free string in the index record, so new categories need **no
schema change**. An unmapped category **halts** the sync (`on_unmapped: error`).

### Index placement (confirms Risk #3 resolution)

Ship `/book-data/onedrive/index.json` as its own per-source file — matching how the
reader fetches per-source (`data.service.ts:104`). The reader must register
`onedrive` as a source and map it to the **Sách Truyện** user bucket (same bucket as
`vnthuquan`), so the category browser shows the union of vnthuquan + onedrive
categories. Reader source-registry change is the one reader-side task; verify
`data.service.ts` + `useCatalogSync`.

### Pipeline, revised for Phase 1

```
[Mac]  rclone copy (nhasachmienphi epub + __books.json)
   → load __books.json (flat array)
   → keep entries with epubFile
   → dedup (vnthuquan + prior onedrive + in-batch)
   → map category via category-mapping.yaml  (exclude utility; error on unmapped)
   → per book: copy <basename>.epub + imageFile→cover/{id}.jpg
   → emit /book-data/onedrive/index.json   (source=onedrive, category_name=mapped, epubUrl=…)
[Pi]  rsync -a (no --delete) payload; atomic-replace index.json
```

Net Phase-1 import: **~2,020 books.** No OPF parsing, no Pillow, no cross-namespace
compose (separate per-source index), no Windows tier.
