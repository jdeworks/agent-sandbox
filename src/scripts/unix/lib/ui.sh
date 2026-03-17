#!/usr/bin/env bash
# ui.sh — Terminal UI helpers for agent-sandbox
# Extracted from: scattered across scripts
# Source this file; do not execute directly.

_UI_RED='\033[0;31m'
_UI_GREEN='\033[0;32m'
_UI_YELLOW='\033[1;33m'
_UI_BLUE='\033[0;34m'
_UI_NC='\033[0m'

ui_info() {
    echo -e "${_UI_BLUE}[sandbox]${_UI_NC} $*"
}

ui_warn() {
    echo -e "${_UI_YELLOW}[sandbox]${_UI_NC} $*"
}

ui_error() {
    echo -e "${_UI_RED}[sandbox]${_UI_NC} $*" >&2
}

ui_success() {
    echo -e "${_UI_GREEN}[sandbox]${_UI_NC} $*"
}

ui_select_multi() {
    local prompt="$1"
    shift
    local options=("$@")

    echo ""
    for i in "${!options[@]}"; do
        printf "  %d) %s\n" "$((i + 1))" "${options[$i]}"
    done
    echo ""
    read -rp "$prompt" _selection
    echo "$_selection"
}

ui_confirm() {
    local prompt="${1:-Continue?}"
    local default="${2:-Y}"
    local response
    read -rp "$prompt [$default]: " response
    response="${response:-$default}"
    [[ "$response" =~ ^[yY]$ ]]
}

ui_prompt() {
    local prompt="$1"
    local default="${2:-}"
    local response
    if [ -n "$default" ]; then
        read -rp "$prompt [$default]: " response
        echo "${response:-$default}"
    else
        read -rp "$prompt: " response
        echo "$response"
    fi
}
