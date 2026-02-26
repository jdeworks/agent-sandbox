#!/usr/bin/env bash
set -e

########################################
# Profile resolution
########################################
if [ -z "$SANDBOX_PROFILE_DIR" ]; then
    echo "[sandbox] Error: No profile configured."
    echo "  Run 'prepare' first to create a sandbox environment."
    echo "  See: agent-worker/scripts/unix/prepare.sh"
    exit 1
fi

if [ ! -d "$SANDBOX_PROFILE_DIR" ]; then
    echo "[sandbox] Error: Profile directory not found: $SANDBOX_PROFILE_DIR"
    exit 1
fi

PROFILE_NAME="${SANDBOX_PROFILE_NAME:-$(basename "$SANDBOX_PROFILE_DIR")}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
PROJECTS_DIR="$REPO_DIR/projects"
TEMPLATES_DIR="$REPO_DIR/templates"
BASE_IMAGE="agent-sandbox-${PROFILE_NAME}:latest"

########################################
# Reusable functions
########################################
check_dockerfile_extension() {
    local ext_file="$PROJECT_DIR/sandbox_data/Dockerfile.extension"
    [ -f "$ext_file" ] || return 0

    echo "[sandbox] Dockerfile.extension found."
    read -r -p "Bake into project Dockerfile and delete Dockerfile.extension? [y/N] " response
    case "$response" in
        [yY]|[yY][eE][sS])
            while IFS= read -r line || [ -n "$line" ]; do
                local stripped
                stripped="$(echo "$line" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
                [ -z "$stripped" ] && continue
                echo "RUN $line" >> "$PROJECT_DIR/Dockerfile"
            done < "$ext_file"
            rm -f "$ext_file"
            echo "[sandbox] Changes applied. Container will be rebuilt on next run."
            ;;
        *)
            echo "[sandbox] Skipped. Dockerfile.extension left in place."
            ;;
    esac
}

post_session_check() {
    local ext_file="$PROJECT_DIR/sandbox_data/Dockerfile.extension"
    if [ -f "$ext_file" ]; then
        echo ""
        echo "[sandbox] Dockerfile.extension detected -- the agent requested system changes."
        echo "[sandbox] The container needs to be rebuilt to apply them."
        read -r -p "Bake into project Dockerfile now? [Y/n] " response
        response="${response:-Y}"
        case "$response" in
            [yY]|[yY][eE][sS])
                while IFS= read -r line || [ -n "$line" ]; do
                    local stripped
                    stripped="$(echo "$line" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
                    [ -z "$stripped" ] && continue
                    echo "RUN $line" >> "$PROJECT_DIR/Dockerfile"
                done < "$ext_file"
                rm -f "$ext_file"
                echo "[sandbox] Changes applied to project Dockerfile."
                echo "[sandbox] Stopping container so it rebuilds on next run..."
                docker compose -f "$PROJECT_DIR/docker-compose.yml" --project-directory "$PROJECT_DIR" down 2>/dev/null || \
                    docker stop "$CONTAINER_NAME" 2>/dev/null || true
                ;;
            *)
                echo "[sandbox] Skipped. Run the sandbox again to be prompted before startup."
                ;;
        esac
    fi
}

usage() {
    echo "Usage: sandbox-$PROFILE_NAME [folder_path]"
    echo ""
    echo "  <folder_path>  Path to the workspace folder (use '.' for current directory)"
    echo "                 Omit to pick from recent projects."
    echo ""
    echo "Examples:"
    echo "  sandbox-$PROFILE_NAME ."
    echo "  sandbox-$PROFILE_NAME /home/user/my-project"
    echo "  sandbox-$PROFILE_NAME ../other-project"
    exit 1
}

########################################
# Resolve workspace path
########################################
if [ -n "$1" ]; then
    WORKSPACE_PATH="$(cd "$1" && pwd)"
