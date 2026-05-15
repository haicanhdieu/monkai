---

## title: 'Windows Docker Book Data Server — Caddy + ngrok'
type: 'feature'
created: '2026-05-10'
status: 'done'
baseline_commit: '3c054eb88feb1757d7cf109ad0d753d2d92d546b'
context: []



## Intent

**Problem:** Book data is currently served from the Raspberry Pi using Caddy + ngrok (systemd services). We need a portable equivalent that runs on a Windows machine via Docker Compose, requiring no Linux-specific tooling.

**Approach:** Create a `docker-compose.yml` under `apps/deployer/win-server/` with two services — Caddy (HTTP static file server) and ngrok (outbound tunnel) — that mirror what the Pi setup does but are fully containerised and Windows-compatible. Book data is mounted from a Windows host path into the Caddy container; ngrok tunnels it to the same `*.ngrok-free.app` static domain.

## Boundaries & Constraints

**Always:**

- Caddy must serve ONLY `/book-data/`*; all other paths return 404
- CORS headers `Access-Control-Allow-Origin: *` and `Access-Control-Allow-Methods: GET, OPTIONS` on every response (including 404 catch-all and OPTIONS preflight)
- Book data dir is mounted read-only into Caddy
- ngrok auth token and domain sourced from `.env` file — never hardcoded in compose or Caddyfile
- ngrok free tier supports 1 active tunnel — Pi ngrok service must be stopped before starting this stack

**Ask First:**

- If the user wants a different DDNS/tunnel provider instead of ngrok
- If the Windows book data path will be synced from Pi (affects whether deploy scripts need updating)

**Never:**

- No TLS termination in Caddy (ngrok handles HTTPS at its edge, same as Pi setup)
- No port 80/443 forwarded on Windows — tunnel is outbound only
- No changes to reader code or `VITE_BOOK_DATA_URL` if reusing the same ngrok static domain

## I/O & Edge-Case Matrix


| Scenario               | Input / State                | Expected Output / Behavior                                      | Error Handling                                 |
| ---------------------- | ---------------------------- | --------------------------------------------------------------- | ---------------------------------------------- |
| Book data request      | `GET /book-data/index.json`  | HTTP 200 + JSON content + CORS headers                          | 404 if file missing                            |
| CORS preflight         | `OPTIONS /book-data/x`       | 204 with CORS headers                                           | —                                              |
| Non-book-data path     | `GET /` or `/anything-else`  | 404 with CORS headers                                           | —                                              |
| ngrok not connected    | Caddy running, ngrok crashed | Public URL unreachable; `docker compose logs ngrok` shows error | Compose `restart: unless-stopped` auto-retries |
| Wrong `BOOK_DATA_PATH` | Path doesn't exist on host   | Caddy starts but all `/book-data/`* returns 404                 | Check volume mount in `docker compose ps`      |




## Code Map

- `apps/deployer/win-server/docker-compose.yml` — new: Caddy + ngrok services with env-driven config
- `apps/deployer/win-server/Caddyfile` — new: HTTP-only static server, CORS, `/book-data/*` only
- `apps/deployer/win-server/.env.example` — new: template for `NGROK_AUTHTOKEN`, `NGROK_DOMAIN`, `BOOK_DATA_PATH`
- `apps/deployer/pi-server/Caddyfile` -- reference: same CORS + path guard pattern to mirror
- `apps/deployer/pi-server/ngrok.yml.example` -- reference: ngrok domain/token pattern

## Tasks & Acceptance

**Execution:**

