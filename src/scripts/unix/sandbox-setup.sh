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
        read -rp "Delete profile '$profile' and its Docker image? [y/N]: " confirm
        if [[ "$confirm" =~ ^[yY]$ ]]; then
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
    --help|-h)
        cat <<'HELP'
sandbox-setup — Create and manage sandbox profiles

Usage:
  sandbox-setup                          Interactive profile creation
  sandbox-setup --list                   List all profiles
  sandbox-setup --delete <name>          Delete a profile and its Docker image
  sandbox-setup --rebuild <name>         Rebuild a profile image (no cache)
  sandbox-setup --add-plugin <name> [pkg] Add an npm package to a profile

Examples:
  sandbox-setup                          # Create a new profile interactively
  sandbox-setup --add-plugin my-dev oh-my-openagent
  sandbox-setup --rebuild my-dev
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
while IFS='|' read -r key label; do
    agent_keys+=("$key")
    env_hint=""
    env_vars=$(jq -r ".\"$key\".env_vars[]? // empty" "$AGENTS_JSON")
    for ev in $env_vars; do
        [ -n "${!ev:-}" ] && { env_hint=" (credentials found)"; break; }
    done
    printf "  %d) %s%s\n" "${#agent_keys[@]}" "$label" "$env_hint"
done < <(jq -r 'to_entries | .[] | "\(.key)|\(.value.label)"' "$AGENTS_JSON")

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
        plugin_list+=("$pname")
        printf "  %d) %s — %s\n" "${#plugin_list[@]}" "$pname" "$desc"
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
langs_json_arr=$(printf '%s\n' "${selected_languages[@]}" | jq -R . | jq -s .)
mcp_json_arr=$(printf '%s\n' "${selected_mcp[@]}" | jq -R . | jq -s . 2>/dev/null || echo "[]")

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
    --argjson mcp_servers "$mcp_json_arr" \
    --argjson config_mirrors "$mirrors_json_obj" \
    '{
        name: $name,
        agents: $agents,
        plugins: $plugins,
        languages: $languages,
        versions: $versions,
        mcp_servers: $mcp_servers,
        config_mirrors: $config_mirrors,
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

"$SANDBOX_DIR/generate_profile.sh" "$SANDBOX_DIR" "$PROFILE_DIR" "$profile_name" "$selected_csv" "$ports_csv" "$versions_csv"

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
