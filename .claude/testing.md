# Testing

## Running Tests

From the repo root:

```bash
./tests/run-tests.sh
```

No Docker required — tests use file-based assertions against the generation logic.

## Test Structure

The test suite (`tests/run-tests.sh`) is organized into sections:

### Section 1: Unix Shell Scripts — Core Functionality

- `prepare.sh`: auto-suffix logic, alias handling, profile deletion with dependency checking
- `sandbox.sh`: project scaffolding, Docker config generation, Dockerfile.extension handling
- `sandbox-list.sh`: project listing and filtering

### Section 2: Profile Generation

- Dockerfile assembly (language layers, version blocks)
- Docker Compose generation (volumes, ports, env vars)
- `install.sh` assembly (fragment concatenation)
- `AGENTS.md` assembly (base + language-specific fragments)

### Section 3: Detection Logic

- Language detection (file pattern matching)
- Version detection (regex extraction from manifests)
- Port detection (framework matching)

### Section 4: Windows exe tests

Runs if the Windows binary is available.

## Adding Tests

Tests use simple bash assertions with helper functions:

- `log_pass "description"` — record a passing test
- `log_fail "description"` — record a failing test
- `log_skip "description"` — record a skipped test

Temp files go in `$TEMP_DIR` (auto-cleaned). Test profiles go in `$PREPARED_DIR/test-lang*` (auto-cleaned).

## What to Test

When adding a new language or modifying detection/generation logic, ensure tests cover:

1. Detection patterns match expected files
2. Version extraction works for the language's manifest format
3. Dockerfile assembly includes the correct blocks
4. Fragment concatenation produces valid install.sh
5. Port detection finds the right frameworks
