#!/usr/bin/env bash
# Tail the vnthuquan crawl log on Pi
# Usage: ./pi-log-vnthuquan.sh [-f]  (-f to follow live)

PI_HOST="192.168.1.225"
PI_USER="pi"
LOG_FILE="/home/pi/working/monkai/apps/crawler/crawl-vnthuquan.log"
PID_FILE="/home/pi/working/monkai/apps/crawler/crawl.pid"

if [ "${1:-}" = "-f" ]; then
  ssh "$PI_USER@$PI_HOST" "tail -f '$LOG_FILE'"
else
  ssh "$PI_USER@$PI_HOST" bash <<ENDSSH
    if [ -f "${PID_FILE}" ]; then
      PID=\$(cat "${PID_FILE}")
      if kill -0 "\$PID" 2>/dev/null; then
        echo "=== Crawl running (PID \$PID) ==="
      else
        echo "=== Crawl finished or stopped ==="
      fi
    fi
    tail -50 "${LOG_FILE}"
ENDSSH
fi
