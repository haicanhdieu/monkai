---
stepsCompleted:
  - step-01-init
  - step-02-discovery
  - step-02b-vision
  - step-02c-executive-summary
  - step-03-success
  - step-04-journeys
  - step-05-domain
  - step-06-innovation
  - step-07-project-type
  - step-08-scoping
  - step-09-functional
  - step-10-nonfunctional
  - step-11-polish
  - step-12-complete
workflowType: 'prd'
projectName: 'monkai'
phase: 'Phase 5 — OneDrive Library Import (Sách Truyện expansion)'
classification:
  projectType: pwa_consumer
  domain: cultural_education
  complexity: medium
  projectContext: brownfield
---

# Product Requirements Document — Monkai Phase 5: OneDrive Library Import

**Author:** Minh
**Date:** 2026-06-04
**Phase:** 5 — Porting an external OneDrive book library into the 'Sách Truyện' category

---

## Executive Summary

Monkai is a Vietnamese-language Progressive Web App (PWA) for Buddhist practitioners. Its vision has expanded from sutras alone to "all human knowledge" — philosophy, history, science, and literature — with Buddhist texts remaining the heart of the collection and general books the expansion. The reader presents exactly **two** user-facing categories: **Kinh Phật** (Buddhist sutras) and **Sách Truyện** (general books). Today these are fed by two crawled sources: vbeta (→ Kinh Phật) and vnthuquan (→ Sách Truyện).

Phase 5 ports a large external book library — currently staged on OneDrive under `PUBLIC-DATA/LIBERET/BOOK-FILES` — into the **Sách Truyện** category. Each source subfolder on OneDrive ships a JSON manifest describing its books, in **epub** and **pdf** formats. This phase establishes a manual, human-triggered import tool (run from the Mac, with interactive sign-in) that copies books from OneDrive onto the Raspberry Pi, which is now the sole host serving `/book-data/*` to the reader.

Phase 5 deliberately scopes to **epub only**. The reader renders raw `.epub` directly via epub.js when a catalog record carries an `epubUrl` — there is no epub→JSON transformation step. Imported books carry an **internal** source tag of `onedrive` but surface seamlessly inside the existing **Sách Truyện** category; the UI continues to show exactly two categories, with no new user-facing source.

### What Makes This Special

Phase 5 multiplies the breadth of Monkai's general-knowledge shelf without adding a single new concept to the user's mental model. A reader browsing **Sách Truyện** sees a richer collection — but never sees "where it came from," never hits a category they didn't already know, and never taps a book that won't open. The complexity (a OneDrive staging area, a manifest format, a manual sync tool, a copy-to-Pi pipeline, mixed epub/pdf inputs) lives entirely behind the curtain. The product promise is unchanged and absolute: **every book shown is a book you can read, right now.**

---

## Project Classification

- **Project Type:** Brownfield PWA extension (Consumer, mobile-first) + content-pipeline tooling
- **Domain:** Cultural/Spiritual + General Knowledge (Vietnamese)
- **Complexity:** Medium — external staging source, manifest ingestion, format gating (epub vs pdf), copy-to-Pi pipeline, idempotent re-sync, dedup against existing sources, resource-constrained host
- **Context:** Brownfield — Phases 1–3 (crawler, reader, multi-source) are complete and in production; rclone and an `onedrive-monkai` remote are already established from a prior book-data backup task

---

## Success Criteria

### User Success

- A user browsing **Sách Truyện** finds the newly imported books mixed seamlessly into the existing collection — with **no visible "source"**, no extra category, and no UI difference between an imported book and a vnthuquan book.
- **Every book a user can see is tappable and readable.** There are no pdf dead-ends: a book the reader cannot render is never shown in browse or search.
- A user tapping an imported epub opens it in the existing epub.js reader and reads it normally — same gestures, same settings, same shelf/bookmark behaviour.
- A user searching **Sách Truyện** can find imported books by title and author. (Known limitation: full-text body search does **not** cover imported epub books in this phase — see Non-Functional Requirements.)
- The reader still shows **exactly two** categories — **Kinh Phật** and **Sách Truyện**. No new top-level category appears anywhere.

### Business / Project Success

