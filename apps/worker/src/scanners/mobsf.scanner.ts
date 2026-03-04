/**
 * MobSF Scanner - Mobile Application Security Testing
 *
 * Analyzes:
 * - Android APK/AAR
 * - iOS IPA
 * - Android source code
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

interface MobSFFinding {
  issue: string;
  severity: string;
  description: string;
  file?: string;
  line?: number;
  code?: string;
}

/**
 * MobSF Scanner - Mobile application security analysis
 */
export class MobSFScanner extends BaseScanner {
  public readonly name = 'mobsf';
  public readonly type: ScannerType = 'static';
  private mobsfPath = 'mobsfscan';
  private apiUrl = 'http://localhost:8000';

  getMetadata(): ScannerMetadata {
    return {
      name: this.name,
      type: this.type,
      description: 'Mobile application security scanner for Android (APK/AAR) and iOS (IPA)',
      version: '1.0.0',
      author: 'Security Analyzer Team',
      tags: ['mobile', 'android', 'ios', 'apk', 'ipa', 'appsec'],
      supportedTargets: ['APK', 'AAR', 'IPA', 'ZIP', 'Android source'],
      requiresNetwork: false,
    };
  }

  protected async onInit(config: ScannerConfig): Promise<void> {
    if (config.options?.mobsfPath) {
      this.mobsfPath = config.options.mobsfPath as string;
    }
    if (config.options?.apiUrl) {
      this.apiUrl = config.options.apiUrl as string;
    }
    try {
      await this.runCommand([this.mobsfPath, '--version']);
    } catch {
      console.warn(`[MobSFScanner] Warning: Could not verify MobSF`);
    }
  }

  protected async onScan(target: string, options?: Record<string, unknown>): Promise<ScanResult> {
    const scanId = generateUUID();

    // Check if using API or CLI
    const useApi = (options?.useApi as boolean) ?? false;

    if (useApi) {
      return this.scanViaAPI(target, scanId);
    }

    return this.scanViaCLI(target, scanId, options);
  }

  private async scanViaAPI(target: string, scanId: string): Promise<ScanResult> {
    // API-based scanning (requires MobSF server running)
    // This would make HTTP requests to the MobSF API
    // For now, return empty result
    console.log(`[MobSFScanner] API scanning not fully implemented`);
    return this.createScanResult(scanId, []);
  }

  private async scanViaCLI(
    target: string,
    scanId: string,
    options?: Record<string, unknown>
  ): Promise<ScanResult> {
    const args = [target, '--json'];

    let output = '';
    try {
      output = await this.runCommand([this.mobsfPath, ...args], options?.timeout as number);
    } catch (e) {
      output = (e as Error).message || '';
    }

    const findings = this.parseMobSFOutput(output);
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

  private parseMobSFOutput(output: string): MobSFFinding[] {
    try {
      const data = JSON.parse(output);
      return data?.findings || data?.results || [];
    } catch {
      return [];
    }
  }

  private mapToVulnerabilities(findings: MobSFFinding[], scanId: string): Vulnerability[] {
    return findings.map((f) => {
      return this.createVulnerability(
        scanId,
        f.issue || 'unknown',
        f.issue || 'Mobile security issue',
        this.mapSeverity(f.severity),
        {
          filePath: f.file || '',
          lineNumber: f.line,
          recommendation: f.description,
        }
      );
    });
  }

  private mapSeverity(severity: string): Vulnerability['severity'] {
    const s = severity?.toLowerCase();
    if (s === 'high') return 'critical';
    if (s === 'medium') return 'high';
    if (s === 'low') return 'medium';
    return 'info';
  }

  protected async onCleanup(): Promise<void> {}

  canHandle(target: string): boolean {
    const extensions = ['.apk', '.aar', '.ipa', '.zip'];
    return (
      extensions.some((ext) => target.toLowerCase().endsWith(ext)) ||
      target.toLowerCase().includes('android') ||
      target.toLowerCase().includes('mobile')
    );
  }
}

export function createMobSFScanner(): MobSFScanner {
  return new MobSFScanner();
}

export const mobsfScannerPlugin: ScannerPlugin = {
  name: 'mobsf',
  type: 'static',
  metadata: {
    description: 'Mobile application security scanner for Android (APK/AAR) and iOS (IPA)',
    version: '1.0.0',
    author: 'Security Analyzer Team',
    tags: ['mobile', 'android', 'ios', 'apk', 'ipa', 'appsec'],
    supportedTargets: ['APK', 'AAR', 'IPA', 'ZIP', 'Android source'],
    requiresNetwork: false,
  },
  factory: createMobSFScanner,
};

export function registerMobSFScanner(registry?: ScannerRegistry): void {
  (registry ?? getGlobalRegistry()).registerFactory(
    mobsfScannerPlugin.name,
    mobsfScannerPlugin.type,
    mobsfScannerPlugin.factory,
    mobsfScannerPlugin.metadata
  );
}

export default MobSFScanner;
