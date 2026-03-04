import Redis from 'ioredis';
import { queues, workers } from '../queues/worker';
import { QueueNames } from '../queues/constants';

export interface QueueHealth {
  name: string;
  isReady: boolean;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
}

export interface WorkerHealth {
  queue: string;
  isRunning: boolean;
}

export interface HealthStatus {
  redis: boolean;
  queues: QueueHealth[];
  workers: WorkerHealth[];
  timestamp: string;
}

let redisClient: Redis | null = null;

function getRedisClient(): Redis {
  if (!redisClient) {
    redisClient = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_DB || '0', 10),
      lazyConnect: true,
    });
  }
  return redisClient;
}

export async function checkRedisHealth(): Promise<boolean> {
  try {
    const client = getRedisClient();
    const result = await client.ping();
    return result === 'PONG';
  } catch (error) {
    console.error('[Health] Redis health check failed:', error);
    return false;
  }
}

export async function checkQueueHealth(queueName: string): Promise<QueueHealth> {
  const queue = queues.get(queueName);
  
  if (!queue) {
    return {
      name: queueName,
      isReady: false,
      waiting: 0,
      active: 0,
      completed: 0,
      failed: 0,
    };
  }

  const [waiting, active, completed, failed] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getCompletedCount(),
    queue.getFailedCount(),
  ]);

  return {
    name: queueName,
    isReady: true,
    waiting,
    active,
    completed,
    failed,
  };
}

export async function checkWorkerHealth(): Promise<WorkerHealth[]> {
  const workerHealths: WorkerHealth[] = [];

  for (const [queueName, worker] of workers) {
    workerHealths.push({
      queue: queueName,
      isRunning: worker.isRunning(),
    });
  }

  return workerHealths;
}

export async function getHealthStatus(): Promise<HealthStatus> {
  const [redis, queueNames, workerHealths] = await Promise.all([
    checkRedisHealth(),
    Promise.all(
      Object.values(QueueNames).map((name) => checkQueueHealth(name))
    ),
    checkWorkerHealth(),
  ]);

  return {
    redis,
    queues: queueNames,
    workers: workerHealths,
    timestamp: new Date().toISOString(),
  };
}

export async function healthCheck(): Promise<boolean> {
  const status = await getHealthStatus();
  return status.redis && status.workers.every((w) => w.isRunning);
}

export async function closeRedisConnection(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}
