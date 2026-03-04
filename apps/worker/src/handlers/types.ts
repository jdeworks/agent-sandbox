import { Job, Processor } from 'bullmq';

export interface JobHandlerConfig {
  name: string;
  handle: Processor;
}

export function createJobHandler(
  name: string,
  handler: (data: Record<string, unknown>, job: Job) => Promise<void>
): Processor {
  return async (job): Promise<void> => {
    console.log(`[${name}] Processing job ${job.id}`, {
      attempts: job.attemptsMade,
      data: job.data,
    });

    try {
      await handler(job.data as Record<string, unknown>, job);
      console.log(`[${name}] Completed job ${job.id}`);
    } catch (error) {
      console.error(`[${name}] Failed job ${job.id}:`, error);
      throw error;
    }
  };
}
