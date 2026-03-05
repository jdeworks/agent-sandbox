// Copy this file to apps/backend/src/routes/volumes.ts
// Then in apps/backend/src/routes/index.ts add:
//   import volumesRouter from './volumes';
//   router.use('/volumes', volumesRouter);

import { Router, Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';

const router = Router();

const SCAN_VOLUMES_FILE = process.env.SCAN_VOLUMES_FILE || path.join(process.cwd(), 'scan-volumes.json');

interface ScanVolumeEntry {
  name: string;
  mountPath: string;
}

function readVolumes(): ScanVolumeEntry[] {
  try {
    if (fs.existsSync(SCAN_VOLUMES_FILE)) {
      const data = JSON.parse(fs.readFileSync(SCAN_VOLUMES_FILE, 'utf8'));
      return Array.isArray(data.volumes) ? data.volumes : [];
    }
  } catch (e) {
    console.error('[volumes] Failed to read scan-volumes.json:', e);
  }
  return [];
}

function isPathUnderMount(absolutePath: string, mountPath: string): boolean {
  const normalized = path.normalize(absolutePath);
  const mount = path.normalize(mountPath);
  return normalized === mount || normalized.startsWith(mount + path.sep);
}

router.get('/', (_req: Request, res: Response) => {
  try {
    const volumes = readVolumes();
    res.json({ volumes });
  } catch (e) {
    console.error('[volumes] List error:', e);
    res.status(500).json({ error: 'Failed to list volumes' });
  }
});

router.get('/browse', (req: Request, res: Response) => {
  const rawPath = req.query.path as string;
  if (!rawPath || typeof rawPath !== 'string') {
    return res.status(400).json({ error: 'Query parameter path is required' });
  }
  const requestedPath = path.normalize(rawPath).replace(/^(\.\.(\/|\\))+/, '');
  if (requestedPath.startsWith('..')) {
    return res.status(400).json({ error: 'Invalid path' });
  }

  const volumes = readVolumes();
  const allowed = volumes.some((v) => isPathUnderMount(requestedPath, v.mountPath));
  if (!allowed) {
    return res.status(403).json({ error: 'Path is not under a mounted scan volume' });
  }

  try {
    if (!fs.existsSync(requestedPath)) {
      return res.status(404).json({ error: 'Path not found' });
    }
    const stat = fs.statSync(requestedPath);
    if (!stat.isDirectory()) {
      return res.json({ path: requestedPath, entries: [], file: true });
    }
    const entries = fs.readdirSync(requestedPath, { withFileTypes: true }).map((d) => ({
      name: d.name,
      path: path.join(requestedPath, d.name),
      isDirectory: d.isDirectory(),
    }));
    res.json({ path: requestedPath, entries });
  } catch (e) {
    console.error('[volumes] Browse error:', e);
    res.status(500).json({ error: 'Failed to browse path' });
  }
});

function suggestScannersForPath(dirPath: string): { name: string; reason: string }[] {
  const suggestions: { name: string; reason: string }[] = [];
  let entries: string[] = [];
  try {
    entries = fs.readdirSync(dirPath);
  } catch {
    return suggestions;
  }

  const hasFile = (names: string[]) => names.some((n) => entries.includes(n)));
  const hasDir = (names: string[]) => names.some((n) => entries.includes(n)));
  const hasAnyExt = (exts: string[]) =>
    entries.some((e) => exts.some((ext) => e.toLowerCase().endsWith(ext)));

  if (hasFile(['requirements.txt', 'setup.py', 'pyproject.toml']) || hasAnyExt(['.py'])) {
    suggestions.push({ name: 'bandit', reason: 'Python project (requirements.txt, .py files)' });
  }
  if (hasAnyExt(['.py', '.js', '.ts', '.go', '.java', '.rb', '.php']) || hasDir(['src', 'lib'])) {
    suggestions.push({ name: 'semgrep', reason: 'Source code present – multi-language SAST' });
    suggestions.push({ name: 'opengrep', reason: 'Source code present – semantic analysis' });
  }
  if (hasDir(['.git'])) {
    suggestions.push({ name: 'gitleaks', reason: 'Git repository – secrets detection' });
    suggestions.push({ name: 'trufflehog', reason: 'Git repository – secrets verification' });
  }
  if (hasFile(['package.json', 'package-lock.json', 'yarn.lock'])) {
    suggestions.push({ name: 'trivy', reason: 'Node project – dependency/fs scan' });
    suggestions.push({ name: 'grype', reason: 'Node project – dependency scan' });
  }
  if (hasFile(['Dockerfile', 'docker-compose.yml', '.dockerignore'])) {
    suggestions.push({ name: 'trivy', reason: 'Dockerfile present – container/image scan' });
    suggestions.push({ name: 'grype', reason: 'Container files – vulnerability scan' });
  }
  if (hasAnyExt(['.tf', '.tf.json', '.yaml', '.yml']) || hasDir(['terraform', 'k8s', 'kubernetes'])) {
    const iacFiles = entries.filter(
      (e) =>
        e.endsWith('.tf') ||
        e.endsWith('.tf.json') ||
        e.includes('terraform') ||
        e.includes('kubernetes') ||
        e.includes('cloudformation')
    );
    if (iacFiles.length > 0 || hasDir(['terraform', 'k8s', 'kubernetes'])) {
      suggestions.push({ name: 'checkov', reason: 'IaC files – Terraform/K8s/CloudFormation' });
    }
  }
  if (hasAnyExt(['.apk', '.ipa', '.aab']) || hasFile(['AndroidManifest.xml'])) {
    suggestions.push({ name: 'mobsf', reason: 'Mobile app – Android/iOS security' });
  }

  return suggestions;
}

router.get('/suggest-scanners', (req: Request, res: Response) => {
  const rawPath = req.query.path as string;
  if (!rawPath || typeof rawPath !== 'string') {
    return res.status(400).json({ error: 'Query parameter path is required' });
  }
  const requestedPath = path.normalize(rawPath).replace(/^(\.\.(\/|\\))+/, '');
  if (requestedPath.startsWith('..')) {
    return res.status(400).json({ error: 'Invalid path' });
  }

  const volumes = readVolumes();
  const allowed = volumes.some((v) => isPathUnderMount(requestedPath, v.mountPath));
  if (!allowed) {
    return res.status(403).json({ error: 'Path is not under a mounted scan volume' });
  }

  try {
    const suggestions = suggestScannersForPath(requestedPath);
    res.json({ suggestions });
  } catch (e) {
    console.error('[volumes] Suggest error:', e);
    res.status(500).json({ error: 'Failed to suggest scanners' });
  }
});

export default router;
