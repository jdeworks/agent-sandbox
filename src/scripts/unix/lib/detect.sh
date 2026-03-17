#!/usr/bin/env bash
# detect.sh — Language, version, and port detection helpers
# Extracted from: prepare.sh
# Source this file; do not execute directly.

detect_languages() {
    local scan_path="$1"
    local languages_json="$2"
    local -n _detected_langs="$3"  # nameref to caller's array

    while IFS='|' read -r key label; do
        local found=false
        while IFS= read -r pattern; do
            if find "$scan_path" -maxdepth 3 -name "$pattern" \
                -not -path '*/node_modules/*' -not -path '*/.venv/*' -not -path '*/target/*' \
                -print -quit 2>/dev/null | grep -q .; then
                found=true
                break
            fi
        done < <(jq -r ".\"$key\".detect[]" "$languages_json")
        if $found; then
            _detected_langs+=("$key")
        fi
    done < <(jq -r 'to_entries | sort_by(.key) | .[] | "\(.key)|\(.value.label)"' "$languages_json")
}

detect_version() {
    local lang="$1"
    local scan_path="$2"
    local languages_json="$3"

    local detect_count
    detect_count=$(jq -r ".\"$lang\".version_detect | length" "$languages_json")
    [ "$detect_count" -gt 0 ] || return 1

    for idx in $(seq 0 $((detect_count - 1))); do
        local vd_file vd_regex
        vd_file=$(jq -r ".\"$lang\".version_detect[$idx].file" "$languages_json")
        vd_regex=$(jq -r ".\"$lang\".version_detect[$idx].regex" "$languages_json")

        local targets
        targets=$(find "$scan_path" -maxdepth 3 -name "$vd_file" \
            -not -path '*/node_modules/*' -not -path '*/.venv/*' -not -path '*/target/*' 2>/dev/null)

        while IFS= read -r target; do
            [ -z "$target" ] && continue
            local ver
            ver=$(detect_version_from_file "$target" "$vd_regex") && echo "$ver" && return 0
        done <<< "$targets"
    done
    return 1
}

detect_system_version() {
    local lang="$1"
    local ver=""
    case "$lang" in
        python)  ver=$(python3 --version 2>/dev/null | grep -oP '[0-9]+\.[0-9]+' | head -1) ;;
        node)    ver=$(node --version 2>/dev/null | grep -oP '[0-9]+' | head -1) ;;
        go)      ver=$(go version 2>/dev/null | grep -oP '[0-9]+\.[0-9]+' | head -1) ;;
        ruby)    ver=$(ruby --version 2>/dev/null | grep -oP '[0-9]+\.[0-9]+' | head -1) ;;
        php)     ver=$(php --version 2>/dev/null | grep -oP '[0-9]+\.[0-9]+' | head -1) ;;
        rust)    ver=$(rustc --version 2>/dev/null | grep -oP '[0-9]+\.[0-9]+\.[0-9]+' | head -1) ;;
        java)    ver=$(java --version 2>&1 | grep -oP '[0-9]+(\.[0-9]+)*' | head -1) ;;
        kotlin)  ver=$(java --version 2>&1 | grep -oP '[0-9]+(\.[0-9]+)*' | head -1) ;;
        dotnet)  ver=$(dotnet --version 2>/dev/null | grep -oP '[0-9]+\.[0-9]+' | head -1) ;;
        dart)    ver=$(dart --version 2>/dev/null | grep -oP '[0-9]+\.[0-9]+' | head -1) ;;
        cpp)     ver=$(gcc --version 2>/dev/null | head -1 | grep -oP '[0-9]+\.[0-9]+' | tail -1) ;;
    esac
    [ -n "$ver" ] && echo "$ver"
}

detect_version_from_file() {
    local file_path="$1" regex="$2"
    [ -f "$file_path" ] || return 1
    local match
    match=$(grep -oP "$regex" "$file_path" 2>/dev/null | head -1)
    if [ -n "$match" ]; then
        local ver
        ver=$(echo "$match" | grep -oP '[0-9]+(\.[0-9]+)*' | head -1)
        [ -n "$ver" ] && echo "$ver" && return 0
    fi
    return 1
}

detect_ports() {
    local scan_path="$1"
    local ports_json="$2"
    shift 2
    local selected_keys=("$@")
    local -A port_set

    # Always include base ports
    while IFS= read -r port; do
        port_set["$port"]=1
    done < <(jq -r '.base.ports[]' "$ports_json")

    # Add default ports for each selected language
    for lang in "${selected_keys[@]}"; do
        while IFS= read -r port; do
            port_set["$port"]=1
        done < <(jq -r ".\"$lang\".default[]? // empty" "$ports_json")
    done

    printf '%s\n' "${!port_set[@]}" | sort -n
}

detect_frameworks() {
    local scan_path="$1"
    local ports_json="$2"
    shift 2
    local detect_langs=("$@")

    # Always include node in framework detection
    if ! printf '%s\n' "${detect_langs[@]}" | grep -qx "node"; then
        detect_langs+=("node")
    fi

    for lang in "${detect_langs[@]}"; do
        local fw_names
        fw_names=$(jq -r ".\"$lang\".frameworks // {} | keys[]" "$ports_json" 2>/dev/null)
        while IFS= read -r fw; do
            [ -z "$fw" ] && continue
            local detect_file
            detect_file=$(jq -r ".\"$lang\".frameworks.\"$fw\".detect_in" "$ports_json")
            local targets
            targets=$(find "$scan_path" -maxdepth 3 -name "$detect_file" \
                -not -path '*/node_modules/*' -not -path '*/.venv/*' -not -path '*/target/*' 2>/dev/null)
            [ -z "$targets" ] && continue

            local patterns
            patterns=$(jq -r ".\"$lang\".frameworks.\"$fw\".patterns[]" "$ports_json")
            while IFS= read -r target; do
                [ -z "$target" ] && continue
                while IFS= read -r pat; do
                    if grep -q "$pat" "$target" 2>/dev/null; then
                        echo "$fw"
                        break 2
                    fi
                done <<< "$patterns"
            done <<< "$targets"
        done <<< "$fw_names"
    done
}