- The **Sách Truyện** collection grows by a meaningful, curated set of high-quality general-knowledge titles aligned to the Monkai vision (philosophy, history, science, literature).
- Every imported book that reaches the user has confirmed redistributability (licensing checkpoint passed) — no legal exposure introduced to a public community library.
- A quality bar is enforced at import: imported books that surface have real covers and clean title/author metadata.
- The import is **non-destructive**: the vbeta and vnthuquan indexes and content are completely unchanged by Phase 5.

### Technical Success

- **Re-running the sync is idempotent and non-destructive** — a second run with no upstream changes copies nothing, deletes nothing, and produces a byte-identical catalog for unchanged books.
- The import produces catalog records under the `onedrive` internal source tag that conform to the existing **Sách Truyện** catalog contract, with an `epubUrl` resolvable on the Pi.
- **Zero new user-facing categories** are introduced; the reader's category list is unchanged in count.
- pdf-only books are excluded from the surfaced catalog in this phase, with the data retained upstream so a later phase can enable them without re-import.
- The Pi serves all imported epub files locally (Caddy `/book-data/*`); no request ever reaches OneDrive at read time.

### Measurable Outcomes

- N imported epub books are visible and readable in **Sách Truyện** after a sync run (N = the curated/agreed slice; see Open Questions).
- 0 books in the surfaced catalog fail to open (0 pdf dead-ends, 0 broken `epubUrl`).
- vbeta and vnthuquan `index.json` files are byte-for-byte unchanged before and after a sync run.
- A second consecutive sync run reports 0 files copied and 0 catalog records changed.
- Reader category count remains exactly 2.

---

## User Journeys

### Journey 1: Lan discovers a philosophy book in Sách Truyện

Lan is a Buddhist practitioner who reads sutras daily but is curious about Western philosophy. She opens Monkai, taps **Sách Truyện**, and searches "khắc kỷ" (stoicism). A title she's never seen on Monkai before appears, with a clean cover and a clear author name. She has no idea — and no way to tell — that this book was imported from an external OneDrive library; it sits next to vnthuquan novels with the same card design. She taps it, and it opens in the reader and renders chapter by chapter, exactly like any other book.

**Capabilities revealed:** Seamless surfacing of imported epub under Sách Truyện, title/author search coverage, raw-epub reading via epub.js, no visible source, no new category.

### Journey 2: Lan never hits a dead end

Browsing the same shelf, Lan scrolls a long list of titles. Every single card she taps opens and reads. She never encounters a book that says "cannot open" or shows a blank reader — because pdf-only books from the import are not in her browse list or search results at all. The collection she sees is the collection she can read.

**Capabilities revealed:** Format gating (epub-only surfacing), pdf-only exclusion from browse + search, the "every visible book is readable" guarantee.

### Journey 3: Minh runs a sync from his Mac

As the project owner, Minh wants to pull the latest curated slice from OneDrive. From his Mac he runs the import tool. It opens an interactive OneDrive sign-in (SSO) in his browser; he authenticates once. The tool reads each source subfolder's JSON manifest under `PUBLIC-DATA/LIBERET/BOOK-FILES`, selects the eligible epub books (applying the curation/quality/dedup rules), copies the new and changed files to the Pi, regenerates the `onedrive` catalog records, and reports what it did: how many books were considered, imported, skipped (pdf), skipped (duplicate), and skipped (failed quality gate). He runs it again immediately and it reports zero changes.

**Capabilities revealed:** Manual Mac-triggered sync with interactive SSO, manifest ingestion, copy-to-Pi pipeline, idempotent re-run, dedup, quality gate, transparent run report. (Tool internals are detailed in the companion architecture doc.)

### Journey 4: Minh confirms the existing libraries are untouched

After a sync, Minh checks that **Kinh Phật** and the original vnthuquan portion of **Sách Truyện** look exactly as before. The vbeta and vnthuquan indexes are unchanged; no original book moved, broke, or got re-tagged. Only the imported `onedrive`-tagged records were added.

**Capabilities revealed:** Non-destructive import, source isolation, additive-only catalog changes.

### Journey Requirements Summary

