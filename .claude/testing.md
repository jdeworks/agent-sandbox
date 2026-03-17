# Testing

## Running Tests

From the repo root:

```bash
./tests/run-tests.sh
```

No Docker required — tests use file-based assertions against the generation logic.

## Test Structure

The test suite (`tests/run-tests.sh`) has 148 tests organized into sections:

### Sections 1-8: v1 Core Functionality

- `prepare.sh`: auto-suffix logic, alias handling
- `sandbox.sh`: project scaffolding, Dockerfile.extension handling, port remapping
- `setup.sh`: alias creation, Docker/jq checks
- Profile generation, configuration files, templates
- C# Windows project structure and services
- Documentation checks

### Section 9: Build & Integration

- Windows build script exists
- Required C# services exist

### Section 10: v2 Architecture (68 tests)

- **10.1**: JSON config files (agents.json, plugins.json, mcp-servers.json)
- **10.2**: Fragment directory structure (languages/ + agents/ subdirs)
- **10.3**: Shared bash library (all lib files, syntax validation)
- **10.4**: v2 scripts (sandbox-setup.sh, sandbox-me.sh, syntax checks)
- **10.5**: Profile name validation unit tests (7 cases)
- **10.6**: Mobile development (Flutter + React Native entries, size warnings)
- **10.7**: Volume naming (asb_ prefix in compose generation)
- **10.8**: File renames (instructions.base.md replaces AGENTS.md.base)
- **10.9**: Windows resource sync (new config files, VersionStamp 2.0.0)
- **10.10**: End-to-end profile generation test

## Adding Tests

Tests use simple bash assertions:

- `log_pass "description"` — record a passing test
- `log_fail "description"` — record a failing test
- `log_skip "description"` — record a skipped test

Temp files go in `$TEMP_DIR` (auto-cleaned).

## What to Test

When adding features or modifying logic:

1. Detection patterns match expected files
2. Version extraction works for the language's manifest format
3. Dockerfile assembly includes the correct blocks
4. Fragment concatenation produces valid install.sh
5. Port detection finds the right frameworks
6. Profile name validation covers edge cases
7. Compose generation uses `asb_` volume prefix and includes `user.env`
8. JSON config files are valid
9. All bash scripts pass `bash -n` syntax checks
