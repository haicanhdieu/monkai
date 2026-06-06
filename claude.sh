#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

export STITCH_PROJECT_ID=7608307594726401832
exec devbox run -- claude --permission-mode bypassPermissions "$@"
