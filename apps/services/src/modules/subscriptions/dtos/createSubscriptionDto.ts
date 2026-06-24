import { z } from 'zod';

export const CreateSubscriptionBodySchema = z.object({
  planCode: z.string().min(1),
});

export type CreateSubscriptionBodyType = z.infer<typeof CreateSubscriptionBodySchema>;
