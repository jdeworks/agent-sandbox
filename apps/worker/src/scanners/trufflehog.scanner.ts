/**
 * TruffleHog Scanner - Secrets Detection with Verification
 *
 * Detects:
 * - API keys
 * - OAuth tokens
 * - SSH keys
 * - Passwords
 * - And verifies if secrets are active
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

interface TruffleHogFinding {
  DetectorType: string;
  DecoderType: string;
  Verified: boolean;
  Raw: string;
  Redacted: string;
  SourceMetadata: {
    Data: {
      Filesystem: {
        file: string;
        line_number: number;
      };
    };
  };
}

/**
 * TruffleHog Scanner - Advanced secrets detection with verification
 */
export class TruffleHogScanner extends BaseScanner {
  public readonly name = 'trufflehog';
  public readonly type: ScannerType = 'secret';
  private trufflehogPath = 'trufflehog';

  getMetadata(): ScannerMetadata {
    return {
      name: this.name,
      type: this.type,
      description: 'Advanced secrets scanner with credential verification',
      version: '3.0.0',
      author: 'Security Analyzer Team',
      tags: ['secret', 'credentials', 'api-keys', 'tokens'],
      supportedTargets: ['git repos', 'directories', 'filesystems'],
      requiresNetwork: false,
    };
  }

  protected async onInit(config: ScannerConfig): Promise<void> {
    if (config.options?.trufflehogPath) {
      this.trufflehogPath = config.options.trufflehogPath as string;
    }
    try {
      await this.runCommand([this.trufflehogPath, '--version']);
    } catch {
      console.warn(`[TruffleHogScanner] Warning: Could not verify TruffleHog`);
    }
  }

  protected async onScan(target: string, options?: Record<string, unknown>): Promise<ScanResult> {
    const scanId = generateUUID();
    const args = ['filesystem', target, '--json', '--no-update'];

    let output = '';
    try {
      output = await this.runCommand([this.trufflehogPath, ...args], options?.timeout as number);
    } catch (e) {
      output = (e as Error).message || '';
    }

    const findings = this.parseTruffleHogOutput(output);
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

  private parseTruffleHogOutput(output: string): TruffleHogFinding[] {
    const findings: TruffleHogFinding[] = [];
    for (const line of output.trim().split('\n')) {
      try {
        const parsed = JSON.parse(line);
        if (parsed.DetectorType) {
          findings.push(parsed);
        }
      } catch {}
    }
    return findings;
  }

  private mapToVulnerabilities(findings: TruffleHogFinding[], scanId: string): Vulnerability[] {
    return findings.map((f) => {
      const severity = this.mapSeverity(f.DetectorType, f.Verified);

      return this.createVulnerability(
        scanId,
        f.DetectorType,
        `Secret detected: ${f.DetectorType}`,
        severity,
        {
          filePath: f.SourceMetadata?.Data?.Filesystem?.file || '',
          lineNumber: f.SourceMetadata?.Data?.Filesystem?.line_number,
          recommendation: f.Verified
            ? 'CRITICAL: This secret is verified to be active! Rotate immediately.'
            : 'Remove hardcoded secrets from code.',
        }
      );
    });
  }

  private mapSeverity(detectorType: string, verified: boolean): Vulnerability['severity'] {
    const highTypes = ['AWS', 'GCP', 'Azure', 'GitHub', 'GitLab', 'Stripe', 'Slack'];
    const medTypes = ['NPM', 'PyPI', 'Docker', 'SSH'];

    const type = detectorType.toUpperCase();

    if (verified) return 'critical';
    if (highTypes.some((t) => type.includes(t))) return 'high';
    if (medTypes.some((t) => type.includes(t))) return 'medium';
    return 'low';
  }

  protected async onCleanup(): Promise<void> {}

  canHandle(target: string): boolean {
    return target.startsWith('/') || target.startsWith('./') || target.includes('.git');
  }
}

export function createTruffleHogScanner(): TruffleHogScanner {
  return new TruffleHogScanner();
}

export const trufflehogScannerPlugin: ScannerPlugin = {
  name: 'trufflehog',
  type: 'secret',
  metadata: {
    description: 'Advanced secrets scanner with credential verification',
    version: '3.0.0',
    author: 'Security Analyzer Team',
    tags: ['secret', 'credentials', 'api-keys', 'tokens'],
    supportedTargets: ['git repos', 'directories', 'filesystems'],
    requiresNetwork: false,
  },
  factory: createTruffleHogScanner,
};

export function registerTruffleHogScanner(registry?: ScannerRegistry): void {
  (registry ?? getGlobalRegistry()).registerFactory(
    trufflehogScannerPlugin.name,
    trufflehogScannerPlugin.type,
    trufflehogScannerPlugin.factory,
    trufflehogScannerPlugin.metadata
  );
}

export default TruffleHogScanner;
