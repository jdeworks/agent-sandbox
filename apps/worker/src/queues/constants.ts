export const QueueNames = {
  SECURITY_SCAN: 'security-scan',
  VULNERABILITY_CHECK: 'security-vulnerability-check',
  
  CODE_ANALYSIS: 'analysis-code',
  DEPENDENCY_SCAN: 'analysis-dependency',
  
  NOTIFICATION: 'notification-email',
  WEBHOOK: 'notification-webhook',
  
  DEAD_LETTER: 'dlq',
  
  HEALTH_CHECK: 'health-ping',
} as const;

export type QueueName = (typeof QueueNames)[keyof typeof QueueNames];

export const JobTypes = {
  SECURITY_SCAN: 'security-scan',
  VULNERABILITY_CHECK: 'vulnerability-check',
  CODE_ANALYSIS: 'code-analysis',
  DEPENDENCY_SCAN: 'dependency-scan',
  NOTIFICATION: 'notification',
  WEBHOOK: 'webhook',
  HEALTH_CHECK: 'health-check',
} as const;

export type JobType = (typeof JobTypes)[keyof typeof JobTypes];
