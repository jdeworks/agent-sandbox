# Architecture

## Dual Implementation

Two parallel implementations consume the same source-of-truth data files under `src/sandbox/`:

### Unix (Linux / macOS / WSL)

Bash scripts in `src/scripts/unix/` using `jq` for JSON parsing.

| Script | Role |
|--------|------|
| `sandbox-setup.sh` | v2: Interactive profile builder (agents, plugins, languages, MCP) |
| `sandbox-me.sh` | v2: Run from any project dir, reads `.sandbox` file |
| `setup.sh` | v1: First-time setup: Docker check, jq install, alias registration |
| `prepare.sh` | v1: Interactive profile builder: language selection, version/port detection |
| `sandbox.sh` | v1: Core container lifecycle: scaffold, build, run, reattach, rebuild |
| `sandbox-list.sh` | List existing projects |
| `sandbox-stats.sh` | Disk usage stats |
| `sandbox-cleanup.sh` | Remove projects, volumes, images |

Shared library: `src/scripts/unix/lib/` (prereqs, config, detect, ui, docker, mcp)

Profile generation: `src/sandbox/generate_profile.sh`

### Windows (Self-contained C# exe)

.NET 8.0 app in `tools/AgentSandbox/` with two modes:

- **GUI** (default): WinForms wizard — `UI/WizardForm.cs` + `UI/SetupForm.cs` (v2 profile builder)
- **CLI** (subcommands): Console-based — `Cli.cs`

Key services in `tools/AgentSandbox/Services/`:

| Service | Role |
|---------|------|
| `LanguageDetector.cs` | Find files matching detection patterns |
| `VersionDetector.cs` | Extract version from manifests via regex |
| `PortDetector.cs` | Map frameworks to ports from ports.json |
| `ProfileGenerator.cs` | Assemble Dockerfile, compose, install.sh, AGENTS.md |
| `ProjectScaffolder.cs` | Create project directory, handle remapping, recent projects |
| `DockerRunner.cs` | Execute docker commands, wait for readiness |
| `ResourceManager.cs` | Extract embedded resources, version tracking, v1→v2 migration |

## Data Flow

```
User picks project folder
  → Language detection (file pattern matching against languages.json)
  → Version detection (regex on manifests like .python-version, pom.xml)
  → Port detection (framework matching against ports.json)
  → Profile generation:
      Dockerfile.base.tpl + language dockerfile blocks → Dockerfile.base
      Fragment .sh files concatenated → install.sh
      instructions.base.md + language .agents.md fragments → AGENTS.md
      docker-compose.yml.tpl with volumes, ports, env → docker-compose.yml
  → Project scaffold (config.env, runtime.env, user.env, data dirs)
  → Docker build & run
```

## File Relationships

```
SOURCE OF TRUTH (src/sandbox/)              WINDOWS COPY (tools/AgentSandbox/Resources/)
  languages.json                ─────────>    languages.json
  ports.json                    ─────────>    ports.json
  agents.json                   ─────────>    agents.json
  plugins.json                  ─────────>    plugins.json
  mcp-servers.json              ─────────>    mcp-servers.json
  Dockerfile.base.tpl           ─────────>    Dockerfile.base.tpl
  instructions.base.md          ─────────>    AGENTS.md.base
  fragments/languages/*.sh      ─────────>    fragments/*.sh
  fragments/languages/*.agents.md ────────>   fragments/*.agents.md

SOURCE OF TRUTH (src/templates/)
  opencode.json                 ─────────>    templates/opencode.json
  oh-my-openagent.json           ─────────>    templates/oh-my-openagent.json
  agent-config.json             ─────────>    templates/agent-config.json
```

Always edit the source first, then copy to Resources.

## Supported Languages (13)

Defined in `languages.json` with detection patterns, default versions, Dockerfile commands, volumes, and PATH setup:

| Key | Label |
|-----|-------|
| `cpp` | C/C++ |
| `dart` | Dart |
| `dotnet` | C# / .NET |
| `flutter` | Flutter (+ Android SDK, ~2GB) |
| `go` | Go |
| `java` | Java |
| `kotlin` | Kotlin |
| `node` | Node.js (always included) |
| `php` | PHP |
| `python` | Python 3 |
| `react-native` | React Native (+ Android SDK + NDK, ~4GB) |
| `ruby` | Ruby |
| `rust` | Rust |

## Key Directories

- `src/sandbox/` — Config source of truth (languages.json, ports.json, agents.json, plugins.json, mcp-servers.json, fragments)
- `src/sandbox/fragments/languages/` — Per-language startup scripts (.sh) and agent instructions (.agents.md)
- `src/sandbox/fragments/agents/` — Per-agent install scripts and config templates
- `src/scripts/unix/` — Host-side bash scripts
- `src/scripts/unix/lib/` — Shared bash library
- `src/templates/` — OpenCode agent config templates
- `src/prepared/` — Generated profiles (gitignored output)
- `src/projects/` — Per-project runtime data (gitignored output)
- `tools/AgentSandbox/` — Windows C# implementation
- `tools/AgentSandbox/Resources/` — Embedded copies of sandbox/ files for Windows exe
- `tests/` — Test suite
