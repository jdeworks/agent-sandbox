// Simple UUID v4 generator (inline to avoid external dependency)
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

import { spawn } from 'child_process';
import * as path from 'path';
import { BaseScanner, ScannerConfig, ScanResult, ScannerType, ScannerMetadata } from './base';
import { ScannerRegistry, getGlobalRegistry } from './registry';
import { ScannerPlugin } from './discovery';
import { Vulnerability } from '@security-analyzer/types';
import * as fs from 'fs';

/**
 * Bandit JSON output interfaces
 */
interface BanditResult {
  errors: BanditError[];
  generated_at: string;
  metrics: Record<string, BanditMetrics>;
  results: BanditFinding[];
}

interface BanditError {
  filename: string;
  exception: string;
  reason: string;
}

interface BanditMetrics {
  loc: number;
  nosec: number;
  skipped_tests: number;
  'SEVERITY.HIGH': number;
  'SEVERITY.LOW': number;
  'SEVERITY.MEDIUM': number;
  'SEVERITY.UNDEFINED': number;
  'CONFIDENCE.HIGH': number;
  'CONFIDENCE.LOW': number;
  'CONFIDENCE.MEDIUM': number;
  'CONFIDENCE.UNDEFINED': number;
}

interface BanditFinding {
  code: string;
  col_offset: number;
  end_col_offset: number;
  filename: string;
  issue_confidence: 'HIGH' | 'LOW' | 'MEDIUM' | 'UNDEFINED';
  issue_cwe?: {
    id: number;
    link: string;
  };
  issue_severity: 'HIGH' | 'LOW' | 'MEDIUM' | 'UNDEFINED';
  issue_text: string;
  line_number: number;
  line_range: number[];
  more_info: string;
  test_id: string;
  test_name: string;
}

/**
 * Bandit Scanner - Python SAST scanner using Bandit
 * Detects common security issues in Python code
 */
export class BanditScanner extends BaseScanner {
  public readonly name = 'bandit';
  public readonly type: ScannerType = 'static';

  private banditPath: string = 'bandit';
  private tempFiles: string[] = [];

  getMetadata(): ScannerMetadata {
    return {
      name: this.name,
      type: this.type,
      description:
        'Python SAST scanner using Bandit for detecting common security issues in Python code',
      version: '1.0.0',
      author: 'Security Analyzer Team',
      tags: ['sast', 'python', 'security', 'vulnerabilities', 'static-analysis'],
      supportedTargets: ['*.py', '**/*.py'],
      requiresNetwork: false,
    };
  }

  protected async onInit(config: ScannerConfig): Promise<void> {
    console.log(`[BanditScanner] Initializing with options:`, config.options);

    // Allow configuration override
    if (config.options?.banditPath) {
      this.banditPath = config.options.banditPath as string;
    }

    // Verify bandit is available
    try {
      await this.runCommand([this.banditPath, '--version']);
      console.log(`[BanditScanner] Bandit binary verified at: ${this.banditPath}`);
    } catch (error) {
      console.warn(
        `[BanditScanner] Warning: Could not verify Bandit at ${this.banditPath}:`,
        error
      );
    }
  }

  protected async onScan(target: string, options?: Record<string, unknown>): Promise<ScanResult> {
    const scanId = generateUUID();

    console.log(`[BanditScanner] Performing Bandit scan on: ${target}`);

    // Build the command arguments
    const args = [
      '-r', // Recursive scan
      target,
      '-f',
      'json', // JSON output format
    ];

    // Add any extra options
    if (options?.excludePatterns) {
      const excludes = (options.excludePatterns as string[]).map((p) => `--exclude=${p}`);
      args.push(...excludes);
    }

    // Run bandit and capture output
    const output = await this.runCommand([this.banditPath, ...args], options?.timeout as number);

    // Parse the JSON output
    const parsedOutput = this.parseBanditOutput(output);

    // Map to Vulnerability interface
    const vulnerabilities = this.mapToVulnerabilities(parsedOutput, scanId);

    return this.createScanResult(scanId, vulnerabilities);
  }

