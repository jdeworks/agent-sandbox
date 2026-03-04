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

interface SSLResult { host: string; port: number; is_open: boolean; certificate?: { subject: Record<string, string>; issuer: Record<string, string>; not_before?: string; not_after?: string }; protocol?: string; cipher?: string; issues?: { severity: string; code: string; message: string; recommendation: string }[]; }

/**
 * SSL Scanner - Certificate analysis
 */
export class SSLScanner extends BaseScanner {
  public readonly name = 'ssl';
  public readonly type: ScannerType = 'dynamic';
  private pythonPath = 'python3';
  private defaultPort = 443;

  getMetadata(): ScannerMetadata {
    return { name: this.name, type: this.type, description: 'SSL/TLS scanner for certificate analysis', version: '1.0.0', author: 'Security Analyzer Team', tags: ['ssl', 'tls', 'certificate'], supportedTargets: ['hostnames', 'IP addresses'], requiresNetwork: true };
  }

  protected async onInit(config: ScannerConfig): Promise<void> {
    if (config.options?.pythonPath) this.pythonPath = config.options.pythonPath as string;
    if (config.options?.defaultPort) this.defaultPort = config.options.defaultPort as number;
    try { await this.runCommand([this.pythonPath, '--version']); }
    catch { console.warn(`[SSLScanner] Warning: Could not verify Python`); }
  }

  protected async onScan(target: string, options?: Record<string, unknown>): Promise<ScanResult> {
    const scanId = generateUUID();
    const { host, port } = this.parseTarget(target, options);
    const result = await this.analyzeSSL(host, port, options);
    const vulnerabilities = this.mapToVulnerabilities(result, scanId);
    return this.createScanResult(scanId, vulnerabilities);
  }

