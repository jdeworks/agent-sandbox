# agent-sandbox

Isolated Docker sandbox for AI coding agents. Each project runs inside a locked-down container with [OpenCode](https://opencode.ai/) and the [oh-my-opencode](https://github.com/code-yeongyu/oh-my-opencode) plugin pre-installed. The agent can only see the mounted workspace; all config, caches, and logs persist on the host between sessions.

## Setup

```bash
./agent-worker/scripts/host/setup.sh
```

Checks for Docker and Docker Compose (offers to install if missing), then optionally adds a `sandbox` alias to your shell.

## Quick Start

```bash
sandbox /path/to/my-project

# Or from inside the project directory:
cd ~/my-project && sandbox .
```

On **first run** for a project the script will:

1. Build the base image (Ubuntu 24.04 + Python + Node 20 + OpenCode + oh-my-opencode) if needed
2. Scaffold a project folder under `agent-worker/projects/<name>/` with all config
3. Start the container and launch OpenCode

On **subsequent runs** it reuses the existing project config and starts immediately.

## Project Structure

```
agent-worker/
  Dockerfile.base                    # Base image with all runtimes + OpenCode
  scripts/
    host/                            # Scripts that run on the host
      setup.sh                       #   First-time setup (Docker check, alias)
      sandbox.sh                     #   Main entry point
      sandbox-list.sh                #   List all projects with status
      sandbox-stats.sh               #   Disk usage and statistics
      sandbox-cleanup.sh             #   Remove projects, containers, volumes
    container/                       # Scripts that run inside the container
      install.sh                     #   Entrypoint (venv, deps, launches OpenCode)
  templates/                         # Templates copied on project init
    docker-compose.yml.tpl           #   Container definition
    Dockerfile.tpl                   #   Per-project Dockerfile (extends base)
    opencode.json                    #   OpenCode config (global)
    oh-my-opencode.json              #   oh-my-opencode agent model overrides
    AGENTS.md                        #   Agent instructions / rules
  projects/                          # Auto-generated per-project data
    <name>/
      docker-compose.yml             #   Generated from template
      Dockerfile                     #   Extends base, project-specific layers
      config.env                     #   Workspace path, creation date
      changes.txt                    #   Dependency change log
      opencode_data/                 #   → ~/.config/opencode (global config)
        opencode.json                #     OpenCode configuration
        oh-my-opencode.json          #     oh-my-opencode agent overrides
        AGENTS.md                    #     Agent rules (auto-discovered)
      opencode_sessions/             #   → ~/.local/share/opencode (session data)
      logs/                          #   → ~/.local/share/opencode/log (log files)
      tmp/                           #   → /tmp
```

## Container Layout

The host directories map into the container as follows:

| Host path (relative to project) | Container path | Purpose |
|---|---|---|
| Your workspace folder | `/workspace/src` (workdir) | Source code only |
| `opencode_data/` | `/workspace/.config/opencode` | Global OpenCode config, AGENTS.md, plugin config |
| `opencode_sessions/` | `/workspace/.local/share/opencode` | Session data, auth |
| `logs/` | `/workspace/.local/share/opencode/log` | OpenCode log files |
| `changes.txt` | `/workspace/.sandbox/changes.txt` | Dependency change tracking |
| `tmp/` | `/tmp` | Temporary files |

Named Docker volumes are used for the Python venv, npm cache, pip cache, and OpenCode cache to avoid performance issues with bind mounts.

## OpenCode Configuration

All OpenCode config lives in the `opencode_data/` directory, which maps to `~/.config/opencode` inside the container (the global config location). This ensures config is always loaded regardless of the workspace's git structure.

- **`opencode.json`** -- Main config (model, compaction, plugins). Loaded as global config.
- **`AGENTS.md`** -- Agent instructions for the sandbox environment. Auto-discovered by OpenCode from the global config directory; no explicit `instructions` path needed.
- **`oh-my-opencode.json`** -- Model overrides for oh-my-opencode agents (Sisyphus, Oracle, Librarian, etc.).

### oh-my-opencode

The [oh-my-opencode](https://github.com/code-yeongyu/oh-my-opencode) plugin is enabled by default. It provides multi-model orchestration with specialized agents, background tasks, and the `ultrawork` / `ulw` prompt keyword for intensive autonomous coding sessions.

To disable it for a project, remove `"oh-my-opencode"` from the `plugin` array in that project's `opencode_data/opencode.json`.

## Logs

OpenCode log files are persisted in the project's `logs/` directory. After a session you can inspect them directly:

```bash
ls agent-worker/projects/<name>/logs/
```

For more verbose output, you can modify the container entrypoint or run OpenCode manually with `opencode --log-level DEBUG`.

## Dockerfile.extension

When the agent needs system-level packages (e.g. `apt install`), it creates a `Dockerfile.extension` file in the workspace root with the required commands. On the next `sandbox` run, you'll be prompted to bake those changes into the project's Dockerfile so they persist across container rebuilds. The extension file is then removed automatically.

## Helper Scripts

```bash
# List all sandboxed projects with status and workspace path
sandbox-list

# Show disk usage: base image, per-project volumes, Docker overview
sandbox-stats

# Remove all projects, containers, and volumes
sandbox-cleanup

# Also remove the base image
sandbox-cleanup --all
```

## How Dependencies Work

- **Python**: A venv is created at `/workspace/.venv` (named volume). `requirements.txt` from the workspace is auto-installed on startup when it changes.
- **Node**: `npm install` runs in `/workspace/src` when `package.json` changes. `node_modules` stays in the workspace.
- Dependencies are fingerprinted with md5 checksums so installs are skipped when nothing changed.

## Ports

Twenty common dev ports are published: 3000, 3001, 4000, 4173, 4200, 5000, 5001, 5173, 5500, 8000, 8080, 8100, 8888, 9000, 9090, 1313, 3333, 3456, 24678, 9229.

The agent is instructed to bind dev servers to `0.0.0.0` so they're reachable at `http://localhost:<port>` on the host. To add more ports, edit the project's `docker-compose.yml`.

## Security

- No Docker socket mounted
- No privileged mode
- `no-new-privileges` enabled
- Agent can only see the bind-mounted workspace
- Container isolation is the security boundary

## Extending

Add runtimes to `Dockerfile.base`:

```dockerfile
RUN apt install -y golang
RUN apt install -y rustc cargo
```

Then add corresponding cache volumes in `templates/docker-compose.yml.tpl` if needed.
