#!/usr/bin/env bash
set -e

# Usage: generate_profile.sh <sandbox_dir> <profile_dir> <profile_name> <lang1,lang2,...> [ports] [versions]
# versions format: python:3.11,node:20,java:17

if [ $# -lt 4 ]; then
    echo "Usage: $0 <sandbox_dir> <profile_dir> <profile_name> <languages> [ports] [versions]"
    exit 1
fi

SANDBOX_DIR="$1"
PROFILE_DIR="$2"
PROFILE_NAME="$3"
IFS=',' read -ra SELECTED <<< "$4"
IFS=',' read -ra PORTS <<< "${5:-}"

LANGUAGES_JSON="$SANDBOX_DIR/languages.json"
FRAGMENTS_DIR="$SANDBOX_DIR/fragments"

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

    local marker="# {{LANGUAGE_LAYERS}}"
    local template
    template=$(<"$SANDBOX_DIR/Dockerfile.base.tpl")
    template="${template//\{\{NODE_VERSION\}\}/$NODE_VERSION}"
    echo "${template//"$marker"/$layers}" > "$PROFILE_DIR/Dockerfile.base"
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
            vol_mounts+=$'\n'"      - ${vname}:${mpath}"
            vol_defs+="  ${vname}:"$'\n'
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
      - opencode_cache_{{PROJECT_NAME}}:/workspace/.cache/opencode
      - ./sandbox_data:/workspace/.sandbox
    ports:
${port_lines}
    env_file:
      - ./runtime.env
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

    cat >> "$PROFILE_DIR/install.sh" <<'FOOTER'
echo "[sandbox] Ready."
touch /tmp/.sandbox-ready
if [ -n "${HOST_UID:-}" ] && [ -n "${HOST_GID:-}" ]; then
  run_as_user=dev
  if getent passwd "$HOST_UID" >/dev/null 2>&1; then
    run_as_user=$(getent passwd "$HOST_UID" | cut -d: -f1)
  else
    groupadd -g "$HOST_GID" dev 2>/dev/null || true
    useradd -u "$HOST_UID" -g "$HOST_GID" -m -s /bin/bash dev 2>/dev/null || true
  fi
  chown -R "$HOST_UID:$HOST_GID" /workspace
  exec runuser -u "$run_as_user" -- opencode
fi
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
