import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';

export interface SuggestedScanner {
  name: string;
  reason: string;
}

export interface RecommendationOptions {
  cacheTtlMs?: number;
  repoCloneTimeoutMs?: number;
  cloneRepo?: (repoUrl: string, checkoutDir: string, timeoutMs: number) => void;
  now?: () => number;
}

interface ProjectIndicators {
  files: Set<string>;
  dirs: Set<string>;
  exts: Set<string>;
}

interface Rule {
  id: string;
  match: (indicators: ProjectIndicators) => boolean;
  suggestions: SuggestedScanner[];
}

const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;
const DEFAULT_REPO_CLONE_TIMEOUT_MS = 20 * 1000;
const repoSuggestionCache = new Map<string, { ts: number; suggestions: SuggestedScanner[] }>();

const RULES: Rule[] = [
  {
    id: 'python',
    match: (i) =>
      hasFile(i, ['requirements.txt', 'setup.py', 'pyproject.toml']) || hasAnyExt(i, ['.py']),
    suggestions: [{ name: 'bandit', reason: 'Python project (requirements.txt or .py files)' }],
  },
  {
    id: 'source-code',
    match: (i) =>
      hasAnyExt(i, ['.py', '.js', '.ts', '.go', '.java', '.rb', '.php']) || hasDir(i, ['src', 'lib']),
    suggestions: [
      { name: 'semgrep', reason: 'Source code present - multi-language SAST' },
      { name: 'opengrep', reason: 'Source code present - semantic analysis' },
    ],
  },
  {
    id: 'git',
    match: (i) => hasDir(i, ['.git']),
    suggestions: [
      { name: 'gitleaks', reason: 'Git repository - secrets detection' },
      { name: 'trufflehog', reason: 'Git repository - secrets verification' },
    ],
  },
  {
    id: 'dependency-node',
    match: (i) => hasFile(i, ['package.json', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml']),
    suggestions: [
      { name: 'trivy', reason: 'Dependency manifests detected - filesystem/dependency scan' },
      { name: 'grype', reason: 'Dependency manifests detected - vulnerability scan' },
    ],
  },
  {
    id: 'container',
    match: (i) => hasFile(i, ['dockerfile', 'docker-compose.yml', '.dockerignore']),
    suggestions: [
      { name: 'trivy', reason: 'Container configuration detected - image/filesystem scan' },
      { name: 'grype', reason: 'Container configuration detected - vulnerability scan' },
    ],
  },
  {
    id: 'iac',
    match: (i) =>
      hasAnyExt(i, ['.tf', '.tf.json']) ||
      hasDir(i, ['terraform', 'k8s', 'kubernetes', 'helm']) ||
      hasFile(i, [
        'kustomization.yaml',
        'kustomization.yml',
        'cloudformation.yaml',
        'cloudformation.yml',
        'template.yaml',
        'template.yml',
      ]),
    suggestions: [{ name: 'checkov', reason: 'IaC files detected (Terraform/K8s/CloudFormation)' }],
  },
  {
    id: 'mobile',
    match: (i) => hasAnyExt(i, ['.apk', '.ipa', '.aab']) || hasFile(i, ['androidmanifest.xml']),
    suggestions: [{ name: 'mobsf', reason: 'Mobile artifacts detected (Android/iOS)' }],
  },
];

export async function suggestScannersForTarget(
  target: string,
  options: RecommendationOptions = {}
): Promise<SuggestedScanner[]> {
  const t = target.trim();
  if (!t) return [];

  const lower = t.toLowerCase();
  const isUrl = lower.startsWith('http://') || lower.startsWith('https://');
  const isRepo = isUrl && isLikelyRepoUrl(t);

  if (isRepo) {
    return suggestScannersForRepoUrl(t, options);
  }

  if (isUrl) {
    return uniqueByName(suggestScannersForUrl(t));
  }

  let suggestions = suggestScannersForStringTarget(t);
  if (fs.existsSync(t) && fs.statSync(t).isDirectory()) {
    const fromDir = await suggestScannersForDirectory(t);
    suggestions = suggestions.concat(fromDir);
  }

  return uniqueByName(suggestions);
}

export async function suggestScannersForDirectory(dirPath: string): Promise<SuggestedScanner[]> {
  const indicators = inspectDirectory(dirPath);
  const suggestionsFromRules = await Promise.all(
    RULES.map(async (rule) => (rule.match(indicators) ? rule.suggestions : []))
  );
  return uniqueByName(suggestionsFromRules.flat());
}

function suggestScannersForUrl(target: string): SuggestedScanner[] {
  const t = target.toLowerCase();
  if (t.startsWith('http://') || t.startsWith('https://')) {
    return [
      { name: 'nuclei', reason: 'Web URL target - template-based DAST' },
      { name: 'zap', reason: 'Web URL target - active web application testing' },
      { name: 'sqlmap', reason: 'Web URL target - SQL injection testing' },
      { name: 'ssl', reason: 'Web URL target - TLS/SSL checks' },
    ];
  }
  return [];
}

function suggestScannersForStringTarget(target: string): SuggestedScanner[] {
  const t = target.toLowerCase();
  const out: SuggestedScanner[] = [];
  const isIp = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/.test(t);

  if (isIp || t.includes(':')) {
    out.push({ name: 'nmap', reason: 'Host/IP target - network scanning' });
    out.push({ name: 'ssl', reason: 'Host target - TLS/SSL checks' });
    out.push({ name: 'nuclei', reason: 'Host target - template-based checks' });
  }
  if (t.includes('docker.io/') || t.startsWith('sha256:')) {
    out.push({ name: 'trivy', reason: 'Container image style target' });
    out.push({ name: 'grype', reason: 'Container image style target' });
  }
  if (t.endsWith('.apk') || t.endsWith('.ipa') || t.endsWith('.aab')) {
    out.push({ name: 'mobsf', reason: 'Mobile artifact target' });
  }
  if (t.endsWith('.tf') || t.endsWith('.tf.json') || t.includes('terraform') || t.includes('kubernetes')) {
    out.push({ name: 'checkov', reason: 'IaC-style target naming' });
  }

  return out;
}

async function suggestScannersForRepoUrl(
  repoUrl: string,
  options: RecommendationOptions
): Promise<SuggestedScanner[]> {
  const cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  const now = options.now ?? Date.now;
  const cached = repoSuggestionCache.get(repoUrl);
  if (cached && now() - cached.ts < cacheTtlMs) return cached.suggestions;

  const cloneableUrl = toCloneableRepoUrl(repoUrl);
  const fallback = uniqueByName([
    { name: 'semgrep', reason: 'Repository URL - static analysis (fallback)' },
    { name: 'opengrep', reason: 'Repository URL - semantic analysis (fallback)' },
    { name: 'gitleaks', reason: 'Repository URL - secrets detection (fallback)' },
    { name: 'trufflehog', reason: 'Repository URL - secrets verification (fallback)' },
  ]);
  if (!cloneableUrl) return fallback;

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sa-reco-'));
  const checkoutDir = path.join(tmpRoot, 'repo');
  const timeoutMs = options.repoCloneTimeoutMs ?? DEFAULT_REPO_CLONE_TIMEOUT_MS;
  const cloneRepo = options.cloneRepo ?? defaultCloneRepo;

  try {
    cloneRepo(cloneableUrl, checkoutDir, timeoutMs);
    const inspected = (await suggestScannersForDirectory(checkoutDir)).map((s) => ({
      name: s.name,
      reason: `Repo inspection - ${s.reason}`,
    }));
    const suggestions = uniqueByName(inspected.length ? inspected : fallback);
    repoSuggestionCache.set(repoUrl, { ts: now(), suggestions });
    return suggestions;
  } catch {
    return fallback;
  } finally {
    try {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    } catch {
      // ignore cleanup failures
    }
  }
}

function defaultCloneRepo(repoUrl: string, checkoutDir: string, timeoutMs: number): void {
  execFileSync('git', ['clone', '--depth', '1', '--single-branch', repoUrl, checkoutDir], {
    stdio: 'ignore',
    timeout: timeoutMs,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  });
}

function inspectDirectory(dirPath: string): ProjectIndicators {
  const files = new Set<string>();
  const dirs = new Set<string>();
  const exts = new Set<string>();

  const walk = (currentDir: string, depth: number): void => {
    if (depth > 4) return;
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const name = entry.name.toLowerCase();
      const full = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        dirs.add(name);
        if (!['node_modules', '.venv', 'venv', 'dist', 'build', '.next', '.git'].includes(name)) {
          walk(full, depth + 1);
        }
      } else if (entry.isFile()) {
        files.add(name);
        exts.add(path.extname(name).toLowerCase());
      }
    }
  };
  walk(dirPath, 0);

  return { files, dirs, exts };
}

