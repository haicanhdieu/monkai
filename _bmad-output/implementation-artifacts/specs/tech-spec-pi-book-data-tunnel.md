# Tech Spec: Pi Book Data Server via ngrok Tunnel

**Created:** 2026-05-05
**Updated:** 2026-05-05 (pivot from Cloudflare Tunnel — requires domain; ngrok requires no domain)
**Status:** completed

## Review Notes

- Adversarial review completed
- Findings: 12 total, 11 fixed, 1 acknowledged (F10 — world-readable book data is intentional for a public static server)
- Resolution approach: auto-fix

**Fixes applied:**
- F1: Added comment to `.env.production` flagging `<name>` placeholder as requiring substitution
- F2: `chmod 600` on ngrok config file after write — prevents world-readable authtoken
- F3: Added comment in setup-pi.sh pointing to ngrok GPG key verification docs
- F4: `StandardOutput=journal`, `StandardError=journal`, `NoNewPrivileges=yes` added to systemd unit
- F5: Scoped Caddy `root` to `data/book-data` + added `uri strip_prefix /book-data` — prevents over-serving
- F6: With F5 fix, `hide .git` is now correctly scoped to the served directory
- F7: 404 catch-all now sends `Access-Control-Allow-Origin: *` — clean CORS on all paths
- F8: Caddy readiness check added after restart; `After=caddy.service` added to systemd unit
- F9: Existing ngrok config backed up to `ngrok.yml.bak` before overwrite
- F11: ngrok v3 version assertion added after install
- F12: Replaced hardcoded `/home/pi` paths with `$PI_HOME`/`$PI_USER`; Caddyfile uses `<PI-HOME>` placeholder substituted via `sed` during deploy

## Goal

Serve `book-data` from the Raspberry Pi over stable public HTTPS without port forwarding, domain purchase, or waiting for free domain approval. ISP blocks inbound 80/443, so outbound tunnel is required.

## Why ngrok

- Free account, no credit card
- **Free static subdomain** (`*.ngrok-free.app`) claimed once, stable forever — URL does not change on restart
- HTTPS out of the box — ngrok terminates TLS at their edge
- Outbound tunnel — no port forwarding, no ACME challenges, no domain DNS config
- Works on Raspberry Pi (ARM64 binary available)

**Free tier limits** (acceptable for this use case):
- 1 active tunnel at a time ✓
- 40 requests/minute ✓ (reader caches aggressively with `staleTime: Infinity`)
- No hard bandwidth cap on free tier

## Cost

| Component | Cost |
|---|---|
| ngrok free account | $0 |
| ngrok static domain (`*.ngrok-free.app`) | $0 |
| Caddy (HTTP only, no cert) | $0 |
| **Total** | **$0** |

## Architecture

```
Browser
  └─→ https://<name>.ngrok-free.app/book-data/...
        └─→ ngrok edge  (TLS terminated here)
              └─→ ngrok tunnel  (outbound from Pi — no open ports)
                    └─→ http://localhost:80
                          └─→ Caddy  (plain HTTP file server)
                                └─→ /home/pi/working/monkai/apps/crawler/data/book-data/
```

Port forwarding rules on the router can be **removed** — no longer needed.
no-ip DDNS client can be **removed** — tunnel doesn't use the public IP.

## Manual steps (unavoidable)

