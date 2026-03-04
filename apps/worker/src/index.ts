import 'dotenv/config';
import { initializeQueues, initializeWorkers, gracefulShutdown } from './queues/worker';
import { getHealthStatus, healthCheck } from './config/health';

async function main(): Promise<void> {
  console.log('[Main] Starting BullMQ Worker...');

  await initializeQueues();
  await initializeWorkers();

  console.log('[Main] Worker started successfully');

  console.log('[Main] Initial health status:', await getHealthStatus());

  process.on('SIGTERM', async () => {
    console.log('[Main] Received SIGTERM');
    await gracefulShutdown();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    console.log('[Main] Received SIGINT');
    await gracefulShutdown();
    process.exit(0);
  });

  process.on('uncaughtException', async (error) => {
    console.error('[Main] Uncaught exception:', error);
    await gracefulShutdown();
    process.exit(1);
  });

  process.on('unhandledRejection', async (reason) => {
    console.error('[Main] Unhandled rejection:', reason);
    await gracefulShutdown();
    process.exit(1);
  });
}

main().catch((error) => {
  console.error('[Main] Failed to start worker:', error);
  process.exit(1);
});
