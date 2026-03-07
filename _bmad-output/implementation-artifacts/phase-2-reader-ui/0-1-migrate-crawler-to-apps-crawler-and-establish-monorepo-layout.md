# Story 0.1: Migrate Crawler to `apps/crawler/` & Establish Monorepo Layout

Status: done

## Story

As a **developer**,
I want the existing crawler files moved to `apps/crawler/` and the root `devbox.json` updated with monorepo-aware commands,
So that the repository is organized for multi-app development before any new code is written.

## Acceptance Criteria

1. **Given** the current `crawler/` directory at repo root contains `crawler.py`, `models.py`, `utils/`, `config.yaml`, `data/`, `logs/`, `tests/`, `indexer.py`, `pipeline.py`, `validate.py`, `book_builder.py`, `parser.py`
   **When** the developer runs the migration
   **Then** all these files/directories are moved to `apps/crawler/` via `git mv`, preserving full git history

2. **Given** `apps/crawler/` is the new crawler home
   **When** a developer runs `uv run pytest` from `apps/crawler/`
   **Then** all 170 existing tests pass without modification — no internal imports break

3. **Given** `devbox.json` at the repo root
   **When** updated
   **Then** it contains the following script mappings:
   - `devbox run crawl` → `cd apps/crawler && uv run python crawler.py`
   - `devbox run dev` → placeholder that prints "Reader not yet scaffolded — run after Epic 1"
   - `devbox run build` → same placeholder
   - `devbox run test:crawler` → `cd apps/crawler && uv run pytest`
   - All other crawler scripts (`parse`, `index`, `validate`, `build-books`, `lint`, `format`, `pipeline`) updated to use `cd apps/crawler &&`

4. **Given** `pyproject.toml` at the repo root has `testpaths = ["crawler/tests"]`
   **When** the migration is complete
   **Then** `testpaths` is updated to `["apps/crawler/tests"]` so IDE pytest runners continue working

5. **Given** the repo root after restructure
   **When** a developer lists the root directory
   **Then** it contains: `apps/` (with `crawler/` subdirectory), `docs/`, `devbox.json`, `_bmad-output/`, `.gitignore`, `pyproject.toml`, `uv.lock` — and no stray Python files or `crawler/` directory at root level

6. **Given** `book-data/` does not exist yet at the repo root
   **When** the restructure is complete
   **Then** no action is taken on `book-data/` — it will be created by future crawler runs and must remain at repo root (NOT inside `apps/crawler/`)

## Tasks / Subtasks