  private parseTarget(target: string, options?: Record<string, unknown>): { host: string; port: number } {
    let h = target.replace(/^https?:\/\//, '').split('/')[0];
    let p = this.defaultPort;
    if (h.includes(':')) {
      const [hostname, portStr] = h.split(':');
      h = hostname;
      p = parseInt(portStr, 10) || p;
    } else if (options?.port) p = options.port as number;
    return { host: h, port: p };
  }

  private async analyzeSSL(host: string, port: number, options?: Record<string, unknown>): Promise<SSLResult> {
    const timeout = (options?.timeout as number) || 30000;
    const script = `
import json,socket,ssl,datetime
def a(h,p,t):
 r={'host':h,'port':p,'is_open':False,'issues':[]}
 try:
  s=socket.socket();s.settimeout(t/1000);s.connect((h,p));r['is_open']=True
  ctx=ssl.create_default_context()
  with socket.create_connection((h,p),timeout=t/1000) as sock:
   with ctx.wrap_socket(sock,server_hostname=h) as ss:
    r['protocol']=ss.version()
    c=ss.cipher()
    if c:r['cipher']=c[0]
    cert=ss.getpeercert()
    if cert:
     r['certificate']={'subject':dict(x[0]for x in cert.get('subject',[])),'issuer':dict(x[0]for x in cert.get('issuer',[])),'not_before':cert.get('notBefore',''),'not_after':cert.get('notAfter','')}
     nb,na=cert.get('notBefore',''),cert.get('notAfter','')
     if nb and na:
      try:
       nd=datetime.datetime.strptime(na,'%b %d %H:%M:%S %Y %Z');d=(nd-datetime.datetime.now()).days
       if d<0:r['issues'].append({'severity':'critical','code':'CERT_EXPIRED','message':'Certificate expired','recommendation':'Renew certificate'})
       elif d<30:r['issues'].append({'severity':'high','code':'CERT_EXPIRING','message':f'Certificate expires in {d} days','recommendation':'Plan renewal'})
      except:pass
 except Exception as e:
  r['issues'].append({'severity':'critical','code':'CONN_ERROR','message':str(e),'recommendation':'Verify host is accessible'})
 return r
print(json.dumps(a('${host}',${port},${timeout})))
`;
    const scriptPath = `/tmp/ssl_${generateUUID()}.py`;
    fs.writeFileSync(scriptPath, script);
    try {
      const output = await this.runCommand([this.pythonPath, scriptPath], timeout + 5000);
      return JSON.parse(output);
    } catch { return { host, port, is_open: false, issues: [{ severity: 'critical', code: 'ERROR', message: 'Analysis failed', recommendation: 'Check SSL configuration' }] }; }
    finally { try { fs.unlinkSync(scriptPath); } catch {} }
  }

  private async runCommand(args: string[], timeout?: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const proc = spawn(args[0], args.slice(1), { shell: false });
      let stdout = '', stderr = '';
      proc.stdout.on('data', d => { stdout += d.toString(); });
      proc.stderr.on('data', d => { stderr += d.toString(); });
      const timer = setTimeout(() => { proc.kill(); reject(new Error('Timeout')); }, timeout || 30000);
      proc.on('close', code => { clearTimeout(timer); if (code && code !== 0) reject(new Error(stderr)); else resolve(stdout); });
      proc.on('error', e => { clearTimeout(timer); reject(e); });
    });
  }

  private mapToVulnerabilities(result: SSLResult, scanId: string): Vulnerability[] {
    const vulnerabilities: Vulnerability[] = [];
    if (!result.is_open) {
      vulnerabilities.push(this.createVulnerability(scanId, 'SSL Connection Failed', `Could not connect to ${result.host}:${result.port}`, 'critical',
        { filePath: `${result.host}:${result.port}`, recommendation: 'Verify host is accessible and SSL is enabled.' }));
      return vulnerabilities;
    }
    if (result.certificate) {
      const subj = result.certificate.subject?.commonName || 'Unknown';
      const iss = result.certificate.issuer?.commonName || 'Unknown';
      vulnerabilities.push(this.createVulnerability(scanId, 'SSL Certificate', `Issued to: ${subj} by: ${iss}`, 'info',
        { filePath: `${result.host}:${result.port}`, recommendation: 'Review certificate validity.' }));
    }
    if (result.protocol) {
      const protoSev = result.protocol === 'TLSv1' || result.protocol === 'SSLv3' ? 'high' : result.protocol === 'TLSv1.1' ? 'medium' : 'low';
      vulnerabilities.push(this.createVulnerability(scanId, 'TLS Protocol', `Using ${result.protocol}`, protoSev as Vulnerability['severity'],
        { filePath: `${result.host}:${result.port}`, recommendation: 'Use TLS 1.2 or higher.' }));
    }
    for (const issue of result.issues || []) {
      const sev = issue.severity === 'critical' ? 'critical' : issue.severity === 'high' ? 'high' : issue.severity === 'medium' ? 'medium' : 'low';
      vulnerabilities.push(this.createVulnerability(scanId, issue.code, issue.message, sev as Vulnerability['severity'],
        { filePath: `${result.host}:${result.port}`, recommendation: issue.recommendation }));
    }
    return vulnerabilities;
  }

  protected async onCleanup(): Promise<void> {}
  canHandle(target: string): boolean {
    const h = target.replace(/^https?:\/\//, '').split('/')[0].split(':')[0];
    return /^[a-zA-Z0-9]/.test(h) || /^(\d{1,3}\.){3}\d{1,3}$/.test(h);
  }
  setPythonPath(p: string): void { this.pythonPath = p; }
}

export function createSSLScanner(): SSLScanner { return new SSLScanner(); }
export const sslScannerPlugin: ScannerPlugin = {
  name: 'ssl', type: 'dynamic',
  metadata: { description: 'SSL/TLS certificate scanner', version: '1.0.0', author: 'Security Analyzer Team', tags: ['ssl', 'tls', 'certificate'], supportedTargets: ['hostnames'], requiresNetwork: true },
  factory: createSSLScanner,
};
export function registerSSLScanner(registry?: ScannerRegistry): void {
  (registry ?? getGlobalRegistry()).registerFactory(sslScannerPlugin.name, sslScannerPlugin.type, sslScannerPlugin.factory, sslScannerPlugin.metadata);
}
export default SSLScanner;
