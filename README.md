# Security Analyzer Platform

A comprehensive security vulnerability scanning platform with AI-powered exploit analysis.

## Features

- **Multiple Scanner Types**: SAST, DAST, SCA, Secrets, IaC, Mobile, Container security
- **AI Exploit Analysis**: Get concrete, working exploit payloads for each vulnerability
- **PDF Reports**: Generate detailed reports with remediation steps
- **Docker-based**: Easy to deploy with Docker Compose
- **React Dashboard**: Modern UI for managing scans and viewing results

## Quick Start

### Prerequisites

- Docker & Docker Compose
- Node.js 18+ (for local development)
- PostgreSQL (handled via Docker)

### Running with Docker

```bash
# Clone and navigate to project
cd security-analyzer

# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

### Services

| Service     | URL                   | Description              |
| ----------- | --------------------- | ------------------------ |
| Frontend    | http://localhost:3000 | React dashboard          |
| Backend API | http://localhost:5000 | REST API                 |
| Worker      | Internal              | Background job processor |
| PostgreSQL  | localhost:5432        | Database                 |
| Redis       | localhost:6379        | Queue backend            |

## Available Security Scanners

### SAST (Static Analysis)

- **Semgrep** - Multi-language static analysis
- **OpenGrep** - Open source semantic code analysis
- **Bandit** - Python security issues

### DAST (Dynamic Analysis)

- **Nuclei** - Template-based vulnerability scanner
- **OWASP ZAP** - Web application security
- **SQLMap** - SQL injection testing
- **Nmap** - Network scanning

### Secrets Detection

- **Gitleaks** - Hardcoded secrets detection
- **TruffleHog** - Advanced secrets with verification

### SCA / Dependency

- **Trivy** - Container & dependency vulnerabilities
- **Grype** - Lightweight container scanner

### IaC (Infrastructure as Code)

- **Checkov** - Terraform, CloudFormation, Kubernetes security

### Mobile

- **MobSF** - Android/iOS app security

## API Endpoints

### Scans

```bash
# Create a new scan
curl -X POST http://localhost:5000/api/scans \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Security Scan",
    "target": "https://example.com",
    "scanners": [
      {"name": "nuclei", "enabled": true},
      {"name": "zap", "enabled": true}
    ]
  }'

# Get all scans
curl http://localhost:5000/api/scans

# Get scan results
curl http://localhost:5000/api/scans/{scanId}/results

# Delete a scan
curl -X DELETE http://localhost:5000/api/scans/{scanId}
```

### Settings

```bash
# Get settings
curl http://localhost:5000/api/settings

# Update settings
curl -X PUT http://localhost:5000/api/settings \
  -H "Content-Type: application/json" \
  -d '{"maxConcurrentScans": 5}'
```

## Configuration

### Environment Variables

Create a `.env` file in the root:

```env
# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/security_analyzer

# Redis
REDIS_URL=redis://localhost:6379

# API
API_PORT=5000
NODE_ENV=development

# Frontend
VITE_API_URL=http://localhost:5000

# Scanner Settings
SCANNER_TIMEOUT=300000
MAX_CONCURRENT_SCANS=3
```

### Scanner Configuration

Scanners can be configured in `apps/worker/src/scanners/config.ts`:

```typescript
export const DEFAULT_SCANNER_CONFIG = {
  enabled: true,
  timeout: 300000, // 5 minutes
  maxMemory: 512, // MB
  parallel: false,
};
```

## Development

### Local Setup

```bash
# Install dependencies
npm install

# Build all packages
npm run build

# Start development mode
docker-compose up -d

