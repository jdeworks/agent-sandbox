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

# Source shared libraries
source "$SCRIPT_DIR/lib/prereqs.sh"
source "$SCRIPT_DIR/lib/config.sh"
source "$SCRIPT_DIR/lib/ui.sh"
source "$SCRIPT_DIR/lib/detect.sh"

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
        if [ -z "$profile" ]; then
            echo "Usage: sandbox-setup --delete <profile-name>"
            exit 1
        fi
        target_dir="$SANDBOX_HOME/profiles/$profile"
        if [ ! -d "$target_dir" ]; then
            echo "[setup] Profile '$profile' not found."
            exit 1
        fi
        read -rp "Delete profile '$profile' and its Docker image? [y/N]: " confirm
        if [[ "$confirm" =~ ^[yY]$ ]]; then
            docker rmi "agent-sandbox/${profile}:latest" 2>/dev/null || true
            rm -rf "$target_dir"
            echo "[setup] Profile '$profile' deleted."
        fi
        exit 0
        ;;
    --rebuild)
        profile="${2:-}"
        if [ -z "$profile" ]; then
            echo "Usage: sandbox-setup --rebuild <profile-name>"
            exit 1
        fi
        target_dir="$SANDBOX_HOME/profiles/$profile"
        if [ ! -d "$target_dir" ]; then
            echo "[setup] Profile '$profile' not found."
            exit 1
        fi
        echo "[setup] Rebuilding profile '$profile' (no cache)..."
        echo "  This affects ALL projects using this profile."
        read -rp "Continue? [Y/n]: " confirm
        confirm="${confirm:-Y}"
        if [[ "$confirm" =~ ^[yY]$ ]]; then
            docker build --no-cache -t "agent-sandbox/${profile}:latest" \
                -f "$target_dir/Dockerfile.base" "$target_dir"
            echo "[setup] Profile '$profile' rebuilt."
        fi
        exit 0
        ;;
    --edit)
        profile="${2:-}"
        if [ -z "$profile" ]; then
            echo "Usage: sandbox-setup --edit <profile-name>"
            exit 1
        fi
        target_dir="$SANDBOX_HOME/profiles/$profile"
        if [ ! -d "$target_dir" ]; then
            echo "[setup] Profile '$profile' not found."
            exit 1
        fi
        echo "[setup] Edit is not yet implemented. Delete and recreate the profile."
        exit 0
        ;;
esac

########################################
# Prerequisites
########################################
echo ""
echo "Welcome to Agent Sandbox Setup!"
echo "This will create a base image with your selected tools."
echo ""

prereqs_check_all || {
    echo "[setup] Fix the missing prerequisites and re-run."
    exit 1
}

# Ensure SANDBOX_HOME structure
mkdir -p "$SANDBOX_HOME/profiles" "$SANDBOX_HOME/projects"

########################################
# Profile name
########################################
echo ""
while true; do
    read -rp "Profile name [a-z0-9-]: " profile_name
    if config_validate_profile_name "$profile_name"; then
        if [ -d "$SANDBOX_HOME/profiles/$profile_name" ]; then
            echo "[setup] Profile '$profile_name' already exists. Choose a different name."
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
echo "=== Agent Selection ==="
echo "Select coding agents to install:"

agent_keys=()
agent_labels=()
agent_selected=()

while IFS='|' read -r key label; do
    agent_keys+=("$key")
    agent_labels+=("$label")
    # Pre-check agents with found credentials
    env_vars=$(jq -r ".\"$key\".env_vars[]? // empty" "$AGENTS_JSON")
    found=""
    for ev in $env_vars; do
        if [ -n "${!ev:-}" ]; then
            found=" — $ev found"
            break
        fi
    done
    agent_selected+=("false")
    printf "  %d) %s%s\n" "${#agent_keys[@]}" "$label" "$found"
done < <(jq -r 'to_entries | .[] | "\(.key)|\(.value.label)"' "$AGENTS_JSON")

echo ""
read -rp "Select agents (comma-separated, e.g. 1,2): " agent_choice
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
    echo "[setup] No agents selected. At least one is required."
    rm -rf "$PROFILE_DIR"
    exit 1
fi
echo "  Selected: ${selected_agents[*]}"

