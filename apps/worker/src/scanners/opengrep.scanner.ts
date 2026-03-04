// Simple UUID v4 generator (inline to avoid external dependency)
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import * as path from 'path';
import { BaseScanner, ScannerConfig, ScanResult, ScannerType, ScannerMetadata } from './base';
import { ScannerRegistry, getGlobalRegistry } from './registry';
import { ScannerPlugin } from './discovery';
import { Vulnerability } from '@security-analyzer/types';

/**
 * OpenGrep JSON output interfaces
 */
interface OpenGrepResult {
  version: string;
  results: OpenGrepFinding[];
  errors: OpenGrepError[];
  paths: {
    scanned: string[];
  };
}

interface OpenGrepFinding {
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
    metavars: Record<string, unknown>;
    message: string;
    metadata: {
      cwe?: string[];
      category?: string;
      technology?: string[];
      confidence?: string;
      owasp?: string[];
      vulnerability_class?: string[];
      [key: string]: unknown;
    };
    severity: 'ERROR' | 'WARNING' | 'INFO';
    fingerprint: string;
    lines: string;
    is_ignored: boolean;
  };
}

interface OpenGrepError {
  message: string;
  rule_id?: string;
}

/**
 * OpenGrep Scanner - SAST scanner using OpenGrep (community fork of Semgrep)
 * Detects security vulnerabilities, secrets, and code quality issues
 */
export class OpenGrepScanner extends BaseScanner {
  public readonly name = 'opengrep';
  public readonly type: ScannerType = 'static';

  private tempFiles: string[] = [];
  private opengrepPath: string = 'opengrep';
  private rulesConfig: string = 'auto';

  getMetadata(): ScannerMetadata {
    return {
      name: this.name,
      type: this.type,
      description:
        'SAST scanner using OpenGrep (community fork of Semgrep) for detecting security vulnerabilities, secrets, and code quality issues',
      version: '1.0.0',
      author: 'Security Analyzer Team',
      tags: ['sast', 'security', 'secrets', 'vulnerabilities', 'static-analysis'],
      supportedTargets: ['*.js', '*.ts', '*.py', '*.java', '*.go', '*.cs', '*.rb', '*.php', '*'],
      requiresNetwork: false,
    };
  }

  protected async onInit(config: ScannerConfig): Promise<void> {
    console.log(`[OpenGrepScanner] Initializing with options:`, config.options);

    // Allow configuration override
    if (config.options?.opengrepPath) {
      this.opengrepPath = config.options.opengrepPath as string;
    }

    if (config.options?.rulesConfig) {
      this.rulesConfig = config.options.rulesConfig as string;
    }

    // Verify opengrep is available
    try {
      await this.runCommand([this.opengrepPath, '--version']);
      console.log(`[OpenGrepScanner] OpenGrep binary verified at: ${this.opengrepPath}`);
    } catch (error) {
      console.warn(
        `[OpenGrepScanner] Warning: Could not verify OpenGrep at ${this.opengrepPath}:`,
        error
      );
    }
  }

