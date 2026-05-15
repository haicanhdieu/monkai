---
title: 'Auto-redeploy reader when Cloudflare tunnel URL changes'
type: 'feature'
created: '2026-05-15'
status: 'done'
baseline_commit: '7d2e519992b87ad3a4973776a2629d05733ede34'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The Cloudflare quick-tunnel URL is ephemeral — it changes on every cloudflared container restart. When it does, `apps/reader/vercel.json` (and the duplicate in `ci.yml`) must be manually updated and pushed to trigger a reader redeploy, which is friction-prone and easy to forget.

**Approach:** Add a `url-watcher` Docker service to the win-server compose stack that monitors the cloudflared container via the Docker socket, detects the new URL in its logs, updates the URL in `apps/reader/vercel.json` (primary per guideline) and the duplicate hardcoded line in `.github/workflows/ci.yml`, then commits + pushes to trigger the CI/CD deploy automatically.

## Boundaries & Constraints

**Always:**
- Watch via Docker socket events (`docker events`) — no polling loops or log-tailing that holds open file descriptors indefinitely
- Retry URL extraction up to 3 times (10s apart) after each `start` event before giving up — cloudflared takes a few seconds to negotiate the URL
- Only commit if the URL actually changed (compare against current value in `vercel.json`)
- Update both `apps/reader/vercel.json` AND the duplicate URL in `.github/workflows/ci.yml` in a single commit — `vercel.json` is the canonical file per the guideline; ci.yml contains a hardcoded copy in the "Create Vercel output" step that also controls the deployed edge routes
- Commit message: `chore(reader): update Cloudflare tunnel URL` (per `update-tunnel-url.md` guideline)
- Service must restart automatically (`restart: always`) so the watcher survives OS reboots

**Ask First:**
- If the extracted URL looks malformed (does not match `https://[a-z0-9-]+\.trycloudflare\.com`) — log a warning and skip rather than corrupting ci.yml

**Never:**
- Do not tail logs indefinitely or use `--follow` on docker logs (avoids stuck processes)
- Do not hard-code the container name — discover it via Docker Compose service label `com.docker.compose.service=cloudflared`
- Do not modify any files other than `.github/workflows/ci.yml`
- Do not add automated tests (infra service, manual verification only)

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Normal restart | cloudflared starts, new URL in logs within 15s | vercel.json + ci.yml updated, committed, pushed | — |
| URL unchanged | cloudflared restarts but URL happens to be the same | No commit, log "URL unchanged" | — |
| URL not yet in logs | cloudflared start event received but URL missing | Retry 3× at 10s intervals | After 3 retries: log warning, skip |
| Malformed URL | Log line contains unexpected pattern | Skip update, log warning | No commit |
| git pull fails (diverged/network) | Conflict or network error before commit | Log error, `continue` to next event — do not exit | No restart storm; next cloudflared restart retries |
| git push fails | Network error after commit | Log error with exit code | Docker `restart: always` respawns watcher |
| Full system/Docker restart | All containers restart together; cloudflared `start` event fires before watcher's event loop begins | `--since 5min` replays the event into the loop; retry logic extracts URL once cloudflared is ready | Same retry logic as normal restart |
| Watcher-only crash | url-watcher restarts while cloudflared stays up with current URL | `--since 5min` replays the recent start event; URL matches vercel.json; no commit | — |

</frozen-after-approval>

## Code Map

- `apps/deployer/win-server/docker-compose.yml` — add `url-watcher` service with Docker socket + repo + SSH mounts
- `apps/deployer/win-server/.env.example` — add `REPO_PATH`, `SSH_DIR`, `GIT_USER_NAME`, `GIT_USER_EMAIL` vars
- `apps/deployer/win-server/url-watcher/Dockerfile` — new: alpine + docker-cli + git + openssh-client
- `apps/deployer/win-server/url-watcher/watch.sh` — new: event loop shell script
- `apps/reader/vercel.json` — updated at runtime by watcher: the `destination` URL in the `/book-data/:path*` rewrite rule (canonical file per `update-tunnel-url.md`)
- `.github/workflows/ci.yml` — updated at runtime by watcher: the `dest` URL in the "Create Vercel output" config.json heredoc (duplicate that also controls the CI/CD edge route)
- `apps/deployer/win-server/update-tunnel-url.md` — reference guideline; also updated by this spec to mention that `ci.yml` contains a duplicate URL that must be kept in sync

## Tasks & Acceptance

