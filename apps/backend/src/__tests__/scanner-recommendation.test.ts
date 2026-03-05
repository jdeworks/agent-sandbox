import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { suggestScannersForTarget } from '../services/scanner-recommendation';

function scannerNames(items: { name: string }[]): Set<string> {
  return new Set(items.map((i) => i.name));
}

describe('scanner recommendation service', () => {
  it('recommends web scanners for normal web URLs', async () => {
    const suggestions = await suggestScannersForTarget('https://example.com/login');
    const names = scannerNames(suggestions);
    expect(names).toEqual(new Set(['nuclei', 'zap', 'sqlmap', 'ssl']));
  });

  it('recommends network scanners for host/ip targets', async () => {
    const suggestions = await suggestScannersForTarget('10.0.0.7');
    const names = scannerNames(suggestions);
    expect(names.has('nmap')).toBe(true);
    expect(names.has('ssl')).toBe(true);
    expect(names.has('nuclei')).toBe(true);
  });

  it('recommends based on local directory content', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sa-reco-content-'));
    try {
      fs.mkdirSync(path.join(tmp, 'src'), { recursive: true });
      fs.mkdirSync(path.join(tmp, '.git'), { recursive: true });
      fs.writeFileSync(path.join(tmp, 'src', 'app.ts'), 'console.log("ok");');
      fs.writeFileSync(path.join(tmp, 'requirements.txt'), 'flask');
      fs.writeFileSync(path.join(tmp, 'package.json'), '{"name":"demo"}');
      fs.writeFileSync(path.join(tmp, 'Dockerfile'), 'FROM node:20');
      fs.writeFileSync(path.join(tmp, 'main.tf'), 'terraform {}');
      fs.writeFileSync(path.join(tmp, 'AndroidManifest.xml'), '<manifest />');

      const suggestions = await suggestScannersForTarget(tmp);
      const names = scannerNames(suggestions);

      // Validate each supported scanner (except test-scanner) appears under at least one realistic condition.
      expect(names.has('bandit')).toBe(true);
      expect(names.has('semgrep')).toBe(true);
      expect(names.has('opengrep')).toBe(true);
      expect(names.has('gitleaks')).toBe(true);
      expect(names.has('trufflehog')).toBe(true);
      expect(names.has('trivy')).toBe(true);
      expect(names.has('grype')).toBe(true);
      expect(names.has('checkov')).toBe(true);
      expect(names.has('mobsf')).toBe(true);
      expect(names.has('test-scanner')).toBe(false);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('inspects repository URLs via clone and suggests from content', async () => {
    const mockClone = (repoUrl: string, checkoutDir: string): void => {
      expect(repoUrl).toContain('github.com');
      fs.mkdirSync(path.join(checkoutDir, 'src'), { recursive: true });
      fs.mkdirSync(path.join(checkoutDir, '.git'), { recursive: true });
      fs.writeFileSync(path.join(checkoutDir, 'src', 'index.js'), 'const x = 1;');
      fs.writeFileSync(path.join(checkoutDir, 'package.json'), '{"name":"repo"}');
    };

    const suggestions = await suggestScannersForTarget('https://github.com/org/repo', {
      cloneRepo: mockClone,
      cacheTtlMs: 0,
    });
    const names = scannerNames(suggestions);
    expect(names.has('semgrep')).toBe(true);
    expect(names.has('opengrep')).toBe(true);
    expect(names.has('gitleaks')).toBe(true);
    expect(names.has('trivy')).toBe(true);
  });

  it('falls back when repository clone fails', async () => {
    const suggestions = await suggestScannersForTarget('https://github.com/org/repo', {
      cloneRepo: () => {
        throw new Error('clone failed');
      },
      cacheTtlMs: 0,
    });
    const names = scannerNames(suggestions);
    expect(names).toEqual(new Set(['semgrep', 'opengrep', 'gitleaks', 'trufflehog']));
  });
});
