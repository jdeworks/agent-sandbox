# agent-sandbox

Isolated Docker sandbox for AI coding agents. Each project runs inside a locked-down container with your choice of agent (Claude Code, OpenCode, Cursor CLI, GitHub Copilot) and only the runtimes you need. The agent can only see the mounted workspace; all config, caches, and logs persist on the host between sessions.

## Prerequisites

- **Docker Desktop** (or Docker Engine + Compose plugin on Linux)
- **jq** — auto-installed by `setup.sh`, but `apt install jq` / `brew install jq` if you want it beforehand
- ~2 GB disk for a basic profile (Node + one agent). Flutter adds ~2 GB, React Native ~4 GB.

## Quick Start

### Linux / macOS / WSL (v2)

```bash
# 1. Create a profile (interactive: pick agents, languages, plugins, MCP servers)
./src/scripts/unix/sandbox-setup.sh
source ~/.bash_aliases

# 2. Run from any project directory
cd ~/my-project
sandbox-me
```

`sandbox-setup` builds a named Docker image with your selected tools. `sandbox-me` reads a `.sandbox` file in the project root (or creates one) and launches the container.

### Linux / macOS / WSL (v1, still works)

```bash
# One-time setup (aliases, optional default profiles)
./src/scripts/unix/setup.sh
source ~/.bash_aliases

# Sandbox any project
sandbox-python ~/my-project
```

### Windows

**GUI:** Double-click `agent-sandbox.exe` to launch the wizard:

1. **Profiles** — create profiles by picking agents, languages, and plugins. Each profile builds a Docker image.
2. **Launch** — select a project folder and profile, then click Launch. The app scaffolds the project, starts the container, and opens the agent in a new terminal window.

Settings (gear icon) lets you save API keys and pick a default agent.

**CLI:**
```
agent-sandbox setup                            One-time: create default profiles
agent-sandbox sandbox C:\path\to\project       Launch a sandbox
```

## How It Works

1. **Setup** creates profiles -- Docker images tailored to specific agents and languages
2. **Sandbox** launches a container from a profile, mounts your project, and starts the selected agent
3. Your source code is bind-mounted; config, sessions, and caches live in Docker named volumes (prefixed `asb_`)

Each profile generates:
- A `Dockerfile.base` with the selected agents and language runtimes
- A `docker-compose.yml.tpl` with named volumes, ports, and environment
- An `install.sh` entrypoint that auto-installs dependencies on startup
- Agent instruction files (AGENTS.md, CLAUDE.md, .cursorrules) assembled from base + language fragments

## Command Reference

### v2 Commands

| Action | Linux / macOS / WSL | Windows (CLI) |
|--------|---------------------|---------------|
| **Create profile** | `sandbox-setup` | `agent-sandbox setup` |
| **Launch sandbox** | `sandbox-me` (from project dir) | `agent-sandbox sandbox C:\path` |
| **List profiles** | `sandbox-setup --list` | `agent-sandbox profiles` |
| **Delete profile** | `sandbox-setup --delete <name>` | `agent-sandbox profiles delete <name>` |
| **Rebuild profile** | `sandbox-setup --rebuild <name>` | — |
| **Export profile** | `sandbox-setup --export <name> [file]` | Export button on Profiles step |
| **Import profile** | `sandbox-setup --import <file.json>` | Import button on Profiles step |
| **Stop sandbox** | `sandbox-me --stop` | — |
| **Show status** | `sandbox-me --status` | — |
| **Disk usage** | `sandbox-me --stats` | `agent-sandbox stats` |
| **Remove project** | `sandbox-me --remove-project` | `agent-sandbox cleanup <name>` |
| **Clean orphan volumes** | `sandbox-me --cleanup-volumes` | — |
| **Edit override** | `sandbox-me --edit-override` | — |
| **Edit user env** | `sandbox-me --edit-env` | — |

### v1 Commands (still work)

