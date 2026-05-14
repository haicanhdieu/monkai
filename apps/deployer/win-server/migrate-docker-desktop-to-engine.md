# Migrate from Docker Desktop to Docker Engine (WSL2)

**Goal:** Replace Docker Desktop (GUI, requires user login) with Docker Engine running
inside WSL2 under systemd, so containers auto-start on Windows boot with no user login needed.

**Time:** ~30 minutes. Containers will be briefly offline during the cut-over.

---

## Phase 1 — Inventory before you uninstall anything

Open PowerShell (not as admin) and run:

```powershell
# Everything that's running
docker ps -a --format "table {{.Names}}\t{{.Image}}\t{{.Status}}"

# All named volumes (check for persistent data)
docker volume ls

# All compose projects
docker compose ls
```

For each named volume that contains data you care about, export it:

```powershell
# Replace 'myvolume' and 'C:\backup' with your actual values
docker run --rm `
  -v myvolume:/data `
  -v C:\backup:/backup `
  alpine tar czf /backup/myvolume.tar.gz -C /data .
```

> The caddy + ngrok stack in this directory has **no persistent volumes** — its data is the
> host-mounted `book-data` folder. No export needed for it.

---

## Phase 2 — Install Docker Engine inside WSL2 (Ubuntu)

### 2a. Ensure WSL2 + Ubuntu are installed

In PowerShell **as Administrator**:

```powershell
wsl --install                   # installs WSL2 + Ubuntu if not already present
wsl --set-default Ubuntu        # make Ubuntu the default distro
wsl --update                    # get latest WSL2 kernel
```

Reboot if WSL2 was just installed, then continue.

### 2b. Enable systemd inside WSL2

Inside the Ubuntu shell (`wsl`), create or edit `/etc/wsl.conf`:

```bash
sudo tee /etc/wsl.conf > /dev/null <<'EOF'
[boot]
systemd=true
EOF
```

Shut down WSL2 so the new config takes effect:

```powershell
# Back in PowerShell
wsl --shutdown
wsl   # re-open Ubuntu — systemd is now PID 1
```

### 2c. Install Docker Engine

Inside the Ubuntu WSL2 shell:

```bash
# Add Docker's official apt repo
sudo apt-get update
sudo apt-get install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
  https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io \
  docker-buildx-plugin docker-compose-plugin

# Enable + start the daemon
sudo systemctl enable docker
sudo systemctl start docker

# Add your WSL2 user to the docker group (no sudo needed for docker commands)
sudo usermod -aG docker $USER
newgrp docker

# Verify
docker info
```

---

## Phase 3 — Uninstall Docker Desktop

1. In Windows: **Settings → Apps → Docker Desktop → Uninstall**
2. Reboot Windows after the uninstall completes.
3. After reboot, open a WSL2 terminal and confirm Docker still works:
   ```bash
   docker info
   docker ps
   ```
   Docker Engine in WSL2 is independent of Docker Desktop — uninstalling Desktop does not
   affect the WSL2 installation.

---

## Phase 4 — Migrate your existing compose stacks

Docker Engine in WSL2 uses the Linux filesystem. Windows paths are mounted under `/mnt/`:

| Windows path | WSL2 path |
|---|---|
| `C:\Users\you\project` | `/mnt/c/Users/you/project` |
| `D:\data\book-data` | `/mnt/d/data/book-data` |

### 4a. Update `.env` in this directory

Open `apps/deployer/win-server/.env` and update `BOOK_DATA_PATH` to the WSL2-format path:

```
# Example — replace with your actual Windows book-data path in WSL2 format
BOOK_DATA_PATH=/mnt/c/Users/you/monkai/apps/crawler/data/book-data
```

> **Important:** Docker Engine in WSL2 does NOT understand `C:\...` paths in volume mounts.
> You must use the `/mnt/c/...` form.

### 4b. Bring up this stack

```bash
# Inside WSL2 Ubuntu
cd /mnt/c/path/to/monkai/apps/deployer/win-server
docker compose up -d
docker compose ps    # both services should show 'running'
```

### 4c. Restore any other compose stacks

For each compose project you inventoried in Phase 1, navigate to its directory (via `/mnt/c/...`)
and run `docker compose up -d`. Update any Windows-format paths in their `.env` files to WSL2 format.

### 4d. Restore volume data (if you exported any)

```bash
# Inside WSL2 Ubuntu — replace 'myvolume' and path as needed
docker volume create myvolume
docker run --rm \
  -v myvolume:/data \
  -v /mnt/c/backup:/backup \
  alpine sh -c "tar xzf /backup/myvolume.tar.gz -C /data"
```

---

## Phase 5 — Register the Windows startup task

Back in PowerShell **as Administrator**, from this directory:

```powershell
.\register-startup-task.ps1
```

This registers a Task Scheduler task (`MonkaiBookDataServer`) that:
1. Runs at system startup under the SYSTEM account
2. Starts WSL2 (which triggers systemd → Docker Engine auto-start)
3. Waits for Docker to be ready inside WSL2
4. Runs `docker compose up -d` for the book-data stack

> **Your other compose stacks** also auto-start if they were running when you last ran
> `wsl --shutdown`, because systemd starts Docker and Docker starts them via `restart: always`.
> The `MonkaiBookDataServer` task handles only the book-data stack explicitly; other stacks
> rely on Docker's own restart policy.

---

## Phase 6 — Verify end-to-end

```powershell
# Simulate a reboot: shut down WSL2, then run the task manually
wsl --shutdown
Start-ScheduledTask -TaskName 'MonkaiBookDataServer'

# Wait ~60 seconds, then check
Get-ScheduledTaskInfo -TaskName 'MonkaiBookDataServer'
# LastTaskResult should be 0
```

Inside WSL2:
```bash
docker compose -f /mnt/c/.../win-server/docker-compose.yml ps
# Both caddy and ngrok should be 'running'
```

From outside:
```bash
curl -I https://<NGROK_DOMAIN>/book-data/index.json
# HTTP 200, access-control-allow-origin: *
```

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `docker: command not found` inside WSL2 | Docker Engine not installed | Re-run Phase 2c |
| `Cannot connect to the Docker daemon` | systemd not enabled or docker.service not started | Check `sudo systemctl status docker` inside WSL2 |
| Caddy returns 404 for all files | `BOOK_DATA_PATH` still a Windows path | Update `.env` to `/mnt/c/...` format |
| Task runs but `LastTaskResult = 1` | WSL2 distro name mismatch | Run `wsl --list` and pass correct `-WslDistro` to startup-wsl2.ps1 |
| ngrok crash-loops | Pi ngrok still running | `sudo systemctl stop ngrok` on the Pi |
