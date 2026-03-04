import { Job } from 'bullmq';
import { JobTypes } from '../queues/constants';
import { createJobHandler } from './types';

async function handleHealthCheckData(
  data: Record<string, unknown>,
  job: Job
): Promise<void> {
  const { timestamp } = data;

  console.log(`[HealthCheck] Received ping at ${timestamp || new Date().toISOString()}`);
  
  await new Promise((resolve) => setTimeout(resolve, 50));

  console.log(`[HealthCheck] Pong sent`);
}

export const healthCheckHandler = {
  name: 'health-ping',
  handle: createJobHandler(JobTypes.HEALTH_CHECK, handleHealthCheckData),
};
