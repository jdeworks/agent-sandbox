import { Router, Request, Response } from 'express';
import { database } from '../db';
import type {
  Scan,
  ScanResult,
  Vulnerability,
  CreateScanInput,
  PaginatedResponse,
  ScanStatus,
} from '@security-analyzer/types';

const router = Router();

// In-memory mock data for testing when database is unavailable
let mockScans: Scan[] = [
  {
    id: '1',
    name: 'API Security Scan',
    target: 'https://api.example.com',
    status: 'completed',
    progress: 100,
    createdAt: '2024-01-15T10:30:00Z',
    updatedAt: '2024-01-15T11:00:00Z',
    startedAt: '2024-01-15T10:30:00Z',
    completedAt: '2024-01-15T11:00:00Z',
  },
  {
    id: '2',
    name: 'Dependency Audit',
    target: 'github.com/org/repo',
    status: 'completed',
    progress: 100,
    createdAt: '2024-01-14T14:20:00Z',
    updatedAt: '2024-01-14T15:00:00Z',
    startedAt: '2024-01-14T14:20:00Z',
    completedAt: '2024-01-14T15:00:00Z',
  },
  {
    id: '3',
    name: 'Container Scan',
    target: 'myapp:latest',
    status: 'running',
    progress: 45,
    createdAt: '2024-01-15T09:00:00Z',
    updatedAt: '2024-01-15T09:30:00Z',
    startedAt: '2024-01-15T09:00:00Z',
  },
  {
    id: '4',
    name: 'Secret Detection',
    target: 'github.com/org/repo',
    status: 'completed',
    progress: 100,
    createdAt: '2024-01-13T16:45:00Z',
    updatedAt: '2024-01-13T17:00:00Z',
    startedAt: '2024-01-13T16:45:00Z',
    completedAt: '2024-01-13T17:00:00Z',
  },
  {
    id: '5',
    name: 'Infrastructure Scan',
    target: 'aws-prod',
    status: 'pending',
    progress: 0,
    createdAt: '2024-01-15T11:00:00Z',
    updatedAt: '2024-01-15T11:00:00Z',
  },
];

let useMock = false;

// Helper to check if we should use mock data
async function checkDatabase(): Promise<boolean> {
  if (useMock) return true;
  try {
    await database.query('SELECT 1');
    return false;
  } catch {
    console.log('Database unavailable, using in-memory mock data');
    useMock = true;
    return true;
  }
}

// Helper to map DB row to Scan type
function mapRowToScan(row: Record<string, unknown>): Scan {
  return {
    id: row.id as string,
    name: row.name as string,
    target: row.target_url as string,
    status: row.status as ScanStatus,
    progress: 0,
    startedAt: row.started_at ? new Date(row.started_at as string).toISOString() : undefined,
    completedAt: row.completed_at ? new Date(row.completed_at as string).toISOString() : undefined,
    createdAt: new Date(row.created_at as string).toISOString(),
    updatedAt: new Date(row.updated_at as string).toISOString(),
  };
}

// GET /api/scans - Get all scans with pagination
router.get('/', async (_req: Request, res: Response) => {
  try {
    const isMock = await checkDatabase();

    if (isMock) {
      const page = parseInt(_req.query.page as string) || 1;
      const limit = parseInt(_req.query.limit as string) || 10;
      const offset = (page - 1) * limit;

      const total = mockScans.length;
      const scans = mockScans.slice(offset, offset + limit);

      return res.json({
        data: scans,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      });
    }

    const page = parseInt(_req.query.page as string) || 1;
    const limit = parseInt(_req.query.limit as string) || 10;
    const offset = (page - 1) * limit;

    const countResult = await database.query('SELECT COUNT(*) FROM scans');
    const total = parseInt(countResult.rows[0].count, 10);

    const result = await database.query(
      'SELECT * FROM scans ORDER BY created_at DESC LIMIT $1 OFFSET $2',
      [limit, offset]
    );

    const scans: Scan[] = result.rows.map(mapRowToScan);

    const response: PaginatedResponse<Scan> = {
      data: scans,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };

    res.json(response);
  } catch (error) {
    console.error('Error fetching scans:', error);
    res.status(500).json({ error: 'Failed to fetch scans' });
  }
});

