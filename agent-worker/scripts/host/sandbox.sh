#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
PROJECTS_DIR="$REPO_DIR/projects"
TEMPLATES_DIR="$REPO_DIR/templates"
BASE_IMAGE="agent-sandbox-base:latest"

usage() {
    echo "Usage: sandbox.sh <folder_path>"
    echo ""
    echo "  <folder_path>  Path to the workspace folder (use '.' for current directory)"
    echo ""
    echo "Examples:"
    echo "  sandbox.sh ."
    echo "  sandbox.sh /home/user/my-project"
    echo "  sandbox.sh ../other-project"
    exit 1
}

if [ -z "$1" ]; then
    usage
fi

WORKSPACE_PATH="$(cd "$1" && pwd)"
PROJECT_NAME="$(basename "$WORKSPACE_PATH")"
PROJECT_DIR="$PROJECTS_DIR/$PROJECT_NAME"

echo "[sandbox] Workspace:  $WORKSPACE_PATH"
echo "[sandbox] Project:    $PROJECT_NAME"

########################################
# Build base image (uses cache if nothing changed)
########################################
echo "[sandbox] Building base image (cached if unchanged)..."
docker build -f "$REPO_DIR/Dockerfile.base" -t "$BASE_IMAGE" "$REPO_DIR"

########################################
# Create project dir if it doesn't exist
########################################
if [ ! -d "$PROJECT_DIR" ]; then
    echo "[sandbox] New project. Setting up $PROJECT_DIR..."
    mkdir -p "$PROJECT_DIR"

    sed \
        -e "s|{{PROJECT_NAME}}|${PROJECT_NAME}|g" \
        -e "s|{{WORKSPACE_PATH}}|${WORKSPACE_PATH}|g" \
        "$TEMPLATES_DIR/docker-compose.yml.tpl" > "$PROJECT_DIR/docker-compose.yml"

    cp "$TEMPLATES_DIR/Dockerfile.tpl" "$PROJECT_DIR/Dockerfile"

    touch "$PROJECT_DIR/changes.txt"
    mkdir -p "$PROJECT_DIR/opencode_data"
    cp "$TEMPLATES_DIR/opencode.json" "$PROJECT_DIR/opencode_data/opencode.json"
    cp "$TEMPLATES_DIR/oh-my-opencode.json" "$PROJECT_DIR/opencode_data/oh-my-opencode.json"
    cp "$TEMPLATES_DIR/AGENTS.md" "$PROJECT_DIR/opencode_data/AGENTS.md"
    mkdir -p "$PROJECT_DIR/opencode_sessions"
    mkdir -p "$PROJECT_DIR/logs"
    mkdir -p "$PROJECT_DIR/tmp"

    cat > "$PROJECT_DIR/config.env" <<EOF
WORKSPACE_PATH=$WORKSPACE_PATH
PROJECT_NAME=$PROJECT_NAME
CREATED=$(date -Iseconds)
EOF

    echo "[sandbox] Project scaffolded."
else
    echo "[sandbox] Existing project found."
fi

########################################
# Ensure bind mount targets exist
########################################
mkdir -p "$PROJECT_DIR/opencode_data"
mkdir -p "$PROJECT_DIR/opencode_sessions"
mkdir -p "$PROJECT_DIR/logs"
mkdir -p "$PROJECT_DIR/tmp"

########################################
# Dockerfile.extension: offer to merge into project Dockerfile
########################################
EXT_FILE="$WORKSPACE_PATH/Dockerfile.extension"
if [ -f "$EXT_FILE" ]; then
    echo "[sandbox] Dockerfile.extension found in workspace."
    read -r -p "Transfer changes to agent-worker/projects/$PROJECT_NAME/Dockerfile and delete Dockerfile.extension? [y/N] " response
    case "$response" in
        [yY]|[yY][eE][sS])
            while IFS= read -r line || [ -n "$line" ]; do
                stripped="$(echo "$line" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
                [ -z "$stripped" ] && continue
                echo "RUN $line" >> "$PROJECT_DIR/Dockerfile"
            done < "$EXT_FILE"
            rm -f "$EXT_FILE"
            echo "[sandbox] Changes applied to project Dockerfile; Dockerfile.extension removed. Container will be rebuilt."
            ;;
        *)
            echo "[sandbox] Skipped. Dockerfile.extension left in place."
            ;;
    esac
fi

########################################
# Start container
########################################
echo "[sandbox] Starting container sandbox-$PROJECT_NAME..."
docker compose -f "$PROJECT_DIR/docker-compose.yml" --project-directory "$PROJECT_DIR" up -d --build

echo "[sandbox] Attaching to sandbox-$PROJECT_NAME..."
docker exec -it "sandbox-$PROJECT_NAME" opencode


