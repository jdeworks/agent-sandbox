import { Router, Request, Response } from 'express';
import { database } from '../db';
import { getScanQueue } from '../services/queue';
import type {
  Scan,
  ScannerConfig,
  CreateScanInput,
  PaginatedResponse,
  ScanStatus,
} from '@security-analyzer/types';

const router = Router();

// Helper to map DB row to Scan type
function mapRowToScan(row: Record<string, unknown>): Scan {
  return {
    id: row.id as string,
    name: row.name as string,
    target: row.target_url as string,
    status: row.status as ScanStatus,
    progress: 0,
    config: (row.config as ScannerConfig[] | null) || [],
    scanMode: row.scan_mode ? (row.scan_mode as 'url' | 'local') : undefined,
    startedAt: row.started_at ? new Date(row.started_at as string).toISOString() : undefined,
    completedAt: row.completed_at ? new Date(row.completed_at as string).toISOString() : undefined,
    createdAt: new Date(row.created_at as string).toISOString(),
    updatedAt: new Date(row.updated_at as string).toISOString(),
  };
}

// GET /api/scans - Get all scans with pagination
router.get('/', async (_req: Request, res: Response) => {
  try {
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
    const { id } = req.params;

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
  console.log('[CreateScan] POST handler invoked');
  try {
    const { name, target, scanners, scanMode } = req.body as CreateScanInput;

    if (!name || !target) {
      return res.status(400).json({ error: 'Name and target are required' });
    }

    console.log('[CreateScan] Query params:', {
      name,
      target,
      scanType: scanMode || 'general',
      status: 'pending',
      config: scanners || null,
      configString: JSON.stringify(scanners || null),
      scanMode: scanMode || null,
    });

    const result = await database.query(
      `INSERT INTO scans (name, target_url, scan_type, status, config, scan_mode) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [
        name,
        target,
        scanMode || 'general',
        'pending',
        scanners ? JSON.stringify(scanners) : null,
        scanMode || null,
      ]
    );

    // Enqueue scan job for processing
    console.log('[CreateScan] Enqueueing scan, target:', target, 'scanners:', scanners);
    try {
      const scanId = result.rows[0].id;
      const queue = getScanQueue();
      await queue.addScanJob(scanId, target, scanners || [], scanMode || undefined);
      console.log(`[CreateScan] Queued job for scan ${scanId}`);
      console.log('[CreateScan] After queue.addScanJob call');
    } catch (queueError) {
      console.error('[CreateScan] Failed to enqueue job:', queueError);
      // Continue - scan is created but job may need manual retry
    }

    res.status(201).json(mapRowToScan(result.rows[0]));
  } catch (error) {
    console.error('Error creating scan:', error);
    res.status(500).json({ error: 'Failed to create scan' });
  }
});

// DELETE /api/scans/:id - Delete a scan
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

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
    const { id } = req.params;

    // Fetch scan with results directly using new JSONB schema
    const scanResult = await database.query(
      'SELECT results, completed_at FROM scans WHERE id = $1',
      [id]
    );
    if (scanResult.rows.length === 0) {
      return res.status(404).json({ error: 'Scan not found' });
    }

    const { results, completed_at } = scanResult.rows[0];

    // If results are not yet available, return empty result set
    if (!results) {
      return res.json({
        id: `result-${id}`,
        scanId: id,
        summary: { total: 0, critical: 0, high: 0, medium: 0, low: 0, info: 0 },
        vulnerabilities: [],
        createdAt: completed_at || new Date().toISOString(),
      });
    }

    // Return stored results directly
    return res.json(results);
  } catch (error) {
    console.error('Error fetching results:', error);
    res.status(500).json({ error: 'Failed to fetch results' });
  }
});

// GET /api/scans/:id/vulnerabilities - Get vulnerabilities for a scan
router.get('/:id/vulnerabilities', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Fetch scan results from JSONB column
    const scanResult = await database.query('SELECT results FROM scans WHERE id = $1', [id]);
    if (scanResult.rows.length === 0) {
      return res.status(404).json({ error: 'Scan not found' });
    }

    const { results } = scanResult.rows[0];

    if (!results || !Array.isArray(results.vulnerabilities)) {
      return res.json([]);
    }

    return res.json(results.vulnerabilities);
  } catch (error) {
    console.error('Error fetching vulnerabilities:', error);
    res.status(500).json({ error: 'Failed to fetch vulnerabilities' });
  }
});

export default router;
