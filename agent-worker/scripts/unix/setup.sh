#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
PREPARE_CMD="$SCRIPT_DIR/prepare.sh"
SANDBOX_DIR="$REPO_DIR/sandbox"
PREPARED_DIR="$REPO_DIR/prepared"
LANGUAGES_JSON="$SANDBOX_DIR/languages.json"
PORTS_JSON="$SANDBOX_DIR/ports.json"
ALIASES_FILE="$HOME/.bash_aliases"

echo "=== Agent Sandbox Setup ==="
echo ""

########################################
# Check Docker
########################################
if command -v docker &>/dev/null; then
    docker_version=$(docker --version)
    echo "[setup] Docker found: $docker_version"
else
    echo "[setup] Docker is not installed."
    read -rp "Install Docker now? [y/N] " install_docker
    if [[ "$install_docker" =~ ^[yY]$ ]]; then
        echo "[setup] Installing Docker via get.docker.com..."
        curl -fsSL https://get.docker.com | sh
        echo "[setup] Docker installed. You may need to log out and back in for group permissions."
        echo "[setup] Adding current user to docker group..."
        sudo usermod -aG docker "$USER" 2>/dev/null || true
    else
        echo "[setup] Docker is required. Please install it manually and re-run setup."
        exit 1
    fi
fi

# Verify docker compose plugin
if docker compose version &>/dev/null; then
    compose_version=$(docker compose version --short)
    echo "[setup] Docker Compose found: $compose_version"
else
    echo "[setup] Docker Compose plugin not found."
    echo "[setup] Please install it: https://docs.docker.com/compose/install/"
    exit 1
fi

echo ""

########################################
# Check jq (needed by prepare)
########################################
if command -v jq &>/dev/null; then
    echo "[setup] jq found: $(jq --version)"
else
    echo "[setup] Warning: jq not found. It is required by 'prepare'."
    echo "[setup] Install it with: sudo apt install -y jq"
fi

echo ""

########################################
# Show existing sandbox aliases
########################################
touch "$ALIASES_FILE"
existing_sandbox_aliases=$(grep '^alias sandbox-' "$ALIASES_FILE" 2>/dev/null || true)
existing_prepare=$(grep '^alias prepare=' "$ALIASES_FILE" 2>/dev/null || true)

if [ -n "$existing_sandbox_aliases" ] || [ -n "$existing_prepare" ]; then
    echo "[setup] Existing agent-sandbox aliases found:"
    [ -n "$existing_prepare" ] && echo "  $existing_prepare"
    while IFS= read -r line; do
        [ -n "$line" ] && echo "  $line"
    done <<< "$existing_sandbox_aliases"
    echo ""
fi

########################################
# Core aliases: prepare + helpers
########################################
add_alias() {
    local name="$1" cmd="$2"
    local line="alias $name='$cmd'"
    sed -i "/^alias ${name}=/d" "$ALIASES_FILE"
    echo "$line" >> "$ALIASES_FILE"
}

echo "[setup] Setting up core aliases..."

add_alias "prepare" "$PREPARE_CMD"
echo "  prepare          -> prepare a sandbox profile"

add_alias "sandbox-list" "$SCRIPT_DIR/sandbox-list.sh"
echo "  sandbox-list     -> list all sandboxed projects"

add_alias "sandbox-stats" "$SCRIPT_DIR/sandbox-stats.sh"
echo "  sandbox-stats    -> show disk usage"

add_alias "sandbox-cleanup" "$SCRIPT_DIR/sandbox-cleanup.sh"
echo "  sandbox-cleanup  -> remove projects and volumes"

echo ""

########################################
# Ensure .bashrc sources .bash_aliases
########################################
if [ -f "$HOME/.bashrc" ] && ! grep -q '\.bash_aliases' "$HOME/.bashrc" 2>/dev/null; then
    echo "" >> "$HOME/.bashrc"
    echo "# Load aliases" >> "$HOME/.bashrc"
    echo "[ -f ~/.bash_aliases ] && . ~/.bash_aliases" >> "$HOME/.bashrc"
    echo "[setup] Added .bash_aliases sourcing to .bashrc"
