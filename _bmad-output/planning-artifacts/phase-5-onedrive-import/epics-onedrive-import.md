---
stepsCompleted:
  - step-01-validate-prerequisites
  - step-02-design-epics
  - step-03-create-stories
  - step-04-final-validation
inputDocuments:
  - prd-onedrive-import.md
  - architecture-onedrive-import.md
  - category-mapping.yaml
---

# monkai Phase 5 — OneDrive Library Import - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for monkai Phase 5 (OneDrive Library Import), decomposing the requirements from the PRD and Architecture into implementable stories.

## Requirements Inventory

### Functional Requirements

**Catalog Surfacing & Categorization**

- **FR1:** Imported books are surfaced under the existing **Sách Truyện** category only. No new user-facing category is created.
- **FR2:** The reader continues to display exactly two user-facing categories: **Kinh Phật** and **Sách Truyện**.
- **FR3:** Imported books carry an internal source tag of `onedrive`; this tag is never rendered as a user-facing source label or filter.
- **FR4:** Imported book cards are visually indistinguishable from existing **Sách Truyện** (vnthuquan) book cards.
- **FR5:** If a manifest provides a subject / sub-category for a book, that value is carried into the catalog record for future use, even though it is not yet surfaced as a taxonomy in this phase.

**Format Gating (epub only)**

- **FR6:** Only books available in **epub** format are imported and surfaced in this phase.
- **FR7:** Imported epub books are served as raw `.epub` files; the reader renders them via epub.js using an `epubUrl` on the catalog record. No epub→JSON transformation is performed.
- **FR8:** **pdf-only** books are excluded from the surfaced catalog — they do not appear in browse lists or search results (no dead-end taps).
- **FR9:** A book offered in both epub and pdf is imported via its epub representation.
- **FR10:** pdf source data remains available upstream on OneDrive so a future phase can enable pdf rendering without re-staging.

**Manifest Ingestion & Import Tool**

- **FR11:** The import tool reads a JSON manifest from each source subfolder under `PUBLIC-DATA/LIBERET/BOOK-FILES` to enumerate that subfolder's books and their available formats.
- **FR12:** The import tool is run **manually by a human from the Mac**; it is not a scheduled daemon or cron job on the Pi.
- **FR13:** The import tool performs an **interactive OneDrive sign-in (SSO)** at run time.
- **FR14:** The import tool copies eligible book files from OneDrive to the Pi; the Pi serves the local files (no read-time requests to OneDrive).
- **FR15:** The import tool produces / updates catalog records for imported books under the `onedrive` source tag, conforming to the existing **Sách Truyện** catalog schema, with a resolvable `epubUrl`.
- **FR16:** The import run emits a summary report: books considered, imported, skipped-pdf, skipped-duplicate, skipped-quality, and errors.

**Idempotency & Non-Destructiveness**

- **FR17:** Re-running the sync is **idempotent** — unchanged upstream books result in no file copies and no catalog record changes.
- **FR18:** The sync is **non-destructive** to existing data — it never modifies, relocates, or re-tags vbeta or vnthuquan content or indexes.
- **FR19:** Catalog changes from a sync are **additive** with respect to existing sources; only `onedrive`-tagged records are created or updated.
- **FR20:** A book removed upstream is reconciled in the `onedrive` catalog according to the sync's reconciliation rule without affecting other sources.

**Quality, Dedup & Licensing Gate**

- **FR21:** Imported books are **deduplicated** against existing vbeta and vnthuquan content and against other books within the import dump, using title and/or content hash (normalized-key methodology per PRD D2).
- **FR22:** A **quality gate** is applied at import: a book is only surfaced if it has a real cover and clean title/author metadata.
- **FR23:** Books failing dedup or the quality gate are skipped (not surfaced) and recorded in the run report.
- **FR24:** A **licensing checkpoint** must be satisfied — redistributability of imported titles must be confirmed before they are exposed publicly. Books that cannot be confirmed redistributable are not surfaced.

**Search**

- **FR25:** Imported books are searchable within **Sách Truyện** by **title and author** metadata.
- **FR26:** Full-text body search does **not** cover imported epub books in this phase (consequence of serving raw epub without a JSON body index). Documented limitation, not a defect.

### NonFunctional Requirements

**Performance & Host Constraints**

