import { Job } from 'bullmq';
import { JobTypes } from '../queues/constants';
import { createJobHandler } from './types';

async function handleDependencyScanData(
  data: Record<string, unknown>,
  job: Job
): Promise<void> {
  const { repository, packageManager } = data;

  console.log(`[DependencyScan] Scanning dependencies`, {
    repository,
    packageManager,
  });

  await new Promise((resolve) => setTimeout(resolve, 700));

  const results = {
    repository,
    outdatedPackages: [],
    vulnerabilities: [],
    timestamp: new Date().toISOString(),
  };

  console.log(`[DependencyScan] Completed scan`, results);
}

export const dependencyScanHandler = {

  name: 'analysis-dependency',

  handle: createJobHandler(JobTypes.DEPENDENCY_SCAN, handleDependencyScanData),
};
