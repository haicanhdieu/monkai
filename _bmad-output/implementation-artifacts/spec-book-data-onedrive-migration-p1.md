---
title: 'Book-data OneDrive migration — Phase 1: sync data from Windows server'
type: 'chore'
created: '2026-05-28'
status: 'done'
baseline_commit: 'b05e39feaf4a98c38c3593115fb9e6c4c61f08b0'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Book-data lives only on the Windows server (`D:\ntm\monkai\apps\crawler\data\book-data`), which is unstable. There is no off-machine backup and the reader app has no fallback host.

**Approach:** Create an rclone-based upload script, SSH to the Windows server, run it to sync all book-data to the OneDrive shared folder, then verify at least one catalog is reachable via the public read URL before proceeding to Phase 2.

## Boundaries & Constraints

**Always:**
- Source of truth is the Windows server book-data directory — do not modify or delete files there
- Target is the OneDrive folder reachable at the write share URL; files upload under a `book-data/` prefix
- Verify accessibility via the Graph API read URL before marking Phase 1 done

**Ask First:**
- If rclone is not installed on the Windows server and cannot be installed without admin rights — halt and ask

**Never:**
- Do not delete any files from the Windows server
- Do not commit `.window-server.yaml` or any credentials to git

</frozen-after-approval>

## Code Map

- `apps/deployer/scripts/upload-book-data-to-onedrive.mjs` -- NEW: rclone-based sync script; runs on Windows server
- `apps/deployer/scripts/.env.example` -- add OneDrive section documenting new env vars
- `.window-server.yaml` -- Windows server SSH credentials (read-only reference, never commit)

## Tasks & Acceptance

**Execution:**

**Code tasks (local machine, commit to repo):**
- [x] `apps/deployer/scripts/upload-book-data-to-onedrive.mjs` -- create script: reads `ONEDRIVE_REMOTE` env var (default `onedrive-monkai`) and `BOOK_DATA_SRC` (default `D:\ntm\monkai\apps\crawler\data\book-data`); invokes `rclone sync {BOOK_DATA_SRC} {ONEDRIVE_REMOTE}:book-data --progress --stats-one-line`; supports `--dry-run` flag; exits non-zero on rclone failure; header comment documents: (1) install rclone on Windows, (2) run `rclone config` to add OneDrive remote named `onedrive-monkai`, (3) run this script
- [x] `apps/deployer/scripts/.env.example` -- append OneDrive section: `ONEDRIVE_REMOTE=onedrive-monkai`, `BOOK_DATA_SRC=D:\ntm\monkai\apps\crawler\data\book-data`

**Operational tasks (run on Windows server via SSH — see `.window-server.yaml` for credentials):**
- [ ] SSH to Windows server; verify rclone installed: `rclone version`; if missing, download and install from https://rclone.org/downloads/
- [ ] If OneDrive remote not yet configured: run `rclone config` and add remote named `onedrive-monkai` (type: onedrive, personal account); complete OAuth flow in browser
- [ ] Copy updated `apps/deployer/scripts/` to Windows server (or `git pull` if repo is checked out there)
- [ ] Dry-run first: `node upload-book-data-to-onedrive.mjs --dry-run`; confirm expected file list
- [ ] Run sync: `node upload-book-data-to-onedrive.mjs`; wait for completion; note total file count
- [ ] Verify: `curl "https://api.onedrive.com/v1.0/shares/u!aHR0cHM6Ly8xZHJ2Lm1zL2YvYy82NDE2Y2JiNGFiMTAzNzM3L0lnQkhQcU9BT0taM1M1NGhaWnc2NVRSUEF5cUdPZmJqYVlGTGlTUGg2dkN5elEw/root:/book-data/thuvienkinhphat/index.json:/content"` — must return valid JSON catalog

**Acceptance Criteria:**
- Given sync completes without error, when a GET is made to the Graph API read URL + `/root:/book-data/{source}/index.json:/content`, then the response is valid JSON with a `books` array
- Given `--dry-run` flag, when script runs, then it prints file list and exits 0 without uploading anything
- Given rclone exits non-zero (network error, auth failure), when script runs, then it prints the rclone stderr and exits non-zero

## Design Notes

**Encoded read share URL** (pre-computed for verification `curl` above):

Read share URL: `https://1drv.ms/f/c/6416cbb4ab103737/IgBHPqOAOKZ0S54hZZw65SRPAYqGOfbjaYFLiSPh6vCyzQ0`

Encoding: `'u!' + btoa(url).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')`

Result: `u!aHR0cHM6Ly8xZHJ2Lm1zL2YvYy82NDE2Y2JiNGFiMTAzNzM3L0lnQkhQcU9BT0taM1M1NGhaWnc2NVRSUEF5cUdPZmJqYVlGTGlTUGg2dkN5elEw`

**rclone OneDrive remote config (interactive, one-time):**
```
rclone config
# → n (new remote)
# → name: onedrive-monkai
# → type: onedrive
# → follow OAuth prompts in browser
```

## Verification

**Commands:**
- `node apps/deployer/scripts/upload-book-data-to-onedrive.mjs --dry-run` -- expected: lists files, exits 0

**Manual checks:**
- After sync, open the read share URL in browser — should show uploaded files in the OneDrive folder
- Run the verification `curl` from the Design Notes — response must include `"books":[`

## Suggested Review Order

**Sync script core**

- Entry point: env resolution, src/dest construction, and safety guards
  [`upload-book-data-to-onedrive.mjs:62`](../../apps/deployer/scripts/upload-book-data-to-onedrive.mjs#L62)

- Empty-source guard prevents wiping OneDrive if src dir is empty
  [`upload-book-data-to-onedrive.mjs:77`](../../apps/deployer/scripts/upload-book-data-to-onedrive.mjs#L77)

- rclone invocation with `--dry-run` passthrough and `stdio: 'inherit'`
  [`upload-book-data-to-onedrive.mjs:93`](../../apps/deployer/scripts/upload-book-data-to-onedrive.mjs#L93)

- Error handling: spawn failure vs non-zero exit vs signal kill
  [`upload-book-data-to-onedrive.mjs:95`](../../apps/deployer/scripts/upload-book-data-to-onedrive.mjs#L95)

- `.env` loader with try/catch around `readFileSync`
  [`upload-book-data-to-onedrive.mjs:38`](../../apps/deployer/scripts/upload-book-data-to-onedrive.mjs#L38)

**Config**

- OneDrive env var section added; old duplicate `BOOK_DATA_SRC` entry removed
  [`.env.example:23`](../../apps/deployer/scripts/.env.example#L23)

## Spec Change Log
