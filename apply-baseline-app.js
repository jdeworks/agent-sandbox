#!/usr/bin/env node
/**
 * Baseline backend app.ts (includes GET /api/volumes for UI). Written to apps/backend/src/app.ts.
 * Run automatically by ./start so the backend always has the volumes endpoint.
 */
const fs = require('fs');
const path = require('path');

const appPath = path.join(__dirname, 'apps/backend/src/app.ts');
const content = `import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import morgan from 'morgan';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import routes from './routes';

dotenv.config();

const SCAN_VOLUMES_FILE = process.env.SCAN_VOLUMES_FILE || path.join(process.cwd(), 'scan-volumes.json');

export function createApp(): Application {
  const app = express();

  // Middleware
  app.use(cors());
  app.use(express.json());
  app.use(morgan('dev'));

  // Volumes list (read scan-volumes.json; in Docker use SCAN_VOLUMES_FILE=/project/scan-volumes.json and mount .:/project)
  app.get('/api/volumes', (_req: Request, res: Response) => {
    try {
      let volumes: { name: string; mountPath: string }[] = [];
      if (fs.existsSync(SCAN_VOLUMES_FILE)) {
        const data = JSON.parse(fs.readFileSync(SCAN_VOLUMES_FILE, 'utf8'));
        volumes = Array.isArray(data.volumes) ? data.volumes : [];
      }
      res.json({ volumes });
    } catch (e) {
      console.error('[volumes] List error:', e);
      res.status(500).json({ error: 'Failed to list volumes' });
    }
  });

  // API routes
  app.use('/api', routes);

  // Health check endpoint
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok' });
  });

  // Error handling middleware
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('Error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

export default createApp();
`;

fs.writeFileSync(appPath, content);
console.log('Written baseline app.ts with /api/volumes to apps/backend/src/app.ts');
