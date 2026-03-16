# Agent Sandbox

Docker sandbox environment for AI coding agents (OpenCode, Claude Code, Cursor CLI, GitHub Copilot). Runs projects in isolated, language-tailored containers with auto-detected ports and persistent config.

## Quick Reference

- **Run tests**: `./tests/run-tests.sh`
- **Source of truth**: `agent-worker/sandbox/` (config, templates, fragments)
- **Unix scripts**: `agent-worker/scripts/unix/`
- **Windows app**: `tools/AgentSandbox/` (C# .NET 8.0)

## Key Principle

This repo has **two parallel implementations** (Unix bash + Windows C#) that must stay in sync. Before making changes, read `.claude/cross-platform-sync.md`.

## Documentation Files

| File | Purpose |
|------|---------|
| `.claude/architecture.md` | System architecture, entry points, data flow |
| `.claude/cross-platform-sync.md` | What to update when changing shared concerns |
| `.claude/conventions.md` | Code style, fragment conventions, file formats |
| `.claude/testing.md` | Test suite, how to run and extend tests |
