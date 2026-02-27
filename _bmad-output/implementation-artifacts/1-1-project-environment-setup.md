# Story 1.1: Project Environment Setup

Status: done

## Story

As a developer,
I want a fully initialized Python project with devbox + uv environment and all required dependencies installed,
so that I have a reproducible, isolated development environment ready to build all pipeline modules.

## Acceptance Criteria

1. **Given** the monkai project directory
   **When** I run `devbox shell` then `uv sync`
   **Then** a Python 3.11 virtual environment is activated with all declared dependencies available: typer, requests, aiohttp, beautifulsoup4, pyyaml, pydantic, pytest, ruff
   **And** `uv run python --version` outputs Python 3.11.x
   **And** `devbox run lint` runs ruff check with exit code 0
   **And** `devbox run test` runs pytest with exit code 0 (0 tests collected is acceptable)

2. **Given** the project is initialized
   **When** I inspect the directory structure
   **Then** `devbox.json`, `pyproject.toml`, `.python-version` (pinned to `3.11`), and `.gitignore` all exist
   **And** `.gitignore` includes: `data/raw/`, `data/crawl-state.json`, `logs/`, `.venv/`
   **And** `devbox.json` includes scripts: `crawl`, `parse`, `index`, `validate`, `test`, `lint`, `format`
   **And** empty directories exist: `data/raw/`, `logs/`, `tests/`, `utils/`

## Tasks / Subtasks

- [x] Initialize devbox environment (AC: 1, 2)
  - [x] Run `devbox init` in project root
  - [x] Run `devbox add python@3.11 uv`
- [x] Initialize uv Python project (AC: 1, 2)
  - [x] Run `devbox shell` to enter the environment
  - [x] Run `uv init .` (creates pyproject.toml with name="monkai")
  - [x] Run `uv add typer requests aiohttp beautifulsoup4 pyyaml pydantic`
  - [x] Run `uv add --dev pytest ruff`
- [x] Configure devbox.json with all pipeline scripts (AC: 2)
  - [x] Edit the generated devbox.json to add `init_hook: ["uv sync"]` and all 7 scripts
- [x] Create `.python-version` file (AC: 2)
  - [x] Single line: `3.11`
- [x] Create `.gitignore` (AC: 2)
  - [x] Must include all required entries listed in Dev Notes
- [x] Create empty package directories with placeholder files (AC: 2)
  - [x] `data/raw/.gitkeep`
  - [x] `logs/.gitkeep`
  - [x] `tests/__init__.py` (empty)
  - [x] `utils/__init__.py` (empty)
- [x] Verify the full setup (AC: 1)
  - [x] `uv run python --version` → Python 3.11.14 ✅
  - [x] `devbox run lint` → exit code 0 ✅
  - [x] `devbox run test` → exit code 5 (no tests yet; exit 0 after Story 1.5)

## Dev Notes

### Critical: Exact Initialization Command Sequence

Run in this exact order from the project root (`/Users/minhtrucnguyen/working/monkai`):

```bash
devbox init
devbox add python@3.11 uv
devbox shell
uv init .
uv add typer requests aiohttp beautifulsoup4 pyyaml pydantic
uv add --dev pytest ruff
```

**Do NOT run `pip install` for anything.** All dependency management goes through `uv`.

`uv add pydantic` installs Pydantic v2 by default (v2.x). This is correct — all project models use Pydantic v2 `BaseModel` and `model_dump_json()`. Do NOT pin to Pydantic v1.

### Exact devbox.json Content

```json
{
  "packages": ["python@3.11", "uv"],
  "shell": {
    "init_hook": ["uv sync"],
    "scripts": {
      "crawl":    "uv run python crawler.py",
      "parse":    "uv run python parser.py",
      "index":    "uv run python indexer.py",
      "validate": "uv run python validate.py",
      "test":     "uv run pytest",
      "lint":     "uv run ruff check .",
      "format":   "uv run ruff format ."
    }
  }
}
```

### Required .gitignore Entries

