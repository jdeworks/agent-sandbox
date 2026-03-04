/**
 * Security Vulnerability PDF Report Generator
 *
 * Generates comprehensive PDF reports with:
 * - Executive summary
 * - Vulnerability details with code snippets
 * - Exploit analysis from AI agents
 * - Remediation steps
 * - Visual severity indicators
 */

import * as fs from 'fs';
import * as path from 'path';

interface ExploitAnalysis {
  vulnerabilityId: string;
  isExploitable: boolean;
  exploitabilityScore: number;
  attackVector: string;
  exploitExamples: ExploitExample[];
  suggestedFix: string;
}

interface ExploitExample {
  description: string;
  payload: string;
  steps: string[];
  expectedResult: string;
}

interface VulnerabilityReport {
  // Summary
  title: string;
  generatedAt: Date;
  totalVulnerabilities: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;

  // By category
  byCategory: Record<string, number>;
  byRepository: Record<string, number>;

  // Detailed findings
  vulnerabilities: VulnerabilityFinding[];
}

interface VulnerabilityFinding {
  id: string;
  repository: string;
  branch: string;
  commit: string;
  file: string;
  line: number;
  category: string;
  severity: string;
  cwe: string;

  // Vulnerable code
  vulnerableCode: string;
  functionContext?: string;

  // AI Analysis
  exploitAnalysis?: ExploitAnalysis;

  // Remediation
  remediation: string;
  cveReferences?: string[];
}

export class PDFReportGenerator {
  private outputDir: string;

  constructor(outputDir: string = '/tmp/security-reports') {
    this.outputDir = outputDir;
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
  }

  /**
   * Generate comprehensive HTML report
   */
  async generateHTMLReport(report: VulnerabilityReport): Promise<string> {
    const html = this.buildHTML(report);
    const filename = path.join(this.outputDir, `security-report-${Date.now()}.html`);
    fs.writeFileSync(filename, html);
    return filename;
  }

  /**
   * Generate Markdown report (for PDF conversion)
   */
  async generateMarkdownReport(report: VulnerabilityReport): Promise<string> {
    const md = this.buildMarkdown(report);
    const filename = path.join(this.outputDir, `security-report-${Date.now()}.md`);
    fs.writeFileSync(filename, md);
    return filename;
  }

