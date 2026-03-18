#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
PROJECTS_DIR="$REPO_DIR/projects"

# Portable human-readable size (numfmt on Linux, awk fallback for macOS)
human_size() {
    local bytes="$1"
    if command -v numfmt &>/dev/null; then
        human_size "$bytes"
    else
        awk -v b="$bytes" 'BEGIN {
            if (b >= 1073741824) printf "%.1fG\n", b/1073741824
            else if (b >= 1048576) printf "%.1fM\n", b/1048576
            else if (b >= 1024) printf "%.1fK\n", b/1024
            else printf "%dB\n", b
        }'
    fi
}

echo "=== Sandbox Statistics ==="
echo ""

echo "--- Base Images ---"
found_images=false
while IFS= read -r img; do
    [ -z "$img" ] && continue
    found_images=true
    img_size=$(docker image inspect "$img" --format '{{.Size}}' 2>/dev/null || echo "0")
    if [ "$img_size" != "0" ]; then
        echo "  $img  $(human_size "$img_size")"
    fi
done < <(docker images --format '{{.Repository}}:{{.Tag}}' 2>/dev/null | grep -E '^agent-sandbox[-/]' || true)

if ! $found_images; then
    echo "  (none built)"
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

    profile="-"
    [ -f "$project_dir/config.env" ] && profile="$(grep '^PROFILE=' "$project_dir/config.env" 2>/dev/null | cut -d= -f2-)" || true

    container="sandbox-$name"
    status="stopped"
    if docker ps --format '{{.Names}}' 2>/dev/null | grep -qx "$container"; then
        status="running"
    fi

    echo ""
    echo "  $name ($status, profile: ${profile:-unknown})"
    echo "    Config dir: $(human_size "$proj_size")"

    # Discover volumes from the project's docker-compose.yml
    compose_file="$project_dir/docker-compose.yml"
    if [ -f "$compose_file" ]; then
        vols=$(docker compose -f "$compose_file" --project-directory "$project_dir" config --volumes 2>/dev/null || true)
        while IFS= read -r vol; do
            [ -z "$vol" ] && continue
            vol_name="${name}_${vol}"
            if docker volume inspect "$vol_name" &>/dev/null; then
                vol_size=$(docker run --rm -v "$vol_name:/vol" alpine du -sb /vol 2>/dev/null | awk '{print $1}')
                if [ -n "$vol_size" ] && [ "$vol_size" -gt 0 ] 2>/dev/null; then
                    echo "    $vol_name: $(human_size "$vol_size")"
                    total_volume_bytes=$((total_volume_bytes + vol_size))
                else
                    echo "    $vol_name: (exists)"
                fi
            fi
        done <<< "$vols"
    fi
done

echo ""
echo "--- Summary ---"
echo "  Projects:     $project_count"
echo "  Config dirs: $(human_size "$total_project_bytes")"
echo "  Volumes:     $(human_size "$total_volume_bytes")"
echo ""

echo "--- Docker Disk Overview ---"
docker system df 2>/dev/null || echo "  (could not query docker)"
