import { z } from 'zod';

export const EmailSendMessageSchema = z.object({
  requestId: z.string().uuid(),
  userId: z.string().optional(),
  templateId: z.string(),
  to: z.string().email(),
  variables: z.record(z.string(), z.unknown()),
  enqueuedAt: z.string().datetime(),
});

export type EmailSendMessage = z.infer<typeof EmailSendMessageSchema>;
