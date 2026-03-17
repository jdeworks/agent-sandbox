#!/usr/bin/env bash
# prereqs.sh — Prerequisite checks for agent-sandbox
# Extracted from: setup.sh
# Source this file; do not execute directly.

prereqs_check_docker() {
    if command -v docker &>/dev/null; then
        echo "[prereqs] Docker found: $(docker --version)"
        return 0
    fi
    echo "[prereqs] Docker is not installed."
    return 1
}

prereqs_check_compose() {
    if docker compose version &>/dev/null; then
        echo "[prereqs] Docker Compose found: $(docker compose version --short)"
        return 0
    fi
    echo "[prereqs] Docker Compose plugin not found."
    return 1
}

prereqs_check_jq() {
    if command -v jq &>/dev/null; then
        echo "[prereqs] jq found: $(jq --version)"
        return 0
    fi
    echo "[prereqs] jq not found. Install with: sudo apt install -y jq"
    return 1
}

prereqs_init_sandbox_home() {
    local sandbox_home="${1:-$HOME/.agent-sandbox}"
    mkdir -p "$sandbox_home"
    echo "[prereqs] Sandbox home: $sandbox_home"
}

prereqs_check_all() {
    local ok=true
    prereqs_check_docker || ok=false
    prereqs_check_compose || ok=false
    prereqs_check_jq || ok=false
    if $ok; then
        echo "[prereqs] All prerequisites satisfied."
        return 0
    fi
    echo "[prereqs] Some prerequisites are missing."
    return 1
}
