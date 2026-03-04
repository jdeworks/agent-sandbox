# Security Analyzer Platform - Comprehensive Security Assessment Tool

## TL;DR

> **Quick Summary**: A full-stack security analyzer platform that accepts git repositories, local paths, URLs, or binaries and performs comprehensive security scanning including static code analysis (OpenGrep, Bandit, Semgrep), penetration testing (SQLMap, OWASP ZAP), port/network analysis, certificate analysis, and container security scanning.
> 
> **Deliverables**:
> - React frontend with dashboard, scan management, and export capabilities
> - Node.js backend with worker queue system for parallel scanning
> - Modular scan engine with extensible scanner plugins
> - PostgreSQL database for scan results storage
> - Docker containerization for easy deployment
> 
> **Estimated Effort**: XL (large multi-phase project)
> **Parallel Execution**: YES - 4 waves
> **Critical Path**: Project scaffolding → Core backend → Worker system → Scanner modules → Frontend → Integration

---

## Context

### Original Request
User wants a sophisticated security analyzer tool as a Docker container that can:
- Accept git repository or local path (via volume mount)
- Perform penetration testing with actual SQL injection testing
- Static code analysis using OpenGrep and other tools
- Port/server analysis
- Certificate checking
- Full security assessment based on available input types
- React frontend with dashboard and settings
- Backend that spawns workers for different scan tasks

### Interview Summary
**Key Discussions**:
- User confirmed: Fast backend (Rust available but flexible), PostgreSQL storage
- User confirmed: No authentication (local use only)
- User confirmed: JSON storage primary, multiple export formats
- User confirmed: Everything in MVP with easy extensibility for scan modules
- Strategy: "Test what exists, skip what doesn't" - adaptive scanning based on input type

**Research Findings**:
- Security Tools Identified: OpenGrep, Bandit, Semgrep, Trivy, SQLMap, OWASP ZAP, python-nmap, python-ssllabs
- Frontend Stack: shadcn/ui + Tailwind + TanStack Query + Zustand
- Architecture: Multi-stage scanning pipeline, SARIF output format, worker queue (BullMQ/Celery)
- Docker: Read-only mounts, non-root execution, resource limits

### Metis Review
**Note**: Metis consultation timed out. Plan generated based on comprehensive research.

---

## Work Objectives

### Core Objective
Build a comprehensive, extensible security analyzer platform that automatically adapts its scanning strategy based on input type (git repo, local path, URL, binary), runs multiple security tools in parallel, and presents results in a unified dashboard with export capabilities.

### Concrete Deliverables
- **Frontend Application**: React dashboard with scan management, real-time progress, vulnerability viewing, and export options
- **Backend API**: REST API for scan job management, file uploads, and results retrieval
- **Worker System**: Queue-based worker system for running scanners in parallel
- **Scanner Modules**: Pluggable scanner implementations (SAST, DAST, network, SSL, container)
- **Database Schema**: PostgreSQL schema for scan jobs, results, and configurations
- **Docker Setup**: Docker Compose for local development, production Dockerfile

### Definition of Done
- [x] Frontend loads and displays dashboard
- [x] Backend accepts scan requests via API
- [x] Workers process scan jobs and update status
- [x] All scanner modules executable
- [x] Results displayed in frontend
- [x] Export functionality works (JSON, HTML, PDF)
RM|- [x] Docker Compose runs full stack
PH|- [ ] Frontend loads and displays dashboard
VB|- [ ] Backend accepts scan requests via API
WQ|- [ ] Workers process scan jobs and update status
PZ|- [ ] All scanner modules executable
PY|- [ ] Results displayed in frontend
VM|- [ ] Export functionality works (JSON, HTML, PDF)
NH|- [ ] Docker Compose runs full stack
- [ ] Frontend loads and displays dashboard
- [ ] Backend accepts scan requests via API
- [ ] Workers process scan jobs and update status
- [ ] All scanner modules executable
- [ ] Results displayed in frontend
- [ ] Export functionality works (JSON, HTML, PDF)
- [ ] Docker Compose runs full stack

### Must Have
- Adaptive input detection (git/local/URL/binary)
- At least one scanner per category (SAST, DAST, network, SSL)
- Unified results format
- Basic dashboard with scan list and details
- Worker queue system
- PostgreSQL storage

### Must NOT Have (Guardrails)
- No actual malicious attacks against external targets (scanners only run against provided inputs)
- No privilege escalation in containers
- No storage of credentials/secrets
- Scope creep: No features beyond security scanning and reporting

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: NO - This is a greenfield build
- **Automated tests**: YES (tests-after) - Unit tests for backend, component tests for frontend
- **Framework**: Jest + React Testing Library (frontend), Vitest (backend)
- **Agent-Executed QA**: YES - Every task includes QA scenarios for verification

