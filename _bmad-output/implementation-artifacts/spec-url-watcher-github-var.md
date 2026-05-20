---
title: 'url-watcher: store Cloudflare URL in GitHub variable, trigger workflow_dispatch'
type: 'feature'
created: '2026-05-20'
status: 'done'
baseline_commit: '5ee8495'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** url-watcher syncs the Cloudflare tunnel URL by committing changes directly to `vercel.json` and `ci.yml`, pushing to `main` to trigger a redeploy. Committing ephemeral infrastructure config into source history is noisy and couples infra state to git history.

**Approach:** Store the URL as a GitHub Actions repository variable (`CLOUDFLARE_TUNNEL_URL`). When the URL changes, url-watcher calls the GitHub REST API to update the variable then triggers a `workflow_dispatch` on `main`. CI reads the URL from the variable at build time. No git operations remain in the watcher.

## Boundaries & Constraints

**Always:**
- Update GitHub variable BEFORE triggering dispatch; skip dispatch if variable update fails
- Idempotent: compare new URL against current GitHub variable value before any API calls
- Log HTTP status code on every non-2xx GitHub API response
- Use `jq` for all JSON parsing — no manual string-munging on JSON
- `deploy` job in `ci.yml` must run on both `push` and `workflow_dispatch` events

**Ask First:**
- If GitHub API returns 403 on any call — likely wrong token scope; halt and alert user before proceeding

**Never:**
- No git operations, no SSH, no repo volume mounting
- Do not modify any file in the repository at runtime
- Do not exit the watch loop on transient API errors — log and `continue` (avoids restart storm)
- Do not store `GITHUB_TOKEN` in any committed file

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Normal restart | cloudflared starts, new URL visible in logs | GitHub var updated, `workflow_dispatch` triggered | — |
| URL unchanged | cloudflared restarts, URL same as GitHub var | No API calls; log "URL unchanged" | — |
| URL not yet in logs | start event received, URL missing | Retry 3× at 10s intervals | After 3: log warning, skip |
| Malformed URL | Log line unexpected pattern | Skip, log warning | No API calls |
| Variable doesn't exist | First run; PATCH returns 404 | Fall back to POST to create variable | — |
| API update fails | Token invalid, rate-limit, or 5xx | Log error + HTTP status | Skip dispatch; `continue` loop |
| API dispatch fails | Non-2xx from dispatch endpoint | Log error + HTTP status | `continue` loop |
| Full system/Docker restart | All containers restart together | `--since 5min` replays event; retry extracts URL | Same retry logic as normal restart |

</frozen-after-approval>

## Code Map

- `apps/deployer/win-server/url-watcher/watch.sh` — core event loop; replace all SSH/git logic with GitHub API helpers
- `apps/deployer/win-server/url-watcher/Dockerfile` — replace `git openssh-client` with `curl jq`
- `apps/deployer/win-server/docker-compose.yml` — replace SSH/git env vars with `GITHUB_TOKEN`, `GITHUB_REPO`
- `apps/deployer/win-server/.env.example` — replace SSH/git vars with `GITHUB_TOKEN`, `GITHUB_REPO`
- `.github/workflows/ci.yml` — add `workflow_dispatch` trigger; fix deploy job condition; replace hardcoded URL with `${{ vars.CLOUDFLARE_TUNNEL_URL }}`
- `apps/reader/vercel.json` — remove `rewrites` array (dead config; eliminates conflict with ci.yml-generated config.json)

## Tasks & Acceptance

**Pre-task:** Discard uncommitted changes on `develop` (`git checkout -- apps/deployer/win-server/`) before implementing — dirty tree is a superseded WIP on the old approach.