// GET /api/scans/:id - Get a single scan by ID
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const isMock = await checkDatabase();
    const { id } = req.params;

    if (isMock) {
      const scan = mockScans.find((s) => s.id === id);
      if (!scan) {
        return res.status(404).json({ error: 'Scan not found' });
      }
      return res.json(scan);
    }

    const result = await database.query('SELECT * FROM scans WHERE id = $1', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Scan not found' });
    }

    res.json(mapRowToScan(result.rows[0]));
  } catch (error) {
    console.error('Error fetching scan:', error);
    res.status(500).json({ error: 'Failed to fetch scan' });
  }
});

// POST /api/scans - Create a new scan
router.post('/', async (req: Request, res: Response) => {
  try {
    const isMock = await checkDatabase();
    const { name, target } = req.body as CreateScanInput;

    if (!name || !target) {
      return res.status(400).json({ error: 'Name and target are required' });
    }

    if (isMock) {
      const newScan: Scan = {
        id: String(Date.now()),
        name,
        target,
        status: 'pending',
        progress: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      mockScans.unshift(newScan);
      return res.status(201).json(newScan);
    }

    const result = await database.query(
      'INSERT INTO scans (name, target_url, scan_type, status) VALUES ($1, $2, $3, $4) RETURNING *',
      [name, target, 'general', 'pending']
    );

    res.status(201).json(mapRowToScan(result.rows[0]));
  } catch (error) {
    console.error('Error creating scan:', error);
    res.status(500).json({ error: 'Failed to create scan' });
  }
});

// DELETE /api/scans/:id - Delete a scan
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const isMock = await checkDatabase();
    const { id } = req.params;

    if (isMock) {
      const index = mockScans.findIndex((s) => s.id === id);
      if (index === -1) {
        return res.status(404).json({ error: 'Scan not found' });
      }
      mockScans.splice(index, 1);
      return res.status(204).send();
    }

    const result = await database.query('DELETE FROM scans WHERE id = $1 RETURNING id', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Scan not found' });
    }

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting scan:', error);
    res.status(500).json({ error: 'Failed to delete scan' });
  }
});

