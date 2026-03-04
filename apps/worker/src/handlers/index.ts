import { Processor } from 'bullmq';
import { securityScanHandler } from './security-scan.handler';
import { vulnerabilityCheckHandler } from './vulnerability-check.handler';
import { codeAnalysisHandler } from './code-analysis.handler';
import { dependencyScanHandler } from './dependency-scan.handler';
import { notificationHandler } from './notification.handler';
import { webhookHandler } from './webhook.handler';
import { healthCheckHandler } from './health-check.handler';

export const handlers = [
  securityScanHandler,
  vulnerabilityCheckHandler,
  codeAnalysisHandler,
  dependencyScanHandler,
  notificationHandler,
  webhookHandler,
  healthCheckHandler,
];

export const handlersMap: Map<string, Processor> = new Map(
  handlers.map((handler) => [handler.name, handler.handle])
);

export function getHandler(jobName: string): Processor | undefined {
  return handlersMap.get(jobName);
}
