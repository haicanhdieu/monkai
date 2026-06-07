# Story 1.2: Pull eligible files from OneDrive via rclone

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As the operator,
I want `sync.py pull` to authenticate interactively and copy only epub + manifest from OneDrive into local staging,
so that all OneDrive access and SSO happen on my Mac and nothing else is downloaded.

## Acceptance Criteria

1. **Given** the established `onedrive-monkai` remote (personal drive `6416CBB4AB103737`, `drive_type=personal`)
   **When** `sync.py pull` runs
   **Then** it invokes `rclone copy onedrive-monkai:PUBLIC-DATA/LIBERET/BOOK-FILES ./staging/onedrive/` scoped with `--include "*.epub" --include "__books.json"` (AR3)
   **And** the exact `rclone` argument vector is produced by code under test (so it can be asserted without a live network call).

2. **Given** a wrong/unreachable remote path
   **When** the pull runs
   **Then** it fails fast surfacing rclone's stderr (the `rclone.py` wrapper raises on non-zero exit) — no silent partial success.

3. **Given** OneDrive now requires authentication on access
   **When** the pull runs and no valid token is cached
   **Then** rclone triggers an interactive browser SSO on the Mac (FR13) — the tool does not attempt to inject or persist credentials itself
   **And** the run is manual and human-initiated — there is no daemon, cron, or scheduled trigger (FR12).

4. **Given** a successful pull
   **When** it completes
   **Then** `staging/onedrive/nhasachmienphi/` holds the epub files and `__books.json`, and `staging/` is gitignored (verify `.gitignore` from Story 1.1 covers it).

## Tasks / Subtasks

- [x] **Task 1: Build the rclone copy invocation** (AC: #1)
  - [x] In `rclone.py` (or a small `pull` helper), add a function that returns the argument vector: `["copy", "onedrive-monkai:PUBLIC-DATA/LIBERET/BOOK-FILES", "./staging/onedrive/", "--include", "*.epub", "--include", "__books.json"]`. Keep arg construction pure/testable; execution separate.
  - [x] Ensure `staging/onedrive/` is created (mkdir parents) before invoking rclone.
- [x] **Task 2: Implement `pull` command** (AC: #1, #2, #3)
  - [x] Wire `sync.py pull` to call the rclone wrapper with the vector above; stream/surface rclone output to the console (operator needs to see the SSO prompt and progress).
  - [x] On non-zero exit, let `rclone.py`'s `RuntimeError` propagate with stderr — fail fast.
  - [x] Do NOT add any token/credential handling — rclone owns OAuth in `~/.config/rclone/rclone.conf`.
- [x] **Task 3: Tests** (AC: #1, #2)
  - [x] `tests/test_pull.py`: assert the rclone argument vector matches AC #1 exactly (mock the executor — no live rclone).
  - [x] Assert that a mocked non-zero rclone exit raises and surfaces stderr.
- [x] **Task 4: Verify** (AC: #4)
  - [x] Confirm `.gitignore` ignores `staging/`; `git status` shows no staged epub/manifest after a (real or simulated) pull.
  - [x] `uv run pytest` green; `uv run ruff check .` clean.

## Dev Notes

- **rclone is the established transport (AD-3).** The `onedrive-monkai` remote and the OAuth dance were set up in `_bmad-output/implementation-artifacts/spec-book-data-onedrive-migration-p1.md`. Reuse it — do **not** write a Graph API client (git `9ddff8f` did exactly that and was reverted in `9ddff8f`'s follow-up). [Source: architecture-onedrive-import.md#AD-3]
- **Why Mac-mediated (AD-4 / NFR10).** OneDrive token refresh is fragile on a headless Pi. SSO is interactive in a browser on the Mac; the Pi never sees a OneDrive credential. This is the core reason a Pi cron daemon was rejected. [Source: architecture-onedrive-import.md#AD-4, prd-onedrive-import.md#Security-Access]
- **Confirmed remote layout (2026-06-04 inspection):** only `nhasachmienphi` has epub (2,343) and a manifest (`__books.json`, 4,374 entries). The other two sources (`thuviensach`, `thuviensach-14011-15810`) are 100% pdf with no manifest — the `--include` globs naturally skip them (no `.epub`, and `__books.json` only exists under `nhasachmienphi`). [Source: architecture-onedrive-import.md#Confirmed-remote-layout, prd-onedrive-import.md#Resolved-Decisions]
- **Manifest filename is `__books.json`, NOT `manifest.json` (AR5).** The architecture's older diagrams say `manifest.json`; the *real* file is `__books.json`. Use `__books.json` in the include glob. [Source: architecture-onedrive-import.md#Real-manifest-schema, epics-onedrive-import.md#AR5]
- **Incremental by size+modtime.** `rclone copy` skips unchanged files, so a re-pull is cheap — this is what makes idempotency (Story 1.7) work at the transport layer. [Source: architecture-onedrive-import.md#Idempotency-Re-sync]
- **Remote path is a working assumption (Risk #5).** `PUBLIC-DATA/LIBERET/BOOK-FILES` and remote name `onedrive-monkai` are from the Phase-1 migration spec. A wrong path fails fast at `rclone copy` (AC #2), so low risk — but if the first real run errors, verify the remote name with `rclone listremotes` and the path with `rclone lsd onedrive-monkai:PUBLIC-DATA/LIBERET`. [Source: architecture-onedrive-import.md#Risks-Open-Items item 5]

### Project Structure Notes

- Touches `apps/onedrive-sync/sync.py` (the `pull` command) and `rclone.py` (created in Story 1.1). Creates `staging/onedrive/` at runtime (gitignored).
- No reader or crawler files touched.

### References

- [Source: architecture-onedrive-import.md#AD-3 — Transport is rclone]
- [Source: architecture-onedrive-import.md#AD-4 — Topology is Mac-mediated and manual]
- [Source: architecture-onedrive-import.md#Pipeline — step 1 pull]
- [Source: architecture-onedrive-import.md#Confirmed-Data-Simplifications]
- [Source: epics-onedrive-import.md#Story-1.2, AR3, AR5]
- [Source: prd-onedrive-import.md#Security-Access — FR12, FR13]
- [Source: _bmad-output/implementation-artifacts/spec-book-data-onedrive-migration-p1.md — remote setup]

## Dev Agent Record

### Agent Model Used
claude-sonnet-4-6

### Debug Log References
None.

### Completion Notes List
- Added `build_pull_args()` to `rclone.py` — pure function returning exact AC#1 vector; constants `_REMOTE` and `_STAGING` named for clarity.
- `sync.py pull` creates `staging/onedrive/` (mkdir parents), calls `build_pull_args()`, runs rclone without capturing output so SSO prompt and progress stream to console; exits with rclone's code on failure.
- No credential handling — rclone manages OAuth via `~/.config/rclone/rclone.conf`.
- 2 new tests: vector assertion and non-zero exit error propagation; all 7 tests pass.

### File List
- apps/onedrive-sync/rclone.py (modified — added build_pull_args())
- apps/onedrive-sync/sync.py (modified — wired pull command)
- apps/onedrive-sync/tests/test_pull.py (new)

### Change Log
- 2026-06-06: Implemented story 1.2 — pull command wired with rclone arg vector; tests pin the vector and error path.
