#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
PROJECTS_DIR="$REPO_DIR/projects"
VOLUME_SUFFIXES=("venv" "node_modules" "npm_cache" "pip_cache" "opencode_cache")

echo "=== Sandbox Statistics ==="
echo ""

echo "--- Base Image ---"
base_size=$(docker image inspect agent-sandbox-base:latest --format '{{.Size}}' 2>/dev/null || echo "0")
if [ "$base_size" != "0" ]; then
    echo "  agent-sandbox-base:latest  $(numfmt --to=iec "$base_size")"
else
    echo "  (not built)"
fi
echo ""

if [ ! -d "$PROJECTS_DIR" ] || [ -z "$(ls -A "$PROJECTS_DIR" 2>/dev/null)" ]; then
    echo "No sandboxed projects."
    exit 0
fi

total_volume_bytes=0
total_project_bytes=0
project_count=0

echo "--- Projects ---"
for project_dir in "$PROJECTS_DIR"/*/; do
    [ -d "$project_dir" ] || continue
    name="$(basename "$project_dir")"
    project_count=$((project_count + 1))

    proj_size=$(du -sb "$project_dir" 2>/dev/null | awk '{print $1}')
    total_project_bytes=$((total_project_bytes + proj_size))

    container="sandbox-$name"
    status="stopped"
    if docker ps --format '{{.Names}}' 2>/dev/null | grep -qx "$container"; then
        status="running"
    fi

    echo ""
    echo "  $name ($status)"
    echo "    Config dir: $(numfmt --to=iec "$proj_size")"

    for suffix in "${VOLUME_SUFFIXES[@]}"; do
        vol_name="${suffix}_${name}"
        if docker volume inspect "$vol_name" &>/dev/null; then
            vol_size=$(docker run --rm -v "$vol_name:/vol" alpine du -sb /vol 2>/dev/null | awk '{print $1}')
            if [ -n "$vol_size" ] && [ "$vol_size" -gt 0 ] 2>/dev/null; then
                echo "    $vol_name: $(numfmt --to=iec "$vol_size")"
                total_volume_bytes=$((total_volume_bytes + vol_size))
            else
                echo "    $vol_name: (exists)"
            fi
        else
            echo "    $vol_name: (not created)"
        fi
    done
done

echo ""
echo "--- Summary ---"
echo "  Projects:     $project_count"
echo "  Config dirs: $(numfmt --to=iec $total_project_bytes)"
echo "  Volumes:     $(numfmt --to=iec $total_volume_bytes)"
echo ""

echo "--- Docker Disk Overview ---"
docker system df 2>/dev/null || echo "  (could not query docker)"
