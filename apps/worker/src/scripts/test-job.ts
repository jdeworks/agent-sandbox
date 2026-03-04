import 'dotenv/config';
import { Queue } from 'bullmq';
import { QueueNames, JobTypes } from '../queues/constants';
import { getBullMqConnection } from '../config/redis';

const connection = getBullMqConnection();

async function addTestJob(): Promise<void> {
  console.log('[Test] Adding test jobs to queues...');

  const queues: Array<{ queue: Queue; name: string; data: Record<string, unknown> }> = [
    {
      queue: new Queue(QueueNames.SECURITY_SCAN, { connection }),
      name: JobTypes.SECURITY_SCAN,
      data: {
        target: 'https://example.com',
        scanType: 'full',
        options: { depth: 3, followRedirects: true },
      },
    },
    {
      queue: new Queue(QueueNames.CODE_ANALYSIS, { connection }),
      name: JobTypes.CODE_ANALYSIS,
      data: {
        repository: 'https://github.com/example/repo',
        branch: 'main',
        files: ['src/index.ts', 'src/app.ts'],
      },
    },
    {
      queue: new Queue(QueueNames.NOTIFICATION, { connection }),
      name: JobTypes.NOTIFICATION,
      data: {
        type: 'email',
        recipient: 'user@example.com',
        subject: 'Test Notification',
        body: 'This is a test notification from the worker queue.',
      },
    },
    {
      queue: new Queue(QueueNames.HEALTH_CHECK, { connection }),
      name: JobTypes.HEALTH_CHECK,
      data: {
        timestamp: new Date().toISOString(),
      },
    },
  ];

  for (const { queue, name, data } of queues) {
    const job = await queue.add(name, data, {
      priority: name === JobTypes.HEALTH_CHECK ? 1 : 2,
    });
    console.log(`[Test] Added job ${job.id} to queue ${queue.name}`);
    await queue.close();
  }

  console.log('[Test] All test jobs added successfully');
}

addTestJob().catch((error) => {
  console.error('[Test] Failed to add test jobs:', error);
  process.exit(1);
});
