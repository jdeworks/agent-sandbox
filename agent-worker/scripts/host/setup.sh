#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SANDBOX_CMD="$SCRIPT_DIR/sandbox.sh"

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
# Shell alias
########################################
ALIASES_FILE="$HOME/.bash_aliases"

read -rp "Choose alias name [sandbox]: " alias_name
alias_name="${alias_name:-sandbox}"

alias_line="alias $alias_name='$SANDBOX_CMD'"

# Ensure .bash_aliases exists
touch "$ALIASES_FILE"

existing=$(grep "^alias ${alias_name}=" "$ALIASES_FILE" 2>/dev/null || true)

if [ -n "$existing" ]; then
    echo "[setup] Existing alias found in $ALIASES_FILE:"
    echo "  $existing"
    read -rp "Overwrite with new definition? [y/N] " overwrite
    if [[ "$overwrite" =~ ^[yY]$ ]]; then
        sed -i "/^alias ${alias_name}=/d" "$ALIASES_FILE"
        echo "$alias_line" >> "$ALIASES_FILE"
        echo "[setup] Alias '$alias_name' updated."
    else
        echo "[setup] Kept existing alias."
    fi
else
    read -rp "Add '$alias_name' alias to $ALIASES_FILE? [y/N] " add_alias
    if [[ "$add_alias" =~ ^[yY]$ ]]; then
        echo "$alias_line" >> "$ALIASES_FILE"
        echo "[setup] Alias '$alias_name' added to $ALIASES_FILE."
    else
        echo "[setup] Skipped. You can add it manually:"
        echo "  $alias_line"
    fi
fi

# Ensure .bashrc sources .bash_aliases
if [ -f "$HOME/.bashrc" ] && ! grep -q '\.bash_aliases' "$HOME/.bashrc" 2>/dev/null; then
    echo "" >> "$HOME/.bashrc"
    echo "# Load aliases" >> "$HOME/.bashrc"
    echo "[ -f ~/.bash_aliases ] && . ~/.bash_aliases" >> "$HOME/.bashrc"
    echo "[setup] Added .bash_aliases sourcing to .bashrc"
fi

echo ""
echo "[setup] Done. Run 'source ~/.bash_aliases' or open a new terminal."
echo "  $alias_name .              # sandbox current directory"
echo "  $alias_name /path/to/dir   # sandbox any directory"
