#!/usr/bin/env bash
# One-time migration: rsync book-data from Windows to Pi USB drive.
# Run from repo root on Mac.
# Requires: sshpass (brew install sshpass)
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
WIN_YAML="$REPO_ROOT/.window-server.yaml"
PI_YAML="$REPO_ROOT/.pi-server.yaml"
TMP_DIR="/tmp/book-data-sync"

die() { echo "ERROR: $*" >&2; exit 1; }

yaml_field() {
    local file="$1" field="$2"
    grep -E "^${field}:" "$file" | sed "s/^${field}:[[:space:]]*//" | tr -d "'\""
}

[[ -f "$WIN_YAML" ]] || die ".window-server.yaml not found at $WIN_YAML"
[[ -f "$PI_YAML" ]]  || die ".pi-server.yaml not found at $PI_YAML"
command -v sshpass &>/dev/null || die "sshpass not installed (brew install sshpass)"
command -v rsync   &>/dev/null || die "rsync not installed"
command -v python3 &>/dev/null || die "python3 not installed"

WIN_HOST=$(yaml_field "$WIN_YAML" host)
WIN_USER=$(yaml_field "$WIN_YAML" user)
WIN_PORT=$(yaml_field "$WIN_YAML" port)
WIN_PASS=$(yaml_field "$WIN_YAML" password)
WIN_CODEBASE=$(yaml_field "$WIN_YAML" codebase_root)

PI_HOST=$(yaml_field "$PI_YAML" host)
PI_USER=$(yaml_field "$PI_YAML" user)
PI_PORT=$(yaml_field "$PI_YAML" port)
PI_PASS=$(yaml_field "$PI_YAML" password)

# Convert Windows path D:\ntm\monkai → /d/ntm/monkai (OpenSSH POSIX form).
# Uses python3 instead of sed \L to stay portable across macOS (BSD sed) and Linux (GNU sed).
WIN_POSIX_ROOT=$(python3 -c "
import sys
p = sys.argv[1]
print('/' + p[0].lower() + '/' + p[3:].replace('\\\\', '/'))
" "$WIN_CODEBASE")
WIN_BOOK_DATA="$WIN_POSIX_ROOT/apps/crawler/data/book-data/"
PI_BOOK_DATA="/mnt/data/book-data/"

# Clean temp dir before each run to avoid stale files corrupting --delete on hop 2
rm -rf "$TMP_DIR"
mkdir -p "$TMP_DIR"

echo "=== Sync book-data: Windows → Mac temp ==="
echo "  Source: $WIN_USER@$WIN_HOST:$WIN_BOOK_DATA"
echo "  Dest:   $TMP_DIR/"
# Use SSHPASS env var so credentials don't appear in the process argument list
SSHPASS="$WIN_PASS" sshpass -e rsync -avz --delete \
    -e "ssh -p ${WIN_PORT:-22} -o StrictHostKeyChecking=no -o ConnectTimeout=15" \
    "$WIN_USER@$WIN_HOST:$WIN_BOOK_DATA" \
    "$TMP_DIR/" \
    || die "rsync Windows → Mac failed. Do NOT proceed to Windows shutdown."

# Guard: abort if Windows source was empty — --delete on hop 2 would wipe Pi data
file_count=$(find "$TMP_DIR" -type f | wc -l | tr -d ' ')
if [[ "$file_count" -eq 0 ]]; then
    die "Windows source appears empty ($file_count files synced). Aborting to protect Pi data."
fi
echo "  $file_count files synced from Windows."

echo ""
echo "=== Sync book-data: Mac temp → Pi USB ==="
echo "  Source: $TMP_DIR/"
echo "  Dest:   $PI_USER@$PI_HOST:$PI_BOOK_DATA"
SSHPASS="$PI_PASS" sshpass -e rsync -avz --delete \
    -e "ssh -p ${PI_PORT:-22} -o StrictHostKeyChecking=no -o ConnectTimeout=15" \
    "$TMP_DIR/" \
    "$PI_USER@$PI_HOST:$PI_BOOK_DATA" \
    || die "rsync Mac → Pi failed. Do NOT proceed to Windows shutdown."

echo ""
echo "=== Sync complete ==="
echo "Verify on Pi: ls $PI_BOOK_DATA"
echo ""
echo "Next: SSH into Windows and run:"
echo "  cd d:\\ntm\\monkai\\apps\\deployer\\win-server && docker compose down"
