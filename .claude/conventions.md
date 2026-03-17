# Code Conventions

## Shell Scripts (Unix)

- Always `set -e` at the top
- Use functions to organize logic
- Quote all variables: `"$var"` not `$var`
- Use `$()` for command substitution, never backticks
- All generated files must use LF line endings

## C# (Windows)

- Target .NET 8.0
- File-scoped namespaces
- Nullable reference types enabled
- No unnecessary comments
- All generated files must use LF line endings

## Fragment Conventions

Fragments live in `src/sandbox/fragments/languages/` and run **inside the Docker container** at startup (not on the host).

### Shell fragments (`<key>.sh`)

- Start with a section header comment (`########################################`)
- Must be idempotent — safe to run on every container startup
- Use md5 checksums to skip redundant installs (see existing fragments for the pattern)
- Export any PATH additions needed at runtime
- Handle the case where the manifest file does not exist

### Agent instruction fragments (`<key>.agents.md`)

- Start with a `## <Language> Environment` heading
- Tell the AI agent what it needs to know about the language setup in this sandbox
- Do not repeat information already in `instructions.base.md`

## Generated File Assembly

During `prepare`, the profile generator reads fragment files and assembles them:

```
fragments/python.sh + fragments/node.sh  →  prepared/<profile>/install.sh
instructions.base.md + python.agents.md        →  prepared/<profile>/AGENTS.md
Dockerfile.base.tpl + language blocks     →  prepared/<profile>/Dockerfile.base
```

## Configuration Files

### `languages.json`

Each language entry requires: `label`, `detect` (file patterns), `default_version`, `version_detect` (regex rules), `dockerfile` (and optionally `version_dockerfile`), `volumes`, `path_prepend`.

### `ports.json`

Structure: `base_ports` (always included), per-language `defaults`, and `frameworks` (pattern-based detection in project files).

Port detection always runs Node.js framework detection since Node is in the base image.
