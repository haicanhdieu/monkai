---
title: 'Move Crawler Codebase'
slug: 'move-crawler-codebase'
created: '2026-03-06T20:06:53+07:00'
status: 'Completed'
stepsCompleted: [1, 2, 3, 4, 5, 6]
tech_stack: ['Python 3.11', 'Typer', 'Pydantic', 'aiohttp', 'pytest', 'devbox']
files_to_modify: ['crawler.py', 'indexer.py', 'pipeline.py', 'validate.py', 'models.py', 'config.yaml', 'utils/', 'tests/', 'data/', 'logs/', 'devbox.json', 'pyproject.toml']
code_patterns: ['Functional/CLI scripts', 'Pydantic Models', 'Asyncio Crawler', 'Scripts expected to run with CWD at the component root']
test_patterns: ['pytest fixtures', 'pytest-asyncio']
---

# Tech-Spec: Move Crawler Codebase

**Created:** 2026-03-06T20:06:53+07:00

## Overview

### Problem Statement

The crawler related code (**Phase 1**) and output data folders are currently located within the project root. These need to be consolidated under a nested `crawler` directory to maintain a clean project structure and ensure proper separation from other components (such as Phase 2 Reader UI).

### Solution

Move all crawler-related Python scripts (`crawler.py`, `indexer.py`, `models.py`, `pipeline.py`, `validate.py`, `book_builder.py`, `parser.py`), directories (`utils/`, `tests/`, `data/`, `logs/`), and configuration files (`config.yaml`) into a newly created `crawler/` directory inside the project root. Adjust any internal relative paths and run scripts to ensure the crawler and test suite continue functioning correctly from within the `crawler/` directory.

### Scope

**In Scope:**
- Creating the `crawler/` directory.
- Moving crawler codebase and artifacts: `crawler.py`, `indexer.py`, `models.py`, `pipeline.py`, `validate.py`, `book_builder.py`, `parser.py`, `config.yaml`, `utils/`, `tests/`, `data/`, `logs/` to the nested `crawler/` folder.
- Updating run scripts and paths in `devbox.json` (e.g., `cd crawler && uv run python ...`).
- Updating `pyproject.toml` test paths or devbox `test` scripts to run pytest correctly from `crawler/`.
- Updating `README.md` tree structure representation to reflect the new `crawler/` folder.

**Out of Scope:**
- Refactoring crawler logic or altering extraction strategies.
- Phase 2 code.

## Context for Development

### Codebase Patterns

- **Path Context:** The crawler scripts heavily rely on executing from their directory root (e.g., they read `config.yaml` or write to `data/` assuming CWD). Moving to `crawler/` means the runtime execution directory for Phase 1 must be from `crawler/`.
- `devbox.json` currently aliases scripts like `uv run python crawler.py` assuming standard execution from root. These will need prefixing with `cd crawler &&` or `cd crawler; `.

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `devbox.json` | Specifies execution scripts (`crawl`, `index`, `validate`, `test`). |
| `pyproject.toml` | Declares dependencies and pytest configuration (`testpaths`). |
| `pipeline.py` | Contains subprocess calls to other scripts (`crawler.py`, `indexer.py`), assuming they're in the same directory. |
| `README.md` | Contains project structure doc block needing update. |

### Technical Decisions

- The project uses `uv` for execution, which auto-resolves `.venv` from parent directories. Thus, `cd crawler && uv run python script.py` will work perfectly, relying on the project root's `pyproject.toml` and `.venv`.
- File imports like `import utils.config` will continue to work out-of-the-box as long as execution happens from the `crawler/` directory, meaning no Python source edits needed for `import` statements if we isolate execution CWD.

## Implementation Plan

### Tasks

- [x] Task 1: Create the `crawler` directory in the project root.
  - File: `crawler/`
  - Action: Create directory.
- [x] Task 2: Move Phase 1 Python scripts to `crawler/`.
  - File: `crawler.py`, `indexer.py`, `pipeline.py`, `validate.py`, `models.py`, `book_builder.py`, `parser.py`
  - Action: Move files from project root to `crawler/`.
- [x] Task 3: Move Phase 1 configuration and artifacts to `crawler/`.
  - File: `config.yaml`, `utils/`, `tests/`, `data/`, `logs/`
  - Action: Move directories and files from project root to `crawler/`.
- [x] Task 4: Update `devbox.json` execution scripts.
  - File: `devbox.json`
  - Action: Update paths in the `scripts` dictionary to run from inside the crawler directory. For example, `"crawl": "cd crawler && uv run python crawler.py"`. Apply this to `parse`, `index`, `validate`, `build`, `test`, `pipeline`. Wait, for pytest, it might be better to either configure `pyproject.toml` or just `cd crawler && uv run pytest`.
- [x] Task 5: Update `pyproject.toml` test paths.
  - File: `pyproject.toml`
  - Action: Update `[tool.pytest.ini_options] testpaths = ["tests"]` to `["crawler/tests"]` OR remove it if devbox handles `cd crawler && uv run pytest`. Given devbox is the standard, `testpaths = ["crawler/tests"]` is safer for IDE runners in the root. Let's update `testpaths` to point to `"crawler/tests"`.
- [x] Task 6: Update `README.md` project structure documentation.
  - File: `README.md`
  - Action: Update the directory tree text block to show Phase 1 contents nested under `crawler/`. Also, confirm any references to paths like `data/raw/` mention they are now `crawler/data/raw/`.

### Acceptance Criteria

- [x] AC 1: Given the codebase is restructured, when running `devbox run test` from the project root, then all 170+ tests should execute and pass without path/import errors.
- [x] AC 2: Given the codebase is restructured, when running `devbox run pipeline` from the project root, then the pipeline triggers scripts correctly (because `devbox run pipeline` executes `cd crawler && python pipeline.py`, and `pipeline.py` executes `uv run python crawler.py` in its local CWD without path errors).
- [x] AC 3: Given the `README.md` is viewed, when reading the Project Structure section, then it accurately reflects the new `crawler/` parent directory.

## Additional Context

### Dependencies

- Relies on Git for safely moving files (`git mv` should be used where possible to preserve history).

### Testing Strategy

- **Manual Testing Step**: Run `devbox run test` to verify imports and file resolution.
- **Manual Testing Step**: Run `devbox run pipeline` to verify subprocess execution of the crawler pieces via the pipeline script.

### Notes

- Using `git mv` via shell commands is heavily recommended during the transition to preserve the Git history of these heavily iterated crawler files.

## Review Notes
- Adversarial review completed
- Findings: 10 total, 9 fixed, 1 skipped (F3 - skipped due to module naming collision with crawler.py)
- Resolution approach: auto-fix