- **NFR1:** The import pipeline must not require the Pi to perform heavy per-book processing (no epub parsing/transformation on the Pi); the Pi serves static files only.
- **NFR2:** Serving an imported epub from the Pi performs no worse than serving an existing vnthuquan book to the reader.
- **NFR3:** The sync tool runs on the Mac; a no-change re-run completes quickly (proportional to manifest size, not total library byte size).

**Reading Experience**

- **NFR4:** Imported epub books open and render in the existing epub.js reader with the same gestures, settings, pagination, and bookmark/shelf behaviour as existing books.
- **NFR5:** Search coverage is limited to title/author metadata; book-body full-text search is out of scope for this phase (known, flagged limitation).

**Reliability & Data Integrity**

- **NFR6:** The vbeta and vnthuquan `index.json` files and their content trees are never modified or relocated by Phase 5.
- **NFR7:** A failed or interrupted sync leaves the surfaced catalog in a consistent state — partially copied books are not surfaced.
- **NFR8:** If a copied `epubUrl` cannot be resolved on the Pi, that book is not surfaced (preserving the "every visible book is readable" guarantee).

**Security & Access**

- **NFR9:** OneDrive is treated as an authenticated upstream staging area only; no public read path to OneDrive exists at any time.
- **NFR10:** Interactive SSO credentials/tokens are handled on the Mac at run time and are not persisted on the headless Pi.

**Maintainability**

- **NFR11:** Imported records reuse the existing **Sách Truyện** catalog contract; no new reader data model is introduced for imports.
- **NFR12:** The `onedrive` source-tag isolation makes a future re-sync, partial purge, or pdf-enablement tractable without touching other sources.

### Additional Requirements

Technical and infrastructure requirements from the Architecture document that shape implementation:

- **AR1 (AD-5):** New standalone app `apps/onedrive-sync/` with its own `uv` `pyproject.toml`, own tests, and devbox scripts (`sync-books`, `sync-books:pull`, `sync-books:index`). Not a deployer subcommand. Commands run with CWD = `apps/onedrive-sync` and unqualified imports.
- **AR2 (AD-5):** Vendor `make_id` / `slugify_title` / `sha256_hash` into `_shared.py`; do **not** cross-import `apps/crawler/`. Vendored copies pinned by tests.
- **AR3 (AD-3):** Transport is `rclone copy` against the existing `onedrive-monkai` remote (personal drive `6416CBB4AB103737`), scoped `--include "*.epub" --include "<manifest>"`. Verify remote path `PUBLIC-DATA/LIBERET/BOOK-FILES`.
- **AR4 (AD-4):** Mac-mediated topology — auth + `rclone copy` + any metadata/cover work on the Mac; `rsync -a` **without** `--delete` to the Pi at `/mnt/data/book-data/onedrive/`. No Python runs on the Pi for this feature.
- **AR5:** Real manifest is the flat JSON array `__books.json` (not a wrapped `manifest.json`). Per-entry keys: `url, title, imageUrl, author, category, imageFile, epubUrl, epubFile, pdfUrl, pdfFile`. Resolve a book's epub by `basename(epubFile)` → `nhasachmienphi/<basename>` (2,343/2,343 verified).
- **AR6:** Reader schema change targets `book.schema.ts` only: make `chapters` explicitly optional, add `epubUrl: z.string().optional()`, add `.refine(epubUrl OR chapters)`. `catalog.schema.ts` already has `epubUrl` (no change needed).
- **AR7:** Ship `/book-data/onedrive/index.json` as its own per-source file. Reader must register `onedrive` as a source and map it to the **Sách Truyện** user bucket (same bucket as `vnthuquan`). Verify `data.service.ts:104` + `useCatalogSync`.
- **AR8:** `compose.py` merge is non-destructive, namespace-scoped (`onedrive:` prefix), keyed by `id`, output sorted by `id`, written atomically (`os.replace` over temp). Day-one isolation is structural (separate per-source file) plus enforced in code.
- **AR9:** Deterministic id format `onedrive:{source}:{slug}` via vendored `make_id`. Decide and document the exact separator (colon vs `__`). The 4 title-only collisions are disambiguated with an author slug.
- **AR10:** Covers taken from manifest `imageFile` (jpg) and copied as-is to `cover/{id}.jpg` — no transcoding, no Pillow.
- **AR11:** `extract.py` OPF crack (stdlib `zipfile` + `lxml.etree`) is a **defensive fallback only** — the manifest supplies title/author/cover/category for all 2,343 epub books. Kept minimal / off the Phase-1 critical path.
- **AR12:** Category mapping is driven by `category-mapping.yaml` (authoritative). Excluded utility genres are dropped; an unmapped category **halts** the sync (`on_unmapped: error`).
- **AR13:** Security/hygiene — never commit `rclone.conf`; `.gitignore` adds `staging/` and `*.conf` in `apps/onedrive-sync/`.
- **AR14:** Testing — pytest red-first for `onedrive-sync` (`uv run pytest`, ruff lint); committed `fixtures/sample.epub` for hermetic OPF/cover tests; Vitest reader tests for the schema change.

