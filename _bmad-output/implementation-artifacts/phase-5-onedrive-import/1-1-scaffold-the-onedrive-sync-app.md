# Story 1.1: Scaffold the onedrive-sync app

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As the project operator (Minh),
I want a standalone `apps/onedrive-sync/` app with its CLI skeleton, vendored helpers, and secret-safe gitignore,
so that I have an isolated, invocable foundation for the import pipeline that never couples to the crawler or leaks credentials.

## Acceptance Criteria

1. **Given** the monorepo per-app convention (CWD = app dir, unqualified imports)
   **When** `apps/onedrive-sync/` is created with its own `uv` `pyproject.toml` (deps: `typer`, `pydantic`, `lxml`)
   **Then** `cd apps/onedrive-sync && uv run python sync.py --help` lists three commands: `pull`, `index`, `all`
   **And** each command exists as a Typer command (may be a stub that prints "not yet implemented" and exits 0 for `index`/`all`; `pull` likewise) — wiring, not behaviour, is the deliverable here.

2. **Given** the devbox script convention (root `devbox.json` `shell.scripts`)
   **When** scripts are added
   **Then** `sync-books`, `sync-books:pull`, `sync-books:index` resolve to `cd apps/onedrive-sync && uv run python sync.py all|pull|index` respectively (AR1)
   **And** `devbox run sync-books:pull` invokes the `pull` stub without error.

3. **Given** the rule that the crawler must not be cross-imported (AD-5)
   **When** `_shared.py` is authored
   **Then** it contains **vendored** copies of `slugify_title` and `sha256_hash` (byte-for-byte logic from `apps/crawler/utils/`), plus a namespaced id builder `make_onedrive_id(source, title, author=None)`
   **And** no line in `apps/onedrive-sync/` imports from `apps.crawler` or `crawler` (verify by grep).