**Execution:**
- [x] `apps/deployer/win-server/url-watcher/watch.sh` — create shell script: **(startup)** configure git identity (`git config --global user.name "$GIT_USER_NAME" && git config --global user.email "$GIT_USER_EMAIL"`); copy SSH keys to `/tmp/ssh/`, run `ssh-keyscan github.com > /tmp/ssh/known_hosts`, export `GIT_SSH_COMMAND` (see Design Notes); read current URL from `apps/reader/vercel.json`; **(event loop)** run `docker events --filter 'label=com.docker.compose.service=cloudflared' --filter 'event=start' --since "$(( $(date +%s) - 300 ))"` (5-minute lookback covers the full-restart race condition, then streams live); on each event wait 20s then retry-extract URL via `docker logs` of the container found by `docker ps --filter 'label=com.docker.compose.service=cloudflared' -q | head -1` (3× at 10s intervals); if URL valid and changed: `git -C /repo pull --ff-only || { log "pull failed, skipping"; continue; }`, `sed` replace in both files, `git add`, `git commit -m "chore(reader): update Cloudflare tunnel URL"`, `git push`
- [x] `apps/deployer/win-server/url-watcher/Dockerfile` — create: `FROM alpine:3`, `RUN apk add --no-cache docker-cli git openssh-client`, `COPY watch.sh /usr/local/bin/watch`, `RUN chmod +x /usr/local/bin/watch`, `CMD ["/usr/local/bin/watch"]`
- [x] `apps/deployer/win-server/docker-compose.yml` — add `url-watcher` service: `build: ./url-watcher`, volumes for `/var/run/docker.sock`, `${REPO_PATH}:/repo`, `${SSH_DIR}:/root/.ssh:ro`, environment vars `GIT_USER_NAME`/`GIT_USER_EMAIL`, `depends_on: cloudflared`, `restart: always`
- [x] `apps/deployer/win-server/.env.example` — append `url-watcher` section: `REPO_PATH` (WSL2-format path to repo root, e.g. `/mnt/d/ntm/monkai`), `SSH_DIR` (path to `.ssh` dir, e.g. `/root/.ssh`), `GIT_USER_NAME`, `GIT_USER_EMAIL`
- [x] `apps/deployer/win-server/update-tunnel-url.md` — update Step 2 to say that `ci.yml` also contains a duplicate hardcoded URL in the "Create Vercel output" heredoc that must be updated alongside `vercel.json`; update the quick-reference table to add `ci.yml` as a second file to update

**Acceptance Criteria:**
- Given `docker compose up -d` is run and cloudflared starts, when `url-watcher` logs show a new URL was detected, then both `apps/reader/vercel.json` and `.github/workflows/ci.yml` are updated and a commit is visible in `git log`
- Given `docker compose restart cloudflared`, when 30s pass, then `git log --oneline -1` shows a new `chore(reader): update Cloudflare tunnel URL` commit
- Given cloudflared restarts and the URL is unchanged, when watcher runs, then no new commit is created
- Given a full Docker/OS restart (all containers down then up), when url-watcher starts and cloudflared is already running with a new URL, then the startup check detects the change and pushes without waiting for a future event
- Given `url-watcher` container alone crashes and restarts while cloudflared keeps running with the same URL, when watcher starts, then the startup check finds no change and no duplicate commit is created

## Design Notes

**URL extraction from logs:** cloudflared prints the URL in a banner box. Extract with:
```sh
docker logs "$CONTAINER" 2>&1 | grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' | tail -1
```
`tail -1` gets the last match — safe if URL appears multiple times across restarts.

**Two-file sed update (single sed pattern works for both):**
```sh
# vercel.json: "destination": "https://OLD.trycloudflare.com/book-data/:path*"
# ci.yml:       "dest": "https://OLD.trycloudflare.com/book-data/$1"
sed -i "s|https://[a-z0-9-]*\.trycloudflare\.com|$NEW_URL|g" \
    "$REPO_DIR/apps/reader/vercel.json" \
    "$REPO_DIR/.github/workflows/ci.yml"
```
The same regex safely matches both files since the URL pattern is identical in both contexts.

**Container discovery (no hardcoded names):**
```sh
CONTAINER=$(docker ps --filter 'label=com.docker.compose.service=cloudflared' -q | head -1)
```
Avoids fragility from Compose project name differences (e.g. `win-server-cloudflared-1` vs `monkai-cloudflared-1`).

**SSH auth inside container (mount is `:ro` — cannot write to `/root/.ssh`):** At `watch.sh` startup, copy keys to a writable temp dir and point `GIT_SSH_COMMAND` at it:
```sh
mkdir -p /tmp/ssh
cp /root/.ssh/id_* /tmp/ssh/
chmod 600 /tmp/ssh/id_*
ssh-keyscan github.com > /tmp/ssh/known_hosts 2>/dev/null
export GIT_SSH_COMMAND="ssh -i /tmp/ssh/id_ed25519 -o UserKnownHostsFile=/tmp/ssh/known_hosts"
```
Use `id_ed25519` if the key is Ed25519; implementation agent should check which key file exists (`id_rsa`, `id_ed25519`, `id_ecdsa`) and use the first match. Do not skip host verification.

