#!/bin/bash
########################################
# CLI Agent Configuration
########################################

# Sync authentication files from host to container
# These are mounted volumes from the host

# Claude Code auth
if [ -f "/workspace/.sandbox/claude-auth.json" ]; then
    mkdir -p ~/.claude
    cp /workspace/.sandbox/claude-auth.json ~/.claude/auth.json 2>/dev/null || true
fi

# Cursor CLI auth
if [ -f "/workspace/.sandbox/cursor-config.json" ]; then
    mkdir -p ~/.cursor
    cp /workspace/.sandbox/cursor-config.json ~/.cursor/config.json 2>/dev/null || true
fi

# GitHub Copilot auth
if [ -f "/workspace/.sandbox/copilot-config.json" ]; then
    mkdir -p ~/.copilot
    cp /workspace/.sandbox/copilot-config.json ~/.copilot/config.json 2>/dev/null || true
fi

# Ensure agents are in PATH (if not already)
export PATH="$HOME/.local/bin:$HOME/.claude/bin:$HOME/.cursor/bin:$HOME/.npm-global/bin:$PATH"

echo "[sandbox] CLI agents configured."
