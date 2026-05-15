#!/bin/sh

REPO_DIR=/repo
VERCEL_JSON="$REPO_DIR/apps/reader/vercel.json"
CI_YML="$REPO_DIR/.github/workflows/ci.yml"
MAX_RETRIES=3

log() { echo "[url-watcher] $*"; }

if [ -z "$GIT_USER_NAME" ] || [ -z "$GIT_USER_EMAIL" ]; then
    log "ERROR: GIT_USER_NAME and GIT_USER_EMAIL must be set"
    exit 1
fi

git config --global user.name "$GIT_USER_NAME"
git config --global user.email "$GIT_USER_EMAIL"

# Copy SSH keys to writable temp dir (mount is :ro — cannot write to /root/.ssh)
mkdir -p /tmp/ssh
SSH_KEY_FILE=""
for key in $(ls /root/.ssh/ | grep '^id_' | grep -v '\.pub$'); do
    cp "/root/.ssh/$key" "/tmp/ssh/$key"
    chmod 600 "/tmp/ssh/$key"
    SSH_KEY_FILE="/tmp/ssh/$key"
    break
done

if [ -z "$SSH_KEY_FILE" ]; then
    log "ERROR: No SSH key found in /root/.ssh"
    exit 1
fi

ssh-keyscan github.com > /tmp/ssh/known_hosts 2>/dev/null
export GIT_SSH_COMMAND="ssh -i $SSH_KEY_FILE -o UserKnownHostsFile=/tmp/ssh/known_hosts"

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
        new_url=$(docker logs "$container" 2>&1 | grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' | tail -1)
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

    current_url=$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' "$VERCEL_JSON" | head -1)

    if [ "$new_url" = "$current_url" ]; then
        log "URL unchanged ($new_url), no commit needed"
        return
    fi

    log "URL changed: $current_url -> $new_url"

    if ! git -C "$REPO_DIR" pull --ff-only; then
        log "ERROR: git pull failed, skipping"
        return
    fi

    sed -i "s|https://[a-z0-9-]*\.trycloudflare\.com|$new_url|g" \
        "$VERCEL_JSON" \
        "$CI_YML"

    git -C "$REPO_DIR" add "$VERCEL_JSON" "$CI_YML"
    git -C "$REPO_DIR" commit -m "chore(reader): update Cloudflare tunnel URL"
    git -C "$REPO_DIR" push || log "ERROR: git push failed (exit $?)"

    log "Done — pushed: $new_url"
}

if [ ! -f "$VERCEL_JSON" ]; then
    log "ERROR: $VERCEL_JSON not found — check REPO_PATH mount"
    exit 1
fi
if [ ! -f "$CI_YML" ]; then
    log "ERROR: $CI_YML not found — check REPO_PATH mount"
    exit 1
fi

log "Watching for cloudflared restarts..."

docker events \
    --filter 'label=com.docker.compose.service=cloudflared' \
    --filter 'event=start' \
    --since "$(( $(date +%s) - 300 ))" \
    --format '{{.Time}}' | while read -r _ts; do
    handle_event
done
