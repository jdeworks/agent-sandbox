#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
PROJECTS_DIR="$REPO_DIR/projects"
VOLUME_SUFFIXES=("venv" "node_modules" "npm_cache" "pip_cache" "opencode_cache")
BASE_IMAGE="agent-sandbox-base:latest"

if [ ! -d "$PROJECTS_DIR" ] || [ -z "$(ls -A "$PROJECTS_DIR" 2>/dev/null)" ]; then
    echo "No projects to clean up."
    exit 0
fi

projects=()
for project_dir in "$PROJECTS_DIR"/*/; do
    [ -d "$project_dir" ] || continue
    projects+=("$(basename "$project_dir")")
done

echo "This will remove:"
echo ""
for name in "${projects[@]}"; do
    echo "  - Container: sandbox-$name"
    for suffix in "${VOLUME_SUFFIXES[@]}"; do
        echo "  - Volume:    ${suffix}_${name}"
    done
    echo "  - Project dir (config): projects/$name/"
    echo ""
done

if [ "$1" = "--all" ]; then
    echo "  - Image:     $BASE_IMAGE"
    echo ""
fi

read -rp "Proceed? [y/N] " confirm
if [[ ! "$confirm" =~ ^[yY]$ ]]; then
    echo "Aborted."
    exit 0
fi

for name in "${projects[@]}"; do
    container="sandbox-$name"
    project_dir="$PROJECTS_DIR/$name"

    echo "[cleanup] Stopping container $container..."
    docker stop "$container" 2>/dev/null || true
    docker rm "$container" 2>/dev/null || true

    for suffix in "${VOLUME_SUFFIXES[@]}"; do
        vol_name="${suffix}_${name}"
        echo "[cleanup] Removing volume $vol_name..."
        docker volume rm "$vol_name" 2>/dev/null || true
    done

    echo "[cleanup] Removing project dir $project_dir..."
    rm -rf "$project_dir"
done

if [ "$1" = "--all" ]; then
    echo "[cleanup] Removing base image..."
    docker rmi "$BASE_IMAGE" 2>/dev/null || true
fi

echo "[cleanup] Done."
