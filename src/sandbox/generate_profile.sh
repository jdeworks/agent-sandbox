#!/usr/bin/env bash
set -e

# Usage: generate_profile.sh <sandbox_dir> <profile_dir> <profile_name> <lang1,lang2,...> [ports] [versions] [additions]
# versions format: python:3.11,node:20,java:17
# additions format: vscode-server,another-addon

if [ $# -lt 4 ]; then
    echo "Usage: $0 <sandbox_dir> <profile_dir> <profile_name> <languages> [ports] [versions] [additions]"
    exit 1
fi

SANDBOX_DIR="$1"
PROFILE_DIR="$2"
PROFILE_NAME="$3"
IFS=',' read -ra SELECTED <<< "$4"
IFS=',' read -ra PORTS <<< "${5:-}"

LANGUAGES_JSON="$SANDBOX_DIR/languages.json"
ADDITIONS_JSON="$SANDBOX_DIR/additions.json"
AGENTS_JSON="$SANDBOX_DIR/agents.json"
FRAGMENTS_DIR="$SANDBOX_DIR/fragments/languages"
ADDITIONS_FRAGMENTS_DIR="$SANDBOX_DIR/fragments/additions"

# Parse additions and sort by priority
IFS=',' read -ra RAW_ADDITIONS <<< "${7:-}"
ADDITIONS=()
if [ ${#RAW_ADDITIONS[@]} -gt 0 ]; then
    sorted=$(for a in "${RAW_ADDITIONS[@]}"; do
        [ -z "$a" ] && continue
        p=$(jq -r ".\"$a\".priority // 50" "$ADDITIONS_JSON" 2>/dev/null)
        echo "$p $a"
    done | sort -n | awk '{print $2}')
    while IFS= read -r a; do
        [ -n "$a" ] && ADDITIONS+=("$a")
    done <<< "$sorted"
fi

# Parse version overrides into an associative array
declare -A VERSIONS
if [ -n "${6:-}" ]; then
    IFS=',' read -ra ver_pairs <<< "$6"
    for pair in "${ver_pairs[@]}"; do
        lang_key="${pair%%:*}"
        lang_ver="${pair#*:}"
        VERSIONS["$lang_key"]="$lang_ver"
    done
fi

for lang in "${SELECTED[@]}"; do
    if ! jq -e ".\"$lang\"" "$LANGUAGES_JSON" >/dev/null 2>&1; then
        available=$(jq -r 'keys | join(", ")' "$LANGUAGES_JSON")
        echo "Error: unknown language '$lang'. Available: $available"
        exit 1
    fi
done

# Resolve version for a language: override > default
resolve_version() {
    local lang="$1"
    if [ -n "${VERSIONS[$lang]:-}" ]; then
        echo "${VERSIONS[$lang]}"
    else
        jq -r ".\"$lang\".default_version // \"\"" "$LANGUAGES_JSON"
    fi
}

# Get the Node version (from overrides or default)
NODE_VERSION="${VERSIONS[node]:-$(jq -r '.node.default_version // "20"' "$LANGUAGES_JSON")}"

mkdir -p "$PROFILE_DIR"

########################################
# Generate Dockerfile.base
########################################
generate_dockerfile() {
    # Build agent Dockerfile layers (only selected agents)
    local agent_layers=""
    IFS=',' read -ra AGENTS_LIST <<< "${SELECTED_AGENTS:-opencode}"
    for agent in "${AGENTS_LIST[@]}"; do
        [ -z "$agent" ] && continue
        local alines
        alines=$(jq -r ".\"$agent\".dockerfile[]? // empty" "$AGENTS_JSON" 2>/dev/null)
        if [ -n "$alines" ]; then
            [ -n "$agent_layers" ] && agent_layers+=$'\n\n'
            agent_layers+="$alines"
        fi
        # Agent-specific plugin install (e.g. oh-my-openagent for opencode)
        local plugin_install
        plugin_install=$(jq -r ".\"$agent\".plugin_install // empty" "$AGENTS_JSON" 2>/dev/null)
        if [ -n "$plugin_install" ]; then
            agent_layers+=$'\n\n'"$plugin_install"
        fi
    done

    local layers=""
    for lang in "${SELECTED[@]}"; do
        local version
        version=$(resolve_version "$lang")
        local use_versioned=false

        # Use version_dockerfile if: version is set, != "system", != default, and version_dockerfile exists
        if [ -n "$version" ] && [ "$version" != "system" ]; then
            local default_ver
            default_ver=$(jq -r ".\"$lang\".default_version // \"\"" "$LANGUAGES_JSON")
            if [ "$version" != "$default_ver" ] && jq -e ".\"$lang\".version_dockerfile" "$LANGUAGES_JSON" >/dev/null 2>&1; then
                use_versioned=true
            fi
        fi

        local lines
        if $use_versioned; then
            lines=$(jq -r ".\"$lang\".version_dockerfile[]? // empty" "$LANGUAGES_JSON")
        else
            lines=$(jq -r ".\"$lang\".dockerfile[]? // empty" "$LANGUAGES_JSON")
        fi

        if [ -n "$lines" ]; then
            # Substitute {{VERSION}} with the resolved version
            lines="${lines//\{\{VERSION\}\}/$version}"
            [ -n "$layers" ] && layers+=$'\n\n'
            layers+="$lines"
        fi
    done

    # Build addition Dockerfile layers
    local addition_layers=""
    for addition in "${ADDITIONS[@]}"; do
        [ -z "$addition" ] && continue
        if jq -e ".\"$addition\"" "$ADDITIONS_JSON" >/dev/null 2>&1; then
            local alines
            alines=$(jq -r ".\"$addition\".dockerfile[]? // empty" "$ADDITIONS_JSON")
            if [ -n "$alines" ]; then
                [ -n "$addition_layers" ] && addition_layers+=$'\n\n'
                addition_layers+="$alines"
            fi

            # VS Code extensions: always + language-specific + optional
            if [ "$addition" = "vscode-server" ] && jq -e ".\"$addition\".extensions" "$ADDITIONS_JSON" >/dev/null 2>&1; then
                local ext_ids=()

                # Always-installed extensions
                while IFS= read -r eid; do
                    [ -n "$eid" ] && ext_ids+=("$eid")
                done < <(jq -r ".\"$addition\".extensions.always // {} | keys[]" "$ADDITIONS_JSON" 2>/dev/null)

                # Language-specific extensions
                for lang in "${SELECTED[@]}"; do
                    while IFS= read -r eid; do
                        [ -n "$eid" ] && ext_ids+=("$eid")
                    done < <(jq -r ".\"$addition\".extensions.languages.\"$lang\"[]?.id // empty" "$ADDITIONS_JSON" 2>/dev/null)
                done

                # Optional extensions from VSCODE_EXTENSIONS env (comma-separated)
                if [ -n "${VSCODE_EXTENSIONS:-}" ]; then
                    IFS=',' read -ra opt_exts <<< "$VSCODE_EXTENSIONS"
                    for eid in "${opt_exts[@]}"; do
                        [ -n "$eid" ] && ext_ids+=("$eid")
                    done
                fi

                # Deduplicate
                local unique_exts=()
                declare -A seen_exts
                for eid in "${ext_ids[@]}"; do
                    if [ -z "${seen_exts[$eid]:-}" ]; then
                        unique_exts+=("$eid")
                        seen_exts["$eid"]=1
                    fi
                done

                if [ ${#unique_exts[@]} -gt 0 ]; then
                    addition_layers+=$'\n\n# VS Code extensions\nRUN code-server'
                    for eid in "${unique_exts[@]}"; do
                        addition_layers+=" --install-extension $eid"
                    done
                fi
            fi
        fi
    done

    # Custom Dockerfile lines from CUSTOM_DOCKERFILE_LINES env (newline-separated)
    local custom_docker_lines="${CUSTOM_DOCKERFILE_LINES:-}"

    local agent_marker="# {{AGENT_LAYERS}}"
    local marker="# {{LANGUAGE_LAYERS}}"
    local addition_marker="# {{ADDITION_LAYERS}}"
    local custom_marker="# {{CUSTOM_DOCKERFILE_LINES}}"
    local template
    template=$(<"$SANDBOX_DIR/Dockerfile.base.tpl")
    template="${template//\{\{NODE_VERSION\}\}/$NODE_VERSION}"
    template="${template//"$agent_marker"/$agent_layers}"
    template="${template//"$marker"/$layers}"
    template="${template//"$addition_marker"/$addition_layers}"
    echo "${template//"$custom_marker"/$custom_docker_lines}" > "$PROFILE_DIR/Dockerfile.base"
}

########################################
# Generate docker-compose.yml.tpl
########################################
generate_compose() {
    local path_parts=()
    local vol_mounts=""
    local vol_defs=""
    local env_lines=""

    for lang in "${SELECTED[@]}"; do
        local pp
        pp=$(jq -r ".\"$lang\".path_prepend // empty" "$LANGUAGES_JSON")
        [ -n "$pp" ] && path_parts+=("$pp")

        local vol_keys
        vol_keys=$(jq -r ".\"$lang\".volumes // {} | keys[]" "$LANGUAGES_JSON")
        while IFS= read -r vname; do
            [ -z "$vname" ] && continue
            local mpath
            mpath=$(jq -r ".\"$lang\".volumes.\"$vname\"" "$LANGUAGES_JSON")
            vol_mounts+=$'\n'"      - asb_${vname}:${mpath}"
            vol_defs+="  asb_${vname}:"$'\n'
        done <<< "$vol_keys"

        # Add version env vars (skip node — handled separately as base image version)
        if [ "$lang" != "node" ]; then
            local version
            version=$(resolve_version "$lang")
            if [ -n "$version" ] && [ "$version" != "system" ] && [ "$version" != "" ]; then
                local upper_lang
                upper_lang=$(echo "$lang" | tr '[:lower:]' '[:upper:]')
                env_lines+="      - ${upper_lang}_VERSION=${version}"$'\n'
            fi
        fi
    done

    env_lines+="      - NODE_VERSION=${NODE_VERSION}"$'\n'

    # Addition volumes and env vars
    for addition in "${ADDITIONS[@]}"; do
        [ -z "$addition" ] && continue
        if jq -e ".\"$addition\"" "$ADDITIONS_JSON" >/dev/null 2>&1; then
            local avol_keys
            avol_keys=$(jq -r ".\"$addition\".volumes // {} | keys[]" "$ADDITIONS_JSON" 2>/dev/null)
            while IFS= read -r avname; do
                [ -z "$avname" ] && continue
                local ampath
                ampath=$(jq -r ".\"$addition\".volumes.\"$avname\"" "$ADDITIONS_JSON")
                vol_mounts+=$'\n'"      - asb_${avname}:${ampath}"
                vol_defs+="  asb_${avname}:"$'\n'
            done <<< "$avol_keys"
        fi
    done

    path_parts+=("/root/.local/bin:/root/.cursor/bin:/root/.claude/bin:/root/.npm-global/bin:/opt/opencode/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin")
    local path_env
    path_env=$(IFS=':'; echo "${path_parts[*]}")

    local port_lines=""
    for port in "${PORTS[@]}"; do
        [ -z "$port" ] && continue
        port_lines+="      - \"${port}:${port}\""$'\n'
    done
    port_lines="${port_lines%$'\n'}"

    cat > "$PROFILE_DIR/docker-compose.yml.tpl" <<YAML
services:
  agent:
    build: .
    container_name: sandbox-{{PROJECT_NAME}}
    working_dir: /workspace/src
    environment:
      - HOME=/workspace
      - PATH=${path_env}
      - HOST_UID={{HOST_UID}}
      - HOST_GID={{HOST_GID}}
${env_lines}    volumes:
      - {{WORKSPACE_PATH}}:/workspace/src${vol_mounts}
      - ./opencode_data:/workspace/.config/opencode
      - ./opencode_sessions:/workspace/.local/share/opencode
      - ./logs:/workspace/.local/share/opencode/log
      - asb_agent_config_{{PROJECT_NAME}}:/workspace/.agent-config
      - asb_agent_data_{{PROJECT_NAME}}:/workspace/.agent-data
      - asb_sandbox_data_{{PROJECT_NAME}}:/workspace/.sandbox-vol
      - asb_opencode_cache_{{PROJECT_NAME}}:/workspace/.cache/opencode
      - ./sandbox_data:/workspace/.sandbox
    ports:
${port_lines}
    env_file:
      - ./runtime.env
      - ./user.env
    stdin_open: true
    tty: true
    security_opt:
      - no-new-privileges:true

volumes:
${vol_defs}  asb_agent_config_{{PROJECT_NAME}}:
  asb_agent_data_{{PROJECT_NAME}}:
  asb_sandbox_data_{{PROJECT_NAME}}:
  asb_opencode_cache_{{PROJECT_NAME}}:
YAML
}

########################################
# Generate install.sh
########################################
generate_install() {
    cat > "$PROFILE_DIR/install.sh" <<'HEADER'
#!/usr/bin/env bash
set -e

########################################
# Ensure OpenCode cache dir exists
########################################
mkdir -p /workspace/.cache/opencode

[ -d /workspace/.cache ] && chmod -R a+rwX /workspace/.cache
[ -d /workspace/.config ] && chmod -R a+rwX /workspace/.config
[ -d /workspace/.npm ] && chmod -R a+rwX /workspace/.npm

########################################
# Ensure CLI agent symlinks exist
########################################
for bin in agent claude; do
  if [ ! -x "/usr/local/bin/$bin" ] || head -1 "/usr/local/bin/$bin" 2>/dev/null | grep -q '^#!/bin/bash'; then
    for dir in /root/.local/bin /root/.cursor/bin /root/.claude/bin; do
      if [ -x "$dir/$bin" ]; then ln -sf "$dir/$bin" "/usr/local/bin/$bin"; break; fi
    done
  fi
done
export PATH="/root/.local/bin:$PATH"

HEADER

    for lang in "${SELECTED[@]}"; do
        local frag="$FRAGMENTS_DIR/${lang}.sh"
        if [ -f "$frag" ]; then
            cat "$frag" >> "$PROFILE_DIR/install.sh"
            echo "" >> "$PROFILE_DIR/install.sh"
        fi
    done

    # Additions fragments (e.g. vscode-server)
    for addition in "${ADDITIONS[@]}"; do
        [ -z "$addition" ] && continue
        local afrag_name
        afrag_name=$(jq -r ".\"$addition\".fragment // empty" "$ADDITIONS_JSON" 2>/dev/null)
        if [ -n "$afrag_name" ] && [ -f "$ADDITIONS_FRAGMENTS_DIR/$afrag_name" ]; then
            cat "$ADDITIONS_FRAGMENTS_DIR/$afrag_name" >> "$PROFILE_DIR/install.sh"
            echo "" >> "$PROFILE_DIR/install.sh"
        fi
    done

    # Resolve primary agent command
    local agent_cmd="opencode"
    local agent_args=""
    if [ -n "${PRIMARY_AGENT:-}" ] && jq -e ".\"$PRIMARY_AGENT\"" "$AGENTS_JSON" >/dev/null 2>&1; then
        agent_cmd=$(jq -r ".\"$PRIMARY_AGENT\".command" "$AGENTS_JSON")
        agent_args=$(jq -r ".\"$PRIMARY_AGENT\".args // [] | join(\" \")" "$AGENTS_JSON")
    fi
    local full_cmd="$agent_cmd"
    [ -n "$agent_args" ] && full_cmd="$agent_cmd $agent_args"

    # Write ready marker
    cat >> "$PROFILE_DIR/install.sh" <<'READY'
echo "[sandbox] Ready."
touch /tmp/.sandbox-ready
READY

    # Custom startup before commands (written literally to avoid escaping issues)
    if [ -n "${CUSTOM_STARTUP_BEFORE:-}" ]; then
        echo "# Custom pre-agent startup commands" >> "$PROFILE_DIR/install.sh"
        printf '%s\n' "${CUSTOM_STARTUP_BEFORE}" >> "$PROFILE_DIR/install.sh"
    fi

    # Custom startup after commands (background)
    if [ -n "${CUSTOM_STARTUP_AFTER:-}" ]; then
        echo "# Custom background startup commands" >> "$PROFILE_DIR/install.sh"
        printf '%s\n' "${CUSTOM_STARTUP_AFTER}" >> "$PROFILE_DIR/install.sh"
    fi

    # Generate install-vscode.sh: same setup but no agent exec (VS Code only mode)
    cp "$PROFILE_DIR/install.sh" "$PROFILE_DIR/install-vscode.sh"
    cat >> "$PROFILE_DIR/install-vscode.sh" <<'VSCODE_ONLY'
echo "[sandbox] VS Code Server mode — agent skipped."
exec tail -f /dev/null
VSCODE_ONLY
    chmod +x "$PROFILE_DIR/install-vscode.sh"

    # Agent exec (uses quoted heredoc + sed to inject the resolved command)
    cat >> "$PROFILE_DIR/install.sh" <<'EXEC'
if [ -n "${HOST_UID:-}" ] && [ -n "${HOST_GID:-}" ]; then
  run_as_user=dev
  if getent passwd "$HOST_UID" >/dev/null 2>&1; then
    run_as_user=$(getent passwd "$HOST_UID" | cut -d: -f1)
  else
    groupadd -g "$HOST_GID" dev 2>/dev/null || true
    useradd -u "$HOST_UID" -g "$HOST_GID" -m -s /bin/bash dev 2>/dev/null || true
  fi
  chown -R "$HOST_UID:$HOST_GID" /workspace
  exec runuser -u "$run_as_user" -- __AGENT_CMD__
fi
exec __AGENT_CMD__
EXEC
    # Replace placeholder with actual agent command
    sed -i "s|__AGENT_CMD__|$full_cmd|g" "$PROFILE_DIR/install.sh"

    chmod +x "$PROFILE_DIR/install.sh"
}

########################################
# Generate AGENTS.md
########################################
generate_agents_md() {
    cp "$SANDBOX_DIR/instructions.base.md" "$PROFILE_DIR/AGENTS.md"
    cp "$SANDBOX_DIR/socratic.md" "$PROFILE_DIR/socratic.md"

    for lang in "${SELECTED[@]}"; do
        local frag="$FRAGMENTS_DIR/${lang}.agents.md"
        if [ -f "$frag" ]; then
            cat "$frag" >> "$PROFILE_DIR/AGENTS.md"
        fi
    done

    # Additions agent instructions
    for addition in "${ADDITIONS[@]}"; do
        [ -z "$addition" ] && continue
        local amd_name
        amd_name=$(jq -r ".\"$addition\".agents_md // empty" "$ADDITIONS_JSON" 2>/dev/null)
        if [ -n "$amd_name" ] && [ -f "$ADDITIONS_FRAGMENTS_DIR/$amd_name" ]; then
            cat "$ADDITIONS_FRAGMENTS_DIR/$amd_name" >> "$PROFILE_DIR/AGENTS.md"
        fi
    done

    if [ ${#PORTS[@]} -gt 0 ] && [ -n "${PORTS[0]}" ]; then
        local port_list="${PORTS[0]}"
        if [ ${#PORTS[@]} -gt 1 ]; then
            port_list+=$(printf ', %s' "${PORTS[@]:1}")
        fi
        cat >> "$PROFILE_DIR/AGENTS.md" <<EOF

## Available Ports

The following ports are published to the host: ${port_list}. Use one of these for your dev server so it is reachable at \`http://localhost:<port>\` on the host.
EOF
    fi
}

########################################
# Generate sandbox wrapper
########################################
generate_wrapper() {
    cat > "$PROFILE_DIR/sandbox.sh" <<WRAPPER
#!/usr/bin/env bash
# Auto-generated sandbox wrapper for profile: $PROFILE_NAME
SCRIPT_DIR="\$(cd "\$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
export SANDBOX_PROFILE_DIR="\$SCRIPT_DIR"
export SANDBOX_PROFILE_NAME="$PROFILE_NAME"
exec "\$(cd "\$SCRIPT_DIR/../../scripts/unix" && pwd)/sandbox.sh" "\$@"
WRAPPER

    chmod +x "$PROFILE_DIR/sandbox.sh"
}

########################################
# Write versions.env for reference
########################################
generate_versions_env() {
    {
        echo "# Auto-generated version pins for profile: $PROFILE_NAME"
        echo "NODE_VERSION=$NODE_VERSION"
        for lang in "${SELECTED[@]}"; do
            local version
            version=$(resolve_version "$lang")
            [ -n "$version" ] && echo "${lang^^}_VERSION=$version"
        done
    } > "$PROFILE_DIR/versions.env"
}

########################################
# Run
########################################
generate_dockerfile
generate_compose
generate_install
generate_agents_md
generate_wrapper
generate_versions_env

echo "Profile '$PROFILE_NAME' generated in $PROFILE_DIR"