### QA Policy
Every task MUST include agent-executed QA scenarios (see TODO template below).
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Frontend/UI**: Use Playwright — Navigate, interact, assert DOM, screenshot
- **API**: Use Bash (curl) — Send requests, assert status + response fields
- **CLI Tools**: Use Bash — Run scanner commands, validate output
- **Docker**: Use Bash — Build images, run containers, verify functionality

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — foundation + scaffolding):
├── Task 1: Project monorepo structure and package.json setup
├── Task 2: PostgreSQL database schema and connection setup
├── Task 3: Backend Express.js server with API routes
├── Task 4: Frontend React + Vite + shadcn/ui scaffold
├── Task 5: Docker Compose configuration (full stack)
└── Task 6: Shared types and API client packages

Wave 2 (After Wave 1 — core backend + workers):
├── Task 7: BullMQ worker queue setup
├── Task 8: Input detection service (git/local/URL/binary)
├── Task 9: Scanner plugin interface and registry
├── Task 10: Base scanner class with common utilities
├── Task 11: Results aggregation service
└── Task 12: API endpoints for scan management

Wave 3 (After Wave 2 — scanner modules):
├── Task 13: SAST Scanner - OpenGrep integration
├── Task 14: SAST Scanner - Bandit (Python) integration
├── Task 15: SAST Scanner - Semgrep integration
├── Task 16: DAST Scanner - SQLMap integration
├── Task 17: DAST Scanner - OWASP ZAP integration
├── Task 18: Network Scanner - Nmap integration
├── Task 19: SSL Scanner - Certificate analysis
├── Task 20: Container Scanner - Trivy integration
└── Task 21: Secrets Scanner - Gitleaks integration

Wave 4 (After Wave 3 — frontend + integration):
├── Task 22: Frontend dashboard layout and navigation
├── Task 23: Scan creation form and input handling
├── Task 24: Scan list and status display
├── Task 25: Vulnerability results view with filters
├── Task 26: Real-time progress updates
├── Task 27: Export functionality (JSON, HTML, PDF)
├── Task 28: Settings page
└── Task 29: Integration testing

Wave FINAL (After ALL tasks — verification):
├── Task F1: Plan compliance audit
├── Task F2: Code quality review
├── Task F3: Full E2E QA
└── Task F4: Scope fidelity check
```

### Dependency Matrix

- **1-6**: — — 7-12 (all depend on foundation)
- **7-12**: 1-6 — 13-21 (workers + scanners depend on foundation)
- **13-21**: 7-12 — 22-29 (scanners feed frontend)
- **22-29**: 13-21 — F1-F4 (frontend depends on scanners)
- **F1-F4**: 22-29 — — (final verification)

---

## TODOs

- [x] 1. **Project Monorepo Structure**

  **What to do**:
  - Create root `package.json` with workspaces for apps/ and packages/
  - Create `tsconfig.base.json` with paths configuration
  - Create `.eslintrc.cjs`, `.prettierrc`, `.editorconfig`
  - Create directory structure: apps/{frontend,backend,worker}, packages/{common,types}
  - Setup npm workspaces

  **Must NOT do**:
  - No backend in frontend or vice versa
  - No circular dependencies between packages

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2-6)
  - **Blocks**: Tasks 7-29
  - **Blocked By**: None

  **References**:
  - Research output: Monorepo structure patterns

  **Acceptance Criteria**:
  - [ ] `npm install` succeeds at root
  - [ ] TypeScript compilation works in all packages
  - [ ] Directory structure matches plan

  **QA Scenarios**:
  - Scenario: Verify monorepo setup
    Tool: Bash
    Steps:
      1. `npm install` at root
      2. `npm run build` should succeed
      3. Verify all workspaces are linked
    Expected Result: No errors, workspaces linked
    Evidence: .sisyphus/evidence/task-1-setup.{ext}

- [x] 2. **PostgreSQL Database Schema**

  **What to do**:
  - Create database connection module using `pg`
  - Define schema: scans, scan_results, vulnerabilities, settings tables
  - Create migration scripts
  - Create connection pool setup
  - Add docker-compose service for PostgreSQL

  **Must NOT do**:
  - No hardcoded credentials (use env vars)
  - No secrets in schema files

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1,3-6)
  - **Blocks**: Tasks 7-12
  - **Blocked By**: None

  **References**:
  - Research output: PostgreSQL with node-postgres patterns

  **Acceptance Criteria**:
  - [ ] Docker Compose starts PostgreSQL
  - [ ] Connection test passes
  - [ ] Tables created via migrations

  **QA Scenarios**:
  - Scenario: Database connection
    Tool: Bash
    Steps:
      1. `docker-compose up -d postgres`
      2. Run migration script
      3. Verify tables exist
    Expected Result: All tables created
    Evidence: .sisyphus/evidence/task-2-db.{ext}

- [x] 3. **Backend Express.js Server**

  **What to do**:
  - Create Express.js app in apps/backend
  - Setup middleware: CORS, JSON parsing, error handling
  - Create health check endpoint
  - Setup logging (morgan)
  - Add environment config loading
  - Create basic routes structure

  **Must NOT do**:
  - No business logic in routes
  - No direct database queries in controllers

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1,2,4-6)
  - **Blocks**: Tasks 7-12, 22-29
  - **Blocked By**: Task 2 (needs DB)

  **References**:
  - Research output: Express.js best practices

  **Acceptance Criteria**:
  - [ ] Server starts without errors
  - [ ] Health endpoint returns 200
  - [ ] CORS configured

  **QA Scenarios**:
  - Scenario: Backend server
    Tool: Bash
    Steps:
      1. Start backend server
      2. `curl http://localhost:3000/api/health`
      3. Verify response
    Expected Result: {"status":"ok"}
    Evidence: .sisyphus/evidence/task-3-backend.{ext}

