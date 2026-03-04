import { Job } from 'bullmq';
import { JobTypes } from '../queues/constants';
import { createJobHandler } from './types';

async function handleNotificationData(
  data: Record<string, unknown>,
  job: Job
): Promise<void> {
  const { type, recipient, subject, body } = data;

  console.log(`[Notification] Sending notification`, {
    type,
    recipient,
    subject,
  });

  await new Promise((resolve) => setTimeout(resolve, 200));

  console.log(`[Notification] Notification sent to ${recipient}`);
}

export const notificationHandler = {
  name: 'notification-email',
  handle: createJobHandler(JobTypes.NOTIFICATION, handleNotificationData),
};
