#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$SCRIPT_DIR/AgentSandbox"
OUTPUT_DIR="$SCRIPT_DIR/dist"

IMAGE="mcr.microsoft.com/dotnet/sdk:8.0"

echo "=== Building agent-sandbox.exe (via Docker) ==="
echo ""

if ! command -v docker &>/dev/null; then
    echo "Error: Docker is required."
    exit 1
fi

mkdir -p "$OUTPUT_DIR"

echo "[build] Using $IMAGE"
echo "[build] Source: $PROJECT_DIR"
echo "[build] Output: $OUTPUT_DIR/agent-sandbox.exe"
echo ""

# Cross-compile from Linux to win-x64. The .NET SDK pulls the Windows
# Desktop targeting pack (WinForms) from NuGet automatically.
docker run --rm \
    -v "$PROJECT_DIR":/src \
    -v "$OUTPUT_DIR":/out \
    -w /src \
    "$IMAGE" \
    bash -c 'dotnet publish -c Release -r win-x64 --self-contained true -o /out -p:PublishSingleFile=true -p:EnableWindowsTargeting=true'

if [ -f "$OUTPUT_DIR/agent-sandbox.exe" ]; then
    size=$(du -h "$OUTPUT_DIR/agent-sandbox.exe" | cut -f1)
    echo ""
    echo "[build] Done: $OUTPUT_DIR/agent-sandbox.exe ($size)"
else
    echo ""
    echo "[build] Error: agent-sandbox.exe not found in output."
    exit 1
fi
