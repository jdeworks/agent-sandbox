# agent-sandbox

Isolated Docker sandbox for AI coding agents. Each project runs inside a locked-down container with [OpenCode](https://opencode.ai/) and the [oh-my-opencode](https://github.com/code-yeongyu/oh-my-opencode) plugin pre-installed. The agent can only see the mounted workspace; all config, caches, and logs persist on the host between sessions.

The sandbox environment is tailored to your project -- you pick the languages you need (Python, Node, Go, Rust, ...) and only those runtimes are installed. Ports are auto-detected based on the frameworks in your project, so dev servers just work.

## Prerequisites

- **Docker** and **Docker Compose** (setup script can install Docker for you)
- **jq** -- install with `sudo apt install -y jq`

## Setup

```bash
./agent-worker/scripts/host/setup.sh
```

Checks for Docker, Docker Compose, and jq. Offers to install Docker if missing. Adds a `prepare` alias to your shell.

## Prepare an Environment

Before you can sandbox a project, you need to prepare a profile that matches your tech stack.

```bash
# Auto-detect languages from a project directory:
prepare

# Or run the prepare script directly:
./agent-worker/scripts/host/prepare.sh
```

The prepare command will:

1. Ask if you want to **auto-detect** languages (scans for `requirements.txt`, `package.json`, `go.mod`, etc.) or **manually pick** from the list
2. **Detect ports** -- scans dependency manifests for known frameworks (Flask, Next.js, FastAPI, Vite, etc.) and selects the right ports automatically
3. Let you review detected ports and add extras
4. Let you name the profile (defaults to the language combo, e.g. `python-node`)
5. Generate a tailored Docker environment in `agent-worker/prepared/<profile>/`
6. Create a `sandbox-<profile>` alias

### Available Languages

| Language | Detection files | What it adds |
|---|---|---|
| C/C++ | `CMakeLists.txt`, `meson.build`, `configure.ac`, `conanfile.txt`, `vcpkg.json` | CMake, Ninja, GDB, pkg-config (gcc/g++/make already in base) |
| C# / .NET | `*.csproj`, `*.sln`, `*.fsproj`, `global.json` | .NET SDK 8.0; auto-runs `dotnet restore` |
| Dart | `pubspec.yaml`, `pubspec.lock` | Dart SDK; auto-runs `dart pub get` |
| Go | `go.mod`, `go.sum` | golang-go; auto-runs `go mod download` |
| Java | `pom.xml`, `build.gradle`, `build.gradle.kts`, `gradlew`, `mvnw` | OpenJDK 21, Maven; auto-resolves Maven/Gradle deps |
| Kotlin | `*.kt` | OpenJDK 21 (Gradle wrapper handles Kotlin compiler); auto-resolves Gradle deps |
| Node.js | `package.json` | npm project dependency auto-install (Node runtime always included for plugins) |
| PHP | `composer.json`, `composer.lock`, `artisan` | PHP + common extensions, Composer; auto-runs `composer install` |
| Python 3 | `requirements.txt`, `setup.py`, `pyproject.toml`, `Pipfile` | python3, venv, pip; auto-installs from requirements.txt |
| Ruby | `Gemfile`, `Gemfile.lock`, `Rakefile`, `*.gemspec` | Ruby, Bundler; auto-runs `bundle install` |
| Rust | `Cargo.toml`, `Cargo.lock` | rustup toolchain; auto-runs `cargo fetch` |

New languages can be added by editing `agent-worker/sandbox/languages.json` and adding matching fragments in `agent-worker/sandbox/fragments/` (see the [fragments README](agent-worker/sandbox/fragments/README.md) for details).

## Quick Start

```bash
# After preparing a profile, sandbox any project:
sandbox-python-node /path/to/my-project

# Or from inside the project directory:
cd ~/my-project && sandbox-python-node .
```

On **first run** for a project the script will:

1. Build the profile's base image (cached if unchanged)
2. Scaffold a project folder under `agent-worker/projects/<name>/` with all config
3. Start the container and launch OpenCode

On **subsequent runs** it reuses the existing project config and starts immediately.

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
      python.sh / python.agents.md   #     Venv creation, pip install + agent instructions
      node.sh / node.agents.md       #     npm install + agent instructions
      go.sh / go.agents.md           #     go mod download + agent instructions
      rust.sh / rust.agents.md       #     cargo fetch + agent instructions
  prepared/                          # Generated profiles (one per language combo)
    <profile>/
      Dockerfile.base                #   Assembled base image
      docker-compose.yml.tpl         #   Compose template with profile-specific volumes + ports
      install.sh                     #   Container entrypoint (assembled from fragments)
      AGENTS.md                      #   Agent instructions (assembled from base + fragments)
      sandbox.sh                     #   Thin wrapper that calls the core sandbox.sh
  templates/                         # Shared config templates (language-independent)
    opencode.json                    #   OpenCode configuration
    oh-my-opencode.json              #   oh-my-opencode agent model overrides
  scripts/
    host/                            # Scripts that run on the host
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

1. **Base ports** (8080, 9229) are always included
2. **Language defaults** are added for each selected language (e.g. Python adds 5000 and 8000)
3. **Framework detection** scans dependency manifests (`requirements.txt`, `package.json`, `go.mod`, `Cargo.toml`) for known frameworks and adds their ports -- for example, detecting `vite` in `package.json` adds 5173 and 24678
4. You can **add extra ports** at the prompt or accept the defaults
5. Only the needed ports end up in the generated `docker-compose.yml.tpl`

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

1. Add an entry to `agent-worker/sandbox/languages.json` with the language key, label, detection files, Dockerfile commands, volume definitions, and PATH additions.
2. Create a matching install fragment at `agent-worker/sandbox/fragments/<key>.sh` with the container startup logic (dependency installation, PATH setup, etc.).
3. Create `agent-worker/sandbox/fragments/<key>.agents.md` with agent instructions for the new language.
4. Add default ports and any framework entries to `agent-worker/sandbox/ports.json`.
5. See `agent-worker/sandbox/fragments/README.md` for conventions and examples.
6. Run `prepare` to generate a new profile that includes the language.

## Security

- No Docker socket mounted
- No privileged mode
- `no-new-privileges` enabled
- Agent can only see the bind-mounted workspace
- Container isolation is the security boundary