########################################
# Plugin selection (conditional)
########################################
selected_plugins=()
for agent in "${selected_agents[@]}"; do
    agent_plugins=$(jq -r "to_entries[] | select(.value.agent == \"$agent\") | .key" "$PLUGINS_JSON" 2>/dev/null)
    if [ -n "$agent_plugins" ]; then
        echo ""
        echo "=== Plugin Selection (${agent}) ==="
        plugin_list=()
        while IFS= read -r pname; do
            [ -z "$pname" ] && continue
            desc=$(jq -r ".\"$pname\".description" "$PLUGINS_JSON")
            plugin_list+=("$pname")
            printf "  %d) %s — %s\n" "${#plugin_list[@]}" "$pname" "$desc"
        done <<< "$agent_plugins"
        echo ""
        read -rp "Select plugins (comma-separated, or Enter to skip): " plugin_choice
        if [ -n "$plugin_choice" ]; then
            IFS=',' read -ra pidx <<< "$plugin_choice"
            for pi in "${pidx[@]}"; do
                pi=$(echo "$pi" | tr -d ' ')
                arr_pi=$((pi - 1))
                if [ "$arr_pi" -ge 0 ] && [ "$arr_pi" -lt "${#plugin_list[@]}" ]; then
                    selected_plugins+=("${plugin_list[$arr_pi]}")
                fi
            done
        fi
    fi
done

########################################
# Language selection
########################################
echo ""
echo "=== Language Selection ==="
echo "Select languages to include (Node.js is always included):"

lang_keys=()
lang_labels=()
while IFS='|' read -r key label; do
    lang_keys+=("$key")
    lang_labels+=("$label")
    locked=""
    [ "$key" = "node" ] && locked=" [locked]"
    default_ver=$(jq -r ".\"$key\".default_version // \"system\"" "$LANGUAGES_JSON")
    size_warn=$(jq -r ".\"$key\".size_warning // empty" "$LANGUAGES_JSON" 2>/dev/null)
    warn=""
    [ -n "$size_warn" ] && warn=" — $size_warn"
    printf "  %d) %-20s (default: %s)%s%s\n" "${#lang_keys[@]}" "$label" "$default_ver" "$locked" "$warn"
done < <(jq -r 'to_entries | sort_by(.key) | .[] | "\(.key)|\(.value.label)"' "$LANGUAGES_JSON")

echo ""
read -rp "Select languages (comma-separated, e.g. 1,2): " lang_choice
IFS=',' read -ra lang_indices <<< "$lang_choice"
selected_languages=()
# Always include node
selected_languages+=("node")
for idx in "${lang_indices[@]}"; do
    idx=$(echo "$idx" | tr -d ' ')
    arr_idx=$((idx - 1))
    if [ "$arr_idx" -ge 0 ] && [ "$arr_idx" -lt "${#lang_keys[@]}" ]; then
        key="${lang_keys[$arr_idx]}"
        if [ "$key" != "node" ]; then
            selected_languages+=("$key")
        fi
    fi
done
# Deduplicate
selected_languages=($(printf '%s\n' "${selected_languages[@]}" | sort -u))
echo "  Selected: ${selected_languages[*]}"

# Version overrides
echo ""
declare -A version_overrides
for lang in "${selected_languages[@]}"; do
    default_ver=$(jq -r ".\"$lang\".default_version // \"system\"" "$LANGUAGES_JSON")
    read -rp "  $lang version [$default_ver]: " ver_input
    ver_input="${ver_input:-$default_ver}"
    version_overrides["$lang"]="$ver_input"
done

########################################
# MCP server selection
########################################
echo ""
echo "=== MCP Servers ==="
echo "Select MCP servers to include (can also be added later):"

mcp_keys=()
while IFS='|' read -r key desc; do
    mcp_keys+=("$key")
    printf "  %d) %-20s — %s\n" "${#mcp_keys[@]}" "$key" "$desc"
done < <(jq -r 'to_entries | .[] | "\(.key)|\(.value.description)"' "$MCP_SERVERS_JSON")

echo ""
read -rp "Select MCP servers (comma-separated, or Enter for none): " mcp_choice
selected_mcp=()
if [ -n "$mcp_choice" ]; then
    IFS=',' read -ra mcp_indices <<< "$mcp_choice"
    for idx in "${mcp_indices[@]}"; do
        idx=$(echo "$idx" | tr -d ' ')
        arr_idx=$((idx - 1))
        if [ "$arr_idx" -ge 0 ] && [ "$arr_idx" -lt "${#mcp_keys[@]}" ]; then
            selected_mcp+=("${mcp_keys[$arr_idx]}")
        fi
    done
fi

########################################
# Config mirroring (driven by config-mirrors.json)
########################################
echo ""
echo "=== Config Mirroring ==="
echo "Which host configs should be available inside the sandbox?"
echo ""
echo "  Strategy:"
echo "    bind-ro = read-only mount (host is source of truth)"
echo "    seed    = copied into container volume on first run (container can modify)"
echo ""

CONFIG_MIRRORS_JSON="$SANDBOX_DIR/config-mirrors.json"
selected_mirrors=()
mirror_keys=()
mirror_idx=1

