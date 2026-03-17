# Cross-Platform Sync Checklist

Both Unix (bash) and Windows (C#) implementations must stay in sync. Use this checklist before committing.

## Adding or Modifying a Language

All of the following locations MUST be updated together:

1. `src/sandbox/languages.json` — language definition
2. `src/sandbox/fragments/languages/<key>.sh` — container startup fragment
3. `src/sandbox/fragments/languages/<key>.agents.md` — agent instruction fragment
4. `src/sandbox/ports.json` — default ports and framework detection rules
5. `tools/AgentSandbox/Resources/languages.json` — copy of (1)
6. `tools/AgentSandbox/Resources/ports.json` — copy of (4)
7. `tools/AgentSandbox/Resources/fragments/<key>.sh` — copy of (2)
8. `tools/AgentSandbox/Resources/fragments/<key>.agents.md` — copy of (3)
9. `src/sandbox/fragments/README.md` — update "Available languages" table
10. `README.md` — update languages table, frameworks table, dependencies list

After copying to `tools/AgentSandbox/Resources/`, bump `VersionStamp` in `tools/AgentSandbox/Services/ResourceManager.cs`.

## Adding or Modifying an Agent

1. `src/sandbox/agents.json` — agent definition
2. `src/sandbox/fragments/agents/<agent>.sh` — Dockerfile install commands
3. `src/sandbox/fragments/agents/<agent>.config/sync-rules.json` — auth/config sync rules
4. `tools/AgentSandbox/Resources/agents.json` — copy of (1)
5. `tools/AgentSandbox/Resources/fragments/<agent>.sh` — copy of (2)

After copying, bump `VersionStamp` in `ResourceManager.cs`.

## Modifying Templates or Config Files

Each source file must be copied to its Windows Resources counterpart:

| Source | Windows Copy |
|--------|-------------|
| `src/sandbox/Dockerfile.base.tpl` | `tools/AgentSandbox/Resources/Dockerfile.base.tpl` |
| `src/sandbox/instructions.base.md` | `tools/AgentSandbox/Resources/AGENTS.md.base` |
| `src/sandbox/agents.json` | `tools/AgentSandbox/Resources/agents.json` |
| `src/sandbox/plugins.json` | `tools/AgentSandbox/Resources/plugins.json` |
| `src/sandbox/mcp-servers.json` | `tools/AgentSandbox/Resources/mcp-servers.json` |
| `src/templates/opencode.json` | `tools/AgentSandbox/Resources/templates/opencode.json` |
| `src/templates/oh-my-openagent.json` | `tools/AgentSandbox/Resources/templates/oh-my-openagent.json` |
| `src/templates/agent-config.json` | `tools/AgentSandbox/Resources/templates/agent-config.json` |

## Modifying Profile Generation Logic

Logic exists in two places that must be kept in sync:

- `src/sandbox/generate_profile.sh` (bash)
- `tools/AgentSandbox/Services/ProfileGenerator.cs` (C#)

This covers Dockerfile assembly, compose generation, install.sh assembly, and AGENTS.md assembly.

Note: compose template includes `HOST_UID`/`HOST_GID` (Unix only). `sandbox.sh` substitutes these on Unix; `ProjectScaffolder.cs` replaces them with empty string on Windows.

## Modifying Detection Logic

Detection logic exists in two places:

- `src/scripts/unix/prepare.sh` (bash)
- `tools/AgentSandbox/Services/LanguageDetector.cs`, `VersionDetector.cs`, `PortDetector.cs` (C#)

## Modifying Sandbox Orchestration

- `src/scripts/unix/sandbox.sh` (bash)
- `tools/AgentSandbox/UI/WizardForm.cs` (C# GUI) — `RunCoreLaunch()`
- `tools/AgentSandbox/Cli.cs` (C# CLI) — `RunSandbox()`
- `tools/AgentSandbox/Services/DockerRunner.cs`, `ProjectScaffolder.cs` (C#)

## Modifying Helper Commands (list, stats, cleanup)

- `src/scripts/unix/sandbox-list.sh`, `sandbox-stats.sh`, `sandbox-cleanup.sh` (bash)
- `src/scripts/unix/setup.sh` — registers sudo/prepared cleanup aliases
- `tools/AgentSandbox/Cli.cs` — `RunList()`, `RunStats()`, `RunCleanup()`, `RunCleanupPrepared()` (C#)

## Modifying Port Detection

Port detection always includes Node.js frameworks (since Node is in the base image):

- `src/scripts/unix/prepare.sh` — `fw_detect_langs` always includes `node`
- `tools/AgentSandbox/Services/PortDetector.cs` — `fwDetectLangs` always includes `node`

## Modifying Recent-Projects / Project Memory

Recent projects are discovered by scanning `projects/*/config.env` (no separate registry):

- `src/scripts/unix/sandbox.sh` — scans when no path argument given
- `tools/AgentSandbox/Services/ProjectScaffolder.cs` — `GetRecentProjects()`
- `tools/AgentSandbox/UI/WizardForm.cs` — `PopulateRecentProjects()`
- `tools/AgentSandbox/Cli.cs` — `RunSandbox()` picker

## Documentation Sync

Three docs must stay in sync with code:

- `README.md` — languages table, frameworks table, dependency list, project structure, helper commands
- `src/sandbox/fragments/README.md` — fragment conventions and per-language table
- `.cursorrules` — architecture notes and sync checklist (keep aligned with these CLAUDE.md files)
