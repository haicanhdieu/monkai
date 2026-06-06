# Story 1.3: Parse the manifest and filter to epub-only

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As the operator,
I want the tool to load and validate `__books.json` and keep only books that have an epub,
so that pdf-only books never enter the pipeline and a malformed manifest fails loudly.

## Acceptance Criteria

1. **Given** the real manifest is a **flat JSON array** with per-entry keys `url, title, imageUrl, author, category, imageFile, epubUrl, epubFile, pdfUrl, pdfFile` (AR5)
   **When** `manifest.py` loads `staging/onedrive/nhasachmienphi/__books.json`
   **Then** a well-formed manifest validates against a Pydantic model (one model per entry; the file parses as `list[ManifestEntry]`)
   **And** a malformed manifest (missing required field / wrong type / not an array) raises a clear, actionable error naming the offending field.

2. **Given** the epub-only scope (FR6)
   **When** entries are filtered
   **Then** only entries carrying a non-empty `epubFile` are kept; entries without `epubFile` (pdf-only) produce no record (FR8) and their upstream data is left untouched on OneDrive (FR10)
   **And** a book offered in both epub and pdf is retained via its `epubFile` (FR9).

3. **Given** an eligible entry
   **When** its epub is resolved
   **Then** `basename(epubFile)` maps to `staging/onedrive/nhasachmienphi/<basename>` and the file exists on disk; an eligible entry whose epub file is **missing** from staging is reported (not silently dropped) (FR11).
   **And** against the real dataset this resolves 2,343/2,343.

## Tasks / Subtasks

- [ ] **Task 1: Define the manifest Pydantic model** (AC: #1)
  - [ ] In `manifest.py`, add `ManifestEntry(BaseModel)` (Pydantic v2) with fields matching AR5 keys. Decide required vs optional from the data: `title`, `category`, `epubFile` are the fields the pipeline depends on; `author`, `imageFile`, `imageUrl`, `url`, `epubUrl`, `pdfUrl`, `pdfFile` are optional/nullable. Use `model_config = ConfigDict(extra="ignore")` so unknown future keys don't break parsing.
  - [ ] Add `load_manifest(path: Path) -> list[ManifestEntry]` that reads JSON, asserts it is a list, and validates each entry — raising a clear error (include index + field) on failure.
- [ ] **Task 2: Epub-only filter** (AC: #2)
  - [ ] Add `eligible_epub(entries) -> list[ManifestEntry]` keeping only entries with a truthy `epubFile`.
  - [ ] Do not mutate or touch pdf entries — they are simply excluded.
- [ ] **Task 3: Resolve epub path on disk** (AC: #3)
  - [ ] Add a resolver: `epub_staging_path(entry, staging_dir) -> Path` = `staging_dir / "nhasachmienphi" / basename(entry.epubFile)`.
  - [ ] Collect entries whose resolved path is missing into a "missing-file" list for the run report (Story 1.8); do not crash the whole run on one missing file.
- [ ] **Task 4: Wire into `sync.py index`** (AC: all)
  - [ ] `sync.py index` loads the manifest, filters to epub, resolves paths — producing the in-memory candidate list that Stories 1.4–1.6 consume. (Downstream stages are stubs until their stories land.)
- [ ] **Task 5: Tests** (AC: #1, #2, #3)
  - [ ] `tests/test_manifest.py`: well-formed array fixture validates; missing-required-field fixture raises with a clear message; wrong-type fixture raises; a non-array JSON raises.
  - [ ] epub-only filter: a fixture with one epub entry, one pdf-only entry, one epub+pdf entry → keeps exactly the two with `epubFile`.
  - [ ] path resolution: `basename(epubFile)` maps correctly; a missing on-disk file is reported, not raised.
  - [ ] `uv run pytest` green; `uv run ruff check .` clean.

## Dev Notes

- **Manifest is a FLAT ARRAY named `__books.json` (AR5) — not a wrapped `manifest.json`.** Architecture's early prose/diagrams say `manifest.json` with a wrapper; the confirmed 2026-06-04 inspection corrected this: `__books.json`, 3.13 MB, 4,374 entries, top-level JSON array. Model the *entry*, parse the file as `list[entry]`. [Source: architecture-onedrive-import.md#Real-manifest-schema]
- **Path mapping (verified 2,343/2,343):** manifest `epubFile` is a repo-relative path like `output/books/<basename>`; the real OneDrive (and thus staging) file is flat at `nhasachmienphi/<basename>`. Resolve with `os.path.basename(epubFile)`. [Source: architecture-onedrive-import.md#Real-manifest-schema, epics-onedrive-import.md#AR5]
- **epub counts (sanity for tests/expectations):** manifest has `epubUrl` on 2,361 entries but `epubFile` on 2,343 — filter on **`epubFile`** (the field that maps to a real local file), not `epubUrl`. [Source: architecture-onedrive-import.md#Real-manifest-schema]
- **Why fail loud on malformed manifest:** the manifest is the single source of metadata for all 2,343 books (title/author/cover/category). A silently-skipped bad entry = a missing or mis-titled book. Surface field-level errors. [Source: architecture-onedrive-import.md#AD-update, prd-onedrive-import.md#D6]
- **pdf retention (FR10):** filtering is in-memory only; never delete or move pdf data — it stays upstream on OneDrive for a future phase. [Source: prd-onedrive-import.md#FR10, #D3]
- **`extra="ignore"`** keeps the model resilient to manifest fields we don't use (`url`, `pdfUrl`, etc.) and to future additions.

### Project Structure Notes

- Creates `apps/onedrive-sync/manifest.py`; extends `sync.py index`. Adds `tests/test_manifest.py` with small JSON fixtures under `tests/fixtures/`.
- Depends on Story 1.1 (`_shared.py`, skeleton) and Story 1.2 (staging populated, or fixtures for tests).

### References

- [Source: architecture-onedrive-import.md#Real-manifest-schema (resolves Risk #6)]
- [Source: architecture-onedrive-import.md#Component-Module-Design — manifest.py responsibility]
- [Source: architecture-onedrive-import.md#Testing-Strategy — manifest parse/reject, epub-only filter]
- [Source: epics-onedrive-import.md#Story-1.3, AR5]
- [Source: prd-onedrive-import.md#Format-Gating FR6, FR8, FR9, FR10, FR11]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
