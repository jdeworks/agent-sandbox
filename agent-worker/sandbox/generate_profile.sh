#!/usr/bin/env bash
set -e

# Usage: generate_profile.sh <sandbox_dir> <profile_dir> <profile_name> <lang1,lang2,...> <port1,port2,...>

if [ $# -lt 4 ]; then
    echo "Usage: $0 <sandbox_dir> <profile_dir> <profile_name> <languages> [ports]"
    exit 1
fi

SANDBOX_DIR="$1"
PROFILE_DIR="$2"
PROFILE_NAME="$3"
IFS=',' read -ra SELECTED <<< "$4"
IFS=',' read -ra PORTS <<< "${5:-}"

LANGUAGES_JSON="$SANDBOX_DIR/languages.json"
FRAGMENTS_DIR="$SANDBOX_DIR/fragments"

for lang in "${SELECTED[@]}"; do
    if ! jq -e ".\"$lang\"" "$LANGUAGES_JSON" >/dev/null 2>&1; then
        available=$(jq -r 'keys | join(", ")' "$LANGUAGES_JSON")
        echo "Error: unknown language '$lang'. Available: $available"
        exit 1
    fi
done

mkdir -p "$PROFILE_DIR"

########################################
# Generate Dockerfile.base
########################################
generate_dockerfile() {
    local layers=""
    for lang in "${SELECTED[@]}"; do
        local lines
        lines=$(jq -r ".\"$lang\".dockerfile[]? // empty" "$LANGUAGES_JSON")
        if [ -n "$lines" ]; then
            [ -n "$layers" ] && layers+=$'\n\n'
            layers+="$lines"
        fi
    done

    local marker="# {{LANGUAGE_LAYERS}}"
    local template
    template=$(<"$SANDBOX_DIR/Dockerfile.base.tpl")
    echo "${template//"$marker"/$layers}" > "$PROFILE_DIR/Dockerfile.base"
}

########################################
# Generate docker-compose.yml.tpl
########################################
generate_compose() {
    local path_parts=()
    local vol_mounts=""
    local vol_defs=""

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
            vol_mounts+=$'\n'"      - ${vname}:${mpath}"
            vol_defs+="  ${vname}:"$'\n'
        done <<< "$vol_keys"
    done

    path_parts+=("/opt/opencode/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin")
    local path_env
    path_env=$(IFS=':'; echo "${path_parts[*]}")

    # Build port lines
    local port_lines=""
    for port in "${PORTS[@]}"; do
        [ -z "$port" ] && continue
        port_lines+="      - \"${port}:${port}\""$'\n'
    done
    # Remove trailing newline
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
    volumes:
      - {{WORKSPACE_PATH}}:/workspace/src${vol_mounts}
      - ./opencode_data:/workspace/.config/opencode
      - ./opencode_sessions:/workspace/.local/share/opencode
      - ./logs:/workspace/.local/share/opencode/log
      - opencode_cache_{{PROJECT_NAME}}:/workspace/.cache/opencode
      - ./sandbox_data:/workspace/.sandbox
      - ./tmp:/tmp
    ports:
${port_lines}
    stdin_open: true
    tty: true
    security_opt:
      - no-new-privileges:true

volumes:
${vol_defs}  opencode_cache_{{PROJECT_NAME}}:
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

HEADER

    for lang in "${SELECTED[@]}"; do
        local frag="$FRAGMENTS_DIR/${lang}.sh"
        if [ -f "$frag" ]; then
            cat "$frag" >> "$PROFILE_DIR/install.sh"
            echo "" >> "$PROFILE_DIR/install.sh"
        fi
    done

    cat >> "$PROFILE_DIR/install.sh" <<'FOOTER'
echo "[sandbox] Ready."
exec opencode
FOOTER

    chmod +x "$PROFILE_DIR/install.sh"
}

########################################
# Generate AGENTS.md
########################################
generate_agents_md() {
    cp "$SANDBOX_DIR/AGENTS.md.base" "$PROFILE_DIR/AGENTS.md"

    for lang in "${SELECTED[@]}"; do
        local frag="$FRAGMENTS_DIR/${lang}.agents.md"
        if [ -f "$frag" ]; then
            cat "$frag" >> "$PROFILE_DIR/AGENTS.md"
        fi
    done

    # Append available ports section
    if [ ${#PORTS[@]} -gt 0 ]; then
        local port_list
        port_list=$(printf '%s' "${PORTS[0]}"; printf ', %s' "${PORTS[@]:1}")
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
exec "\$(cd "\$SCRIPT_DIR/../../scripts/host" && pwd)/sandbox.sh" "\$@"
WRAPPER

    chmod +x "$PROFILE_DIR/sandbox.sh"
}

########################################
# Run
########################################
generate_dockerfile
generate_compose
generate_install
generate_agents_md
generate_wrapper

echo "Profile '$PROFILE_NAME' generated in $PROFILE_DIR"
