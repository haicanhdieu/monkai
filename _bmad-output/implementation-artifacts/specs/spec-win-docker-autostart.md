---
title: 'Windows Docker Auto-start — WSL2 Engine + Task Scheduler'
type: 'chore'
created: '2026-05-14'
status: 'done'
route: 'one-shot'
context: []
---

## Intent

**Problem:** The Windows book-data server (Caddy + ngrok via Docker) goes offline after a Windows Update or reboot because Docker Desktop only starts when a user logs in. There is no mechanism to bring the containers back up headlessly.

**Approach:** Migrate from Docker Desktop to Docker Engine running inside WSL2 under systemd, then register a Windows Task Scheduler task (SYSTEM account, no login required) that warms WSL2 at boot, waits for the Docker daemon, and runs `docker compose up -d` for the book-data stack.

## Suggested Review Order

**Migration guide**

- Step-by-step instructions: inventory, WSL2 setup, Docker Engine install, Docker Desktop uninstall, path migration, task registration
  [`migrate-docker-desktop-to-engine.md:1`](../../apps/deployer/win-server/migrate-docker-desktop-to-engine.md#L1)

**Startup script (WSL2)**

- Warms WSL2 distro (triggers systemd → `docker.service`), polls daemon, runs compose up
  [`startup-wsl2.ps1:1`](../../apps/deployer/win-server/startup-wsl2.ps1#L1)

- Auto-derives WSL2 compose path from the script's own Windows location
  [`startup-wsl2.ps1:40`](../../apps/deployer/win-server/startup-wsl2.ps1#L40)

**Task Scheduler registration**

- Registers SYSTEM-account task with 30 s startup delay and 3-retry policy
  [`register-startup-task.ps1:1`](../../apps/deployer/win-server/register-startup-task.ps1#L1)

**Compose + env**

- `restart: always` ensures containers auto-restart if Docker daemon restarts mid-session
  [`docker-compose.yml:7`](../../apps/deployer/win-server/docker-compose.yml#L7)

- `.env.example` updated with WSL2-format path guidance (`/mnt/c/...`)
  [`.env.example:1`](../../apps/deployer/win-server/.env.example#L1)
