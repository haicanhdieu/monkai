---
title: 'Replace ngrok with Cloudflare Quick-Tunnel on Windows Docker Server'
slug: 'win-cloudflare-quick-tunnel'
created: '2026-05-15'
status: 'done'
stepsCompleted: [1, 2, 3, 4]
baseline_commit: '494bd2e9d6616d79344c07845cc4bd739de7dbe5'
tech_stack:
  - 'cloudflare/cloudflared Docker image'
  - 'Docker Compose (existing)'
  - 'Caddy 2-alpine (unchanged)'
files_to_modify:
  - 'apps/deployer/win-server/docker-compose.yml'
  - 'apps/deployer/win-server/.env.example'
  - 'apps/deployer/scripts/.env.example'
  - '_bmad-output/project-context.md'
code_patterns:
  - 'Two-service Docker Compose: caddy (static file server) + tunnel (outbound)'
  - 'Tunnel replaces ngrok service; Caddyfile and BOOK_DATA_PATH mount are untouched'
  - 'Quick-tunnel URL is ephemeral — must be read from logs after each restart'
test_patterns:
  - 'No automated tests — manual curl + browser DevTools verification'
---

# Tech-Spec: Replace ngrok with Cloudflare Quick-Tunnel on Windows Docker Server

**Created:** 2026-05-15

## Overview

### Problem Statement

The Windows Docker book-data server uses ngrok (free tier) to expose Caddy over the internet. ngrok's free plan has a monthly bandwidth cap. When the cap is hit (`ERR_NGROK_725`), the server returns HTTP 403 to all requests even though the containers are healthy. Upgrading ngrok is expensive for this use-case.

### Solution

Replace the `ngrok` service in `apps/deployer/win-server/docker-compose.yml` with `cloudflare/cloudflared` running in **quick-tunnel mode** (`tunnel --no-autoupdate --url http://caddy:80`). Cloudflare Tunnels have no bandwidth cap on the free tier. No Cloudflare account or token is required for quick-tunnels — the image connects anonymously and prints a random `*.trycloudflare.com` HTTPS URL to stdout. Caddy configuration (`Caddyfile`) and the CORS/path-guard logic remain untouched.

**Trade-off acknowledged:** The tunnel URL is ephemeral — it changes on every container restart. After each restart the operator must retrieve the new URL from logs and redeploy the reader with the updated `VITE_BOOK_DATA_URL`.

### Scope

**In Scope:**
- Replace `ngrok` Docker service with `cloudflare/cloudflared` in `docker-compose.yml`
- Remove NGROK_* variables from `.env.example` (win-server); keep only `BOOK_DATA_PATH`
- Update `apps/deployer/scripts/.env.example` comment for `VITE_BOOK_DATA_URL` (remove ngrok mention, point to cloudflare tunnel URL)
- Update `_bmad-output/project-context.md` Windows Docker Server section to replace all ngrok references with cloudflared

**Out of Scope:**
- Cloudflare Named Tunnel setup (requires Cloudflare account + domain management)
- Raspberry Pi server changes
- Reader source code changes
- Any changes to `Caddyfile`, `startup.ps1`, `register-startup-task.ps1`

---

## Context for Development

### Codebase Patterns

- The win-server is a two-service Docker Compose stack: `caddy` (static file server, port 80 internal only) and the tunnel service (outbound only, no inbound port exposure).
- The tunnel service is a drop-in: it just tunnels `caddy:80` to the internet. No changes to Caddy, volume mounts, or restart policy are needed.
- `BOOK_DATA_PATH` env var drives the Caddy volume mount — retained as-is.
- `apps/deployer/scripts/.env.example` is the source-of-truth comment reference for `VITE_BOOK_DATA_URL` used by `deploy-reader-static.mjs`. Its comment currently says "Pi via ngrok" — needs updating.
- `project-context.md` Windows Docker section references ngrok in multiple places (`.ngrok-config.yaml`, verify command, service description) — all need updating.
- The existing `.env` file (gitignored) currently has `NGROK_AUTHTOKEN` and `NGROK_DOMAIN` — the operator must manually remove these after the change. This is documented in Notes, not automated (file is gitignored).

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `apps/deployer/win-server/docker-compose.yml` | Primary change: replace ngrok service with cloudflared |
| `apps/deployer/win-server/.env.example` | Remove NGROK_* var docs |
| `apps/deployer/win-server/Caddyfile` | Reference only — unchanged |
| `apps/deployer/scripts/.env.example` | Update VITE_BOOK_DATA_URL comment |
| `_bmad-output/project-context.md` | Update Windows Docker Server deployment section |

### Technical Decisions

