import { z } from 'zod';

// R004: validates the outer SNS envelope shape before signature verification is attempted.
export const SnsNotificationSchema = z.object({
  Type: z.enum(['Notification', 'SubscriptionConfirmation', 'UnsubscribeConfirmation']),
  MessageId: z.string().min(1),
  TopicArn: z.string().min(1),
  Message: z.string(),
  Signature: z.string().min(1),
  SignatureVersion: z.string().min(1),
  SigningCertURL: z.string().min(1),
  SubscribeURL: z.string().optional(),
  Subject: z.string().optional(),
  UnsubscribeURL: z.string().optional(),
});

export type SnsNotificationDto = z.infer<typeof SnsNotificationSchema>;
