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
# Node: install project dependencies
########################################
if [ -f "/workspace/src/package.json" ]; then
    current_md5=$(md5sum /workspace/src/package.json | awk '{print $1}')
    stored_md5=""
    [ -f /workspace/src/node_modules/.package.md5 ] && stored_md5=$(cat /workspace/src/node_modules/.package.md5)
    if [ "$current_md5" != "$stored_md5" ]; then
        echo "[sandbox] Installing Node dependencies..."
        (cd /workspace/src && npm install --silent)
        echo "$current_md5" > /workspace/src/node_modules/.package.md5
    else
        echo "[sandbox] Node dependencies up to date."
    fi
fi

########################################
# Python: create and use venv
########################################
if [ ! -d "/workspace/.venv/bin" ]; then
    echo "[sandbox] Creating Python venv..."
    python3 -m venv /workspace/.venv
fi

[ -d /workspace/.venv ] && chmod -R a+rwX /workspace/.venv

source /workspace/.venv/bin/activate

if [ -f "/workspace/src/requirements.txt" ]; then
    current_md5=$(md5sum /workspace/src/requirements.txt | awk '{print $1}')
    stored_md5=""
    [ -f /workspace/.venv/.requirements.md5 ] && stored_md5=$(cat /workspace/.venv/.requirements.md5)
    if [ "$current_md5" != "$stored_md5" ]; then
        echo "[sandbox] Installing Python dependencies..."
        pip install --upgrade pip -q
        pip install -r /workspace/src/requirements.txt -q
        echo "$current_md5" > /workspace/.venv/.requirements.md5
    else
        echo "[sandbox] Python dependencies up to date."
    fi
fi

[ -f /workspace/.bashrc ] || touch /workspace/.bashrc
grep -qF .venv/bin/activate /workspace/.bashrc 2>/dev/null || echo "source /workspace/.venv/bin/activate" >> /workspace/.bashrc
export PATH="/workspace/.venv/bin:$PATH"

echo "[sandbox] Ready."
exec opencode
