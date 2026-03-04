/**
 * Unit tests for PDFReportGenerator
 */

import * as fs from 'fs';
import {
  PDFReportGenerator,
  VulnerabilityReport,
  VulnerabilityFinding,
  ExploitAnalysis,
} from '../pdf-report-generator';

describe('PDFReportGenerator', () => {
  const testOutputDir = '/tmp/test-security-reports';
  let generator: PDFReportGenerator;

  beforeEach(() => {
    // Create test output directory
    if (!fs.existsSync(testOutputDir)) {
      fs.mkdirSync(testOutputDir, { recursive: true });
    }

    generator = new PDFReportGenerator(testOutputDir);
  });

  afterEach(() => {
    // Cleanup
    if (fs.existsSync(testOutputDir)) {
      fs.rmSync(testOutputDir, { recursive: true });
    }
  });

  describe('constructor', () => {
    it('should create instance with default output directory', () => {
      const defaultGenerator = new PDFReportGenerator();
      expect(defaultGenerator).toBeDefined();
    });

    it('should create instance with custom output directory', () => {
      expect(generator).toBeDefined();
    });
  });

  describe('generateHTMLReport', () => {
    it('should generate HTML report file', async () => {
      const report = createMockReport();

      const filename = await generator.generateHTMLReport(report);

      expect(fs.existsSync(filename)).toBe(true);

      const content = fs.readFileSync(filename, 'utf-8');
      expect(content).toContain('<!DOCTYPE html>');
      expect(content).toContain('Security Report');
    });

    it('should include vulnerability count in report', async () => {
      const report = createMockReport();

      const filename = await generator.generateHTMLReport(report);
      const content = fs.readFileSync(filename, 'utf-8');

      expect(content).toContain('Total Vulnerabilities');
      expect(content).toContain('3');
    });

    it('should include severity breakdown', async () => {
      const report = createMockReport();

      const filename = await generator.generateHTMLReport(report);
      const content = fs.readFileSync(filename, 'utf-8');

      expect(content).toContain('Critical');
      expect(content).toContain('High');
      expect(content).toContain('Medium');
    });

    it('should include vulnerability details', async () => {
      const report = createMockReport();

      const filename = await generator.generateHTMLReport(report);
      const content = fs.readFileSync(filename, 'utf-8');

      expect(content).toContain('SQLi');
      expect(content).toContain('XSS');
      expect(content).toContain('eval(user_input)');
    });

    it('should include exploit analysis if present', async () => {
      const report = createMockReportWithExploit();

      const filename = await generator.generateHTMLReport(report);
      const content = fs.readFileSync(filename, 'utf-8');

      expect(content).toContain('Exploit Analysis');
      expect(content).toContain('Exploitability');
      expect(content).toContain('test payload');
    });
  });

  describe('generateMarkdownReport', () => {
    it('should generate Markdown report file', async () => {
      const report = createMockReport();

      const filename = await generator.generateMarkdownReport(report);

      expect(fs.existsSync(filename)).toBe(true);

      const content = fs.readFileSync(filename, 'utf-8');
      expect(content).toContain('# Security Report');
    });

    it('should include severity counts in table format', async () => {
      const report = createMockReport();

      const filename = await generator.generateMarkdownReport(report);
      const content = fs.readFileSync(filename, 'utf-8');

      expect(content).toContain('| Critical |');
      expect(content).toContain('| High |');
    });

    it('should include vulnerability details in Markdown', async () => {
      const report = createMockReport();

      const filename = await generator.generateMarkdownReport(report);
      const content = fs.readFileSync(filename, 'utf-8');

      expect(content).toContain('## Detailed Findings');
      expect(content).toContain('### 1.');
    });
  });

  describe('report structure', () => {
    it('should validate VulnerabilityReport interface', () => {
      const report: VulnerabilityReport = {
        title: 'Test Security Report',
        generatedAt: new Date(),
        totalVulnerabilities: 5,
        criticalCount: 2,
        highCount: 2,
        mediumCount: 1,
        byCategory: {
          SQLi: 2,
          XSS: 2,
          CMDi: 1,
        },
        byRepository: {
          repo1: 3,
          repo2: 2,
        },
        vulnerabilities: [],
      };

      expect(report.title).toBe('Test Security Report');
      expect(report.totalVulnerabilities).toBe(5);
      expect(Object.keys(report.byCategory)).toHaveLength(3);
    });

    it('should validate VulnerabilityFinding interface', () => {
      const finding: VulnerabilityFinding = {
        id: 'vuln-1',
        repository: 'test-repo',
        branch: 'main',
        commit: 'abc123',
        file: 'app.py',
        line: 42,
        category: 'SQLi',
        severity: 'critical',
        cwe: 'CWE-89',
        vulnerableCode: 'SELECT * FROM users WHERE id = ' + 'user_input',
        remediation: 'Use parameterized queries',
      };

      expect(finding.id).toBe('vuln-1');
      expect(finding.category).toBe('SQLi');
      expect(finding.severity).toBe('critical');
    });

    it('should validate ExploitAnalysis interface', () => {
      const exploit: ExploitAnalysis = {
        vulnerabilityId: 'vuln-1',
        isExploitable: true,
        exploitabilityScore: 9,
        attackVector: 'SQL injection via user input',
        exploitExamples: [
          {
            description: 'Extract admin password hash',
            payload: "' OR '1'='1' UNION SELECT password FROM admin--",
            steps: ['Send payload as user_id parameter', 'Observe UNION result with password hash'],
            expectedResult: 'Admin password hash in response',
            verificationMethod: 'Compare response with known admin hash',
          },
        ],
        suggestedFix: "cursor.execute('SELECT * FROM users WHERE id = ?', (user_input,))",
      };

      expect(exploit.isExploitable).toBe(true);
      expect(exploit.exploitabilityScore).toBe(9);
      expect(exploit.exploitExamples).toHaveLength(1);
      expect(exploit.exploitExamples[0].payload).toContain('UNION');
    });
  });
});

