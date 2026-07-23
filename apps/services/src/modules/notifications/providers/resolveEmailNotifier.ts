import { SQSClient } from '@aws-sdk/client-sqs';
import { notificationsConfig } from '../../../shared/configs/notificationsConfig.js';
import { db } from '../../../shared/infrastructure/db.js';
import { EmailDeliveriesDBRepository } from '../../../shared/repositories/emailDeliveriesDBRepository.js';
import { SqsEmailNotifier } from './sqsEmailNotifier.js';
import type { IEmailNotifier } from './interfaces/iEmailNotifier.js';

// Singleton — set once at first call; runtime env changes are ignored.
let cachedNotifier: IEmailNotifier | undefined;

export function resolveEmailNotifier(): IEmailNotifier {
  if (cachedNotifier !== undefined) {
    return cachedNotifier;
  }

  const queueUrl = notificationsConfig.emailQueueUrl;
  if (!queueUrl) {
    throw new Error('Missing required env var: NOTIFICATIONS_EMAIL_QUEUE_URL');
  }

  const sqsClient = new SQSClient({ region: notificationsConfig.awsRegion });
  const deliveries = new EmailDeliveriesDBRepository(db);
  cachedNotifier = new SqsEmailNotifier(sqsClient, queueUrl, deliveries);
  return cachedNotifier;
}
