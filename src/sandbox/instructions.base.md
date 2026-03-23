# Sandbox Agent Instructions

You are running inside an isolated container sandbox. The project root is the current directory.

## Getting Started

This is a **sandboxed Docker container** — it is safe to experiment freely.
Any changes you make cannot affect the host machine. If something breaks,
the container can simply be restarted from a clean state.

- **Install packages**: Use `apt-get`, `npm`, `pip`, etc. directly. Record
  system packages in `Dockerfile.extension` so they persist across restarts.
- **Run commands**: All shell commands execute inside the container. You have
  full root access.
- **Dev servers**: Start servers on `0.0.0.0` using one of the published
  ports (see "Available Ports" below). The user accesses them at
  `http://localhost:<port>` on their machine.
- **File changes**: Edits to project files in the current directory are
  immediately reflected on the host (it's a shared volume mount).

## ⚠️ CRITICAL: Read Before Making ANY Changes

This environment is ephemeral. Changes made inside the container are NOT persistent
unless you explicitly record them in the correct format. Failure to follow these
instructions will result in LOST WORK when the container restarts.

## Socratic Method

For development tasks, follow the Socratic method in `./socratic.md`.

---

## 📁 Change Recording Files

| File | Purpose | Format |
|------|---------|--------|
| `/workspace/.sandbox/changes.txt` | High-level activity log | Human-readable |
| `/workspace/.sandbox/Dockerfile.extension` | Dockerfile RUN commands | Dockerfile syntax |

---

## ✅ MANDATORY: Recording Package Manager Changes

For npm, pip, cargo, gem, composer, etc.:

1. Update the project's manifest file (package.json, requirements.txt, etc.)
2. IMMEDIATELY append to `/workspace/.sandbox/changes.txt`:
   ```
   YYYY-MM-DD Added <packages> to <manifest-file>
   ```

### Examples:
```
2026-02-27 Added bullmq@5.1.0, ioredis@5.3.2 to apps/worker/package.json
2026-02-27 Added pytest==8.0.0 to requirements.txt
2026-02-27 Added serde, tokio to Cargo.toml
```

---

## ⚠️ MANDATORY: Recording System Changes

For apt-get, apk, yum, dnf, zypper:

### Step 1: Create Dockerfile.extension (BEFORE running apt)
```bash
# Example: Installing postgresql
echo "RUN apt-get update && apt-get install -y postgresql" > /workspace/.sandbox/Dockerfile.extension
```

### Step 2: Record in changes.txt
```
2026-02-27 Installed postgresql via apt-get
```

### ⚡ CRITICAL RULES:
- ALWAYS use valid Dockerfile RUN command syntax
- The command will be appended directly to the project Dockerfile
- Without this file, your apt-get changes will be LOST on restart

### Examples - DO THIS:
```bash
# GOOD - Changes persist after restart
echo "RUN apt-get update && apt-get install -y postgresql" > /workspace/.sandbox/Dockerfile.extension
echo "2026-02-27 Installed postgresql via apt-get" >> /workspace/.sandbox/changes.txt
apt-get update && apt-get install -y postgresql
```

### Examples - DON'T DO THIS:
```bash
# BAD - Changes disappear after restart!
apt-get install -y postgresql
# (No Dockerfile.extension created - changes lost)
```

---

## 🔍 Verification

At any time, verify your changes are recorded:
```bash
cat /workspace/.sandbox/changes.txt           # Check activity log
cat /workspace/.sandbox/Dockerfile.extension  # Check Dockerfile commands
```

---

## 🚨 What Happens On Session End

1. Script checks if container is still running
2. IF container NOT running → Auto-bake:
   - Appends Dockerfile.extension RUN commands to project Dockerfile
   - Appends changes.txt to project log
   - Deletes Dockerfile.extension
3. IF container still running → Prompt user:
   - "Container running. Bake changes now? [Y/n]"
   - If user skips, changes remain for next session
```

---

## Pre-installed Tools

The following are **always available** in the base image regardless of which
languages were selected during setup. **Do NOT reinstall them** via apt or
Dockerfile.extension:

- **Node.js** and **npm** (used by OpenCode and plugins)
- **git**, **curl**, **wget**, **build-essential** (gcc, g++, make)

If you need to run `npm install` or `npx`, just use them directly -- they
are already on the PATH.

## Dev Servers

When starting dev servers (backend, frontend, API, etc.), bind to `0.0.0.0` (not only `127.0.0.1`) so they are reachable from the host.

## Command Safety

Your bash/shell tool runs commands **non-interactively** — there is no stdin
attached. Commands that prompt for confirmation (e.g. `rm` on write-protected
files, `apt-get` without `-y`) will **hang indefinitely**.

- **Always ask the user** before running destructive commands (delete, overwrite,
  format). Use your own permission/approval UI — do not rely on shell prompts.
- For package managers: use `-y` or `--yes` flags (`apt-get install -y`, etc.)
- For file operations: use `-f` when you have confirmed with the user
- If a command hangs, it is likely waiting for stdin — cancel and retry with
  appropriate flags.

## Container Environment

You are running inside a Docker container. Key differences from a normal dev machine:

- **Ports**: Dev servers bind to `0.0.0.0` inside the container. The user
  accesses them at `http://localhost:<port>` on their host machine. Only the
  ports listed in "Available Ports" below are forwarded — if you need a port
  that isn't listed, tell the user to re-run sandbox preparation.
- **No desktop/GUI**: There is no display server. Do NOT attempt to open a
  browser with `xdg-open` or similar. Headless browsers (Playwright, Puppeteer
  in headless mode) work fine for testing.
- **Network**: `localhost` inside the container refers to the container itself,
  not the user's machine. External network access (npm registry, APIs) works
  normally.
- **File system**: Only the current directory is mapped to the user's project.
  Changes outside this directory (and outside recorded Dockerfile.extension
  commands) are lost on restart.

## Adding New Languages or Frameworks

If you introduce a new language or framework that was **not part of the
original sandbox setup** (e.g. adding a React frontend to a Python-only
project, or adding a Go microservice), **tell the user** they need to
re-run the sandbox preparation step (`prepare`) so that:

- additional port-forwarding rules are applied (e.g. Vite 5173, Angular 4200),
- the required language runtimes are installed in the container, and
- the AGENTS.md is updated with language-specific guidance.

The sandbox will keep working for the already-configured stack, but the
new tooling won't be available until the environment is re-prepared.

