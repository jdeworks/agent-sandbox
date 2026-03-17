#!/usr/bin/env bash
# config.sh — Configuration helpers for agent-sandbox
# Extracted from: prepare.sh, sandbox.sh
# Source this file; do not execute directly.

config_validate_profile_name() {
    local name="$1"
    if [[ ${#name} -lt 2 ]]; then
        echo "[config] Profile name must be at least 2 characters."
        return 1
    fi
    if [[ ${#name} -gt 50 ]]; then
        echo "[config] Profile name must be 50 characters or less."
        return 1
    fi
    if [[ ! "$name" =~ ^[a-z0-9]([a-z0-9-]*[a-z0-9])?$ ]]; then
        echo "[config] Invalid profile name '$name'. Use lowercase alphanumeric and hyphens, cannot start/end with hyphen."
        return 1
    fi
    if [[ "$name" =~ "--" ]]; then
        echo "[config] Profile name cannot contain consecutive hyphens."
        return 1
    fi
    local reserved=("sandbox-setup" "sandbox-me" "sandbox" "help" "version" "list" "update" "setup")
    for r in "${reserved[@]}"; do
        if [[ "$name" == "$r" ]]; then
            echo "[config] '$name' is a reserved name."
            return 1
        fi
    done
    return 0
}

config_find_project_root() {
    local dir="$PWD"
    local max_up=2
    local count=0
    while [[ "$count" -lt "$max_up" ]]; do
        [[ -f "$dir/.sandbox" ]] && echo "$dir" && return 0
        [[ -d "$dir/.git" ]] && echo "$dir" && return 0
        dir="$(dirname "$dir")"
        ((count++))
    done
    echo "$PWD"
}

config_derive_project_name() {
    local project_root="$1"
    local sandbox_home="${2:-$HOME/.agent-sandbox}"
    local base_name
    base_name="$(basename "$project_root" | tr '[:upper:]' '[:lower:]' | tr -cd 'a-z0-9-')"

    local existing_config="$sandbox_home/projects/$base_name/config.env"
    if [[ -f "$existing_config" ]]; then
        local existing_path
        existing_path=$(grep '^WORKSPACE_PATH=' "$existing_config" | cut -d= -f2-)
        if [[ "$existing_path" == "$project_root" ]]; then
            echo "$base_name"
            return 0
        fi
        local hash
        hash=$(echo "$project_root" | md5sum | cut -c1-6)
        echo "${base_name}-${hash}"
        return 0
    fi
    echo "$base_name"
}

config_profile_read() {
    local profile_dir="$1"
    local key="$2"
    local versions_env="$profile_dir/versions.env"
    [ -f "$versions_env" ] || return 1
    grep "^${key}=" "$versions_env" | cut -d= -f2-
}

config_profile_write() {
    local profile_dir="$1"
    local key="$2"
    local value="$3"
    local versions_env="$profile_dir/versions.env"
    if grep -q "^${key}=" "$versions_env" 2>/dev/null; then
        sed -i "s|^${key}=.*|${key}=${value}|" "$versions_env"
    else
        echo "${key}=${value}" >> "$versions_env"
    fi
}

config_derive_project_name() {
    local workspace_path="$1"
    basename "$workspace_path"
}

config_project_read() {
    local project_dir="$1"
    local key="$2"
    local config_env="$project_dir/config.env"
    [ -f "$config_env" ] || return 1
    grep "^${key}=" "$config_env" | cut -d= -f2-
}

config_project_write() {
    local project_dir="$1"
    local key="$2"
    local value="$3"
    local config_env="$project_dir/config.env"
    if grep -q "^${key}=" "$config_env" 2>/dev/null; then
        sed -i "s|^${key}=.*|${key}=${value}|" "$config_env"
    else
        echo "${key}=${value}" >> "$config_env"
    fi
}
