# agent-sandbox

Isolated Docker sandbox for AI coding agents. Each project runs inside a locked-down container with [OpenCode](https://opencode.ai/) and the [oh-my-opencode](https://github.com/code-yeongyu/oh-my-opencode) plugin pre-installed. The agent can only see the mounted workspace; all config, caches, and logs persist on the host between sessions.

The sandbox environment is tailored to your project -- you pick the languages you need (Python, Node, Go, Rust, ...) and only those runtimes are installed. Ports are auto-detected based on the frameworks in your project, so dev servers just work.

## Common use cases

- **Run AI agents in isolation** — Each project runs in its own container; the agent only sees the workspace you mount. No access to the rest of your machine.
- **Language-tailored environments** — Create profiles with only the runtimes you need (e.g. Python + Node). Dependencies are installed inside the container; your host stays clean.
- **Ports and dev servers** — Frameworks (Next.js, Flask, etc.) are detected and the right ports are exposed so the agent can run and use dev servers without extra config.
- **Persistent config and caches** — OpenCode config, sessions, and language caches (venv, npm, cargo, …) live on the host between runs. Re-launch the same project and everything is still there.
- **Safe system changes** — When the agent needs system packages (e.g. `apt install`), it writes a `Dockerfile.extension`; you choose whether to bake it into the project’s Dockerfile. No surprise changes to your host.
- **Multiple projects** — Each project gets its own profile and data. List projects, see disk usage, and clean up individual projects or only unused prepared profiles when you’re done.

## Common issues if you don’t use a sandbox

Running an AI coding agent (e.g. OpenCode) directly on your host is convenient but has real downsides. A sandbox addresses these by design:

- **Agent with full host access** — Without a sandbox, the agent has access to your entire filesystem, environment variables, SSH keys, and other repos. It can run any command. A mistaken or overeager suggestion can overwrite important files, leak secrets, or alter system config. In a sandbox, the agent only sees the mounted workspace and runs inside a container; system-level changes are recorded in `Dockerfile.extension` and only applied if you approve.

- **Version and environment conflicts** — Different projects often need different Python, Node, or Go versions, or conflicting global tools. Without isolation you rely on a single global environment or juggle version managers, and one project’s deps can break another’s. With a sandbox, each profile has its own runtimes and versions; project A can use Python 3.11 while project B uses 3.12. Dependencies live in the container (venvs, `node_modules`, etc.), so your host stays clean and projects don’t interfere.

- **Risky experimentation** — Letting the agent try new runtimes, system packages, or shell commands on your host can leave your machine in a bad state. In a sandbox you can experiment freely; wiping or rebuilding a project (or a profile) is a single cleanup command. System changes go through `Dockerfile.extension`, so you decide what gets baked in.

- **Reproducibility** — Sandbox profiles (Dockerfile.base, install.sh, versions.env) define exactly what the agent sees. The same profile gives the same environment every time and on any machine that has Docker. Without a sandbox, “works on my machine” and environment drift are common.

- **Cross-project and cache pollution** — On the host, global caches (npm, pip, cargo, Go module cache) are shared. One project’s dependency resolution or install can affect another, and agent-installed packages can linger everywhere. In a sandbox, each profile has its own container image and named volumes; installs and caches are scoped to that environment so projects stay independent.

- **Accidental edits outside the project** — Agents sometimes run scripts or find/replace that escape the intended folder (parent directories, sibling repos, home). On the host that can overwrite or delete unrelated work. In a sandbox, only the workspace directory is mounted; the agent literally cannot see or modify anything else.

- **Port and process clashes** — Running the agent on several projects at once on the host means shared ports and shared processes; one project’s dev server can conflict with another’s. The sandbox gives each project its own container and, when a port is in use, automatically remaps it (e.g. 3000 → 3001) so multiple sandboxes can run side by side.

- **Secrets and credentials in scope** — On the host, the agent can read `~/.ssh`, `.env` files in other dirs, and any env vars your shell has. A single bad suggestion or script can expose or log them. In a sandbox, only the workspace and what you explicitly pass (e.g. API keys via the tool’s passthrough) are visible; the rest of your home and system are out of scope.

- **Leftover agent artifacts and cleanup** — Without isolation, agent-generated files, failed experiments, and caches end up scattered across your repo and system. Cleaning up is manual and error-prone. With a sandbox, all agent and dependency state lives under the project’s data dir and volumes; you can remove a project or an unused profile in one go (`sandbox-cleanup`, `sandbox-cleanup-prepared-unused`).

- **Closer to CI and production** — If your CI or deployment runs in containers, a sandboxed agent environment is much closer to that. You avoid “runs locally but fails in CI” because local and sandbox both use a defined, containerized setup rather than whatever is installed on your machine.

## Command reference

All commands in one place. Details are in the sections below.

| Action | Linux / macOS / WSL | Windows (CLI) |
|--------|---------------------|---------------|
| **Setup** | `./agent-worker/scripts/unix/setup.sh` then `source ~/.bash_aliases` | `agent-sandbox setup` |
| **Prepare profile** | `prepare` (interactive) | `agent-sandbox prepare C:\path` |
| **List prepared profiles** | `prepare --list` | `agent-sandbox profiles` |
| **Delete a profile** | `prepare --delete <name>` | `agent-sandbox profiles delete <name>` |
| **Launch sandbox** | `sandbox-<profile> /path` or `sandbox-<profile>` (recent) | `agent-sandbox sandbox C:\path` or `agent-sandbox sandbox` |
| **List projects** | `sandbox-list` | `agent-sandbox list` |
| **Disk usage** | `sandbox-stats` | `agent-sandbox stats` |
| **Remove a project** | `sandbox-cleanup <name>` or `sandbox-cleanup --all` | `agent-sandbox cleanup <name>` or `agent-sandbox cleanup --all` |
| **Cleanup with sudo** (root-owned files) | `sandbox-cleanup-sudo [name or --all]` | — |
| **Remove prepared profiles** (interactive) | `sandbox-cleanup prepared` | `agent-sandbox cleanup prepared` |
| **Remove only unused prepared profiles** | `sandbox-cleanup-prepared-unused` or `sandbox-cleanup.sh prepared --unused-only` | `agent-sandbox cleanup prepared --unused-only` |

On Windows you can also use the **GUI**: double-click the exe for a wizard (folder picker, recent projects, Scan & Launch).

## Prerequisites

**Linux / macOS / WSL:**
- **Docker** and **Docker Compose** (setup script can install Docker for you)
- **jq** -- install with `sudo apt install -y jq`

**Windows:**
- **Docker Desktop** -- that's it. The self-contained exe handles everything else (see [Windows Support](#windows-support)).

## Quick Start

### Linux / macOS / WSL

```bash
# 1. One-time setup (installs aliases, optionally creates default profiles)
./agent-worker/scripts/unix/setup.sh
source ~/.bash_aliases

# 2. Sandbox any project
sandbox-python ~/my-project
```

The setup script checks for Docker/jq, installs helper aliases (`sandbox-list`, `sandbox-stats`, `sandbox-cleanup`, `sandbox-cleanup-sudo`), and offers to create **default single-language profiles**. If you pick Python during setup, `sandbox-python` is ready to use immediately -- no `prepare` step needed.

For multi-language projects (e.g. Python + Node), use `prepare` to create a combined profile:

```bash
prepare                     # interactive: auto-detects or manual pick
sandbox-python-node .       # use the new profile
```

### Windows

**GUI:** Double-click `agent-sandbox.exe`. On first launch, a **Quick Setup** screen lets you create default profiles by checking the languages you want. Then pick a folder, Scan, and Launch.

**CLI:**
```
agent-sandbox setup                            One-time: create default profiles
agent-sandbox sandbox C:\path\to\project       Launch a sandbox
```

## How It Works

1. **Setup** creates profiles -- pre-built Docker environments tailored to specific languages
2. **Sandbox** launches a container from a profile, mounts your project, and starts OpenCode inside it
3. Your source code is bind-mounted; config, sessions, and caches are persisted on the host

Each profile generates:
- A `Dockerfile.base` with the selected language runtimes
- A `docker-compose.yml.tpl` with the right volumes, ports, and environment
- An `install.sh` entrypoint that auto-installs dependencies on startup
- An `AGENTS.md` with tailored instructions for the AI agent

## Profiles

A profile defines the language runtimes and ports for a sandbox. There are two ways to create profiles:

### Default profiles (single-language)

Created during setup. Each gives you a `sandbox-<lang>` alias (Unix) or can be referenced with `--profile <lang>` (Windows CLI):

```bash
# Unix: created automatically during setup
sandbox-python /path/to/project
sandbox-node /path/to/project
sandbox-go /path/to/project

# Windows CLI
agent-sandbox sandbox --profile python C:\project
```

### Custom profiles (multi-language)

Created with `prepare`. Auto-detects languages and frameworks, lets you pick versions and ports:

```bash
# Unix
prepare
# → scans your project, detects python + node + go
# → creates sandbox-python-go-node alias

# Windows CLI
agent-sandbox prepare C:\project

# Windows GUI
# Just click "Scan & Continue" -- it handles everything
```

### Profile management

```bash
# Unix
prepare --list                  # show all profiles
prepare --delete python-node    # remove a profile

# Windows CLI
agent-sandbox profiles                   # list all
agent-sandbox profiles delete python     # remove one
```

## Running a Sandbox

```bash
# Launch with a project path:
sandbox-python-node /path/to/my-project

# Or from inside the project directory:
cd ~/my-project && sandbox-python-node .

# Run without arguments to pick from recent projects:
sandbox-python-node
```

On **first run** for a project:

1. Builds the profile's base image (cached if unchanged)
2. Scaffolds a project folder under `agent-worker/projects/<name>/` with all config
3. If any configured port is already in use (e.g. another sandbox), it is **remapped** to the next free port and a message is printed (e.g. `Port 3000 in use -> remapped to 3001:3000`). This applies on both Unix and Windows.
4. Starts the container, **waits for it to be ready**, then launches OpenCode. Readiness is detected by checking container logs for `[sandbox] Ready.` (and falling back to a file check), so the wait is reliable even when `docker exec` is flaky (e.g. on WSL2). To skip the wait (e.g. for debugging), set `SANDBOX_SKIP_READY=1` in the environment before launching.

On **subsequent runs** it reuses the existing project config. If the container is already running, you can **reattach** (open a new OpenCode session in the existing container) or **rebuild** from scratch.

Running without a path shows **recent projects** for that profile, sorted by last used. Projects whose workspace path no longer exists are marked `[PATH MISSING]`.

## Available Languages

| Language | Detection files | What it adds |
|---|---|---|
| C/C++ | `CMakeLists.txt`, `meson.build`, `configure.ac`, `conanfile.txt`, `vcpkg.json`, `*.c`, `*.cpp`, `*.h`, `*.hpp` | CMake, Ninja, GDB, pkg-config (gcc/g++/make already in base) |
| C# / .NET | `*.csproj`, `*.sln`, `*.fsproj`, `global.json`, `*.cs`, `*.fs` | .NET SDK 8.0; auto-runs `dotnet restore` |
| Dart | `pubspec.yaml`, `pubspec.lock`, `*.dart` | Dart SDK; auto-runs `dart pub get` |
| Go | `go.mod`, `go.sum`, `*.go` | golang-go; auto-runs `go mod download` |
| Java | `pom.xml`, `build.gradle`, `build.gradle.kts`, `gradlew`, `mvnw`, `*.java` | OpenJDK 21, Maven; auto-resolves Maven/Gradle deps |
| Kotlin | `*.kt`, `*.kts` | OpenJDK 21 (Gradle wrapper handles Kotlin compiler); auto-resolves Gradle deps |
| Node.js | `package.json`, `*.js`, `*.ts`, `*.jsx`, `*.tsx` | npm project dependency auto-install (Node runtime always included for plugins) |
| PHP | `composer.json`, `composer.lock`, `artisan`, `*.php` | PHP + common extensions, Composer; auto-runs `composer install` |
| Python 3 | `requirements.txt`, `setup.py`, `pyproject.toml`, `Pipfile`, `*.py` | python3, venv, pip; auto-installs from requirements.txt |
| Ruby | `Gemfile`, `Gemfile.lock`, `Rakefile`, `*.gemspec`, `*.rb` | Ruby, Bundler; auto-runs `bundle install` |
| Rust | `Cargo.toml`, `Cargo.lock`, `*.rs` | rustup toolchain; auto-runs `cargo fetch` |

New languages can be added by editing `agent-worker/sandbox/languages.json` and adding matching fragments in `agent-worker/sandbox/fragments/` (see the [fragments README](agent-worker/sandbox/fragments/README.md) for details).

## Ports

Ports are **dynamically selected** during profile creation based on the languages and frameworks detected in your project.

### How port detection works

1. **Base ports** (3000, 8080) are always included -- 3000 covers the most common dev server default and Node.js is always available in the base image
2. **Language defaults** are added for each selected language (e.g. Python adds 5000 and 8000)
3. **Framework detection** scans dependency manifests (`requirements.txt`, `package.json`, `go.mod`, `Cargo.toml`) for known frameworks and adds their ports -- for example, detecting `vite` in `package.json` adds 5173 and 24678. **Node.js framework detection always runs** (even if Node wasn't explicitly selected) because Node is part of the base image and frontend tooling can appear in any project
4. You can **add extra ports** at the prompt or accept the defaults
5. Only the needed ports end up in the generated `docker-compose.yml.tpl`

> **Note:** If you add a new framework or language to a project after the initial profile creation, re-run `prepare` to update port forwarding and language tooling. The agent is instructed to remind you of this via `AGENTS.md`.

### Supported frameworks

| Language | Frameworks | Default ports |
|---|---|---|
| C# / .NET | ASP.NET, Blazor | 5000, 5001 |
| Dart | shelf, dart_frog, Serverpod | 8080, 8081 |
| Go | Gin, Fiber, Echo | 8080, 3000, 1323 |
| Java | Spring Boot, Quarkus, Micronaut | 8080 |
| Kotlin | Ktor, Spring Boot | 8080 |
| Node.js | Next.js, Vite, Angular, CRA, Express, Nuxt, Svelte, Remix, Astro | 3000, 5173, 4200, 4321, 24678 |
| PHP | Laravel, Symfony, Slim | 8000, 8080 |
| Python | Flask, Django, FastAPI/uvicorn, Streamlit, Gradio, Jupyter | 5000, 8000, 8501, 7860, 8888 |
| Ruby | Rails, Sinatra, Hanami | 3000, 4567, 2300 |
| Rust | Actix, Axum, Rocket | 8080, 3000, 8000 |

To add framework entries, edit `agent-worker/sandbox/ports.json`.

## Multiple Sandboxes

You can run multiple sandboxes simultaneously. **Auto port remapping** (Unix and Windows): when a port in the profile is already in use (e.g. by another sandbox or a local server), the system rewrites the project's `docker-compose.yml` to use the next free port and prints:

```
[sandbox] Port 3000 in use -> remapped to 3001:3000
```

The container-side port stays the same; only the host-side mapping changes.

## Authentication & API Keys

**Auth sync:** OpenCode authentication (`auth.json`) is synced from the host to the container on every startup. If you re-authenticate on the host, the next sandbox launch picks up the new credentials automatically.

**API key passthrough:** If you have API keys set in your host environment, they are automatically forwarded into the container via a `runtime.env` file on every startup:

- `ANTHROPIC_API_KEY` (Claude Code)
- `OPENAI_API_KEY`
- `CURSOR_API_KEY` (Cursor CLI)
- `GITHUB_COPILOT_API_KEY` (GitHub Copilot)
- `OPENROUTER_API_KEY`
- `OPENCODE_API_KEY`
- `GEMINI_API_KEY`

**Windows GUI:** The Windows wizard includes an Environment Variables step where you can enter API keys. These are stored **encrypted** using AES-256 with a DPAPI-protected key, so they are secure on disk.

## CLI Agents

The sandbox supports multiple CLI coding agents:

| Agent | Command | Description |
|-------|---------|-------------|
| OpenCode | `opencode` | Default agent with oh-my-opencode orchestration |
| Claude Code | `claude` | Anthropic's CLI agent |
| Cursor CLI | `agent` | Cursor's CLI agent |
| GitHub Copilot | `gh copilot agent` | Microsoft's GitHub Copilot CLI |

### Selecting an Agent

**Unix:** On startup, you'll be prompted to choose an agent for that session.

You can also set a default agent in `sandbox_data/agent-config.json`.

**Windows:** Use **Settings…** to choose the default CLI agent (OpenCode, Claude Code, Cursor CLI, GitHub Copilot) and to save environment variables (stored encrypted). The wizard’s environment variables step can override for that launch. The chosen default applies to all projects (including existing ones).

All agents are intended to be installed in the Docker base image. If Cursor/Claude/Copilot install fails in the container (e.g. network or platform), stub scripts are created so the command exists and prints a message; use **Settings** to switch the default to OpenCode and relaunch.

## OpenCode Configuration

All OpenCode config lives in the `opencode_data/` directory, which maps to `~/.config/opencode` inside the container (the global config location). This ensures config is always loaded regardless of the workspace's git structure.

- **`opencode.json`** -- Main config (model, compaction, plugins). Loaded as global config. Not overwritten on subsequent runs to preserve your customizations.
- **`AGENTS.md`** -- Agent instructions for the sandbox environment. Assembled from the base template plus language-specific fragments, so it only mentions the tools that are actually installed.
- **`oh-my-opencode.json`** -- Model overrides for oh-my-opencode agents (Sisyphus, Oracle, Librarian, etc.). Not overwritten on subsequent runs to preserve your customizations.

### oh-my-opencode

The [oh-my-opencode](https://github.com/code-yeongyu/oh-my-opencode) plugin is enabled by default. It provides multi-model orchestration with specialized agents, background tasks, and the `ultrawork` / `ulw` prompt keyword for intensive autonomous coding sessions.

To disable it for a project, remove `"oh-my-opencode"` from the `plugin` array in that project's `opencode_data/opencode.json`.

## Dockerfile.extension

When the agent needs system-level packages (e.g. `apt install`), it creates a `Dockerfile.extension` file at `/workspace/.sandbox/Dockerfile.extension` inside the container. This maps to `projects/<name>/sandbox_data/Dockerfile.extension` on the host -- never polluting your source code directory.

When the OpenCode session ends, you'll be prompted to bake those changes into the project's Dockerfile. If you accept, the container is stopped so the next run triggers a rebuild with the new layers. The extension file is then removed automatically. You can also defer -- the prompt will reappear before the next startup.

## Helper Commands

### Unix

```bash
sandbox-list                    # List all projects with status, profile, and workspace
sandbox-stats                   # Show disk usage: images, volumes, per-project
sandbox-cleanup my-project      # Remove a specific project
sandbox-cleanup --all           # Remove all projects, containers, and volumes
sandbox-cleanup-sudo [name|--all]  # Same with sudo (use when files are root-owned; script will suggest this if rm fails)
sandbox-cleanup prepared        # Interactive: remove prepared profiles (warns if in use)
sandbox-cleanup-prepared-unused # Remove only prepared profiles not used by any project
prepare --list                  # List all prepared profiles
prepare --delete python-node    # Delete a profile and its alias
```

### Windows

```
agent-sandbox list                       List all projects
agent-sandbox stats                      Show disk usage
agent-sandbox cleanup [<project>]        Remove a project (or --all)
agent-sandbox cleanup prepared           Interactive: remove prepared profiles
agent-sandbox cleanup prepared --unused-only   Remove only prepared profiles not used by any project
agent-sandbox profiles                   List prepared profiles
agent-sandbox profiles delete <name>     Delete a profile
```

The Windows GUI also has **Remove**, **Re-scan**, and **Regenerate environment** in the recent projects list. **Regenerate environment** stops the container, removes the project data, and removes the base image so the next launch does a full rebuild from the current template (useful after template updates or to fix a broken image). When a session ends, you can choose **Back to overview** (to launch another project) or **Close**.

## How Dependencies Work

- **C/C++**: CMake projects are detected; build tools are ready. No auto-install (no standard package manager).
- **C# / .NET**: `dotnet restore` runs when `.csproj` / `.fsproj` files change.
- **Dart**: `dart pub get` runs when `pubspec.yaml` changes.
- **Go**: `go mod download` runs when `go.sum` changes.
- **Java**: `mvn dependency:resolve` runs when `pom.xml` changes. Gradle wrapper projects resolve via `./gradlew dependencies`.
- **Kotlin**: Gradle wrapper resolves dependencies when `build.gradle(.kts)` changes.
- **Node**: `npm install` runs in `/workspace/src` when `package.json` changes.
- **PHP**: `composer install` runs when `composer.json` changes.
- **Python**: A venv is created at `/workspace/.venv` (named volume). `requirements.txt` from the workspace is auto-installed on startup when it changes.
- **Ruby**: `bundle install` runs when `Gemfile` / `Gemfile.lock` changes. Gems go to `/workspace/.gems`.
- **Rust**: `cargo fetch` runs when `Cargo.lock` changes.

All dependency installs are fingerprinted with md5 checksums so they are skipped when nothing changed.

## Logs

OpenCode log files are persisted in the project's `logs/` directory. After a session:

```bash
ls agent-worker/projects/<name>/logs/
```

For more verbose output, run OpenCode with `opencode --log-level DEBUG`.

## Container Layout

| Host path (relative to project) | Container path | Purpose |
|---|---|---|
| Your workspace folder | `/workspace/src` (workdir) | Source code only |
| `opencode_data/` | `/workspace/.config/opencode` | Global OpenCode config, AGENTS.md, plugin config |
| `opencode_sessions/` | `/workspace/.local/share/opencode` | Session data, auth |
| `logs/` | `/workspace/.local/share/opencode/log` | OpenCode log files |
| `sandbox_data/` | `/workspace/.sandbox` | Dependency log, Dockerfile.extension |

Additional named Docker volumes are created per-profile for caches (venv, pip, npm, cargo, etc.).

### File ownership (Unix)

On Linux/macOS/WSL the agent process runs as your host user (via `HOST_UID`/`HOST_GID` in the container). Files created in the bind-mounted workspace are therefore owned by you, so you can edit or delete them without `sudo` after the container exits. The container still runs its setup (dependency installs, etc.) as root; only the OpenCode/agent process drops to your user.

If a project was first run from **Windows** (or without `HOST_UID`/`HOST_GID`), some files under the project dir (e.g. `opencode_sessions/`) may be root-owned. In that case `sandbox-cleanup <name>` will report permission denied and tell you to use **sandbox-cleanup-sudo** to remove the project.

## Project Structure

```
agent-worker/
  sandbox/                           # Language registry, port lookup, templates
    Dockerfile.base.tpl              #   Minimal base: Ubuntu + Node + OpenCode
    languages.json                   #   Language definitions (Dockerfile, volumes, detection)
    ports.json                       #   Framework-to-port lookup for smart detection
    AGENTS.md.base                   #   Base agent instructions (language-independent)
    generate_profile.sh              #   Assembles profile from templates + selections
    fragments/                       #   Container startup snippets per language
      README.md                      #     How fragments work and how to add new ones
      <lang>.sh                      #     Container startup (dep install, PATH, etc.)
      <lang>.agents.md               #     AI agent instructions for the language
  prepared/                          # Generated profiles (one per language combo)
    <profile>/
      Dockerfile.base                #   Assembled base image
      docker-compose.yml.tpl         #   Compose template with profile-specific volumes + ports
      install.sh                     #   Container entrypoint (assembled from fragments)
      AGENTS.md                      #   Agent instructions (assembled from base + fragments)
      sandbox.sh                     #   Thin wrapper that calls the core sandbox.sh
      versions.env                   #   Resolved language version pins
  templates/                         # Shared config templates (language-independent)
    opencode.json                    #   OpenCode configuration
    oh-my-opencode.json              #   oh-my-opencode agent model overrides
  scripts/
    unix/                            # Scripts that run on the host (Linux / macOS / WSL)
      setup.sh                       #   First-time setup (Docker, jq, aliases, default profiles)
      prepare.sh                     #   Interactive profile builder (language + port selection)
      sandbox.sh                     #   Core sandbox logic (called by profile wrappers)
      sandbox-list.sh                #   List all projects with status and profile
      sandbox-stats.sh               #   Disk usage and statistics (dynamic volume discovery)
      sandbox-cleanup.sh             #   Remove projects, containers, volumes (sandbox-cleanup-sudo for full cleanup)
  projects/                          # Auto-generated per-project data
    <name>/
      docker-compose.yml, Dockerfile, config.env, runtime.env
      sandbox_data/                  #   → /workspace/.sandbox
        changes.txt                  #     Dependency change log
        Dockerfile.extension         #     Agent-created system changes (transient)
        agent-config.json            #     Default CLI agent (Unix); copied from template on scaffold
      opencode_data/                 #   → ~/.config/opencode
        opencode.json, oh-my-opencode.json, AGENTS.md
      opencode_sessions/             #   → ~/.local/share/opencode
      logs/                          #   → ~/.local/share/opencode/log

tools/
  build-windows.sh                   # Build the Windows exe via Docker (no local .NET needed)
  dist/                              # Build output (agent-sandbox.exe) -- gitignored
  AgentSandbox/                      # Windows EXE (C# .NET 8.0, self-contained)
```

## Adding Languages

The sandbox ships with 11 languages. To add more:

1. Add an entry to `agent-worker/sandbox/languages.json` with the language key, label, detection files, `default_version`, `version_detect` rules, Dockerfile commands, volume definitions, and PATH additions.
2. Create a matching install fragment at `agent-worker/sandbox/fragments/<key>.sh` with the container startup logic (dependency installation, PATH setup, etc.).
3. Create `agent-worker/sandbox/fragments/<key>.agents.md` with agent instructions for the new language.
4. Add default ports and any framework entries to `agent-worker/sandbox/ports.json`.
5. Copy the new/changed files to the Windows embedded resources under `tools/AgentSandbox/Resources/` (languages.json, ports.json, fragments).
6. Bump the `VersionStamp` in `tools/AgentSandbox/Services/ResourceManager.cs`.
7. Update this README (languages table, frameworks table, dependencies list).
8. See `agent-worker/sandbox/fragments/README.md` for conventions and the [`.cursorrules`](.cursorrules) file for the full cross-platform sync checklist.
9. Run `prepare` (unix) or `agent-sandbox prepare` (Windows) to generate a new profile that includes the language.

## Windows Support

Windows users get a single self-contained EXE (`agent-sandbox.exe`) that packages everything -- no git clone, no bash, no jq required. Only Docker Desktop needs to be installed.

### How it works

The exe embeds all sandbox data (language definitions, Dockerfile templates, fragment scripts, port lookups, OpenCode config). On first run it extracts them to `%APPDATA%\AgentSandbox\` and creates the same `prepared/` and `projects/` structure that the unix scripts use.

### Building the EXE

From WSL or any Linux/macOS host with Docker (no local .NET needed):

```bash
# Full build -- produces tools/dist/agent-sandbox.exe
./tools/build-windows.sh

# Compile check only -- fast, verifies code compiles without producing the exe
./tools/build-windows.sh --check
```

The build script cross-compiles from the Linux .NET 8.0 SDK image (the Windows Desktop targeting pack for WinForms is pulled from NuGet automatically). A persistent Docker volume caches NuGet packages so subsequent builds are fast.

Alternatively, on Windows with the .NET 8.0 SDK installed:

```powershell
cd tools\AgentSandbox
dotnet publish -c Release -o ..\dist
```

### GUI Usage

**Double-click** the exe (or run without arguments) to open the GUI wizard:

1. **Quick Setup** -- shown on first launch (or via the "Manage Profiles..." button). Check the languages you want and click "Create Selected Profiles" to generate default single-language profiles. Existing profiles are marked. Click "Continue to Project Selection" when done.
2. **Folder picker** -- Browse button opens a native Windows folder dialog (handles paths with spaces correctly).
3. **Recent Projects** -- previously launched projects are listed below the folder picker, sorted by last used. Select one and click "Continue with Selected" to quick-launch without re-running detection. You can **Remove** a project, **Re-scan** it (update languages/versions/ports), or **Regenerate environment** (stop container, remove project data and base image; next launch does a full rebuild). **Settings…** opens the Settings dialog (default agent and saved API keys).
4. **Scan** -- for new projects, auto-detects languages, versions, frameworks, and ports
5. **Review** -- checkboxes for languages, editable version fields, editable port list, profile name
6. **Launch** -- generates the profile, builds the Docker image, scaffolds the project, and attaches to the container

The wizard can also be pre-filled with a path:

```
agent-sandbox C:\path\to\project
```

### CLI Usage

```
agent-sandbox setup                            Guided first-time setup (create default profiles)
agent-sandbox prepare C:\project               Prepare a profile without launching
agent-sandbox sandbox C:\project               Launch using an existing profile
agent-sandbox sandbox --profile python C:\proj  Launch with a specific profile
agent-sandbox sandbox                          Pick from recent projects
agent-sandbox list                             List all projects
agent-sandbox stats                            Show disk usage
agent-sandbox cleanup [<project>]              Remove a project (or --all)
agent-sandbox cleanup prepared                 Interactive: remove prepared profiles
agent-sandbox cleanup prepared --unused-only   Remove only prepared profiles not used by any project
agent-sandbox profiles                         List prepared profiles
agent-sandbox profiles delete <name>           Delete a profile
agent-sandbox help                             Show this help
```

### Data location

All data is stored under `%APPDATA%\AgentSandbox\`:

```
%APPDATA%\AgentSandbox\
  .version                   # Tracks embedded resource version
  .envkey                    # DPAPI-protected key for encrypting API keys
  saved_settings.json        # Default CLI agent (and other app settings)
  saved_env.env              # Saved API keys (encrypted)
  sandbox/                   # Extracted from exe: languages.json, ports.json, templates
    fragments/               # Shell fragments and agent instruction fragments
  templates/                 # opencode.json, oh-my-opencode.json, agent-config.json
  prepared/                  # Generated profiles (same as unix)
  projects/                  # Per-project data (compose files, config, logs)
```

### Windows project structure

```
tools/
  build-windows.sh                   # Build the exe via Docker (no local .NET needed)
  dist/                              # Build output (gitignored)
  AgentSandbox/                      # C# .NET 8.0 project
    AgentSandbox.csproj              #   Self-contained single-file publish config
    Program.cs                       #   Entry point: routes to GUI wizard or CLI mode
    Cli.cs                           #   CLI subcommands (setup, prepare, sandbox, list, stats, cleanup)
    Models/                          #   DTOs for languages.json, ports.json, ProfileSpec
    Services/                        #   Detection, generation, Docker, scaffolding, resources
    UI/
      WizardForm.cs                  #   WinForms wizard (folder picker, recent projects, detection, launch)
      SettingsForm.cs                #   Settings dialog (default agent, saved API keys)
    Resources/                       #   Embedded data files (copied from sandbox/)
      languages.json, ports.json, Dockerfile.base.tpl, AGENTS.md.base
      fragments/                     #   *.sh and *.agents.md
      templates/                     #   opencode.json, oh-my-opencode.json, agent-config.json
```

## Security

- No Docker socket mounted
- No privileged mode
- `no-new-privileges` enabled
- Agent can only see the bind-mounted workspace
- Container isolation is the security boundary
