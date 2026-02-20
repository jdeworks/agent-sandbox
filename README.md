# agent-sandbox

Isolated Docker sandbox for AI coding agents. Each project runs inside a locked-down container with [OpenCode](https://opencode.ai/) and the [oh-my-opencode](https://github.com/code-yeongyu/oh-my-opencode) plugin pre-installed. The agent can only see the mounted workspace; all config, caches, and logs persist on the host between sessions.

The sandbox environment is tailored to your project -- you pick the languages you need (Python, Node, Go, Rust, ...) and only those runtimes are installed. Ports are auto-detected based on the frameworks in your project, so dev servers just work.

## Prerequisites

**Linux / macOS / WSL:**
- **Docker** and **Docker Compose** (setup script can install Docker for you)
- **jq** -- install with `sudo apt install -y jq`

**Windows:**
- **Docker Desktop** -- that's it. The self-contained exe handles everything else (see [Windows Support](#windows-support)).

## Setup

```bash
./agent-worker/scripts/unix/setup.sh
```

Checks for Docker, Docker Compose, and jq. Offers to install Docker if missing. Adds a `prepare` alias to your shell.

## Prepare an Environment

Before you can sandbox a project, you need to prepare a profile that matches your tech stack.

```bash
# Auto-detect languages from a project directory:
prepare

# Or run the prepare script directly:
./agent-worker/scripts/unix/prepare.sh
```

The prepare command will:

1. Ask if you want to **auto-detect** languages (scans for `requirements.txt`, `package.json`, `go.mod`, etc. up to 3 levels deep) or **manually pick** from the list
2. **Detect versions** -- scans project files (`.python-version`, `.nvmrc`, `go.mod`, `pom.xml`, etc.) for pinned language versions, with an option to override
3. **Detect ports** -- scans dependency manifests for known frameworks (Flask, Next.js, FastAPI, Vite, etc.) and selects the right ports automatically
4. Let you review detected ports and add extras
5. Let you name the profile (defaults to the language combo, e.g. `python-node`)
6. Generate a tailored Docker environment in `agent-worker/prepared/<profile>/`
7. Create a `sandbox-<profile>` alias

### Available Languages

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

## Quick Start

```bash
# After preparing a profile, sandbox any project:
sandbox-python-node /path/to/my-project

# Or from inside the project directory:
cd ~/my-project && sandbox-python-node .

# Run without arguments to pick from recent projects:
sandbox-python-node
```

On **first run** for a project the script will:

1. Build the profile's base image (cached if unchanged)
2. Scaffold a project folder under `agent-worker/projects/<name>/` with all config
3. Start the container and launch OpenCode

On **subsequent runs** it reuses the existing project config. If the container is already running, you'll be asked to **reattach** (open a new OpenCode session in the existing container) or **rebuild** from scratch.

Running `sandbox-<profile>` **without a path** shows a list of recent projects for that profile, sorted by last used. Pick a number to continue where you left off, or type a new path.

## Project Structure

```
tools/
  build-windows.sh                   # Build the Windows exe via Docker (no local .NET needed)
  dist/                              # Build output (agent-sandbox.exe) -- gitignored
  AgentSandbox/                      # Windows EXE (C# .NET 8.0, self-contained)

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
      setup.sh                       #   First-time setup (Docker, jq, prepare alias)
      prepare.sh                     #   Interactive profile builder (language + port selection)
      sandbox.sh                     #   Core sandbox logic (called by profile wrappers)
      sandbox-list.sh                #   List all projects with status and profile
      sandbox-stats.sh               #   Disk usage and statistics (dynamic volume discovery)
      sandbox-cleanup.sh             #   Remove projects, containers, volumes
  projects/                          # Auto-generated per-project data
    <name>/
      docker-compose.yml, Dockerfile, config.env
      sandbox_data/                  #   → /workspace/.sandbox
        changes.txt                  #     Dependency change log
        Dockerfile.extension         #     Agent-created system changes (transient)
      opencode_data/                 #   → ~/.config/opencode
        opencode.json, oh-my-opencode.json, AGENTS.md
      opencode_sessions/             #   → ~/.local/share/opencode
      logs/                          #   → ~/.local/share/opencode/log
```

## Container Layout

| Host path (relative to project) | Container path | Purpose |
|---|---|---|
| Your workspace folder | `/workspace/src` (workdir) | Source code only |
| `opencode_data/` | `/workspace/.config/opencode` | Global OpenCode config, AGENTS.md, plugin config |
| `opencode_sessions/` | `/workspace/.local/share/opencode` | Session data, auth |
| `logs/` | `/workspace/.local/share/opencode/log` | OpenCode log files |
| `sandbox_data/` | `/workspace/.sandbox` | Dependency log, Dockerfile.extension |

Additional named Docker volumes are created per-profile for caches (venv, pip, npm, cargo, etc.).

## OpenCode Configuration

All OpenCode config lives in the `opencode_data/` directory, which maps to `~/.config/opencode` inside the container (the global config location). This ensures config is always loaded regardless of the workspace's git structure.

- **`opencode.json`** -- Main config (model, compaction, plugins). Loaded as global config.
- **`AGENTS.md`** -- Agent instructions for the sandbox environment. Assembled from the base template plus language-specific fragments, so it only mentions the tools that are actually installed.
- **`oh-my-opencode.json`** -- Model overrides for oh-my-opencode agents (Sisyphus, Oracle, Librarian, etc.).

### oh-my-opencode

The [oh-my-opencode](https://github.com/code-yeongyu/oh-my-opencode) plugin is enabled by default. It provides multi-model orchestration with specialized agents, background tasks, and the `ultrawork` / `ulw` prompt keyword for intensive autonomous coding sessions.

To disable it for a project, remove `"oh-my-opencode"` from the `plugin` array in that project's `opencode_data/opencode.json`.

## Logs

OpenCode log files are persisted in the project's `logs/` directory. After a session:

```bash
ls agent-worker/projects/<name>/logs/
```

For more verbose output, run OpenCode with `opencode --log-level DEBUG`.

## Ports

Ports are **dynamically selected** during `prepare` based on the languages and frameworks detected in your project. The system uses `agent-worker/sandbox/ports.json` as a lookup table.

### How port detection works

1. **Base ports** (3000, 8080) are always included -- 3000 covers the most common dev server default and Node.js is always available in the base image
2. **Language defaults** are added for each selected language (e.g. Python adds 5000 and 8000)
3. **Framework detection** scans dependency manifests (`requirements.txt`, `package.json`, `go.mod`, `Cargo.toml`) for known frameworks and adds their ports -- for example, detecting `vite` in `package.json` adds 5173 and 24678. **Node.js framework detection always runs** (even if Node wasn't explicitly selected) because Node is part of the base image and frontend tooling can appear in any project
4. You can **add extra ports** at the prompt or accept the defaults
5. Only the needed ports end up in the generated `docker-compose.yml.tpl`

> **Note:** If you add a new framework or language to a project after the initial `prepare` (e.g. adding a React frontend to a Python-only sandbox), re-run `prepare` to update port forwarding and language tooling. The agent is instructed to remind you of this via `AGENTS.md`.

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

## Dockerfile.extension

When the agent needs system-level packages (e.g. `apt install`), it creates a `Dockerfile.extension` file at `/workspace/.sandbox/Dockerfile.extension` inside the container. This maps to `projects/<name>/sandbox_data/Dockerfile.extension` on the host -- never polluting your source code directory.

When the OpenCode session ends, you'll be prompted to bake those changes into the project's Dockerfile. If you accept, the container is stopped so the next run triggers a rebuild with the new layers. The extension file is then removed automatically. You can also defer -- the prompt will reappear before the next startup.

## Helper Scripts

```bash
# List all sandboxed projects with status, profile, and workspace path
sandbox-list

# Show disk usage: base images, per-project volumes, Docker overview
sandbox-stats

# Remove all projects, containers, and volumes
sandbox-cleanup

# Also remove all agent-sandbox images
sandbox-cleanup --all
```

The helper scripts discover volumes dynamically from each project's `docker-compose.yml`, so they work correctly regardless of which languages a profile includes.

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

From WSL or any Linux/macOS host with Docker:

```bash
./tools/build-windows.sh
```

This cross-compiles from the Linux .NET 8.0 SDK image (the Windows Desktop targeting pack for WinForms is pulled from NuGet automatically). The output is a single `tools/dist/agent-sandbox.exe`.

Alternatively, on Windows with the .NET 8.0 SDK installed:

```powershell
cd tools\AgentSandbox
dotnet publish -c Release -o ..\dist
```

### Usage

**Double-click** the exe (or run without arguments) to open the GUI wizard:

1. **Folder picker** -- Browse button opens a native Windows folder dialog (handles paths with spaces correctly)
2. **Recent Projects** -- previously launched projects are listed below the folder picker, sorted by last used. Select one and click "Continue with Selected" to quick-launch without re-running detection
3. **Scan** -- for new projects, auto-detects languages, versions, frameworks, and ports
4. **Review** -- checkboxes for languages, editable version fields, editable port list, profile name
5. **Launch** -- generates the profile, builds the Docker image, scaffolds the project, and attaches to the container

The wizard can also be pre-filled with a path:

```
agent-sandbox C:\path\to\project
```

**CLI mode** (for terminal / scripting) is available via explicit subcommands:

```
agent-sandbox prepare C:\project     Prepare a profile without launching
agent-sandbox sandbox C:\project     Launch using an existing profile
agent-sandbox sandbox                Pick from recent projects
agent-sandbox list                   List all projects
agent-sandbox stats                  Show disk usage
agent-sandbox cleanup [<project>]    Remove a project (or --all)
agent-sandbox help                   Show this help
```

### Data location

All data is stored under `%APPDATA%\AgentSandbox\`:

```
%APPDATA%\AgentSandbox\
  .version                   # Tracks embedded resource version
  sandbox/                   # Extracted from exe: languages.json, ports.json, templates
    fragments/               # Shell fragments and agent instruction fragments
  templates/                 # opencode.json, oh-my-opencode.json
  prepared/                  # Generated profiles (same as unix)
  projects/                  # Per-project data (compose files, config, logs)
```

### Project structure (tools)

```
tools/
  build-windows.sh                   # Build the exe via Docker (no local .NET needed)
  dist/                              # Build output (gitignored)
  AgentSandbox/                      # C# .NET 8.0 project
    AgentSandbox.csproj              #   Self-contained single-file publish config
    Program.cs                       #   Entry point: routes to GUI wizard or CLI mode
    Cli.cs                           #   CLI subcommands (prepare, sandbox, list, stats, cleanup)
    Models/                          #   DTOs for languages.json, ports.json, ProfileSpec
    Services/                        #   Detection, generation, Docker, scaffolding, resources
    UI/
      WizardForm.cs                  #   WinForms wizard (folder picker, recent projects, detection, launch)
    Resources/                       #   Embedded data files (copied from sandbox/)
      languages.json, ports.json, Dockerfile.base.tpl, AGENTS.md.base
      fragments/                     #   *.sh and *.agents.md
      templates/                     #   opencode.json, oh-my-opencode.json
```

## Security

- No Docker socket mounted
- No privileged mode
- `no-new-privileges` enabled
- Agent can only see the bind-mounted workspace
- Container isolation is the security boundary
