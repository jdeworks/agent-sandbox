// Simple UUID v4 generator
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

import { spawn } from 'child_process';
import * as fs from 'fs';
import { BaseScanner, ScannerConfig, ScanResult, ScannerType, ScannerMetadata } from './base';
import { ScannerRegistry, getGlobalRegistry } from './registry';
import { ScannerPlugin } from './discovery';
import { Vulnerability } from '@security-analyzer/types';

interface TrivyResult {
  Results?: {
    Target: string;
    Vulnerabilities?: {
      VulnerabilityID: string;
      PkgName: string;
      InstalledVersion: string;
      FixedVersion?: string;
      Severity: string;
      Title: string;
      Description: string;
    }[];
    Misconfigurations?: {
      ID: string;
      Title: string;
      Description: string;
      Severity: string;
      Message: string;
    }[];
  }[];
}

/**
 * Trivy Scanner - Container security scanner
 */
export class TrivyScanner extends BaseScanner {
  public readonly name = 'trivy';
  public readonly type: ScannerType = 'composition';
  private trivyPath = 'trivy';

  getMetadata(): ScannerMetadata {
    return {
      name: this.name,
      type: this.type,
      description: 'Container security scanner',
      version: '1.0.0',
      author: 'Security Analyzer Team',
      tags: ['container', 'vulnerability'],
      supportedTargets: ['Docker images', 'filesystems'],
      requiresNetwork: true,
    };
  }

  protected async onInit(config: ScannerConfig): Promise<void> {
    if (config.options?.trivyPath) this.trivyPath = config.options.trivyPath as string;
    try {
      await this.runCommand([this.trivyPath, '--version']);
    } catch {
      console.warn(`[TrivyScanner] Warning: Could not verify Trivy`);
    }
  }

  protected async onScan(target: string, options?: Record<string, unknown>): Promise<ScanResult> {
    const scanId = generateUUID();
    const scanType = this.detectScanType(target);
    const args = this.buildCommand(target, scanType, options);
    args.push('--format', 'json', '--output', '/dev/stdout');
    const output = await this.runCommand([this.trivyPath, ...args], options?.timeout as number);
    const parsed = this.parseTrivyOutput(output);
    const vulnerabilities = this.mapToVulnerabilities(parsed, scanId);
    return this.createScanResult(scanId, vulnerabilities);
  }

  private detectScanType(target: string): 'image' | 'fs' {
    if (target.startsWith('docker.io/') || target.includes(':') || target.startsWith('sha256:'))
      return 'image';
    return 'fs';
  }

  private buildCommand(
    target: string,
    scanType: string,
    options?: Record<string, unknown>
  ): string[] {
    const args = [scanType, '--severity', 'UNKNOWN,LOW,MEDIUM,HIGH,CRITICAL', target];
    const scanners = (options?.scanners as string) || 'vuln,config';
    args.push('--scanners', scanners);
    return args;
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
      }, timeout || 600000);
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

  private parseTrivyOutput(output: string): TrivyResult {
    try {
      const jsonStart = output.indexOf('{');
      if (jsonStart === -1) return {};
      return JSON.parse(output.substring(jsonStart));
    } catch {
      return {};
    }
  }

  private mapToVulnerabilities(parsed: TrivyResult, scanId: string): Vulnerability[] {
    const vulnerabilities: Vulnerability[] = [];
    if (!parsed.Results) return vulnerabilities;
    for (const result of parsed.Results) {
      if (result.Vulnerabilities) {
        for (const v of result.Vulnerabilities) {
          vulnerabilities.push(
            this.createVulnerability(
              scanId,
              `${v.VulnerabilityID} - ${v.Title}`,
              v.Description,
              this.mapSeverity(v.Severity),
              {
                filePath: result.Target,
                cve: v.VulnerabilityID,
                recommendation: v.FixedVersion
                  ? `Upgrade to ${v.FixedVersion}`
                  : 'Review vulnerability',
              }
            )
          );
        }
      }
      if (result.Misconfigurations) {
        for (const m of result.Misconfigurations) {
          vulnerabilities.push(
            this.createVulnerability(
              scanId,
              `${m.ID} - ${m.Title}`,
              m.Description,
              this.mapSeverity(m.Severity),
              { filePath: result.Target, recommendation: m.Message }
            )
          );
        }
      }
    }
    return vulnerabilities;
  }

  private mapSeverity(s: string): Vulnerability['severity'] {
    switch (s.toUpperCase()) {
      case 'CRITICAL':
        return 'critical';
      case 'HIGH':
        return 'high';
      case 'MEDIUM':
        return 'medium';
      case 'LOW':
        return 'low';
      default:
        return 'info';
    }
  }

  protected async onCleanup(): Promise<void> {}
  canHandle(target: string): boolean {
    return target.startsWith('/') || target.includes(':') || target.startsWith('./');
  }
  setTrivyPath(p: string): void {
    this.trivyPath = p;
  }
}

export function createTrivyScanner(): TrivyScanner {
  return new TrivyScanner();
}
export const trivyScannerPlugin: ScannerPlugin = {
  name: 'trivy',
  type: 'composition',
  metadata: {
    description: 'Container security scanner',
    version: '1.0.0',
    author: 'Security Analyzer Team',
    tags: ['container', 'vulnerability'],
    supportedTargets: ['Docker images', 'filesystems'],
    requiresNetwork: true,
  },
  factory: createTrivyScanner,
};
export function registerTrivyScanner(registry?: ScannerRegistry): void {
  (registry ?? getGlobalRegistry()).registerFactory(
    trivyScannerPlugin.name,
    trivyScannerPlugin.type,
    trivyScannerPlugin.factory,
    trivyScannerPlugin.metadata
  );
}
export default TrivyScanner;
