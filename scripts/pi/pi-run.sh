#!/usr/bin/env bash
# Run a command on Pi in a named tmux session (detached, non-blocking)
# Usage: ./pi-run.sh <session-name> <command>
# Example: ./pi-run.sh crawl "uv run python vnthuquan_crawler.py crawl --end-page 1"

set -euo pipefail

SESSION="${1:?Usage: pi-run.sh <session-name> <command>}"
CMD="${2:?Usage: pi-run.sh <session-name> <command>}"
PI_HOST="192.168.1.225"
PI_USER="pi"
MONKAI_DIR="/home/pi/working/monkai"

ssh "$PI_USER@$PI_HOST" bash <<EOF
  if tmux has-session -t '$SESSION' 2>/dev/null; then
    echo "Session '$SESSION' already exists. Attach with: ./pi-ssh.sh $SESSION"
    exit 1
  fi
  tmux new-session -d -s '$SESSION' -c '$MONKAI_DIR/apps/crawler' '$CMD'
  echo "Started session '$SESSION'. Attach with: ./scripts/pi/pi-ssh.sh $SESSION"
EOF