| Capability | Journey |
|---|---|
| Imported epub surfaces seamlessly under Sách Truyện | 1 |
| No visible source / no new category | 1, 4 |
| Title + author search coverage for imports | 1 |
| Raw-epub reading via epub.js (`epubUrl`) | 1 |
| pdf-only books excluded from browse + search | 2 |
| "Every visible book is readable" guarantee | 2 |
| Manual Mac-triggered sync with interactive SSO | 3 |
| Manifest ingestion per source subfolder | 3 |
| Copy-to-Pi pipeline (Pi serves local files) | 3 |
| Idempotent, non-destructive re-sync | 3, 4 |
| Dedup + quality gate at import | 3 |
| Transparent run report | 3 |
| vbeta/vnthuquan indexes unchanged | 4 |
| Additive-only `onedrive`-tagged records | 4 |

---

## Functional Requirements

### Catalog Surfacing & Categorization

- **FR1:** Imported books are surfaced under the existing **Sách Truyện** category only. No new user-facing category is created.
- **FR2:** The reader continues to display exactly two user-facing categories: **Kinh Phật** and **Sách Truyện**.
- **FR3:** Imported books carry an internal source tag of `onedrive`; this tag is never rendered as a user-facing source label or filter.
- **FR4:** Imported book cards are visually indistinguishable from existing **Sách Truyện** (vnthuquan) book cards.
- **FR5:** If a manifest provides a subject / sub-category for a book, that value is carried into the catalog record for future use, even though it is not yet surfaced as a taxonomy in this phase.

### Format Gating (epub only)

- **FR6:** Only books available in **epub** format are imported and surfaced in this phase.
- **FR7:** Imported epub books are served as raw `.epub` files; the reader renders them via epub.js using an `epubUrl` on the catalog record. No epub→JSON transformation is performed.
- **FR8:** **pdf-only** books are excluded from the surfaced catalog — they do not appear in browse lists or search results (no dead-end taps).
- **FR9:** A book offered in both epub and pdf is imported via its epub representation.
- **FR10:** pdf source data remains available upstream on OneDrive so a future phase can enable pdf rendering without re-staging.

### Manifest Ingestion & Import Tool

- **FR11:** The import tool reads a JSON manifest from each source subfolder under `PUBLIC-DATA/LIBERET/BOOK-FILES` to enumerate that subfolder's books and their available formats.
- **FR12:** The import tool is run **manually by a human from the Mac**; it is not a scheduled daemon or cron job on the Pi.
- **FR13:** The import tool performs an **interactive OneDrive sign-in (SSO)** at run time.
- **FR14:** The import tool copies eligible book files from OneDrive to the Pi; the Pi serves the local files (no read-time requests to OneDrive).
- **FR15:** The import tool produces / updates catalog records for imported books under the `onedrive` source tag, conforming to the existing **Sách Truyện** catalog schema, with a resolvable `epubUrl`.
- **FR16:** The import run emits a summary report: books considered, imported, skipped-pdf, skipped-duplicate, skipped-quality, and errors.

### Idempotency & Non-Destructiveness

- **FR17:** Re-running the sync is **idempotent** — unchanged upstream books result in no file copies and no catalog record changes.
- **FR18:** The sync is **non-destructive** to existing data — it never modifies, relocates, or re-tags vbeta or vnthuquan content or indexes.
- **FR19:** Catalog changes from a sync are **additive** with respect to existing sources; only `onedrive`-tagged records are created or updated.
- **FR20:** A book removed upstream is reconciled in the `onedrive` catalog according to the sync's reconciliation rule (see Open Questions for the chosen policy) without affecting other sources.

### Quality, Dedup & Licensing Gate

- **FR21:** Imported books are **deduplicated** against existing vbeta and vnthuquan content and against other books within the import dump, using title and/or content hash.
- **FR22:** A **quality gate** is applied at import: a book is only surfaced if it has a real cover and clean title/author metadata.
- **FR23:** Books failing dedup or the quality gate are skipped (not surfaced) and recorded in the run report.
- **FR24:** A **licensing checkpoint** must be satisfied — redistributability of imported titles must be confirmed before they are exposed publicly. Books that cannot be confirmed redistributable are not surfaced.

### Search

- **FR25:** Imported books are searchable within **Sách Truyện** by **title and author** metadata.
- **FR26:** Full-text body search does **not** cover imported epub books in this phase (consequence of serving raw epub without a JSON body index). This is a documented limitation, not a defect.