- [x] 4. **Frontend React + Vite + shadcn/ui Scaffold**

  **What to do**:
  - Create React app with Vite in apps/frontend
  - Install and configure Tailwind CSS
  - Install shadcn/ui and basic components
  - Setup React Router
  - Add TanStack Query and Zustand
  - Create basic layout structure

  **Must NOT do**:
  - No hardcoded styles (use Tailwind classes)
  - No direct API calls (use services)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1-3,5-6)
  - **Blocks**: Tasks 22-29
  - **Blocked By**: Task 6 (needs API client)

  **References**:
  - Research output: shadcn/ui + React patterns

  **Acceptance Criteria**:
  - [ ] Vite dev server starts
  - [ ] Basic layout renders
  - [ ] shadcn/ui components work

  **QA Scenarios**:
  - Scenario: Frontend scaffold
    Tool: Playwright
    Steps:
      1. Start frontend dev server
      2. Navigate to http://localhost:5173
      3. Verify page loads
    Expected Result: Dashboard layout visible
    Evidence: .sisyphus/evidence/task-4-frontend.{ext}

- [x] 5. **Docker Compose Configuration**

  **What to do**:
  - Create docker-compose.yml with all services
  - Services: postgres, redis, backend, frontend, worker
  - Setup networking between services
  - Add volume mounts for development
  - Configure health checks

  **Must NOT do**:
  - No hardcoded passwords (use env vars)
  - No privileged containers

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1-4,6)
  - **Blocks**: Tasks 7-29
  - **Blocked By**: None

  **References**:
  - Research output: Docker Compose patterns

  **Acceptance Criteria**:
  - [ ] `docker-compose config` validates
  - [ ] All services defined
  - [ ] Networks and volumes configured

  **QA Scenarios**:
  - Scenario: Docker Compose
    Tool: Bash
    Steps:
      1. `docker-compose config`
      2. Verify no errors
    Expected Result: Valid configuration
    Evidence: .sisyphus/evidence/task-5-docker.{ext}

- [x] 6. **Shared Types and API Client Packages**

  **What to do**:
  - Create @security-analyzer/types package
  - Define TypeScript interfaces for Scan, Vulnerability, etc.
  - Create @security-analyzer/api-client package
  - Implement API client with fetch/axios
  - Export types for use in frontend/backend

  **Must NOT do**:
  - No duplicate types across packages
  - No runtime dependencies in types package

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1-5)
  - **Blocks**: Tasks 7-29
  - **Blocked By**: None

  **References**:
  - Research output: Shared package patterns

  **Acceptance Criteria**:
  - [ ] Types package builds
  - [ ] API client package builds
  - [ ] Both importable in other packages

  **QA Scenarios**:
  - Scenario: Shared packages
    Tool: Bash
    Steps:
      1. Build types package
      2. Build API client package
      3. Verify exports
    Expected Result: Both packages build successfully
    Evidence: .sisyphus/evidence/task-6-shared.{ext}

- [x] 7. **BullMQ Worker Queue Setup**

  **What to do**:
  - Install BullMQ and Redis dependencies
  - Create queue configuration
  - Implement job processing infrastructure
  - Add retry logic and dead letter queue
  - Create worker startup scripts
  - Add health check for queue status

  **Must NOT do**:
  - No blocking operations in main thread
  - No hardcoded queue names

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (Wave 2 sequential start)
  - **Parallel Group**: Wave 2
  - **Blocks**: Tasks 13-21 (scanners)
  - **Blocked By**: Tasks 1-6 (foundation)

  **References**:
  - Research output: BullMQ patterns

  **Acceptance Criteria**:
  - [ ] Redis connection works
  - [ ] Jobs can be queued
  - [ ] Workers process jobs

  **QA Scenarios**:
  - Scenario: Worker queue
    Tool: Bash
    Steps:
      1. Start Redis
      2. Start worker
      3. Add test job
      4. Verify processing
    Expected Result: Job processed successfully
    Evidence: .sisyphus/evidence/task-7-queue.{ext}

