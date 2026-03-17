#!/usr/bin/env bash
# docker.sh — Docker helpers for agent-sandbox
# Extracted from: sandbox.sh
# Source this file; do not execute directly.

docker_is_port_in_use() {
    local port="$1"
    ss -tlnH 2>/dev/null | grep -q ":${port} " && return 0
    return 1
}

docker_find_free_port() {
    local port="$1"
    local max=$((port + 100))
    while docker_is_port_in_use "$port" && [ "$port" -lt "$max" ]; do
        port=$((port + 1))
    done
    echo "$port"
}

docker_remap_compose_ports() {
    local compose_file="$1"
    local tmpfile
    tmpfile=$(mktemp)

    while IFS= read -r line; do
        if [[ "$line" =~ ^([[:space:]]*-[[:space:]]*\")([0-9]+):([0-9]+)(\".*) ]]; then
            local prefix="${BASH_REMATCH[1]}"
            local host_port="${BASH_REMATCH[2]}"
            local container_port="${BASH_REMATCH[3]}"
            local suffix="${BASH_REMATCH[4]}"
            local free_port
            free_port=$(docker_find_free_port "$host_port")
            if [ "$free_port" != "$host_port" ]; then
                echo "${prefix}${free_port}:${container_port}${suffix}" >> "$tmpfile"
                echo "[sandbox] Port $host_port in use -> remapped to $free_port:$container_port"
            else
                echo "$line" >> "$tmpfile"
            fi
        else
            echo "$line" >> "$tmpfile"
        fi
    done < "$compose_file"

    mv "$tmpfile" "$compose_file"
}

docker_wait_for_ready() {
    local container="$1"
    local timeout="${2:-120}"
    local elapsed=0
    local last_reported=0

    if [ -n "${SANDBOX_SKIP_READY:-}" ]; then
        echo "[sandbox] Skipping ready wait (SANDBOX_SKIP_READY is set)."
        return 0
    fi

    echo -n "[sandbox] Waiting for container to be ready"
    sleep 3
    elapsed=3
    while [ "$elapsed" -lt "$timeout" ]; do
        # Check logs first (avoids flaky exec on WSL2)
        if docker logs --tail 50 "$container" 2>/dev/null | grep -q '\[sandbox\] Ready\.'; then
            echo " done."
            return 0
        fi
        # Fallback: check ready file
        local retries=3
        while [ "$retries" -gt 0 ]; do
            if docker exec "$container" test -f /tmp/.sandbox-ready 2>/dev/null; then
                echo " done."
                return 0
            fi
            retries=$((retries - 1))
            [ "$retries" -gt 0 ] && sleep 1
        done

        if [ "$(docker inspect --format '{{.State.Running}}' "$container" 2>/dev/null)" != "true" ]; then
            echo " failed."
            echo "[sandbox] Container stopped unexpectedly. Check logs with:"
            echo "  docker logs $container"
            return 1
        fi
        echo -n "."
        sleep 2
        elapsed=$((elapsed + 2))
        if [ "$elapsed" -ge "$((last_reported + 20))" ]; then
            echo -n " (${elapsed}s)"
            last_reported=$elapsed
        fi
    done

    echo " timeout."
    echo "[sandbox] Container did not become ready within ${timeout}s."
    return 0
}

docker_build_image() {
    local dockerfile="$1"
    local tag="$2"
    local context="$3"
    echo "[sandbox] Building image $tag..."
    docker build -f "$dockerfile" -t "$tag" "$context"
}

docker_write_runtime_env() {
    local env_file="$1"
    > "$env_file"
    local vars=(ANTHROPIC_API_KEY OPENAI_API_KEY OPENROUTER_API_KEY OPENCODE_API_KEY GEMINI_API_KEY CURSOR_API_KEY GITHUB_COPILOT_API_KEY)
    for var in "${vars[@]}"; do
        if [ -n "${!var:-}" ]; then
            echo "${var}=${!var}" >> "$env_file"
        fi
    done
}

docker_sync_host_auth() {
    local sessions_dir="$1"
    local host_auth="$HOME/.local/share/opencode/auth.json"
    local dest="$sessions_dir/auth.json"

    [ -f "$host_auth" ] || return 0
    [ "$(stat -c%s "$host_auth" 2>/dev/null || echo 0)" -gt 2 ] || return 0

    if [ ! -f "$dest" ] || [ "$host_auth" -nt "$dest" ]; then
        cp "$host_auth" "$dest"
        echo "[sandbox] Synced host OpenCode auth."
    fi
}
