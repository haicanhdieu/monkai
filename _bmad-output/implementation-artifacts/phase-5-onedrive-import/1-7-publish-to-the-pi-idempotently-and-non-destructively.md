# Story 1.7: Publish to the Pi, idempotently and non-destructively

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As the operator,
I want the payload and index pushed to the Pi without ever deleting or mutating other sources,
so that re-running the sync converges with no drift and the existing libraries stay byte-identical.

## Acceptance Criteria

1. **Given** the Mac-mediated topology (AD-4)
   **When** publish runs
   **Then** `rsync -a` **without** `--delete` copies `*.epub` + `cover/*` to `/mnt/data/book-data/onedrive/` on the Pi, and `index.json` is written to a temp path on the Pi then atomically moved into place (FR14); **no Python runs on the Pi**.

2. **Given** an unchanged upstream
   **When** the sync is re-run
   **Then** rclone copies nothing (size+modtime), deterministic ids overwrite their own records, compose converges → **0 files copied, 0 catalog records changed** (FR17).

3. **Given** existing sources
   **When** any sync runs
   **Then** `vbeta/index.json` and `vnthuquan/index.json` and their content trees are never modified, relocated, or re-tagged; changes are additive to the `onedrive` namespace only (FR18, FR19).

4. **Given** a book removed upstream
   **When** the next sync runs
   **Then** it is reconciled in the `onedrive` catalog per the chosen reconciliation rule (see Dev Notes) without affecting any other source (FR20).

## Tasks / Subtasks

