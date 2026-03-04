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

/**
 * Semgrep JSON output interfaces
 */
interface SemgrepResult {
  version: string;
  results: SemgrepFinding[];
  errors: SemgrepError[];
  paths: {
    scanned: string[];
  };
  time?: {
    total_time: number;
  };
}

interface SemgrepError {
  path?: string;
  line?: number;
  message: string;
}

interface SemgrepFinding {
  check_id: string;
  path: string;
  start: {
    line: number;
    col: number;
    offset: number;
  };
  end: {
    line: number;
    col: number;
    offset: number;
  };
  extra: {
    message: string;
    severity: string;
    metadata?: {
      owasp?: string[];
      cwe?: string[];
      category?: string;
      technology?: string[];
      vulnerability_class?: string[];
      references?: string[];
      likelihood?: string;
      impact?: string;
      confidence?: string;
    };
    lines?: string;
    fingerprint?: string;
    engine_kind?: string;
  };
}

/**
 * Semgrep Scanner - Multi-language SAST scanner
 * Detects security issues using Semgrep's rule-based analysis
 */
export class SemgrepScanner extends BaseScanner {
  public readonly name = 'semgrep';
  public readonly type: ScannerType = 'static';

  private semgrepPath: string = 'semgrep';
  private tempFiles: string[] = [];

  getMetadata(): ScannerMetadata {
    return {
      name: this.name,
      type: this.type,
      description:
        'Multi-language SAST scanner using Semgrep for detecting security issues via pattern matching',
      version: '1.0.0',
      author: 'Security Analyzer Team',
      tags: ['sast', 'multi-language', 'security', 'vulnerabilities', 'static-analysis', 'semgrep'],
      supportedTargets: ['*', '**/*'],
      requiresNetwork: false,
    };
  }

  protected async onInit(config: ScannerConfig): Promise<void> {
    console.log(`[SemgrepScanner] Initializing with options:`, config.options);

    // Allow configuration override
    if (config.options?.semgrepPath) {
      this.semgrepPath = config.options.semgrepPath as string;
    }

    // Verify semgrep is available
    try {
      await this.runCommand([this.semgrepPath, '--version']);
      console.log(`[SemgrepScanner] Semgrep binary verified at: ${this.semgrepPath}`);
    } catch (error) {
      console.warn(
        `[SemgrepScanner] Warning: Could not verify Semgrep at ${this.semgrepPath}:`,
        error
      );
    }
  }