  /**
   * Run a command and return stdout
   */
  private async runCommand(args: string[], timeout?: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const proc = spawn(args[0], args.slice(1), {
        shell: false,
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      // Set timeout
      const timeoutMs = timeout || 300000; // 5 minutes default
      const timer = setTimeout(() => {
        proc.kill();
        reject(new Error(`Command timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      proc.on('close', (code) => {
        clearTimeout(timer);

        // Bandit returns exit code 1 when findings are found
        // Exit code 0 means no findings, exit code >1 means error
        if (code !== null && code > 1) {
          reject(new Error(`Bandit exited with code ${code}: ${stderr}`));
        } else {
          resolve(stdout);
        }
      });

      proc.on('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
  }

  /**
   * Parse Bandit JSON output
   */
  private parseBanditOutput(output: string): BanditResult {
    try {
      // Bandit may output some text before the JSON, find the start
      const jsonStart = output.indexOf('{');

      if (jsonStart === -1) {
        console.error(`[BanditScanner] Could not find JSON start in output`);
        return {
          errors: [{ filename: '', exception: 'Parse error', reason: 'Could not find JSON start' }],
          generated_at: new Date().toISOString(),
          metrics: {},
          results: [],
        };
      }

      const jsonString = output.substring(jsonStart);
      return JSON.parse(jsonString);
    } catch (error) {
      console.error(`[BanditScanner] Failed to parse Bandit output:`, error);
      return {
        errors: [{ filename: '', exception: 'Parse error', reason: String(error) }],
        generated_at: new Date().toISOString(),
        metrics: {},
        results: [],
      };
    }
  }

  /**
   * Map Bandit findings to Vulnerability interface
   */
  private mapToVulnerabilities(parsed: BanditResult, scanId: string): Vulnerability[] {
    const vulnerabilities: Vulnerability[] = [];

    for (const finding of parsed.results) {
      const severity = this.mapSeverity(finding.issue_severity);

      // Extract CVE from CWE if available
      let cve: string | undefined;
      if (finding.issue_cwe) {
        cve = `CWE-${finding.issue_cwe.id}`;
      }

      // Extract category from test_id (e.g., B403 -> security, B608 -> injection)
      const category = this.extractCategory(finding.test_id);

      vulnerabilities.push(
        this.createVulnerability(
          scanId,
          this.extractVulnerabilityName(finding.test_id, finding.test_name, finding.issue_text),
          finding.issue_text,
          severity,
          {
            filePath: finding.filename,
            lineNumber: finding.line_number,
            code: finding.code,
            cve,
            recommendation: this.generateRecommendation(finding.test_id, finding.more_info),
          }
        )
      );
    }

    return vulnerabilities;
  }

  /**
   * Map Bandit severity to Vulnerability severity
   */
  private mapSeverity(banditSeverity: string): Vulnerability['severity'] {
    switch (banditSeverity) {
      case 'HIGH':
        return 'high';
      case 'MEDIUM':
        return 'medium';
      case 'LOW':
        return 'low';
      default:
        return 'medium';
    }
  }

  /**
   * Extract category from test_id
   */
  private extractCategory(testId: string): string {
    // Bandit test IDs: Bxxx - map to categories
    const categories: Record<string, string> = {
      B3: 'security',
      B4: 'security',
      B6: 'security',
      B1: 'insecure-code',
      B5: 'crypto',
    };

    // Extract prefix (first 2 chars after B)
    const prefix = testId.substring(0, 2);
    return categories[prefix] || 'security';
  }

  /**
   * Extract vulnerability name from test_id and test_name
   */
  private extractVulnerabilityName(testId: string, testName: string, issueText: string): string {
    // Convert test_name to title case for readability
    const name = testName
      .replace(/_/g, ' ')
      .split(' ')
      .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');

    return name || issueText.split('.')[0] || `Bandit ${testId}`;
  }

  /**
   * Generate a recommendation based on test_id
   */
  private generateRecommendation(testId: string, moreInfo: string): string {
    const recommendations: Record<string, string> = {
      B403: 'Avoid using pickle for deserializing untrusted data. Use JSON or other safe serialization methods.',
      B301: 'Avoid using pickle for deserializing untrusted data. Use JSON or other safe serialization methods.',
      B608: 'Use parameterized queries or an ORM to prevent SQL injection vulnerabilities.',
      B605: 'Avoid using shell=True in subprocess calls. Use list of arguments instead.',
      B105: 'Remove hardcoded passwords. Use environment variables or a secrets management system.',
      B106: 'Remove hardcoded passwords. Use environment variables or a secrets management system.',
      B107: 'Remove hardcoded passwords. Use environment variables or a secrets management system.',
    };

    return (
      recommendations[testId] ||
      `Review the code and follow secure coding practices. See: ${moreInfo}`
    );
  }

  protected async onCleanup(): Promise<void> {
    console.log(`[BanditScanner] Cleaning up temporary files...`);
    this.tempFiles = [];
  }

  canHandle(target: string): boolean {
    // If target is a directory, bandit can scan it recursively
    try {
      if (fs.existsSync(target) && fs.statSync(target).isDirectory()) {
        return true;
      }
    } catch {
      // If stat fails, fall back to extension check
    }
    // Bandit handles Python files
    return target.endsWith('.py') || target.includes('.py:') || target.includes('**/*.py');
  }

  /**
   * Set custom Bandit path
   */
  setBanditPath(banditPath: string): void {
    this.banditPath = banditPath;
  }
}

/**
 * Factory function for creating BanditScanner instances
 * Used for dependency injection
 */
export function createBanditScanner(dependencies: Record<string, unknown>): BanditScanner {
  console.log(
    '[BanditScanner] Creating new BanditScanner instance with dependencies:',
    Object.keys(dependencies)
  );
  return new BanditScanner();
}

/**
 * Scanner plugin definition
 * This can be auto-loaded by the plugin discovery system
 */
export const banditScannerPlugin: ScannerPlugin = {
  name: 'bandit',
  type: 'static',
  metadata: {
    description:
      'Python SAST scanner using Bandit for detecting common security issues in Python code',
    version: '1.0.0',
    author: 'Security Analyzer Team',
    tags: ['sast', 'python', 'security', 'vulnerabilities', 'static-analysis'],
    supportedTargets: ['*.py', '**/*.py'],
    requiresNetwork: false,
  },
  factory: createBanditScanner,
};

/**
 * Register the Bandit scanner with a registry
 */
export function registerBanditScanner(registry?: ScannerRegistry): void {
  const reg = registry ?? getGlobalRegistry();

  // Register using the plugin
  reg.registerFactory(
    banditScannerPlugin.name,
    banditScannerPlugin.type,
    banditScannerPlugin.factory,
    banditScannerPlugin.metadata
  );

  console.log('[BanditScanner] Registered with scanner registry');
}

// Export the scanner class as default for convenience
export default BanditScanner;
