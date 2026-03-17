#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
PROJECTS_DIR="$REPO_DIR/projects"
PREPARED_DIR="$REPO_DIR/prepared"
ALIASES_FILE="$HOME/.bash_aliases"

# Check if running with sudo
IS_SUDO=false
if [ -n "${SUDO_COMMAND:-}" ] || [ "$(id -u)" = "0" ]; then
    IS_SUDO=true
    rm_cmd="rm -rf"
else
    rm_cmd="rm -rf"
fi

########################################
# Helper: Get profile names in use by scanning project Dockerfiles
# Format: FROM agent-sandbox-<profile>:latest
# Output: one profile name per line (unique)
########################################
get_profiles_in_use_by_dockerfiles() {
    local dockerfile
    for d in "$PROJECTS_DIR"/*/; do
        [ -d "$d" ] || continue
        dockerfile="$d/Dockerfile"
        if [ -f "$dockerfile" ]; then
            sed -n 's/^[[:space:]]*FROM[[:space:]]*agent-sandbox-\([^:]*\):latest.*/\1/p' "$dockerfile"
        fi
    done 2>/dev/null | sort -u
}

########################################
# Helper: List project dir names that reference this profile (via Dockerfile)
########################################
get_projects_using_profile_dockerfile() {
    local profile="$1"
    local result=""
    for d in "$PROJECTS_DIR"/*/; do
        [ -d "$d" ] || continue
        if [ -f "$d/Dockerfile" ] && grep -q "^[[:space:]]*FROM[[:space:]]*agent-sandbox-${profile}:latest" "$d/Dockerfile" 2>/dev/null; then
            result="$result $(basename "$d")"
        fi
    done
    echo "$result"
}

########################################
# Helper: Get all prepared profiles
########################################
get_prepared_profiles() {
    local profiles=()
    if [ -d "$PREPARED_DIR" ]; then
        for d in "$PREPARED_DIR"/*/; do
            [ -d "$d" ] || continue
            profiles+=("$(basename "$d")")
        done
    fi
    printf '%s\n' "${profiles[@]}"
}