// GET /api/scans/:id/results - Get scan results
router.get('/:id/results', async (req: Request, res: Response) => {
  try {
    const isMock = await checkDatabase();
    const { id } = req.params;

    if (isMock) {
      const scan = mockScans.find((s) => s.id === id);
      if (!scan) {
        return res.status(404).json({ error: 'Scan not found' });
      }

      // Generate mock results
      const mockVulnerabilities: Vulnerability[] =
        scan.status === 'completed'
          ? [
              {
                id: 'v1',
                scanId: id,
                name: 'SQL Injection',
                description: 'Potential SQL injection vulnerability in user input',
                severity: 'critical',
                cve: 'CVE-2024-1234',
                recommendation: 'Use parameterized queries',
                createdAt: scan.createdAt,
              },
              {
                id: 'v2',
                scanId: id,
                name: 'XSS Vulnerability',
                description: 'Cross-site scripting vulnerability in search parameter',
                severity: 'high',
                cve: 'CVE-2024-5678',
                recommendation: 'Sanitize user input',
                createdAt: scan.createdAt,
              },
              {
                id: 'v3',
                scanId: id,
                name: 'Outdated Dependency',
                description: 'Using vulnerable version of lodash',
                severity: 'medium',
                recommendation: 'Update to latest version',
                createdAt: scan.createdAt,
              },
            ]
          : [];

      const summary = {
        total: mockVulnerabilities.length,
        critical: mockVulnerabilities.filter((v) => v.severity === 'critical').length,
        high: mockVulnerabilities.filter((v) => v.severity === 'high').length,
        medium: mockVulnerabilities.filter((v) => v.severity === 'medium').length,
        low: mockVulnerabilities.filter((v) => v.severity === 'low').length,
        info: mockVulnerabilities.filter((v) => v.severity === 'info').length,
      };

      return res.json({
        id: `result-${id}`,
        scanId: id,
        summary,
        vulnerabilities: mockVulnerabilities,
        createdAt: scan.createdAt,
      });
    }

    // Check if scan exists
    const scanResult = await database.query('SELECT * FROM scans WHERE id = $1', [id]);
    if (scanResult.rows.length === 0) {
      return res.status(404).json({ error: 'Scan not found' });
    }

    const scan = mapRowToScan(scanResult.rows[0]);

    // Get all results for this scan
    const resultsQuery = await database.query('SELECT * FROM scan_results WHERE scan_id = $1', [
      id,
    ]);

    // Count by severity
    const summary = {
      total: resultsQuery.rows.length,
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      info: 0,
    };

    // Get vulnerabilities
    const vulnQuery = await database.query(
      `SELECT v.* FROM vulnerabilities v
       JOIN scan_results sr ON sr.id = v.scan_result_id
       WHERE sr.scan_id = $1`,
      [id]
    );

    const vulnerabilities: Vulnerability[] = vulnQuery.rows.map((row: Record<string, unknown>) => ({
      id: row.id as string,
      scanId: id,
      name: row.name as string,
      description: row.description as string,
      severity: row.severity as Vulnerability['severity'],
      cve: row.cve_id as string | undefined,
      recommendation: row.remediation as string | undefined,
      createdAt: new Date(row.created_at as string).toISOString(),
    }));

    // Count severities
    for (const vuln of vulnerabilities) {
      if (vuln.severity === 'critical') summary.critical++;
      else if (vuln.severity === 'high') summary.high++;
      else if (vuln.severity === 'medium') summary.medium++;
      else if (vuln.severity === 'low') summary.low++;
      else summary.info++;
    }

    const scanResultResponse: ScanResult = {
      id: `result-${id}`,
      scanId: id,
      summary,
      vulnerabilities,
      createdAt: scan.createdAt,
    };

    res.json(scanResultResponse);
  } catch (error) {
    console.error('Error fetching results:', error);
    res.status(500).json({ error: 'Failed to fetch results' });
  }
});

// GET /api/scans/:id/vulnerabilities - Get vulnerabilities for a scan
router.get('/:id/vulnerabilities', async (req: Request, res: Response) => {
  try {
    const isMock = await checkDatabase();
    const { id } = req.params;

    if (isMock) {
      const scan = mockScans.find((s) => s.id === id);
      if (!scan) {
        return res.status(404).json({ error: 'Scan not found' });
      }

      if (scan.status !== 'completed') {
        return res.json([]);
      }

      return res.json([
        {
          id: 'v1',
          scanId: id,
          name: 'SQL Injection',
          description: 'Potential SQL injection vulnerability in user input',
          severity: 'critical',
          cve: 'CVE-2024-1234',
          recommendation: 'Use parameterized queries',
          createdAt: scan.createdAt,
        },
        {
          id: 'v2',
          scanId: id,
          name: 'XSS Vulnerability',
          description: 'Cross-site scripting vulnerability in search parameter',
          severity: 'high',
          cve: 'CVE-2024-5678',
          recommendation: 'Sanitize user input',
          createdAt: scan.createdAt,
        },
      ]);
    }

    const result = await database.query(
      `SELECT v.* FROM vulnerabilities v
       JOIN scan_results sr ON sr.id = v.scan_result_id
       WHERE sr.scan_id = $1`,
      [id]
    );

    const vulnerabilities: Vulnerability[] = result.rows.map((row: Record<string, unknown>) => ({
      id: row.id as string,
      scanId: id,
      name: row.name as string,
      description: row.description as string,
      severity: row.severity as Vulnerability['severity'],
      cve: row.cve_id as string | undefined,
      recommendation: row.remediation as string | undefined,
      createdAt: new Date(row.created_at as string).toISOString(),
    }));

    res.json(vulnerabilities);
  } catch (error) {
    console.error('Error fetching vulnerabilities:', error);
    res.status(500).json({ error: 'Failed to fetch vulnerabilities' });
  }
});

export default router;
