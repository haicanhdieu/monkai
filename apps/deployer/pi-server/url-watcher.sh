#!/bin/bash
# url-watcher — monitors cloudflared journal for tunnel URL changes,
# updates the CLOUDFLARE_TUNNEL_URL GitHub Actions variable, triggers workflow_dispatch.
# Adapted from apps/deployer/win-server/url-watcher/watch.sh (Docker → journalctl).

GITHUB_API="https://api.github.com/repos/$GITHUB_REPO/actions"
VAR_BODY="/tmp/.url_watcher_var_body.$$"  # PID-suffix avoids race between rapid restarts

log() { echo "[url-watcher] $*"; }

if [ -z "$GITHUB_TOKEN" ] || [ -z "$GITHUB_REPO" ]; then
    log "ERROR: GITHUB_TOKEN and GITHUB_REPO must be set (via /etc/url-watcher.env)"
    exit 1
fi

get_current_var() {
    local http
    http=$(curl -s -o "$VAR_BODY" -w "%{http_code}" \
      -H "Authorization: token $GITHUB_TOKEN" \
      "$GITHUB_API/variables/CLOUDFLARE_TUNNEL_URL")
    if [ -z "$http" ]; then
        log "WARNING: get_current_var curl transport error"
        return 1
    fi
    if [ "$http" -ge 200 ] && [ "$http" -lt 300 ]; then
        jq -r '.value // ""' "$VAR_BODY"
    elif [ "$http" = "404" ]; then
        echo ""
    elif [ "$http" = "403" ]; then
        log "ERROR: GitHub API 403 on GET — check GITHUB_TOKEN scope (needs actions:write, variables:write)"
        exit 1
    else
        log "WARNING: get_current_var failed (HTTP $http)"
        return 1
    fi
}

update_var() {
    local url="$1" http body
    body=$(jq -n --arg url "$url" '{"name":"CLOUDFLARE_TUNNEL_URL","value":$url}')
    http=$(curl -s -o /dev/null -w "%{http_code}" -X PATCH \
      -H "Authorization: token $GITHUB_TOKEN" \
      -H "Content-Type: application/json" \
      -d "$body" \
      "$GITHUB_API/variables/CLOUDFLARE_TUNNEL_URL")
    if [ -z "$http" ]; then
        log "ERROR: variable update curl transport error"
        return 1
    fi
    if [ "$http" = "403" ]; then
        log "ERROR: GitHub API 403 on PATCH — check GITHUB_TOKEN scope"
        exit 1
    fi
    if [ "$http" = "404" ]; then
        http=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
          -H "Authorization: token $GITHUB_TOKEN" \
          -H "Content-Type: application/json" \
          -d "$body" \
          "$GITHUB_API/variables")
        if [ -z "$http" ]; then
            log "ERROR: variable create curl transport error"
            return 1
        fi
        if [ "$http" = "403" ]; then
            log "ERROR: GitHub API 403 on POST — check GITHUB_TOKEN scope"
            exit 1
        fi
    fi
    if [ "$http" -ge 200 ] && [ "$http" -lt 300 ]; then
        return 0
    else
        log "ERROR: variable update failed (HTTP $http)"
        return 1
    fi
}

trigger_dispatch() {
    local http
    http=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
      -H "Authorization: token $GITHUB_TOKEN" \
      -H "Content-Type: application/json" \
      -d '{"ref":"main"}' \
      "$GITHUB_API/workflows/ci.yml/dispatches")
    if [ -z "$http" ]; then
        log "ERROR: dispatch curl transport error"
        return 1
    fi
    if [ "$http" = "403" ]; then
        log "ERROR: GitHub API 403 on dispatch — check GITHUB_TOKEN scope"
        exit 1
    fi
    if [ "$http" -ge 200 ] && [ "$http" -lt 300 ]; then
        return 0
    else
        log "ERROR: workflow dispatch failed (HTTP $http)"
        return 1
    fi
}

handle_url() {
    local new_url="$1" current_url

    # + (one-or-more) matches extraction regex; aligned with grep -o below
    if ! echo "$new_url" | grep -qE '^https://[a-z0-9-]+\.trycloudflare\.com$'; then
        log "WARNING: Malformed URL '$new_url', skipping"
        return
    fi

    if ! current_url=$(get_current_var); then
        log "WARNING: could not fetch current GitHub variable, skipping"
        return
    fi

    if [ "$new_url" = "$current_url" ]; then
        log "URL unchanged ($new_url), skipping"
        return
    fi

    log "URL changed: $current_url -> $new_url"

    if update_var "$new_url"; then
        log "GitHub var updated: $new_url"
        sleep 2
        if trigger_dispatch; then
            log "Dispatch triggered on main"
        fi
    fi
}

log "Watching cloudflared journal for tunnel URL (replaying last 5 min)..."

# Process substitution (not pipeline) so exit 1 inside handle_url exits the script,
# allowing systemd Restart=always to kick in on fatal errors (e.g. 403).
# --since "5 minutes ago": replays recent logs so a watcher restart doesn't miss
# an already-running tunnel URL. --output=cat strips journal metadata.
while read -r line; do
    url=$(echo "$line" | grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' | tail -1)
    if [ -n "$url" ]; then
        handle_url "$url"
    fi
done < <(journalctl -f -u cloudflared --since "5 minutes ago" --output=cat)
