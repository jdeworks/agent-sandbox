#!/usr/bin/env bash
# mcp.sh — MCP server configuration helpers
# Source this file; do not execute directly.

# Generate MCP config for Claude Code format
mcp_generate_claude_config() {
    local mcp_servers_json="$1"
    shift
    local servers=("$@")

    local config='{"mcpServers":{'
    local first=true
    for server in "${servers[@]}"; do
        local cmd args env_json
        cmd=$(jq -r ".\"$server\".command // \"\"" "$mcp_servers_json")
        [ -z "$cmd" ] && continue

        $first || config+=","
        first=false

        args=$(jq -c ".\"$server\".args // []" "$mcp_servers_json")
        env_json=$(jq -c ".\"$server\".env_vars // [] | map({(.): (\"${\" + . + \"}\")}) | add // {}" "$mcp_servers_json")

        config+="\"$server\":{\"command\":\"$cmd\",\"args\":$args"
        if [ "$env_json" != "{}" ] && [ "$env_json" != "null" ]; then
            config+=",\"env\":$env_json"
        fi
        config+="}"
    done
    config+="}}"
    echo "$config" | jq .
}

# Generate MCP config for OpenCode format
mcp_generate_opencode_config() {
    local mcp_servers_json="$1"
    shift
    local servers=("$@")

    local config='{"mcp":{"servers":{'
    local first=true
    for server in "${servers[@]}"; do
        local cmd args
        cmd=$(jq -r ".\"$server\".command // \"\"" "$mcp_servers_json")
        [ -z "$cmd" ] && continue

        $first || config+=","
        first=false

        args=$(jq -c ".\"$server\".args // []" "$mcp_servers_json")
        config+="\"$server\":{\"command\":\"$cmd\",\"args\":$args}"
    done
    config+="}}}"
    echo "$config" | jq .
}

# Generate MCP install commands for Dockerfile
mcp_generate_dockerfile_lines() {
    local mcp_servers_json="$1"
    shift
    local servers=("$@")

    for server in "${servers[@]}"; do
        local install_cmd
        install_cmd=$(jq -r ".\"$server\".install // \"\"" "$mcp_servers_json")
        [ -z "$install_cmd" ] && continue
        echo "RUN $install_cmd"
    done
}

# List available MCP servers compatible with given agents
mcp_list_compatible() {
    local mcp_servers_json="$1"
    shift
    local agents=("$@")

    jq -r 'to_entries[] | select(
        .value.compatible_agents as $compat |
        ($ARGS.positional | any(. as $agent | $compat | index($agent)))
    ) | "\(.key)\t\(.value.description)"' \
        "$mcp_servers_json" --jsonargs "${agents[@]}"
}
