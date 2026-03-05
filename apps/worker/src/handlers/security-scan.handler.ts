import { Job } from 'bullmq';
import { JobTypes } from '../queues/constants';
import { createJobHandler } from './types';
import { getGlobalRegistry } from '../scanners/registry';
import { ScannerConfig } from '../scanners/base';
import { ScanResult } from '@security-analyzer/types';
import pool from '../config/database';

async function handleSecurityScanData(data: Record<string, unknown>, job: Job): Promise<void> {
  const scanId = data.scanId as string;
  const target = data.target as string;
  const scanners = (data.scanners || []) as Array<{
    name: string;
    enabled: boolean;
    options?: Record<string, unknown>;
  }>;

  const registry = getGlobalRegistry();

  if (registry.count() === 0) {
    const { autoDiscoverScanners } = await import('../scanners/discovery');
    await autoDiscoverScanners(registry);
  }

  const allVulns: any[] = [];

  for (const s of scanners.filter((s) => s.enabled)) {
    try {
      const scanner = registry.get(s.name);
      if (!scanner) continue;
      const config: ScannerConfig = {
        enabled: true,
        timeout: 300000,
        maxMemory: 512,
        parallel: false,
      };
      await scanner.init(config);
      const result = await scanner.scan(target, s.options);
      if (result.vulnerabilities) allVulns.push(...result.vulnerabilities);
    } catch {}
  }

  for (const v of allVulns) (v as any).scanId = scanId;

  const counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  allVulns.forEach((v) => {
    const sev = (v as any).severity as keyof typeof counts;
    if (counts[sev] !== undefined) counts[sev]++;
  });
  const summary = { total: allVulns.length, ...counts };

  const result: ScanResult = {
    id: `result-${Date.now()}`,
    scanId,
    summary,
    vulnerabilities: allVulns as any,
    createdAt: new Date().toISOString(),
  };

  await pool.query('UPDATE scans SET status = $1, completed_at = $2, results = $3 WHERE id = $4', [
    'completed',
    new Date().toISOString(),
    result,
    scanId,
  ]);
  console.log(`[SecurityScan] Scan ${scanId} completed. Found ${allVulns.length} vulnerabilities.`);
}

export const securityScanHandler = {
  name: JobTypes.SECURITY_SCAN,
  handle: createJobHandler(JobTypes.SECURITY_SCAN, handleSecurityScanData),
};