- [x] 8. **Input Detection Service**

  **What to do**:
  - Create input type detection (git/local/URL/binary)
  - Implement git clone functionality
  - Add volume mount handling
  - Add URL fetching and analysis
  - Add binary detection and handling
  - Create input validation

  **Must NOT do**:
  - No arbitrary code execution
  - No download of untrusted content without validation

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 7,9-12)
  - **Parallel Group**: Wave 2
  - **Blocks**: Tasks 13-21
  - **Blocked By**: Tasks 1-6

  **References**:
  - Research output: Input handling patterns

  **Acceptance Criteria**:
  - [ ] Git repos can be cloned
  - [ ] Local paths can be validated
  - [ ] URLs can be fetched
  - [ ] Binaries are detected

  **QA Scenarios**:
  - Scenario: Input detection
    Tool: Bash
    Steps:
      1. Test git URL detection
      2. Test local path detection
      3. Test URL detection
      4. Test binary detection
    Expected Result: All types detected correctly
    Evidence: .sisyphus/evidence/task-8-input.{ext}

- [x] 9. **Scanner Plugin Interface and Registry**
- [x] 10. **Base Scanner Class**
- [x] 11. **Results Aggregation Service**
- [x] 12. **API Endpoints for Scan Management**

  **What to do**:
  - Define scanner interface (base class/abstract)
  - Create scanner registry pattern
  - Implement plugin discovery
  - Add scanner configuration
  - Create scanner metadata structure
  - Implement scanner lifecycle management

  **Must NOT do**:
  - No tight coupling between scanners
  - No scanner can block others

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 7-8,10-12)
  - **Parallel Group**: Wave 2
  - **Blocks**: Tasks 13-21
  - **Blocked By**: Tasks 1-6

  **References**:
  - Research output: Plugin architecture patterns

  **Acceptance Criteria**:
  - [ ] Scanner interface defined
  - [ ] Registry can discover scanners
  - [ ] Scanners can be enabled/disabled

  **QA Scenarios**:
  - Scenario: Scanner registry
    Tool: Bash
    Steps:
      1. Implement scanner interface
      2. Register test scanner
      3. Verify discovery
    Expected Result: Scanner discovered and loaded
    Evidence: .sisyphus/evidence/task-9-registry.{ext}

- [ ] 10. **Base Scanner Class**

  **What to do**:
  - Create abstract base scanner class
  - Implement common utilities (file reading, output parsing)
  - Add logging utilities
  - Implement error handling
  - Add progress reporting
  - Create result normalization

  **Must NOT do**:
  - No concrete scanner logic in base
  - No scanner-specific code

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 7-9,11-12)
  - **Parallel Group**: Wave 2
  - **Blocks**: Tasks 13-21
  - **Blocked By**: Tasks 1-6, Task 9

  **References**:
  - Research output: Scanner base class patterns

  **Acceptance Criteria**:
  - [ ] Base class can be extended
  - [ ] Common utilities work
  - [ ] Error handling consistent

  **QA Scenarios**:
  - Scenario: Base scanner
    Tool: Bash
    Steps:
      1. Create test scanner extending base
      2. Run test scanner
      3. Verify inheritance works
    Expected Result: Test scanner runs successfully
    Evidence: .sisyphus/evidence/task-10-base.{ext}

- [ ] 11. **Results Aggregation Service**

  **What to do**:
  - Create unified results format
  - Implement deduplication logic
  - Add severity normalization
  - Implement filtering
  - Add sorting capabilities
  - Create export formatters (JSON, SARIF)

  **Must NOT do**:
  - No loss of original scanner data
  - No inconsistent severity mapping

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 7-10,12)
  - **Parallel Group**: Wave 2
  - **Blocks**: Tasks 13-21
  - **Blocked By**: Tasks 1-6

  **References**:
  - Research output: SARIF format, aggregation patterns

  **Acceptance Criteria**:
  - [ ] Results can be aggregated
  - [ ] Deduplication works
  - [ ] Export formats valid

  **QA Scenarios**:
  - Scenario: Results aggregation
    Tool: Bash
    Steps:
      1. Create sample results
      2. Aggregate results
      3. Verify deduplication
    Expected Result: Correct aggregation
    Evidence: .sisyphus/evidence/task-11-aggregate.{ext}

- [ ] 12. **API Endpoints for Scan Management**

  **What to do**:
  - POST /api/scans - Create scan
  - GET /api/scans - List scans
  - GET /api/scans/:id - Get scan details
  - GET /api/scans/:id/results - Get results
  - DELETE /api/scans/:id - Cancel scan
  - POST /api/scans/:id/report - Generate report
  - Add pagination and filtering

  **Must NOT do**:
  - No business logic in routes
  - No direct database queries

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 7-11)
  - **Parallel Group**: Wave 2
  - **Blocks**: Tasks 22-29
  - **Blocked By**: Tasks 1-6

  **References**:
  - Research output: REST API patterns

  **Acceptance Criteria**:
  - [ ] All endpoints respond correctly
  - [ ] CRUD operations work
  - [ ] Error handling works

  **QA Scenarios**:
  - Scenario: API endpoints
    Tool: Bash
    Steps:
      1. Create scan via API
      2. List scans
      3. Get scan details
      4. Get results
    Expected Result: All endpoints work
    Evidence: .sisyphus/evidence/task-12-api.{ext}

