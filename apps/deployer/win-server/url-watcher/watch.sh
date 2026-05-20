#!/bin/sh

MAX_RETRIES=3
GITHUB_API="https://api.github.com/repos/$GITHUB_REPO/actions"
VAR_BODY=/tmp/.url_watcher_var_body

log() { echo "[url-watcher] $*"; }

if [ -z "$GITHUB_TOKEN" ] || [ -z "$GITHUB_REPO" ]; then
    log "ERROR: GITHUB_TOKEN and GITHUB_REPO must be set"
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
    else
        log "WARNING: get_current_var failed (HTTP $http)"
        return 1
    fi
}

update_var() {
    local url="$1" http
    http=$(curl -s -o /dev/null -w "%{http_code}" -X PATCH \
      -H "Authorization: token $GITHUB_TOKEN" \
      -H "Content-Type: application/json" \
      -d "{\"name\":\"CLOUDFLARE_TUNNEL_URL\",\"value\":\"$url\"}" \
      "$GITHUB_API/variables/CLOUDFLARE_TUNNEL_URL")
    if [ -z "$http" ]; then
        log "ERROR: variable update curl transport error"
        return 1
    fi
    if [ "$http" = "404" ]; then
        http=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
          -H "Authorization: token $GITHUB_TOKEN" \
          -H "Content-Type: application/json" \
          -d "{\"name\":\"CLOUDFLARE_TUNNEL_URL\",\"value\":\"$url\"}" \
          "$GITHUB_API/variables")
        if [ -z "$http" ]; then
            log "ERROR: variable create curl transport error"
            return 1
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
    if [ "$http" -ge 200 ] && [ "$http" -lt 300 ]; then
        return 0
    else
        log "ERROR: workflow dispatch failed (HTTP $http)"
        return 1
    fi
}

git config --global user.name "$GIT_USER_NAME"
git config --global user.email "$GIT_USER_EMAIL"
git config --global --add safe.directory "$REPO_DIR"

if [ ! -d "$REPO_DIR/.git" ]; then
    log "Cloning repo..."
    git clone "$REPO_URL" "$REPO_DIR" || { log "ERROR: git clone failed"; exit 1; }
else
    git -C "$REPO_DIR" fetch origin main || { log "ERROR: initial git fetch failed"; exit 1; }
    git -C "$REPO_DIR" reset --hard origin/main
fi

handle_event() {
    log "cloudflared start event — waiting 20s for tunnel negotiation..."
    sleep 20

    local container new_url attempt current_url
    container=$(docker ps --filter 'label=com.docker.compose.service=cloudflared' -q | head -1)
    if [ -z "$container" ]; then
        log "WARNING: cloudflared container not found, skipping"
        return
    fi

    attempt=0
    new_url=""
    while [ "$attempt" -le "$MAX_RETRIES" ]; do
        new_url=$(docker logs --tail 100 "$container" 2>&1 | grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' | tail -1)
        [ -n "$new_url" ] && break
        attempt=$(( attempt + 1 ))
        if [ "$attempt" -le "$MAX_RETRIES" ]; then
            log "URL not yet visible (attempt $attempt/$MAX_RETRIES), retrying in 10s..."
            sleep 10
        fi
    done

    if [ -z "$new_url" ]; then
        log "WARNING: URL not found after $(( MAX_RETRIES + 1 )) attempts, skipping"
        return
    fi

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

log "Watching for cloudflared restarts..."

docker events \
    --filter 'label=com.docker.compose.service=cloudflared' \
    --filter 'event=start' \
    --since "$(( $(date +%s) - 300 ))" \
    --format '{{.Time}}' | while read -r _ts; do
    handle_event
done
