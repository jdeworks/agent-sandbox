#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
SANDBOX_DIR="$REPO_DIR/sandbox"
SANDBOX_HOME="${SANDBOX_HOME:-$HOME/.agent-sandbox}"
LANGUAGES_JSON="$SANDBOX_DIR/languages.json"
PORTS_JSON="$SANDBOX_DIR/ports.json"
AGENTS_JSON="$SANDBOX_DIR/agents.json"
PLUGINS_JSON="$SANDBOX_DIR/plugins.json"
MCP_SERVERS_JSON="$SANDBOX_DIR/mcp-servers.json"
ADDITIONS_JSON="$SANDBOX_DIR/additions.json"
CONFIG_MIRRORS_JSON="$SANDBOX_DIR/config-mirrors.json"

# Source shared libraries
source "$SCRIPT_DIR/lib/prereqs.sh"
source "$SCRIPT_DIR/lib/config.sh"
source "$SCRIPT_DIR/lib/ui.sh"

########################################
# Subcommands
########################################
case "${1:-}" in
    --list)
        echo "Profiles:"
        if [ -d "$SANDBOX_HOME/profiles" ]; then
            for d in "$SANDBOX_HOME/profiles"/*/; do
                [ -d "$d" ] || continue
                local_name="$(basename "$d")"
                info=""
                if [ -f "$d/profile.json" ]; then
                    agents=$(jq -r '.agents // [] | join(", ")' "$d/profile.json" 2>/dev/null)
                    langs=$(jq -r '.languages // [] | join(", ")' "$d/profile.json" 2>/dev/null)
                    info="agents=[$agents] languages=[$langs]"
                fi
                printf "  %-30s %s\n" "$local_name" "$info"
            done
        else
            echo "  (none)"
        fi
        exit 0
        ;;
    --delete)
        profile="${2:-}"
        [ -z "$profile" ] && { echo "Usage: sandbox-setup --delete <profile-name>"; exit 1; }
        target_dir="$SANDBOX_HOME/profiles/$profile"
        [ ! -d "$target_dir" ] && { echo "[setup] Profile '$profile' not found."; exit 1; }
        # Find running containers using this profile
        running_containers=()
        if [ -d "$SANDBOX_HOME/projects" ]; then
            for proj_dir in "$SANDBOX_HOME/projects"/*/; do
                [ ! -d "$proj_dir" ] && continue
                cfg="$proj_dir/config.env"
                [ ! -f "$cfg" ] && continue
                proj_profile=$(grep '^PROFILE=' "$cfg" 2>/dev/null | cut -d= -f2)
                if [ "$proj_profile" = "$profile" ]; then
                    proj_name=$(basename "$proj_dir")
                    if docker ps --format '{{.Names}}' | grep -q "^sandbox-${proj_name}$" 2>/dev/null; then
                        running_containers+=("$proj_name")
                    fi
                fi
            done
        fi
        if [ ${#running_containers[@]} -gt 0 ]; then
            echo "[setup] ${#running_containers[@]} running container(s) will be stopped: ${running_containers[*]}"
        fi
        read -rp "Delete profile '$profile' and its Docker image? [y/N]: " confirm
        if [[ "$confirm" =~ ^[yY]$ ]]; then
            for cname in "${running_containers[@]}"; do
                echo "[setup] Removing container for project '$cname'..."
                compose_file="$SANDBOX_HOME/projects/$cname/docker-compose.yml"
                if [ -f "$compose_file" ]; then
                    docker compose -f "$compose_file" --project-directory "$SANDBOX_HOME/projects/$cname" down -v 2>/dev/null || true
                else
                    docker rm -f "sandbox-$cname" 2>/dev/null || true
                fi
            done
            docker rmi "agent-sandbox-${profile}:latest" 2>/dev/null || true
            rm -rf "$target_dir"
            echo "[setup] Profile '$profile' deleted."
        fi
        exit 0
        ;;
    --rebuild)
        profile="${2:-}"
        [ -z "$profile" ] && { echo "Usage: sandbox-setup --rebuild <profile-name>"; exit 1; }
        target_dir="$SANDBOX_HOME/profiles/$profile"
        [ ! -d "$target_dir" ] && { echo "[setup] Profile '$profile' not found."; exit 1; }
        echo "[setup] Rebuilding '$profile' (no cache). Affects all projects using this profile."
        read -rp "Continue? [Y/n]: " confirm
        confirm="${confirm:-Y}"
        if [[ "$confirm" =~ ^[yY]$ ]]; then
            docker build --no-cache -t "agent-sandbox-${profile}:latest" \
                -f "$target_dir/Dockerfile.base" "$target_dir"
            echo "[setup] Profile '$profile' rebuilt."
        fi
        exit 0
        ;;
    --add-plugin)
        profile="${2:-}"
        [ -z "$profile" ] && { echo "Usage: sandbox-setup --add-plugin <profile-name> [npm-package]"; exit 1; }
        target_dir="$SANDBOX_HOME/profiles/$profile"
        [ ! -d "$target_dir" ] && { echo "[setup] Profile '$profile' not found."; exit 1; }
        pkg="${3:-}"
        if [ -z "$pkg" ]; then
            read -rp "npm package to install (e.g. oh-my-openagent): " pkg
        fi
        [ -z "$pkg" ] && { echo "[setup] No package specified."; exit 1; }
        echo "RUN npm install -g $pkg" >> "$target_dir/Dockerfile.base"
        # Store in profile.json custom_plugins array
        if [ -f "$target_dir/profile.json" ]; then
            jq --arg p "$pkg" '.custom_plugins = (.custom_plugins // []) + [$p]' \
                "$target_dir/profile.json" > "$target_dir/profile.json.tmp" \
                && mv "$target_dir/profile.json.tmp" "$target_dir/profile.json"
        fi
        echo "[setup] Added '$pkg' to profile '$profile'."
        echo "  Run 'sandbox-setup --rebuild $profile' to apply."
        exit 0
        ;;
    --export)
        profile="${2:-}"
        [ -z "$profile" ] && { echo "Usage: sandbox-setup --export <profile-name> [output-file]"; exit 1; }
        profile_dir="$SANDBOX_HOME/profiles/$profile"
        [ ! -f "$profile_dir/profile.json" ] && { echo "[setup] Profile '$profile' not found."; exit 1; }
        output_file="${3:--}"
        exported=$(jq -n \
            --arg fmt "agent-sandbox-profile/1" \
            --argjson profile "$(cat "$profile_dir/profile.json")" \
            --arg exported "$(date -Iseconds)" \
            --arg host "$(hostname)" \
            --arg version "2.2.0" \
            '{
                _format: $fmt,
                _metadata: { exported_at: $exported, hostname: $host, version: $version },
                profile: $profile
            }')
        if [ "$output_file" = "-" ]; then
            echo "$exported"
        else
            echo "$exported" > "$output_file"
            echo "[setup] Profile '$profile' exported to $output_file"
        fi
        exit 0
        ;;
    --import)
        import_file="${2:-}"
        [ -z "$import_file" ] || [ ! -f "$import_file" ] && { echo "Usage: sandbox-setup --import <file.json>"; exit 1; }
        format=$(jq -r '._format // empty' "$import_file")
        [ "$format" != "agent-sandbox-profile/1" ] && { echo "[setup] Unknown or invalid profile format."; exit 1; }
        imp_name=$(jq -r '.profile.name // empty' "$import_file")
        [ -z "$imp_name" ] && { echo "[setup] Profile has no name."; exit 1; }
        # Resolve name collisions: append -2, -3, etc.
        base_name="$imp_name"
        suffix=1
        while [ -d "$SANDBOX_HOME/profiles/$imp_name" ]; do
            suffix=$((suffix + 1))
            imp_name="${base_name}-${suffix}"
        done
        if [ "$imp_name" != "$base_name" ]; then
            echo "[setup] Profile '$base_name' already exists, using '$imp_name' instead."
        fi
        imp_dir="$SANDBOX_HOME/profiles/$imp_name"
        mkdir -p "$imp_dir"
        # Update name in profile.json to match resolved name
        jq --arg name "$imp_name" '.profile | .name = $name' "$import_file" > "$imp_dir/profile.json"
        echo "[setup] Imported profile '$imp_name'. Generating files..."

        # Read profile fields and regenerate
        imp_langs=$(jq -r '.profile.languages // [] | join(",")' "$import_file")
        imp_additions=$(jq -r '.profile.additions // [] | join(",")' "$import_file")
        imp_versions=$(jq -r '.profile.versions // {} | to_entries | map("\(.key):\(.value)") | join(",")' "$import_file")
        imp_primary=$(jq -r '.profile.agents[0] // "opencode"' "$import_file")
        imp_vscode_exts=$(jq -r '.profile.vscode_extensions // [] | join(",")' "$import_file")
        imp_custom_df=$(jq -r '.profile.custom_dockerfile_lines // [] | join("\n")' "$import_file")
        imp_custom_before=$(jq -r '.profile.custom_startup_before // [] | join("\n")' "$import_file")
        imp_custom_after=$(jq -r '.profile.custom_startup_after // [] | join("\n")' "$import_file")

        # Compute ports
        imp_ports=$(jq -r '.base.ports[]' "$SANDBOX_DIR/ports.json")
        while IFS=',' read -ra il; do
            for lang in "${il[@]}"; do
                jq -r ".\"$lang\".default[]? // empty" "$SANDBOX_DIR/ports.json" 2>/dev/null
            done
        done <<< "$imp_langs"
        for addition in $(echo "$imp_additions" | tr ',' ' '); do
            jq -r ".\"$addition\".port // empty" "$SANDBOX_DIR/additions.json" 2>/dev/null
        done
        # Simplified: use base ports + let generate_profile sort it out
        imp_port_csv=$(jq -r '[.base.ports[]] | sort | join(",")' "$SANDBOX_DIR/ports.json")

        imp_agents=$(jq -r '.profile.agents // [] | join(",")' "$import_file")
        SELECTED_AGENTS="$imp_agents" \
        PRIMARY_AGENT="$imp_primary" \
        VSCODE_EXTENSIONS="$imp_vscode_exts" \
        CUSTOM_DOCKERFILE_LINES="$imp_custom_df" \
        CUSTOM_STARTUP_BEFORE="$imp_custom_before" \
        CUSTOM_STARTUP_AFTER="$imp_custom_after" \
        "$SANDBOX_DIR/generate_profile.sh" "$SANDBOX_DIR" "$imp_dir" "$imp_name" "$imp_langs" "$imp_port_csv" "$imp_versions" "$imp_additions"

        # Append custom npm packages
        imp_custom_pkgs=$(jq -r '.profile.custom_plugins // [] | .[]' "$import_file")
        if [ -n "$imp_custom_pkgs" ]; then
            while IFS= read -r pkg; do
                [ -n "$pkg" ] && sed -i "/^ENTRYPOINT/i RUN npm install -g $pkg" "$imp_dir/Dockerfile.base"
            done <<< "$imp_custom_pkgs"
        fi
        # Append skills
        imp_skills=$(jq -r '.profile.skills // [] | .[]' "$import_file")
        if [ -n "$imp_skills" ]; then
            while IFS= read -r skill; do
                [ -n "$skill" ] && sed -i "/^ENTRYPOINT/i RUN claude skill install anthropics/skills --skill $skill || true" "$imp_dir/Dockerfile.base"
            done <<< "$imp_skills"
        fi

        echo "[setup] Building image..."
        docker build -t "agent-sandbox-${imp_name}:latest" \
            -f "$imp_dir/Dockerfile.base" "$imp_dir"
        echo "[setup] Profile '$imp_name' imported and built."
        exit 0
        ;;
    --quick-start)
        # Zero-friction: build the static-website template (OpenCode + Node) non-interactively
        prereqs_check_all || { echo "[setup] Fix the missing prerequisites and re-run."; exit 1; }
        mkdir -p "$SANDBOX_HOME/profiles" "$SANDBOX_HOME/projects"

        qs_template="${2:-static-website}"
        qs_templates_dir="$SANDBOX_DIR/../templates/profiles"
        qs_templates_dir="$(cd "$(dirname "$qs_templates_dir")" 2>/dev/null && cd templates/profiles 2>/dev/null && pwd)" 2>/dev/null || qs_templates_dir=""
        qs_file="$qs_templates_dir/$qs_template.json"

        if [ -z "$qs_templates_dir" ] || [ ! -f "$qs_file" ]; then
            echo "[setup] Template '$qs_template' not found."
            [ -n "$qs_templates_dir" ] && [ -d "$qs_templates_dir" ] && {
                echo "Available templates:"
                for tf in "$qs_templates_dir"/*.json; do
                    tl=$(jq -r '._template.label // empty' "$tf" 2>/dev/null)
                    tid=$(jq -r '._template.id // empty' "$tf" 2>/dev/null)
                    [ -n "$tl" ] && echo "  $tid — $tl"
                done
            }
            exit 1
        fi

        qs_name=$(jq -r '._template.id // .profile.name' "$qs_file")
        # Resolve name collisions
        if [ -d "$SANDBOX_HOME/profiles/$qs_name" ]; then
            suffix=2
            while [ -d "$SANDBOX_HOME/profiles/${qs_name}-${suffix}" ]; do ((suffix++)); done
            qs_name="${qs_name}-${suffix}"
        fi

        qs_agents=$(jq -r '.profile.agents // [] | join(",")' "$qs_file")
        qs_langs=$(jq -r '.profile.languages // [] | join(",")' "$qs_file")
        qs_additions=$(jq -r '.profile.additions // [] | join(",")' "$qs_file")
        qs_agents_md_extra=$(jq -r '._template.agents_md_extra // empty' "$qs_file")

        # Compute ports
        qs_port_set="3000,8080"
        for lang in $(echo "$qs_langs" | tr ',' ' '); do
            lp=$(jq -r ".\"$lang\".default[]? // empty" "$SANDBOX_DIR/sandbox/ports.json" 2>/dev/null | tr '\n' ',')
            [ -n "$lp" ] && qs_port_set="$qs_port_set,$lp"
        done
        for add in $(echo "$qs_additions" | tr ',' ' '); do
            ap=$(jq -r ".\"$add\".port // empty" "$SANDBOX_DIR/sandbox/additions.json" 2>/dev/null)
            [ -n "$ap" ] && qs_port_set="$qs_port_set,$ap"
        done
        qs_ports=$(echo "$qs_port_set" | tr ',' '\n' | sort -un | tr '\n' ',' | sed 's/,$//')

        QS_PROFILE_DIR="$SANDBOX_HOME/profiles/$qs_name"
        echo ""
        echo "[setup] Quick Start: building profile '$qs_name' ($(jq -r '._template.label' "$qs_file"))..."
        echo ""

        SELECTED_AGENTS="$qs_agents" PRIMARY_AGENT="$(echo "$qs_agents" | cut -d, -f1)" \
            bash "$SANDBOX_DIR/sandbox/generate_profile.sh" \
            "$SANDBOX_DIR/sandbox" "$QS_PROFILE_DIR" "$qs_name" "$qs_langs" "$qs_ports" "" "$qs_additions" >/dev/null 2>&1

        # Append template-specific AGENTS.md content
        if [ -n "$qs_agents_md_extra" ] && [ -f "$QS_PROFILE_DIR/AGENTS.md" ]; then
            printf '\n%s\n' "$qs_agents_md_extra" >> "$QS_PROFILE_DIR/AGENTS.md"
        fi

        # Write profile.json
        jq -n --arg name "$qs_name" --arg tmpl "$qs_template" \
            --argjson agents "$(jq '.profile.agents' "$qs_file")" \
            --argjson langs "$(jq '.profile.languages' "$qs_file")" \
            --argjson adds "$(jq '.profile.additions' "$qs_file")" \
            '{name: $name, template: $tmpl, agents: $agents, languages: $langs, additions: $adds, plugins: [], custom_plugins: [], skills: [], vscode_extensions: [], mcp_servers: [], custom_dockerfile_lines: [], custom_startup_before: [], custom_startup_after: []}' \
            > "$QS_PROFILE_DIR/profile.json"

        echo "[setup] Building Docker image..."
        docker build -t "agent-sandbox-${qs_name}:latest" \
            -f "$QS_PROFILE_DIR/Dockerfile.base" "$QS_PROFILE_DIR" || {
            echo "[setup] Build failed."
            exit 1
        }
        echo ""
        echo "[setup] Ready! Run 'sandbox-me' from your project directory."
        echo "  Profile: $qs_name"
        echo "  Agent:   $(echo "$qs_agents" | cut -d, -f1)"
        echo "  Languages: $qs_langs"
        exit 0
        ;;
    --help|-h)
        cat <<'HELP'
sandbox-setup — Create and manage sandbox profiles

Usage:
  sandbox-setup                          Interactive profile creation
  sandbox-setup --quick-start [template] Zero-friction setup (default: static-website)
  sandbox-setup --list                   List all profiles
  sandbox-setup --delete <name>          Delete a profile and its Docker image
  sandbox-setup --rebuild <name>         Rebuild a profile image (no cache)
  sandbox-setup --add-plugin <name> [pkg] Add an npm package to a profile
  sandbox-setup --export <name> [file]   Export a profile to JSON (stdout or file)
  sandbox-setup --import <file.json>     Import and build a profile from JSON

Templates:
  static-website    HTML/CSS/JS, GitHub Pages (OpenCode + Node)
  web-app           Frontend + backend + VS Code Server (OpenCode + Node + Python)
  python-dev        Scripts, APIs, data science (OpenCode + Python + Node)

Examples:
  sandbox-setup --quick-start            # Build static-website profile, zero prompts
  sandbox-setup --quick-start web-app    # Build web-app profile, zero prompts
  sandbox-setup                          # Create a new profile interactively
  sandbox-setup --add-plugin my-dev oh-my-openagent
  sandbox-setup --rebuild my-dev
  sandbox-setup --export my-dev my-dev.json
  sandbox-setup --import shared-profile.json
HELP
        exit 0
        ;;
esac

########################################
# Prerequisites
########################################
echo ""
echo "=== Agent Sandbox Setup ==="
echo ""

prereqs_check_all || {
    echo "[setup] Fix the missing prerequisites and re-run."
    exit 1
}

mkdir -p "$SANDBOX_HOME/profiles" "$SANDBOX_HOME/projects"

########################################
# Template selection (optional quick start)
########################################
TEMPLATES_DIR="$SANDBOX_DIR/sandbox/../templates/profiles"
# Normalize path
TEMPLATES_DIR="$(cd "$(dirname "$TEMPLATES_DIR")" 2>/dev/null && cd templates/profiles 2>/dev/null && pwd)" 2>/dev/null || TEMPLATES_DIR=""

use_template=""
if [ -n "$TEMPLATES_DIR" ] && [ -d "$TEMPLATES_DIR" ] && ls "$TEMPLATES_DIR"/*.json >/dev/null 2>&1; then
    echo ""
    echo "Start from a template? (recommended for getting started)"
    echo ""
    tmpl_files=()
    tmpl_idx=1
    for tf in "$TEMPLATES_DIR"/*.json; do
        tmpl_label=$(jq -r '._template.label // empty' "$tf" 2>/dev/null)
        tmpl_desc=$(jq -r '._template.description // empty' "$tf" 2>/dev/null)
        [ -z "$tmpl_label" ] && continue
        tmpl_files+=("$tf")
        printf "  %d) %s — %s\n" "$tmpl_idx" "$tmpl_label" "$tmpl_desc"
        ((tmpl_idx++)) || true
    done
    echo "  c) Custom — full setup wizard"
    echo ""
    read -rp "Select [1-${#tmpl_files[@]}/c]: " tmpl_choice

    if [[ "$tmpl_choice" =~ ^[0-9]+$ ]] && [ "$tmpl_choice" -ge 1 ] && [ "$tmpl_choice" -le "${#tmpl_files[@]}" ]; then
        use_template="${tmpl_files[$((tmpl_choice - 1))]}"
        tmpl_id=$(jq -r '._template.id // .profile.name' "$use_template")
        echo ""
        read -rp "Profile name [$tmpl_id]: " profile_name
        profile_name="${profile_name:-$tmpl_id}"

        if ! config_validate_profile_name "$profile_name"; then
            echo "[setup] Invalid name. Using '$tmpl_id'."
            profile_name="$tmpl_id"
        fi
        if [ -d "$SANDBOX_HOME/profiles/$profile_name" ]; then
            suffix=2
            while [ -d "$SANDBOX_HOME/profiles/${profile_name}-${suffix}" ]; do ((suffix++)); done
            profile_name="${profile_name}-${suffix}"
            echo "[setup] Name taken, using '$profile_name'."
        fi

        read -rp "Customize before building? [y/N]: " customize
        if [[ "$customize" =~ ^[yY]$ ]]; then
            # Fall through to normal wizard with pre-filled values
            SELECTED_AGENTS=$(jq -r '.profile.agents // [] | join(",")' "$use_template")
            SELECTED_LANGS=$(jq -r '.profile.languages // [] | join(",")' "$use_template")
            SELECTED_ADDITIONS=$(jq -r '.profile.additions // [] | join(",")' "$use_template")
            TEMPLATE_ID="$tmpl_id"
            use_template=""  # Clear so we go through the wizard
            echo "[setup] Starting wizard with template defaults. You can change any selection."
        else
            # Quick start: generate and build immediately
            PROFILE_DIR="$SANDBOX_HOME/profiles/$profile_name"
            t_agents=$(jq -r '.profile.agents // [] | join(",")' "$use_template")
            t_langs=$(jq -r '.profile.languages // [] | join(",")' "$use_template")
            t_additions=$(jq -r '.profile.additions // [] | join(",")' "$use_template")
            t_agents_md_extra=$(jq -r '._template.agents_md_extra // empty' "$use_template")

            # Compute ports
            t_port_set="3000,8080"
            for lang in $(echo "$t_langs" | tr ',' ' '); do
                lang_ports=$(jq -r ".\"$lang\".default[]? // empty" "$SANDBOX_DIR/sandbox/ports.json" 2>/dev/null | tr '\n' ',')
                [ -n "$lang_ports" ] && t_port_set="$t_port_set,$lang_ports"
            done
            for add in $(echo "$t_additions" | tr ',' ' '); do
                add_port=$(jq -r ".\"$add\".port // empty" "$SANDBOX_DIR/sandbox/additions.json" 2>/dev/null)
                [ -n "$add_port" ] && t_port_set="$t_port_set,$add_port"
            done
            # Deduplicate ports
            t_ports=$(echo "$t_port_set" | tr ',' '\n' | sort -un | tr '\n' ',' | sed 's/,$//')

            echo ""
            echo "[setup] Building profile '$profile_name' from template..."
            SELECTED_AGENTS="$t_agents" PRIMARY_AGENT="$(echo "$t_agents" | cut -d, -f1)" \
                bash "$SANDBOX_DIR/sandbox/generate_profile.sh" \
                "$SANDBOX_DIR/sandbox" "$PROFILE_DIR" "$profile_name" "$t_langs" "$t_ports" "" "$t_additions" >/dev/null 2>&1

            # Append template-specific AGENTS.md content
            if [ -n "$t_agents_md_extra" ] && [ -f "$PROFILE_DIR/AGENTS.md" ]; then
                printf '\n%s\n' "$t_agents_md_extra" >> "$PROFILE_DIR/AGENTS.md"
            fi

            # Write profile.json
            jq -n --arg name "$profile_name" --arg tmpl "$tmpl_id" \
                --argjson agents "$(jq '.profile.agents' "$use_template")" \
                --argjson langs "$(jq '.profile.languages' "$use_template")" \
                --argjson adds "$(jq '.profile.additions' "$use_template")" \
                '{name: $name, template: $tmpl, agents: $agents, languages: $langs, additions: $adds, plugins: [], custom_plugins: [], skills: [], vscode_extensions: [], mcp_servers: [], custom_dockerfile_lines: [], custom_startup_before: [], custom_startup_after: []}' \
                > "$PROFILE_DIR/profile.json"

            echo "[setup] Building Docker image..."
            docker build -t "agent-sandbox-${profile_name}:latest" "$PROFILE_DIR" || {
                echo "[setup] Build failed."
                exit 1
            }
            echo ""
            echo "[setup] Profile '$profile_name' ready! Run 'sandbox-me' from your project directory."
            exit 0
        fi
    fi
fi

########################################
# Profile name
########################################
echo ""
while true; do
    read -rp "Profile name (lowercase, hyphens ok): " profile_name
    if config_validate_profile_name "$profile_name"; then
        if [ -d "$SANDBOX_HOME/profiles/$profile_name" ]; then
            echo "  Profile '$profile_name' already exists. Choose a different name."
        else
            break
        fi
    fi
done

PROFILE_DIR="$SANDBOX_HOME/profiles/$profile_name"
mkdir -p "$PROFILE_DIR"

########################################
# Agent selection
########################################
echo ""
echo "Which coding agents should be installed?"

agent_keys=()
while IFS='|' read -r key label use_cases; do
    agent_keys+=("$key")
    env_hint=""
    env_vars=$(jq -r ".\"$key\".env_vars[]? // empty" "$AGENTS_JSON")
    for ev in $env_vars; do
        [ -n "${!ev:-}" ] && { env_hint=" [credentials found]"; break; }
    done
    printf "  %d) %-18s %s%s\n" "${#agent_keys[@]}" "$label" "$use_cases" "$env_hint"
done < <(jq -r 'to_entries | .[] | "\(.key)|\(.value.label)|\(.value.use_cases // "")"' "$AGENTS_JSON")

echo ""
read -rp "Select agents (comma-separated): " agent_choice
IFS=',' read -ra agent_indices <<< "$agent_choice"
selected_agents=()
for idx in "${agent_indices[@]}"; do
    idx=$(echo "$idx" | tr -d ' ')
    arr_idx=$((idx - 1))
    if [ "$arr_idx" -ge 0 ] && [ "$arr_idx" -lt "${#agent_keys[@]}" ]; then
        selected_agents+=("${agent_keys[$arr_idx]}")
    fi
done

if [ ${#selected_agents[@]} -eq 0 ]; then
    echo "  No agents selected. At least one is required."
    rm -rf "$PROFILE_DIR"
    exit 1
fi
echo "  -> ${selected_agents[*]}"

########################################
# Plugin selection (only for agents that have plugins)
########################################
selected_plugins=()
for agent in "${selected_agents[@]}"; do
    agent_plugins=$(jq -r "to_entries[] | select(.value.agent == \"$agent\") | .key" "$PLUGINS_JSON" 2>/dev/null)
    [ -z "$agent_plugins" ] && continue

    echo ""
    echo "Plugins for $agent:"
    plugin_list=()
    while IFS= read -r pname; do
        [ -z "$pname" ] && continue
        desc=$(jq -r ".\"$pname\".description" "$PLUGINS_JSON")
        # Truncate description to first sentence for readability
        short_desc=$(echo "$desc" | sed 's/\. .*/\./')
        plugin_list+=("$pname")
        printf "  %d) %s — %s\n" "${#plugin_list[@]}" "$pname" "$short_desc"
    done <<< "$agent_plugins"
    echo ""
    read -rp "Select plugins (comma-separated, Enter to skip): " plugin_choice
    if [ -n "$plugin_choice" ]; then
        IFS=',' read -ra pidx <<< "$plugin_choice"
        for pi in "${pidx[@]}"; do
            pi=$(echo "$pi" | tr -d ' ')
            arr_pi=$((pi - 1))
            [ "$arr_pi" -ge 0 ] && [ "$arr_pi" -lt "${#plugin_list[@]}" ] && selected_plugins+=("${plugin_list[$arr_pi]}")
        done
    fi
done

# Plugin discovery (opt-in, fetches from online registries)
custom_plugins=()
selected_skills=()
DISCOVERY_CACHE_DIR="$SANDBOX_HOME/.cache/plugin-discovery"
mkdir -p "$DISCOVERY_CACHE_DIR"

for agent in "${selected_agents[@]}"; do
    # Support both discovery_urls (array) and discovery_url (string)
    discovery_urls=()
    while IFS= read -r u; do
        [ -n "$u" ] && discovery_urls+=("$u")
    done < <(jq -r "(.\"$agent\".discovery_urls // [])[]? // empty" "$AGENTS_JSON" 2>/dev/null)
    if [ ${#discovery_urls[@]} -eq 0 ]; then
        single_url=$(jq -r ".\"$agent\".discovery_url // empty" "$AGENTS_JSON" 2>/dev/null)
        [ -n "$single_url" ] && discovery_urls+=("$single_url")
    fi
    [ ${#discovery_urls[@]} -eq 0 ] && continue

    agent_label=$(jq -r ".\"$agent\".label // \"$agent\"" "$AGENTS_JSON")
    echo ""
    read -rp "Search for popular $agent_label plugins/skills online? [y/N]: " discover_opt
    [[ ! "$discover_opt" =~ ^[yY]$ ]] && continue

    # Fetch from all discovery URLs, merge results
    all_json="[]"
    for disc_url in "${discovery_urls[@]}"; do
        cache_key=$(echo "$disc_url" | md5sum | cut -c1-16)
        cache_file="$DISCOVERY_CACHE_DIR/${agent}_${cache_key}.json"
        cache_age=86400

        use_cache=false
        if [ -f "$cache_file" ]; then
            file_age=$(( $(date +%s) - $(stat -c %Y "$cache_file" 2>/dev/null || echo 0) ))
            [ "$file_age" -lt "$cache_age" ] && use_cache=true
        fi

        if $use_cache; then
            raw_content=$(<"$cache_file")
        else
            echo "  Fetching from npm registry..."
            raw_content=$(curl -sS --connect-timeout 5 --max-time 15 "$disc_url" 2>/dev/null) || continue
            echo "$raw_content" > "$cache_file"
        fi

        # Merge objects arrays
        url_objects=$(echo "$raw_content" | jq '.objects // []' 2>/dev/null)
        [ -n "$url_objects" ] && all_json=$(echo "$all_json $url_objects" | jq -s '.[0] + .[1]')
    done

    # Parse merged results, deduplicate, sort by weekly downloads
    discovered=()
    discovered_desc=()
    discovered_dl=()
    declare -A seen_pkgs
    while IFS='|' read -r pkg desc weekly; do
        [ -z "$pkg" ] && continue
        [ -n "${seen_pkgs[$pkg]:-}" ] && continue
        seen_pkgs["$pkg"]=1
        # Skip packages already in registry or already selected
        already=false
        for sp in "${selected_plugins[@]}"; do
            [ "$sp" = "$pkg" ] && { already=true; break; }
        done
        for cp in "${custom_plugins[@]}"; do
            [ "$cp" = "$pkg" ] && { already=true; break; }
        done
        $already && continue
        discovered+=("$pkg")
        short_desc=$(echo "$desc" | sed 's/\. .*/\./')
        [ ${#short_desc} -gt 50 ] && short_desc="${short_desc:0:47}..."
        discovered_desc+=("$short_desc")
        if [ "$weekly" -ge 1000 ] 2>/dev/null; then
            discovered_dl+=("$((weekly / 1000))k/wk")
        else
            discovered_dl+=("${weekly:-0}/wk")
        fi
    done < <(echo "$all_json" | jq -r 'sort_by(-.downloads.weekly) | .[]? | "\(.package.name)|\(.package.description // "")|\(.downloads.weekly // 0)"' 2>/dev/null)
    unset seen_pkgs

    # Also fetch skills from GitHub marketplace (e.g. Claude Code skills)
    skills_url=$(jq -r ".\"$agent\".skills_url // empty" "$AGENTS_JSON" 2>/dev/null)
    if [ -n "$skills_url" ]; then
        skills_cache="$DISCOVERY_CACHE_DIR/${agent}_skills.json"
        skills_content=""
        if [ -f "$skills_cache" ]; then
            file_age=$(( $(date +%s) - $(stat -c %Y "$skills_cache" 2>/dev/null || echo 0) ))
            [ "$file_age" -lt 86400 ] && skills_content=$(<"$skills_cache")
        fi
        if [ -z "$skills_content" ]; then
            echo "  Fetching skills from GitHub..."
            skills_content=$(curl -sS --connect-timeout 5 --max-time 15 "$skills_url" 2>/dev/null) || skills_content=""
            [ -n "$skills_content" ] && echo "$skills_content" > "$skills_cache"
        fi
        if [ -n "$skills_content" ]; then
            while IFS='|' read -r sname sdesc; do
                [ -z "$sname" ] && continue
                [ -n "${seen_pkgs[$sname]:-}" ] 2>/dev/null && continue
                discovered+=("$sname")
                discovered_desc+=("$sdesc [skill]")
                discovered_dl+=("skill")
            done < <(echo "$skills_content" | jq -r '.plugins[]? | . as $p | .skills[]? | split("/") | last | . as $name | "\($name)|\($p.description // "Skill")"' 2>/dev/null)
        fi
    fi

    if [ ${#discovered[@]} -eq 0 ]; then
        echo "  No additional plugins or skills found."
        continue
    fi

    echo "  Discovered $agent_label plugins & skills (sorted by popularity):"
    for i in "${!discovered[@]}"; do
        printf "  %2d) %7s  %-30s %s\n" "$((i + 1))" "${discovered_dl[$i]}" "${discovered[$i]}" "${discovered_desc[$i]}"
    done
    echo ""
    read -rp "  Select (comma-separated, Enter to skip): " disc_choice
    if [ -n "$disc_choice" ]; then
        IFS=',' read -ra disc_indices <<< "$disc_choice"
        for di in "${disc_indices[@]}"; do
            di=$(echo "$di" | tr -d ' ')
            arr_di=$((di - 1))
            if [ "$arr_di" -ge 0 ] && [ "$arr_di" -lt "${#discovered[@]}" ]; then
                # Skills go to a separate list, npm packages to custom_plugins
                if [ "${discovered_dl[$arr_di]}" = "skill" ]; then
                    selected_skills+=("${discovered[$arr_di]}")
                else
                    custom_plugins+=("${discovered[$arr_di]}")
                fi
            fi
        done
    fi
done

# Custom plugins (free text — any npm package)
echo ""
read -rp "Install additional npm packages? (space-separated, Enter to skip): " custom_input
if [ -n "$custom_input" ]; then
    read -ra custom_input_pkgs <<< "$custom_input"
    custom_plugins+=("${custom_input_pkgs[@]}")
    echo "  -> custom: ${custom_input_pkgs[*]}"
fi

########################################
# Language selection (streamlined)
########################################
echo ""
echo "Which languages do you need? (Node.js always included)"

lang_keys=()
while IFS='|' read -r key label; do
    lang_keys+=("$key")
    locked=""
    [ "$key" = "node" ] && locked=" [always included]"
    default_ver=$(jq -r ".\"$key\".default_version // \"system\"" "$LANGUAGES_JSON")
    size_warn=$(jq -r ".\"$key\".size_warning // empty" "$LANGUAGES_JSON" 2>/dev/null)
    warn=""
    [ -n "$size_warn" ] && warn=" ($size_warn)"
    printf "  %d) %s%s%s\n" "${#lang_keys[@]}" "$label" "$locked" "$warn"
done < <(jq -r 'to_entries | sort_by(.key) | .[] | "\(.key)|\(.value.label)"' "$LANGUAGES_JSON")

echo ""
read -rp "Select languages (comma-separated, Enter for Node.js only): " lang_choice
selected_languages=("node")
if [ -n "$lang_choice" ]; then
    IFS=',' read -ra lang_indices <<< "$lang_choice"
    for idx in "${lang_indices[@]}"; do
        idx=$(echo "$idx" | tr -d ' ')
        arr_idx=$((idx - 1))
        if [ "$arr_idx" -ge 0 ] && [ "$arr_idx" -lt "${#lang_keys[@]}" ]; then
            key="${lang_keys[$arr_idx]}"
            [ "$key" != "node" ] && selected_languages+=("$key")
        fi
    done
fi
selected_languages=($(printf '%s\n' "${selected_languages[@]}" | sort -u))
echo "  -> ${selected_languages[*]}"

# Only ask for version overrides if user wants to
declare -A version_overrides
echo ""
read -rp "Override any language versions? [y/N]: " ver_opt_in
if [[ "$ver_opt_in" =~ ^[yY]$ ]]; then
    for lang in "${selected_languages[@]}"; do
        default_ver=$(jq -r ".\"$lang\".default_version // \"system\"" "$LANGUAGES_JSON")
        read -rp "  $lang [$default_ver]: " ver_input
        ver_input="${ver_input:-$default_ver}"
        version_overrides["$lang"]="$ver_input"
    done
else
    for lang in "${selected_languages[@]}"; do
        version_overrides["$lang"]=$(jq -r ".\"$lang\".default_version // \"system\"" "$LANGUAGES_JSON")
    done
fi

########################################
# Additions (optional container-level tools)
########################################
selected_additions=()
if [ -f "$ADDITIONS_JSON" ] && [ "$(jq 'length' "$ADDITIONS_JSON")" -gt 0 ]; then
    echo ""
    echo "Optional additions (extra tools baked into the image):"
    addition_keys=()
    while IFS='|' read -r key label desc size_warn; do
        addition_keys+=("$key")
        warn=""
        [ "$size_warn" != "null" ] && [ -n "$size_warn" ] && warn=" ($size_warn)"
        printf "  %d) %s — %s%s\n" "${#addition_keys[@]}" "$label" "$desc" "$warn"
    done < <(jq -r 'to_entries | .[] | "\(.key)|\(.value.label)|\(.value.description)|\(.value.size_warning // "null")"' "$ADDITIONS_JSON")
    echo ""
    read -rp "Select additions (comma-separated, Enter to skip): " addition_choice
    if [ -n "$addition_choice" ]; then
        IFS=',' read -ra aidx <<< "$addition_choice"
        for ai in "${aidx[@]}"; do
            ai=$(echo "$ai" | tr -d ' ')
            arr_ai=$((ai - 1))
            [ "$arr_ai" -ge 0 ] && [ "$arr_ai" -lt "${#addition_keys[@]}" ] && selected_additions+=("${addition_keys[$arr_ai]}")
        done
    fi
    [ ${#selected_additions[@]} -gt 0 ] && echo "  -> ${selected_additions[*]}"
fi

# VS Code optional extensions (only if vscode-server is selected)
selected_vscode_extensions=()
for addition in "${selected_additions[@]}"; do
    if [ "$addition" = "vscode-server" ]; then
        opt_exts=$(jq -r '.["vscode-server"].extensions.optional // {} | to_entries[] | "\(.key)|\(.value.label)|\(.value.description)"' "$ADDITIONS_JSON" 2>/dev/null)
        if [ -n "$opt_exts" ]; then
            echo ""
            echo "Optional VS Code extensions (always-installed + language-specific are automatic):"
            opt_keys=()
            while IFS='|' read -r eid elabel edesc; do
                [ -z "$eid" ] && continue
                opt_keys+=("$eid")
                printf "  %d) %s — %s\n" "${#opt_keys[@]}" "$elabel" "$edesc"
            done <<< "$opt_exts"
            echo ""
            read -rp "Select optional extensions (comma-separated, Enter to skip): " ext_choice
            if [ -n "$ext_choice" ]; then
                IFS=',' read -ra eidx <<< "$ext_choice"
                for ei in "${eidx[@]}"; do
                    ei=$(echo "$ei" | tr -d ' ')
                    arr_ei=$((ei - 1))
                    [ "$arr_ei" -ge 0 ] && [ "$arr_ei" -lt "${#opt_keys[@]}" ] && selected_vscode_extensions+=("${opt_keys[$arr_ei]}")
                done
            fi
            [ ${#selected_vscode_extensions[@]} -gt 0 ] && echo "  -> ${selected_vscode_extensions[*]}"
        fi
        break
    fi
done

########################################
# Advanced options (MCP + config mirroring behind single prompt)
########################################
echo ""
read -rp "Configure advanced options (MCP servers, config mirroring)? [y/N]: " advanced_opt_in
advanced_opt_in="${advanced_opt_in:-N}"

selected_mcp=()
selected_mirrors=()

if [[ "$advanced_opt_in" =~ ^[yY]$ ]]; then
    # MCP servers
    echo ""
    echo "MCP servers (baked into the image, available to all projects):"
    mcp_keys=()
    while IFS='|' read -r key desc; do
        mcp_keys+=("$key")
        printf "  %d) %s — %s\n" "${#mcp_keys[@]}" "$key" "$desc"
    done < <(jq -r 'to_entries | .[] | "\(.key)|\(.value.description)"' "$MCP_SERVERS_JSON")
    echo ""
    read -rp "Select MCP servers (comma-separated, Enter to skip): " mcp_choice
    if [ -n "$mcp_choice" ]; then
        IFS=',' read -ra mcp_indices <<< "$mcp_choice"
        for idx in "${mcp_indices[@]}"; do
            idx=$(echo "$idx" | tr -d ' ')
            arr_idx=$((idx - 1))
            [ "$arr_idx" -ge 0 ] && [ "$arr_idx" -lt "${#mcp_keys[@]}" ] && selected_mcp+=("${mcp_keys[$arr_idx]}")
        done
    fi

    # Config mirroring
    echo ""
    echo "Config mirroring (share host configs with the sandbox):"
    mirror_keys=()
    mirror_idx=1
    while IFS='|' read -r key label host_path strategy security recommended warning agents_filter; do
        expanded_path="${host_path/#\~/$HOME}"
        detect_type=$(jq -r ".\"$key\".detect" "$CONFIG_MIRRORS_JSON")
        if [ "$detect_type" = "file" ] && [ ! -f "$expanded_path" ]; then continue; fi
        if [ "$detect_type" = "directory" ] && [ ! -d "$expanded_path" ]; then continue; fi

        # Filter by selected agents
        if [ "$agents_filter" != "null" ] && [ -n "$agents_filter" ]; then
            agent_match=false
            for sa in "${selected_agents[@]}"; do
                echo "$agents_filter" | jq -e "index(\"$sa\")" >/dev/null 2>&1 && { agent_match=true; break; }
            done
            $agent_match || continue
        fi

        marker=""
        [ "$recommended" = "true" ] && marker=" *"
        warn_text=""
        [ "$security" = "high" ] && warn_text=" [sensitive]"
        printf "  %2d) %-22s %s%s%s\n" "$mirror_idx" "$label" "$host_path" "$marker" "$warn_text"
        mirror_keys+=("$key")
        ((mirror_idx++))
    done < <(jq -r 'to_entries[] | select(.key != "_doc" and .key != "_strategies") | "\(.key)|\(.value.label)|\(.value.host_path)|\(.value.strategy)|\(.value.security)|\(.value.recommended)|\(.value.warning // "null")|\(.value.agents // "null")"' "$CONFIG_MIRRORS_JSON")

    if [ ${#mirror_keys[@]} -gt 0 ]; then
        echo "  (* = recommended)"
        echo ""
        read -rp "Select (comma-separated, Enter to skip): " mirror_choice
        if [ -n "$mirror_choice" ]; then
            IFS=',' read -ra midx <<< "$mirror_choice"
            for mi in "${midx[@]}"; do
                mi=$(echo "$mi" | tr -d ' ')
                arr_mi=$((mi - 1))
                [ "$arr_mi" -ge 0 ] && [ "$arr_mi" -lt "${#mirror_keys[@]}" ] && selected_mirrors+=("${mirror_keys[$arr_mi]}")
            done
        fi
    fi

    # Custom Dockerfile lines
    custom_dockerfile_lines=()
    echo ""
    read -rp "Add custom Dockerfile RUN lines? (expert, Enter to skip): " custom_df_opt
    if [[ "$custom_df_opt" =~ ^[yY] ]]; then
        echo "  Enter Dockerfile instructions (one per line, blank line to finish):"
        while IFS= read -rp "  > " df_line; do
            [ -z "$df_line" ] && break
            custom_dockerfile_lines+=("$df_line")
        done
        [ ${#custom_dockerfile_lines[@]} -gt 0 ] && echo "  -> ${#custom_dockerfile_lines[@]} custom line(s) added"
    fi

    # Custom startup commands
    custom_startup_before=()
    custom_startup_after=()
    echo ""
    read -rp "Add custom startup commands? (run before/after agent, Enter to skip): " custom_startup_opt
    if [[ "$custom_startup_opt" =~ ^[yY] ]]; then
        echo "  Commands to run BEFORE the agent (one per line, blank to finish):"
        while IFS= read -rp "  before> " cmd_line; do
            [ -z "$cmd_line" ] && break
            custom_startup_before+=("$cmd_line")
        done
        echo "  Commands to run in BACKGROUND before agent (one per line, blank to finish):"
        while IFS= read -rp "  bg> " cmd_line; do
            [ -z "$cmd_line" ] && break
            # Append & for background, but avoid doubling if user already added it
            [[ "$cmd_line" == *"&" ]] && custom_startup_after+=("$cmd_line") || custom_startup_after+=("$cmd_line &")
        done
    fi
fi

########################################
# Summary
########################################
echo ""
echo "=== Summary ==="
echo "  Profile:    $profile_name"
echo "  Agents:     ${selected_agents[*]}"
[ ${#selected_plugins[@]} -gt 0 ] && echo "  Plugins:    ${selected_plugins[*]}"
echo "  Languages:  ${selected_languages[*]}"
[ ${#selected_additions[@]} -gt 0 ] && echo "  Additions:  ${selected_additions[*]}"
[ ${#selected_mcp[@]} -gt 0 ] && echo "  MCP:        ${selected_mcp[*]}"
[ ${#selected_mirrors[@]} -gt 0 ] && echo "  Mirroring:  ${selected_mirrors[*]}"
echo ""

read -rp "Build this profile? [Y/n]: " build_confirm
build_confirm="${build_confirm:-Y}"
if [[ ! "$build_confirm" =~ ^[yY]$ ]]; then
    rm -rf "$PROFILE_DIR"
    echo "[setup] Cancelled."
    exit 0
fi

########################################
# Generate profile.json
########################################
agents_json_arr=$(printf '%s\n' "${selected_agents[@]}" | jq -R . | jq -s .)
plugins_json_arr=$(printf '%s\n' "${selected_plugins[@]}" | jq -R . | jq -s . 2>/dev/null || echo "[]")
custom_json_arr=$(printf '%s\n' "${custom_plugins[@]}" | jq -R . | jq -s . 2>/dev/null || echo "[]")
langs_json_arr=$(printf '%s\n' "${selected_languages[@]}" | jq -R . | jq -s .)
additions_json_arr=$(printf '%s\n' "${selected_additions[@]}" | jq -R . | jq -s . 2>/dev/null || echo "[]")
vscode_ext_json_arr=$(printf '%s\n' "${selected_vscode_extensions[@]}" | jq -R . | jq -s . 2>/dev/null || echo "[]")
mcp_json_arr=$(printf '%s\n' "${selected_mcp[@]}" | jq -R . | jq -s . 2>/dev/null || echo "[]")
skills_json_arr=$(printf '%s\n' "${selected_skills[@]}" | jq -R . | jq -s . 2>/dev/null || echo "[]")
custom_df_json_arr=$(printf '%s\n' "${custom_dockerfile_lines[@]}" | jq -R . | jq -s . 2>/dev/null || echo "[]")
custom_before_json_arr=$(printf '%s\n' "${custom_startup_before[@]}" | jq -R . | jq -s . 2>/dev/null || echo "[]")
custom_after_json_arr=$(printf '%s\n' "${custom_startup_after[@]}" | jq -R . | jq -s . 2>/dev/null || echo "[]")

mirrors_json_obj="{}"
for mkey in "${selected_mirrors[@]}"; do
    mirror_entry=$(jq ".\"$mkey\" | {strategy, host_path, container_path}" "$CONFIG_MIRRORS_JSON")
    mirrors_json_obj=$(echo "$mirrors_json_obj" | jq --arg k "$mkey" --argjson v "$mirror_entry" '.[$k] = $v')
done

versions_json="{"
first=true
for lang in "${selected_languages[@]}"; do
    ver="${version_overrides[$lang]:-}"
    if [ -n "$ver" ]; then
        $first || versions_json+=","
        versions_json+="\"$lang\":\"$ver\""
        first=false
    fi
done
versions_json+="}"

jq -n \
    --argjson agents "$agents_json_arr" \
    --argjson plugins "$plugins_json_arr" \
    --argjson languages "$langs_json_arr" \
    --argjson versions "$versions_json" \
    --argjson additions "$additions_json_arr" \
    --argjson vscode_extensions "$vscode_ext_json_arr" \
    --argjson mcp_servers "$mcp_json_arr" \
    --argjson config_mirrors "$mirrors_json_obj" \
    --argjson custom_plugins "$custom_json_arr" \
    --argjson skills "$skills_json_arr" \
    --argjson custom_dockerfile_lines "$custom_df_json_arr" \
    --argjson custom_startup_before "$custom_before_json_arr" \
    --argjson custom_startup_after "$custom_after_json_arr" \
    '{
        name: $name,
        agents: $agents,
        plugins: $plugins,
        custom_plugins: $custom_plugins,
        skills: $skills,
        languages: $languages,
        versions: $versions,
        additions: $additions,
        vscode_extensions: $vscode_extensions,
        mcp_servers: $mcp_servers,
        config_mirrors: $config_mirrors,
        custom_dockerfile_lines: $custom_dockerfile_lines,
        custom_startup_before: $custom_startup_before,
        custom_startup_after: $custom_startup_after,
        created: $created
    }' \
    --arg name "$profile_name" \
    --arg created "$(date -Iseconds)" \
    > "$PROFILE_DIR/profile.json"

########################################
# Generate profile files
########################################
echo "[setup] Generating profile..."

selected_csv=$(IFS=','; echo "${selected_languages[*]}")

declare -A port_set
while IFS= read -r port; do
    port_set["$port"]=1
done < <(jq -r '.base.ports[]' "$PORTS_JSON")
for lang in "${selected_languages[@]}"; do
    while IFS= read -r port; do
        port_set["$port"]=1
    done < <(jq -r ".\"$lang\".default[]? // empty" "$PORTS_JSON")
done
# Addition ports
for addition in "${selected_additions[@]}"; do
    aport=$(jq -r ".\"$addition\".port // empty" "$ADDITIONS_JSON" 2>/dev/null)
    [ -n "$aport" ] && port_set["$aport"]=1
done

sorted_ports=($(printf '%s\n' "${!port_set[@]}" | sort -n))
ports_csv=$(IFS=','; echo "${sorted_ports[*]}")

versions_csv=""
for lang in "${selected_languages[@]}"; do
    ver="${version_overrides[$lang]:-}"
    if [ -n "$ver" ] && [ "$ver" != "system" ]; then
        [ -n "$versions_csv" ] && versions_csv+=","
        versions_csv+="${lang}:${ver}"
    fi
done

additions_csv=$(IFS=','; echo "${selected_additions[*]}")
vscode_ext_csv=$(IFS=','; echo "${selected_vscode_extensions[*]}")

# Build custom Dockerfile lines (newline-separated for env var)
custom_df_env=""
for line in "${custom_dockerfile_lines[@]}"; do
    [ -n "$custom_df_env" ] && custom_df_env+=$'\n'
    custom_df_env+="$line"
done

# Build custom startup command strings
custom_before_env=""
for cmd in "${custom_startup_before[@]}"; do
    [ -n "$custom_before_env" ] && custom_before_env+=$'\n'
    custom_before_env+="$cmd"
done
custom_after_env=""
for cmd in "${custom_startup_after[@]}"; do
    [ -n "$custom_after_env" ] && custom_after_env+=$'\n'
    custom_after_env+="$cmd"
done

selected_agents_csv=$(IFS=','; echo "${selected_agents[*]}")
SELECTED_AGENTS="$selected_agents_csv" \
PRIMARY_AGENT="${selected_agents[0]}" \
VSCODE_EXTENSIONS="$vscode_ext_csv" \
CUSTOM_DOCKERFILE_LINES="$custom_df_env" \
CUSTOM_STARTUP_BEFORE="$custom_before_env" \
CUSTOM_STARTUP_AFTER="$custom_after_env" \
"$SANDBOX_DIR/generate_profile.sh" "$SANDBOX_DIR" "$PROFILE_DIR" "$profile_name" "$selected_csv" "$ports_csv" "$versions_csv" "$additions_csv"

# Append custom npm packages and skills to Dockerfile
if [ ${#custom_plugins[@]} -gt 0 ]; then
    for pkg in "${custom_plugins[@]}"; do
        sed -i "/^ENTRYPOINT/i RUN npm install -g $pkg" "$PROFILE_DIR/Dockerfile.base"
    done
fi
if [ ${#selected_skills[@]} -gt 0 ]; then
    for skill in "${selected_skills[@]}"; do
        sed -i "/^ENTRYPOINT/i RUN claude skill install anthropics/skills --skill $skill || true" "$PROFILE_DIR/Dockerfile.base"
    done
fi

########################################
# Build Docker image
########################################
echo ""
echo "[setup] Building image (this may take a few minutes on first run)..."
docker build -t "agent-sandbox-${profile_name}:latest" \
    -f "$PROFILE_DIR/Dockerfile.base" "$PROFILE_DIR"

echo ""
echo "Done! Profile '$profile_name' is ready."
echo ""
echo "  Next steps:"
echo "    cd ~/your-project"
echo "    sandbox-me"

########################################
# Register aliases
########################################
ALIASES_FILE="$HOME/.bash_aliases"
touch "$ALIASES_FILE"
sed -i "/^alias sandbox-setup=/d" "$ALIASES_FILE"
echo "alias sandbox-setup='$SCRIPT_DIR/sandbox-setup.sh'" >> "$ALIASES_FILE"
sed -i "/^alias sandbox-me=/d" "$ALIASES_FILE"
echo "alias sandbox-me='$SCRIPT_DIR/sandbox-me.sh'" >> "$ALIASES_FILE"
