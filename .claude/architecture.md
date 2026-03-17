# Architecture

## Dual Implementation

Two parallel implementations consume the same source-of-truth data files under `src/sandbox/`:

### Unix (Linux / macOS / WSL)

Bash scripts in `src/scripts/unix/` using `jq` for JSON parsing.

| Script | Role |
|--------|------|
| `setup.sh` | First-time setup: Docker check, jq install, alias registration |
| `prepare.sh` | Interactive profile builder: language selection, version/port detection |
| `sandbox.sh` | Core container lifecycle: scaffold, build, run, reattach, rebuild |
| `sandbox-list.sh` | List existing projects |
| `sandbox-stats.sh` | Disk usage stats |
| `sandbox-cleanup.sh` | Remove projects, volumes, images |

Profile generation: `src/sandbox/generate_profile.sh`

### Windows (Self-contained C# exe)

.NET 8.0 app in `tools/AgentSandbox/` with two modes:

- **GUI** (default): WinForms wizard — `UI/WizardForm.cs`
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
| `ResourceManager.cs` | Extract embedded resources, version tracking |

## Data Flow

```
User picks project folder
  → Language detection (file pattern matching against languages.json)
  → Version detection (regex on manifests like .python-version, pom.xml)
  → Port detection (framework matching against ports.json)
  → Profile generation:
      Dockerfile.base.tpl + language dockerfile blocks → Dockerfile.base
      Fragment .sh files concatenated → install.sh
      AGENTS.md.base + language .agents.md fragments → AGENTS.md
      docker-compose.yml.tpl with volumes, ports, env → docker-compose.yml
  → Project scaffold (config.env, runtime.env, data dirs)
  → Docker build & run
```

## File Relationships

```
SOURCE OF TRUTH (src/sandbox/)    WINDOWS COPY (tools/AgentSandbox/Resources/)
  languages.json             ─────────>      languages.json
  ports.json                 ─────────>      ports.json
  Dockerfile.base.tpl        ─────────>      Dockerfile.base.tpl
  AGENTS.md.base             ─────────>      AGENTS.md.base
  fragments/languages/*.sh   ─────────>      fragments/*.sh
  fragments/languages/*.agents.md ────>      fragments/*.agents.md

SOURCE OF TRUTH (src/templates/)
  opencode.json              ─────────>      templates/opencode.json
  oh-my-opencode.json        ─────────>      templates/oh-my-opencode.json
  agent-config.json          ─────────>      templates/agent-config.json
```

Always edit the source first, then copy to Resources.

## Supported Languages (11)

Defined in `languages.json` with detection patterns, default versions, Dockerfile commands, volumes, and PATH setup:

C/C++, Dart, C#/.NET, Go, Java, Kotlin, Node.js, PHP, Python 3, Ruby, Rust

## Key Directories

- `src/sandbox/` — Config source of truth (languages.json, ports.json, templates, fragments)
- `src/sandbox/fragments/languages/` — Per-language startup scripts (.sh) and agent instructions (.agents.md)
- `src/scripts/unix/` — Host-side bash scripts
- `src/templates/` — OpenCode agent config templates
- `src/prepared/` — Generated profiles (gitignored output)
- `src/projects/` — Per-project runtime data (gitignored output)
- `tools/AgentSandbox/` — Windows C# implementation
- `tools/AgentSandbox/Resources/` — Embedded copies of sandbox/ files for Windows exe
- `tests/` — Test suite
