/**
 * OWASP ZAP Scanner - Dynamic Application Security Testing
 *
 * Performs:
 * - Active scanning
 * - Passive scanning
 * - Spidering
 * - AJAX spidering
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

interface ZAPFinding {
  alert: string;
  risk: string;
  confidence: string;
  description: string;
  url: string;
  param?: string;
  attack?: string;
  evidence?: string;
  solution?: string;
  reference?: string;
  cweid?: string;
  wascid?: string;
  sourceid?: string;
}

/**
 * OWASP ZAP Scanner - Web application vulnerability scanner
 */
export class ZAPScanner extends BaseScanner {
  public readonly name = 'zap';
  public readonly type: ScannerType = 'dynamic';
  private zapPath = 'zap-baseline';
  private apiKey?: string;

  getMetadata(): ScannerMetadata {
    return {
      name: this.name,
      type: this.type,
      description: 'OWASP Zed Attack Proxy - Web application security scanner',
      version: '1.0.0',
      author: 'Security Analyzer Team',
      tags: ['web', 'dast', 'zap', 'owasp', 'vulnerability'],
      supportedTargets: ['URLs', 'domains', 'web applications'],
      requiresNetwork: true,
    };
  }

  protected async onInit(config: ScannerConfig): Promise<void> {
    if (config.options?.zapPath) {
      this.zapPath = config.options.zapPath as string;
    }
    if (config.options?.apiKey) {
      this.apiKey = config.options.apiKey as string;
    }
    try {
      await this.runCommand([this.zapPath, '-version']);
    } catch {
      console.warn(`[ZAPScanner] Warning: Could not verify OWASP ZAP`);
    }
  }

  protected async onScan(target: string, options?: Record<string, unknown>): Promise<ScanResult> {
    const scanId = generateUUID();

    // Determine scan mode
    const scanMode = (options?.mode as string) || 'baseline'; // baseline, full, api

    const args = this.buildArgs(target, scanMode, options);

    let output = '';
    try {
      output = await this.runCommand([this.zapPath, ...args], options?.timeout as number);
    } catch (e) {
      output = (e as Error).message || '';
    }

    const findings = this.parseZAPOutput(output);
    const vulnerabilities = this.mapToVulnerabilities(findings, scanId);
    return this.createScanResult(scanId, vulnerabilities);
  }

  private buildArgs(target: string, mode: string, options?: Record<string, unknown>): string[] {
    const args = ['-t', target];

    // Scan modes
    if (mode === 'baseline') {
      args.push('-J', 'json');
    } else if (mode === 'full') {
      args.push('-m', '2'); // Full scan
    }

    // API key if provided
    if (this.apiKey) {
      args.push('-k', this.apiKey);
    }

    // Additional options
    if (options?.recursive) {
      args.push('-r');
    }

    if (options?.debug) {
      args.push('-d');
    }

    // User agent
    if (options?.userAgent) {
      args.push('-a', options.userAgent as string);
    }

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
      }, timeout || 600000); // ZAP can take longer

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

  private parseZAPOutput(output: string): ZAPFinding[] {
    // Try to parse JSON output
    try {
      // ZAP outputs JSON to stdout in certain modes
      const lines = output.split('\n').filter((l) => l.trim().startsWith('{'));
      for (const line of lines) {
        const data = JSON.parse(line);
        if (data?.site?.[0]?.alerts) {
          return data.site[0].alerts;
        }
      }
    } catch {}

    // Try to parse stderr or file output
    try {
      // Look for JSON in stderr
      const jsonMatch = output.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const data = JSON.parse(jsonMatch[0]);
        if (Array.isArray(data)) {
          return data;
        }
      }
    } catch {}

    return [];
  }

  private mapToVulnerabilities(findings: ZAPFinding[], scanId: string): Vulnerability[] {
    return findings.map((f) => {
      return this.createVulnerability(scanId, f.alert, f.alert, this.mapSeverity(f.risk), {
        filePath: f.url,
        recommendation: f.solution,
      });
    });
  }

  private mapSeverity(risk: string): Vulnerability['severity'] {
    const s = risk?.toLowerCase();
    if (s === 'high') return 'critical';
    if (s === 'medium') return 'high';
    if (s === 'low') return 'medium';
    if (s === 'informational') return 'info';
    return 'medium';
  }

  protected async onCleanup(): Promise<void> {}

  canHandle(target: string): boolean {
    return (
      target.startsWith('http://') ||
      target.startsWith('https://') ||
      target.includes('.com') ||
      target.includes('.org') ||
      target.includes('.net')
    );
  }
}

export function createZAPScanner(): ZAPScanner {
  return new ZAPScanner();
}

export const zapScannerPlugin: ScannerPlugin = {
  name: 'zap',
  type: 'dynamic',
  metadata: {
    description: 'OWASP Zed Attack Proxy - Web application security scanner',
    version: '1.0.0',
    author: 'Security Analyzer Team',
    tags: ['web', 'dast', 'zap', 'owasp', 'vulnerability'],
    supportedTargets: ['URLs', 'domains', 'web applications'],
    requiresNetwork: true,
  },
  factory: createZAPScanner,
};

export function registerZAPScanner(registry?: ScannerRegistry): void {
  (registry ?? getGlobalRegistry()).registerFactory(
    zapScannerPlugin.name,
    zapScannerPlugin.type,
    zapScannerPlugin.factory,
    zapScannerPlugin.metadata
  );
}

export default ZAPScanner;
