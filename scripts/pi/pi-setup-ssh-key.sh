#!/usr/bin/env bash
# One-time setup: copy your SSH public key to Pi so you don't need a password
# Usage: ./pi-setup-ssh-key.sh

PI_HOST="192.168.1.225"
PI_USER="pi"

# Generate key if it doesn't exist
if [ ! -f ~/.ssh/id_ed25519 ]; then
  echo "Generating SSH key..."
  ssh-keygen -t ed25519 -C "monkai-pi" -f ~/.ssh/id_ed25519 -N ""
fi

echo "Copying key to Pi (you'll need to enter the password once)..."
ssh-copy-id "$PI_USER@$PI_HOST"
echo "Done! Future SSH connections won't need a password."
