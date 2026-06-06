# Story 1.5: Map categories and apply quality + licensing gates

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As the operator,
I want each book mapped to an honest category and gated on cover/metadata quality and redistributability,
so that only well-formed, legally-clear books surface and no category is silently dropped.

## Acceptance Criteria

1. **Given** `category-mapping.yaml` is the authoritative lookup (AR12), loaded from `_bmad-output/planning-artifacts/phase-5-onedrive-import/category-mapping.yaml`
   **When** a book's manifest `category` is mapped
   **Then** `mapped` genres resolve onto the existing vnthuquan `target` category strings, `new_categories` resolve to the 4 additive strings (`Triết Học`, `Lịch Sử - Chính Trị`, `Khoa Học - Kỹ Thuật`, `Văn Hóa - Tôn Giáo`), and `excluded` utility genres are dropped from Phase 1 (FR5).

2. **Given** `on_unmapped: error` in the YAML
   **When** a manifest category appears that is absent from all three sections (`mapped`, `new_categories`, `excluded`)
   **Then** the sync **halts** with a clear "unmapped category: '<name>'" error — no silent drop.

3. **Given** the import quality gate (FR22)
   **When** a book is evaluated
   **Then** it is surfaced only if it has a real cover (resolvable `imageFile`) AND clean title/author (non-empty title; author present or explicitly tolerated); books failing the gate are skipped and recorded (FR23).

4. **Given** the licensing checkpoint (FR24, D7)
   **When** the run reaches the release gate
   **Then** redistributability is confirmed (source is `nhasachmienphi.com`, "free book house" — lower risk, still gated); the gate is an explicit, documented step (e.g. a confirmation flag / config acknowledgement) and books not confirmed redistributable are not surfaced.

## Tasks / Subtasks

- [ ] **Task 1: Load category-mapping.yaml** (AC: #1, #2)
  - [ ] Add a loader (use `pyyaml` — add to deps if not present) that reads the three sections (`mapped`, `new_categories`, `excluded`) plus `on_unmapped`.
  - [ ] Build a single lookup: manifest category → (`target` string, action ∈ {map, new, exclude}).
- [ ] **Task 2: Map each candidate** (AC: #1, #2)
  - [ ] For each kept book (post-dedup), look up its manifest `category`:
    - `mapped`/`new_categories` → set `category_name = target`.
    - `excluded` → drop the book, record reason `skipped-excluded-category`.
    - absent from all → **raise** (`on_unmapped: error`) halting the run with the offending category name.
  - [ ] Preserve the original manifest `category` on the candidate (carried into the record in Story 1.6 for future taxonomy use — FR5).
- [ ] **Task 3: Quality gate** (AC: #3)
  - [ ] Skip + record (`skipped-quality`) any book lacking a resolvable cover (`imageFile` missing/empty or file absent in staging) or with an empty/whitespace title.
  - [ ] Decide author policy: empty author is tolerated for surfacing (not all books have one) but recorded; an empty *title* is a hard skip. Document the chosen rule in code comments.
- [ ] **Task 4: Licensing checkpoint** (AC: #4)
  - [ ] Implement as an explicit gate: e.g. a `--licensing-confirmed` flag or a `licensing_confirmed: true` config key that must be set for books to surface; absent → records all as `skipped-licensing` (or halts) with a clear message. Keep it lightweight but real (D7: lower risk, still gated).
- [ ] **Task 5: Wire into `sync.py index`** between dedup (1.4) and emit (1.6).
- [ ] **Task 6: Tests**
  - [ ] mapped genre → vnthuquan target; new-category genre → new string; excluded genre → dropped + recorded.
  - [ ] unmapped genre → raises with the category name.
  - [ ] quality gate: missing cover skipped+recorded; empty title skipped.
  - [ ] licensing gate: unconfirmed → not surfaced; confirmed → surfaced.
  - [ ] `uv run pytest` green; `uv run ruff check .` clean.

## Dev Notes

- **`category-mapping.yaml` is authoritative and already authored** (sibling planning artifact). 14 mapped genres → existing vnthuquan categories (1,742 books); 4 `new_categories` (278 books); 7 `excluded` utility genres (323 books). Net: ~2,020 imported. Do not hardcode the mapping in Python — load the YAML. [Source: category-mapping.yaml, prd-onedrive-import.md#D5]
- **`on_unmapped: error` is a hard requirement (D5, AR12).** A new genre appearing upstream must halt the sync, not silently drop books — this is how we keep the category set honest and intentional. [Source: category-mapping.yaml line 59, prd-onedrive-import.md#D5]
- **New categories honour the project vision over the strict no-new-category rule.** `category_name` is a free string in the index record, so the 4 new categories need **no schema change** anywhere. They surface inside the Sách Truyện bucket (Epic 2). [Source: prd-onedrive-import.md#D5, project-context.md#Vision]
- **Carry the original manifest subject/category (FR5):** even though sub-category browse isn't built in Phase 5, preserve the raw manifest `category` on the record for Phase 5.x. [Source: prd-onedrive-import.md#FR5, #D4]
- **Quality gate rationale (FR22):** the product promise is "every visible book is readable and looks real." A book with no cover or junk title would break the seamless-with-vnthuquan guarantee (FR4). [Source: prd-onedrive-import.md#FR22, #Success-Criteria]
- **Licensing (D7/FR24):** `nhasachmienphi.com` = "free book house," reducing risk, but a confirmation gate before public exposure remains required. Keep the mechanism simple and explicit so the operator consciously acknowledges it each release. [Source: prd-onedrive-import.md#D7, #FR24]
- **YAML structure reference (exact keys):**
  ```
  mapped:        "<manifest cat>": { target: "<vnthuquan cat>", count, fit }
  new_categories:"<manifest cat>": { target: "<new cat>",       count, new: true }
  excluded:      "<manifest cat>": { count, reason }
  on_unmapped: error
  ```
  [Source: category-mapping.yaml]

### Project Structure Notes

- Adds a category-mapping loader + gate logic (new module, e.g. `categories.py`, or functions in `manifest.py`). Extends `sync.py index`.
- The YAML lives in `planning-artifacts/`, not in the app — read it by relative path from the app, or copy/symlink a runtime copy into the app config. Prefer reading the planning-artifact path directly and document it (single source of truth).
- Add `pyyaml` to `apps/onedrive-sync/pyproject.toml` if absent.

### References

- [Source: category-mapping.yaml — authoritative mapping]
- [Source: prd-onedrive-import.md#D5 — category mapping + new categories]
- [Source: prd-onedrive-import.md#D7 — licensing]
- [Source: epics-onedrive-import.md#Story-1.5, AR12]
- [Source: prd-onedrive-import.md#FR5, FR22, FR23, FR24]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
