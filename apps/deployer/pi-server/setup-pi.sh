#!/usr/bin/env bash
# Pi Book Data Server setup script
# Run on Raspberry Pi: bash setup-pi.sh
# Prerequisites: SSH into Pi, repo cloned at ~/working/monkai
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PI_USER="$(whoami)"
PI_HOME="$HOME"

if [[ ! -f "$SCRIPT_DIR/Caddyfile" ]]; then
    echo "ERROR: Caddyfile not found at $SCRIPT_DIR/Caddyfile"
    echo "Run this script from within the monkai repo on the Pi."
    exit 1
fi

# ── Prompt for ngrok credentials ────────────────────────────────────────────
echo ""
echo "You need a free ngrok account. If you haven't already:"
echo "  1. Sign up at https://ngrok.com (no credit card)"
echo "  2. Copy your authtoken from https://dashboard.ngrok.com/get-started/your-authtoken"
echo "  3. Claim a free static domain at https://dashboard.ngrok.com/domains → New Domain"
echo ""
read -rp "Enter your ngrok authtoken: " NGROK_AUTHTOKEN
read -rp "Enter your static ngrok domain (e.g. monkai-book-data.ngrok-free.app): " NGROK_DOMAIN

if [[ -z "$NGROK_AUTHTOKEN" || -z "$NGROK_DOMAIN" ]]; then
    echo "ERROR: authtoken and domain are required."
    exit 1
fi

echo ""
echo "=== Step 1: Install Caddy ==="
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

echo "=== Step 2: Deploy Caddyfile ==="
sudo cp "$SCRIPT_DIR/Caddyfile" /etc/caddy/Caddyfile
# Substitute the <PI-HOME> placeholder with the actual home directory
sudo sed -i "s|<PI-HOME>|${PI_HOME}|g" /etc/caddy/Caddyfile
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
sudo chmod -R o+rX "$PI_HOME/working/monkai/apps/crawler/data/book-data"
echo "Permissions set"

echo "=== Step 4: Install ngrok ==="
if command -v ngrok &>/dev/null; then
    echo "ngrok already installed: $(ngrok version)"
else
    # Security note: verify the ngrok GPG key fingerprint at https://ngrok.com/docs/agent/install/linux/apt/
    # before running this script on a production machine.
    curl -sSL https://ngrok-agent.s3.amazonaws.com/ngrok.asc \
        | sudo tee /etc/apt/trusted.gpg.d/ngrok.asc >/dev/null
    echo "deb https://ngrok-agent.s3.amazonaws.com buster main" \
        | sudo tee /etc/apt/sources.list.d/ngrok.list
    sudo apt update && sudo apt install -y ngrok
    echo "ngrok installed: $(ngrok version)"
fi

# Assert ngrok v3 (ngrok.yml uses v3 config syntax)
ngrok_ver="$(ngrok version 2>&1 | head -1)"
if ! echo "$ngrok_ver" | grep -q "^ngrok version 3"; then
    echo "WARNING: Expected ngrok v3 but got: $ngrok_ver"
    echo "The ngrok.yml config uses v3 syntax — verify compatibility before continuing."
fi

echo "=== Step 5: Configure ngrok ==="
NGROK_CONFIG_DIR="$PI_HOME/.config/ngrok"
NGROK_CONFIG="$NGROK_CONFIG_DIR/ngrok.yml"

mkdir -p "$NGROK_CONFIG_DIR"

if [[ -f "$NGROK_CONFIG" ]]; then
    cp "$NGROK_CONFIG" "${NGROK_CONFIG}.bak"
    echo "Backed up existing ngrok config to ngrok.yml.bak"
fi

cat > "$NGROK_CONFIG" <<EOF
version: "3"
agent:
  authtoken: ${NGROK_AUTHTOKEN}

tunnels:
  book-data:
    proto: http
    addr: 80
    domain: ${NGROK_DOMAIN}
EOF

chmod 600 "$NGROK_CONFIG"
echo "ngrok config written to $NGROK_CONFIG (mode 600)"

echo "=== Step 6: Install ngrok systemd service ==="
sudo tee /etc/systemd/system/ngrok.service > /dev/null <<EOF
[Unit]
Description=ngrok book-data tunnel
After=network-online.target caddy.service
Wants=network-online.target

[Service]
ExecStart=/usr/local/bin/ngrok start book-data --config ${PI_HOME}/.config/ngrok/ngrok.yml
Restart=on-failure
RestartSec=10
User=${PI_USER}
StandardOutput=journal
StandardError=journal
NoNewPrivileges=yes

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now ngrok
sudo systemctl status ngrok --no-pager

echo ""
echo "=== Setup complete ==="
echo ""
echo "Tunnel URL: https://${NGROK_DOMAIN}"
echo ""
echo "Verify from an external network (e.g. phone hotspot):"
echo "  curl -I https://${NGROK_DOMAIN}/book-data/vnthuquan/index.json"
echo ""
echo "Note: Router port forwarding and no-ip DDNS client are no longer needed."