---

## Non-Functional Requirements

### Performance & Host Constraints

- The Pi is the sole, resource-constrained host. The import pipeline must not require the Pi to perform heavy per-book processing (e.g., no epub parsing/transformation on the Pi); the Pi serves static files.
- Serving an imported epub from the Pi performs no worse than serving an existing vnthuquan book to the reader.
- The sync tool runs on the Mac and must complete a no-change re-run quickly (proportional to manifest size, not to total library byte size).

### Reading Experience

- Imported epub books open and render in the existing epub.js reader with the same gestures, settings, pagination, and bookmark/shelf behaviour as existing books.
- **Search coverage limitation (known):** because imported epubs are served raw (no JSON body), only title/author metadata participates in search; book-body full-text search is out of scope for this phase and is flagged as a known limitation to be revisited if/when an epub indexing approach is adopted.

### Reliability & Data Integrity

- The vbeta and vnthuquan `index.json` files and their content trees are never modified or relocated by Phase 5.
- A failed or interrupted sync leaves the surfaced catalog in a consistent state — partially copied books are not surfaced.
- If a copied `epubUrl` cannot be resolved on the Pi, that book is not surfaced (preserving the "every visible book is readable" guarantee).

### Security & Access

- OneDrive is treated as an authenticated upstream staging area only; no public read path to OneDrive exists at any time.
- Interactive SSO credentials/tokens are handled on the Mac at run time and are not persisted on the headless Pi (the explicit reason a Pi cron daemon was rejected).

### Maintainability

- Imported records reuse the existing **Sách Truyện** catalog contract; no new reader data model is introduced for imports.
- The `onedrive` source tag isolation makes a future re-sync, partial purge, or pdf-enablement tractable without touching other sources.

---

## Scope

### In Scope (Phase 5)

- Importing **epub** books from OneDrive `PUBLIC-DATA/LIBERET/BOOK-FILES` into the **Sách Truyện** category under an internal `onedrive` source tag.
- A manual, Mac-run, interactive-SSO sync tool that reads per-subfolder JSON manifests and copies files to the Pi.
- Surfacing imported epub books seamlessly in browse and title/author search.
- Idempotent, non-destructive, additive re-sync.
- Dedup (against vbeta/vnthuquan and within the dump), an import-time quality gate, and a licensing checkpoint.
- Carrying manifest subject/sub-category metadata into records for future use.
- Excluding pdf-only books from the surfaced catalog while retaining their upstream data.

### Out of Scope (Phase 5)

- **pdf rendering** in the reader, and surfacing pdf-only books.
- **epub→JSON transformation** and **full-text body search** for imported books.
- Any **new user-facing source selector or category** (the two-category model is fixed).
- A real **genre taxonomy / sub-category browse UI** (metadata is carried but not surfaced).
- An **automated / scheduled sync** on the Pi (cron daemon, token auto-refresh).
- Serving any book **directly from OneDrive** at read time.
- Changes to **Kinh Phật** (vbeta) content, indexing, or UI.

---

## Resolved Decisions — Manifest Inspection (2026-06-04)

A live inspection of the OneDrive `PUBLIC-DATA/LIBERET/BOOK-FILES` tree resolved every open question with real data. **20,284 files across 3 source folders:**

| Source | Books | Epub | Manifest | Phase-1 |
|---|---|---|---|---|
| **nhasachmienphi** | 4,374 | **2,343** | ✅ `__books.json` | import |
| thuviensach | 5,188 | 0 | ❌ none | deferred (pdf-only) |
| thuviensach-14011-15810 | 439 | 0 | ❌ none | deferred (pdf-only) |

All epub live in **nhasachmienphi**; the other two sources are 100% pdf with no manifest. The manifest (`__books.json`, 4,374 entries) carries clean `title`, `author`, `imageUrl/imageFile` (cover), and `category` (33 genres). Path mapping verified: manifest `epubFile` (`output/books/<basename>`) → OneDrive flat file `nhasachmienphi/<basename>`, **2,343/2,343 resolve**.

### D1 — Scope: dedup-filtered slice, not full mirror  *(resolved)*