**Execution:**
- [x] `apps/deployer/win-server/url-watcher/watch.sh` — rewrite: remove SSH setup, git clone/fetch/reset/add/commit/push, `sed`, and `vercel.json` reading for current URL; add three shell functions — `get_current_var()` (GET GitHub variable value via API, returns URL or empty), `update_var(url)` (PATCH; fall back to POST on 404), `trigger_dispatch()` (POST workflow_dispatch to `main`); keep Docker events loop, URL extraction from cloudflared logs, retry logic (3× at 10s), URL regex validation; idempotency now compares against `get_current_var()` instead of `vercel.json`
- [x] `apps/deployer/win-server/url-watcher/Dockerfile` — change `apk add` from `docker-cli git openssh-client` to `docker-cli curl jq`
- [x] `apps/deployer/win-server/docker-compose.yml` — remove env vars `GIT_USER_NAME`, `GIT_USER_EMAIL`, `SSH_PRIVATE_KEY`, `GIT_REPO_URL`; add `GITHUB_TOKEN`, `GITHUB_REPO`; confirm no SSH or repo volume mounts remain
- [x] `apps/deployer/win-server/.env.example` — remove `REPO_PATH`, `SSH_PRIVATE_KEY`, `GIT_USER_NAME`, `GIT_USER_EMAIL`, `GIT_REPO_URL`; add `GITHUB_TOKEN` (PAT with `repo` scope, or fine-grained PAT with Actions + Variables read/write) and `GITHUB_REPO` (e.g. `haicanhdieu/monkai`)
- [x] `.github/workflows/ci.yml` — (a) add `workflow_dispatch:` to `on:` block; (b) change deploy job `if:` from `github.event_name == 'push'` to `github.event_name != 'pull_request'`; (c) in "Create Vercel output" step replace hardcoded `https://...trycloudflare.com` with `${{ vars.CLOUDFLARE_TUNNEL_URL }}` — keep `<< 'EOF'` single-quoted heredoc so shell doesn't expand `$1` capture group
- [x] `apps/reader/vercel.json` — remove the `"rewrites"` array entirely; keep `"installCommand"`

**Acceptance Criteria:**
- Given `GITHUB_TOKEN` and `GITHUB_REPO` are set in `.env`, when `docker compose up -d` starts url-watcher, then logs show "Watching for cloudflared restarts..." with no SSH/key/git errors
- Given cloudflared restarts with a new URL, when 30s pass, then GitHub repo variable `CLOUDFLARE_TUNNEL_URL` is updated and a new "Reader CI" workflow run appears in the Actions tab (triggered by `workflow_dispatch`)
- Given cloudflared restarts with the same URL as the current GitHub variable value, when watcher runs, then no GitHub API calls are made and no new workflow run is created
- Given a `workflow_dispatch` run completes on `main`, then the `deploy` job runs (not skipped) and Vercel production reflects the new tunnel URL

## Design Notes

**GitHub REST API helpers — reference implementation for watch.sh:**
```sh
GITHUB_API="https://api.github.com/repos/$GITHUB_REPO/actions"

get_current_var() {
    curl -sf -H "Authorization: token $GITHUB_TOKEN" \
      "$GITHUB_API/variables/CLOUDFLARE_TUNNEL_URL" | jq -r '.value // ""'
}

update_var() {
    local url="$1" http
    http=$(curl -s -o /dev/null -w "%{http_code}" -X PATCH \
      -H "Authorization: token $GITHUB_TOKEN" -H "Content-Type: application/json" \
      -d "{\"name\":\"CLOUDFLARE_TUNNEL_URL\",\"value\":\"$url\"}" \
      "$GITHUB_API/variables/CLOUDFLARE_TUNNEL_URL")
    if [ "$http" = "404" ]; then
        http=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
          -H "Authorization: token $GITHUB_TOKEN" -H "Content-Type: application/json" \
          -d "{\"name\":\"CLOUDFLARE_TUNNEL_URL\",\"value\":\"$url\"}" \
          "$GITHUB_API/variables")
    fi
    [ "$http" -ge 200 ] && [ "$http" -lt 300 ]
}

trigger_dispatch() {
    local http
    http=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
      -H "Authorization: token $GITHUB_TOKEN" -H "Content-Type: application/json" \
      -d '{"ref":"main"}' \
      "$GITHUB_API/workflows/ci.yml/dispatches")
    [ "$http" -ge 200 ] && [ "$http" -lt 300 ]
}
```

