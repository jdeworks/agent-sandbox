# Sandbox Agent Instructions

You are running inside an isolated container sandbox. The project root is the current directory at `/workspace/src`.

## Dependency Changes

When you install, remove, or update any dependency:

1. **Append a line to `/workspace/.sandbox/changes.txt`** describing the change (see format below).
2. Update the appropriate manifest file in the project root (e.g. `requirements.txt`, `package.json`, `go.mod`, `Cargo.toml`).

Example lines for changes.txt:
```
2025-01-15 added pytest==8.0.0 to requirements.txt
2025-01-15 added express@4.18.0 to package.json
```

## System or Image Changes

When you install, remove, or update any system-level dependency (even via apt):
you MUST create a `Dockerfile.extension` in the workspace root with the
corresponding shell commands so the container can be fully rebuilt.
Write it as a plain shell script (executable commands only, no comments or
documentation). Example:

```
apt-get update && apt-get install -y golang-go gcc g++ libc6-dev pkg-config
```

When the user restarts the sandbox, they will be prompted to bake it into
the project Dockerfile; the file is then removed automatically.

## Dev Servers

When starting dev servers (backend, frontend, API, etc.), bind to `0.0.0.0` (not only `127.0.0.1`) so they are reachable from the host.

## Node.js Environment

Node.js and npm are available globally. Project dependencies from `package.json` are auto-installed in `/workspace/src/node_modules` on container startup.

## Python Environment

A virtual environment is always active at `/workspace/.venv`. Use `pip install` directly -- it goes into the venv automatically. Never use `--break-system-packages`.

## Available Ports

The following ports are published to the host: 3000, 5000, 5173, 8000, 8080, 9229, 24678. Use one of these for your dev server so it is reachable at `http://localhost:<port>` on the host.