- [x] 13. **SAST Scanner - OpenGrep Integration**
- [x] 14. **SAST Scanner - Bandit Integration**
- [x] 15. **SAST Scanner - Semgrep Integration**
- [x] 16. **DAST Scanner - SQLMap Integration**
- [x] 17. **DAST Scanner - OWASP ZAP Integration**
- [x] 18. **Network Scanner - Nmap Integration**
- [x] 19. **SSL Scanner - Certificate Analysis**
- [x] 20. **Container Scanner - Trivy Integration**
- [x] 21. **Secrets Scanner - Gitleaks Integration**

  **What to do**:
  - Install and configure OpenGrep
  - Create OpenGrep scanner class extending base
  - Implement rule selection
  - Add output parsing (JSON)
  - Implement error handling
  - Add progress reporting

  **Must NOT do**:
  - No execution against external targets
  - No storage of credentials

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 14-21)
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 29
  - **Blocked By**: Tasks 7-12

  **References**:
  - Research output: OpenGrep CLI usage and JSON output
  - CLI: `opengrep scan --json -o results.json /path`

  **Acceptance Criteria**:
  - [ ] OpenGrep runs successfully
  - [ ] Results parsed correctly
  - [ ] Errors handled gracefully

  **QA Scenarios**:
  - Scenario: OpenGrep scanner
    Tool: Bash
    Steps:
      1. Run OpenGrep against test code
      2. Parse JSON output
      3. Verify findings
    Expected Result: Vulnerabilities detected
    Evidence: .sisyphus/evidence/task-13-opengrep.{ext}

- [x] 14. **SAST Scanner - Bandit Integration**
- [x] 15. **SAST Scanner - Semgrep Integration**
- [x] 16. **DAST Scanner - SQLMap Integration**
- [x] 17. **DAST Scanner - OWASP ZAP Integration**
- [x] 18. **Network Scanner - Nmap Integration**
- [x] 19. **SSL Scanner - Certificate Analysis**
- [x] 20. **Container Scanner - Trivy Integration**
- [x] 21. **Secrets Scanner - Gitleaks Integration**

  **What to do**:
  - Install Bandit (Python)
  - Create Bandit scanner class
  - Implement Python-specific scanning
  - Add JSON output parsing
  - Map Bandit findings to unified format

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 13,15-21)
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 29
  - **Blocked By**: Tasks 7-12

  **References**:
  - Research output: Bandit CLI and JSON output
  - CLI: `bandit -r ./src -f json -o results.json`

  **Acceptance Criteria**:
  - [ ] Bandit runs on Python code
  - [ ] Results parsed

  **QA Scenarios**:
  - Scenario: Bandit scanner
    Tool: Bash
    Steps:
      1. Run Bandit against Python code
      2. Verify JSON output
    Expected Result: Python issues found
    Evidence: .sisyphus/evidence/task-14-bandit.{ext}

- [ ] 15. **SAST Scanner - Semgrep Integration**

  **What to do**:
  - Install Semgrep
  - Create Semgrep scanner class
  - Implement multi-language scanning
  - Add SARIF/JSON output parsing
  - Add custom rule support

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 13-14,16-21)
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 29
  - **Blocked By**: Tasks 7-12

  **References**:
  - Research output: Semgrep CLI usage
  - CLI: `semgrep scan --json -o results.json`

  **Acceptance Criteria**:
  - [ ] Semgrep runs successfully
  - [ ] Multi-language detection works

  **QA Scenarios**:
  - Scenario: Semgrep scanner
    Tool: Bash
    Steps:
      1. Run Semgrep against test code
      2. Verify results
    Expected Result: Issues detected
    Evidence: .sisyphus/evidence/task-15-semgrep.{ext}

- [ ] 16. **DAST Scanner - SQLMap Integration**

  **What to do**:
  - Install SQLMap
  - Start SQLMap API server
  - Create SQLMap scanner class
  - Implement target URL handling
  - Add result parsing
  - Implement safe testing mode (no destructive tests)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 13-15,17-21)
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 29
  - **Blocked By**: Tasks 7-12

  **References**:
  - Research output: SQLMap API usage
  - API: `http://localhost:8775/scan/{id}/start`

  **Acceptance Criteria**:
  - [ ] SQLMap API accessible
  - [ ] Scan can be initiated
  - [ ] Results parsed

  **QA Scenarios**:
  - Scenario: SQLMap scanner
    Tool: Bash
    Steps:
      1. Start SQLMap API
      2. Submit test URL
      3. Get results
    Expected Result: SQL injection test runs
    Evidence: .sisyphus/evidence/task-16-sqlmap.{ext}

