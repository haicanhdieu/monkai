# Story 1.4: Deduplicate eligible books

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As the operator,
I want net-new books only — duplicates against existing sources and within the batch removed,
so that the Sách Truyện collection never shows the same title twice and re-syncs stay clean.

## Acceptance Criteria

1. **Given** the normalized-key methodology (PRD D2)
   **When** a candidate's key is computed
   **Then** the key is `(norm_title, norm_author)` where normalization is: NFD → strip diacritics → `đ→d` → lowercase → non-alphanumeric→space → collapse whitespace → trim (FR21).

2. **Given** a candidate key
   **When** dedup runs
   **Then** the candidate is skipped if it matches (a) any **vnthuquan** book, (b) any already-imported **onedrive** book, or (c) an earlier book in the same batch
   **And** if **either** author is empty, a title-only match is **flagged for review** (recorded), never auto-skipped — protecting genuinely-distinct same-title books.

3. **Given** a kept book
   **When** its id is assigned
   **Then** the id is deterministic and onedrive-namespaced via `make_onedrive_id` → `onedrive:nhasachmienphi:<title-slug>` (the 4 known title-only collisions are disambiguated with an author slug → `...-<author-slug>`) (AR9).

4. **Given** skipped duplicates
   **When** dedup completes
   **Then** each skip (and each title-only flag) is recorded with enough detail (title, author, matched-against source) for the run report (FR23, Story 1.8).

## Tasks / Subtasks

- [ ] **Task 1: Normalization helper** (AC: #1)
  - [ ] Add `normalize_key(s: str) -> str` (in `_shared.py` or a `dedup.py` module): NFD → drop combining marks → map `đ/Đ`→`d` → lowercase → replace non-alphanumeric with space → collapse/trim. Note: this is the **key-normalization** form (spaces preserved), distinct from `slugify_title` (hyphens) — keep both.
  - [ ] `candidate_key(title, author) -> tuple[str, str]` = `(normalize_key(title), normalize_key(author or ""))`.
- [ ] **Task 2: Load existing keys to dedup against** (AC: #2)
  - [ ] Build the vnthuquan key set from the served `vnthuquan/index.json` (`book_name`, `author`). Source path: the staged/served book-data — read from the Pi-bound book-data dir or a fetched copy; for tests, use a fixture index. (vnthuquan has 57 books; measured 0 collisions, but the pass must exist for future re-syncs.)
  - [ ] Build the prior-onedrive key set from an existing `onedrive/index.json` if present (empty on first run).
- [ ] **Task 3: Dedup pass** (AC: #2, #4)
  - [ ] Iterate candidates in stable manifest order; maintain a `seen` set for in-batch dedup (c).
  - [ ] Skip on exact `(norm_title, norm_author)` match against vnthuquan, prior-onedrive, or `seen`.
  - [ ] If either author empty AND only title matches → record a "flagged-for-review" entry; KEEP the book.
  - [ ] Record every skip with reason + matched source.
- [ ] **Task 4: Assign ids + collision disambiguation** (AC: #3)
  - [ ] Assign `make_onedrive_id(source, title)`; detect title-slug collisions within the kept set and re-issue colliding ids with the author slug appended (`make_onedrive_id(source, title, author)`). Assert final ids are unique.
- [ ] **Task 5: Optional fuzzy pass (flagged, default off)** (AC: #2)
  - [ ] Leave a hook/flag for a token-set-ratio ≥ 0.95 fuzzy pass per PRD D2.4, default **off** (exact-normalized measured clean). Do not implement unless trivial; document the flag.
- [ ] **Task 6: Tests**
  - [ ] `normalize_key` strips diacritics + `đ` and collapses punctuation/space; `("Đắc Nhân Tâm","Dale Carnegie")` and `("dac nhan tam","dale carnegie")` produce equal keys.
  - [ ] Candidate matching vnthuquan key is skipped; in-batch duplicate skipped; empty-author title-collision is kept + flagged.
  - [ ] Two distinct books with the same title slug get distinct ids via author disambiguation; final id set is unique.
  - [ ] `uv run pytest` green; `uv run ruff check .` clean.

## Dev Notes

- **Methodology is PRD D2 (measured against real data):** 0 of 2,343 collide with vnthuquan's 57; 0 internal `(title,author)` dups; 4 title-only collisions are genuinely distinct (kept, id-disambiguated by author). The dedup pass is wired in anyway for future re-syncs and cross-source safety. [Source: prd-onedrive-import.md#D2, architecture-onedrive-import.md#Dedup-measured]
- **Conservative on missing author (D2.3):** never auto-skip on title-only match when an author is missing — that would silently drop a legitimately-distinct same-title book. Flag for human review instead. [Source: prd-onedrive-import.md#D2]
- **Two normalization forms exist — don't conflate them.** `slugify_title` (Story 1.1, hyphen output) is for **ids**; `normalize_key` (this story, space output) is for **dedup matching**. They share the diacritic/`đ` logic but differ in output separator. [Source: prd-onedrive-import.md#D2 vs apps/crawler/utils/slugify.py]
- **Id format (AR9):** `onedrive:{source}:{slug}` via `make_onedrive_id` from Story 1.1 — colon form, distinct from crawler `__`. The 4 collisions get `-{author-slug}`. [Source: epics-onedrive-import.md#Story-1.4 AR9, architecture-onedrive-import.md#Risks item 4]
- **Determinism feeds idempotency (Story 1.7):** same input book → same id → re-index overwrites its own record, never duplicates. [Source: architecture-onedrive-import.md#Idempotency-Re-sync]
- **vnthuquan index location:** the reader fetches `/book-data/vnthuquan/index.json` (root object `{_meta, books[]}`). For dedup, read the same file from the local/served book-data tree; keys come from `book_name` + `author`. [Source: architecture-onedrive-import.md#Reality-check, apps/crawler/data/book-data/vnthuquan/index.json]
- **Non-destructive guarantee:** dedup READS vnthuquan; it never writes or modifies it (FR18). [Source: prd-onedrive-import.md#FR18]

### Project Structure Notes

- Adds dedup logic (new `dedup.py` or functions in `manifest.py`/`_shared.py` — prefer a focused `dedup.py`). Extends `sync.py index` to run dedup between filter (1.3) and category mapping (1.5).
- Test fixtures: a tiny `vnthuquan/index.json` and a small candidate list.

### References

- [Source: prd-onedrive-import.md#D2 — Dedup methodology]
- [Source: architecture-onedrive-import.md#Dedup-measured]
- [Source: architecture-onedrive-import.md#Idempotency-Re-sync — deterministic ids]
- [Source: epics-onedrive-import.md#Story-1.4]
- [Source: prd-onedrive-import.md#FR21, FR23, FR18]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
