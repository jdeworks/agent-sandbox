#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$SCRIPT_DIR/AgentSandbox"
OUTPUT_DIR="$SCRIPT_DIR/dist"

IMAGE="mcr.microsoft.com/dotnet/sdk:8.0"
NUGET_CACHE="agent-sandbox-nuget-cache"

usage() {
    echo "Usage: $(basename "$0") [--check]"
    echo ""
    echo "  (no args)   Build agent-sandbox.exe (cross-compile via Docker)"
    echo "  --check     Compile-check only (fast, no exe output)"
    echo ""
    echo "Requires Docker. The .NET SDK runs inside a container so no"
    echo "local .NET installation is needed."
    exit 0
}

case "${1:-}" in
    -h|--help) usage ;;
esac

if ! command -v docker &>/dev/null; then
    echo "Error: Docker is required."
    exit 1
fi

# Persistent NuGet cache volume avoids re-downloading packages every run
docker volume create "$NUGET_CACHE" >/dev/null 2>&1 || true

if [ "${1:-}" = "--check" ]; then
    echo "=== Compile check (via Docker) ==="
    echo ""
    echo "[build] Using $IMAGE"
    echo "[build] Source: $PROJECT_DIR"
    echo ""

    docker run --rm \
        -v "$PROJECT_DIR":/src:ro \
        -v "$NUGET_CACHE":/root/.nuget \
        "$IMAGE" \
        bash -c 'cp -r /src /build && cd /build && dotnet build -c Release --nologo -p:EnableWindowsTargeting=true -warnaserror 2>&1'

    echo ""
    echo "[build] Compile check passed."
    exit 0
fi

echo "=== Building agent-sandbox.exe (via Docker) ==="
echo ""

mkdir -p "$OUTPUT_DIR"

echo "[build] Using $IMAGE"
echo "[build] Source: $PROJECT_DIR"
echo "[build] Output: $OUTPUT_DIR/agent-sandbox.exe"
echo ""

docker run --rm \
    -v "$PROJECT_DIR":/src:ro \
    -v "$OUTPUT_DIR":/out \
    -v "$NUGET_CACHE":/root/.nuget \
    -w /src \
    "$IMAGE" \
    bash -c 'cp -r /src /build && cd /build && dotnet publish -c Release -r win-x64 --self-contained true -o /out -p:PublishSingleFile=true -p:EnableWindowsTargeting=true'

if [ -f "$OUTPUT_DIR/agent-sandbox.exe" ]; then
    size=$(du -h "$OUTPUT_DIR/agent-sandbox.exe" | cut -f1)
    echo ""
    echo "[build] Done: $OUTPUT_DIR/agent-sandbox.exe ($size)"
else
    echo ""
    echo "[build] Error: agent-sandbox.exe not found in output."
    exit 1
fi