### UX Design Requirements

_No UX Design Specification exists for Phase 5. This phase is pipeline tooling plus a single internal reader schema/registry change; imported books reuse the existing **Sách Truyện** card, browse, search, and reader UI verbatim (FR4, NFR4, NFR11). No new UX surface is introduced._

### FR Coverage Map

| FR | Epic | Note |
|---|---|---|
| FR1 | Epic 2 | Surface under Sách Truyện only |
| FR2 | Epic 2 | Two-category invariant |
| FR3 | Epic 2 | `onedrive` tag never user-facing |
| FR4 | Epic 2 | Cards indistinguishable |
| FR5 | Epic 1 | Carry manifest subject/category into record |
| FR6 | Epic 1 | epub-only import |
| FR7 | Epic 2 | Render raw epub via epub.js `epubUrl` (Epic 1 FR15 emits it) |
| FR8 | Epic 1 | pdf-only excluded from catalog |
| FR9 | Epic 1 | epub+pdf → import epub |
| FR10 | Epic 1 | pdf data retained upstream |
| FR11 | Epic 1 | Read `__books.json` manifest |
| FR12 | Epic 1 | Manual Mac-run |
| FR13 | Epic 1 | Interactive SSO |
| FR14 | Epic 1 | Copy to Pi, Pi serves local |
| FR15 | Epic 1 | Emit `onedrive` records + resolvable epubUrl |
| FR16 | Epic 1 | Run report |
| FR17 | Epic 1 | Idempotent re-sync |
| FR18 | Epic 1 | Non-destructive to vbeta/vnthuquan |
| FR19 | Epic 1 | Additive only |
| FR20 | Epic 1 | Upstream-removal reconciliation |
| FR21 | Epic 1 | Dedup |
| FR22 | Epic 1 | Quality gate |
| FR23 | Epic 1 | Skip + record failures |
| FR24 | Epic 1 | Licensing checkpoint gate |
| FR25 | Epic 2 | Title/author search |
| FR26 | Epic 2 | No body search (documented limit) |

## Epic List

### Epic 1: OneDrive Sync Import Tool (Mac-side pipeline)

Build `apps/onedrive-sync/` — the manual, Mac-run tool that pulls eligible epub from OneDrive, dedups, maps categories, emits `/book-data/onedrive/index.json` plus epub/cover files, and publishes them to the Pi. Outcome: a served, idempotent, non-destructive `onedrive` catalog exists on the Pi, ready for the reader to consume.

**FRs covered:** FR5, FR6, FR8, FR9, FR10, FR11, FR12, FR13, FR14, FR15, FR16, FR17, FR18, FR19, FR20, FR21, FR22, FR23, FR24

### Epic 2: Reader Surfacing in Sách Truyện

Make imported books appear and read inside the existing **Sách Truyện** category: register `onedrive` as a source mapped to the Sách Truyện bucket, the `book.schema.ts` refine (epubUrl OR chapters), cards indistinguishable from vnthuquan, two-category invariant preserved, raw-epub render via epub.js, and title/author search coverage. Outcome: a user browses Sách Truyện and reads imported epub with no visible source.

**FRs covered:** FR1, FR2, FR3, FR4, FR7, FR25, FR26

## Epic 1: OneDrive Sync Import Tool (Mac-side pipeline)

Build `apps/onedrive-sync/` — the manual, Mac-run tool that pulls eligible epub from OneDrive, dedups, maps categories, gates on quality/licensing, emits `/book-data/onedrive/index.json` plus epub/cover files, and publishes them to the Pi. Each story builds only on prior stories in the epic; the epic is verifiable end-to-end against the served `onedrive/index.json` without the reader.

### Story 1.1: Scaffold the onedrive-sync app

