---
title: 'Pi Book Data Server — Caddy + DDNS'
slug: 'pi-book-data-server'
created: '2026-05-05'
status: 'completed'
stepsCompleted: [1, 2, 3, 4, 5, 6]
tech_stack:
  - Caddy 2.x (static file server + auto HTTPS via Let's Encrypt)
  - no-ip DUC (Dynamic Update Client, compiled from source)
  - systemd (service unit for noip2 on Raspberry Pi OS)
  - Raspberry Pi OS (Debian-based, Pi at 192.168.1.225)
files_to_modify:
  - apps/deployer/scripts/.env
  - apps/reader/.env.production
code_patterns:
  - "Reader uses resolveBookDataBaseUrl() → VITE_BOOK_DATA_URL env var"
  - "All fetch paths: {baseUrl}/book-data/{source}/index.json, /book-data/{artifactPath}, /book-data/{coverPath}"
  - "Caddy root must be parent of book-data dir: /home/pi/working/monkai/apps/crawler/data"
  - "deployer/scripts/.env is source of truth for VITE_BOOK_DATA_URL in production builds"
test_patterns:
  - "No automated tests — verification is manual curl + browser DevTools"
---

# Tech-Spec: Pi Book Data Server — Caddy + DDNS

**Created:** 2026-05-05

## Overview

### Problem Statement

Book data (crawler output at `apps/crawler/data/book-data/`) is currently hosted on Cloudflare R2. Every time the crawler runs on the Pi and produces new data, it must be manually uploaded to R2 before the reader reflects the changes. This adds operational friction and a cloud storage dependency.

### Solution

Serve the book data directory directly from the Raspberry Pi (`192.168.1.225`) using Caddy as the HTTP/HTTPS file server. Caddy automatically provisions a Let's Encrypt TLS certificate for the DDNS hostname `ntm-pub.ddns.net`. The no-ip Dynamic Update Client (DUC) runs as a systemd service on the Pi to keep the DDNS record pointing at the router's current public IP. The router port-forwards 80 and 443 to the Pi. The reader's `VITE_BOOK_DATA_URL` is updated to `https://ntm-pub.ddns.net` — no other reader code changes needed.

### Scope

**In Scope:**
- Caddy installation on Pi via apt/official repo
- Caddyfile configuration: static file serving with path alias, CORS headers, directory listing disabled
- no-ip DUC installation and systemd service setup on Pi
- Router port forwarding guide: external 80 + 443 → `192.168.1.225:80` + `192.168.1.225:443`
- Reader env update: `apps/reader/.env.production` and `apps/deployer/scripts/.env`
- Verification steps (curl, browser test)

**Out of Scope:**
- Pi firewall (ufw) rule changes — noted as optional hardening
- Moving book data to a different filesystem path
- Crawler code changes
- Reader deployment pipeline changes beyond env var update
- SSL certificate management (Caddy handles it automatically)

## Context for Development

### Architecture

The reader's data fetching is entirely driven by `VITE_BOOK_DATA_URL`:

- `apps/reader/src/shared/services/data.service.ts:35` — `resolveBookDataBaseUrl()` reads `VITE_BOOK_DATA_URL`
- All requests follow pattern: `{baseUrl}/book-data/{file}` (e.g. `https://ntm-pub.ddns.net/book-data/index.json`)
- `apps/deployer/scripts/deploy-reader-static.mjs` passes `VITE_BOOK_DATA_URL` at Vercel build time via `--build-env`
- `apps/reader/.env.production` has `VITE_BOOK_DATA_URL=` (empty) — deployer `.env` is the source of truth for production value

### Path Mapping Requirement

Pi data lives at: `/home/pi/working/monkai/apps/crawler/data/book-data/`

Reader requests: `GET https://ntm-pub.ddns.net/book-data/{file}`

Caddy must map the URL prefix `/book-data/` → the Pi filesystem path above. This is a `root` + `file_server` directive scoped to `/book-data/*`.

### CORS Requirement

The reader is served from Vercel (HTTPS, different origin). Caddy must add:
```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, OPTIONS
```

### no-ip Account

- Domain: `ntm-pub.ddns.net`
- Service: no-ip free DDNS
- User already has account — DUC needs credentials configured

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `apps/reader/src/shared/services/data.service.ts` | `resolveBookDataBaseUrl()` — reads `VITE_BOOK_DATA_URL` |
| `apps/reader/.env.production` | Production env template (currently empty `VITE_BOOK_DATA_URL`) |
| `apps/deployer/scripts/deploy-reader-static.mjs` | Passes `VITE_BOOK_DATA_URL` at Vercel build time |
| `apps/deployer/scripts/.env` | Deployer env — source of truth for `VITE_BOOK_DATA_URL` in production |

## Implementation Plan

### Tasks

> Tasks ordered by dependency — Pi setup first, reader config last.

#### 1. Router Port Forwarding (manual — no code)

**Setup guide:**

1. Log in to router admin UI (typically `192.168.1.1`)
2. Navigate to **Port Forwarding** (may be under NAT, Firewall, or Virtual Servers)
3. Add two rules:
   | Name | External Port | Internal IP | Internal Port | Protocol |
   |------|--------------|-------------|---------------|----------|
   | caddy-http | 80 | 192.168.1.225 | 80 | TCP |
   | caddy-https | 443 | 192.168.1.225 | 443 | TCP |
4. Save and apply

**Note:** Some ISPs block inbound port 80/443 on residential plans. Verify by running `curl -v http://<your-public-ip>` from an external network after setup.

#### 2. no-ip DUC Installation on Pi

SSH into Pi (`ssh pi@192.168.1.225`) and run:

```bash
# Install no-ip DUC
cd /tmp
curl -o noip-duc-linux.tar.gz https://www.noip.com/client/linux/noip-duc-linux.tar.gz
tar xzf noip-duc-linux.tar.gz
cd noip-2.1.9-1  # version may differ
make
sudo make install
# Interactive config — enter no-ip account credentials and select ntm-pub.ddns.net
sudo /usr/local/bin/noip2 -C
```

Create systemd service `/etc/systemd/system/noip2.service`:

```ini
[Unit]
Description=No-IP Dynamic DNS Update Client
After=network.target

[Service]
Type=forking
ExecStart=/usr/local/bin/noip2
Restart=always
RestartSec=30

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable noip2
sudo systemctl start noip2
sudo systemctl status noip2
```

Verify DDNS resolves to correct IP:

```bash
dig +short ntm-pub.ddns.net
curl ifconfig.me  # should match
```

#### 3. Caddy Installation on Pi

```bash
# Add Caddy official apt repo
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install caddy

# Verify
caddy version
sudo systemctl status caddy
```

#### 4. Caddyfile Configuration

File: `/etc/caddy/Caddyfile`

```
ntm-pub.ddns.net {
    # Disable directory listing
    @book_data path /book-data/*
    handle @book_data {
        root * /home/pi/working/monkai/apps/crawler/data
        file_server {
            hide .git
        }
        header Access-Control-Allow-Origin "*"
        header Access-Control-Allow-Methods "GET, OPTIONS"
    }

    # Reject everything else
    respond 404
}
```

Apply config:

```bash
sudo caddy fmt --overwrite /etc/caddy/Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

**How it works:**
- Caddy auto-obtains a Let's Encrypt cert for `ntm-pub.ddns.net` on first request (requires port 80 open for ACME HTTP-01 challenge, port 443 for HTTPS serving)
- `root * /home/pi/working/monkai/apps/crawler/data` sets filesystem root to the parent of `book-data/`
- URL `/book-data/index.json` → file `/home/pi/working/monkai/apps/crawler/data/book-data/index.json`
- CORS headers allow the reader (Vercel origin) to fetch

#### 5. Update Reader Production Config

**File: `apps/deployer/scripts/.env`** (source of truth for production builds)

```diff
-VITE_BOOK_DATA_URL=https://pub-f372aac7cb1749f3927f74f6375153b5.r2.dev
+VITE_BOOK_DATA_URL=https://ntm-pub.ddns.net
```

**File: `apps/reader/.env.production`** (update for consistency):

```diff
-VITE_BOOK_DATA_URL=
+VITE_BOOK_DATA_URL=https://ntm-pub.ddns.net
```

**File: `apps/reader/.env`** (local dev — optional, keep R2 or update to Pi):

No change required (local dev uses localhost:3001 mock server).

#### 6. Verify End-to-End

From any external machine (not home network):

```bash
# Check DDNS + TLS
curl -I https://ntm-pub.ddns.net/book-data/index.json

# Check CORS headers present
curl -H "Origin: https://your-vercel-app.vercel.app" \
     -I https://ntm-pub.ddns.net/book-data/index.json

# Expected response headers:
# HTTP/2 200
# access-control-allow-origin: *
# content-type: application/json
```

From browser: navigate to the deployed reader app and verify the catalog loads.

### Acceptance Criteria

**AC-1 — HTTPS cert provisioned**

- Given: Caddy is running and ports 80/443 are forwarded to Pi
- When: First HTTPS request hits `ntm-pub.ddns.net`
- Then: Caddy auto-provisions Let's Encrypt cert; browser shows valid TLS (no warnings)

**AC-2 — Book data accessible**

- Given: Caddy is configured with the Caddyfile above
- When: `curl https://ntm-pub.ddns.net/book-data/index.json`
- Then: Returns HTTP 200 with JSON content

**AC-3 — CORS headers present**

- Given: Request includes `Origin` header from reader's Vercel domain
- When: `curl -H "Origin: https://example.vercel.app" -I https://ntm-pub.ddns.net/book-data/index.json`
- Then: Response includes `Access-Control-Allow-Origin: *`

**AC-4 — Directory listing blocked**

- Given: Caddy is running
- When: `curl https://ntm-pub.ddns.net/book-data/`
- Then: Returns file listing disabled (or index.json if it exists) — NOT a directory listing page

**AC-5 — Non-book-data paths rejected**

- Given: Caddy responds 404 for all non-`/book-data/*` paths
- When: `curl https://ntm-pub.ddns.net/`
- Then: HTTP 404

**AC-6 — Reader loads from Pi**

- Given: `VITE_BOOK_DATA_URL=https://ntm-pub.ddns.net` set in deployer env
- When: Reader is built and deployed via `devbox run deploy:reader`
- Then: Reader catalog and book data load from Pi (verify via browser DevTools Network tab — requests go to `ntm-pub.ddns.net`)

**AC-7 — DDNS stays current**

- Given: noip2 systemd service is running
- When: Router's public IP changes
- Then: `dig +short ntm-pub.ddns.net` eventually reflects the new IP (within ~5 min)

## Additional Context

### Dependencies

- Pi must have internet access (for ACME challenge and no-ip updates)
- no-ip free account allows 1 hostname update per 30 days if DUC is not running — keep DUC service running
- Let's Encrypt rate limits: 5 cert issuances per domain per week — don't restart Caddy repeatedly during testing
- Book data directory must be readable by the `caddy` system user: `sudo chmod -R o+rX /home/pi/working/monkai/apps/crawler/data/book-data`

### Optional Hardening (Out of Scope but Recommended)

```bash
# Allow only HTTP/HTTPS inbound on Pi firewall
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 22/tcp  # keep SSH!
sudo ufw enable
```

### Testing Strategy

- Manual curl tests from an external network (use phone hotspot to avoid LAN bypass)
- Browser DevTools Network tab to confirm requests hit `ntm-pub.ddns.net`
- `sudo journalctl -u caddy -f` to watch Caddy logs during first cert provisioning

### Notes

- Caddy stores certs at `/var/lib/caddy/.local/share/caddy/` — backed up automatically on Pi
- If ISP blocks port 80, the ACME HTTP-01 challenge will fail. Alternative: use Caddy's DNS challenge provider (requires no-ip API token or switching to Cloudflare DNS)
- After router port forwarding is saved, test from **outside home network** (e.g. phone hotspot) — LAN requests bypass the router NAT and won't reflect actual external connectivity
- `devbox run deploy:reader` must be re-run after updating `VITE_BOOK_DATA_URL` in deployer `.env` to rebuild and redeploy the reader

## Review Notes

- Adversarial review completed
- Findings: 12 total, 9 fixed, 3 skipped (F7 noise/uncertain, F8 low/by-design, implicit duplicates)
- Resolution approach: auto-fix
- Key fixes: noip2.service uses network-online.target; setup-pi.sh is idempotent, checks noip2 config before starting service, validates file existence upfront, adds build-essential; Caddyfile handles OPTIONS preflight for CORS; .env.example restores R2 setup instructions
