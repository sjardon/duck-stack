import { z } from 'zod';

export const CheckoutBodySchema = z.object({
  amount: z.number().int().positive(),
  currency: z.enum(['ARS', 'USD']),
  description: z.string().min(1),
  items: z.array(z.unknown()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type CheckoutBodyType = z.infer<typeof CheckoutBodySchema>;

export const ListTransactionsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

export type ListTransactionsQueryType = z.infer<typeof ListTransactionsQuerySchema>;
