import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import * as dotenv from 'dotenv';

dotenv.config();

const REDIS_HOST = process.env.REDIS_HOST || 'redis';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);
const REDIS_URL = process.env.REDIS_URL || `redis://${REDIS_HOST}:${REDIS_PORT}`;

// Create Redis connection
const redisConnection = new Redis({
  host: REDIS_HOST,
  port: REDIS_PORT,
  // password: process.env.REDIS_PASSWORD, // if needed
});

// Queue names
export const QueueName = {
  SECURITY_SCAN: 'security-scan',
  // other queues if needed
};

export class ScanQueue {
  private queue: Queue;

  constructor() {
    this.queue = new Queue(QueueName.SECURITY_SCAN, {
      connection: redisConnection,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        removeOnComplete: {
          count: 100,
          age: 24 * 60 * 60 * 1000, // 24 hours
        },
        removeOnFail: {
          count: 100,
          age: 24 * 60 * 60 * 1000,
        },
      },
    });

  }

  async addScanJob(
    scanId: string,
    target: string,
    scanners?: Array<{ name: string; enabled: boolean; options?: Record<string, unknown> }>,
    scanMode?: string
  ): Promise<string> {
    const job = await this.queue.add(
      'scan',
      {
        scanId,
        target,
        scanners,
        scanMode,
      },
      {
        // Job-specific options
        jobId: scanId, // Use scanId as jobId to avoid duplicates
      }
    );

    return job.id!;
  }

  async getJob(jobId: string) {
    return await this.queue.getJob(jobId);
  }

  async getJobProgress(jobId: string) {
    const job = await this.queue.getJob(jobId);
    if (!job) return null;
    return {
      progress: job.progress ?? 0,
      status: (job as any).state || 'unknown',
      failedReason: job.failedReason,
    };
  }
}

// Singleton instance
let scanQueueInstance: ScanQueue | null = null;

export function getScanQueue(): ScanQueue {
  if (!scanQueueInstance) {
    scanQueueInstance = new ScanQueue();
  }
  return scanQueueInstance;
}
