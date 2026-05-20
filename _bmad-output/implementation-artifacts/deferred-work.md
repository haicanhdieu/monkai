
## url-watcher-github-var deferred findings (2026-05-20)

- **Docker socket over-privilege**: `/var/run/docker.sock` mount gives container root-equivalent host access. Pre-existing risk. Consider rootless Docker or API-based container inspection.
- **`vars.CLOUDFLARE_TUNNEL_URL` unset on first deploy**: CI produces `"dest": "/book-data/$1"` (broken route) if GitHub variable not initialized before first push. Fix: add CI step to fail fast when variable is empty.
- **Classic PAT scope**: `.env.example` documents `repo` scope (over-privileged). Consider updating example to only reference fine-grained PAT with Actions + Variables read/write only.
- **Concurrent cloudflared start events during crash-loop**: Multiple events queue serially; two dispatches may fire with near-identical URLs. Consider debounce lock file in watch.sh.
