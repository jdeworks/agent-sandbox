/**
 * Checkov Scanner - Infrastructure as Code Security
 *
 * Detects security misconfigurations in:
 * - Terraform
 * - CloudFormation
 * - Kubernetes
 * - Azure Resource Manager
 * - Docker
 */

import { spawn } from 'child_process';
import { BaseScanner, ScannerConfig, ScanResult, ScannerType, ScannerMetadata } from './base';
import { ScannerRegistry, getGlobalRegistry } from './registry';
import { ScannerPlugin } from './discovery';
import { Vulnerability } from '@security-analyzer/types';

interface CheckovFinding {
  check_id: string;
  check_name: string;
  check_result: {
    result: string;
    evaluated_keys?: string[];
  };
  file_path: string;
  file_line_range?: [number, number];
  resource?: string;
  evaluations?: Record<string, unknown>;
  fixed_definition?: string;
  severity?: string;
}

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Checkov Scanner - IaC security scanning
 */
export class CheckovScanner extends BaseScanner {
  public readonly name = 'checkov';
  public readonly type: ScannerType = 'iac';
  private checkovPath = 'checkov';

  getMetadata(): ScannerMetadata {
    return {
      name: this.name,
      type: this.type,
      description:
        'Infrastructure as Code security scanner - Terraform, CloudFormation, Kubernetes, Docker',
      version: '3.0.0',
      author: 'Security Analyzer Team',
      tags: ['iac', 'terraform', 'kubernetes', 'cloudformation', 'security'],
      supportedTargets: ['directories', 'IaC files'],
      requiresNetwork: false,
    };
  }

  protected async onInit(config: ScannerConfig): Promise<void> {
    if (config.options?.checkovPath) {
      this.checkovPath = config.options.checkovPath as string;
    }
    try {
      await this.runCommand([this.checkovPath, '--version']);
    } catch {
      console.warn(`[CheckovScanner] Warning: Could not verify Checkov`);
    }
  }

  protected async onScan(target: string, options?: Record<string, unknown>): Promise<ScanResult> {
    const scanId = generateUUID();
    const args = ['--directory', target, '--output', 'json', '--compact', '--pass-git-config'];

    // Add framework-specific scanning
    if (options?.frameworks) {
      args.push('--framework', (options.frameworks as string).split(',').join(' --framework '));
    }

    let output = '';
    try {
      output = await this.runCommand([this.checkovPath, ...args], options?.timeout as number);
    } catch (e) {
      // Checkov returns non-zero for findings, still parse output
      output = (e as Error).message || '';
    }

    const findings = this.parseCheckovOutput(output);
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
        // Checkov returns 1 when findings are found, but we still want the output
        if (code !== null && code > 1) reject(new Error(stderr));
        else resolve(stdout);
      });

      proc.on('error', (e) => {
        clearTimeout(timer);
        reject(e);
      });
    });
  }

  private parseCheckovOutput(output: string): CheckovFinding[] {
    try {
      const data = JSON.parse(output);
      const results = data?.results?.passed_checks || [];
      const failures = data?.results?.failed_checks || [];
      return [...results, ...failures].filter((f) => f.check_id);
    } catch {
      return [];
    }
  }

  private mapToVulnerabilities(findings: CheckovFinding[], scanId: string): Vulnerability[] {
    return findings.map((f) => {
      const severity = this.mapSeverity(f.severity || f.check_result?.result);
      const isFailed = f.check_result?.result === 'FAILED';

      return this.createVulnerability(
        scanId,
        f.check_id,
        f.check_name,
        isFailed ? severity : 'info',
        {
          filePath: f.file_path,
          lineNumber: f.file_line_range?.[0],
          recommendation: this.getRecommendation(f.check_id),
        }
      );
    });
  }

  private mapSeverity(severity?: string): Vulnerability['severity'] {
    const s = severity?.toLowerCase();
    if (s === 'critical') return 'critical';
    if (s === 'high') return 'high';
    if (s === 'medium' || s === 'moderate') return 'medium';
    if (s === 'low') return 'low';
    return 'info';
  }

  private getRecommendation(checkId: string): string {
    const recommendations: Record<string, string> = {
      CKV_AWS_1: 'Ensure S3 bucket has versioning enabled',
      CKV_AWS_2: 'Ensure S3 bucket has server-side encryption enabled',
      CKV_AWS_3: 'Ensure S3 bucket blocks public access',
      CKV_K8S_1: 'Ensure containers do not run as root',
      CKV_K8S_2: 'Ensure containers do not have excessive capabilities',
      CKV_K8S_3: 'Ensure network policies are in place',
    };
    return recommendations[checkId] || 'Review and remediate this IaC misconfiguration';
  }

  protected async onCleanup(): Promise<void> {}

  canHandle(target: string): boolean {
    const supportedExtensions = ['.tf', '.yaml', '.yml', '.json', '.dockerfile', 'Dockerfile'];
    return (
      supportedExtensions.some((ext) => target.includes(ext)) ||
      target.includes('terraform') ||
      target.includes('kubernetes') ||
      target.includes('cloudformation')
    );
  }
}

export function createCheckovScanner(): CheckovScanner {
  return new CheckovScanner();
}

export const checkovScannerPlugin: ScannerPlugin = {
  name: 'checkov',
  type: 'iac',
  metadata: {
    description:
      'Infrastructure as Code security scanner - Terraform, CloudFormation, Kubernetes, Docker',
    version: '3.0.0',
    author: 'Security Analyzer Team',
    tags: ['iac', 'terraform', 'kubernetes', 'cloudformation', 'security'],
    supportedTargets: ['directories', 'IaC files'],
    requiresNetwork: false,
  },
  factory: createCheckovScanner,
};

export function registerCheckovScanner(registry?: ScannerRegistry): void {
  (registry ?? getGlobalRegistry()).registerFactory(
    checkovScannerPlugin.name,
    checkovScannerPlugin.type,
    checkovScannerPlugin.factory,
    checkovScannerPlugin.metadata
  );
}

export default CheckovScanner;
