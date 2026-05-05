#!/usr/bin/env bash
# Check status of all crawl processes on Pi
# Usage: ./pi-status.sh

PI_HOST="192.168.1.225"
PI_USER="pi"
CRAWLER_DIR="/home/pi/working/monkai/apps/crawler"

ssh "$PI_USER@$PI_HOST" bash <<'ENDSSH'
PID_FILE="/home/pi/working/monkai/apps/crawler/crawl.pid"

echo "=== vnthuquan crawl ==="
if [ -f "$PID_FILE" ]; then
  PID=$(cat "$PID_FILE")
  if kill -0 "$PID" 2>/dev/null; then
    echo "Running (PID $PID)"
  else
    echo "Stopped (last PID was $PID)"
  fi
else
  echo "No crawl started yet"
fi

echo ""
echo "=== Last 10 log lines ==="
LOG="/home/pi/working/monkai/apps/crawler/crawl-vnthuquan.log"
[ -f "$LOG" ] && tail -10 "$LOG" || echo "(no log file)"
ENDSSH
