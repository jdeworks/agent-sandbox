#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
SANDBOX_DIR="$REPO_DIR/sandbox"
SANDBOX_HOME="${SANDBOX_HOME:-$HOME/.agent-sandbox}"
TEMPLATES_DIR="$REPO_DIR/templates"
AGENTS_JSON="$SANDBOX_DIR/agents.json"

# Source shared libraries
source "$SCRIPT_DIR/lib/prereqs.sh"
source "$SCRIPT_DIR/lib/config.sh"
source "$SCRIPT_DIR/lib/ui.sh"
source "$SCRIPT_DIR/lib/docker.sh"

########################################
# Helper: determine agent command
########################################
get_agent_command_v2() {
    local profile_dir="$1"
    local profile_json="$profile_dir/profile.json"

    if [ -f "$profile_json" ]; then
        local agents
        agents=$(jq -r '.agents // [] | .[]' "$profile_json" 2>/dev/null)
        local agent_count
        agent_count=$(echo "$agents" | grep -c . 2>/dev/null || echo 0)

        if [ "$agent_count" -eq 1 ]; then
            local agent="$agents"
            jq -r ".\"$agent\".command // \"opencode\"" "$AGENTS_JSON" 2>/dev/null
            return
        fi
    fi

    # Fallback to v1 logic
    local config_file=""
    local proj_dir="${SANDBOX_HOME}/projects/${PROJECT_NAME:-unknown}"
    if [ -f "$proj_dir/sandbox_data/agent-config.json" ]; then
        config_file="$proj_dir/sandbox_data/agent-config.json"
    fi

    local agent="opencode"
    if [ -n "$config_file" ]; then
        agent=$(jq -r '.defaultAgent // "opencode"' "$config_file" 2>/dev/null || echo "opencode")
    fi

    case "$agent" in
        claude) echo "claude" ;;
        cursor) echo "agent" ;;
        copilot) echo "gh copilot agent" ;;
        opencode|*) echo "opencode" ;;
    esac
}

