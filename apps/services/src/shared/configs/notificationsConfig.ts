const env = process.env;

export const notificationsConfig = {
  sesRegion: env.SES_REGION ?? 'us-east-1',
  sesFromAddress: env.SES_FROM_ADDRESS ?? '',
  sqsQueueUrl: env.SQS_NOTIFICATIONS_QUEUE_URL ?? '',
  sqsDlqUrl: env.SQS_NOTIFICATIONS_DLQ_URL ?? '',
  sqsPollingIntervalMs: parseInt(env.SQS_POLLING_INTERVAL_MS ?? '5000', 10),
  sqsMaxMessages: parseInt(env.SQS_MAX_MESSAGES ?? '10', 10),
  sqsVisibilityTimeoutSec: parseInt(env.SQS_VISIBILITY_TIMEOUT_SEC ?? '60', 10),
};

export type NotificationsConfig = typeof notificationsConfig;