function isLikelyRepoUrl(target: string): boolean {
  let u: URL;
  try {
    u = new URL(target);
  } catch {
    return false;
  }
  const host = u.hostname.toLowerCase();
  const parts = u.pathname.split('/').filter(Boolean);
  if (target.toLowerCase().endsWith('.git')) return true;
  return ['github.com', 'gitlab.com', 'bitbucket.org'].includes(host) && parts.length >= 2;
}

function toCloneableRepoUrl(target: string): string | null {
  if (target.toLowerCase().endsWith('.git')) return target;
  let u: URL;
  try {
    u = new URL(target);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();
  const parts = u.pathname.split('/').filter(Boolean);
  if (!['github.com', 'gitlab.com', 'bitbucket.org'].includes(host) || parts.length < 2) return null;
  const owner = parts[0];
  const repo = parts[1].replace(/\.git$/i, '');
  return `https://${host}/${owner}/${repo}.git`;
}

function hasFile(indicators: ProjectIndicators, names: string[]): boolean {
  return names.some((n) => indicators.files.has(n.toLowerCase()));
}

function hasDir(indicators: ProjectIndicators, names: string[]): boolean {
  return names.some((n) => indicators.dirs.has(n.toLowerCase()));
}

function hasAnyExt(indicators: ProjectIndicators, wantedExts: string[]): boolean {
  return wantedExts.some((ext) => indicators.exts.has(ext.toLowerCase()));
}

function uniqueByName(items: SuggestedScanner[]): SuggestedScanner[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.name)) return false;
    seen.add(item.name);
    return true;
  });
}