########################################
# Subcommands
########################################
case "${1:-}" in
    --profiles)
        exec "$SCRIPT_DIR/sandbox-setup.sh" --list
        ;;
    --stats)
        exec "$SCRIPT_DIR/sandbox-stats.sh"
        ;;
    --stop)
        PROJECT_ROOT=$(config_find_project_root)
        PROJECT_NAME=$(config_derive_project_name "$PROJECT_ROOT" "$SANDBOX_HOME")
        PROJECT_DIR="$SANDBOX_HOME/projects/$PROJECT_NAME"
        if [ -f "$PROJECT_DIR/docker-compose.yml" ]; then
            docker compose -f "$PROJECT_DIR/docker-compose.yml" --project-directory "$PROJECT_DIR" down 2>/dev/null || true
            echo "[sandbox-me] Stopped."
        else
            echo "[sandbox-me] No project found for this directory."
        fi
        exit 0
        ;;
    --status)
        PROJECT_ROOT=$(config_find_project_root)
        PROJECT_NAME=$(config_derive_project_name "$PROJECT_ROOT" "$SANDBOX_HOME")
        PROJECT_DIR="$SANDBOX_HOME/projects/$PROJECT_NAME"
        CONTAINER_NAME="sandbox-$PROJECT_NAME"
        echo "Project:   $PROJECT_NAME"
        echo "Root:      $PROJECT_ROOT"
        echo "Data:      $PROJECT_DIR"
        if [ -f "$PROJECT_ROOT/.sandbox" ]; then
            profile=$(grep '^profile:' "$PROJECT_ROOT/.sandbox" | sed 's/^profile:[[:space:]]*//')
            echo "Profile:   $profile"
        fi
        if docker ps --format '{{.Names}}' 2>/dev/null | grep -qx "$CONTAINER_NAME"; then
            echo "Status:    running"
        else
            echo "Status:    stopped"
        fi
        exit 0
        ;;
    --rebuild)
        PROJECT_ROOT=$(config_find_project_root)
        if [ -f "$PROJECT_ROOT/.sandbox" ]; then
            profile=$(grep '^profile:' "$PROJECT_ROOT/.sandbox" | sed 's/^profile:[[:space:]]*//')
            exec "$SCRIPT_DIR/sandbox-setup.sh" --rebuild "$profile"
        else
            echo "[sandbox-me] No .sandbox file found."
            exit 1
        fi
        ;;
    --remove-project)
        name="${2:-}"
        if [ -z "$name" ]; then
            PROJECT_ROOT=$(config_find_project_root)
            name=$(config_derive_project_name "$PROJECT_ROOT" "$SANDBOX_HOME")
        fi
        PROJECT_DIR="$SANDBOX_HOME/projects/$name"
        if [ ! -d "$PROJECT_DIR" ]; then
            echo "[sandbox-me] Project '$name' not found."
            exit 1
        fi
        echo "This will remove all data for project '$name'."
        read -rp "Continue? [y/N]: " confirm
        if [[ "$confirm" =~ ^[yY]$ ]]; then
            CONTAINER_NAME="sandbox-$name"
            docker compose -f "$PROJECT_DIR/docker-compose.yml" --project-directory "$PROJECT_DIR" down -v 2>/dev/null || true
            docker stop "$CONTAINER_NAME" 2>/dev/null || true
            # Remove asb_ named volumes for this project
            docker volume ls -q --filter "name=asb_.*_${name}" 2>/dev/null | while read -r vol; do
                docker volume rm "$vol" 2>/dev/null || true
            done
            rm -rf "$PROJECT_DIR"
            echo "[sandbox-me] Project '$name' removed."
        fi
        exit 0
        ;;
    --edit-override)
        PROJECT_ROOT=$(config_find_project_root)
        PROJECT_NAME=$(config_derive_project_name "$PROJECT_ROOT" "$SANDBOX_HOME")
        PROJECT_DIR="$SANDBOX_HOME/projects/$PROJECT_NAME"
        file="$PROJECT_DIR/docker-compose.override.yml"
        if [ -f "$file" ]; then
            ${EDITOR:-vi} "$file"
        else
            echo "[sandbox-me] Override file not found: $file"
            echo "  Run sandbox-me once to create the project first."
        fi
        exit 0
        ;;
    --cleanup-volumes)
        echo "[sandbox-me] Scanning for orphaned asb_* volumes..."
        orphans=()
        while IFS= read -r vol; do
            [ -z "$vol" ] && continue
            # Extract project name: asb_<type>_<project-name>
            proj=$(echo "$vol" | sed 's/^asb_[^_]*_//')
            if [ ! -d "$SANDBOX_HOME/projects/$proj" ]; then
                orphans+=("$vol")
            fi
        done < <(docker volume ls -q --filter "name=asb_" 2>/dev/null)

        if [ ${#orphans[@]} -eq 0 ]; then
            echo "[sandbox-me] No orphaned volumes found."
            exit 0
        fi

        echo "Found ${#orphans[@]} orphaned volumes:"
        for vol in "${orphans[@]}"; do
            size=$(docker system df -v 2>/dev/null | grep "$vol" | awk '{print $NF}' || echo "unknown")
            echo "  $vol ($size)"
        done
        echo ""
        read -rp "Remove all orphaned volumes? [y/N]: " confirm
        if [[ "$confirm" =~ ^[yY]$ ]]; then
            for vol in "${orphans[@]}"; do
                docker volume rm "$vol" 2>/dev/null && echo "  Removed $vol" || echo "  Failed to remove $vol"
            done
        fi
        exit 0
        ;;
    --edit-env)
        PROJECT_ROOT=$(config_find_project_root)
        PROJECT_NAME=$(config_derive_project_name "$PROJECT_ROOT" "$SANDBOX_HOME")
        PROJECT_DIR="$SANDBOX_HOME/projects/$PROJECT_NAME"
        file="$PROJECT_DIR/user.env"
        if [ -f "$file" ]; then
            ${EDITOR:-vi} "$file"
        else
            echo "[sandbox-me] User env file not found: $file"
            echo "  Run sandbox-me once to create the project first."
        fi
        exit 0
        ;;
esac

########################################
# Prerequisites
########################################
prereqs_check_docker >/dev/null || { echo "[sandbox-me] Docker is required."; exit 1; }
prereqs_check_compose >/dev/null || { echo "[sandbox-me] Docker Compose plugin is required."; exit 1; }
prereqs_check_jq >/dev/null || { echo "[sandbox-me] jq is required."; exit 1; }

mkdir -p "$SANDBOX_HOME/profiles" "$SANDBOX_HOME/projects"

########################################
# Find project root
########################################
PROJECT_ROOT=$(config_find_project_root)
echo "[sandbox-me] Project root: $PROJECT_ROOT"

########################################
# Read or create .sandbox file
########################################
SANDBOX_FILE="$PROJECT_ROOT/.sandbox"
PROFILE_NAME=""

if [ -f "$SANDBOX_FILE" ]; then
    PROFILE_NAME=$(grep '^profile:' "$SANDBOX_FILE" | sed 's/^profile:[[:space:]]*//')
    echo "[sandbox-me] Using profile '$PROFILE_NAME' (from .sandbox)"
fi

# Check if profile exists
if [ -n "$PROFILE_NAME" ] && [ ! -d "$SANDBOX_HOME/profiles/$PROFILE_NAME" ]; then
    echo "[sandbox-me] Profile '$PROFILE_NAME' not found."
    PROFILE_NAME=""
fi

# If no profile, prompt to select or create
if [ -z "$PROFILE_NAME" ]; then
    # List available profiles
    profiles=()
    if [ -d "$SANDBOX_HOME/profiles" ]; then
        for d in "$SANDBOX_HOME/profiles"/*/; do
            [ -d "$d" ] || continue
            profiles+=("$(basename "$d")")
        done
    fi

    if [ ${#profiles[@]} -eq 0 ]; then
        echo "[sandbox-me] No profiles found. Let's create one first."
        exec "$SCRIPT_DIR/sandbox-setup.sh"
    fi

    echo ""
    echo "Available profiles:"
    for i in "${!profiles[@]}"; do
        info=""
        pjson="$SANDBOX_HOME/profiles/${profiles[$i]}/profile.json"
        if [ -f "$pjson" ]; then
            agents=$(jq -r '.agents // [] | join(", ")' "$pjson" 2>/dev/null)
            langs=$(jq -r '.languages // [] | join(", ")' "$pjson" 2>/dev/null)
            info="($agents; $langs)"
        fi
        printf "  %d) %-25s %s\n" "$((i + 1))" "${profiles[$i]}" "$info"
    done
    echo ""
    read -rp "Select a profile [1]: " choice
    choice="${choice:-1}"
    idx=$((choice - 1))
    if [ "$idx" -ge 0 ] && [ "$idx" -lt "${#profiles[@]}" ]; then
        PROFILE_NAME="${profiles[$idx]}"
    else
        echo "[sandbox-me] Invalid selection."
        exit 1
    fi

    # Write .sandbox file
    echo "profile: $PROFILE_NAME" > "$SANDBOX_FILE"
    echo "[sandbox-me] Created .sandbox file."
fi

PROFILE_DIR="$SANDBOX_HOME/profiles/$PROFILE_NAME"
BASE_IMAGE="agent-sandbox/${PROFILE_NAME}:latest"

########################################
# Derive project name
########################################
PROJECT_NAME=$(config_derive_project_name "$PROJECT_ROOT" "$SANDBOX_HOME")
PROJECT_DIR="$SANDBOX_HOME/projects/$PROJECT_NAME"
CONTAINER_NAME="sandbox-$PROJECT_NAME"

echo "[sandbox-me] Profile:   $PROFILE_NAME"
echo "[sandbox-me] Workspace: $PROJECT_ROOT"
echo "[sandbox-me] Project:   $PROJECT_NAME"

########################################
# Check if already running
########################################
if docker ps --format '{{.Names}}' 2>/dev/null | grep -qx "$CONTAINER_NAME"; then
    echo ""
    echo "[sandbox-me] Container '$CONTAINER_NAME' is already running."
    echo "  1) Attach to running session"
    echo "  2) Restart"
    echo "  3) Cancel"
    echo ""
    read -rp "Choice [1]: " reuse_choice
    reuse_choice="${reuse_choice:-1}"

    if [ "$reuse_choice" = "1" ]; then
        # Determine agent to launch
        AGENT_CMD=$(get_agent_command_v2 "$PROFILE_DIR")
        echo "[sandbox-me] Attaching (using $AGENT_CMD)..."
        docker exec -it "$CONTAINER_NAME" $AGENT_CMD
        exit 0
    elif [ "$reuse_choice" = "3" ]; then
        exit 0
    else
        echo "[sandbox-me] Stopping existing container..."
        docker compose -f "$PROJECT_DIR/docker-compose.yml" --project-directory "$PROJECT_DIR" down 2>/dev/null || \
            docker stop "$CONTAINER_NAME" 2>/dev/null || true
    fi
fi

########################################
# Ensure base image exists
########################################
if ! docker image inspect "$BASE_IMAGE" >/dev/null 2>&1; then
    echo "[sandbox-me] Base image not found. Building..."
    docker build -t "$BASE_IMAGE" -f "$PROFILE_DIR/Dockerfile.base" "$PROFILE_DIR"
fi

########################################
# Scaffold project (first run or refresh)
########################################
first_run=false
if [ ! -d "$PROJECT_DIR" ]; then
    first_run=true
    echo "[sandbox-me] New project. Setting up..."
    mkdir -p "$PROJECT_DIR"

    # Create docker-compose.override.yml (never overwritten)
    cat > "$PROJECT_DIR/docker-compose.override.yml" <<'OVERRIDE'
# Agent Sandbox — User Overrides
# This file is never overwritten by sandbox-me.
# Docker Compose automatically merges this with docker-compose.yml.
#
# Examples:
#
# services:
#   sandbox:
#     ports:
#       - "9090:9090"
#     environment:
#       - MY_API_KEY=xxx
#     volumes:
#       - ~/shared-data:/workspace/shared:ro
OVERRIDE

    # Create user.env (never overwritten)
    cat > "$PROJECT_DIR/user.env" <<'USERENV'
# Agent Sandbox — User Environment Variables
# This file is never overwritten by sandbox-me.
# These are loaded into the sandbox container AFTER runtime.env.
# Your values here override any auto-generated values.
#
# Example:
# DATABASE_URL=postgresql://localhost:5432/mydb
# ANTHROPIC_API_KEY=sk-override-for-this-project
USERENV
fi

# Generate docker-compose.yml from profile template
sed \
    -e "s|{{PROJECT_NAME}}|${PROJECT_NAME}|g" \
    -e "s|{{WORKSPACE_PATH}}|${PROJECT_ROOT}|g" \
    -e "s|{{HOST_UID}}|$(id -u)|g" \
    -e "s|{{HOST_GID}}|$(id -g)|g" \
    "$PROFILE_DIR/docker-compose.yml.tpl" > "$PROJECT_DIR/docker-compose.yml"

# Ensure Dockerfile
echo "FROM $BASE_IMAGE" > "$PROJECT_DIR/Dockerfile"

# Scaffold data directories
mkdir -p "$PROJECT_DIR/opencode_data"
mkdir -p "$PROJECT_DIR/opencode_sessions"
mkdir -p "$PROJECT_DIR/logs"
mkdir -p "$PROJECT_DIR/sandbox_data"

# Copy agent configs from profile
if [ -f "$PROFILE_DIR/AGENTS.md" ]; then
    cp "$PROFILE_DIR/AGENTS.md" "$PROJECT_DIR/opencode_data/AGENTS.md"
fi
if [ -f "$PROFILE_DIR/socratic.md" ]; then
    cp "$PROFILE_DIR/socratic.md" "$PROJECT_DIR/opencode_data/socratic.md"
fi
# Copy templates if not already present (preserve user edits)
for tpl in opencode.json oh-my-openagent.json; do
    if [ ! -f "$PROJECT_DIR/opencode_data/$tpl" ] && [ -f "$TEMPLATES_DIR/$tpl" ]; then
        cp "$TEMPLATES_DIR/$tpl" "$PROJECT_DIR/opencode_data/$tpl"
    fi
done
if [ ! -f "$PROJECT_DIR/sandbox_data/agent-config.json" ] && [ -f "$TEMPLATES_DIR/agent-config.json" ]; then
    cp "$TEMPLATES_DIR/agent-config.json" "$PROJECT_DIR/sandbox_data/agent-config.json"
fi

# Write/update config.env
if [ ! -f "$PROJECT_DIR/config.env" ]; then
    {
        echo "WORKSPACE_PATH=$PROJECT_ROOT"
        echo "PROJECT_NAME=$PROJECT_NAME"
        echo "PROFILE=$PROFILE_NAME"
        echo "CREATED=$(date -Iseconds)"
        echo "LAST_STARTED=$(date -Iseconds)"
    } > "$PROJECT_DIR/config.env"
else
    sed -i "s|^LAST_STARTED=.*|LAST_STARTED=$(date -Iseconds)|" "$PROJECT_DIR/config.env"
    sed -i "s|^WORKSPACE_PATH=.*|WORKSPACE_PATH=${PROJECT_ROOT}|" "$PROJECT_DIR/config.env"
fi

if $first_run; then
    echo "[sandbox-me] Project scaffolded."
    echo "  Override file: $PROJECT_DIR/docker-compose.override.yml"
    echo "  User env file: $PROJECT_DIR/user.env"
fi

########################################
# Sync host auth & write runtime env
########################################
docker_sync_host_auth "$PROJECT_DIR/opencode_sessions"
docker_write_runtime_env "$PROJECT_DIR/runtime.env"

########################################
# Port remapping
########################################
docker_remap_compose_ports "$PROJECT_DIR/docker-compose.yml"

########################################
# Start container
########################################
echo "[sandbox-me] Starting container $CONTAINER_NAME..."
docker compose -f "$PROJECT_DIR/docker-compose.yml" --project-directory "$PROJECT_DIR" up -d --build

# Get actual container ID
RUNNING_CONTAINER="$CONTAINER_NAME"
_comp_id=$(docker compose -f "$PROJECT_DIR/docker-compose.yml" --project-directory "$PROJECT_DIR" ps -q agent 2>/dev/null)
if [ -n "$_comp_id" ]; then
    RUNNING_CONTAINER="$_comp_id"
fi

########################################
# Wait for readiness
########################################
docker_wait_for_ready "$RUNNING_CONTAINER" || true

########################################
# Launch agent
########################################
AGENT_CMD=$(get_agent_command_v2 "$PROFILE_DIR")
echo "[sandbox-me] Attaching to $CONTAINER_NAME (using $AGENT_CMD)..."
docker exec -it "$RUNNING_CONTAINER" $AGENT_CMD

########################################
# Post-session: check Dockerfile.extension
########################################
ext_file="$PROJECT_DIR/sandbox_data/Dockerfile.extension"
if [ -f "$ext_file" ]; then
    echo ""
    echo "[sandbox-me] Dockerfile.extension detected — the agent requested system changes."
    read -r -p "Bake into project Dockerfile? [Y/n] " response
    response="${response:-Y}"
    case "$response" in
        [yY]|[yY][eE][sS])
            while IFS= read -r line || [ -n "$line" ]; do
                stripped="$(echo "$line" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
                [ -z "$stripped" ] && continue
                echo "RUN $line" >> "$PROJECT_DIR/Dockerfile"
            done < "$ext_file"
            rm -f "$ext_file"
            echo "[sandbox-me] Changes applied. Container will be rebuilt on next run."
            docker compose -f "$PROJECT_DIR/docker-compose.yml" --project-directory "$PROJECT_DIR" down 2>/dev/null || true
            ;;
        *)
            echo "[sandbox-me] Skipped. Run sandbox-me again to be prompted."
            ;;
    esac
fi