  protected async onScan(target: string, options?: Record<string, unknown>): Promise<ScanResult> {
    const scanId = generateUUID();

    console.log(`[SemgrepScanner] Performing Semgrep scan on: ${target}`);

    // Build the command arguments
    const args = ['--json', '--config=auto', target];

    // Add any extra options
    if (options?.excludePatterns) {
      const excludes = (options.excludePatterns as string[]).map((p) => `--exclude=${p}`);
      args.push(...excludes);
    }

    if (options?.rules) {
      args.push('--config', options.rules as string);
    }

    // Run semgrep and capture output
    const output = await this.runCommand([this.semgrepPath, ...args], options?.timeout as number);

    // Parse the JSON output
    const parsedOutput = this.parseSemgrepOutput(output);

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

        // Semgrep returns exit code 0 when no findings, 1 when findings found
        // Exit code >1 means error
        if (code !== null && code > 1) {
          reject(new Error(`Semgrep exited with code ${code}: ${stderr}`));
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
   * Parse Semgrep JSON output
   */
  private parseSemgrepOutput(output: string): SemgrepResult {
    try {
      // Semgrep may output some text before the JSON, find the start
      const jsonStart = output.indexOf('{');

      if (jsonStart === -1) {
        console.error(`[SemgrepScanner] Could not find JSON start in output`);
        return {
          version: '',
          results: [],
          errors: [{ message: 'Could not find JSON start' }],
          paths: { scanned: [] },
        };
      }

      const jsonString = output.substring(jsonStart);
      return JSON.parse(jsonString);
    } catch (error) {
      console.error(`[SemgrepScanner] Failed to parse Semgrep output:`, error);
      return {
        version: '',
        results: [],
        errors: [{ message: String(error) }],
        paths: { scanned: [] },
      };
    }
  }

  /**
   * Map Semgrep findings to Vulnerability interface
   */
  private mapToVulnerabilities(parsed: SemgrepResult, scanId: string): Vulnerability[] {
    const vulnerabilities: Vulnerability[] = [];

    for (const finding of parsed.results) {
      const severity = this.mapSeverity(finding.extra.severity);

      // Extract CVE from CWE if available
      let cve: string | undefined;
      if (finding.extra.metadata?.cwe) {
        cve = finding.extra.metadata.cwe[0];
      }

      // Extract category from check_id or metadata
      const category = this.extractCategory(finding.check_id, finding.extra.metadata);

      vulnerabilities.push(
        this.createVulnerability(
          scanId,
          this.extractVulnerabilityName(finding.check_id),
          finding.extra.message,
          severity,
          {
            filePath: finding.path,
            lineNumber: finding.start.line,
            code: finding.extra.lines,
            cve,
            recommendation: this.generateRecommendation(finding.check_id, finding.extra.metadata),
          }
        )
      );
    }

    return vulnerabilities;
  }

  /**
   * Map Semgrep severity to Vulnerability severity
   */
  private mapSeverity(semgrepSeverity: string): Vulnerability['severity'] {
    switch (semgrepSeverity.toUpperCase()) {
      case 'ERROR':
        return 'critical';
      case 'WARNING':
        return 'high';
      case 'INFO':
        return 'medium';
      default:
        return 'medium';
    }
  }

  /**
   * Extract category from check_id or metadata
   */
  private extractCategory(checkId: string, metadata?: SemgrepFinding['extra']['metadata']): string {
    // Try to extract from metadata first
    if (metadata?.category) {
      return metadata.category;
    }

    // Extract from check_id (e.g., python.lang.security -> security)
    const parts = checkId.split('.');
    if (parts.length >= 2) {
      return parts[1] || 'security';
    }

    return 'security';
  }

  /**
   * Extract vulnerability name from check_id
   */
  private extractVulnerabilityName(checkId: string): string {
    // Convert check_id to readable format
    // e.g., python.lang.security.deserialization.pickle.avoid-pickle -> Avoid Pickle Deserialization
    const parts = checkId.split('.');

    // Get the last meaningful part
    const lastPart = parts[parts.length - 1];

    // Convert to title case
    const name = lastPart
      .replace(/-/g, ' ')
      .split(' ')
      .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');

    return name || checkId;
  }

  /**
   * Generate a recommendation based on check_id and metadata
   */
  private generateRecommendation(
    checkId: string,
    metadata?: SemgrepFinding['extra']['metadata']
  ): string {
    // Use references from metadata if available
    if (metadata?.references && metadata.references.length > 0) {
      return `Review the code and follow secure coding practices. See: ${metadata.references[0]}`;
    }

    // Use OWASP if available
    if (metadata?.owasp && metadata.owasp.length > 0) {
      return `This vulnerability is related to ${metadata.owasp[0]}. Review and remediate accordingly.`;
    }

    return 'Review the code and follow secure coding practices.';
  }

  protected async onCleanup(): Promise<void> {
    console.log(`[SemgrepScanner] Cleaning up temporary files...`);
    this.tempFiles = [];
  }

  canHandle(target: string): boolean {
    // Semgrep can handle any file/directory
    return true;
  }

  /**
   * Set custom Semgrep path
   */
  setSemgrepPath(semgrepPath: string): void {
    this.semgrepPath = semgrepPath;
  }
}

/**
 * Factory function for creating SemgrepScanner instances
 * Used for dependency injection
 */
export function createSemgrepScanner(dependencies: Record<string, unknown>): SemgrepScanner {
  console.log(
    '[SemgrepScanner] Creating new SemgrepScanner instance with dependencies:',
    Object.keys(dependencies)
  );
  return new SemgrepScanner();
}

/**
 * Scanner plugin definition
 * This can be auto-loaded by the plugin discovery system
 */
export const semgrepScannerPlugin: ScannerPlugin = {
  name: 'semgrep',
  type: 'static',
  metadata: {
    description:
      'Multi-language SAST scanner using Semgrep for detecting security issues via pattern matching',
    version: '1.0.0',
    author: 'Security Analyzer Team',
    tags: ['sast', 'multi-language', 'security', 'vulnerabilities', 'static-analysis', 'semgrep'],
    supportedTargets: ['*', '**/*'],
    requiresNetwork: false,
  },
  factory: createSemgrepScanner,
};

/**
 * Register the Semgrep scanner with a registry
 */
export function registerSemgrepScanner(registry?: ScannerRegistry): void {
  const reg = registry ?? getGlobalRegistry();

  // Register using the plugin
  reg.registerFactory(
    semgrepScannerPlugin.name,
    semgrepScannerPlugin.type,
    semgrepScannerPlugin.factory,
    semgrepScannerPlugin.metadata
  );

  console.log('[SemgrepScanner] Registered with scanner registry');
}

// Export the scanner class as default for convenience
export default SemgrepScanner;