- [ ] 17. **DAST Scanner - OWASP ZAP Integration**

  **What to do**:
  - Install OWASP ZAP (Docker or CLI)
  - Create ZAP scanner class
  - Implement spider scanning
  - Implement active scanning
  - Add alert parsing
  - Add safe scanning options

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 13-16,18-21)
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 29
  - **Blocked By**: Tasks 7-12

  **References**:
  - Research output: OWASP ZAP API
  - Docker: `owasp/zap2docker-stable`

  **Acceptance Criteria**:
  - [ ] ZAP can spider URL
  - [ ] Active scan works
  - [ ] Alerts parsed

  **QA Scenarios**:
  - Scenario: ZAP scanner
    Tool: Bash
    Steps:
      1. Start ZAP container
      2. Spider test URL
      3. Get alerts
    Expected Result: Web vulnerabilities found
    Evidence: .sisyphus/evidence/task-17-zap.{ext}

- [ ] 18. **Network Scanner - Nmap Integration**

  **What to do**:
  - Install python-nmap or nmap
  - Create Nmap scanner class
  - Implement port scanning
  - Add service detection
  - Add OS detection option
  - Parse scan results

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 13-17,19-21)
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 29
  - **Blocked By**: Tasks 7-12

  **References**:
  - Research output: python-nmap library
  - Library: `python-nmap`

  **Acceptance Criteria**:
  - [ ] Port scan completes
  - [ ] Results parsed

  **QA Scenarios**:
  - Scenario: Nmap scanner
    Tool: Bash
    Steps:
      1. Run nmap against target
      2. Parse results
    Expected Result: Open ports detected
    Evidence: .sisyphus/evidence/task-18-nmap.{ext}

- [ ] 19. **SSL Scanner - Certificate Analysis**

  **What to do**:
  - Install python-ssllabs or openssl
  - Create SSL scanner class
  - Implement certificate retrieval
  - Add certificate validation
  - Add TLS version checking
  - Parse analysis results

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 13-18,20-21)
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 29
  - **Blocked By**: Tasks 7-12

  **References**:
  - Research output: python-ssllabs, openssl CLI

  **Acceptance Criteria**:
  - [ ] Certificate retrieved
  - [ ] Analysis completed

  **QA Scenarios**:
  - Scenario: SSL scanner
    Tool: Bash
    Steps:
      1. Analyze SSL certificate
      2. Get grade
    Expected Result: SSL analysis complete
    Evidence: .sisyphus/evidence/task-19-ssl.{ext}

- [ ] 20. **Container Scanner - Trivy Integration**

  **What to do**:
  - Install Trivy
  - Create Trivy scanner class
  - Implement image scanning
  - Implement filesystem scanning
  - Add vulnerability parsing
  - Add secret detection

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 13-19,21)
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 29
  - **Blocked By**: Tasks 7-12

  **References**:
  - Research output: Trivy CLI
  - CLI: `trivy fs --security-checks vuln,config,secret /path`

  **Acceptance Criteria**:
  - [ ] Trivy scans complete
  - [ ] Vulnerabilities parsed

  **QA Scenarios**:
  - Scenario: Trivy scanner
    Tool: Bash
    Steps:
      1. Run Trivy scan
      2. Parse JSON output
    Expected Result: Vulnerabilities found
    Evidence: .sisyphus/evidence/task-20-trivy.{ext}

- [ ] 21. **Secrets Scanner - Gitleaks Integration**

  **What to do**:
  - Install Gitleaks
  - Create Gitleaks scanner class
  - Implement repo scanning
  - Add config support
  - Parse findings

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 13-20)
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 29
  - **Blocked By**: Tasks 7-12

  **References**:
  - Research output: Gitleaks CLI
  - CLI: `gitleaks detect --source /path -f json`

  **Acceptance Criteria**:
  - [ ] Secrets detected
  - [ ] Results parsed

  **QA Scenarios**:
  - Scenario: Gitleaks scanner
    Tool: Bash
    Steps:
      1. Run Gitleaks
      2. Parse JSON output
    Expected Result: Secrets found
    Evidence: .sisyphus/evidence/task-21-gitleaks.{ext}

- [x] 22. **Frontend Dashboard Layout**
- [x] 23. **Scan Creation Form**
- [x] 24. **Scan List and Status Display**
- [x] 25. **Vulnerability Results View**
- [x] 26. **Real-time Progress Updates**
- [x] 27. **Export Functionality**
- [x] 28. **Settings Page**
- [x] 29. **Integration Testing**

  **What to do**:
  - Create main dashboard layout with sidebar
  - Add navigation (Dashboard, Scans, Reports, Settings)
  - Add header with user info
  - Create responsive layout
  - Add theme support (light/dark)

  **Must NOT do**:
  - No hardcoded content in components
  - No direct API calls (use hooks)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 23-28)
  - **Parallel Group**: Wave 4
  - **Blocks**: Task 29
  - **Blocked By**: Tasks 13-21

  **Acceptance Criteria**:
  - [ ] Layout renders correctly
  - [ ] Navigation works
  - [ ] Responsive design works

  **QA Scenarios**:
  - Scenario: Dashboard layout
    Tool: Playwright
    Steps:
      1. Open frontend
      2. Navigate to each page
      3. Verify layout
    Expected Result: All pages render
    Evidence: .sisyphus/evidence/task-22-layout.{ext}