| Action | Linux / macOS / WSL | Windows (CLI) |
|--------|---------------------|---------------|
| **Setup** | `./src/scripts/unix/setup.sh` | `agent-sandbox setup` |
| **Prepare profile** | `prepare` (interactive) | `agent-sandbox prepare C:\path` |
| **Launch sandbox** | `sandbox-<profile> /path` | `agent-sandbox sandbox C:\path` |
| **List projects** | `sandbox-list` | `agent-sandbox list` |
| **Disk usage** | `sandbox-stats` | `agent-sandbox stats` |
| **Remove project** | `sandbox-cleanup <name>` | `agent-sandbox cleanup <name>` |
| **Cleanup with sudo** | `sandbox-cleanup-sudo [name]` | — |

## CLI Agents

The sandbox supports multiple CLI coding agents. During `sandbox-setup` you choose which to install:

| Agent | Command | Description |
|-------|---------|-------------|
| OpenCode | `opencode` | Default agent with oh-my-openagent orchestration |
| Claude Code | `claude` | Anthropic's CLI agent |
| Cursor CLI | `agent` | Cursor's CLI agent |
| GitHub Copilot | `gh copilot agent` | GitHub Copilot CLI |

Agent definitions (commands, install scripts, auth files, env vars) are in `src/sandbox/agents.json`.

## Plugins

Plugins extend the agents with additional capabilities. During `sandbox-setup` you choose which to install (baked into the Docker image) and enable (added to agent config). Definitions are in `src/sandbox/plugins.json`.

### OpenCode plugins