**Handling the full-restart race condition via `--since` (no separate startup check):** `docker events` without `--since` only captures events from the moment it starts listening. When the entire system restarts, `depends_on` causes cloudflared to start before url-watcher, so its `start` event fires before the event loop begins — and is missed. Using `--since "$(( $(date +%s) - 300 ))"` makes `docker events` replay any cloudflared start event from the last 5 minutes before switching to live streaming. This is cleaner than a separate startup check: a fixed-retry startup check silently gives up if cloudflared hasn't received its URL yet (slow network), whereas the `--since` approach feeds the event through the same retry logic naturally. `date +%s` and shell arithmetic both work in Alpine/BusyBox.

**Git operations target the mounted repo:** All git commands use `-C /repo`. Run `git pull --ff-only` before each commit to stay in sync with remote. If `pull` fails (diverged history, network error), skip the update for this event with `continue` — do NOT exit, since that would trigger `restart: always` and create a restart storm on a persistent conflict. The next cloudflared restart will re-attempt automatically.

**Initial wait of 20s (not 15s):** cloudflared's tunnel negotiation can take 10–15s on a cold start. An initial 20s wait before the first log extraction attempt reduces the number of retries wasted on "URL not yet visible." Total retry budget: 20s + 3×10s = 50s, which covers slow Cloudflare handshakes.

## Verification

**Manual checks:**
- `docker compose logs url-watcher` — should show "Watching for cloudflared restarts..." on startup
- `docker compose restart cloudflared && sleep 30 && docker compose logs url-watcher` — should show URL detection + push confirmation
- `git log --oneline -3` (on Windows machine) — new `chore(reader): update Cloudflare tunnel URL` commit should appear

## Suggested Review Order

**Core event loop**

- `docker events --since 5min` lookback: handles full-restart race, then streams live
  [`watch.sh:107`](../../apps/deployer/win-server/url-watcher/watch.sh#L107)

- `handle_event` entry: 20s initial wait before first log extraction
  [`watch.sh:38`](../../apps/deployer/win-server/url-watcher/watch.sh#L38)

- Retry loop: 4 total attempts (3 retries) at 10s intervals
  [`watch.sh:51`](../../apps/deployer/win-server/url-watcher/watch.sh#L51)

- Single `sed` replaces URL in both vercel.json and ci.yml atomically
  [`watch.sh:85`](../../apps/deployer/win-server/url-watcher/watch.sh#L85)

- `git pull --ff-only` before commit; failure skips event without exiting
  [`watch.sh:80`](../../apps/deployer/win-server/url-watcher/watch.sh#L80)

**URL validation and idempotency**

- Regex validates extracted URL format before any write
  [`watch.sh:66`](../../apps/deployer/win-server/url-watcher/watch.sh#L66)

- Compares against current vercel.json value; skips commit if unchanged
  [`watch.sh:71`](../../apps/deployer/win-server/url-watcher/watch.sh#L71)

- Container discovered via compose label; no hardcoded name
  [`watch.sh:43`](../../apps/deployer/win-server/url-watcher/watch.sh#L43)

**Startup / fail-fast**

- Required env var validation: fails early before git config
  [`watch.sh:10`](../../apps/deployer/win-server/url-watcher/watch.sh#L10)

- File existence checks: catches wrong REPO_PATH mount before event loop
  [`watch.sh:96`](../../apps/deployer/win-server/url-watcher/watch.sh#L96)

- SSH key discovery loop (ed25519→rsa→ecdsa), copied to /tmp for :ro mount
  [`watch.sh:21`](../../apps/deployer/win-server/url-watcher/watch.sh#L21)

- `ssh-keyscan` + `GIT_SSH_COMMAND` wiring
  [`watch.sh:35`](../../apps/deployer/win-server/url-watcher/watch.sh#L35)

**Service wiring**

- Docker socket + repo + SSH mounts; `restart: always`; `depends_on: cloudflared`
  [`docker-compose.yml:16`](../../apps/deployer/win-server/docker-compose.yml#L16)

- Alpine image: docker-cli + git + openssh-client
  [`Dockerfile:1`](../../apps/deployer/win-server/url-watcher/Dockerfile#L1)

**Config / docs**

- New url-watcher env vars (REPO_PATH, SSH_DIR, GIT_USER_NAME, GIT_USER_EMAIL)
  [`.env.example:12`](../../apps/deployer/win-server/.env.example#L12)

- Step 2 and quick-ref table updated to reference both files
  [`update-tunnel-url.md`](../../apps/deployer/win-server/update-tunnel-url.md)
