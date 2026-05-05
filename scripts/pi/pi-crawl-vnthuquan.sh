#!/usr/bin/env bash
# Start vnthuquan crawl on Pi as a background nohup process
# Usage: ./pi-crawl-vnthuquan.sh [start-page] [end-page] [concurrency]
#   start-page:  default 1
#   end-page:    default 1 (first page only); use 0 for all pages
#   concurrency: default 5

set -euo pipefail

START_PAGE="${1:-1}"
END_PAGE="${2:-1}"
CONCURRENCY="${3:-5}"
PI_HOST="192.168.1.225"
PI_USER="pi"
MONKAI_DIR="/home/pi/working/monkai"
CRAWLER_DIR="${MONKAI_DIR}/apps/crawler"
PYTHON="${MONKAI_DIR}/.venv/bin/python"
PID_FILE="${CRAWLER_DIR}/crawl.pid"
LOG_FILE="${CRAWLER_DIR}/crawl-vnthuquan.log"

ssh "$PI_USER@$PI_HOST" bash <<ENDSSH
  if [ -f "${PID_FILE}" ]; then
    PID=\$(cat "${PID_FILE}")
    if kill -0 "\$PID" 2>/dev/null; then
      echo "Crawl already running (PID \$PID). Check logs:"
      echo "  ./scripts/pi/pi-log-vnthuquan.sh"
      exit 1
    fi
  fi

  cd "${CRAWLER_DIR}"
  nohup "${PYTHON}" vnthuquan_crawler.py crawl \
    --start-page ${START_PAGE} \
    --end-page ${END_PAGE} \
    --concurrency ${CONCURRENCY} \
    > "${LOG_FILE}" 2>&1 &
  echo \$! > "${PID_FILE}"
  echo "Crawl started (PID \$!): pages ${START_PAGE}-${END_PAGE}, concurrency ${CONCURRENCY}"
  echo "Logs: ./scripts/pi/pi-log-vnthuquan.sh"
ENDSSH
