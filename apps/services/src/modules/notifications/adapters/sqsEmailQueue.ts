import { SQSClient, SendMessageCommand, ReceiveMessageCommand, DeleteMessageCommand } from '@aws-sdk/client-sqs';
import type { NotificationsConfig } from '../../../shared/configs/notificationsConfig.js';
import type { ISqsEmailQueue, EmailSendMessage, SqsEnvelope } from '../ports/iSqsEmailQueue.js';

export class SqsEmailQueue implements ISqsEmailQueue {
  private readonly client: SQSClient;

  constructor(private readonly config: NotificationsConfig) {
    this.client = new SQSClient({ region: config.sesRegion });
  }

  async enqueue(msg: EmailSendMessage): Promise<void> {
    const command = new SendMessageCommand({
      QueueUrl: this.config.sqsQueueUrl,
      MessageBody: JSON.stringify(msg),
    });
    await this.client.send(command);
  }

  async receive(): Promise<SqsEnvelope[]> {
    const command = new ReceiveMessageCommand({
      QueueUrl: this.config.sqsQueueUrl,
      MaxNumberOfMessages: this.config.sqsMaxMessages,
      VisibilityTimeout: this.config.sqsVisibilityTimeoutSec,
      // Long-polling: wait up to 20 seconds for messages to arrive, reducing empty polls
      WaitTimeSeconds: 20,
    });
    const result = await this.client.send(command);
    const messages = result.Messages ?? [];
    return messages.map((m) => ({
      messageId: m.MessageId ?? '',
      receiptHandle: m.ReceiptHandle ?? '',
      body: m.Body ?? '',
    }));
  }

  async delete(receiptHandle: string): Promise<void> {
    const command = new DeleteMessageCommand({
      QueueUrl: this.config.sqsQueueUrl,
      ReceiptHandle: receiptHandle,
    });
    await this.client.send(command);
  }
}
