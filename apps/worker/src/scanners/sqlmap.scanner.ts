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
 * SQLMap JSON output interfaces
 */
interface SQLMapResult {
  [key: string]: unknown;
}

interface SQLMapFinding {
  id: string;
  parameter?: string;
  payload?: string;
  technique?: string;
  title?: string;
  message?: string;
  risk?: number;
  confidence?: number;
}

/**
 * SQLMap Scanner - DAST scanner for SQL injection vulnerabilities
 */
export class SQLMapScanner extends BaseScanner {
  public readonly name = 'sqlmap';
  public readonly type: ScannerType = 'dynamic';

  private sqlmapPath: string = 'sqlmap';
  private tempFiles: string[] = [];

  getMetadata(): ScannerMetadata {
    return {
      name: this.name,
      type: this.type,
      description:
        'DAST SQL injection scanner using SQLMap for detecting SQL injection vulnerabilities',
      version: '1.0.0',
      author: 'Security Analyzer Team',
      tags: ['dast', 'sql-injection', 'dynamic-analysis', 'web-security'],
      supportedTargets: ['http://*', 'https://*'],
      requiresNetwork: true,
    };
  }

  protected async onInit(config: ScannerConfig): Promise<void> {
    console.log(`[SQLMapScanner] Initializing with options:`, config.options);
    if (config.options?.sqlmapPath) {
      this.sqlmapPath = config.options.sqlmapPath as string;
    }
    try {
      await this.runCommand([this.sqlmapPath, '--version']);
      console.log(`[SQLMapScanner] SQLMap binary verified at: ${this.sqlmapPath}`);
    } catch (error) {
      console.warn(
        `[SQLMapScanner] Warning: Could not verify SQLMap at ${this.sqlmapPath}:`,
        error
      );
    }
  }

  protected async onScan(target: string, options?: Record<string, unknown>): Promise<ScanResult> {
    const scanId = generateUUID();
    console.log(`[SQLMapScanner] Performing SQLMap scan on: ${target}`);

    const args = ['-u', target, '--batch', '--json-output', '--smart'];
    if (options?.timeout) {
      args.push(`--timeout=${Math.floor((options.timeout as number) / 1000)}`);
    }
    const level = options?.level ?? 1;
    const risk = options?.risk ?? 1;
    args.push(`--level=${level}`);
    args.push(`--risk=${risk}`);
    if (options?.method) args.push(`--method=${options.method}`);
    if (options?.data) args.push(`--data=${options.data}`);
    if (options?.cookie) args.push(`--cookie=${options.cookie}`);
    if (options?.userAgent) args.push(`--user-agent=${options.userAgent}`);

    const outputFile = `/tmp/sqlmap_${scanId}.json`;
    this.tempFiles.push(outputFile);
    args.push(`--output-dir=${path.dirname(outputFile)}`);

    try {
      await this.runCommand([this.sqlmapPath, ...args], options?.timeout as number);
    } catch (error) {
      console.log(`[SQLMapScanner] Scan completed with status:`, error);
    }

    const output = await this.readOutputFile(outputFile);
    const parsedOutput = this.parseSQLMapOutput(output);
    const vulnerabilities = this.mapToVulnerabilities(parsedOutput, scanId, target);
    return this.createScanResult(scanId, vulnerabilities);
  }

  private async runCommand(args: string[], timeout?: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const proc = spawn(args[0], args.slice(1), { shell: false });
      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      const timeoutMs = timeout || 300000;
      const timer = setTimeout(() => {
        proc.kill();
        reject(new Error(`Command timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      proc.on('close', (code) => {
        clearTimeout(timer);
        if (code !== null && code > 1)
          reject(new Error(`SQLMap exited with code ${code}: ${stderr}`));
        else resolve(stdout);
      });
      proc.on('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
  }

  private async readOutputFile(filePath: string): Promise<string> {
    const fs = await import('fs');
    try {
      if (fs.existsSync(filePath)) return fs.readFileSync(filePath, 'utf-8');
    } catch {
      return '';
    }
    return '';
  }

  private parseSQLMapOutput(output: string): SQLMapResult {
    try {
      if (!output || output.trim() === '') return {};
      const jsonStart = output.indexOf('{');
      if (jsonStart === -1) return {};
      return JSON.parse(output.substring(jsonStart));
    } catch {
      return {};
    }
  }

  private mapToVulnerabilities(
    parsed: SQLMapResult,
    scanId: string,
    target: string
  ): Vulnerability[] {
    const vulnerabilities: Vulnerability[] = [];
    const data = parsed?.data as Record<string, SQLMapFinding> | undefined;
    if (data) {
      for (const [, finding] of Object.entries(data)) {
        const severity = this.mapSeverity(finding.risk, finding.confidence);
        vulnerabilities.push(
          this.createVulnerability(
            scanId,
            finding.title || 'SQL Injection',
            finding.message || `SQL injection via ${finding.parameter || 'unknown'}`,
            severity,
            { filePath: target, recommendation: 'Use parameterized queries.' }
          )
        );
      }
    }
    return vulnerabilities;
  }

  private mapSeverity(risk?: number, confidence?: number): Vulnerability['severity'] {
    const r = risk ?? 1,
      c = confidence ?? 1;
    if (r >= 3 && c >= 3) return 'critical';
    if (r >= 2 && c >= 2) return 'high';
    if (r >= 1 && c >= 1) return 'medium';
    return 'low';
  }

  protected async onCleanup(): Promise<void> {
    const fs = await import('fs');
    for (const file of this.tempFiles) {
      try {
        if (fs.existsSync(file)) fs.unlinkSync(file);
      } catch {}
    }
    this.tempFiles = [];
  }

  canHandle(target: string): boolean {
    return target.startsWith('http://') || target.startsWith('https://');
  }

  setSQLMapPath(sqlmapPath: string): void {
    this.sqlmapPath = sqlmapPath;
  }
}

export function createSQLMapScanner(): SQLMapScanner {
  return new SQLMapScanner();
}
export const sqlmapScannerPlugin: ScannerPlugin = {
  name: 'sqlmap',
  type: 'dynamic',
  metadata: {
    description: 'DAST SQL injection scanner',
    version: '1.0.0',
    author: 'Security Analyzer Team',
    tags: ['dast', 'sql-injection'],
    supportedTargets: ['http://*', 'https://*'],
    requiresNetwork: true,
  },
  factory: createSQLMapScanner,
};
export function registerSQLMapScanner(registry?: ScannerRegistry): void {
  (registry ?? getGlobalRegistry()).registerFactory(
    sqlmapScannerPlugin.name,
    sqlmapScannerPlugin.type,
    sqlmapScannerPlugin.factory,
    sqlmapScannerPlugin.metadata
  );
}
export default SQLMapScanner;