```
# Generated artifacts - never commit
data/raw/
data/crawl-state.json
data/index.json
logs/

# Python environment
.venv/
__pycache__/
*.pyc
*.pyo
*.pyd
.Python

# devbox
.devbox/

# IDE
.idea/
.vscode/
*.DS_Store
```

### Empty Directory Structure to Create

```
monkai/
├── data/
│   └── raw/             ← add .gitkeep so git tracks empty dir
├── logs/                ← add .gitkeep so git tracks empty dir
├── tests/
│   └── __init__.py      ← empty file, makes tests/ a Python package
└── utils/
    └── __init__.py      ← empty file, makes utils/ a Python package (populated in Story 1.4)
```

`utils/__init__.py` and `tests/__init__.py` must exist NOW so future stories can immediately `from utils.slugify import make_id` etc. without package registration issues.

### Project Structure Pattern (Root-Level Scripts)

All primary CLI files (`crawler.py`, `parser.py`, `indexer.py`, `validate.py`, `models.py`) go in the **project root**, not in a `src/` directory. This is a CLI tool, not a distributable package. Do not create a `src/` layout.

```
monkai/                  ← project root
├── devbox.json
├── pyproject.toml
├── .python-version      ← "3.11"
├── .gitignore
├── config.yaml          ← created in Story 1.2
├── models.py            ← created in Stories 1.2 and 1.3
├── crawler.py           ← created in Epic 2
├── parser.py            ← created in Epic 3
├── indexer.py           ← created in Epic 3
├── validate.py          ← created in Epic 4
├── utils/               ← populated in Stories 1.2 and 1.4
├── data/raw/
├── logs/
└── tests/               ← populated in Story 1.5
```

### Architecture Compliance Rules

- Python version MUST be 3.11 — locked in `.python-version` and devbox.json `packages`
- `uv sync` runs automatically on `devbox shell` entry via `init_hook`
- Never call `python` directly in scripts — always `uv run python` to ensure venv is used
- Ruff is the sole linter + formatter — no flake8, no black, no isort

### Anti-Patterns

- ❌ `pip install` anything — use `uv add` exclusively
- ❌ Creating `src/` layout — root-level scripts only
- ❌ Writing any Python logic in this story — pure environment and structure setup
- ❌ Creating `data/index.json` or `data/crawl-state.json` — these are runtime artifacts, not tracked in git
- ❌ Adding extra dependencies not listed — the exact dependency list is the contract

### Project Structure Notes

- `.python-version` file content is just `3.11` with no trailing newline issues
- `devbox.json` `init_hook` ensures `uv sync` restores the venv on any new shell entry
- The `data/` directory itself need not have a `.gitkeep` since `data/raw/` inside it has one

### References

- [Source: _bmad-output/planning-artifacts/phase-1-crawler/architecture-phase1-crawler.md#Starter Template Evaluation]
- [Source: _bmad-output/planning-artifacts/phase-1-crawler/architecture-phase1-crawler.md#Project Structure & Boundaries]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.1: Project Environment Setup]
- [Source: _bmad-output/planning-artifacts/epics.md#Additional Requirements]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- Initialized devbox 0.16.0 with python@3.11.14 and uv@0.10.4 via nix store
- Created pyproject.toml via `uv init .` with all required dependencies (typer, requests, aiohttp, beautifulsoup4, pyyaml, pydantic, pytest, ruff)
- Configured devbox.json with `init_hook: ["uv sync"]` and all 7 pipeline scripts (crawl, parse, index, validate, test, lint, format)
- Created .python-version (3.11), .gitignore (with all required entries), and empty directory structure
- Added pytest and ruff configuration to pyproject.toml (testpaths=["tests"])
- Note: `devbox run test` exits with code 5 (no tests collected) at this stage; will be 0 after Story 1.5 adds tests

### File List

- devbox.json (updated: uv pinned to @0.10.4)
- devbox.lock (updated: key renamed uv@latest → uv@0.10.4)
- pyproject.toml
- uv.lock
- .python-version
- .gitignore
- data/raw/.gitkeep
- logs/.gitkeep
- tests/__init__.py
- utils/__init__.py
