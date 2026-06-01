#!/usr/bin/env bash
# Pi Book Data Server setup script
# Run on Raspberry Pi as the pi user: bash setup-pi.sh
# Prerequisites: SSH into Pi, repo cloned at ~/working/monkai
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PI_USER="$(whoami)"
BOOK_DATA_PATH="/mnt/data/book-data"
URL_WATCHER_SCRIPT="$SCRIPT_DIR/url-watcher.sh"

if [[ "$PI_USER" == "root" ]]; then
    echo "ERROR: Run as the pi user, not root. Systemd units will embed the wrong user."
    exit 1
fi

if [[ ! -f "$SCRIPT_DIR/Caddyfile" ]]; then
    echo "ERROR: Caddyfile not found at $SCRIPT_DIR/Caddyfile"
    echo "Run this script from within the monkai repo on the Pi."
    exit 1
fi

if [[ ! -f "$URL_WATCHER_SCRIPT" ]]; then
    echo "ERROR: url-watcher.sh not found at $URL_WATCHER_SCRIPT"
    exit 1
fi

echo ""
echo "=== Step 1: Install Caddy and jq ==="
if command -v caddy &>/dev/null; then
    echo "Caddy already installed: $(caddy version)"
else
    sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
        | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
        | sudo tee /etc/apt/sources.list.d/caddy-stable.list
    sudo apt update
    sudo apt install -y caddy
    echo "Caddy installed: $(caddy version)"
fi
if ! command -v jq &>/dev/null; then
    sudo apt install -y jq
    echo "jq installed: $(jq --version)"
fi

echo "=== Step 2: Deploy Caddyfile ==="
sudo cp "$SCRIPT_DIR/Caddyfile" /etc/caddy/Caddyfile
sudo caddy fmt --overwrite /etc/caddy/Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl enable caddy
sudo systemctl restart caddy

echo "Waiting for Caddy to be ready..."
for i in {1..5}; do
    systemctl is-active --quiet caddy && break
    sleep 2
done
systemctl is-active --quiet caddy || { echo "ERROR: Caddy failed to start"; exit 1; }
echo "Caddy configured and running on :80"

echo "=== Step 3: Fix book-data permissions ==="
# o+rX: book-data is public content; world-readable is intentional for a public static server
# mkdir -p guards against chmod failing on a fresh Pi before sync has run
sudo mkdir -p "$BOOK_DATA_PATH"
sudo chmod -R o+rX "$BOOK_DATA_PATH"
echo "Permissions set on $BOOK_DATA_PATH"

echo "=== Step 4: Install cloudflared ==="
if command -v cloudflared &>/dev/null; then
    echo "cloudflared already installed: $(cloudflared version)"
else
    ARCH="$(uname -m)"
    if [[ "$ARCH" == "aarch64" || "$ARCH" == "arm64" ]]; then
        CF_PKG="cloudflared-linux-arm64.deb"
    elif [[ "$ARCH" == "armv7l" ]]; then
        CF_PKG="cloudflared-linux-arm.deb"
    else
        CF_PKG="cloudflared-linux-amd64.deb"
    fi
    CF_URL="https://github.com/cloudflare/cloudflared/releases/latest/download/$CF_PKG"
    curl -L "$CF_URL" -o /tmp/cloudflared.deb
    sudo dpkg -i /tmp/cloudflared.deb
    rm /tmp/cloudflared.deb
    echo "cloudflared installed: $(cloudflared version)"
fi
# Resolve path after install so the heredoc below gets a non-empty ExecStart
CF_BIN="$(command -v cloudflared)"

echo "=== Step 5: Grant journal access + install cloudflared systemd service ==="
# url-watcher reads cloudflared logs via journalctl; pi user needs systemd-journal group
if ! groups "$PI_USER" | grep -q systemd-journal; then
    sudo usermod -a -G systemd-journal "$PI_USER"
    echo "Added $PI_USER to systemd-journal group (re-login not needed; systemd reads group at service start)"
fi

sudo tee /etc/systemd/system/cloudflared.service > /dev/null <<EOF
[Unit]
Description=cloudflared quick-tunnel
After=caddy.service network-online.target
Wants=network-online.target

[Service]
ExecStart=${CF_BIN} tunnel --no-autoupdate --url http://localhost:80
Restart=always
RestartSec=10
User=${PI_USER}
StandardOutput=journal
StandardError=journal
NoNewPrivileges=yes

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now cloudflared
echo "Waiting for cloudflared..."
for i in {1..5}; do
    systemctl is-active --quiet cloudflared && break
    sleep 2
done
systemctl is-active --quiet cloudflared || { echo "ERROR: cloudflared failed to start"; exit 1; }
echo "cloudflared running"

echo "=== Step 6: Configure url-watcher ==="
if [[ ! -f /etc/url-watcher.env ]]; then
    echo ""
    echo "url-watcher needs a GitHub token and repo to update the tunnel URL."
    echo "Create /etc/url-watcher.env with:"
    echo "  GITHUB_TOKEN=<your-token>   (needs: actions:write, variables:write)"
    echo "  GITHUB_REPO=<owner/repo>    (e.g. your-org/monkai)"
    echo ""
    read -rp "Press Enter after creating /etc/url-watcher.env to continue..."
    if [[ ! -f /etc/url-watcher.env ]]; then
        echo "ERROR: /etc/url-watcher.env still missing. Create it and re-run Step 6 manually."
        exit 1
    fi
fi
# Validate required keys exist and are non-empty
for key in GITHUB_TOKEN GITHUB_REPO; do
    val=$(grep -E "^${key}=" /etc/url-watcher.env | cut -d= -f2- | tr -d '"'"'" | xargs)
    if [[ -z "$val" ]]; then
        echo "ERROR: /etc/url-watcher.env missing or empty value for $key"
        exit 1
    fi
done
sudo chmod 600 /etc/url-watcher.env
sudo chown root:root /etc/url-watcher.env

chmod +x "$URL_WATCHER_SCRIPT"

sudo tee /etc/systemd/system/url-watcher.service > /dev/null <<EOF
[Unit]
Description=url-watcher — sync cloudflared tunnel URL to GitHub
After=cloudflared.service
Wants=cloudflared.service

[Service]
ExecStart=${URL_WATCHER_SCRIPT}
EnvironmentFile=/etc/url-watcher.env
Restart=always
RestartSec=10
User=${PI_USER}
StandardOutput=journal
StandardError=journal
NoNewPrivileges=yes

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now url-watcher
for i in {1..5}; do
    systemctl is-active --quiet url-watcher && break
    sleep 2
done
systemctl is-active --quiet url-watcher || { echo "ERROR: url-watcher failed to start"; exit 1; }
echo "url-watcher running"

echo ""
echo "=== Setup complete ==="
echo ""
echo "Verify all services:"
echo "  systemctl is-active caddy cloudflared url-watcher"
echo ""
echo "Check tunnel URL (allow ~30s for cloudflared to negotiate):"
echo "  journalctl -u cloudflared -n 50 | grep trycloudflare"
echo ""
echo "Verify book-data locally:"
echo "  curl http://localhost:80/book-data/vnthuquan/index.json"