**Deploy job condition — critical fix:** Current `if: github.event_name == 'push' && ...` skips deploy on `workflow_dispatch`. Changed to explicit `(== 'push' || == 'workflow_dispatch')` — avoids over-broad `!= 'pull_request'` which would allow future event types to trigger production deploys.

**`vercel.json` + `config.json` conflict:** Vercel reads both files; their `rewrites`/`routes` can conflict. Since CI always builds `config.json` from the GitHub variable, `vercel.json` rewrites serve no purpose and create a conflict risk. Removing them makes routing ownership unambiguous.

## Verification

**Manual checks:**
- `docker compose build url-watcher` — build succeeds; `curl` and `jq` present; no `git`/`ssh` binaries
- `docker compose up -d && docker compose logs url-watcher` — shows "Watching for cloudflared restarts...", no key/clone errors
- `docker compose restart cloudflared && sleep 30 && docker compose logs url-watcher` — shows URL detected, "GitHub var updated", "Dispatch triggered"
- GitHub → repo Settings → Variables → Actions → `CLOUDFLARE_TUNNEL_URL` shows new URL
- GitHub → Actions tab → new "Reader CI" run present, `deploy` job status is not skipped

## Suggested Review Order

**GitHub API integration (core logic)**

- Entry point: env guard + API base URL construction
  [`watch.sh:7`](../../apps/deployer/win-server/url-watcher/watch.sh#L7)

- `get_current_var`: HTTP status check + 404-as-empty + error sentinel on failure
  [`watch.sh:14`](../../apps/deployer/win-server/url-watcher/watch.sh#L14)

- `update_var`: PATCH with POST fallback on 404; empty `$http` transport guard
  [`watch.sh:33`](../../apps/deployer/win-server/url-watcher/watch.sh#L33)

- `trigger_dispatch`: explicit JSON ref + transport error guard
  [`watch.sh:63`](../../apps/deployer/win-server/url-watcher/watch.sh#L63)

- `handle_event`: idempotency via `get_current_var`; 2s sleep for API propagation before dispatch
  [`watch.sh:115`](../../apps/deployer/win-server/url-watcher/watch.sh#L115)

- `docker logs --tail 100`: bounds log read to prevent gigabyte streams
  [`watch.sh:96`](../../apps/deployer/win-server/url-watcher/watch.sh#L96)

**CI pipeline changes**

- `workflow_dispatch` trigger: enables watcher-initiated deploys without committing to repo
  [`ci.yml:13`](../../.github/workflows/ci.yml#L13)

- `vars.CLOUDFLARE_TUNNEL_URL` replaces hardcoded URL in Vercel route config
  [`ci.yml:63`](../../.github/workflows/ci.yml#L63)

- Deploy condition: explicit `push || workflow_dispatch` — avoids over-broad negation
  [`ci.yml:81`](../../.github/workflows/ci.yml#L81)

**Infrastructure / config**

- Dockerfile: `git openssh-client` → `curl jq`; no git tooling needed
  [`Dockerfile:2`](../../apps/deployer/win-server/url-watcher/Dockerfile#L2)

- Compose: SSH/git env vars → `GITHUB_TOKEN`, `GITHUB_REPO`; repo + SSH volume mounts removed
  [`docker-compose.yml:19`](../../apps/deployer/win-server/docker-compose.yml#L19)

- PAT scope guidance: classic (`repo`) and fine-grained (Actions + Variables R/W) documented
  [`.env.example:14`](../../apps/deployer/win-server/.env.example#L14)

- `vercel.json` rewrites removed: routing ownership now unambiguous (ci.yml config.json only)
  [`vercel.json:1`](../../apps/reader/vercel.json#L1)
