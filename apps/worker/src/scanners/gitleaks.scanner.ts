// Simple UUID v4 generator
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

import { spawn } from 'child_process';
import { BaseScanner, ScannerConfig, ScanResult, ScannerType, ScannerMetadata } from './base';
import { ScannerRegistry, getGlobalRegistry } from './registry';
import { ScannerPlugin } from './discovery';
import { Vulnerability } from '@security-analyzer/types';

interface GitleaksFinding {
  RuleID: string;
  Match?: string;
  LineNumber?: number;
  Line?: number;
  Source?: string;
  Content?: string;
}

/**
 * Gitleaks Scanner - Secrets detection
 */
export class GitleaksScanner extends BaseScanner {
  public readonly name = 'gitleaks';
  public readonly type: ScannerType = 'secret';
  private gitleaksPath = 'gitleaks';

  getMetadata(): ScannerMetadata {
    return {
      name: this.name,
      type: this.type,
      description: 'Secrets detection scanner',
      version: '1.0.0',
      author: 'Security Analyzer Team',
      tags: ['secret', 'secrets-detection'],
      supportedTargets: ['directories', 'git repos'],
      requiresNetwork: false,
    };
  }

  protected async onInit(config: ScannerConfig): Promise<void> {
    if (config.options?.gitleaksPath) this.gitleaksPath = config.options.gitleaksPath as string;
    try {
      await this.runCommand([this.gitleaksPath, '--version']);
    } catch {
      console.warn(`[GitleaksScanner] Warning: Could not verify Gitleaks`);
    }
  }

  protected async onScan(target: string, options?: Record<string, unknown>): Promise<ScanResult> {
    const scanId = generateUUID();
    const args = ['detect', '--no-git', '--format', 'json', '--redact', '--source', target];
    if (options?.config) args.push('--config', options.config as string);
    let output = '';
    try {
      output = await this.runCommand([this.gitleaksPath, ...args], options?.timeout as number);
    } catch (e) {
      output = (e as Error).message || '';
    }
    const findings = this.parseGitleaksOutput(output);
    const vulnerabilities = this.mapToVulnerabilities(findings, scanId);
    return this.createScanResult(scanId, vulnerabilities);
  }

  private async runCommand(args: string[], timeout?: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const proc = spawn(args[0], args.slice(1), { shell: false });
      let stdout = '',
        stderr = '';
      proc.stdout.on('data', (d) => {
        stdout += d.toString();
      });
      proc.stderr.on('data', (d) => {
        stderr += d.toString();
      });
      const timer = setTimeout(() => {
        proc.kill();
        reject(new Error('Timeout'));
      }, timeout || 300000);
      proc.on('close', (code) => {
        clearTimeout(timer);
        if (code !== null && code > 1) reject(new Error(stderr));
        else resolve(stdout);
      });
      proc.on('error', (e) => {
        clearTimeout(timer);
        reject(e);
      });
    });
  }

  private parseGitleaksOutput(output: string): GitleaksFinding[] {
    const findings: GitleaksFinding[] = [];
    if (!output) return findings;
    for (const line of output.trim().split('\n')) {
      try {
        const p = JSON.parse(line);
        if (p.RuleID) findings.push(p);
      } catch {}
    }
    return findings;
  }

  private mapToVulnerabilities(findings: GitleaksFinding[], scanId: string): Vulnerability[] {
    return findings.map((f) =>
      this.createVulnerability(
        scanId,
        f.RuleID,
        `Secret detected: ${f.RuleID}`,
        this.mapSeverity(f.RuleID),
        {
          filePath: f.Source || '',
          lineNumber: f.LineNumber || f.Line,
          recommendation: 'Remove hardcoded secrets from code.',
        }
      )
    );
  }

  private mapSeverity(ruleID: string): Vulnerability['severity'] {
    const high = ['aws-access-key', 'github-token', 'private-key', 'password', 'api-key'];
    const med = ['slack-token', 'stripe-api-key'];
    const r = ruleID.toLowerCase();
    if (high.some((h) => r.includes(h))) return 'critical';
    if (med.some((m) => r.includes(m))) return 'high';
    return 'medium';
  }

  protected async onCleanup(): Promise<void> {}
  canHandle(target: string): boolean {
    return target.startsWith('/') || target.startsWith('./') || target.includes('.git');
  }
  setGitleaksPath(p: string): void {
    this.gitleaksPath = p;
  }
}

export function createGitleaksScanner(): GitleaksScanner {
  return new GitleaksScanner();
}
export const gitleaksScannerPlugin: ScannerPlugin = {
  name: 'gitleaks',
  type: 'secret',
  metadata: {
    description: 'Secrets detection scanner',
    version: '1.0.0',
    author: 'Security Analyzer Team',
    tags: ['secret', 'secrets-detection'],
    supportedTargets: ['directories', 'git repos'],
    requiresNetwork: false,
  },
  factory: createGitleaksScanner,
};
export function registerGitleaksScanner(registry?: ScannerRegistry): void {
  (registry ?? getGlobalRegistry()).registerFactory(
    gitleaksScannerPlugin.name,
    gitleaksScannerPlugin.type,
    gitleaksScannerPlugin.factory,
    gitleaksScannerPlugin.metadata
  );
}
export default GitleaksScanner;