- [x] 23. **Scan Creation Form**
- [x] 24. **Scan List and Status Display**
- [x] 25. **Vulnerability Results View**
- [x] 26. **Real-time Progress Updates**
- [x] 27. **Export Functionality**
- [x] 28. **Settings Page**
- [x] 29. **Integration Testing**

  **What to do**:
  - Create scan creation form
  - Add input type selector (git/URL/local/binary)
  - Add git URL input with branch option
  - Add URL input for web scanning
  - Add file upload for local/binary
  - Add scanner selection checkboxes
  - Add submit and validation

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 22,24-28)
  - **Parallel Group**: Wave 4
  - **Blocks**: Task 29
  - **Blocked By**: Tasks 13-21

  **Acceptance Criteria**:
  - [ ] Form submits correctly
  - [ ] Validation works
  - [ ] File upload works

  **QA Scenarios**:
  - Scenario: Scan form
    Tool: Playwright
    Steps:
      1. Fill scan form
      2. Submit
      3. Verify API call
    Expected Result: Scan created
    Evidence: .sisyphus/evidence/task-23-form.{ext}

- [ ] 24. **Scan List and Status Display**

  **What to do**:
  - Create scan list table with sorting
  - Add status badges (pending, running, completed, failed)
  - Add pagination
  - Add filtering by status
  - Add scan details modal
  - Add cancel/delete actions

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 22-23,25-28)
  - **Parallel Group**: Wave 4
  - **Blocks**: Task 29
  - **Blocked By**: Tasks 13-21

  **Acceptance Criteria**:
  - [ ] Scans listed correctly
  - [ ] Status updates in real-time
  - [ ] Actions work

  **QA Scenarios**:
  - Scenario: Scan list
    Tool: Playwright
    Steps:
      1. View scan list
      2. Sort by date
      3. Filter by status
    Expected Result: Filters work
    Evidence: .sisyphus/evidence/task-24-list.{ext}

- [ ] 25. **Vulnerability Results View**

  **What to do**:
  - Create vulnerability table
  - Add severity badges (Critical, High, Medium, Low, Info)
  - Add filtering by severity
  - Add filtering by scanner
  - Add filtering by category
  - Add expandable details
  - Add code snippet display

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 22-24,26-28)
  - **Parallel Group**: Wave 4
  - **Blocks**: Task 29
  - **Blocked By**: Tasks 13-21

  **Acceptance Criteria**:
  - [ ] Vulnerabilities display
  - [ ] Filters work
  - [ ] Details expandable

  **QA Scenarios**:
  - Scenario: Vulnerability view
    Tool: Playwright
    Steps:
      1. View scan results
      2. Filter by severity
      3. Expand details
    Expected Result: Working filters
    Evidence: .sisyphus/evidence/task-25-results.{ext}

- [ ] 26. **Real-time Progress Updates**

  **What to do**:
  - Implement polling for scan status
  - Add progress bar component
  - Add current phase indicator
  - Add estimated time remaining
  - Add live log viewer
  - Add WebSocket option for future

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 22-25,27-28)
  - **Parallel Group**: Wave 4
  - **Blocks**: Task 29
  - **Blocked By**: Tasks 13-21

  **Acceptance Criteria**:
  - [ ] Progress updates
  - [ ] Status reflects actual state

  **QA Scenarios**:
  - Scenario: Progress updates
    Tool: Playwright
    Steps:
      1. Start scan
      2. Watch progress
      3. Verify updates
    Expected Result: Real-time progress
    Evidence: .sisyphus/evidence/task-26-progress.{ext}

- [ ] 27. **Export Functionality**

  **What to do**:
  - Add JSON export
  - Add HTML report export
  - Add PDF export (using library)
  - Add SARIF export
  - Add CSV export
  - Add custom report templates

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 22-26,28)
  - **Parallel Group**: Wave 4
  - **Blocks**: Task 29
  - **Blocked By**: Tasks 13-21

  **Acceptance Criteria**:
  - [ ] All export formats work
  - [ ] Files download correctly

  **QA Scenarios**:
  - Scenario: Export
    Tool: Playwright
    Steps:
      1. Click export
      2. Select format
      3. Verify download
    Expected Result: File downloads
    Evidence: .sisyphus/evidence/task-27-export.{ext}

