import { z } from 'zod';

export const CancelSubscriptionBodySchema = z.object({
  atPeriodEnd: z.boolean().default(true),
});

export type CancelSubscriptionBodyType = z.infer<typeof CancelSubscriptionBodySchema>;
