import { Router, Request, Response } from 'express';
import { ScannerMetadata, ScannerType } from '@security-analyzer/types';

const router = Router();

// Static list of available scanners – in a future iteration this could be dynamically discovered
const AVAILABLE_SCANNERS: ScannerMetadata[] = [
  {
    name: 'bandit',
    type: 'static',
    description: 'Python security issues – finds common vulnerabilities in Python code',
    version: '1.9.4',
    author: 'PyCQA',
    tags: ['python', 'sast'],
    requiresNetwork: false,
  },
  {
    name: 'semgrep',
    type: 'static',
    description: 'Multi-language static analysis with customizable rules',
    version: '1.154.0',
    author: 'Semgrep',
    tags: ['sast', 'multi-language'],
    requiresNetwork: false,
  },
  {
    name: 'opengrep',
    type: 'static',
    description: 'Open-source semantic code analysis (OpenGrep)',
    version: '1.0.0',
    author: 'OpenGrep',
    tags: ['sast', 'semantic'],
    requiresNetwork: false,
  },
  {
    name: 'nuclei',
    type: 'dynamic',
    description: 'Template-based vulnerability scanner for web applications',
    version: '2.9.15',
    author: 'ProjectDiscovery',
    tags: ['dast', 'web', 'network'],
    requiresNetwork: true,
  },
  {
    name: 'zap',
    type: 'dynamic',
    description: 'OWASP ZAP – full-featured web app security scanner',
    version: '2.15.0',
    author: 'OWASP',
    tags: ['dast', 'web'],
    requiresNetwork: true,
  },
  {
    name: 'sqlmap',
    type: 'dynamic',
    description: 'Automatic SQL injection detection and exploitation',
    version: '1.8.4',
    author: 'Bernardo Damele',
    tags: ['dast', 'sql-injection'],
    requiresNetwork: true,
  },
  {
    name: 'nmap',
    type: 'dynamic',
    description: 'Network scanning and discovery',
    version: '7.95',
    author: 'Gordon Lyon',
    tags: ['network', 'recon'],
    requiresNetwork: true,
  },
  {
    name: 'ssl',
    type: 'dynamic',
    description: 'SSL/TLS configuration analysis',
    version: '1.0.0',
    tags: ['crypto', 'tls'],
    requiresNetwork: true,
  },
  {
    name: 'gitleaks',
    type: 'secret',
    description: 'Detect hardcoded secrets in git repositories',
    version: '8.18.0',
    author: 'Gitleaks',
    tags: ['secrets', 'git'],
    requiresNetwork: false,
  },
  {
    name: 'trufflehog',
    type: 'secret',
    description: 'Advanced secrets detection with verification',
    version: '3.93.7',
    author: 'Truffle Security',
    tags: ['secrets', 'verification'],
    requiresNetwork: false,
  },
  {
    name: 'trivy',
    type: 'composition',
    description: 'Comprehensive vulnerability scanner for containers and dependencies',
    version: '0.69.3',
    author: 'Aqua Security',
    tags: ['sca', 'container', 'iac'],
    requiresNetwork: false,
  },
  {
    name: 'grype',
    type: 'dependency',
    description: 'Lightweight container and filesystem vulnerability scanner',
    version: '0.80.0',
    author: 'Anchore',
    tags: ['sca', 'container'],
    requiresNetwork: false,
  },
  {
    name: 'checkov',
    type: 'iac',
    description: 'Infrastructure as Code security scanning for Terraform, Kubernetes, etc.',
    version: '3.2.506',
    author: 'Bridgecrew',
    tags: ['iac', 'cloud'],
    requiresNetwork: false,
  },
  {
    name: 'mobsf',
    type: 'static',
    description: 'Mobile application security testing for Android/iOS',
    version: '3.8.0',
    author: 'MobSF',
    tags: ['mobile', 'sast'],
    requiresNetwork: false,
  },
  {
    name: 'test-scanner',
    type: 'static',
    description: 'Test scanner for development and debugging',
    version: '0.1.0',
    tags: ['test'],
    requiresNetwork: false,
  },
];

/**
 * GET /api/scanners - List all available security scanners
 */
router.get('/', (_req: Request, res: Response) => {
  res.json(AVAILABLE_SCANNERS);
});

export default router;