# Run worker in development
cd apps/worker
npm run dev
```

### Adding New Scanners

1. Create a new scanner file in `apps/worker/src/scanners/`:

   ```typescript
   // myscanner.scanner.ts
   import { BaseScanner, ScannerConfig, ScanResult } from './base';

   export class MyScanner extends BaseScanner {
     readonly name = 'myscanner';
     readonly type: ScannerType = 'static';

     async onScan(target: string): Promise<ScanResult> {
       // Implementation
     }

     canHandle(target: string): boolean {
       return target.includes('mytarget');
     }
   }
   ```

2. Export from `apps/worker/src/scanners/index.ts`

3. The scanner will automatically be available in the UI

### Adding New Prompt Templates

Templates are in `apps/worker/src/templates/prompts/`:

```json
// my-analysis.json
{
  "name": "my-analysis",
  "description": "My custom analysis",
  "extends": "exploit-analysis",
  "variables": {
    "MY_VAR": "Description"
  }
}
```

```markdown
# my-analysis.md

Analyze this vulnerability:

{MY_VAR}
{CODE}

Provide specific exploit payloads...
```

## Testing

```bash
# Run all tests
npm test

# Run worker tests
cd apps/worker
npm test

# Run with coverage
npm run test:coverage
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Frontend (React)                        │
│                  http://localhost:3000                       │
└─────────────────────────┬───────────────────────────────────┘
                          │ REST API
┌─────────────────────────▼───────────────────────────────────┐
│                      Backend (Express)                        │
│                  http://localhost:5000                       │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │   Routes    │  │   Models    │  │   Queue     │        │
│  └─────────────┘  └─────────────┘  └──────┬──────┘        │
└─────────────────────────┬───────────────────┬───────────────┘
                         │                   │
        ┌────────────────▼───┐   ┌────────────▼────────┐
        │   PostgreSQL      │   │       Redis         │
        │   (Database)      │   │   (Job Queue)       │
        └───────────────────┘   └─────────────────────┘
                                            │
                         ┌───────────────────┴───────────────────┐
                         │         Worker (BullMQ)              │
                         │    (Processes security scans)       │
                         │  ┌─────────┐ ┌─────────┐ ┌───────┐ │
                         │  │Semgrep │ │ Gitleaks│ │Trivy  │ │
                         │  │Nuclei  │ │ Checkov │ │...    │ │
                         │  └─────────┘ └─────────┘ └───────┘ │
                         └─────────────────────────────────────┘
```

## Exploit Analysis System

The platform includes an AI-powered exploit analyzer that:

1. **Gathers Context**: Clones repo, extracts vulnerable code
2. **Spawns AI Agents**: Uses Claude Code, OpenCode, or custom agents
3. **Generates Exploits**: Creates concrete, working payloads
4. **Reports**: PDF reports with step-by-step exploitation

### Example Exploit Output

```json
{
  "isExploitable": true,
  "exploitabilityScore": 9,
  "exploitExamples": [
    {
      "description": "Read environment variables via eval injection",
      "payload": "[(_ for _ in ()).throw(SyntaxError(str(__import__('os').environ)))]",
      "steps": [
        "Send payload as user_input parameter",
        "Observe environment variables in error response"
      ],
      "expectedResult": "Environment variables exposed"
    }
  ],
  "suggestedFix": "Use ast.literal_eval() instead of eval()"
}
```

## Docker Commands

```bash
# Build images
docker-compose build

# Start services
docker-compose up -d

# View specific service logs
docker-compose logs -f worker
docker-compose logs -f backend

# Scale workers
docker-compose up -d --scale worker=3

# Clean up
docker-compose down -v  # Remove volumes too
```

## Troubleshooting

### Scanner Not Found

Ensure the scanner binary is available in the container:

```dockerfile
# Add to worker Dockerfile
RUN pip install checkov trivy bandit
RUN go install github.com/projectdiscovery/nuclei/v2/cmd/nuclei@latest
```

### Database Connection Issues

```bash
# Check database logs
docker-compose logs postgres

# Connect to database
docker-compose exec postgres psql -U postgres -d security_analyzer
```

### Worker Not Processing Jobs

```bash
# Check Redis connection
docker-compose exec worker redis-cli ping

# View queue status
docker-compose exec worker redis-cli LLEN bull:security-scan:wait
```

## License

MIT License - see LICENSE file for details.