########################################
# Cleanup prepared profiles
########################################
cleanup_prepared() {
    local mode="$1"  # "interactive", "single", or "all"
    local target_profile="$2"
    
    if [ ! -d "$PREPARED_DIR" ]; then
        echo "No prepared profiles to clean up."
        return 0
    fi
    
    local profiles=()
    while IFS= read -r p; do
        [ -n "$p" ] && profiles+=("$p")
    done < <(get_prepared_profiles)
    
    if [ ${#profiles[@]} -eq 0 ]; then
        echo "No prepared profiles to clean up."
        return 0
    fi
    
    # Mode: single profile
    if [ "$mode" = "single" ]; then
        local target_dir="$PREPARED_DIR/$target_profile"
        if [ ! -d "$target_dir" ]; then
            echo "[cleanup] Prepared profile '$target_profile' not found."
            exit 1
        fi
        
        local using_projects=$(get_projects_using_profile_dockerfile "$target_profile")
        if [ -n "$using_projects" ]; then
            echo ""
            echo "WARNING: The following projects use profile '$target_profile':"
            for proj in $using_projects; do
                echo "  - $proj"
            done
            echo "These sandboxes will stop working if you delete this profile!"
            echo ""
        fi
        
        read -rp "Remove prepared profile '$target_profile'? [y/N] " confirm
        if [[ ! "$confirm" =~ ^[yY]$ ]]; then
            echo "Aborted."
            return 0
        fi
        
        $rm_cmd "$target_dir"
        echo "[cleanup] Removed prepared profile: $target_profile"
        
        # Remove alias
        if [ -f "$ALIASES_FILE" ]; then
            sed -i "/^alias sandbox-$target_profile=/d" "$ALIASES_FILE"
            echo "[cleanup] Removed alias: sandbox-$target_profile"
        fi
        return 0
    fi
    
    # Mode: all
    if [ "$mode" = "all" ]; then
        echo ""
        echo "WARNING: This will remove ALL prepared profiles!"
        local total_affected=0
        for profile in "${profiles[@]}"; do
            local using=$(get_projects_using_profile_dockerfile "$profile")
            if [ -n "$using" ]; then
                total_affected=1
            fi
        done
        if [ "$total_affected" -eq 1 ]; then
            echo "Some projects will lose their profile!"
        fi
        
        read -rp "Remove ALL prepared profiles? [y/N] " confirm
        if [[ ! "$confirm" =~ ^[yY]$ ]]; then
            echo "Aborted."
            return 0
        fi
        
        for profile in "${profiles[@]}"; do
            $rm_cmd "$PREPARED_DIR/$profile" 2>/dev/null || true
            sed -i "/^alias sandbox-$profile=/d" "$ALIASES_FILE" 2>/dev/null || true
            echo "[cleanup] Removed: $profile"
        done
        echo "[cleanup] All prepared profiles removed."
        return 0
    fi
    
    # Mode: unused-only — only delete prepared profiles not referenced in any project Dockerfile
    if [ "$mode" = "unused-only" ]; then
        local in_use_list
        in_use_list=$(get_profiles_in_use_by_dockerfiles)
        local unused=()
        for profile in "${profiles[@]}"; do
            if echo "$in_use_list" | grep -qxF "$profile"; then
                continue
            fi
            unused+=("$profile")
        done
        if [ ${#unused[@]} -eq 0 ]; then
            echo "No unused prepared profiles (all are in use by at least one project)."
            return 0
        fi
        echo "Unused prepared profiles (not used by any project):"
        for profile in "${unused[@]}"; do
            echo "  - $profile"
        done
        echo ""
        read -rp "Remove these ${#unused[@]} prepared profile(s)? [y/N] " confirm
        if [[ ! "$confirm" =~ ^[yY]$ ]]; then
            echo "Aborted."
            return 0
        fi
        for profile in "${unused[@]}"; do
            $rm_cmd "$PREPARED_DIR/$profile" 2>/dev/null || true
            sed -i "/^alias sandbox-$profile=/d" "$ALIASES_FILE" 2>/dev/null || true
            echo "[cleanup] Removed: $profile"
        done
        echo "[cleanup] Done."
        return 0
    fi

    # Mode: interactive
    echo ""
    echo "=== Prepared Profiles ==="
    echo ""
    
    # Store profile data
    declare -A profile_projects
    local index=1
    local display_profiles=()
    
    for profile in "${profiles[@]}"; do
        local using=$(get_projects_using_profile_dockerfile "$profile")
        profile_projects[$index]="$using"
        display_profiles+=("$profile")
        
        printf "%d) %s" "$index" "$profile"
        if [ -n "$using" ]; then
            printf " (used by:%s)" "$using"
        fi
        printf "\n"
        ((index++))
    done
    
    echo ""
    echo "Enter numbers (comma-separated, e.g. 1,3,5) or 'all':"
    read -rp "Selection: " selection
    
    if [ "$selection" = "all" ]; then
        cleanup_prepared "all"
        return 0
    fi
    
    # Parse selection
    local to_delete=()
    IFS=',' read -ra nums <<< "$selection"
    for num in "${nums[@]}"; do
        num=$(echo "$num" | tr -d ' ')
        if [ -n "$num" ] && [ "$num" -ge 1 ] && [ "$num" -le ${#display_profiles[@]} ]; then
            idx=$((num - 1))
            to_delete+=("${display_profiles[$idx]}")
        fi
    done
    
    if [ ${#to_delete[@]} -eq 0 ]; then
        echo "No valid selections. Aborted."
        return 0
    fi
    
    # Show warning and confirm
    echo ""
    echo "WARNING: The following will be deleted:"
    for profile in "${to_delete[@]}"; do
        local using=$(get_projects_using_profile_dockerfile "$profile")
        echo "  - $profile"
        if [ -n "$using" ]; then
            echo "    Used by: $using"
            echo "    ^ These sandboxes will stop working!"
        fi
    done
    echo ""
    
    read -rp "Confirm deletion? [y/N] " confirm
    if [[ ! "$confirm" =~ ^[yY]$ ]]; then
        echo "Aborted."
        return 0
    fi
    
    for profile in "${to_delete[@]}"; do
        $rm_cmd "$PREPARED_DIR/$profile" 2>/dev/null || true
        sed -i "/^alias sandbox-$profile=/d" "$ALIASES_FILE" 2>/dev/null || true
        echo "[cleanup] Removed: $profile"
    done
    echo "[cleanup] Done."
}

########################################
# Cleanup sandbox projects
########################################
cleanup_sandbox() {
    local mode="$1"  # "interactive", "single", or "all"
    local target_name="$2"
    
    # Mode: single project
    if [ "$mode" = "single" ]; then
        target_dir="$PROJECTS_DIR/$target_name"
        if [ ! -d "$target_dir" ]; then
            echo "[cleanup] Project '$target_name' not found."
            exit 1
        fi
        read -rp "Remove project '$target_name' and its volumes? [y/N] " confirm
        if [[ ! "$confirm" =~ ^[yY]$ ]]; then
            echo "Aborted."
            exit 0
        fi
        compose_file="$target_dir/docker-compose.yml"
        if [ -f "$compose_file" ]; then
            docker compose -f "$compose_file" --project-directory "$target_dir" down -v 2>/dev/null || true
        else
            docker stop "sandbox-$target_name" 2>/dev/null || true
            docker rm "sandbox-$target_name" 2>/dev/null || true
        fi
        if ! $rm_cmd "$target_dir" 2>/dev/null; then
            echo "[cleanup] Some files are root-owned. Use: sandbox-cleanup-sudo $target_name"
            exit 1
        fi
        echo "[cleanup] Removed: $target_name"
        exit 0
    fi
    
    # Check for projects
    if [ ! -d "$PROJECTS_DIR" ] || [ -z "$(ls -A "$PROJECTS_DIR" 2>/dev/null)" ]; then
        echo "No projects to clean up."
        exit 0
    fi
    
    local projects=()
    for project_dir in "$PROJECTS_DIR"/*/; do
        [ -d "$project_dir" ] || continue
        projects+=("$(basename "$project_dir")")
    done
    
    # Mode: all
    if [ "$mode" = "all" ]; then
        echo ""
        echo "This will remove ALL sandbox projects and their volumes!"
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
            if ! $rm_cmd "$project_dir" 2>/dev/null; then
                echo "[cleanup] Permission denied. Use: sandbox-cleanup-sudo --all"
                exit 1
            fi
        done
        echo "[cleanup] Done."
        exit 0
    fi
    
    # Mode: interactive
    echo ""
    echo "=== Sandbox Projects ==="
    echo ""
    
    local index=1
    local display_projects=()
    for name in "${projects[@]}"; do
        display_projects+=("$name")
        printf "%d) %s\n" "$index" "$name"
        ((index++))
    done
    
    echo ""
    echo "Enter numbers (comma-separated, e.g. 1,3,5) or 'all':"
    read -rp "Selection: " selection
    
    if [ "$selection" = "all" ]; then
        cleanup_sandbox "all"
        exit 0
    fi
    
    local to_delete=()
    IFS=',' read -ra nums <<< "$selection"
    for num in "${nums[@]}"; do
        num=$(echo "$num" | tr -d ' ')
        if [ -n "$num" ] && [ "$num" -ge 1 ] && [ "$num" -le ${#display_projects[@]} ]; then
            idx=$((num - 1))
            to_delete+=("${display_projects[$idx]}")
        fi
    done
    
    if [ ${#to_delete[@]} -eq 0 ]; then
        echo "No valid selections. Aborted."
        exit 0
    fi
    
    echo ""
    echo "The following will be removed:"
    for name in "${to_delete[@]}"; do
        echo "  - $name"
    done
    echo ""
    
    read -rp "Confirm deletion? [y/N] " confirm
    if [[ ! "$confirm" =~ ^[yY]$ ]]; then
        echo "Aborted."
        exit 0
    fi
    
    for name in "${to_delete[@]}"; do
        project_dir="$PROJECTS_DIR/$name"
        compose_file="$project_dir/docker-compose.yml"
        echo "[cleanup] Stopping container sandbox-$name..."
        if [ -f "$compose_file" ]; then
            docker compose -f "$compose_file" --project-directory "$project_dir" down -v 2>/dev/null || true
        else
            docker stop "sandbox-$name" 2>/dev/null || true
            docker rm "sandbox-$name" 2>/dev/null || true
        fi
        if ! $rm_cmd "$project_dir" 2>/dev/null; then
            echo "[cleanup] Permission denied for $name. Use sandbox-cleanup-sudo."
        else
            echo "[cleanup] Removed: $name"
        fi
    done
    echo "[cleanup] Done."
}

########################################
# Main: Parse commands
########################################
CMD="$1"
shift || true

case "$CMD" in
    prepared)
        # Prepared profile cleanup
        SUBCMD="${1:-interactive}"
        shift || true
        case "$SUBCMD" in
            --all)
                cleanup_prepared "all"
                ;;
            --unused-only)
                cleanup_prepared "unused-only"
                ;;
            -s|--sudo)
                # Re-run with sudo
                exec sudo bash "$0" prepared "${@:-}"
                ;;
            *)
                if [ -n "$SUBCMD" ] && [ -d "$PREPARED_DIR/$SUBCMD" ]; then
                    cleanup_prepared "single" "$SUBCMD"
                else
                    cleanup_prepared "interactive"
                fi
                ;;
        esac
        ;;
    "")
        # Default: interactive sandbox cleanup
        cleanup_sandbox "interactive"
        ;;
    --all)
        # Clean all sandboxes
        cleanup_sandbox "all"
        ;;
    -s|--sudo)
        # Re-run with sudo
        exec sudo bash "$0" "${@:-}"
        ;;
    *)
        # Single project cleanup
        cleanup_sandbox "single" "$CMD"
        ;;
esac
