#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
PROJECTS_DIR="$REPO_DIR/projects"

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
    # Discover volumes from the project's docker-compose.yml
    compose_file="$PROJECTS_DIR/$name/docker-compose.yml"
    if [ -f "$compose_file" ]; then
        vols=$(docker compose -f "$compose_file" --project-directory "$PROJECTS_DIR/$name" config --volumes 2>/dev/null || true)
        while IFS= read -r vol; do
            [ -z "$vol" ] && continue
            echo "  - Volume:    ${name}_${vol}"
        done <<< "$vols"
    fi
    echo "  - Project dir: projects/$name/"
    echo ""
done

if [ "$1" = "--all" ]; then
    echo "  - All agent-sandbox-* images"
    echo ""
fi

read -rp "Proceed? [y/N] " confirm
if [[ ! "$confirm" =~ ^[yY]$ ]]; then
    echo "Aborted."
    exit 0
fi

for name in "${projects[@]}"; do
    project_dir="$PROJECTS_DIR/$name"
    compose_file="$project_dir/docker-compose.yml"

    echo "[cleanup] Stopping container sandbox-$name..."
    if [ -f "$compose_file" ]; then
        docker compose -f "$compose_file" --project-directory "$project_dir" down -v 2>/dev/null || true
    else
        docker stop "sandbox-$name" 2>/dev/null || true
        docker rm "sandbox-$name" 2>/dev/null || true
    fi

    echo "[cleanup] Removing project dir $project_dir..."
    rm -rf "$project_dir"
done

if [ "$1" = "--all" ]; then
    echo "[cleanup] Removing agent-sandbox images..."
    docker images --format '{{.Repository}}:{{.Tag}}' | grep '^agent-sandbox-' | while IFS= read -r img; do
        echo "[cleanup] Removing image $img..."
        docker rmi "$img" 2>/dev/null || true
    done
fi

echo "[cleanup] Done."
