# Updating the Cloudflare Tunnel URL

The Cloudflare quick-tunnel assigns a new random `*.trycloudflare.com` URL every time the
`cloudflared` container restarts (crash, host reboot, manual restart). When that happens,
the reader app will fail to load book data until the URL is updated.

---

## Step 1 — Get the new tunnel URL

SSH into the Windows server, then run:

```bash
docker compose logs cloudflared 2>&1 | grep trycloudflare
```

Look for a line like:
```
cloudflared-1  | ... INF |  https://<new-random>.trycloudflare.com  |
```

Copy that URL.

---

## Step 2 — Update `vercel.json` and `ci.yml`

Edit `apps/reader/vercel.json` in the repo:

```json
{ "source": "/book-data/:path*", "destination": "https://<new-random>.trycloudflare.com/book-data/:path*" },
```

Also update the duplicate hardcoded URL in `.github/workflows/ci.yml`, in the "Create Vercel output" step's `config.json` heredoc:

```json
{ "src": "/book-data/(.*)", "dest": "https://<new-random>.trycloudflare.com/book-data/$1" },
```

Both files must be updated in the same commit. `vercel.json` is canonical; `ci.yml` contains a duplicate that controls the CI/CD edge route and must stay in sync.

---

## Step 3 — Commit and push

```bash
git add apps/reader/vercel.json .github/workflows/ci.yml
git commit -m "chore(reader): update Cloudflare tunnel URL"
git push origin main
```

The CI pipeline deploys automatically (~1 min). No code rebuild needed — only these two files change.

---

## Why two files?

The production JS bundle uses relative paths (`/book-data/...`). Vercel rewrites those
to the actual server URL at the edge. `vercel.json` is the canonical source; `.github/workflows/ci.yml`
contains a duplicate URL in the "Create Vercel output" step that also controls the deployed edge route
and must be kept in sync.

---

## Quick reference

| File | Role |
|---|---|
| `apps/reader/vercel.json` | Canonical file — update when URL changes |
| `.github/workflows/ci.yml` | Duplicate URL in "Create Vercel output" heredoc — update alongside `vercel.json` |
| `apps/deployer/win-server/docker-compose.yml` | Runs cloudflared (no URL config needed) |
| `apps/reader/.env.production` | Intentionally blank — do not set `VITE_BOOK_DATA_URL` here |