As the project operator (Minh),
I want a standalone `apps/onedrive-sync/` app with its CLI skeleton, vendored helpers, and secret-safe gitignore,
So that I have an isolated, invocable foundation for the import pipeline that never couples to the crawler or leaks credentials.

**Acceptance Criteria:**

**Given** the monorepo per-app convention (CWD = app dir, unqualified imports)
**When** `apps/onedrive-sync/` is created with its own `uv` `pyproject.toml` (deps: `typer`, `pydantic`, `lxml`)
**Then** `cd apps/onedrive-sync && uv run python sync.py --help` lists three commands: `pull`, `index`, `all`
**And** devbox scripts `sync-books`, `sync-books:pull`, `sync-books:index` are added to root `devbox.json` and resolve to the correct `cd apps/onedrive-sync && uv run python sync.py ...` invocations (AR1).

**Given** the rule that the crawler must not be cross-imported (AD-5)
**When** `_shared.py` is authored
**Then** it contains **vendored** copies of `make_id`, `slugify_title`, and `sha256_hash` (no import of `apps.crawler`)
**And** `tests/test_shared.py` pins each vendored helper's output against known inputs so drift from the crawler original is caught (AR2).

**Given** secrets must never be committed (AR13)
**When** `apps/onedrive-sync/.gitignore` is written
**Then** it ignores `staging/` and `*.conf`
**And** `rclone.py` exists as a thin `subprocess` wrapper around `rclone` that surfaces stderr and raises on non-zero exit.

### Story 1.2: Pull eligible files from OneDrive via rclone

As the operator,
I want `sync.py pull` to authenticate interactively and copy only epub + manifest from OneDrive into local staging,
So that all OneDrive access and SSO happen on my Mac and nothing else is downloaded.

**Acceptance Criteria:**

**Given** the established `onedrive-monkai` remote (personal drive `6416CBB4AB103737`)
**When** `sync.py pull` runs
**Then** it invokes `rclone copy onedrive-monkai:PUBLIC-DATA/LIBERET/BOOK-FILES ./staging/onedrive/` scoped with `--include "*.epub" --include "__books.json"` (AR3)
**And** a wrong/unreachable remote path fails fast with rclone's surfaced error (FR11 fetch).

**Given** OneDrive now requires authentication on access
**When** the pull runs and no valid token is cached
**Then** rclone triggers an interactive browser SSO on the Mac (FR13)
**And** the run is manual and human-initiated — there is no daemon, cron, or scheduled trigger (FR12).

**Given** a successful pull
**When** it completes
**Then** `staging/onedrive/nhasachmienphi/` holds the epub files and `__books.json`, and `staging/` is gitignored.

### Story 1.3: Parse the manifest and filter to epub-only

As the operator,
I want the tool to load and validate `__books.json` and keep only books that have an epub,
So that pdf-only books never enter the pipeline and a malformed manifest fails loudly.

**Acceptance Criteria:**

**Given** the real manifest is a flat JSON array with keys `url, title, imageUrl, author, category, imageFile, epubUrl, epubFile, pdfUrl, pdfFile` (AR5)
**When** `manifest.py` loads `__books.json`
**Then** a well-formed manifest validates against the Pydantic model and a malformed one (missing required field / wrong type) raises a clear, actionable error.

**Given** the epub-only scope (FR6)
**When** entries are filtered
**Then** only entries carrying an `epubFile` are kept; entries without `epubFile` (pdf-only) produce no record (FR8) and their upstream data is left untouched on OneDrive (FR10)
**And** a book offered in both epub and pdf is retained via its `epubFile` (FR9).

**Given** an eligible entry
**When** its epub is resolved
**Then** `basename(epubFile)` maps to `nhasachmienphi/<basename>` in staging and the file exists (verified 2,343/2,343) (FR11).

### Story 1.4: Deduplicate eligible books

As the operator,
I want net-new books only — duplicates against existing sources and within the batch removed,
So that the Sách Truyện collection never shows the same title twice and re-syncs stay clean.

**Acceptance Criteria:**

**Given** the normalized-key methodology (PRD D2)
**When** a candidate's key is computed
**Then** the key is `(norm_title, norm_author)` where normalization is NFD → strip diacritics → `đ→d` → lowercase → non-alphanumeric→space → collapse/trim (FR21).

