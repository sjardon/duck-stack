export interface EmailSendMessage {
  requestId: string;
  userId?: string;
  templateId: string;
  to: string;
  variables: Record<string, unknown>;
  enqueuedAt: string;
}

export interface SqsEnvelope {
  messageId: string;
  receiptHandle: string;
  body: string;
}

export interface ISqsEmailQueue {
  enqueue(msg: EmailSendMessage): Promise<void>;
  receive(): Promise<SqsEnvelope[]>;
  delete(receiptHandle: string): Promise<void>;
}
