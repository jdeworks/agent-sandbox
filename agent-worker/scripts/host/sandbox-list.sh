#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
PROJECTS_DIR="$REPO_DIR/projects"

if [ ! -d "$PROJECTS_DIR" ] || [ -z "$(ls -A "$PROJECTS_DIR" 2>/dev/null)" ]; then
    echo "No sandboxed projects found."
    exit 0
fi

printf "%-20s %-12s %-14s %-30s %s\n" "PROJECT" "STATUS" "PROFILE" "WORKSPACE" "CREATED"
printf "%-20s %-12s %-14s %-30s %s\n" "-------" "------" "-------" "---------" "-------"

for project_dir in "$PROJECTS_DIR"/*/; do
    [ -d "$project_dir" ] || continue
    name="$(basename "$project_dir")"
    container="sandbox-$name"

    workspace="-"
    created="-"
    profile="-"
    if [ -f "$project_dir/config.env" ]; then
        workspace="$(grep '^WORKSPACE_PATH=' "$project_dir/config.env" | cut -d= -f2-)"
        created="$(grep '^CREATED=' "$project_dir/config.env" | cut -d= -f2-)"
        profile="$(grep '^PROFILE=' "$project_dir/config.env" | cut -d= -f2-)" || true
    fi

    status="stopped"
    if docker ps --format '{{.Names}}' 2>/dev/null | grep -qx "$container"; then
        status="running"
    elif docker ps -a --format '{{.Names}}' 2>/dev/null | grep -qx "$container"; then
        status="exited"
    fi

    printf "%-20s %-12s %-14s %-30s %s\n" "$name" "$status" "${profile:--}" "$workspace" "$created"
done
