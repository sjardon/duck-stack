import { z } from 'zod';

// R003: only the fields needed to correlate and classify the event are validated strictly;
// all other SES event fields are passed through untouched.
export const SesEventSchema = z
  .object({
    eventType: z.string(),
    mail: z.object({ messageId: z.string() }).passthrough(),
  })
  .passthrough();

export type SesEventDto = z.infer<typeof SesEventSchema>;