fi

########################################
# Default profiles
########################################
if ! command -v jq &>/dev/null; then
    echo "[setup] Skipping default profiles (jq not installed)."
    echo ""
    echo "[setup] Done. Run 'source ~/.bash_aliases' or open a new terminal."
    exit 0
fi

echo "[setup] Default profiles let you sandbox projects immediately without"
echo "  running 'prepare' first. Each creates a sandbox-<lang> alias."
echo ""
echo "  Available:"

lang_keys=()
lang_labels=()
while IFS='|' read -r key label; do
    lang_keys+=("$key")
    lang_labels+=("$label")
done < <(jq -r 'to_entries | sort_by(.key) | .[] | "\(.key)|\(.value.label)"' "$LANGUAGES_JSON")

for i in "${!lang_keys[@]}"; do
    key="${lang_keys[$i]}"
    existing=""
    if [ -d "$PREPARED_DIR/$key" ]; then
        existing=" [already exists]"
    fi
    printf "    %2d) %-20s -> sandbox-%s%s\n" "$((i + 1))" "${lang_labels[$i]}" "$key" "$existing"
done

echo ""
read -rp "  Create profiles (comma-separated, e.g. 1,2,3) or Enter to skip: " profile_selection

if [ -n "$profile_selection" ]; then
    IFS=',' read -ra indices <<< "$profile_selection"

    for idx in "${indices[@]}"; do
        idx=$(echo "$idx" | tr -d ' ')
        arr_idx=$((idx - 1))
        if [ "$arr_idx" -lt 0 ] || [ "$arr_idx" -ge "${#lang_keys[@]}" ]; then
            echo "  [setup] Warning: invalid selection '$idx', skipping."
            continue
        fi

        key="${lang_keys[$arr_idx]}"
        label="${lang_labels[$arr_idx]}"
        profile_dir="$PREPARED_DIR/$key"

        if [ -d "$profile_dir" ]; then
            echo "  [setup] Profile '$key' already exists, skipping."
            add_alias "sandbox-$key" "$profile_dir/sandbox.sh"
            continue
        fi

        # Compute default ports: base + language defaults
        base_ports=$(jq -r '.base.ports[]' "$PORTS_JSON" 2>/dev/null | tr '\n' ',' | sed 's/,$//')
        lang_ports=$(jq -r ".\"$key\".default[]? // empty" "$PORTS_JSON" 2>/dev/null | tr '\n' ',' | sed 's/,$//')
        if [ -n "$lang_ports" ]; then
            all_ports="${base_ports},${lang_ports}"
        else
            all_ports="$base_ports"
        fi
        # Deduplicate and sort
        all_ports=$(echo "$all_ports" | tr ',' '\n' | sort -un | tr '\n' ',' | sed 's/,$//')

        echo "  [setup] Creating profile '$key' (${label})..."
        "$SANDBOX_DIR/generate_profile.sh" "$SANDBOX_DIR" "$profile_dir" "$key" "$key" "$all_ports" "" >/dev/null

        add_alias "sandbox-$key" "$profile_dir/sandbox.sh"
        echo "    -> sandbox-$key ready"
    done
    echo ""
fi

########################################
# Summary
########################################
echo "[setup] Done. Run 'source ~/.bash_aliases' or open a new terminal."
echo ""
echo "  Quick start:"
# Show sandbox aliases that were created
while IFS= read -r line; do
    [ -z "$line" ] && continue
    alias_name=$(echo "$line" | sed "s/^alias \([^=]*\)=.*/\1/")
    case "$alias_name" in
        sandbox-list|sandbox-stats|sandbox-cleanup|prepare) continue ;;
        sandbox-*) echo "    $alias_name /path/to/project" ;;
    esac
done < <(grep '^alias sandbox-' "$ALIASES_FILE" 2>/dev/null)

echo ""
echo "  Or use 'prepare' to create a custom multi-language profile."