4. **Given** the id-format decision (AR9, Risk #4)
   **When** `make_onedrive_id("nhasachmienphi", "Đắc Nhân Tâm")` is called
   **Then** it returns `onedrive:nhasachmienphi:dac-nhan-tam` (colon-namespaced, **not** the crawler's `__` form)
   **And** when an `author` is supplied for collision disambiguation, it returns `onedrive:nhasachmienphi:<title-slug>-<author-slug>`.

5. **Given** drift from the crawler original must be caught
   **When** `tests/test_shared.py` runs
   **Then** it pins `slugify_title`, `sha256_hash`, and `make_onedrive_id` outputs against known inputs (including the Vietnamese `Đ/đ` cases and a colon-id case) and all pass under `uv run pytest` (AR2).

6. **Given** secrets must never be committed (AR13)
   **When** `apps/onedrive-sync/.gitignore` is written
   **Then** it ignores `staging/` and `*.conf`
   **And** `rclone.py` exists as a thin `subprocess` wrapper around `rclone` that surfaces stderr and raises on non-zero exit (the wrapper body may be minimal here; Story 1.2 drives its behaviour).

## Tasks / Subtasks

- [ ] **Task 1: Create the app skeleton** (AC: #1)
  - [ ] Create `apps/onedrive-sync/pyproject.toml` — own `uv` project, `requires-python = ">=3.11"`, deps `typer`, `pydantic` (v2), `lxml`; dev deps `pytest`, `ruff`. Mirror the structure/style of `apps/crawler`'s project config but keep it self-contained (do NOT reference the root crawler project).
  - [ ] Create `apps/onedrive-sync/sync.py` — Typer app with three commands: `pull`, `index`, `all`. `all` should (eventually) call `pull` → `index` → compose → publish; for now stub each command.
  - [ ] Verify `cd apps/onedrive-sync && uv run python sync.py --help` shows all three commands.
- [ ] **Task 2: Wire devbox scripts** (AC: #2)
  - [ ] Add to root `devbox.json` `shell.scripts`: `"sync-books": "cd apps/onedrive-sync && uv run python sync.py all"`, `"sync-books:pull": "cd apps/onedrive-sync && uv run python sync.py pull"`, `"sync-books:index": "cd apps/onedrive-sync && uv run python sync.py index"`.
  - [ ] Note: `devbox.json` already has local modifications (M in git status) — preserve existing scripts; append only.
- [ ] **Task 3: Vendor shared helpers** (AC: #3, #4)
  - [ ] Create `apps/onedrive-sync/_shared.py` with `slugify_title(title)` and `sha256_hash(file_bytes)` copied from `apps/crawler/utils/slugify.py` and `apps/crawler/utils/dedup.py` (do NOT import them).
  - [ ] Add `make_onedrive_id(source: str, title: str, author: str | None = None) -> str` → `f"onedrive:{slugify_title(source)}:{slugify_title(title)}"`, appending `f"-{slugify_title(author)}"` when `author` is provided.
  - [ ] Grep-verify no `apps.crawler` / `from crawler` imports anywhere under `apps/onedrive-sync/`.
- [ ] **Task 4: Pin vendored helpers with tests** (AC: #5)
  - [ ] Create `apps/onedrive-sync/tests/conftest.py` (add app dir to `sys.path` so `from _shared import ...` works — mirror crawler `conftest.py` pattern).
  - [ ] Create `apps/onedrive-sync/tests/test_shared.py`: assert `slugify_title("Kinh Đại Bát Niết Bàn") == "kinh-dai-bat-niet-ban"`, `slugify_title("Đắc Nhân Tâm") == "dac-nhan-tam"`, `sha256_hash(b"hello") == "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"`, `make_onedrive_id("nhasachmienphi", "Đắc Nhân Tâm") == "onedrive:nhasachmienphi:dac-nhan-tam"`, and a disambiguation case with `author`.
- [ ] **Task 5: Secret-safe gitignore + rclone wrapper stub** (AC: #6)
  - [ ] Create `apps/onedrive-sync/.gitignore` containing `staging/` and `*.conf`.
  - [ ] Create `apps/onedrive-sync/rclone.py` — `run(args: list[str]) -> str` wrapping `subprocess.run(["rclone", *args], ...)`, capturing stdout/stderr, raising `RuntimeError` with stderr on non-zero exit.
- [ ] **Task 6: Verify** (AC: all)
  - [ ] `cd apps/onedrive-sync && uv run pytest` is green; `uv run ruff check .` is clean.

## Dev Notes

- **Standalone app, not a deployer subcommand (AD-5).** `apps/deployer/` is bash/Node that runs *on the Pi*. This is Mac-side Python. Keep `apps/onedrive-sync/` fully isolated with its own `uv` project. [Source: architecture-onedrive-import.md#AD-5]
- **No cross-import of crawler (AR2).** The crawler relies on the "CWD = app dir, unqualified imports" convention; importing it from here would break that and couple two isolated apps. Vendor the tiny helpers instead and pin them with tests so drift is caught. [Source: architecture-onedrive-import.md#AD-5, project-context.md#Crawler-specific]
- **ID format decision (resolves Risk #4 / AR9).** The crawler's `make_id` emits `{source}__{title}` (double underscore — see `apps/crawler/utils/slugify.py:31`). Phase 5 deliberately uses the **colon** form `onedrive:{source}:{slug}` so onedrive ids are visually and structurally distinct from crawler ids (`vnthuquan__...`, `vbeta__...`). Both are collision-free against the crawler. **Do not reuse `make_id` verbatim.** [Source: architecture-onedrive-import.md#Risks-Open-Items item 4; epics-onedrive-import.md#Story-1.4 AR9]
- **`slugify_title` is Vietnamese-aware:** it pre-maps `Đ/đ` → `D/d` before NFKD (combining marks don't cover the stroke). Copy this exactly. [Source: apps/crawler/utils/slugify.py]
- **Execution context (project-context.md):** all commands run with CWD = `apps/onedrive-sync`; imports are unqualified (`from _shared import ...`, `from manifest import ...`). Tests need `conftest.py` to put the app dir on `sys.path`, exactly as the crawler does.
- **`pdf`/heavy deps deferred:** `lxml` is a dep now for the later `extract.py` OPF fallback (Story 1.6), but the Phase-1 critical path uses the manifest for metadata, so `extract.py` is not built in this story. [Source: architecture-onedrive-import.md#AD-update]
- **Testing standard:** pytest red-first like the crawler — `uv run pytest`, ruff for lint. [Source: architecture-onedrive-import.md#Testing-Strategy, AR14]

### Project Structure Notes

- Target layout (this story creates the bolded files): [Source: architecture-onedrive-import.md#Repo-Layout]
  ```
  apps/onedrive-sync/
  ├── pyproject.toml      ← this story
  ├── sync.py             ← this story (skeleton)
  ├── rclone.py           ← this story (stub wrapper)
  ├── _shared.py          ← this story
  ├── .gitignore          ← this story
  ├── manifest.py         ← Story 1.3
  ├── compose.py          ← Story 1.6
  ├── extract.py          ← Story 1.6 (fallback only)
  ├── staging/            ← gitignored, created at runtime by Story 1.2
  └── tests/
      ├── conftest.py     ← this story
      ├── test_shared.py  ← this story
      └── fixtures/sample.epub  ← Story 1.6
  ```
- `apps/reader/.gitkeep` and `devbox.json` already show as modified/untracked in git — do not revert; append devbox scripts only.

### References

- [Source: architecture-onedrive-import.md#AD-5 — Standalone app, not a deployer subcommand]
- [Source: architecture-onedrive-import.md#Component-Module-Design — module table]
- [Source: architecture-onedrive-import.md#Repo-Layout-Invocation]
- [Source: architecture-onedrive-import.md#Security-Auth — .gitignore staging/ *.conf]
- [Source: epics-onedrive-import.md#Story-1.1]
- [Source: apps/crawler/utils/slugify.py, apps/crawler/utils/dedup.py — vendoring sources]
- [Source: project-context.md#Crawler-specific — execution context, conftest sys.path]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