  protected async onScan(target: string, options?: Record<string, unknown>): Promise<ScanResult> {
    const scanId = generateUUID();

    console.log(`[OpenGrepScanner] Performing OpenGrep scan on: ${target}`);

    // Build the command arguments
    const args = [
      'scan',
      '--config',
      (options?.rulesConfig as string) || this.rulesConfig,
      '--json',
      '--no-git-ignore', // Don't respect .gitignore for comprehensive scanning
    ];

    // Add any extra options
    if (options?.excludePatterns) {
      const excludes = (options.excludePatterns as string[]).map((p) => `--exclude-pattern=${p}`);
      args.push(...excludes);
    }

    // Add the target
    args.push(target);

    // Run opengrep and capture output
    const output = await this.runCommand([this.opengrepPath, ...args], options?.timeout as number);

    // Parse the JSON output
    const parsedOutput = this.parseOpenGrepOutput(output);

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

        // OpenGrep returns exit code 1 when findings are found (non-empty results)
        // Exit code 0 means no findings, exit code >1 means error
        if (code !== null && code > 1) {
          // Only reject on actual errors, not on findings
          reject(new Error(`OpenGrep exited with code ${code}: ${stderr}`));
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
   * Parse OpenGrep JSON output
   */
  private parseOpenGrepOutput(output: string): OpenGrepResult {
    // OpenGrep outputs some text before the JSON, need to find the JSON part
    // Find the first occurrence of {"version": which is the start of the JSON object
    const jsonStart = output.indexOf('{"version"');

    if (jsonStart === -1) {
      console.error(`[OpenGrepScanner] Could not find JSON start in output`);
      return {
        version: 'unknown',
        results: [],
        errors: [{ message: 'Could not find JSON start in output' }],
        paths: { scanned: [] },
      };
    }

    const jsonString = output.substring(jsonStart);

    try {
      return JSON.parse(jsonString);
    } catch (error) {
      console.error(`[OpenGrepScanner] Failed to parse OpenGrep output:`, error);
      return {
        version: 'unknown',
        results: [],
        errors: [{ message: `Parse error: ${error}` }],
        paths: { scanned: [] },
      };
    }
  }

  /**
   * Map OpenGrep findings to Vulnerability interface
   */
  private mapToVulnerabilities(parsed: OpenGrepResult, scanId: string): Vulnerability[] {
    const vulnerabilities: Vulnerability[] = [];

    for (const finding of parsed.results) {
      const severity = this.mapSeverity(finding.extra.severity);

      // Extract CVE if available
      let cve: string | undefined;
      if (finding.extra.metadata?.cwe) {
        const cweMatch = (finding.extra.metadata.cwe as string[]).find((c) => c.startsWith('CVE-'));
        if (cweMatch) {
          cve = cweMatch;
        }
      }

      // Determine category from check_id
      const category = this.extractCategory(finding.check_id);

      vulnerabilities.push(
        this.createVulnerability(
          scanId,
          this.extractVulnerabilityName(finding.check_id, finding.extra.message),
          finding.extra.message,
          severity,
          {
            filePath: finding.path,
            lineNumber: finding.start.line,
            code: finding.extra.lines,
            cve,
            recommendation: this.generateRecommendation(finding.extra.metadata, category),
          }
        )
      );
    }

    return vulnerabilities;
  }

  /**
   * Map OpenGrep severity to Vulnerability severity
   */
  private mapSeverity(opengrepSeverity: string): Vulnerability['severity'] {
    switch (opengrepSeverity) {
      case 'ERROR':
        return 'high';
      case 'WARNING':
        return 'medium';
      case 'INFO':
        return 'low';
      default:
        return 'medium';
    }
  }

  /**
   * Extract category from check_id
   */
  private extractCategory(checkId: string): string {
    const parts = checkId.split('.');
    if (parts.length >= 2) {
      return parts[1]; // e.g., "secrets" from "generic.secrets.security.xxx"
    }
    return 'security';
  }

  /**
   * Extract vulnerability name from check_id and message
   */
  private extractVulnerabilityName(checkId: string, message: string): string {
    // Try to extract a readable name from check_id
    const parts = checkId.split('.');
    if (parts.length >= 3) {
      // Convert check_id to title case
      const name = parts[parts.length - 1].replace(/-/g, ' ');
      return name.charAt(0).toUpperCase() + name.slice(1);
    }
    return message.split('.')[0] || 'Security Finding';
  }

  /**
   * Generate a recommendation based on metadata
   */
  private generateRecommendation(
    metadata: OpenGrepFinding['extra']['metadata'],
    category: string
  ): string {
    const recommendations: Record<string, string> = {
      secrets:
        'Remove hardcoded secrets, API keys, and tokens. Use environment variables or a secrets management system.',
      security: 'Review the code for security vulnerabilities and follow secure coding practices.',
      'best-practice': 'Follow language-specific best practices and coding standards.',
    };

    return recommendations[category] || recommendations['security'];
  }

  protected async onCleanup(): Promise<void> {
    console.log(`[OpenGrepScanner] Cleaning up temporary files...`);

    // Clean up any temporary files
    for (const tempFile of this.tempFiles) {
      try {
        await fs.unlink(tempFile);
      } catch (error) {
        console.warn(`[OpenGrepScanner] Failed to delete temp file ${tempFile}:`, error);
      }
    }

    this.tempFiles = [];
  }

  canHandle(target: string): boolean {
    // OpenGrep can handle any file/directory
    // Supported extensions are handled by OpenGrep internally
    return target.length > 0;
  }

  /**
   * Add a temporary file to be cleaned up later
   */
  addTempFile(filePath: string): void {
    this.tempFiles.push(filePath);
  }

  /**
   * Set custom OpenGrep path
   */
  setOpengrepPath(opengrepPath: string): void {
    this.opengrepPath = opengrepPath;
  }

  /**
   * Set custom rules config
   */
  setRulesConfig(rulesConfig: string): void {
    this.rulesConfig = rulesConfig;
  }
}

/**
 * Factory function for creating OpenGrepScanner instances
 * Used for dependency injection
 */
export function createOpenGrepScanner(dependencies: Record<string, unknown>): OpenGrepScanner {
  console.log(
    '[OpenGrepScanner] Creating new OpenGrepScanner instance with dependencies:',
    Object.keys(dependencies)
  );
  return new OpenGrepScanner();
}

/**
 * Scanner plugin definition
 * This can be auto-loaded by the plugin discovery system
 */
export const openGrepScannerPlugin: ScannerPlugin = {
  name: 'opengrep',
  type: 'static',
  metadata: {
    description:
      'SAST scanner using OpenGrep (community fork of Semgrep) for detecting security vulnerabilities, secrets, and code quality issues',
    version: '1.0.0',
    author: 'Security Analyzer Team',
    tags: ['sast', 'security', 'secrets', 'vulnerabilities', 'static-analysis'],
    supportedTargets: ['*.js', '*.ts', '*.py', '*.java', '*.go', '*.cs', '*.rb', '*.php', '*'],
    requiresNetwork: false,
  },
  factory: createOpenGrepScanner,
};

/**
 * Register the OpenGrep scanner with a registry
 */
export function registerOpenGrepScanner(registry?: ScannerRegistry): void {
  const reg = registry ?? getGlobalRegistry();

  // Register using the plugin
  reg.registerFactory(
    openGrepScannerPlugin.name,
    openGrepScannerPlugin.type,
    openGrepScannerPlugin.factory,
    openGrepScannerPlugin.metadata
  );

  console.log('[OpenGrepScanner] Registered with scanner registry');
}

// Export the scanner class as default for convenience
export default OpenGrepScanner;
