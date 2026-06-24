import { z } from 'zod';

export const UpdateProfileBody = z
  .object({
    locale: z.string().nullable().optional(),
    timezone: z.string().nullable().optional(),
  })
  .strict();

export type UpdateProfileBodyType = z.infer<typeof UpdateProfileBody>;