- **Quick-tunnel, not named tunnel:** Requires zero credentials. URL is ephemeral but the bandwidth-cap problem is fully solved. Named tunnel would need a Cloudflare account and domain — deferred to a future spec if the URL-change friction becomes unacceptable.
- **`--no-autoupdate` flag:** Required in Docker — prevents cloudflared from attempting a self-update inside the container, which would fail silently and potentially crash the process.
- **`restart: always` retained:** Same policy as the previous ngrok service. On crash, Docker restarts the container and a new URL is issued — operator must update `VITE_BOOK_DATA_URL` again.
- **No `environment:` block needed:** Quick-tunnel needs no auth token. The env block is omitted entirely, simplifying the compose file and the `.env.example`.

---

## Implementation Plan

### Tasks

> Tasks ordered by dependency. Caddy/Caddyfile first as reference, then compose change, then config docs.

- [x] Task 1: `apps/deployer/win-server/docker-compose.yml` — replace ngrok service
  - File: `apps/deployer/win-server/docker-compose.yml`
  - Action: Delete the `ngrok` service block entirely. Add a `cloudflared` service:
    ```yaml
    cloudflared:
      image: cloudflare/cloudflared:latest
      command: tunnel --no-autoupdate --url http://caddy:80
      depends_on:
        - caddy
      restart: always
    ```
  - Notes: No `environment:` block needed. `depends_on: caddy` ensures Caddy is up before cloudflared tries to connect. Keep `restart: always` so the tunnel auto-recovers from transient network drops.

- [x] Task 2: `apps/deployer/win-server/.env.example` — remove NGROK_* vars
  - File: `apps/deployer/win-server/.env.example`
  - Action: Remove the `NGROK_AUTHTOKEN` and `NGROK_DOMAIN` lines and their comments. Keep only `BOOK_DATA_PATH` with its existing comment block. Result:
    ```
    # Absolute path to the book-data directory on the host.
    #
    # Docker Engine in WSL2 (recommended — see migrate-docker-desktop-to-engine.md):
    #   Use the WSL2-format path: /mnt/<drive>/...
    #   e.g. /mnt/c/Users/you/monkai/apps/crawler/data/book-data
    #
    # Docker Desktop on Windows (legacy):
    #   Use forward slashes — Docker Desktop normalises them.
    #   e.g. C:/Users/you/monkai/apps/crawler/data/book-data
    BOOK_DATA_PATH=/mnt/c/Users/you/monkai/apps/crawler/data/book-data
    ```

- [x] Task 3: `apps/deployer/scripts/.env.example` — update VITE_BOOK_DATA_URL comment
  - File: `apps/deployer/scripts/.env.example`
  - Action: Replace the `VITE_BOOK_DATA_URL` comment block. Change from:
    ```
    # Pi via ngrok (primary): https://<name>.ngrok-free.app  (replace with your static ngrok domain)
    # R2 (backup): set to the URL printed by upload-book-data-to-r2.mjs after first upload (e.g. https://pub-xxxx.r2.dev)
    # VITE_BOOK_DATA_URL=
    ```
    To:
    ```
    # Root URL for book-data (no trailing slash).
    # Windows server via Cloudflare quick-tunnel: https://<random>.trycloudflare.com
    #   Get the URL after each server restart: docker compose logs cloudflared 2>&1 | grep trycloudflare
    # Pi server (primary): https://ntm-pub.ddns.net
    # R2 (backup): set to the URL printed by upload-book-data-to-r2.mjs after first upload (e.g. https://pub-xxxx.r2.dev)
    # VITE_BOOK_DATA_URL=
    ```

- [x] Task 4: `_bmad-output/project-context.md` — update Windows Docker Server section
  - File: `_bmad-output/project-context.md`
  - Action: In the **Windows Docker Server** section, replace all ngrok-specific references:
    1. Remove the bullet: `- **Ngrok config:** \`.ngrok-config.yaml\` (shared with Pi) — contains ngrok tunnel configuration... Stop Pi's ngrok before starting Windows stack (\`sudo systemctl stop ngrok\` on Pi).`
    2. Update the Docker Compose description bullet to: `- **Docker Compose:** \`apps/deployer/win-server/docker-compose.yml\` — two services: \`caddy:2-alpine\` (static file server) and \`cloudflare/cloudflared\` (outbound tunnel, Cloudflare quick-tunnel mode). Start with \`docker compose up -d\` from \`d:\\ntm\\monkai\\apps\\deployer\\win-server\\\`.`
    3. Replace the verify command: change `curl -I https://<NGROK_DOMAIN>/book-data/vnthuquan/index.json` to: `- **Get tunnel URL:** \`docker compose logs cloudflared 2>&1 | grep trycloudflare\` — URL changes on restart; update \`VITE_BOOK_DATA_URL\` in \`apps/deployer/scripts/.env\` and redeploy reader.` and `- **Verify tunnel:** \`curl -I https://<TUNNEL_URL>/book-data/vnthuquan/index.json\` should return \`HTTP/2 200\` with \`access-control-allow-origin: *\`.`

---

## Acceptance Criteria