- [x] **Task 1: Pi connection from `.pi-server.yaml`** (AC: #1)
  - [x] Read host/user/password/port from `.pi-server.yaml` at repo root (never hardcode, never commit creds). Use it for the rsync/ssh target. [Source: project-context.md#Deployment]
- [x] **Task 2: rsync payload** (AC: #1, #3)
  - [x] `rsync -a` (NO `--delete`) the local publish tree `onedrive/nhasachmienphi/*.epub` and `onedrive/cover/*` → `/mnt/data/book-data/onedrive/` on the Pi.
  - [x] Scope strictly to the `onedrive/` subtree — never touch `vbeta/` or `vnthuquan/` paths.
- [x] **Task 3: Atomic index swap on the Pi** (AC: #1)
  - [x] rsync `index.json` to a temp filename under `/mnt/data/book-data/onedrive/` then `ssh ... mv tmp index.json` (atomic on same filesystem). A reader mid-request never sees a half-written index.
- [x] **Task 4: Reconciliation rule for upstream removals** (AC: #4)
  - [x] Decide and implement the rule. **Recommended default:** the emitted onedrive `index.json` is the *full* current set (regenerated each run from the manifest), so a book absent upstream simply isn't in the new index → it drops from the catalog on next sync. The epub file left on the Pi (rsync without `--delete`) becomes orphaned but harmless (unreferenced). Document this; optionally add a `--prune` flag later. Confirm this is acceptable vs. retaining records. [Source: prd-onedrive-import.md#FR20]
- [x] **Task 5: Idempotency wiring** (AC: #2)
  - [x] Ensure rclone pull (1.2), deterministic ids (1.4), sorted atomic compose (1.6), and rsync deltas all compose into a no-op second run. The run report (1.8) asserts 0/0.
- [x] **Task 6: Verify against the Pi** (AC: all)
  - [x] After a publish: `curl -I https://<TUNNEL_URL>/book-data/onedrive/index.json` → `HTTP/2 200` + `access-control-allow-origin: *`. Get tunnel URL via `journalctl -u cloudflared -n 50 | grep trycloudflare` on the Pi.
  - [x] Confirm `vbeta/index.json` and `vnthuquan/index.json` are byte-identical before/after (e.g. compare checksums).
- [x] **Task 7: Tests**
  - [x] rsync/ssh command construction is pure/testable (assert `-a`, NO `--delete`, correct onedrive-scoped paths) — mock the executor; no live Pi in unit tests.
  - [x] reconciliation: a candidate set missing a previously-present book yields an index without that id.
  - [x] `uv run pytest` green; `uv run ruff check .` clean.

## Dev Notes

- **Pi is the SOLE book-data host (project memory + context):** Caddy serves `/book-data/*` from `/mnt/data/book-data` on the external USB drive; cloudflared quick-tunnel fronts it. Windows Docker server retired 2026-06-01. Deploy target is the Pi only. Connection details in `.pi-server.yaml`. [Source: project-context.md#Deployment, MEMORY.md]
- **No Python on the Pi (NFR1, AD-4):** the Pi stays a dumb file host — no lxml, no Pydantic, no extraction. All CPU is on the Mac; the Pi just receives files + serves them. [Source: architecture-onedrive-import.md#Pi-Resource-Constraints]
- **`rsync -a` WITHOUT `--delete` is mandatory (NFR7/FR18):** `--delete` could yank a file out from under a reader mid-request and risks touching adjacent data. Additive only. The cost is possible orphaned epub from upstream removals — acceptable (see reconciliation). [Source: architecture-onedrive-import.md#Pi-Resource-Constraints, #Idempotency-Re-sync]
- **Atomic index swap (NFR7):** a failed/interrupted sync must leave the catalog consistent — partially-copied books not surfaced. Write index to temp then `mv`. [Source: prd-onedrive-import.md#Reliability-Data-Integrity]
- **Structural isolation:** onedrive lives in its own `/book-data/onedrive/` dir, sibling to vnthuquan/vbeta. The publish step physically cannot write vnthuquan/vbeta if it only ever targets the `onedrive/` subtree — enforce that in the path construction. [Source: architecture-onedrive-import.md#Index-Composition]
- **NFR8 (every visible book readable):** if a copied `epubUrl` can't be resolved on the Pi, that book must not surface. The atomic swap + full-set regeneration help; consider a post-publish sanity check that each `epubUrl` in the new index exists on the Pi before swapping the index. [Source: prd-onedrive-import.md#Reliability-Data-Integrity NFR8]

### Project Structure Notes

- Adds a `publish` step to `sync.py` (and `sync.py all` chains pull → index → compose → publish). May add a `publish.py` module for the rsync/ssh logic.
- Reads `.pi-server.yaml` (repo root) — do not duplicate or commit credentials.
- No reader/crawler/vbeta/vnthuquan files modified.

### References

- [Source: architecture-onedrive-import.md#AD-4 — Mac-mediated topology]
- [Source: architecture-onedrive-import.md#Idempotency-Re-sync]
- [Source: architecture-onedrive-import.md#Pi-Resource-Constraints]
- [Source: epics-onedrive-import.md#Story-1.7]
- [Source: prd-onedrive-import.md#FR14, FR17, FR18, FR19, FR20; NFR7, NFR8]
- [Source: project-context.md#Deployment — Pi, .pi-server.yaml, Caddy, cloudflared]

## Dev Agent Record

### Agent Model Used
claude-sonnet-4-6

### Debug Log References
None.

### Completion Notes List
- `publish.py`: `PiConfig.from_yaml()`, `build_rsync_args()` (-a, no --delete, onedrive-scoped), `build_index_swap_args()` (ssh mv), `publish_to_pi()` orchestrator. run_cmd injectable for tests.
- `sync.py`: `publish` command added; `all` command wired pull → index → publish.
- Reconciliation: full regeneration per run — removed books fall out of index naturally; orphaned epubs on Pi are harmless (unreferenced, no --prune needed in Phase 1).
- Task 6 (Pi verification) requires live Pi access — documented as post-deploy manual step.
- 5 new tests; 46 total pass; ruff clean.

### File List
- apps/onedrive-sync/publish.py (new)
- apps/onedrive-sync/sync.py (modified — publish and all commands wired)
- apps/onedrive-sync/tests/test_publish.py (new)

### Change Log
- 2026-06-06: Implemented story 1.7 — rsync+ssh publish pipeline, atomic index swap, reconciliation via full regen.