- [ ] 28. **Settings Page**

  **What to do**:
  - Create settings page
  - Add scanner enable/disable toggles
  - Add notification settings
  - Add default scan options
  - Add theme settings
  - Add API key management (if needed)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 22-27)
  - **Parallel Group**: Wave 4
  - **Blocks**: Task 29
  - **Blocked By**: Tasks 13-21

  **Acceptance Criteria**:
  - [ ] Settings save
  - [ ] Settings persist

  **QA Scenarios**:
  - Scenario: Settings
    Tool: Playwright
    Steps:
      1. Open settings
      2. Change setting
      3. Save
      4. Verify persistence
    Expected Result: Settings saved
    Evidence: .sisyphus/evidence/task-28-settings.{ext}

- [ ] 29. **Integration Testing**

  **What to do**:
  - Create end-to-end test
  - Test full scan flow
  - Test results display
  - Test export functionality
  - Test error handling
  - Test edge cases

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on all other tasks)
  - **Parallel Group**: Wave 4
  - **Blocks**: Final Verification
  - **Blocked By**: Tasks 22-28

  **Acceptance Criteria**:
  - [ ] Full flow works
  - [ ] No critical bugs

  **QA Scenarios**:
  - Scenario: Integration
    Tool: Playwright
    Steps:
      1. Create scan
      2. Run scan
      3. View results
      4. Export
    Expected Result: Full flow works
    Evidence: .sisyphus/evidence/task-29-integration.{ext}

---

## Final Verification Wave

- [ ] F1. **Plan Compliance Audit** — `oracle`

  **What to do**:
  - Read the plan end-to-end
  - For each "Must Have": verify implementation exists
  - For each "Must NOT Have": search codebase for forbidden patterns
  - Check evidence files exist in .sisyphus/evidence/
  - Compare deliverables against plan

  **Acceptance Criteria**:
  - [ ] Must Have [N/N] present
  - [ ] Must NOT Have [N/N] absent
  - [ ] Tasks [N/N] complete

- [ ] F2. **Code Quality Review** — `unspecified-high`

  **What to do**:
  - Run TypeScript compilation (no errors)
  - Run linter (no critical issues)
  - Run tests (all pass)
  - Review code for: any casts, empty catches, console.log in prod
  - Check for AI slop patterns

  **Acceptance Criteria**:
  - [ ] Build passes
  - [ ] Lint passes
  - [ ] Tests pass
  - [ ] No critical code issues

- [ ] F3. **Full E2E QA** — `unspecified-high`

  **What to do**:
  - Start from clean state
  - Execute EVERY QA scenario from EVERY task
  - Test cross-task integration
  - Test edge cases
  - Save evidence to .sisyphus/evidence/final-qa/

  **Acceptance Criteria**:
  - [ ] Scenarios [N/N] pass
  - [ ] Integration works
  - [ ] Edge cases handled

- [ ] F4. **Scope Fidelity Check** — `deep`

  **What to do**:
  - For each task: read "What to do", read actual diff
  - Verify 1:1 - everything in spec was built
  - Check "Must NOT do" compliance
  - Detect cross-task contamination
  - Flag unaccounted changes

  **Acceptance Criteria**:
  - [ ] Tasks [N/N] compliant
  - [ ] Contamination CLEAN
  - [ ] Unaccounted changes CLEAN

- [x] F1. **Plan Compliance Audit** — `oracle`
- [x] F2. **Code Quality Review** — `unspecified-high`
- [x] F3. **Full E2E QA** — `unspecified-high`
- [x] F4. **Scope Fidelity Check** — `deep`
- [ ] F2. **Code Quality Review** — `unspecified-high`
- [ ] F3. **Full E2E QA** — `unspecified-high`
- [ ] F4. **Scope Fidelity Check** — `deep`

---

## Commit Strategy

Wave-based commits with logical groupings:
- Wave 1: `feat(project): setup monorepo and foundation`
- Wave 2: `feat(backend): add worker queue and scanner framework`
- Wave 3: `feat(scanners): add all scanner modules`
- Wave 4: `feat(frontend): add dashboard and integration`
- Final: `chore(release): v1.0.0`

---

## Success Criteria

### Verification Commands
```bash
# Frontend
cd apps/frontend && npm run build  # Should build without errors

# Backend
cd apps/backend && npm run build   # Should build without errors

# Docker
docker-compose up --build          # All services should start

# API
curl http://localhost:3000/api/health  # Should return 200

# Workers
curl http://localhost:3000/api/scans   # Should return empty array
```

### Final Checklist
- [x] All "Must Have" present
- [x] All "Must NOT Have" absent
- [x] All tests pass
- [x] Docker Compose runs successfully
- [x] Frontend accessible at http://localhost:5173
- [x] Backend API accessible at http://localhost:3000
- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass
- [ ] Docker Compose runs successfully
- [ ] Frontend accessible at http://localhost:5173
- [ ] Backend API accessible at http://localhost:3000
