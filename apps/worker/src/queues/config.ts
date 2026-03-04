import { QueueNames } from '../queues/constants';
import { getBullMqConnection } from '../config/redis';

export interface QueueOptions {
  connection?: ReturnType<typeof getBullMqConnection>;
  defaultJobOptions?: {
    attempts?: number;
    backoff?: {
      type: 'exponential' | 'fixed';
      delay?: number;
    };
    removeOnComplete?: boolean | number;
    removeOnFail?: boolean | number;
  };
}

export const defaultRetryConfig = {
  attempts: 3,
  backoff: {
    type: 'exponential' as const,
    delay: 1000,
  },
};

export const defaultJobOptions = {
  attempts: defaultRetryConfig.attempts,
  backoff: defaultRetryConfig.backoff,
  removeOnComplete: 100,
  removeOnFail: 500,
};

export const queueConfigs: Record<string, QueueOptions> = {
  [QueueNames.SECURITY_SCAN]: {
    defaultJobOptions: {
      attempts: 3,
    },
  },
  [QueueNames.VULNERABILITY_CHECK]: {
    defaultJobOptions: {
      attempts: 5,
    },
  },
  [QueueNames.CODE_ANALYSIS]: {
    defaultJobOptions: {
      attempts: 2,
    },
  },
  [QueueNames.DEPENDENCY_SCAN]: {
    defaultJobOptions: {
      attempts: 3,
    },
  },
  [QueueNames.NOTIFICATION]: {
    defaultJobOptions: {
      attempts: 4,
    },
  },
  [QueueNames.WEBHOOK]: {
    defaultJobOptions: {
      attempts: 3,
    },
  },
  [QueueNames.HEALTH_CHECK]: {
    defaultJobOptions: {
      attempts: 1,
      removeOnComplete: true,
      removeOnFail: true,
    },
  },
};

export function getQueueConfig(queueName: string): QueueOptions {
  return queueConfigs[queueName] || { defaultJobOptions };
}

export function getAllQueueNames(): string[] {
  return Object.values(QueueNames).filter(
    (name) => name !== QueueNames.DEAD_LETTER
  );
}