| Plugin | Description |
|--------|-------------|
| [oh-my-openagent](https://github.com/code-yeongyu/oh-my-openagent) | Multi-model orchestration with Sisyphus, Oracle, Librarian agents and `ultrawork` mode |
| [@tarquinen/opencode-dcp](https://www.npmjs.com/package/@tarquinen/opencode-dcp) | Dynamic context pruning — optimizes token usage |
| [speckit-opencode-plugin](https://www.npmjs.com/package/speckit-opencode-plugin) | Specification-driven development workflow |
| [opencode-scheduler](https://www.npmjs.com/package/opencode-scheduler) | Scheduling recurring jobs (launchd/systemd) |
| [opencode-gitlab-duo-agentic](https://www.npmjs.com/package/opencode-gitlab-duo-agentic) | GitLab Duo Agentic workflows |

OpenCode plugins are enabled by adding them to the `"plugin"` array in `opencode.json`. To disable, remove from the array.

### Claude Code plugins

| Plugin | Description |
|--------|-------------|
| code-review | Automated code review |
| security-guidance | Security best practices and vulnerability detection |
| pr-review-toolkit | PR review with structured feedback |
| hookify | Git hooks integration |

Claude Code plugins are managed via the built-in marketplace (`claude plugins install <name>@claude-plugins-official`).

### Custom plugins

During `sandbox-setup` (Unix) or profile creation (Windows GUI), you can enter additional npm packages in the free-text field. These are baked into the Docker image alongside the registry plugins.

```
Install additional npm packages? (space-separated, Enter to skip): my-opencode-plugin @org/tool
```

You can also add packages to an existing profile without recreating it:

```bash
sandbox-setup --add-plugin my-dev my-custom-package
sandbox-setup --rebuild my-dev
```

To enable a custom OpenCode plugin after installation, add it to the `"plugin"` array in the project's `opencode_data/opencode.json`.

## Available Languages

| Language | Detection files | What it adds |
|---|---|---|
| C/C++ | `CMakeLists.txt`, `meson.build`, `configure.ac`, `conanfile.txt`, `vcpkg.json`, `*.c`, `*.cpp`, `*.h`, `*.hpp` | CMake, Ninja, GDB, pkg-config |
| C# / .NET | `*.csproj`, `*.sln`, `*.fsproj`, `global.json`, `*.cs`, `*.fs` | .NET SDK 8.0; auto-runs `dotnet restore` |
| Dart | `pubspec.yaml`, `pubspec.lock`, `*.dart` | Dart SDK; auto-runs `dart pub get` |
| Flutter | `pubspec.yaml` (with `flutter:`) | Flutter SDK + Android SDK (~2GB); auto-runs `flutter pub get` |
| Go | `go.mod`, `go.sum`, `*.go` | golang-go; auto-runs `go mod download` |
| Java | `pom.xml`, `build.gradle`, `build.gradle.kts`, `gradlew`, `mvnw`, `*.java` | OpenJDK 21, Maven; auto-resolves deps |
| Kotlin | `*.kt`, `*.kts` | OpenJDK 21 + Gradle; auto-resolves deps |
| Node.js | `package.json`, `*.js`, `*.ts`, `*.jsx`, `*.tsx` | npm dependency auto-install (always included in base image) |
| PHP | `composer.json`, `composer.lock`, `artisan`, `*.php` | PHP + extensions, Composer; auto-runs `composer install` |
| Python 3 | `requirements.txt`, `setup.py`, `pyproject.toml`, `Pipfile`, `*.py` | python3, venv, pip; auto-installs from requirements.txt |
| React Native | `package.json` (with `react-native`) | React Native CLI; JS/TS dev and Metro bundler |
| Ruby | `Gemfile`, `Gemfile.lock`, `Rakefile`, `*.gemspec`, `*.rb` | Ruby, Bundler; auto-runs `bundle install` |
| Rust | `Cargo.toml`, `Cargo.lock`, `*.rs` | rustup toolchain; auto-runs `cargo fetch` |

Language definitions are in `src/sandbox/languages.json`. Fragments live in `src/sandbox/fragments/languages/`.

## Additions

Optional tools that can be baked into the container image during profile creation. Unlike languages (which provide runtimes) or plugins (which extend agents), additions are standalone services that run alongside the agent.

| Addition | Description | Default Port | Size |
|----------|-------------|-------------|------|
| VS Code Server | Browser-based VS Code editor ([code-server](https://github.com/coder/code-server)) | 4040 | ~300MB |

When enabled, the addition's port is automatically included in the Docker port mappings. VS Code Server starts in the background when the container launches and is accessible at `http://localhost:4040` with no authentication (localhost-only).

VS Code extensions and user data persist across container restarts via named volumes (`asb_vscode_extensions_<project>`, `asb_vscode_data_<project>`).

### VS Code Extensions

When VS Code Server is selected, extensions are automatically installed based on three tiers:

**Always installed:**

| Extension | Description |
|-----------|-------------|
| Code Spell Checker | Catches spelling errors in code and comments |
| Todo Tree | Surfaces TODO/FIXME/HACK annotations across the project |
| Error Lens | Shows errors and warnings inline next to the code |
| EditorConfig | Applies `.editorconfig` settings automatically |
| Prettier | Opinionated formatter for JSON, YAML, Markdown, HTML, CSS |

**Language-specific (installed automatically for selected languages):**

| Language | Extensions |
|----------|-----------|
| Python | Python (IntelliSense), Ruff (linter + formatter), Jupyter |
| Node/JS/TS | ESLint |
| Go | Go (official, includes gopls) |
| Rust | rust-analyzer |
| Java | Language Support for Java, Debugger for Java |
| C/C++ | C/C++ (IntelliSense + debugging) |
| C#/.NET | C# Dev Kit |
| PHP | Intelephense |
| Ruby | Ruby LSP |
| Dart | Dart |
| Flutter | Dart, Flutter |
| Kotlin | Kotlin |

**Optional (opt-in during setup):**

| Extension | Description |
|-----------|-------------|
| GitLens | Git blame, history, comparison (~50MB) |

Extension definitions are in the `extensions` field of `src/sandbox/additions.json`.

Addition definitions are in `src/sandbox/additions.json`. Fragments live in `src/sandbox/fragments/additions/`.

## MCP Servers

MCP servers can be selected during `sandbox-setup` and are baked into the profile image. Available servers are defined in `src/sandbox/mcp-servers.json`:

| Server | Description |
|--------|-------------|
| Filesystem | Read/write access to project files |
| GitHub | GitHub API access (issues, PRs, repos) |
| PostgreSQL | PostgreSQL database access |
| SQLite | SQLite database access |
| Memory | Persistent key-value memory |
| Fetch | HTTP fetch capabilities |

## Ports

Ports are dynamically selected during profile creation. Base ports (3000, 8080) are always included. Language and framework defaults are added automatically. Additions (e.g. VS Code Server on port 4040) add their ports when selected.

### Supported frameworks

| Language | Frameworks | Default ports |
|---|---|---|
| C# / .NET | ASP.NET, Blazor | 5000, 5001 |
| Dart | shelf, dart_frog, Serverpod | 8080, 8081 |
| Flutter | — | 8080 |
| Go | Gin, Fiber, Echo | 8080, 3000, 1323 |
| Java | Spring Boot, Quarkus, Micronaut | 8080 |
| Kotlin | Ktor, Spring Boot | 8080 |
| Node.js | Next.js, Vite, Angular, Express, Nuxt, Svelte, Remix, Astro | 3000, 5173, 4200, 4321, 24678 |
| PHP | Laravel, Symfony, Slim | 8000, 8080 |
| Python | Flask, Django, FastAPI, Streamlit, Gradio, Jupyter | 5000, 8000, 8501, 7860, 8888 |
| React Native | Expo | 8081, 19000, 19001, 19002 |
| Ruby | Rails, Sinatra, Hanami | 3000, 4567, 2300 |
| Rust | Actix, Axum, Rocket | 8080, 3000, 8000 |

### Multiple Sandboxes

You can run multiple sandboxes simultaneously. Auto port remapping: when a port is already in use, it is remapped to the next free port (e.g. `Port 3000 in use -> remapped to 3001:3000`). The container-side port stays the same; only the host-side mapping changes.

## Profile Import/Export

Profiles can be exported to JSON and shared with others:

```bash
# Export a profile to a file
sandbox-setup --export my-profile my-profile.json

# Export to stdout (pipe or redirect)
sandbox-setup --export my-profile > my-profile.json

# Import a shared profile (creates profile + builds Docker image)
sandbox-setup --import shared-profile.json
```

The exported file is a self-contained JSON envelope containing all profile settings (agents, languages, plugins, additions, VS Code extensions, custom Dockerfile lines, startup commands). Recipients only need Docker to import and build.

Windows users can export/import via the **Export** and **Import** buttons on the Profiles step.

## Plugin Discovery

During `sandbox-setup`, after selecting agents, you'll be asked whether to search for popular plugins online. Discovery fetches from curated sources (e.g. awesome-opencode on GitHub) and presents results as a selectable list. Selected packages are added as custom npm plugins.

Discovery results are cached locally for 24 hours in `~/.agent-sandbox/.cache/plugin-discovery/`.

Windows users can click **Discover online plugins...** on the Plugins step.

## Custom Dockerfile & Startup Commands

For expert users, `sandbox-setup` offers (under **Advanced options**):

- **Custom Dockerfile lines**: Arbitrary `RUN` instructions baked into the image (e.g. `RUN apt install -y htop`)
- **Pre-agent startup commands**: Run before the agent starts (e.g. environment setup)
- **Background startup commands**: Run in the background before the agent (e.g. services that must be running when the agent starts)

These are stored in `profile.json` and reproduced on import/export.

> **Note:** Custom Dockerfile lines and startup commands are currently available in the Unix CLI only. Windows GUI support is planned.

## The `.sandbox` File

When using `sandbox-me`, a `.sandbox` file is created in the project root:

```yaml
profile: claude-python
```

This tells `sandbox-me` which profile to use. All customizations go elsewhere:
- Extra env vars: `~/.agent-sandbox/projects/<name>/user.env` (never overwritten, loaded after `runtime.env`)
- Extra ports/volumes: `~/.agent-sandbox/projects/<name>/docker-compose.override.yml` (never overwritten, auto-merged by Docker Compose)

## Volumes

All named Docker volumes are prefixed with `asb_` to avoid collisions:
- `asb_agent_config_<project>` — Agent config (opencode.json, claude settings)
- `asb_agent_data_<project>` — Agent sessions, auth tokens, logs
- `asb_sandbox_data_<project>` — changes.txt, Dockerfile.extension
- `asb_opencode_cache_<project>` — OpenCode cache
- Language-specific volumes (e.g. `asb_venv_<project>`, `asb_cargo_registry_<project>`)
- Addition volumes (e.g. `asb_vscode_extensions_<project>`, `asb_vscode_data_<project>`)

## Config Mirroring

During `sandbox-setup` you choose which host configs to share with the sandbox. Two strategies are used depending on whether the container needs to modify the config:

| Strategy | Behavior | Use case |
|----------|----------|----------|
| **bind-ro** | Read-only bind mount. Host changes reflect instantly. Container cannot modify. | Git config, SSH keys, shell aliases |
| **seed** | Copied into named volume on first run (or when host file is newer). Container can modify its own copy. | Agent auth tokens, agent configs, session data |

### Available mirrors

| Config | Strategy | Security | Description |
|--------|----------|----------|-------------|
| Git config | bind-ro | Low | `~/.gitconfig` — user identity, aliases |
| Global gitignore | bind-ro | Low | `~/.gitignore_global` |
| SSH keys | bind-ro | **High** | `~/.ssh/` — grants sandbox network access |
| Shell aliases | bind-ro | Low | `~/.bash_aliases` |
| npm config | bind-ro | Medium | `~/.npmrc` — may contain registry auth tokens |
| GitHub CLI | seed | **High** | `~/.config/gh/` — OAuth tokens |
| OpenCode config | seed | Medium | `~/.config/opencode/` — settings, model config |
| OpenCode auth | seed | Medium | `~/.local/share/opencode/` — session data |
| Claude Code config | seed | Medium | `~/.claude/` — settings, history, plugins |
| Cursor config | seed | Medium | `~/.cursor/` — CLI settings, chat history |

Only items found on the host are shown during setup. Agent-specific mirrors are filtered by selected agents. Config definitions are in `src/sandbox/config-mirrors.json`.

## Authentication & API Keys

**API key passthrough:** Host environment variables are forwarded via `runtime.env`:
`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `CURSOR_API_KEY`, `GITHUB_COPILOT_API_KEY`, `OPENROUTER_API_KEY`, `OPENCODE_API_KEY`, `GEMINI_API_KEY`

**User overrides:** Add project-specific keys to `user.env` (loaded last, overrides `runtime.env`).

**Windows GUI:** API keys can be entered in the Environment Variables step and are stored encrypted (AES-256, DPAPI-protected key).

## Dockerfile.extension

When the agent needs system packages (e.g. `apt install`), it creates a `Dockerfile.extension` at `/workspace/.sandbox/Dockerfile.extension`. On session end you are prompted to bake the changes into the project Dockerfile.

## How Dependencies Work

- **C/C++**: Build tools ready, no auto-install
- **C# / .NET**: `dotnet restore` on `.csproj`/`.fsproj` changes
- **Dart**: `dart pub get` on `pubspec.yaml` changes
- **Flutter**: `flutter pub get` on `pubspec.yaml` changes
- **Go**: `go mod download` on `go.sum` changes
- **Java**: `mvn dependency:resolve` on `pom.xml` changes
- **Kotlin**: Gradle wrapper resolves on `build.gradle(.kts)` changes
- **Node**: `npm install` on `package.json` changes
- **PHP**: `composer install` on `composer.json` changes
- **Python**: venv created, `requirements.txt` auto-installed on changes
- **React Native**: `npm install` on `package.json` changes (when `react-native` detected)
- **Ruby**: `bundle install` on `Gemfile` changes
- **Rust**: `cargo fetch` on `Cargo.lock` changes

All installs are fingerprinted with md5 checksums and skipped when unchanged.

## Project Structure

```
src/
  sandbox/                           # Language registry, port lookup, templates
    Dockerfile.base.tpl              #   Minimal base: Ubuntu + Node + agents
    languages.json                   #   Language definitions (Dockerfile, volumes, detection)
    ports.json                       #   Framework-to-port lookup
    agents.json                      #   Agent definitions (command, install, auth, plugins)
    plugins.json                     #   Plugin definitions (install, conflicts)
    additions.json                   #   Optional container tools (VS Code Server, etc.)
    mcp-servers.json                 #   MCP server registry (install, command, env_vars)
    instructions.base.md             #   Base agent instructions (language-independent)
    generate_profile.sh              #   Assembles profile from templates + selections
    fragments/
      README.md                      #   How fragments work
      languages/                     #   Per-language fragments
        <lang>.sh                    #     Container startup (dep install, PATH)
        <lang>.agents.md             #     AI agent instructions
      additions/                     #   Per-addition fragments
        <addition>.sh                #     Container startup (launch service)
        <addition>.agents.md         #     AI agent instructions
      agents/                        #   Per-agent fragments
        <agent>.sh                   #     Dockerfile install commands
        <agent>.config/              #     Agent config templates + sync rules
  scripts/
    unix/                            # Host-side scripts (Linux / macOS / WSL)
      sandbox-setup.sh               #   v2: interactive profile builder
      sandbox-me.sh                  #   v2: run from any project dir
      setup.sh                       #   v1: first-time setup
      prepare.sh                     #   v1: interactive profile builder
      sandbox.sh                     #   v1: core sandbox logic
      sandbox-list.sh                #   List projects
      sandbox-stats.sh               #   Disk usage
      sandbox-cleanup.sh             #   Remove projects/volumes
      lib/                           #   Shared bash library
        prereqs.sh                   #     Docker, Compose, jq checks
        config.sh                    #     Profile/project config helpers
        detect.sh                    #     Language, version, port detection
        ui.sh                        #     Terminal UI helpers
        docker.sh                    #     Docker port, build, runtime helpers
        mcp.sh                       #     MCP server config generation
  prepared/                          # Generated profiles (gitignored)
  projects/                          # Per-project runtime data (gitignored)
  templates/                         # Shared config templates

tools/
  build-windows.sh                   # Build Windows exe via Docker
  dist/                              # Build output (gitignored)
  AgentSandbox/                      # Windows C# .NET 8.0 project
    Resources/                       #   Embedded data files (copied from src/sandbox/)
      agents.json, plugins.json, additions.json, mcp-servers.json
      languages.json, ports.json, Dockerfile.base.tpl, AGENTS.md.base
      fragments/                     #   *.sh and *.agents.md
      additions/                     #   Addition fragments (vscode-server.sh, etc.)
      templates/                     #   opencode.json, oh-my-openagent.json
```

## Adding Languages

1. Add entry to `src/sandbox/languages.json`
2. Create `src/sandbox/fragments/languages/<key>.sh` (container startup)
3. Create `src/sandbox/fragments/languages/<key>.agents.md` (agent instructions)
4. Add ports to `src/sandbox/ports.json`
5. Copy to `tools/AgentSandbox/Resources/` and bump `VersionStamp` in `ResourceManager.cs`
6. Update this README

See `src/sandbox/fragments/README.md` for fragment conventions.

## Windows Support

Windows users get a self-contained EXE that packages everything. Only Docker Desktop is required.

### Building the EXE

```bash
# From WSL/Linux/macOS with Docker:
./tools/build-windows.sh              # Full build
./tools/build-windows.sh --check      # Compile check only
```

### v1 to v2 Migration

When the Windows app detects an older version stamp (1.x), it automatically:
- Removes old prepared profiles (templates changed)
- Removes generated project configs (compose files reference old volume names)
- Preserves user data (sessions, logs, Dockerfile.extension)

Profiles need to be recreated after migration.

### Data Location

```
%APPDATA%\AgentSandbox\
  .version                   # Version stamp (triggers re-extraction on update)
  sandbox/                   # Extracted: languages.json, ports.json, agents.json, etc.
    fragments/               # Shell fragments and agent instructions
  templates/                 # opencode.json, oh-my-openagent.json, agent-config.json
  prepared/                  # Generated profiles
  projects/                  # Per-project data
```

## Security

- No Docker socket mounted
- Agent can only see the bind-mounted workspace
- Container isolation is the security boundary
- SSH/GPG key mirroring is opt-in with warnings
