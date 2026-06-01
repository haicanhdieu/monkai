---
title: 'Migrate book-data hosting from Windows Docker to Pi native services'
type: 'chore'
created: '2026-06-01'
status: 'done'
baseline_commit: '591ec181c9246331c1236e5f136315ecf92cf5be'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Book-data is currently served from the Windows Docker stack (Caddy + cloudflared + url-watcher containers). Windows is being retired as primary host; the Pi (with a 465 GB USB drive at `/mnt/data`, labeled `monkai-data`) should take over with native systemd services.

**Approach:** (1) One-time rsync book-data from Windows to Pi USB `/mnt/data/book-data`. (2) Replace ngrok on Pi with cloudflared + url-watcher as systemd services. (3) Update Pi Caddyfile to serve from USB path. (4) `docker compose down` the Windows stack.

## Boundaries & Constraints

**Always:**
- Serve `/book-data` and `/book-data/*` with `Access-Control-Allow-Origin: *` (same contract as win-server Caddyfile)
- url-watcher uses the same GitHub API logic as `win-server/url-watcher/watch.sh`: update `CLOUDFLARE_TUNNEL_URL` variable, then trigger `workflow_dispatch` on `main`; skip if URL unchanged; skip + warn on malformed URL
- url-watcher reads `GITHUB_TOKEN` and `GITHUB_REPO` from `EnvironmentFile=/etc/url-watcher.env` (gitignored, set up manually during install)
- cloudflared runs quick-tunnel mode: `cloudflared tunnel --no-autoupdate --url http://localhost:80`
- Both cloudflared and url-watcher have `Restart=always` in their systemd unit files
- url-watcher replays last 5 min of cloudflared journal on start (`--since "5 minutes ago"`) so a watcher restart doesn't miss an already-running tunnel URL

**Ask First:**
- If rsync data sync exits non-zero (partial transfer) — do not proceed to Windows shutdown

**Never:**
- Use Docker on Pi for any of these services
- Modify any file in `apps/deployer/win-server/` (Windows stack untouched except `docker compose down`)
- Touch crawler code or config (`apps/crawler/`)
- Rename or restructure `/mnt/data` mount

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| cloudflared starts / restarts | New URL appears in `journalctl -u cloudflared` | url-watcher detects URL, updates GitHub var, triggers dispatch | — |
| URL unchanged on restart | Same URL as current GitHub var | Log "URL unchanged", skip | — |
| URL not yet in logs | cloudflared just started, URL line not yet written | Stream waits; URL captured as soon as it appears | — |
| Malformed URL | Log line matches partial pattern | Skip update, log warning | — |
| url-watcher restarts while cloudflared running | Watcher starts with `--since "5 minutes ago"` | Replays recent URL from journal, updates if needed | — |
| GitHub API 403 | Wrong token scope | Halt and alert operator (do not retry) | — |

</frozen-after-approval>

## Code Map

- `apps/deployer/pi-server/Caddyfile` — Pi static file server config; `root` path and `@book_data` pattern need update
- `apps/deployer/pi-server/setup-pi.sh` — Pi bootstrap script; remove ngrok section, add cloudflared + url-watcher systemd setup, update book-data path
- `apps/deployer/pi-server/url-watcher.sh` — NEW: adapted version of `win-server/url-watcher/watch.sh`; uses `journalctl` instead of `docker events`
- `apps/deployer/scripts/sync-book-data-win-to-pi.sh` — NEW: one-time migration script; reads `.window-server.yaml` + `.pi-server.yaml`, rsync Win → Pi USB
- `_bmad-output/project-context.md` — deployment section: update Pi as sole book-data host; change book-data path; remove Windows Docker as active host

## Tasks & Acceptance

**Execution:**
- [x] `apps/deployer/pi-server/Caddyfile` — change `root * <PI-HOME>/working/monkai/apps/crawler/data/book-data` to `root * /mnt/data/book-data`; add `/book-data` (no trailing slash) to `@book_data` path matcher (align with win-server Caddyfile)
- [x] `apps/deployer/pi-server/setup-pi.sh` — remove Steps 4–6 (ngrok install, config, systemd); add: (a) cloudflared arm64 install from GitHub releases, systemd unit written to `/etc/systemd/system/cloudflared.service`; (b) url-watcher systemd unit written to `/etc/systemd/system/url-watcher.service` with `EnvironmentFile=/etc/url-watcher.env`; (c) prompt operator to create `/etc/url-watcher.env` with `GITHUB_TOKEN=` and `GITHUB_REPO=`; (d) update Step 3 book-data path to `/mnt/data/book-data`; (e) update Step 2 Caddyfile deploy (no `sed` substitution needed since path is now absolute)
- [x] `apps/deployer/pi-server/url-watcher.sh` — NEW script; mirrors `watch.sh` logic (`get_current_var`, `update_var`, `trigger_dispatch`); replaces `docker events | while read` with `journalctl -f -u cloudflared --since "5 minutes ago" --output=cat | while read -r line`; extracts URL via `grep -o 'https://[a-z0-9-]*\.trycloudflare\.com'` from each streamed line; same idempotency, validation, and error-logging contract as `watch.sh`
- [x] `apps/deployer/scripts/sync-book-data-win-to-pi.sh` — NEW script; read credentials from `.window-server.yaml` and `.pi-server.yaml` using `python3 -c "import yaml; ..."` or `grep`; rsync `admin@192.168.1.200:"'/d/ntm/monkai/apps/crawler/data/book-data'"` → `/tmp/book-data-sync/` via sshpass; then rsync `/tmp/book-data-sync/` → `pi@192.168.1.225:/mnt/data/book-data/`; exit non-zero if either rsync fails; do NOT run `docker compose down` (separate manual step)
- [x] `_bmad-output/project-context.md` — deployment section: Pi is primary book-data host; path is `/mnt/data/book-data` (USB); uses cloudflared quick-tunnel + url-watcher systemd (not ngrok); Windows Docker server section: mark as retired, note shut down with `docker compose down` from `d:\ntm\monkai\apps\deployer\win-server\`

**Acceptance Criteria:**
- Given `setup-pi.sh` runs on Pi, when complete, then `systemctl is-active caddy cloudflared url-watcher` all output `active`
- Given cloudflared service restarts, when tunnel URL appears in journal, then `CLOUDFLARE_TUNNEL_URL` GitHub variable is updated and `workflow_dispatch` fires within 90s
- Given URL is unchanged after restart, when url-watcher processes the journal line, then no GitHub API call is made
- Given `curl http://localhost:80/book-data/vnthuquan/index.json` on Pi, then response is HTTP 200 with `Access-Control-Allow-Origin: *`
- Given `sync-book-data-win-to-pi.sh` runs from Mac, when both rsyncs complete, then file count at `/mnt/data/book-data` matches `D:\ntm\monkai\apps\crawler\data\book-data`

