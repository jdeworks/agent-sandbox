import { Router, Request, Response } from 'express';
import { ScannerSetting } from '@security-analyzer/types';

const router = Router();

// Default scanner configurations
const DEFAULT_SCANNER_CONFIGS: ScannerSetting[] = [
  { name: 'bandit', enabled: true, timeout: 300000, args: '', category: 'SAST' },
  { name: 'semgrep', enabled: true, timeout: 300000, args: '', category: 'SAST' },
  { name: 'opengrep', enabled: true, timeout: 300000, args: '', category: 'SAST' },
  { name: 'nuclei', enabled: true, timeout: 300000, args: '', category: 'DAST' },
  { name: 'zap', enabled: false, timeout: 600000, args: '', category: 'DAST' },
  { name: 'sqlmap', enabled: false, timeout: 600000, args: '', category: 'DAST' },
  { name: 'nmap', enabled: false, timeout: 300000, args: '', category: 'Network' },
  { name: 'ssl', enabled: false, timeout: 120000, args: '', category: 'Network' },
  { name: 'gitleaks', enabled: true, timeout: 300000, args: '', category: 'Secrets' },
  { name: 'trufflehog', enabled: true, timeout: 300000, args: '', category: 'Secrets' },
  { name: 'trivy', enabled: true, timeout: 300000, args: '', category: 'Container' },
  { name: 'grype', enabled: true, timeout: 300000, args: '', category: 'Dependency' },
  { name: 'checkov', enabled: true, timeout: 300000, args: '', category: 'IaC' },
  { name: 'mobsf', enabled: false, timeout: 600000, args: '', category: 'Mobile' },
  { name: 'test-scanner', enabled: false, timeout: 60000, args: '', category: 'Test' },
];

// In-memory storage for scanner configs (would be database in production)
let scannerConfigs: ScannerSetting[] = [...DEFAULT_SCANNER_CONFIGS];

// GET /api/settings - Get current settings
router.get('/', async (_req: Request, res: Response) => {
  try {
    // Return settings with current scanner configs
    const settings = {
      id: '1',
      apiUrl: process.env.API_PORT
        ? `http://localhost:${process.env.API_PORT}`
        : 'http://localhost:3000',
      scanTimeout: parseInt(process.env.SCANNER_TIMEOUT || '300000', 10),
      maxConcurrentScans: parseInt(process.env.MAX_CONCURRENT_SCANS || '3', 10),
      notificationEmail: process.env.NOTIFICATION_EMAIL,
      enableNotifications: process.env.ENABLE_NOTIFICATIONS === 'true',
      theme: 'auto' as const,
      scannerConfigs,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    res.json(settings);
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// PATCH /api/settings - Update settings
router.patch('/', async (req: Request, res: Response) => {
  try {
    const data = req.body as {
      apiUrl?: string;
      scanTimeout?: number;
      maxConcurrentScans?: number;
      notificationEmail?: string;
      enableNotifications?: boolean;
      theme?: 'light' | 'dark' | 'auto';
      scannerConfigs?: ScannerSetting[];
    };

    // Handle scanner configs update
    if (data.scannerConfigs && Array.isArray(data.scannerConfigs)) {
      scannerConfigs = data.scannerConfigs.map((scanner: ScannerSetting) => ({
        name: scanner.name,
        enabled: scanner.enabled ?? true,
        timeout: scanner.timeout ?? 300000,
        args: scanner.args ?? '',
        category: scanner.category,
      }));
    }

    const settings = {
      id: '1',
      apiUrl: data.apiUrl || process.env.API_URL || 'http://localhost:3000',
      scanTimeout: data.scanTimeout ?? parseInt(process.env.SCANNER_TIMEOUT || '300000', 10),
      maxConcurrentScans:
        data.maxConcurrentScans ?? parseInt(process.env.MAX_CONCURRENT_SCANS || '3', 10),
      notificationEmail: data.notificationEmail ?? process.env.NOTIFICATION_EMAIL,
      enableNotifications: data.enableNotifications ?? process.env.ENABLE_NOTIFICATIONS === 'true',
      theme: data.theme || 'auto',
      scannerConfigs,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    res.json(settings);
  } catch (error) {
    console.error('Error updating settings:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// GET /api/settings/scanners - Get scanner configurations
router.get('/scanners', (_req: Request, res: Response) => {
  res.json(scannerConfigs);
});

// PUT /api/settings/scanners - Update scanner configurations
router.put('/scanners', (req: Request, res: Response) => {
  try {
    const configs = req.body as ScannerSetting[];

    if (!Array.isArray(configs)) {
      return res.status(400).json({ error: 'Scanner configs must be an array' });
    }

    scannerConfigs = configs.map((scanner) => ({
      name: scanner.name,
      enabled: scanner.enabled ?? true,
      timeout: scanner.timeout ?? 300000,
      args: scanner.args ?? '',
      category: scanner.category,
    }));

    res.json(scannerConfigs);
  } catch (error) {
    console.error('Error updating scanner configs:', error);
    res.status(500).json({ error: 'Failed to update scanner configurations' });
  }
});

export default router;