**Given** a candidate key
**When** dedup runs
**Then** the candidate is skipped if it matches (a) any vnthuquan book, (b) any already-imported `onedrive` book, or (c) an earlier book in the same batch
**And** if either author is empty, a title-only match is **flagged for review**, never auto-skipped (protecting genuinely-distinct same-title books).

**Given** a kept book
**When** its id is assigned
**Then** the id is deterministic and `onedrive`-namespaced (exact separator documented in code; the 4 known title-only collisions are disambiguated with an author slug) (AR9)
**And** skipped duplicates are recorded for the run report (FR23).

### Story 1.5: Map categories and apply quality + licensing gates

As the operator,
I want each book mapped to an honest category and gated on cover/metadata quality and redistributability,
So that only well-formed, legally-clear books surface and no category is silently dropped.

**Acceptance Criteria:**

**Given** `category-mapping.yaml` is the authoritative lookup (AR12)
**When** a book's manifest `category` is mapped
**Then** `mapped` genres resolve onto existing vnthuquan `category_name` strings, `new_categories` resolve to the 4 additive strings (`Triết Học`, `Lịch Sử - Chính Trị`, `Khoa Học - Kỹ Thuật`, `Văn Hóa - Tôn Giáo`), and `excluded` utility genres are dropped from Phase 1 (FR5)
**And** a manifest category absent from all three sections **halts the sync** with an "unmapped category" error (`on_unmapped: error`) — no silent drop.

**Given** the import quality gate (FR22)
**When** a book is evaluated
**Then** it is surfaced only if it has a real cover (resolvable `imageFile`) and clean title/author; books failing the gate are skipped and recorded (FR23).

**Given** the licensing checkpoint (FR24)
**When** the run reaches the release gate
**Then** redistributability must be confirmed before public exposure; books that cannot be confirmed redistributable are not surfaced.

### Story 1.6: Emit the onedrive index and copy epub + cover

As the operator,
I want each kept book's epub and cover copied and an `onedrive/index.json` emitted with a resolvable `epubUrl`,
So that the served catalog conforms to the Sách Truyện contract and every record points at a real file.

**Acceptance Criteria:**

**Given** a kept, mapped book
**When** files are staged for publish
**Then** its epub is copied and its `imageFile` (jpg) is copied as-is to `cover/{id}.jpg` with no transcoding and no Pillow (AR10).

**Given** the existing per-source catalog contract
**When** `index.onedrive.json` is emitted
**Then** each record carries `id`, `book_name`, `category_name` (mapped), optional `author`, `cover_image_url`, `source = "onedrive"`, and a resolvable `epubUrl` (FR15)
**And** carried manifest subject/category metadata is preserved on the record for future use even though it is not surfaced as a taxonomy yet (FR5).

**Given** a manifest entry that ever lacks title/author
**When** metadata is resolved
**Then** `extract.py` (stdlib `zipfile` + `lxml`) OPF-cracks the epub as a defensive fallback only — it is off the Phase-1 critical path since the manifest supplies metadata for all 2,343 epub (AR11).

**Given** compose runs
**When** the onedrive fragment is merged
**Then** the merge is namespace-scoped (`onedrive:` prefix), keyed by `id`, output sorted by `id`, and written atomically via temp + `os.replace`; records outside the namespace are preserved untouched (FR19, AR8).

### Story 1.7: Publish to the Pi, idempotently and non-destructively

As the operator,
I want the payload and index pushed to the Pi without ever deleting or mutating other sources,
So that re-running the sync converges with no drift and the existing libraries stay byte-identical.

**Acceptance Criteria:**

**Given** the Mac-mediated topology (AD-4)
**When** publish runs
**Then** `rsync -a` **without** `--delete` copies `*.epub` + `cover/*` to `/mnt/data/book-data/onedrive/` on the Pi, and `index.json` is written to a temp path then atomically moved (FR14); no Python runs on the Pi.

**Given** an unchanged upstream
**When** the sync is re-run
**Then** rclone copies nothing (size+modtime), deterministic ids overwrite their own records, and compose converges — 0 files copied, 0 catalog records changed (FR17).

**Given** existing sources
**When** any sync runs
**Then** `vbeta/index.json` and `vnthuquan/index.json` and their content trees are never modified, relocated, or re-tagged; changes are additive to the `onedrive` namespace only (FR18, FR19).

**Given** a book removed upstream
**When** the next sync runs
**Then** it is reconciled in the `onedrive` catalog per the chosen reconciliation rule without affecting any other source (FR20).

