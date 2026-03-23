# Agent Sandbox

Docker sandbox environment for AI coding agents (OpenCode, Claude Code, Cursor CLI, GitHub Copilot). Runs projects in isolated, language-tailored containers with auto-detected ports and persistent config.

## Quick Reference

- **Run tests**: `./tests/run-tests.sh`
- **Source of truth**: `src/sandbox/` (config, templates, fragments)
- **Unix scripts**: `src/scripts/unix/`
- **Windows app**: `tools/AgentSandbox/` (C# .NET 8.0)

## Key Principles

- This repo has **two parallel implementations** (Unix bash + Windows C#) that must stay in sync. Before making changes, read `.claude/cross-platform-sync.md`.
- **Always work on the `dev` branch.** Never commit directly to `main`.

## Pre-Commit Checklist

Before every commit:

1. **README.md must be up to date** — verify all sections affected by your changes are accurate. Spawn an Explore agent to audit the README against the codebase if substantial changes were made.
2. **Tests must cover the changes** — add specific tests for every feature/fix implemented. Existing tests must still pass (`./tests/run-tests.sh`).
3. **Windows build must pass** — run `tools/build-windows.sh` to verify C# compiles.
4. **Cross-platform sync** — if you changed shared concerns (fragments, configs, templates), verify both Unix and C# implementations match.

## Documentation Files

| File | Purpose |
|------|---------|
| `.claude/architecture.md` | System architecture, entry points, data flow |
| `.claude/cross-platform-sync.md` | What to update when changing shared concerns |
| `.claude/conventions.md` | Code style, fragment conventions, file formats |
| `.claude/testing.md` | Test suite, how to run and extend tests |
