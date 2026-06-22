import { z } from 'zod';

export const CompleteOnboardingBody = z
  .object({
    job_role: z.string().min(1),
    company_size: z.string().min(1),
    primary_use_case: z.string().min(1),
  })
  .strict();

export type CompleteOnboardingBodyType = z.infer<typeof CompleteOnboardingBody>;
