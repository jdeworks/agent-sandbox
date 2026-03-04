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

interface NmapRun {
  nmaprun?: { host: NmapHost[] };
}
interface NmapHost {
  status?: { state: string };
  address?: { addr: string; addrtype: string }[];
  ports?: { port: NmapPort[] };
  os?: { osmatch: { name: string; accuracy: number }[] };
}
interface NmapPort {
  portid: string;
  protocol: string;
  state?: { state: string; reason: string };
  service?: { name?: string; product?: string; version?: string };
}
interface NmapXMLParser {
  parse(xml: string): NmapRun | null;
}

/**
 * Nmap Scanner - Network port scanner
 */
export class NmapScanner extends BaseScanner {
  public readonly name = 'nmap';
  public readonly type: ScannerType = 'dynamic';
  private nmapPath = 'nmap';
  private defaultPorts = '1-1000';

  getMetadata(): ScannerMetadata {
    return {
      name: this.name,
      type: this.type,
      description: 'Network scanner using Nmap',
      version: '1.0.0',
      author: 'Security Analyzer Team',
      tags: ['network', 'port-scanning'],
      supportedTargets: ['IP addresses', 'hostnames'],
      requiresNetwork: true,
    };
  }

  protected async onInit(config: ScannerConfig): Promise<void> {
    if (config.options?.nmapPath) this.nmapPath = config.options.nmapPath as string;
    try {
      await this.runCommand([this.nmapPath, '--version']);
    } catch {
      console.warn(`[NmapScanner] Warning: Could not verify Nmap`);
    }
  }

  protected async onScan(target: string, options?: Record<string, unknown>): Promise<ScanResult> {
    const scanId = generateUUID();
    const args = [target, '-oX', '-', '-Pn'];
    const ports = (options?.ports as string) || this.defaultPorts;
    if (ports) args.push('-p', ports);
    const scripts = (options?.scripts as string) || 'default,safe';
    if (scripts) args.push('--script', scripts);
    if (options?.detectVersions !== false) args.push('-sV');
    const timing = (options?.timing as string) || 'T4';
    args.push(`-${timing}`);
    const output = await this.runCommand([this.nmapPath, ...args], options?.timeout as number);
    const parsed = this.parseNmapOutput(output);
    const vulnerabilities = this.mapToVulnerabilities(parsed, scanId, target);
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

  private parseNmapOutput(xml: string): NmapRun | null {
    try {
      const hosts: NmapHost[] = [];
      const hostRegex = /<host[^>]*>([\s\S]*?)<\/host>/g;
      let match;
      while ((match = hostRegex.exec(xml)) !== null) {
        const h: NmapHost = { status: { state: 'unknown' }, address: [] };
        const st = match[1].match(/<status state="([^"]+)"/);
        if (st) h.status!.state = st[1];
        const addrRegex = /<address addr="([^"]+)" addrtype="([^"]+)"/g;
        let a;
        while ((a = addrRegex.exec(match[1])) !== null)
          h.address!.push({ addr: a[1], addrtype: a[2] });
        const portsMatch = match[1].match(/<ports>([\s\S]*?)<\/ports>/);
        if (portsMatch) {
          const ports: NmapPort[] = [];
          const portRegex = /<port protocol="([^"]+)" portid="([^"]+)">([\s\S]*?)<\/port>/g;
          let p;
          while ((p = portRegex.exec(portsMatch[1])) !== null) {
            const port: NmapPort = { protocol: p[1], portid: p[2] };
            const st = p[3].match(/<state state="([^"]+)"/);
            if (st) port.state = { state: st[1], reason: '' };
            const svc = p[3].match(/<service name="([^"]+)"/);
            if (svc) port.service = { name: svc[1] };
            ports.push(port);
          }
          if (ports.length) h.ports = { port: ports };
        }
        hosts.push(h);
      }
      return hosts.length ? { nmaprun: { host: hosts } } : null;
    } catch {
      return null;
    }
  }

  private mapToVulnerabilities(
    parsed: NmapRun | null,
    scanId: string,
    target: string
  ): Vulnerability[] {
    const vulnerabilities: Vulnerability[] = [];
    if (!parsed?.nmaprun?.host) return vulnerabilities;
    for (const host of parsed.nmaprun.host) {
      if (host.status?.state !== 'up') continue;
      const ip = host.address?.find((a) => a.addrtype === 'ipv4')?.addr || target;
      if (host.ports?.port) {
        for (const port of host.ports.port) {
          if (port.state?.state === 'open') {
            const severity = this.assessPortSeverity(parseInt(port.portid, 10));
            vulnerabilities.push(
              this.createVulnerability(
                scanId,
                `Open Port: ${port.portid}/${port.protocol}`,
                `Port ${port.portid} is open`,
                severity,
                { filePath: ip, recommendation: 'Review and secure open ports.' }
              )
            );
          }
        }
      }
    }
    return vulnerabilities;
  }

  private assessPortSeverity(port: number): Vulnerability['severity'] {
    const highRisk = [21, 23, 445, 3389, 5900, 4444, 5555];
    const medRisk = [22, 25, 110, 143, 993, 995, 3306, 5432, 6379, 27017];
    if (highRisk.includes(port)) return 'high';
    if (medRisk.includes(port)) return 'medium';
    return 'low';
  }

  protected async onCleanup(): Promise<void> {}
  canHandle(target: string): boolean {
    return /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/.test(target) || /^[a-zA-Z0-9]/.test(target);
  }
  setNmapPath(p: string): void {
    this.nmapPath = p;
  }
}

export function createNmapScanner(): NmapScanner {
  return new NmapScanner();
}
export const nmapScannerPlugin: ScannerPlugin = {
  name: 'nmap',
  type: 'dynamic',
  metadata: {
    description: 'Network scanner using Nmap',
    version: '1.0.0',
    author: 'Security Analyzer Team',
    tags: ['network', 'port-scanning'],
    supportedTargets: ['IP addresses'],
    requiresNetwork: true,
  },
  factory: createNmapScanner,
};
export function registerNmapScanner(registry?: ScannerRegistry): void {
  (registry ?? getGlobalRegistry()).registerFactory(
    nmapScannerPlugin.name,
    nmapScannerPlugin.type,
    nmapScannerPlugin.factory,
    nmapScannerPlugin.metadata
  );
}
export default NmapScanner;
