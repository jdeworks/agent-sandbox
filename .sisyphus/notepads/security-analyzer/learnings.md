# Security Analyzer - Learning Log

## Session 1 - 2026-02-25

### Architecture Decisions
- Using npm workspaces for monorepo (simpler than turborepo)
- PostgreSQL for database (no auth - local use)
- Node.js + Express backend with BullMQ for workers
- React + Vite + shadcn/ui frontend

### Scanner Strategy
- Adaptive input detection (git/local/URL/binary)
- Pluggable scanner interface for extensibility
- All scanners in MVP

### Known Gotchas
- PostgreSQL needs to run locally (not in Docker for dev)
- All security tools need CLI tools installed


## Session 2 - 2026-02-26

### Database Setup
- Installed PostgreSQL 16 and created security_analyzer database
- Created user security_user with password authentication
- Created 4 tables: scans, scan_results, vulnerabilities, settings
- Used UUIDs for primary keys with gen_random_uuid()
- Added indexes on commonly queried columns (status, severity, foreign keys)

### Key Implementation Details
- Database connection module at apps/backend/src/db/index.ts uses pg Pool
- Environment variables: PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE
- Migrations in apps/backend/src/db/migrations/*.sql
- Renamed "references" column to "vuln_references" (reserved keyword issue)

### Gotchas
- "references" is a reserved keyword in PostgreSQL - use different column name
- ts-node had config loading issues - used psql directly for migrations
- Need to restart PostgreSQL after modifying pg_hba.conf



## Session 3 - 2026-02-26

### Task 6: Shared Types and API Client Packages

#### packages/types
- Created TypeScript interfaces: Vulnerability, Scan, ScanResult, Settings
- Created CreateScanInput, UpdateSettingsInput, PaginationParams, PaginatedResponse
- Added tsconfig.json with composite: true for project references
- Package builds successfully

#### packages/api-client  
- Created SecurityAnalyzerClient class with axios
- Methods: getScans, getScan, createScan, deleteScan
- Methods: getResults, getVulnerabilities  
- Methods: getSettings, updateSettings
- Package builds successfully

#### Build Verification
- Both packages compile without errors
- Generated .d.ts declaration files present
- npm workspaces resolve dependencies correctly
### Task 8: Input Detection Service

#### Implementation
- Created `apps/worker/src/services/inputDetector.ts` with InputDetector class
- Supports detection for: Git URLs, Local paths, URLs, Binary files

#### Detection Logic
1. **Git URLs**: Matches github.com, gitlab.com, bitbucket.org, git@ SSH, git:// protocols
2. **URLs**: HTTP/HTTPS endpoints with HEAD request validation
3. **Local paths**: Uses path separators (\\, /) to detect paths, validates existence and accessibility
4. **Binary files**: Detects magic bytes for ELF, PE, Mach-O, ZIP, RAR, BZ2, LZMA, Zstd, PNG, JPEG, GIF, BMP, TIFF, PDF

#### Key Features
- Environment variable TEMP_DIR for temp directory (defaults to os.tmpdir()/security-analyzer)
- Graceful error handling with descriptive error messages
- No arbitrary code execution (only git clone, file reads, HTTP requests)
- Returns structured InputAnalysis with type, isValid, path/url/clonePath, error, metadata

#### Test Results
- Local path detection: ✅ PASSED (existing files/dirs, non-existent paths)
- URL detection: ✅ PASSED (reachable URLs, unreachable URLs)
- Git detection: ✅ PASSED (valid clones, invalid repos)
- Binary detection: ✅ PASSED (ZIP, PNG, ELF, text files)

#### Gotchas
- Path-like strings that don't exist now return LOCAL type with isValid=false
- Binary detection via analyze() only works for non-path inputs
#WP|- Use analyzeBinary() directly for existing binary files


## Session 4 - 2026-02-26

### Task 9: Scanner Plugin Interface and Registry

#### Implementation

Created scanner plugin system in `apps/worker/src/scanners/`:

1. **Scanner Interface/Abstract Class** (`base/scanner.interface.ts`)
   - `Scanner` interface with: name, type, scan(), getResults(), cleanup(), canHandle()
   - `BaseScanner` abstract class with common functionality
   - Helper methods: createVulnerability(), createScanResult()
   - Lifecycle hooks: onInit(), onScan(), onCleanup()

2. **Scanner Registry** (`registry.ts`)
   - `ScannerRegistry` class for managing scanner instances
   - register(), registerFactory(), unregister(), get() methods
   - getAllScanners(), getByType(), findScannersForTarget()
   - initializeAll(), cleanupAll() for batch operations
   - Global singleton via getGlobalRegistry()

3. **Plugin Discovery** (`discovery.ts`)
   - `PluginDiscovery` class for loading scanners from directories
   - Supports pattern matching (*.scanner.ts)
   - `registerScanner()` decorator for auto-registration
   - `createScannerPlugin()` helper for plugin definitions
   - `autoDiscoverScanners()` for built-in scanner discovery

4. **Configuration Schema** (`config.ts`)
   - Zod schemas for validation
   - ScannerConfigSchema, ScannerMetadataConfigSchema, ScannersConfigSchema
   - validateScannerConfig(), validateScannersConfig()
   - mergeWithDefaults() for config merging

5. **Lifecycle Management** (`lifecycle.ts`)
   - `ScannerLifecycleManager` class
   - States: IDLE, INITIALIZING, READY, RUNNING, CLEANING_UP, ERROR, DISPOSED
   - Event subscription with subscribe()
   - initialize(), run(), cleanup() methods
   - runAll() for parallel scanning

6. **Test Scanner** (`test-scanner.scanner.ts`)
   - `TestScanner` class extending BaseScanner
   - Demonstrates plugin pattern
   - registerTestScanner() for manual registration
   - Auto-registration via enableAutoRegistration()

#### Key Features
- Dependency injection support via ScannerFactory
- Scanner types: static, dynamic, dependency, secret, composition, custom
- Plugin auto-discovery from .scanner.ts files
- Configuration validation with Zod
- Event-driven lifecycle management
- Independent scanner loading

#### Build Verification
- All TypeScript files compile without errors
- Generated .d.ts declaration files present
- Package dependencies: zod added for validation

## Session 5 - 2026-02-26

### Task 13: OpenGrep SAST Scanner Integration

#### Implementation

1. **OpenGrep Installation**
   - Downloaded OpenGrep binary from GitHub releases (v1.16.2)
   - Installed to `/usr/local/bin/opengrep`
   - OpenGrep is a community fork of Semgrep CE

2. **Scanner Implementation**
   - Created `/workspace/src/apps/worker/src/scanners/opengrep.scanner.ts`
   - `OpenGrepScanner` class extending `BaseScanner`
   - Type: `static` (SAST scanner)

3. **Key Methods**
   - `scan(target, options)` - Runs opengrep with JSON output
   - `parseOpenGrepOutput(output)` - Extracts JSON from output (handles ANSI codes)
   - `mapToVulnerabilities(parsed, scanId)` - Converts OpenGrep results to Vulnerability objects
   - `cleanup()` - Cleans up temporary files

4. **Configuration Options**
   - `opengrepPath` - Path to opengrep binary (default: 'opengrep')
   - `rulesConfig` - Rules to use (default: 'auto')
   - `excludePatterns` - Patterns to exclude from scan

5. **Registry Registration**
   - Registered via `registerOpenGrepScanner()` function
   - Follows plugin pattern compatible with auto-discovery

#### Test Results
Tested against vulnerable JavaScript code with hardcoded API keys:
- Found 2 vulnerabilities (both high severity)
- Detected Stripe API key
- Detected Picatic API key

#### Key Learnings
- OpenGrep outputs text/ANSI codes before JSON - handled by searching for `{"version"`
- Exit code 1 from OpenGrep is expected when findings are found (not an error)
- Scanner is auto-discoverable via the `*.scanner.ts` pattern
JR|- Scanner is auto-discoverable via the `*.scanner.ts` pattern


## Session 6 - 2026-02-26

### Task 14: Bandit Python SAST Scanner

#### Implementation

1. **Bandit Installation**
   - Installed via `pip install bandit`
   - Bandit is a Python-focused SAST tool
   - Version: 1.9.4

2. **Scanner Implementation**
   - Created `/workspace/src/apps/worker/src/scanners/bandit.scanner.ts`
   - `BanditScanner` class extending `BaseScanner`
   - Type: `static` (SAST scanner)

3. **Key Methods**
   - `scan(target, options)` - Runs bandit with JSON output
   - `parseBanditOutput(output)` - Parses Bandit JSON output
   - `mapToVulnerabilities(parsed, scanId)` - Converts Bandit results to Vulnerability objects
   - `cleanup()` - Cleans up resources

4. **Configuration Options**
   - `banditPath` - Path to bandit binary (default: 'bandit')
   - `excludePatterns` - Patterns to exclude from scan

5. **Registry Registration**
   - Registered via `registerBanditScanner()` function
   - Follows plugin pattern compatible with auto-discovery

#### Test Results
Tested against vulnerable Python code with:
- pickle import (B403)
- SQL injection (B608)
- Command injection (B605)
- Insecure deserialization (B301)
- Hardcoded password (B105)

Results: Found 5 vulnerabilities (1 high, 2 medium, 2 low)

#### Key Learnings
- Bandit outputs JSON with some logging text before it - handled by searching for first `{`
- Exit code 1 from Bandit is expected when findings are found
- Bandit test IDs (Bxxx) can be mapped to categories (security, crypto, injection)
- CWE information is included in Bandit output