  private buildHTML(report: VulnerabilityReport): string {
    const severityColors: Record<string, string> = {
      critical: '#dc2626',
      high: '#ea580c',
      medium: '#ca8a04',
      low: '#16a34a',
    };

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${report.title}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; max-width: 1200px; margin: 0 auto; padding: 20px; }
    h1 { color: #1f2937; border-bottom: 3px solid #3b82f6; padding-bottom: 10px; }
    h2 { color: #374151; margin-top: 40px; }
    h3 { color: #4b5563; }
    .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; margin: 30px 0; }
    .summary-card { background: #f9fafb; padding: 20px; border-radius: 8px; text-align: center; }
    .summary-card .count { font-size: 2.5em; font-weight: bold; }
    .summary-card .label { color: #6b7280; font-size: 0.9em; }
    .critical .count { color: #dc2626; }
    .high .count { color: #ea580c; }
    .medium .count { color: #ca8a04; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th, td { padding: 12px; text-align: left; border-bottom: 1px solid #e5e7eb; }
    th { background: #f3f4f6; font-weight: 600; }
    .severity-badge { padding: 4px 12px; border-radius: 9999px; font-size: 0.8em; font-weight: 600; color: white; }
    code { background: #f3f4f6; padding: 2px 6px; border-radius: 4px; font-size: 0.9em; }
    pre { background: #1f2937; color: #e5e7eb; padding: 16px; border-radius: 8px; overflow-x: auto; }
    .exploit-box { background: #fef2f2; border-left: 4px solid #dc2626; padding: 16px; margin: 16px 0; }
    .remediation-box { background: #f0fdf4; border-left: 4px solid #16a34a; padding: 16px; margin: 16px 0; }
    .vulnerability { margin-bottom: 40px; padding-bottom: 20px; border-bottom: 1px solid #e5e7eb; }
    .meta { color: #6b7280; font-size: 0.9em; }
    .toc { background: #f9fafb; padding: 20px; border-radius: 8px; margin-bottom: 30px; }
    .toc ul { columns: 2; }
  </style>
</head>
<body>
  <h1>${report.title}</h1>
  <p class="meta">Generated: ${report.generatedAt.toISOString()}</p>
  
  <h2>Executive Summary</h2>
  <div class="summary">
    <div class="summary-card critical">
      <div class="count">${report.criticalCount}</div>
      <div class="label">Critical</div>
    </div>
    <div class="summary-card high">
      <div class="count">${report.highCount}</div>
      <div class="label">High</div>
    </div>
    <div class="summary-card medium">
      <div class="count">${report.mediumCount}</div>
      <div class="label">Medium</div>
    </div>
    <div class="summary-card">
      <div class="count">${report.totalVulnerabilities}</div>
      <div class="label">Total</div>
    </div>
  </div>

  <h2>Breakdown by Category</h2>
  <table>
    <tr><th>Category</th><th>Count</th></tr>
    ${Object.entries(report.byCategory)
      .map(([cat, count]) => `<tr><td>${cat}</td><td>${count}</td></tr>`)
      .join('')}
  </table>

  <h2>Breakdown by Repository</h2>
  <table>
    <tr><th>Repository</th><th>Issues</th></tr>
    ${Object.entries(report.byRepository)
      .map(([repo, count]) => `<tr><td>${repo}</td><td>${count}</td></tr>`)
      .join('')}

  <h2>Detailed Findings</h2>
  ${report.vulnerabilities.map((vuln, idx) => this.renderVulnerabilityHTML(vuln, idx, severityColors)).join('')}
</body>
</html>`;
  }

  private renderVulnerabilityHTML(
    vuln: VulnerabilityFinding,
    idx: number,
    colors: Record<string, string>
  ): string {
    return `
<div class="vulnerability" id="vuln-${idx}">
  <h3>
    <span class="severity-badge" style="background: ${colors[vuln.severity] || '#6b7280'}">
      ${vuln.severity.toUpperCase()}
    </span>
    ${vuln.category}
  </h3>
  
  <p class="meta">
    <strong>Repository:</strong> ${vuln.repository} |
    <strong>Branch:</strong> ${vuln.branch} |
    <strong>Commit:</strong> ${vuln.commit} |
    <strong>File:</strong> ${vuln.file}:${vuln.line} |
    <strong>CWE:</strong> ${vuln.cwe}
  </p>

  <h4>Vulnerable Code</h4>
  <pre><code>${this.escapeHTML(vuln.vulnerableCode)}</code></pre>
  ${vuln.functionContext ? `<p><strong>Function:</strong> ${vuln.functionContext}</p>` : ''}

  ${
    vuln.exploitAnalysis
      ? `
    <div class="exploit-box">
      <h4>🔓 Exploit Analysis (AI Generated)</h4>
      <p><strong>Exploitability:</strong> ${vuln.exploitAnalysis.isExploitable ? '✅ YES - This vulnerability is exploitable!' : '❌ Not directly exploitable'}</p>
      <p><strong>Exploitability Score:</strong> ${vuln.exploitAnalysis.exploitabilityScore}/10</p>
      <p><strong>Attack Vector:</strong> ${vuln.exploitAnalysis.attackVector}</p>
      
      ${
        vuln.exploitAnalysis.exploitExamples.length > 0
          ? `
        <h4>📝 Concrete Exploit Examples</h4>
        ${vuln.exploitAnalysis.exploitExamples
          .map(
            (ex, i) => `
          <div style="background: white; padding: 12px; margin: 8px 0; border-radius: 4px;">
            <p><strong>${i + 1}. ${ex.description}</strong></p>
            <p><strong>Payload:</strong></p>
            <pre><code>${this.escapeHTML(ex.payload)}</code></pre>
            <p><strong>Steps:</strong></p>
            <ol>${ex.steps.map((s) => `<li>${s}</li>`).join('')}</ol>
            <p><strong>Expected Result:</strong> ${ex.expectedResult}</p>
          </div>
        `
          )
          .join('')}
      `
          : ''
      }
      
      ${
        vuln.exploitAnalysis.suggestedFix
          ? `
        <h4>🛡️ Suggested Fix</h4>
        <pre><code>${this.escapeHTML(vuln.exploitAnalysis.suggestedFix)}</code></pre>
      `
          : ''
      }
    </div>
  `
      : ''
  }

  <div class="remediation-box">
    <h4>💡 Remediation</h4>
    <p>${vuln.remediation}</p>
    ${vuln.cveReferences?.length ? `<p><strong>CVE References:</strong> ${vuln.cveReferences.join(', ')}</p>` : ''}
  </div>
</div>`;
  }

  private buildMarkdown(report: VulnerabilityReport): string {
    let md = `# ${report.title}

**Generated:** ${report.generatedAt.toISOString()}

---

## Executive Summary

| Severity | Count |
|----------|-------|
| Critical | ${report.criticalCount} |
| High | ${report.highCount} |
| Medium | ${report.mediumCount} |
| **Total** | **${report.totalVulnerabilities}** |

## Breakdown by Category

${Object.entries(report.byCategory)
  .map(([cat, count]) => `- ${cat}: ${count}`)
  .join('\n')}

## Breakdown by Repository

${Object.entries(report.byRepository)
  .map(([repo, count]) => `- ${repo}: ${count}`)
  .join('\n')}

---

## Detailed Findings

`;

    report.vulnerabilities.forEach((vuln, idx) => {
      md += `### ${idx + 1}. [${vuln.severity.toUpperCase()}] ${vuln.category}

**Location:** ${vuln.repository}/${vuln.file}:${vuln.line}
**Branch:** ${vuln.branch} | **Commit:** ${vuln.commit}
**CWE:** ${vuln.cwe}

\`\`\`
${vuln.vulnerableCode}
\`\`\`

**Remediation:** ${vuln.remediation}

${
  vuln.exploitAnalysis
    ? `
### 🔓 Exploit Analysis

**Exploitable:** ${vuln.exploitAnalysis.isExploitable ? 'YES ⚠️' : 'No'}
**Score:** ${vuln.exploitAnalysis.exploitabilityScore}/10

${vuln.exploitAnalysis.exploitExamples
  .map(
    (ex, i) => `
#### Exploit ${i + 1}: ${ex.description}

**Payload:**
\`\`\`
${ex.payload}
\`\`\`

**Steps:**
${ex.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}

**Expected Result:** ${ex.expectedResult}
`
  )
  .join('')}
`
    : ''
}

---

`;
    });

    return md;
  }

  private escapeHTML(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

export default PDFReportGenerator;
