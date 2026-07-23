const env = process.env || {};

export const notificationsConfig = {
  awsRegion: env.AWS_REGION ?? 'us-east-1',
  emailQueueUrl: env.NOTIFICATIONS_EMAIL_QUEUE_URL ?? '',
  emailDeadLetterQueueUrl: env.NOTIFICATIONS_EMAIL_DLQ_URL ?? '',
  sesFromAddress: env.NOTIFICATIONS_SES_FROM_ADDRESS ?? '',
  sqsPollWaitTimeSeconds: parseInt(env.NOTIFICATIONS_SQS_POLL_WAIT_SECONDS ?? '20', 10),
  sesConfigurationSetName: env.NOTIFICATIONS_SES_CONFIGURATION_SET_NAME ?? '',
  sesEventsTopicArn: env.NOTIFICATIONS_SES_EVENTS_TOPIC_ARN ?? '',
};
