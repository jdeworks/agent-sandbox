/**
 * Grype Scanner - Container Image Vulnerability Scanning
 *
 * Detects vulnerabilities in:
 * - Container images
 * - Filesystems
 * - SBOM generation
 */

import { spawn } from 'child_process';
import { BaseScanner, ScannerConfig, ScanResult, ScannerType, ScannerMetadata } from './base';
import { ScannerRegistry, getGlobalRegistry } from './registry';
import { ScannerPlugin } from './discovery';
import { Vulnerability } from '@security-analyzer/types';

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

interface GrypeFinding {
  vulnerability: {
    id: string;
    data_source: string;
    namespace: string;
    severity: string;
    vulnerability: string;
    package: {
      name: string;
      version: string;
      type: string;
    };
    fixed_in_version?: string;
  };
  match: {
    committed_at?: string;
    matcher: string;
    type: string;
  };
}

/**
 * Grype Scanner - Lightweight container vulnerability scanner
 */
export class GrypeScanner extends BaseScanner {
  public readonly name = 'grype';
  public readonly type: ScannerType = 'dependency';
  private grypePath = 'grype';

  getMetadata(): ScannerMetadata {
    return {
      name: this.name,
      type: this.type,
      description: 'Vulnerability scanner for container images and filesystems',
      version: '1.0.0',
      author: 'Security Analyzer Team',
      tags: ['container', 'docker', 'vulnerability', 'sbom'],
      supportedTargets: ['container images', 'docker archives', 'directories', 'SBOM'],
      requiresNetwork: true,
    };
  }

  protected async onInit(config: ScannerConfig): Promise<void> {
    if (config.options?.grypePath) {
      this.grypePath = config.options.grypePath as string;
    }
    try {
      await this.runCommand([this.grypePath, 'version']);
    } catch {
      console.warn(`[GrypeScanner] Warning: Could not verify Grype`);
    }
  }

  protected async onScan(target: string, options?: Record<string, unknown>): Promise<ScanResult> {
    const scanId = generateUUID();
    const args = [target, '--output', 'json'];

    // SBOM input mode
    if (options?.sbom) {
      args.unshift('-sbom', target);
    }

    let output = '';
    try {
      output = await this.runCommand([this.grypePath, ...args], options?.timeout as number);
    } catch (e) {
      output = (e as Error).message || '';
    }

    const findings = this.parseGrypeOutput(output);
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
        resolve(stdout);
      });

      proc.on('error', (e) => {
        clearTimeout(timer);
        reject(e);
      });
    });
  }

  private parseGrypeOutput(output: string): GrypeFinding[] {
    try {
      const data = JSON.parse(output);
      return data?.matches || [];
    } catch {
      return [];
    }
  }

  private mapToVulnerabilities(findings: GrypeFinding[], scanId: string): Vulnerability[] {
    return findings.map((f) => {
      const vuln = f.vulnerability;
      return this.createVulnerability(
        scanId,
        vuln.id,
        `${vuln.package.name} (${vuln.package.version})`,
        this.mapSeverity(vuln.severity),
        {
          filePath: `${vuln.package.type}:${vuln.package.name}`,
          recommendation: vuln.fixed_in_version
            ? `Upgrade to version ${vuln.fixed_in_version}`
            : 'No known fix version available',
        }
      );
    });
  }

  private mapSeverity(severity: string): Vulnerability['severity'] {
    const s = severity?.toLowerCase();
    if (s === 'critical') return 'critical';
    if (s === 'high') return 'high';
    if (s === 'medium') return 'medium';
    if (s === 'low') return 'low';
    return 'info';
  }

  protected async onCleanup(): Promise<void> {}

  canHandle(target: string): boolean {
    return (
      target.includes('docker') ||
      target.includes('image') ||
      target.endsWith('.tar') ||
      target.includes('sha256') ||
      target.startsWith('docker.io/')
    );
  }
}

export function createGrypeScanner(): GrypeScanner {
  return new GrypeScanner();
}

export const grypeScannerPlugin: ScannerPlugin = {
  name: 'grype',
  type: 'dependency',
  metadata: {
    description: 'Vulnerability scanner for container images and filesystems',
    version: '1.0.0',
    author: 'Security Analyzer Team',
    tags: ['container', 'docker', 'vulnerability', 'sbom'],
    supportedTargets: ['container images', 'docker archives', 'directories', 'SBOM'],
    requiresNetwork: true,
  },
  factory: createGrypeScanner,
};

export function registerGrypeScanner(registry?: ScannerRegistry): void {
  (registry ?? getGlobalRegistry()).registerFactory(
    grypeScannerPlugin.name,
    grypeScannerPlugin.type,
    grypeScannerPlugin.factory,
    grypeScannerPlugin.metadata
  );
}

export default GrypeScanner;
