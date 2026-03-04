import { Queue, Worker, FlowProducer } from 'bullmq';
import { QueueNames } from '../queues/constants';
import { getBullMqConnection } from '../config/redis';
import { getQueueConfig } from '../queues/config';
import { getHandler, handlers } from '../handlers';

const connection = getBullMqConnection();

export const queues: Map<string, Queue> = new Map();
export const workers: Map<string, Worker> = new Map();
export const flowProducer = new FlowProducer({ connection });

export function createQueue(queueName: string): Queue {
  if (queues.has(queueName)) {
    return queues.get(queueName)!;
  }

  const config = getQueueConfig(queueName);
  const queue = new Queue(queueName, {
    connection,
    defaultJobOptions: config.defaultJobOptions,
  });

  queues.set(queueName, queue);
  console.log(`[Queue] Created queue: ${queueName}`);
  return queue;
}

export function createWorker(
  queueName: string,
  concurrency: number = 5
): Worker {
  if (workers.has(queueName)) {
    return workers.get(queueName)!;
  }

  const handler = getHandler(queueName);
  if (!handler) {
    throw new Error(`No handler found for queue: ${queueName}`);
  }

  const worker = new Worker(queueName, handler, {
    connection,
    concurrency,
    limiter: {
      max: 10,
      duration: 1000,
    },
  });

  worker.on('completed', (job) => {
    console.log(`[Worker] Job ${job.id} completed in queue ${queueName}`);
  });

  worker.on('failed', (job, error) => {
    console.error(`[Worker] Job ${job?.id} failed in queue ${queueName}:`, error.message);
  });

  worker.on('error', (error) => {
    console.error(`[Worker] Worker error for queue ${queueName}:`, error);
  });

  workers.set(queueName, worker);
  console.log(`[Worker] Created worker for queue: ${queueName} (concurrency: ${concurrency})`);
  return worker;
}

export async function createDeadLetterQueue(): Promise<Queue> {
  return createQueue(QueueNames.DEAD_LETTER);
}

export async function initializeQueues(): Promise<void> {
  console.log('[Queue] Initializing queues...');

  const queueNames = [
    QueueNames.SECURITY_SCAN,
    QueueNames.VULNERABILITY_CHECK,
    QueueNames.CODE_ANALYSIS,
    QueueNames.DEPENDENCY_SCAN,
    QueueNames.NOTIFICATION,
    QueueNames.WEBHOOK,
    QueueNames.HEALTH_CHECK,
  ];

  for (const name of queueNames) {
    createQueue(name);
  }

  await createDeadLetterQueue();

  console.log('[Queue] All queues initialized');
}

export async function initializeWorkers(): Promise<void> {
  console.log('[Worker] Initializing workers...');

  const workerConfigs: Array<{ queue: string; concurrency: number }> = [
    { queue: QueueNames.SECURITY_SCAN, concurrency: 3 },
    { queue: QueueNames.VULNERABILITY_CHECK, concurrency: 5 },
    { queue: QueueNames.CODE_ANALYSIS, concurrency: 4 },
    { queue: QueueNames.DEPENDENCY_SCAN, concurrency: 3 },
    { queue: QueueNames.NOTIFICATION, concurrency: 10 },
    { queue: QueueNames.WEBHOOK, concurrency: 5 },
    { queue: QueueNames.HEALTH_CHECK, concurrency: 2 },
  ];

  for (const config of workerConfigs) {
    createWorker(config.queue, config.concurrency);
  }

  console.log('[Worker] All workers initialized');
}

export async function gracefulShutdown(): Promise<void> {
  console.log('[Shutdown] Starting graceful shutdown...');

  for (const worker of workers.values()) {
    await worker.close();
  }
  console.log('[Shutdown] Workers closed');

  for (const queue of queues.values()) {
    await queue.close();
  }
  console.log('[Shutdown] Queues closed');

  await flowProducer.close();
  console.log('[Shutdown] Flow producer closed');

  console.log('[Shutdown] Graceful shutdown complete');
}