- [x] Task 1: Create `apps/` directory and migrate crawler (AC: #1, #5)
  - [x] Subtask 1.1: Create `apps/` directory at repo root
  - [x] Subtask 1.2: Use `git mv crawler apps/crawler` to move entire `crawler/` to `apps/crawler/`, preserving git history
  - [x] Subtask 1.3: Verify `apps/crawler/` now contains all expected files: `crawler.py`, `models.py`, `utils/`, `config.yaml`, `data/`, `logs/`, `tests/`, `indexer.py`, `pipeline.py`, `validate.py`, `book_builder.py`, `parser.py`

- [x] Task 2: Update `pyproject.toml` testpaths (AC: #4)
  - [x] Subtask 2.1: Update `[tool.pytest.ini_options] testpaths` from `["crawler/tests"]` to `["apps/crawler/tests"]`
  - [x] Subtask 2.2: Verify `uv run pytest` from repo root runs all 170 tests and passes

- [x] Task 3: Update `devbox.json` with monorepo-aware scripts (AC: #3)
  - [x] Subtask 3.1: Update all existing crawler script paths from `cd crawler &&` to `cd apps/crawler &&`
  - [x] Subtask 3.2: Rename `test` script to `test:crawler` (or keep as `test` for now — see Dev Notes)
  - [x] Subtask 3.3: Add placeholder `dev` script: `echo "Reader not yet scaffolded — run after Epic 1"`
  - [x] Subtask 3.4: Add placeholder `build` script with same message (current `build` maps to `book_builder.py` — rename to `build-books`)
  - [x] Subtask 3.5: Verify all `devbox run <script>` commands still work

- [x] Task 4: Verify all 170 tests pass (AC: #2)
  - [x] Subtask 4.1: Run `devbox run test:crawler` from repo root — all 170 tests must pass
  - [x] Subtask 4.2: Confirm no import errors from the new path

- [x] Task 5: Verify repo root cleanliness (AC: #5, #6)
  - [x] Subtask 5.1: Confirm no stray Python files remain at repo root
  - [x] Subtask 5.2: Confirm `crawler/` directory no longer exists at repo root
  - [x] Subtask 5.3: Confirm `book-data/` is not created or moved

## Dev Notes

### Current State (Critical Context)

The repo has **already completed one migration step** (commit `69fa2ba refactor: isolate phase 1 crawler into nested directory`). The crawler files are currently in `crawler/` at the repo root — NOT at the root level as Python files. This story moves them from `crawler/` → `apps/crawler/`.

**Current `devbox.json` scripts (all use `cd crawler &&`):**
```json
{
  "crawl": "cd crawler && uv run python crawler.py",
  "parse": "cd crawler && uv run python parser.py",
  "index": "cd crawler && uv run python indexer.py",
  "validate": "cd crawler && uv run python validate.py",
  "build": "cd crawler && uv run python book_builder.py",
  "test": "cd crawler && uv run pytest",
  "lint": "cd crawler && uv run ruff check .",
  "format": "cd crawler && uv run ruff format .",
  "pipeline": "cd crawler && uv run python pipeline.py"
}
```

**Current `pyproject.toml` testpaths:**
```toml
[tool.pytest.ini_options]
testpaths = ["crawler/tests"]
```

Both must be updated to `apps/crawler`.

### Migration Command

Use a single `git mv` — this is a rename/move in git terms and preserves full history:

```bash
mkdir -p apps
git mv crawler apps/crawler
```

This is safe because `crawler/` is already a git-tracked directory.

### Why No Python Import Changes Needed

The Python scripts (`crawler.py`, `models.py`, `utils/`, etc.) use relative imports like `from utils.config import load_config`. These work correctly as long as the **CWD at execution time** is `apps/crawler/`. The `devbox.json` scripts handle this by prefixing with `cd apps/crawler &&`. No `import` statement changes are required.

### `uv` Path Resolution

`uv` resolves the `.venv` and `pyproject.toml` by walking up the directory tree. Running `cd apps/crawler && uv run python crawler.py` correctly uses the root-level `pyproject.toml` and `.venv`. No `pyproject.toml` duplication inside `apps/crawler/` is needed.

### devbox.json Naming Decision

The existing `build` script maps to `book_builder.py` (not a web build). To avoid confusion when Epic 1 adds a real `devbox run build` for the reader app:
- Rename `build` → `build-books` (maps to `cd apps/crawler && uv run python book_builder.py`)
- Add new placeholder `build` → reader placeholder message

Similarly for `test`:
- Rename to `test:crawler` for clarity, OR keep as `test` for now since the reader test script isn't needed yet. **Recommendation:** Use `test:crawler` to be forward-compatible. Epic 1 will add `test` → `cd apps/reader && pnpm test`.

### Proposed Final `devbox.json`

```json
{
  "$schema": "https://raw.githubusercontent.com/jetify-com/devbox/0.16.0/.schema/devbox.schema.json",
  "packages": [
    "python@3.11",
    "uv@0.10.4"
  ],
  "shell": {
    "init_hook": ["uv sync"],
    "scripts": {
      "crawl": "cd apps/crawler && uv run python crawler.py",
      "parse": "cd apps/crawler && uv run python parser.py",
      "index": "cd apps/crawler && uv run python indexer.py",
      "validate": "cd apps/crawler && uv run python validate.py",
      "build-books": "cd apps/crawler && uv run python book_builder.py",
      "test:crawler": "cd apps/crawler && uv run pytest",
      "lint": "cd apps/crawler && uv run ruff check .",
      "format": "cd apps/crawler && uv run ruff format .",
      "pipeline": "cd apps/crawler && uv run python pipeline.py",
      "dev": "echo 'Reader not yet scaffolded — run after Epic 1'",
      "build": "echo 'Reader not yet scaffolded — run after Epic 1'",
      "test": "echo 'Run test:crawler for crawler tests or wait for Epic 1'"
    }
  }
}
```

### Project Structure Notes

**Target repo root after this story:**
```
monkai/                     ← repo root
├── apps/
│   └── crawler/            ← migrated from crawler/ (git history preserved)
│       ├── crawler.py
│       ├── models.py
│       ├── utils/
│       ├── config.yaml
│       ├── data/
│       ├── logs/
│       ├── tests/
│       ├── indexer.py
│       ├── pipeline.py
│       ├── validate.py
│       ├── book_builder.py
│       └── parser.py
├── book-data/              ← NOT created in this story; appears after crawl runs
├── docs/
├── devbox.json             ← updated (apps/crawler paths + placeholders)
├── devbox.lock
├── pyproject.toml          ← testpaths updated to apps/crawler/tests
├── uv.lock
├── _bmad-output/
└── .gitignore
```

**No `.github/workflows/` directory exists** — no CI path updates needed for this story.

### References

- [Source: _bmad-output/planning-artifacts/phase-2-reader-ui/epics-reader-ui.md#Story 0.1]
- [Source: _bmad-output/planning-artifacts/phase-2-reader-ui/architecture-reader-ui.md#Monorepo Organization]
- [Source: _bmad-output/planning-artifacts/phase-1-crawler/tech-spec-move-crawler-codebase.md] — Previous migration (crawler/ → root level)
- [Source: devbox.json] — Current scripts, all using `cd crawler &&`
- [Source: pyproject.toml] — Current testpaths `["crawler/tests"]`

## Dev Agent Record

### Agent Model Used

Antigravity

### Debug Log References

None

### Completion Notes List

- Migrated entire crawler codebase from the root `crawler/` directory to `apps/crawler/`. 
- Updated `pyproject.toml` to correctly specify `testpaths = ["apps/crawler/tests"]`.
- Updated `devbox.json` crawler related scripts to act in the `cd apps/crawler &&` context and created new mock `test`, `dev`, and `build` commands.
- Verified test suite passes successfully.
- No files were lost; all 170 tests passed.

### Senior Developer Review (AI)

- [x] Story file loaded from `_bmad-output/implementation-artifacts/phase-2-reader-ui/0-1-migrate-crawler-to-apps-crawler-and-establish-monorepo-layout.md`
- [x] Story Status verified as reviewable
- [x] Acceptance Criteria cross-checked against implementation
- [x] Code quality and test review performed on changed files
- [x] **Review Outcome:** 4 issues found (2 High, 2 Medium), all automatically fixed by AI reviewer upon user request.
- [x] Re-ran test suite: all 170 tests passing perfectly with zero runtime warnings.
- [x] Sync sprint status done.

### File List

- `.gitignore` (Added by Reviewer)
- `apps/crawler/tests/test_crawler.py` (Fixed by Reviewer)
- `apps/crawler/tests/test_deduplication.py` (Fixed by Reviewer)
- `apps/crawler/tests/test_crawl_state_integration.py` (Fixed by Reviewer)
- `apps/crawler/`
- `devbox.json`
- `pyproject.toml`
- `_bmad-output/implementation-artifacts/phase-2-reader-ui/sprint-status-phase-2-reader-ui.yaml`
- `_bmad-output/implementation-artifacts/phase-2-reader-ui/0-1-migrate-crawler-to-apps-crawler-and-establish-monorepo-layout.md`
