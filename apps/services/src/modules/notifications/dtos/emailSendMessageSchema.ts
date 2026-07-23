import { z } from 'zod';
import { EMAIL_TEMPLATE_IDS } from '../templates/emailTemplateRegistry.js';

// Loose validation of the deserialized SQS envelope (EC001): `variables` is checked as a
// generic record here — the compile-time contract per template (R002) already constrained
// what the producer could enqueue; this schema only guards against a malformed/poison message.
export const EmailSendMessageSchema = z.object({
  sendId: z.string().min(1),
  requestId: z.string().min(1),
  templateId: z.enum(EMAIL_TEMPLATE_IDS),
  variables: z.record(z.string(), z.unknown()),
  to: z.email(),
  userId: z.string().optional(),
});

export type EmailSendMessageDto = z.infer<typeof EmailSendMessageSchema>;
