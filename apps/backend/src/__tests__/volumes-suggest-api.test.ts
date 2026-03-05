import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as http from 'http';

function requestJson(baseUrl: string, route: string): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const req = http.get(`${baseUrl}${route}`, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk.toString();
      });
      res.on('end', () => {
        try {
          const body = data ? JSON.parse(data) : {};
          resolve({ status: res.statusCode || 0, body });
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
  });
}

describe('volumes suggest-scanners API validation', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sa-vol-api-'));
  const volumesFile = path.join(tmpRoot, 'scan-volumes.json');
  const mountedDir = path.join(tmpRoot, 'mounted');
  const nonMountedDir = path.join(tmpRoot, 'non-mounted');
  let baseUrl = '';
  let server: http.Server;

  beforeAll(async () => {
    fs.mkdirSync(mountedDir, { recursive: true });
    fs.mkdirSync(nonMountedDir, { recursive: true });
    fs.writeFileSync(path.join(mountedDir, 'package.json'), '{"name":"test"}');
    fs.writeFileSync(path.join(mountedDir, 'Dockerfile'), 'FROM alpine');
    fs.writeFileSync(volumesFile, JSON.stringify({ volumes: [{ name: 'mounted', mountPath: mountedDir }] }));

    process.env.SCAN_VOLUMES_FILE = volumesFile;
    process.env.UPLOAD_DIR = path.join(tmpRoot, 'uploads');
    jest.resetModules();
    jest.doMock('../routes', () => {
      // Avoid loading DB/queue heavy route modules for this validation test suite.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const express = require('express');
      return express.Router();
    });
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { createApp } = require('../app.baseline');
    const app = createApp();
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => resolve());
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Failed to start test server');
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('returns 400 for missing target/path query', async () => {
    const res = await requestJson(baseUrl, '/api/volumes/suggest-scanners');
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('target or path');
  });

  it('returns 400 for path traversal input', async () => {
    const res = await requestJson(
      baseUrl,
      `/api/volumes/suggest-scanners?target=${encodeURIComponent('../etc/passwd')}`
    );
    expect(res.status).toBe(400);
  });

  it('returns 403 for existing non-mounted path', async () => {
    const res = await requestJson(
      baseUrl,
      `/api/volumes/suggest-scanners?target=${encodeURIComponent(nonMountedDir)}`
    );
    expect(res.status).toBe(403);
  });

  it('returns suggestions for mounted directory path', async () => {
    const res = await requestJson(
      baseUrl,
      `/api/volumes/suggest-scanners?target=${encodeURIComponent(mountedDir)}`
    );
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.suggestions)).toBe(true);
    const names = new Set((res.body.suggestions || []).map((s: { name: string }) => s.name));
    expect(names.has('trivy')).toBe(true);
    expect(names.has('grype')).toBe(true);
  });

  it('returns suggestions for URL target', async () => {
    const res = await requestJson(
      baseUrl,
      `/api/volumes/suggest-scanners?target=${encodeURIComponent('https://example.com')}`
    );
    expect(res.status).toBe(200);
    const names = new Set((res.body.suggestions || []).map((s: { name: string }) => s.name));
    expect(names.has('nuclei')).toBe(true);
    expect(names.has('zap')).toBe(true);
  });
});