else
    # Scan projects dir for recent projects matching this profile
    declare -a _rp_names=() _rp_paths=() _rp_times=()

    if [ -d "$PROJECTS_DIR" ]; then
        while IFS='|' read -r _ts _name _path; do
            _rp_names+=("$_name")
            _rp_paths+=("$_path")
            _rp_times+=("$_ts")
        done < <(
            for _cfg in "$PROJECTS_DIR"/*/config.env; do
                [ -f "$_cfg" ] || continue
                _p=$(grep '^PROFILE=' "$_cfg" | cut -d= -f2-)
                [ "$_p" = "$PROFILE_NAME" ] || continue
                _n=$(grep '^PROJECT_NAME=' "$_cfg" | cut -d= -f2-)
                _w=$(grep '^WORKSPACE_PATH=' "$_cfg" | cut -d= -f2-)
                _t=$(grep '^LAST_STARTED=' "$_cfg" | cut -d= -f2-)
                echo "${_t}|${_n}|${_w}"
            done | sort -r
        )
    fi

    if [ ${#_rp_names[@]} -eq 0 ]; then
        usage
    fi

    echo "[sandbox] Recent projects (profile: $PROFILE_NAME):"
    echo ""
    for _i in "${!_rp_names[@]}"; do
        printf "  %d) %-25s %s\n" "$((_i + 1))" "${_rp_names[$_i]}" "${_rp_paths[$_i]}"
        printf "     Last used: %s\n" "${_rp_times[$_i]}"
    done
    echo ""
    read -rp "Select [1-${#_rp_names[@]}], enter a path, or 'q' to quit: " _choice

    case "$_choice" in
        q|Q) exit 0 ;;
        [0-9]*)
            _idx=$((_choice - 1))
            if [ "$_idx" -ge 0 ] && [ "$_idx" -lt "${#_rp_names[@]}" ]; then
                WORKSPACE_PATH="${_rp_paths[$_idx]}"
            else
                echo "[sandbox] Invalid selection."
                exit 1
            fi
            ;;
        *)
            if [ -d "$_choice" ]; then
                WORKSPACE_PATH="$(cd "$_choice" && pwd)"
            else
                echo "[sandbox] Error: '$_choice' is not a valid directory."
                exit 1
            fi
            ;;
    esac
fi

PROJECT_NAME="$(basename "$WORKSPACE_PATH")"
PROJECT_DIR="$PROJECTS_DIR/$PROJECT_NAME"

CONTAINER_NAME="sandbox-$PROJECT_NAME"

echo "[sandbox] Profile:    $PROFILE_NAME"
echo "[sandbox] Workspace:  $WORKSPACE_PATH"
echo "[sandbox] Project:    $PROJECT_NAME"

########################################
# Check for existing running container
########################################
if docker ps --format '{{.Names}}' 2>/dev/null | grep -qx "$CONTAINER_NAME"; then
    echo ""
    echo "[sandbox] Container '$CONTAINER_NAME' is already running."
    echo "  1) Reattach  -- open a new OpenCode session in the existing container"
    echo "  2) Rebuild   -- stop, rebuild, and start fresh"
    echo ""
    read -rp "Choice [1]: " reuse_choice
    reuse_choice="${reuse_choice:-1}"

    if [ "$reuse_choice" = "1" ]; then
        echo "[sandbox] Attaching to $CONTAINER_NAME..."
        docker exec -it "$CONTAINER_NAME" opencode

        post_session_check
        exit 0
    else
        echo "[sandbox] Stopping existing container..."
        docker compose -f "$PROJECT_DIR/docker-compose.yml" --project-directory "$PROJECT_DIR" down 2>/dev/null || \
            docker stop "$CONTAINER_NAME" 2>/dev/null || true
    fi
fi

########################################
# Build base image (uses cache if nothing changed)
########################################
echo "[sandbox] Building base image $BASE_IMAGE (cached if unchanged)..."
docker build -f "$SANDBOX_PROFILE_DIR/Dockerfile.base" -t "$BASE_IMAGE" "$SANDBOX_PROFILE_DIR"

########################################
# Create project dir if it doesn't exist
########################################
if [ ! -d "$PROJECT_DIR" ]; then
    echo "[sandbox] New project. Setting up $PROJECT_DIR..."
    mkdir -p "$PROJECT_DIR"

    sed \
        -e "s|{{PROJECT_NAME}}|${PROJECT_NAME}|g" \
        -e "s|{{WORKSPACE_PATH}}|${WORKSPACE_PATH}|g" \
        "$SANDBOX_PROFILE_DIR/docker-compose.yml.tpl" > "$PROJECT_DIR/docker-compose.yml"

    echo "FROM $BASE_IMAGE" > "$PROJECT_DIR/Dockerfile"

    mkdir -p "$PROJECT_DIR/sandbox_data"
    touch "$PROJECT_DIR/sandbox_data/changes.txt"
    mkdir -p "$PROJECT_DIR/opencode_data"
    cp "$TEMPLATES_DIR/opencode.json" "$PROJECT_DIR/opencode_data/opencode.json"
    cp "$TEMPLATES_DIR/oh-my-opencode.json" "$PROJECT_DIR/opencode_data/oh-my-opencode.json"
    cp "$SANDBOX_PROFILE_DIR/AGENTS.md" "$PROJECT_DIR/opencode_data/AGENTS.md"
    mkdir -p "$PROJECT_DIR/opencode_sessions"
    mkdir -p "$PROJECT_DIR/logs"

    # Copy host OpenCode auth so Zen credentials are available inside the container
    HOST_AUTH="$HOME/.local/share/opencode/auth.json"
    if [ -f "$HOST_AUTH" ] && [ "$(stat -c%s "$HOST_AUTH" 2>/dev/null || echo 0)" -gt 2 ]; then
        cp "$HOST_AUTH" "$PROJECT_DIR/opencode_sessions/auth.json"
        echo "[sandbox] Copied host OpenCode auth into project."
    fi

    {
        echo "WORKSPACE_PATH=$WORKSPACE_PATH"
        echo "PROJECT_NAME=$PROJECT_NAME"
        echo "PROFILE=$PROFILE_NAME"
        echo "CREATED=$(date -Iseconds)"
        echo "LAST_STARTED=$(date -Iseconds)"
        # Append version pins from profile
        if [ -f "$SANDBOX_PROFILE_DIR/versions.env" ]; then
            grep -v '^#' "$SANDBOX_PROFILE_DIR/versions.env" | grep -v '^$'
        fi
    } > "$PROJECT_DIR/config.env"

    echo "[sandbox] Project scaffolded."
else
    echo "[sandbox] Existing project found."

    # Regenerate compose, AGENTS.md, and config templates from current profile
    # so port/volume/model changes from re-prepare are picked up automatically.
    sed \
        -e "s|{{PROJECT_NAME}}|${PROJECT_NAME}|g" \
        -e "s|{{WORKSPACE_PATH}}|${WORKSPACE_PATH}|g" \
        "$SANDBOX_PROFILE_DIR/docker-compose.yml.tpl" > "$PROJECT_DIR/docker-compose.yml"
    cp "$SANDBOX_PROFILE_DIR/AGENTS.md" "$PROJECT_DIR/opencode_data/AGENTS.md"
    cp "$TEMPLATES_DIR/opencode.json" "$PROJECT_DIR/opencode_data/opencode.json"
    cp "$TEMPLATES_DIR/oh-my-opencode.json" "$PROJECT_DIR/opencode_data/oh-my-opencode.json"
fi

# Update LAST_STARTED on every run
if [ -f "$PROJECT_DIR/config.env" ]; then
    if grep -q '^LAST_STARTED=' "$PROJECT_DIR/config.env"; then
        sed -i "s|^LAST_STARTED=.*|LAST_STARTED=$(date -Iseconds)|" "$PROJECT_DIR/config.env"
    else
        echo "LAST_STARTED=$(date -Iseconds)" >> "$PROJECT_DIR/config.env"
    fi
fi

########################################
# Ensure bind mount targets exist
########################################
mkdir -p "$PROJECT_DIR/opencode_data"
mkdir -p "$PROJECT_DIR/opencode_sessions"
mkdir -p "$PROJECT_DIR/logs"
mkdir -p "$PROJECT_DIR/sandbox_data"

########################################
# Dockerfile.extension: offer to merge before starting
########################################
check_dockerfile_extension

########################################
# Start container
########################################
echo "[sandbox] Starting container $CONTAINER_NAME..."
docker compose -f "$PROJECT_DIR/docker-compose.yml" --project-directory "$PROJECT_DIR" up -d --build

echo "[sandbox] Attaching to $CONTAINER_NAME..."
docker exec -it "$CONTAINER_NAME" opencode

########################################
# Post-session: check if container needs rebuilding
########################################
post_session_check
