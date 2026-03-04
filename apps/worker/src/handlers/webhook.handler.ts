import { Job } from 'bullmq';
import { JobTypes } from '../queues/constants';
import { createJobHandler } from './types';

async function handleWebhookData(
  data: Record<string, unknown>,
  job: Job
): Promise<void> {
  const { url, event, payload } = data;

  console.log(`[Webhook] Sending webhook`, {
    url,
    event,
  });

  await new Promise((resolve) => setTimeout(resolve, 150));

  console.log(`[Webhook] Webhook sent to ${url}`);
}

export const webhookHandler = {
  name: 'notification-webhook',
  handle: createJobHandler(JobTypes.WEBHOOK, handleWebhookData),
};