- [ ] AC 1: Given `docker compose up -d` is run with the updated compose file, when `docker compose logs cloudflared` is checked within 30 seconds, then the output contains a line with `trycloudflare.com` showing the assigned tunnel URL.

- [ ] AC 2: Given the tunnel URL from AC 1, when `curl -sI https://<TUNNEL_URL>/book-data/vnthuquan/index.json` is run from an external network, then response is `HTTP/2 200` with `access-control-allow-origin: *` header present.

- [ ] AC 3: Given the tunnel is running, when `curl -sI https://<TUNNEL_URL>/` is run, then response is `HTTP/2 404` (Caddy catch-all, CORS header present).

- [ ] AC 4: Given `VITE_BOOK_DATA_URL` in `apps/deployer/scripts/.env` is set to the tunnel URL and `devbox run deploy:reader` is run, then the reader catalog loads from `*.trycloudflare.com` (visible in browser DevTools Network tab).

- [ ] AC 5: Given the `cloudflared` container is stopped and restarted (`docker compose restart cloudflared`), when `docker compose logs cloudflared` is checked, then a new `trycloudflare.com` URL appears (confirming URL is ephemeral and the URL-change workflow is understood).

- [ ] AC 6: Given the updated `.env.example`, when it is read, then it contains only `BOOK_DATA_PATH` and no `NGROK_*` variables.

---

## Additional Context

### Dependencies

- `cloudflare/cloudflared:latest` Docker image — public, no authentication required for quick-tunnel mode. Must be pulled on the Windows machine before first use: `docker pull cloudflare/cloudflared:latest`.
- Existing Caddy setup and `BOOK_DATA_PATH` env var — unchanged.
- `devbox run deploy:reader` — must be re-run after each tunnel restart to update `VITE_BOOK_DATA_URL` in the deployed reader.

### Testing Strategy

Manual verification only (no automated tests for infra):

1. SSH into Windows machine (`.window-server.yaml`), `cd d:\ntm\monkai\apps\deployer\win-server`
2. `docker compose pull cloudflared` — pull latest image
3. `docker compose down` — stop existing ngrok stack
4. `docker compose up -d` — start with new cloudflared config
5. `docker compose logs cloudflared` — confirm `trycloudflare.com` URL in output
6. From external network (phone hotspot): `curl -sI https://<TUNNEL_URL>/book-data/vnthuquan/index.json` — confirm `HTTP/2 200` + CORS
7. Update `apps/deployer/scripts/.env` → `VITE_BOOK_DATA_URL=https://<TUNNEL_URL>`, then `devbox run deploy:reader`
8. Open reader in browser, check DevTools Network — requests go to `*.trycloudflare.com`

### Notes

- **Operator workflow after each Windows server restart:** (1) `docker compose logs cloudflared 2>&1 | grep trycloudflare`, (2) copy new URL, (3) update `VITE_BOOK_DATA_URL` in `apps/deployer/scripts/.env`, (4) `devbox run deploy:reader`. This is the main operational cost of quick-tunnel vs a stable domain.
- **Existing `.env` cleanup:** The gitignored `apps/deployer/win-server/.env` currently contains `NGROK_AUTHTOKEN` and `NGROK_DOMAIN`. The operator must manually delete those two lines after deploying this change — they are unused and harmless but should be cleaned up.
- **Pi ngrok conflict no longer applies:** With ngrok removed, the constraint "stop Pi ngrok before starting Windows stack" is gone. Both servers can run simultaneously if needed.
- **Future upgrade path:** If URL-change friction becomes unacceptable, migrate to Cloudflare Named Tunnel (free Cloudflare account + domain managed on Cloudflare DNS) for a stable URL — that is a separate spec.
- **cloudflared image tag:** Using `latest` for simplicity. If image stability is a concern, pin to a specific version (e.g. `cloudflare/cloudflared:2025.1.0`) after verifying it works.

---

## Suggested Review Order

**Core service change**

- New cloudflared service: no credentials, `--no-autoupdate` prevents in-container self-upgrade
  [`docker-compose.yml:9`](../../apps/deployer/win-server/docker-compose.yml#L9)

**Config cleanup**

- NGROK_* vars removed; only BOOK_DATA_PATH remains (satisfies AC 6)
  [`win-server/.env.example:1`](../../apps/deployer/win-server/.env.example#L1)

**Operator workflow documentation**

- VITE_BOOK_DATA_URL comment updated with tunnel URL retrieval workflow
  [`scripts/.env.example:17`](../../apps/deployer/scripts/.env.example#L17)

- Windows Docker Server section updated; ngrok conflict note removed
  [`project-context.md:116`](../project-context.md#L116)

- Verify and troubleshooting steps updated for cloudflared
  [`migrate-docker-desktop-to-engine.md:208`](../../apps/deployer/win-server/migrate-docker-desktop-to-engine.md#L208)
