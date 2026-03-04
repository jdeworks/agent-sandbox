/**
 * Nuclei Scanner - Template-based Vulnerability Scanning
 *
 * Uses templates to detect:
 * - CVEs
 * - Known vulnerabilities
 * - Misconfigurations
 * - Exposed sensitive files
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

interface NucleiFinding {
  template_id: string;
  template_name: string;
  template_path: string;
  info: {
    name: string;
    severity: string;
    description: string;
  };
  matched_at: string;
  matched_line?: string;
  type: string;
}

/**
 * Nuclei Scanner - Fast template-based vulnerability scanner
 */
export class NucleiScanner extends BaseScanner {
  public readonly name = 'nuclei';
  public readonly type: ScannerType = 'dynamic';
  private nucleiPath = 'nuclei';

  getMetadata(): ScannerMetadata {
    return {
      name: this.name,
      type: this.type,
      description: 'Fast template-based vulnerability scanner for web applications',
      version: '3.0.0',
      author: 'Security Analyzer Team',
      tags: ['web', 'vulnerability', 'cve', 'templates'],
      supportedTargets: ['URLs', 'domains', 'directories'],
      requiresNetwork: true,
    };
  }

  protected async onInit(config: ScannerConfig): Promise<void> {
    if (config.options?.nucleiPath) {
      this.nucleiPath = config.options.nucleiPath as string;
    }
    try {
      await this.runCommand([this.nucleiPath, '-version']);
    } catch {
      console.warn(`[NucleiScanner] Warning: Could not verify Nuclei`);
    }
  }

  protected async onScan(target: string, options?: Record<string, unknown>): Promise<ScanResult> {
    const scanId = generateUUID();
    const args = ['-target', target, '-json', '-silent', '-nc'];

    // Add template categories
    if (options?.templates) {
      args.push('-templates', options.templates as string);
    } else {
      // Default to vulnerability templates
      args.push('-tags', 'cve,vulnerability,misconfiguration');
    }

    // Rate limiting
    if (options?.rateLimit) {
      args.push('-rate-limit', String(options.rateLimit));
    }

    let output = '';
    try {
      output = await this.runCommand([this.nucleiPath, ...args], options?.timeout as number);
    } catch (e) {
      output = (e as Error).message || '';
    }

    const findings = this.parseNucleiOutput(output);
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
        // Nuclei returns 0 for success, 1 for vulnerabilities found
        resolve(stdout);
      });

      proc.on('error', (e) => {
        clearTimeout(timer);
        reject(e);
      });
    });
  }

  private parseNucleiOutput(output: string): NucleiFinding[] {
    const findings: NucleiFinding[] = [];
    for (const line of output.trim().split('\n')) {
      try {
        const parsed = JSON.parse(line);
        if (parsed.template_id) {
          findings.push(parsed);
        }
      } catch {}
    }
    return findings;
  }

  private mapToVulnerabilities(findings: NucleiFinding[], scanId: string): Vulnerability[] {
    return findings.map((f) => {
      return this.createVulnerability(
        scanId,
        f.template_id,
        f.info.name,
        this.mapSeverity(f.info.severity),
        {
          filePath: f.matched_at,
          recommendation: f.info.description,
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
      target.startsWith('http://') ||
      target.startsWith('https://') ||
      target.startsWith('/') ||
      target.includes('.js') ||
      target.includes('.html')
    );
  }
}

export function createNucleiScanner(): NucleiScanner {
  return new NucleiScanner();
}

export const nucleiScannerPlugin: ScannerPlugin = {
  name: 'nuclei',
  type: 'dynamic',
  metadata: {
    description: 'Fast template-based vulnerability scanner for web applications',
    version: '3.0.0',
    author: 'Security Analyzer Team',
    tags: ['web', 'vulnerability', 'cve', 'templates'],
    supportedTargets: ['URLs', 'domains', 'directories'],
    requiresNetwork: true,
  },
  factory: createNucleiScanner,
};

export function registerNucleiScanner(registry?: ScannerRegistry): void {
  (registry ?? getGlobalRegistry()).registerFactory(
    nucleiScannerPlugin.name,
    nucleiScannerPlugin.type,
    nucleiScannerPlugin.factory,
    nucleiScannerPlugin.metadata
  );
}

export default NucleiScanner;