### Story 1.8: Emit a transparent run report

As the operator,
I want `sync.py all` to run the full pipeline and print a summary of what it did,
So that I can see exactly how many books were imported, skipped, or errored on every run.

**Acceptance Criteria:**

**Given** the full pipeline
**When** `sync.py all` runs
**Then** it executes pull → index → compose → publish in order.

**Given** a completed run
**When** the report is emitted
**Then** it reports counts for: books considered, imported, skipped-pdf, skipped-duplicate, skipped-quality, and errors (FR16)
**And** a second consecutive run reports 0 imported / 0 changed, consistent with idempotency (FR17).

## Epic 2: Reader Surfacing in Sách Truyện

Make imported books appear and read inside the existing **Sách Truyện** category, with no new user-facing surface. All work is in `apps/reader`. Stories build only on prior stories and on Epic 1's served `onedrive/index.json`.

### Story 2.1: Accept EPUB-direct book records in the schema

As a reader developer,
I want `book.schema.ts` to validate a book that carries an `epubUrl` and no chapters,
So that EPUB-direct (onedrive) records parse correctly while still rejecting records that can render via no path.

**Acceptance Criteria:**

**Given** the current `rawBookSchema` (AR6)
**When** the schema is updated
**Then** `chapters` becomes explicitly optional (`.optional().default([])`), an `epubUrl: z.string().optional()` field is added, and a `.refine` requires `epubUrl !== undefined OR chapters.length > 0`.

**Given** the updated schema
**When** Vitest runs
**Then** a record with `epubUrl` and no `chapters` parses successfully (FR7), and a record with neither `epubUrl` nor `chapters` fails the refine
**And** `catalog.schema.ts` is unchanged because `epubUrl: z.string().optional()` already exists there.

### Story 2.2: Register onedrive as a source mapped to Sách Truyện

As a reader,
I want imported books pulled in under the existing Sách Truyện category with no new category or visible source,
So that the library grows while my mental model stays exactly two categories.

**Acceptance Criteria:**

**Given** the reader fetches per-source `/book-data/{source}/index.json` (`data.service.ts:104`) (AR7)
**When** `onedrive` is registered in the source registry / `useCatalogSync`
**Then** the reader fetches `/book-data/onedrive/index.json` and maps `onedrive` to the **Sách Truyện** user bucket (same bucket as `vnthuquan`) (FR1).

**Given** the registered onedrive source
**When** the category list renders
**Then** exactly two user-facing categories remain — **Kinh Phật** and **Sách Truyện** — with no new top-level category (FR2)
**And** the `onedrive` source tag never appears as a user-facing source label or filter anywhere (FR3)
**And** the Sách Truyện category view shows the union of vnthuquan + onedrive categories.

### Story 2.3: Surface imported books and read them via epub.js

As a reader,
I want imported epub books to appear next to vnthuquan books and open in the existing reader,
So that every book I see is tappable and reads exactly like any other book.

**Acceptance Criteria:**

**Given** imported records in the Sách Truyện bucket
**When** the browse list renders
**Then** an imported book's card is visually indistinguishable from a vnthuquan card (same cover/title/author layout) (FR4).

**Given** an imported book with an `epubUrl`
**When** the user taps it
**Then** `ReaderPage` resolves `epubUrl` and `useEpubReader` calls `ePub(epubUrl)` on the regular URL — the JSON→EPUB build path is never exercised (FR7)
**And** the book renders chapter by chapter with the same gestures, settings, pagination, and bookmark/shelf behaviour as existing books (NFR4).

**Given** a record whose `epubUrl` cannot be resolved on the Pi
**When** the catalog is consumed
**Then** that book is not surfaced (preserving the "every visible book is readable" guarantee) (NFR8).

### Story 2.4: Search imported books by title and author

As a reader,
I want to find imported books by title and author within Sách Truyện,
So that I can discover the newly added titles even though full-text body search is not available for them.

**Acceptance Criteria:**

**Given** imported `onedrive` catalog metadata
**When** the MiniSearch index is built
**Then** imported books are indexed by title, author, and category metadata and are findable by title and author queries within Sách Truyện (FR25).

**Given** the raw-epub serving model
**When** a user runs a body/full-text query
**Then** imported epub book bodies are **not** covered — this is a documented limitation, not a defect, and metadata search still returns the book (FR26, NFR5).