# Build list of available mirrors (only show items that exist on host)
while IFS='|' read -r key label host_path strategy security recommended warning agents_filter; do
    # Expand ~ to $HOME
    expanded_path="${host_path/#\~/$HOME}"

    # Check if item exists on host
    detect_type=$(jq -r ".\"$key\".detect" "$CONFIG_MIRRORS_JSON")
    if [ "$detect_type" = "file" ] && [ ! -f "$expanded_path" ]; then continue; fi
    if [ "$detect_type" = "directory" ] && [ ! -d "$expanded_path" ]; then continue; fi

    # Filter by selected agents (if agents field is set)
    if [ "$agents_filter" != "null" ] && [ -n "$agents_filter" ]; then
        agent_match=false
        for sa in "${selected_agents[@]}"; do
            if echo "$agents_filter" | jq -e "index(\"$sa\")" >/dev/null 2>&1; then
                agent_match=true
                break
            fi
        done
        $agent_match || continue
    fi

    # Display
    marker=""
    [ "$recommended" = "true" ] && marker=" [recommended]"
    warn_text=""
    [ "$warning" != "null" ] && [ -n "$warning" ] && warn_text=" -- $warning"
    sec_text=""
    [ "$security" = "high" ] && sec_text=" [!]"

    printf "  %2d) %-22s %-8s %s%s%s\n" "$mirror_idx" "$label" "($strategy)" "$host_path" "$marker" "$sec_text"
    [ -n "$warn_text" ] && printf "      %s\n" "$warn_text"
    mirror_keys+=("$key")
    ((mirror_idx++))
done < <(jq -r 'to_entries[] | select(.key != "_doc" and .key != "_strategies") | "\(.key)|\(.value.label)|\(.value.host_path)|\(.value.strategy)|\(.value.security)|\(.value.recommended)|\(.value.warning // "null")|\(.value.agents // "null")"' "$CONFIG_MIRRORS_JSON")

if [ ${#mirror_keys[@]} -gt 0 ]; then
    echo ""
    read -rp "Select (comma-separated, or Enter to skip): " mirror_choice
    if [ -n "$mirror_choice" ]; then
        IFS=',' read -ra midx <<< "$mirror_choice"
        for mi in "${midx[@]}"; do
            mi=$(echo "$mi" | tr -d ' ')
            arr_mi=$((mi - 1))
            if [ "$arr_mi" -ge 0 ] && [ "$arr_mi" -lt "${#mirror_keys[@]}" ]; then
                selected_mirrors+=("${mirror_keys[$arr_mi]}")
            fi
        done
    fi
else
    echo "  (no mirrorable configs found on this host)"
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
[ ${#selected_mcp[@]} -gt 0 ] && echo "  MCP:        ${selected_mcp[*]}" || echo "  MCP:        none"
[ ${#selected_mirrors[@]} -gt 0 ] && echo "  Mirroring:  ${selected_mirrors[*]}" || echo "  Mirroring:  none"
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
# Build mirrors object with full config (strategy, paths)
mirrors_json_obj="{}"
for mkey in "${selected_mirrors[@]}"; do
    mirror_entry=$(jq ".\"$mkey\" | {strategy, host_path, container_path}" "$CONFIG_MIRRORS_JSON")
    mirrors_json_obj=$(echo "$mirrors_json_obj" | jq --arg k "$mkey" --argjson v "$mirror_entry" '.[$k] = $v')
done

# Build versions object
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
# Generate profile files using generate_profile.sh
########################################
echo "[setup] Generating profile files..."

selected_csv=$(IFS=','; echo "${selected_languages[*]}")

# Compute ports: base + language defaults + framework defaults
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

# Build versions CSV
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
echo "[setup] Building base image agent-sandbox/${profile_name}:latest ..."
docker build -t "agent-sandbox/${profile_name}:latest" \
    -f "$PROFILE_DIR/Dockerfile.base" "$PROFILE_DIR"

echo ""
echo "Profile '$profile_name' ready."
echo "  Use it with: sandbox-me (from any project directory)"

########################################
# Register aliases
########################################
ALIASES_FILE="$HOME/.bash_aliases"
touch "$ALIASES_FILE"

# sandbox-setup alias
setup_alias="alias sandbox-setup='$SCRIPT_DIR/sandbox-setup.sh'"
sed -i "/^alias sandbox-setup=/d" "$ALIASES_FILE"
echo "$setup_alias" >> "$ALIASES_FILE"

# sandbox-me alias
me_alias="alias sandbox-me='$SCRIPT_DIR/sandbox-me.sh'"
sed -i "/^alias sandbox-me=/d" "$ALIASES_FILE"
echo "$me_alias" >> "$ALIASES_FILE"

echo ""
echo "  Run 'source ~/.bash_aliases' or open a new terminal."
