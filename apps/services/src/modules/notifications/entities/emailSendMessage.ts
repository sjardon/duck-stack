import type { EmailTemplateId, EmailTemplateVariables } from '../templates/emailTemplateRegistry.js';

// The SQS message envelope — the wire format between the producer (SqsEmailNotifier) and the worker.
export interface EmailSendMessage<K extends EmailTemplateId = EmailTemplateId> {
  sendId: string;
  requestId: string;
  templateId: K;
  variables: EmailTemplateVariables[K];
  to: string;
  userId?: string;
}