// Helper functions to create mock data

function createMockReport(): VulnerabilityReport {
  return {
    title: 'Security Report',
    generatedAt: new Date(),
    totalVulnerabilities: 3,
    criticalCount: 1,
    highCount: 1,
    mediumCount: 1,
    byCategory: {
      SQLi: 1,
      XSS: 1,
      CMDi: 1,
    },
    byRepository: {
      'test-repo': 3,
    },
    vulnerabilities: [
      {
        id: '1',
        repository: 'test-repo',
        branch: 'main',
        commit: 'abc123',
        file: 'app.py',
        line: 42,
        category: 'SQLi',
        severity: 'critical',
        cwe: 'CWE-89',
        vulnerableCode: "SELECT * FROM users WHERE id = '" + user_input + "'",
        remediation: 'Use parameterized queries',
      },
      {
        id: '2',
        repository: 'test-repo',
        branch: 'main',
        commit: 'abc123',
        file: 'templates/index.html',
        line: 15,
        category: 'XSS',
        severity: 'high',
        cwe: 'CWE-79',
        vulnerableCode: '<div>{{ user_input }}</div>',
        remediation: 'Use template escaping',
      },
      {
        id: '3',
        repository: 'test-repo',
        branch: 'main',
        commit: 'abc123',
        file: 'utils.py',
        line: 20,
        category: 'CMDi',
        severity: 'medium',
        cwe: 'CWE-78',
        vulnerableCode: 'os.system("ping " + user_input)',
        remediation: 'Use subprocess with shell=False',
      },
    ],
  };
}

function createMockReportWithExploit(): VulnerabilityReport {
  const report = createMockReport();

  report.vulnerabilities[0] = {
    ...report.vulnerabilities[0],
    exploitAnalysis: {
      vulnerabilityId: '1',
      isExploitable: true,
      exploitabilityScore: 9,
      attackVector: 'SQL injection',
      exploitExamples: [
        {
          description: 'Extract admin password',
          payload: "' OR '1'='1' UNION SELECT password FROM admin--",
          steps: ['Send payload'],
          expectedResult: 'Password hash returned',
          verificationMethod: 'Compare hash',
        },
      ],
      suggestedFix: 'Use parameterized queries',
    },
  };

  return report;
}
