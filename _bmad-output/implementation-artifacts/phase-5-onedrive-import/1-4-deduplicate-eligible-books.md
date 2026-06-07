# Story 1.4: Deduplicate eligible books

Status: review

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

- [x] **Task 1: Normalization helper** (AC: #1)
  - [x] Add `normalize_key(s: str) -> str` (in `dedup.py`): NFD → drop combining marks → map `đ/Đ`→`d` → lowercase → replace non-alphanumeric with space → collapse/trim. Distinct from `slugify_title` (hyphens).
  - [x] `candidate_key(title, author) -> tuple[str, str]` = `(normalize_key(title), normalize_key(author or ""))`.
- [x] **Task 2: Load existing keys to dedup against** (AC: #2)
  - [x] `load_existing_keys(path)` handles both vnthuquan format (`book_name`, `author`) and onedrive format (`title`, `author`); returns empty set if path is None or missing.
- [x] **Task 3: Dedup pass** (AC: #2, #4)
  - [x] Iterates candidates in stable order; `seen` set for in-batch dedup.
  - [x] Skips on exact key match only when both authors non-empty; title-only match when either author empty → flagged + kept.
  - [x] Records every skip with reason + source.
- [x] **Task 4: Assign ids + collision disambiguation** (AC: #3)
  - [x] Two-pass: count title-slug collisions first, then re-issue colliding ids with author slug. Final id uniqueness asserted.
- [x] **Task 5: Optional fuzzy pass (flagged, default off)** (AC: #2)
  - [x] `fuzzy: bool = False` parameter documented in `dedup_candidates`; not implemented.
- [x] **Task 6: Tests**
  - [x] normalize_key diacritics/đ/punctuation/space cases; candidate_key equality for Vietnamese inputs.
  - [x] vnthuquan skip, in-batch skip, empty-author title-match kept+flagged.
  - [x] Collision disambiguation produces unique ids.
  - [x] 23 tests pass; ruff clean.

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
claude-sonnet-4-6

### Debug Log References
- Fixed: initial dedup logic auto-skipped title-only matches even when both authors empty; fixed to flag+keep per AC#2 conservative rule.

### Completion Notes List
- `dedup.py`: `normalize_key` (spaces), `candidate_key`, `load_existing_keys` (both index formats), `dedup_candidates` with two-pass ID disambiguation, `fuzzy=False` hook. `DedupReport` dataclass with `kept`/`skipped`/`flagged` lists.
- `DedupeRun` alias kept for sync.py compatibility.
- `sync.py index` wired: runs dedup after epub filter, prints stats.
- 9 new tests; 23 total pass; ruff clean.

### File List
- apps/onedrive-sync/dedup.py (new)
- apps/onedrive-sync/sync.py (modified — dedup step added to index)
- apps/onedrive-sync/tests/test_dedup.py (new)

### Change Log
- 2026-06-06: Implemented story 1.4 — dedup pass with normalize_key, vnthuquan/prior-OD key loading, in-batch dedup, title-only flagging, id disambiguation.