- [x] `apps/deployer/win-server/Caddyfile` -- create: HTTP-only Caddy config binding `:80`, serving `/book-data/`* from `/srv` root (volume mount target), CORS headers on all handles including 404, OPTIONS preflight returns 204. Mirror `apps/deployer/pi-server/Caddyfile` exactly except root path (`/srv` instead of Pi's absolute path).
- [x] `apps/deployer/win-server/docker-compose.yml` -- create: two services. `caddy`: image `caddy:2-alpine`, mounts `./Caddyfile:/etc/caddy/Caddyfile:ro` and `${BOOK_DATA_PATH}:/srv/book-data:ro`, `restart: unless-stopped`. `ngrok`: image `ngrok/ngrok:latest`, env `NGROK_AUTHTOKEN`, command `http caddy:80 --domain=${NGROK_DOMAIN}`, `depends_on: caddy`, `restart: unless-stopped`.
- [x] `apps/deployer/win-server/.env.example` -- create: three keys with comments — `NGROK_AUTHTOKEN` (from ngrok dashboard), `NGROK_DOMAIN` (e.g. `monkai-book-data.ngrok-free.app`), `BOOK_DATA_PATH` (Windows absolute path to `book-data` dir, e.g. `C:\Users\you\monkai\apps\crawler\data\book-data`).

**Acceptance Criteria:**

- Given: `docker compose up` runs with valid `.env`, when `curl http://localhost` from inside the `caddy` container (or via ngrok URL externally), then `/book-data/index.json` returns HTTP 200 with JSON and `access-control-allow-origin: `*
- Given: ngrok service is up, when checking `https://<NGROK_DOMAIN>/book-data/index.json` from an external network, then HTTP/2 200 with CORS headers
- Given: any request to `/` or non-book-data path, when routed through ngrok, then HTTP 404 with `access-control-allow-origin: *`
- Given: OPTIONS request to any `/book-data/*` path, then 204 with CORS headers (preflight support)
- Given: `BOOK_DATA_PATH` set to a Windows path with book data, when `docker compose up`, then Caddy serves files from that directory without requiring Linux path format

## Design Notes

**Caddyfile root mapping:** Caddy's `root * /srv` combined with volume mount `${BOOK_DATA_PATH}:/srv/book-data:ro` means the URL `/book-data/index.json` resolves to `/srv/book-data/index.json` in the container — matching the reader's expected URL shape without any `uri strip_prefix` needed. This mirrors the Pi Caddyfile pattern where `root * /home/pi/.../data` serves `/book-data/`*.

**Windows path in `.env`:** Docker Desktop on Windows accepts both native `C:\path` and POSIX `/c/path` in volume mounts within `.env`. Use the Windows native path in `.env.example` with a comment noting Docker Desktop normalises it.

**ngrok free tier / Pi conflict:** ngrok free accounts support 1 simultaneous tunnel. Before starting this stack, run `sudo systemctl stop ngrok` on the Pi (or both services will compete for the same domain and the second one will fail silently).

## Verification

**Commands:**

- `docker compose up -d` -- expected: both services start, no exit codes in `docker compose ps`
- `docker compose logs ngrok` -- expected: `started tunnel` line with the ngrok-free.app URL
- `curl -I https://<NGROK_DOMAIN>/book-data/index.json` -- expected: `HTTP/2 200`, `access-control-allow-origin: `*
- `curl -X OPTIONS https://<NGROK_DOMAIN>/book-data/x -I` -- expected: 204, CORS headers
- `curl -I https://<NGROK_DOMAIN>/` -- expected: 404

**Manual checks (if no CLI):**

- Open `https://<NGROK_DOMAIN>/book-data/index.json` in browser — should return JSON (no browser security warning since ngrok handles TLS)
- Open the deployed reader app and verify the catalog loads via browser DevTools Network tab (requests go to `*.ngrok-free.app`)

## Spec Change Log

## Suggested Review Order

**Service wiring**

- Entry point: two-service compose with env-driven ngrok domain and volume mount
  [`docker-compose.yml:1`](../../apps/deployer/win-server/docker-compose.yml#L1)

- ngrok service — image pinned to major version, tunnels to internal `caddy:80`
  [`docker-compose.yml:10`](../../apps/deployer/win-server/docker-compose.yml#L10)

**HTTP serving + CORS**

- Caddyfile binds plain HTTP `:80`; all routing follows
  [`Caddyfile:1`](../../apps/deployer/win-server/Caddyfile#L1)

- OPTIONS preflight returns 204 with CORS — required before any browser fetch
  [`Caddyfile:5`](../../apps/deployer/win-server/Caddyfile#L5)

- `@book_data` block: strip_prefix + root maps URL to volume mount correctly
  [`Caddyfile:11`](../../apps/deployer/win-server/Caddyfile#L11)

- 404 catch-all includes CORS headers so browser doesn't swallow errors
  [`Caddyfile:21`](../../apps/deployer/win-server/Caddyfile#L21)

**Configuration**

- Three required env vars; Windows path must use forward slashes
  [`.env.example:1`](../../apps/deployer/win-server/.env.example#L1)

- Prevents actual `.env` (with authtoken) from being committed
  [`.gitignore:1`](../../apps/deployer/win-server/.gitignore#L1)