1. **Create free ngrok account** at [ngrok.com](https://ngrok.com) — browser, one-time, no credit card.
2. **Copy your auth token** from the ngrok dashboard (`Your Authtoken` page).
3. **Claim your static domain** in the ngrok dashboard → `Domains` → `New Domain` — generates a free `*.ngrok-free.app` subdomain. Note the full domain (e.g. `monkai-book-data.ngrok-free.app`).

That's it. Everything else is scripted.

## Scripted setup (`setup-pi.sh`)

### Step 1 — Install ngrok (ARM64)

```bash
curl -sSL https://ngrok-agent.s3.amazonaws.com/ngrok.asc \
    | sudo tee /etc/apt/trusted.gpg.d/ngrok.asc >/dev/null
echo "deb https://ngrok-agent.s3.amazonaws.com buster main" \
    | sudo tee /etc/apt/sources.list.d/ngrok.list
sudo apt update && sudo apt install -y ngrok
```

### Step 2 — Authenticate ngrok

```bash
ngrok config add-authtoken <YOUR-AUTH-TOKEN>
```

### Step 3 — ngrok config — `/home/pi/.config/ngrok/ngrok.yml`

The setup script writes this file (with the static domain filled in):

```yaml
version: "3"
agent:
  authtoken: <YOUR-AUTH-TOKEN>

tunnels:
  book-data:
    proto: http
    addr: 80
    domain: <name>.ngrok-free.app
```

### Step 4 — ngrok systemd service — `/etc/systemd/system/ngrok.service`

```ini
[Unit]
Description=ngrok book-data tunnel
After=network-online.target
Wants=network-online.target

[Service]
ExecStart=/usr/bin/ngrok start book-data --config /home/pi/.config/ngrok/ngrok.yml
Restart=on-failure
RestartSec=10
User=pi

[Install]
WantedBy=multi-user.target
```

Enable:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now ngrok
sudo systemctl status ngrok
```

### Step 5 — Caddyfile — HTTP only (`:80`)

Caddy serves plain HTTP on localhost. ngrok forwards to it. No TLS, no ACME.

```
:80 {
    @book_data path /book-data/*
    @options method OPTIONS

    handle @options {
        header Access-Control-Allow-Origin "*"
        header Access-Control-Allow-Methods "GET, OPTIONS"
        respond 204
    }

    handle @book_data {
        root * /home/pi/working/monkai/apps/crawler/data
        file_server {
            hide .git
        }
        header Access-Control-Allow-Origin "*"
        header Access-Control-Allow-Methods "GET, OPTIONS"
    }

    respond 404
}
```

Key change from current: `ntm-pub.ddns.net { ... }` → `:80 { ... }`. Prevents Caddy attempting ACME/TLS.

## File changes in repo

| File | Change |
|---|---|
| `apps/deployer/pi-server/Caddyfile` | Bind to `:80`, drop hostname + HTTPS |
| `apps/deployer/pi-server/ngrok.yml.example` | New — config template with `<AUTH-TOKEN>` and `<NGROK-DOMAIN>` placeholders |
| `apps/deployer/pi-server/setup-pi.sh` | Replace Cloudflare/DDNS steps with ngrok install + service; prompt for auth token + domain |
| `apps/reader/.env.production` | `VITE_BOOK_DATA_URL=https://<name>.ngrok-free.app` |
| `apps/deployer/scripts/.env.example` | Update `VITE_BOOK_DATA_URL` comment |

## Verification

```bash
# 1. Tunnel status
sudo systemctl status ngrok
curl http://localhost:4040/api/tunnels  # ngrok local API

# 2. From any external network (phone hotspot)
curl -I https://<name>.ngrok-free.app/book-data/vnthuquan/index.json
# Expected: HTTP/2 200

# 3. CORS check
curl -H "Origin: https://monkai-reader.vercel.app" \
     -I https://<name>.ngrok-free.app/book-data/vnthuquan/index.json
# Expected: access-control-allow-origin: *

# 4. Non-book-data path blocked
curl -I https://<name>.ngrok-free.app/
# Expected: 404
```

Then open `https://monkai-reader.vercel.app` and confirm books load (DevTools → Network tab).

## What can be removed after this

- Router port forwarding rules 80 + 443
- `noip2` systemd service and binary
- no-ip DDNS subscription (`ntm-pub.ddns.net`)

## Acceptance criteria

| # | Given | When | Then |
|---|---|---|---|
| AC-1 | ngrok + Caddy running | `curl -I https://<name>.ngrok-free.app/book-data/vnthuquan/index.json` | HTTP/2 200 |
| AC-2 | Cross-origin request | Any request with `Origin` header | `access-control-allow-origin: *` present |
| AC-3 | OPTIONS preflight | `curl -X OPTIONS https://<name>.ngrok-free.app/book-data/x` | 204 with CORS headers |
| AC-4 | Non-book-data path | `curl https://<name>.ngrok-free.app/` | 404 |
| AC-5 | Reader deployed with new URL | Open `monkai-reader.vercel.app` | Books load; Network tab shows requests to `*.ngrok-free.app` |
| AC-6 | Pi reboots | After reboot, wait 30s | ngrok service restarts, same static URL works |