## Spec Change Log

## Design Notes

**url-watcher journal approach:** `journalctl -f -u cloudflared --since "5 minutes ago" --output=cat` streams log lines as plain text. URL extraction is per-line — no batch retry needed since the stream delivers lines as they are written. This is simpler than the Docker version's retry loop, which existed because `docker logs` had to poll after a `start` event; here the URL line arrives in real time.

**Windows book-data path via SSH rsync:** Windows OpenSSH exposes drives at POSIX paths `/c/`, `/d/`, etc. Source path for rsync: `admin@192.168.1.200:'/d/ntm/monkai/apps/crawler/data/book-data/'`. Requires sshpass (already available on Mac).

**No Caddyfile placeholder substitution:** After removing `<PI-HOME>`, `setup-pi.sh` can drop the `sed -i` step for path substitution. Caddyfile is deployed with `sudo cp` only.

## Verification

**Manual checks (if no CLI):**
- On Pi after `setup-pi.sh`: run `systemctl status caddy cloudflared url-watcher` — all three `active (running)`
- From external network: `curl -I https://<TUNNEL_URL>/book-data/vnthuquan/index.json` → `HTTP/2 200` with `access-control-allow-origin: *`
- After `sync-book-data-win-to-pi.sh`: `ls /mnt/data/book-data/` shows same top-level dirs as Windows source
- After Windows shutdown: reader app loads successfully from Cloudflare tunnel URL (no Windows fallback)

## Suggested Review Order

**Pi setup orchestration (entry point)**

- Full migration sequence in one script; read first for design intent
  [`setup-pi.sh:1`](../../apps/deployer/pi-server/setup-pi.sh#L1)

**Journal-based URL watching (core new logic)**

- Process substitution keeps `exit 1` in the main process so systemd restarts on 403
  [`url-watcher.sh:136`](../../apps/deployer/pi-server/url-watcher.sh#L136)

- PID-suffixed temp file prevents race between rapid systemd restarts
  [`url-watcher.sh:7`](../../apps/deployer/pi-server/url-watcher.sh#L7)

- `jq --arg` for safe JSON construction — no shell interpolation into the payload
  [`url-watcher.sh:40`](../../apps/deployer/pi-server/url-watcher.sh#L40)

**Pi systemd service setup**

- CF_BIN resolved after dpkg so `ExecStart` in the heredoc is never empty
  [`setup-pi.sh:88`](../../apps/deployer/pi-server/setup-pi.sh#L88)

- `usermod systemd-journal` grants journal read access without Docker socket
  [`setup-pi.sh:93`](../../apps/deployer/pi-server/setup-pi.sh#L93)

- `After=network-online.target` orders cloudflared after network, not just caddy
  [`setup-pi.sh:100`](../../apps/deployer/pi-server/setup-pi.sh#L100)

- `mkdir -p` before `chmod` prevents `set -e` abort on a fresh (empty) USB mount
  [`setup-pi.sh:65`](../../apps/deployer/pi-server/setup-pi.sh#L65)

- Env file validated for non-empty `GITHUB_TOKEN` + `GITHUB_REPO` before service start
  [`setup-pi.sh:141`](../../apps/deployer/pi-server/setup-pi.sh#L141)

**One-time data migration**

- `python3` converts Windows path to POSIX — portable across macOS BSD sed and Linux GNU sed
  [`sync-book-data-win-to-pi.sh:38`](../../apps/deployer/scripts/sync-book-data-win-to-pi.sh#L38)

- `rm -rf TMP_DIR` before sync prevents stale files corrupting `--delete` on hop 2
  [`sync-book-data-win-to-pi.sh:47`](../../apps/deployer/scripts/sync-book-data-win-to-pi.sh#L47)

- `SSHPASS` env var keeps credentials out of the process argument list
  [`sync-book-data-win-to-pi.sh:54`](../../apps/deployer/scripts/sync-book-data-win-to-pi.sh#L54)

- Empty-dir guard aborts before second rsync if Windows source had zero files
  [`sync-book-data-win-to-pi.sh:62`](../../apps/deployer/scripts/sync-book-data-win-to-pi.sh#L62)

**Static serving**

- Caddy serves from USB path; path matcher adds bare `/book-data` to align with win-server
  [`Caddyfile:2`](../../apps/deployer/pi-server/Caddyfile#L2)

**Peripherals**

- Deployment docs updated: Pi sole host, USB path, Windows retired
  [`project-context.md:108`](../project-context.md#L108)
