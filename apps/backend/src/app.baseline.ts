import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import morgan from 'morgan';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import routes from './routes';
import { suggestScannersForTarget } from './services/scanner-recommendation';

dotenv.config();

const SCAN_VOLUMES_FILE = process.env.SCAN_VOLUMES_FILE || path.join(process.cwd(), 'scan-volumes.json');

function readVolumes(): { name: string; mountPath: string }[] {
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

export function createApp(): Application {
  const app = express();

  app.use(cors());
  app.use(express.json());
  app.use(morgan('dev'));

  app.get('/api/volumes', (_req: Request, res: Response) => {
    try {
      const volumes = readVolumes();
      res.json({ volumes });
    } catch (e) {
      console.error('[volumes] List error:', e);
      res.status(500).json({ error: 'Failed to list volumes' });
    }
  });

  app.get('/api/volumes/browse', (req: Request, res: Response) => {
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

  app.get('/api/volumes/suggest-scanners', async (req: Request, res: Response) => {
    const rawTarget = (req.query.target as string) || (req.query.path as string);
    if (!rawTarget || typeof rawTarget !== 'string') {
      return res.status(400).json({ error: 'Query parameter target or path is required' });
    }

    const target = rawTarget.trim();
    const isUrl = target.startsWith('http://') || target.startsWith('https://');

    try {
      if (isUrl) return res.json({ suggestions: await suggestScannersForTarget(target) });

      // Reject obvious traversal attempts early.
      if (/(^|[\/\\])\.\.([\/\\]|$)/.test(target)) {
        return res.status(400).json({ error: 'Invalid path' });
      }

      const normalizedPath = path.normalize(target).replace(/^(\.\.(\/|\\))+/, '');
      if (normalizedPath.startsWith('..')) {
        return res.status(400).json({ error: 'Invalid path' });
      }

      const volumes = readVolumes();
      const isUnderVolume = volumes.some((v) => isPathUnderMount(normalizedPath, v.mountPath));
      const isUploadPath = isPathUnderMount(normalizedPath, '/uploads');

      // For existing filesystem paths, enforce mounted volumes/uploads.
      if (fs.existsSync(normalizedPath) && !isUnderVolume && !isUploadPath) {
        return res.status(403).json({ error: 'Path is not under a mounted scan volume' });
      }

      return res.json({ suggestions: await suggestScannersForTarget(target) });
    } catch (e) {
      console.error('[volumes] Suggest error:', e);
      return res.status(500).json({ error: 'Failed to suggest scanners' });
    }
  });

  app.use('/api', routes);

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok' });
  });

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('Error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

export default createApp();