Import only **net-new** epub books — those not already in vnthuquan — and only from genres that belong in **Sách Truyện**. Measured: **0 of 2,343 collide with vnthuquan's 57 books; 0 internal duplicates.** After category curation (D5): **import ~2,020, exclude 323 utility books.**

### D2 — Dedup methodology  *(resolved)*

Built into the sync tool:
1. **Normalize key:** NFD → strip diacritics, `đ→d`, lowercase, non-alphanumeric→space, collapse/trim — applied to title and author.
2. **Match key = `(norm_title, norm_author)`.** Skip a candidate that matches (a) any vnthuquan book, (b) any already-imported `onedrive` book, (c) an earlier book in the same batch.
3. **Conservative on missing author:** if either author is empty, require a title match **and flag for review** — never auto-skip (protects legitimately-distinct same-title books; 4 such title-collisions exist).
4. **Optional fuzzy pass** (token-set ratio ≥ 0.95) behind a flag; default off (exact-normalized measured clean).
5. **Deterministic id** `onedrive:nhasachmienphi:<title-slug>`; the 4 title-collisions disambiguated with an author slug.

### D3 — pdf handling: auto-resolved  *(resolved)*

No "hide vs badge" UI logic needed. pdf-only books (two whole sources + 2,031 nhasachmienphi books with no epub) are simply **never ingested** — they never enter the index. Upstream data is retained for the future pdf phase.

### D4 — Discoverability  *(resolved)*

The manifest `category` field (33 clean genres) makes sub-categorisation free. Imported books carry a mapped `category_name`; the **Sách Truyện** view shows the union of vnthuquan + `onedrive` categories. Genre browse/filter ships using existing metadata (no epub parsing required).

### D5 — Category mapping + new categories  *(resolved)*

No book is forced into a dishonest fiction bucket. See **`category-mapping.yaml`** (authoritative, sync-tool config):
- **1,742 fiction** books → mapped onto existing vnthuquan categories.
- **278 vision-aligned non-fiction** (philosophy/history/science/religion) → **4 new categories** added: `Triết Học`, `Lịch Sử - Chính Trị`, `Khoa Học - Kỹ Thuật`, `Văn Hóa - Tôn Giáo`. This honours the project vision (expansion into philosophy/history/science) over a strict no-new-category rule. `category_name` is a free string, so no schema change.
- **323 utility** books (business/medicine/law/marketing/language/sport/feng-shui) → **excluded** from Phase 1.
- Any manifest category not listed in the mapping **halts the sync** (no silent drop).

### D6 — OPF parsing largely unneeded  *(resolved — simplifies architecture)*

Because the manifest already supplies title/author/cover/category, the planned epub OPF-cracking step collapses to a rare fallback. Phase 1 is: read manifest → filter epub → dedup → map category → copy epub+cover → emit `onedrive` index. The architecture doc is updated accordingly.

### D7 — Licensing  *(lower risk, still gated)*

Source is `nhasachmienphi.com` ("free book house"), reducing the licensing risk, but a confirmation glance before public exposure remains a release gate.

---

## Phasing

### Phase 5 (this PRD) — epub import MVP

- Manual Mac-run sync tool with interactive SSO, manifest ingestion, copy-to-Pi.
- epub-only surfacing under **Sách Truyện** with `onedrive` internal tag.
- Idempotent, non-destructive, additive re-sync.
- Dedup + quality gate + licensing checkpoint.
- Title/author search coverage; subject metadata carried but not surfaced.
- pdf-only books hidden (data retained upstream).

### Phase 5.x — Discoverability at scale

- Search-first **Sách Truyện** experience: sort, count, search promoted as primary path.
- Possibly a genre/sub-category browse UI driven by carried manifest subject metadata.

### Phase 6+ — Format & search expansion (deferred)

- pdf rendering in the reader and surfacing of pdf books ("Sắp có" → live).
- epub full-text body indexing to extend search beyond title/author.
- Full-mirror import (if approved in OQ1) once quality/licensing pipeline is proven.

---

## Companion Documents

- **Architecture (Winston):** import-tool internals, manifest schema, rclone/`onedrive-monkai` remote usage, copy-to-Pi mechanics, `onedrive` catalog record shape, `epubUrl` resolution, and the raw-epub epub.js serving path. Technical implementation is intentionally kept out of this PRD body and lives in the companion architecture document.
