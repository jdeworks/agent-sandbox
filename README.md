# agent-sandbox

Isolated Docker sandbox for AI agent work. The agent runs inside a locked-down container with access only to the mounted workspace. The container runs as your user so files you create are owned by you.

## Setup

```bash
./agent-worker/scripts/host/setup.sh
```

This checks for Docker (offers to install if missing), and optionally adds a `sandbox` alias to your shell.

## Quick Start

```bash
# From any directory, point at the project you want to sandbox:
sandbox /path/to/my-project

# Or use . for the current directory:
cd ~/my-project && sandbox .
```

On first run for a project the script will:
1. Build the base image (Ubuntu + Python + Node + OpenCode) if it doesn't exist
2. Create a project folder under `agent-worker/projects/<name>/` with docker-compose, Dockerfile, Agents.md, and config
3. Start the container and attach a shell

On subsequent runs it reuses the existing project config and starts the container immediately.

## Structure

```
agent-worker/
  Dockerfile.base                  # Base image with all runtimes + OpenCode
  scripts/
    host/                          # Scripts that run on the host machine
      setup.sh                     # First-time setup (docker check, alias)
      sandbox.sh                   # Main CLI entry point
      sandbox-list.sh              # List all sandboxed projects
      sandbox-stats.sh             # Show disk usage and statistics
      sandbox-cleanup.sh           # Remove projects, containers, volumes
    container/                     # Scripts that run inside the container
      install.sh                   # Entrypoint (installs deps on startup)
  templates/                       # Templates for new projects
  projects/                        # Auto-generated per-project configs
    <name>/
      docker-compose.yml, Dockerfile, config.env
      Agents.md, opencode.json, oh-my-opencode.json, changes.txt
```

**Where things live**

- **Your workspace folder** (the dir you run `sandbox .` from): only your code, `requirements.txt`, and `package.json`. It is mounted at `/workspace/src` in the container. Nothing else (no config, no venv, no caches) is mirrored there.
- **Inside the container**, the project root is `/workspace/src`. `node_modules` and the Python venv live in named volumes (good performance on all OSes); config and `changes.txt` are mounted from this repo’s `agent-worker/projects/<name>/`.

## Helper Scripts

```bash
# List all sandboxed projects with status and workspace path
./agent-worker/scripts/host/sandbox-list.sh

# Show disk usage: base image, per-project named volumes, docker overview
./agent-worker/scripts/host/sandbox-stats.sh

# Remove all projects, containers, and volumes
./agent-worker/scripts/host/sandbox-cleanup.sh

# Also remove the base image
./agent-worker/scripts/host/sandbox-cleanup.sh --all
```

## How Dependencies Work

- Python: a venv is always created at `/workspace/.venv` (named volume). Pip reads `requirements.txt` from the project root (`/workspace/src`) and reinstalls when it changes.
- Node: `npm install` runs in `/workspace/src`; `node_modules` is a named volume at `/workspace/src/node_modules`. Your workspace folder on the host only has your code and manifests.
- The container runs as your host user (UID/GID), so files you create in the workspace are owned by you.

## Ports

Twenty common dev ports are published (3000, 3001, 4000, 4173, 4200, 5000, 5001, 5173, 5500, 8000, 8080, 8100, 8888, 9000, 9090, 1313, 3333, 3456, 24678, 9229). Use one of these for your dev server so it’s reachable at `http://localhost:<port>`. To add more, edit the project’s `docker-compose.yml` in `agent-worker/projects/<name>/`.

## Security

- No Docker socket mounted
- No privileged mode
- `no-new-privileges` enabled
- Agent can only see the bind-mounted workspace
- Container isolation is the security boundary

## Extending

Add more runtimes to `Dockerfile.base`:

```dockerfile
RUN apt install -y golang
RUN apt install -y rustc cargo
```

Add corresponding cache volumes in `templates/docker-compose.yml.tpl`.
