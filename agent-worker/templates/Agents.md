# Sandbox Agent Instructions

You are running inside an isolated container sandbox. The project root is the current directory (only your code, requirements.txt, package.json, and node_modules appear here).

## Required

On **every** dependency add, remove, or update, you **must** append one line to **`/workspace/.sandbox/changes.txt`** with the date and what changed (one sentence). Do this without exception.

## Python Environment

A virtual environment is always active at `/workspace/.venv`. Use `pip install` directly -- it goes into the venv automatically. Never use `--break-system-packages`.


## Dependency Changes

When you install, remove, or update any dependency:

1. **Append a line to `/workspace/.sandbox/changes.txt`** describing the change (see format below).
2. Update the appropriate manifest file in the project root:
   - Python: add/update the package in `requirements.txt` (create it if it doesn't exist)
   - Node.js: add/update the package in `package.json`

Example lines for changes.txt:
```
2025-01-15 added pytest==8.0.0 to requirements.txt
2025-01-15 added express@4.18.0 to package.json
```


   ## system or image changes
   When you install, remove, or update any dependency (even linux level)
   you MUST create a `Dockerfile.extension` in the workspace root with the
   corresponding shell commands so the container can be fully rebuilt.
   Write it as a plain shell script (executable commands only, no comments or
   documentation). Example:

   ```
   apt-get update && apt-get install -y golang-go gcc g++ libc6-dev pkg-config
   ```

   When the user restarts the sandbox, they will be prompted to bake it into
   the project Dockerfile; the file is then removed automatically.

This ensures all changes are tracked and persist across container restarts.

## Dev servers

When starting dev servers (backend, frontend, API, etc.), bind to `0.0.0.0` (not only `127.0.0.1`) so they are reachable from the host. Use one of these published ports: 3000, 3001, 4000, 4173, 4200, 5000, 5001, 5173, 5500, 8000, 8080, 8100, 8888, 9000, 9090, 1313, 3333, 3456, 24678, 9229. Then open `http://localhost:<port>` on the host.
