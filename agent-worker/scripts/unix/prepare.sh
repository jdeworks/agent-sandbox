#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
SANDBOX_DIR="$REPO_DIR/sandbox"
PREPARED_DIR="$REPO_DIR/prepared"
LANGUAGES_JSON="$SANDBOX_DIR/languages.json"
PORTS_JSON="$SANDBOX_DIR/ports.json"

echo "=== Sandbox Environment Preparation ==="
echo ""

if ! command -v jq &>/dev/null; then
    echo "[prepare] Error: jq is required but not found."
    echo "  Install it with: sudo apt install -y jq"
    exit 1
fi

########################################
# Read available languages from JSON
########################################
lang_keys=()
lang_labels=()
while IFS='|' read -r key label; do
    lang_keys+=("$key")
    lang_labels+=("$label")
done < <(jq -r 'to_entries | sort_by(.key) | .[] | "\(.key)|\(.value.label)"' "$LANGUAGES_JSON")

########################################
# Choose: auto-detect or manual
########################################
echo "How would you like to configure languages?"
echo "  1) Auto-detect from a project directory"
echo "  2) Manual selection"
echo ""
read -rp "Choice [1]: " mode_choice
mode_choice="${mode_choice:-1}"

selected_keys=()
scan_path=""

if [ "$mode_choice" = "1" ]; then
    ########################################
    # Auto-detect languages
    ########################################
    read -rp "Path to scan [.]: " scan_path
    scan_path="${scan_path:-.}"
    scan_path="$(cd "$scan_path" && pwd)"

    echo ""
    echo "[prepare] Scanning $scan_path..."

    detected=()
    for i in "${!lang_keys[@]}"; do
        key="${lang_keys[$i]}"
        label="${lang_labels[$i]}"

        found=false
        while IFS= read -r pattern; do
            if find "$scan_path" -maxdepth 3 -name "$pattern" -not -path '*/node_modules/*' -not -path '*/.venv/*' -not -path '*/target/*' -print -quit 2>/dev/null | grep -q .; then
                found=true
                break
            fi
        done < <(jq -r ".\"$key\".detect[]" "$LANGUAGES_JSON")

        if $found; then
            detected+=("$key")
            echo "  Detected: $label ($key)"
        fi
    done

    if [ ${#detected[@]} -eq 0 ]; then
        echo "  No languages detected. Falling back to manual selection."
        mode_choice="2"
    else
        echo ""
        read -rp "Proceed with detected languages? [Y/n]: " confirm
        confirm="${confirm:-Y}"
        if [[ "$confirm" =~ ^[yY]$ ]]; then
            selected_keys=("${detected[@]}")
        else
            mode_choice="2"
        fi
    fi
fi

if [ "$mode_choice" = "2" ]; then
    ########################################
    # Manual language selection
    ########################################
    echo ""
    echo "Available languages:"
    for i in "${!lang_keys[@]}"; do
        echo "  $((i + 1))) ${lang_labels[$i]}"
    done
    echo ""
    read -rp "Select languages (comma-separated, e.g. 1,2): " selection

    IFS=',' read -ra indices <<< "$selection"
    for idx in "${indices[@]}"; do
        idx=$(echo "$idx" | tr -d ' ')
        arr_idx=$((idx - 1))
        if [ "$arr_idx" -ge 0 ] && [ "$arr_idx" -lt "${#lang_keys[@]}" ]; then
            selected_keys+=("${lang_keys[$arr_idx]}")
        else
            echo "[prepare] Warning: invalid selection '$idx', skipping."
        fi
    done
fi

if [ ${#selected_keys[@]} -eq 0 ]; then
    echo "[prepare] No languages selected. Aborting."
    exit 1
fi

########################################
# Version detection
########################################
echo ""
echo "[prepare] Detecting versions..."

declare -A detected_versions

detect_version_from_file() {
    local file_path="$1" regex="$2"
    [ -f "$file_path" ] || return 1
    local match
    match=$(grep -oP "$regex" "$file_path" 2>/dev/null | head -1)
    # grep -oP returns the full match; if there's a capture group we need the last group
    # Use a secondary extraction for the actual version number
    if [ -n "$match" ]; then
        local ver
        ver=$(echo "$match" | grep -oP '[0-9]+(\.[0-9]+)*' | head -1)
        [ -n "$ver" ] && echo "$ver" && return 0
    fi
    return 1
}

for lang in "${selected_keys[@]}"; do
    local_version=""
    detect_count=$(jq -r ".\"$lang\".version_detect | length" "$LANGUAGES_JSON")

    if [ "$detect_count" -gt 0 ] && [ -n "$scan_path" ] && [ -d "$scan_path" ]; then
        for idx in $(seq 0 $((detect_count - 1))); do
            vd_file=$(jq -r ".\"$lang\".version_detect[$idx].file" "$LANGUAGES_JSON")
            vd_regex=$(jq -r ".\"$lang\".version_detect[$idx].regex" "$LANGUAGES_JSON")

            # Search recursively for the file
            targets=$(find "$scan_path" -maxdepth 3 -name "$vd_file" \
                -not -path '*/node_modules/*' -not -path '*/.venv/*' -not -path '*/target/*' 2>/dev/null)

            while IFS= read -r target; do
                [ -z "$target" ] && continue
                local_version=$(detect_version_from_file "$target" "$vd_regex") && break 2
            done <<< "$targets"
        done
    fi

    default_ver=$(jq -r ".\"$lang\".default_version // \"\"" "$LANGUAGES_JSON")

    if [ -n "$local_version" ]; then
        detected_versions["$lang"]="$local_version"
        echo "  $lang: $local_version (detected)"
    elif [ -n "$default_ver" ] && [ "$default_ver" != "system" ]; then
        detected_versions["$lang"]="$default_ver"
        echo "  $lang: $default_ver (default)"
    else
        echo "  $lang: system default"
    fi
done

echo ""
read -rp "Override any versions? (e.g. python:3.11,java:17) or Enter to accept: " ver_override
if [ -n "$ver_override" ]; then
    IFS=',' read -ra overrides <<< "$ver_override"
    for pair in "${overrides[@]}"; do
        pair=$(echo "$pair" | tr -d ' ')
        o_lang="${pair%%:*}"
        o_ver="${pair#*:}"
        if [ -n "$o_lang" ] && [ -n "$o_ver" ]; then
            detected_versions["$o_lang"]="$o_ver"
            echo "  $o_lang: $o_ver (manual override)"
        fi
    done
fi

########################################
# Smart port detection
########################################
echo ""
echo "[prepare] Detecting ports..."

declare -A port_set

# Always include base ports
while IFS= read -r port; do
    port_set["$port"]=1
done < <(jq -r '.base.ports[]' "$PORTS_JSON")

# Add default ports for each selected language
for lang in "${selected_keys[@]}"; do
    while IFS= read -r port; do
        port_set["$port"]=1
    done < <(jq -r ".\"$lang\".default[]? // empty" "$PORTS_JSON")
done

# Framework detection: scan project files recursively if we have a path
detected_frameworks=()
if [ -n "$scan_path" ] && [ -d "$scan_path" ]; then
    for lang in "${selected_keys[@]}"; do
        fw_names=$(jq -r ".\"$lang\".frameworks // {} | keys[]" "$PORTS_JSON" 2>/dev/null)
        while IFS= read -r fw; do
            [ -z "$fw" ] && continue
            detect_file=$(jq -r ".\"$lang\".frameworks.\"$fw\".detect_in" "$PORTS_JSON")

            targets=$(find "$scan_path" -maxdepth 3 -name "$detect_file" \
                -not -path '*/node_modules/*' -not -path '*/.venv/*' -not -path '*/target/*' 2>/dev/null)
            [ -z "$targets" ] && continue

            fw_found=false
            patterns=$(jq -r ".\"$lang\".frameworks.\"$fw\".patterns[]" "$PORTS_JSON")
            while IFS= read -r target; do
                [ -z "$target" ] && continue
                while IFS= read -r pat; do
                    if grep -q "$pat" "$target" 2>/dev/null; then
                        fw_found=true
                        break 2
                    fi
                done <<< "$patterns"
            done <<< "$targets"

            if $fw_found; then
                detected_frameworks+=("$fw")
                while IFS= read -r port; do
                    port_set["$port"]=1
                done < <(jq -r ".\"$lang\".frameworks.\"$fw\".ports[]" "$PORTS_JSON")
            fi
        done <<< "$fw_names"
    done
fi

# Sort ports numerically
sorted_ports=($(printf '%s\n' "${!port_set[@]}" | sort -n))

if [ ${#detected_frameworks[@]} -gt 0 ]; then
    echo "  Frameworks detected: ${detected_frameworks[*]}"
fi
echo "  Ports: ${sorted_ports[*]}"
echo ""
read -rp "Add extra ports (comma-separated) or Enter to accept: " extra_ports

if [ -n "$extra_ports" ]; then
    IFS=',' read -ra extras <<< "$extra_ports"
    for port in "${extras[@]}"; do
        port=$(echo "$port" | tr -d ' ')
        [[ "$port" =~ ^[0-9]+$ ]] && port_set["$port"]=1
    done
    sorted_ports=($(printf '%s\n' "${!port_set[@]}" | sort -n))
    echo "  Final ports: ${sorted_ports[*]}"
fi

########################################
# Profile name
########################################
default_name=$(IFS='-'; echo "${selected_keys[*]}")

echo ""
echo "Selected: ${selected_keys[*]}"
read -rp "Profile name [$default_name]: " profile_name
profile_name="${profile_name:-$default_name}"

profile_dir="$PREPARED_DIR/$profile_name"

if [ -d "$profile_dir" ]; then
    echo ""
    echo "[prepare] Profile '$profile_name' already exists at $profile_dir."
    read -rp "Overwrite? [y/N]: " overwrite
    if [[ ! "$overwrite" =~ ^[yY]$ ]]; then
        echo "[prepare] Aborted."
        exit 0
    fi
    rm -rf "$profile_dir"
fi

########################################
# Generate profile
########################################
echo ""
echo "[prepare] Generating profile '$profile_name'..."

selected_csv=$(IFS=','; echo "${selected_keys[*]}")
ports_csv=$(IFS=','; echo "${sorted_ports[*]}")

# Build versions CSV (lang:ver,lang:ver,...)
versions_csv=""
for lang in "${selected_keys[@]}"; do
    ver="${detected_versions[$lang]:-}"
    if [ -n "$ver" ]; then
        [ -n "$versions_csv" ] && versions_csv+=","
        versions_csv+="${lang}:${ver}"
    fi
done

"$SANDBOX_DIR/generate_profile.sh" "$SANDBOX_DIR" "$profile_dir" "$profile_name" "$selected_csv" "$ports_csv" "$versions_csv"

echo "  Dockerfile.base"
echo "  docker-compose.yml.tpl"
echo "  install.sh"
echo "  AGENTS.md"
echo "  sandbox.sh"
echo "  versions.env"

########################################
# Create alias
########################################
ALIASES_FILE="$HOME/.bash_aliases"
alias_name="sandbox-$profile_name"
alias_line="alias $alias_name='$profile_dir/sandbox.sh'"

echo ""
touch "$ALIASES_FILE"
existing=$(grep "^alias ${alias_name}=" "$ALIASES_FILE" 2>/dev/null || true)

if [ -n "$existing" ]; then
    echo "[prepare] Updating existing alias '$alias_name'."
    sed -i "/^alias ${alias_name}=/d" "$ALIASES_FILE"
fi

read -rp "Add alias '$alias_name' to $ALIASES_FILE? [Y/n]: " add_alias
add_alias="${add_alias:-Y}"
if [[ "$add_alias" =~ ^[yY]$ ]]; then
    echo "$alias_line" >> "$ALIASES_FILE"
    echo "[prepare] Alias '$alias_name' added."
else
    echo "[prepare] Skipped. You can run it directly:"
    echo "  $profile_dir/sandbox.sh /path/to/project"
fi

echo ""
echo "[prepare] Done. Run 'source ~/.bash_aliases' or open a new terminal."
echo "  $alias_name /path/to/project"
