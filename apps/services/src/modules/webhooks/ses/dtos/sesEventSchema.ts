import { z } from 'zod';

// R003: only the fields needed to correlate and classify the event are validated strictly;
// all other SES event fields are passed through untouched.
export const SesEventSchema = z
  .object({
    eventType: z.string(),
    mail: z.object({ messageId: z.string() }).passthrough(),
    // R002, EC001: bounceType discriminates permanent vs. transient bounces; only the recipient
    // addresses are needed to feed the suppression list.
    bounce: z
      .object({
        bounceType: z.string().optional(),
        bouncedRecipients: z.array(z.object({ emailAddress: z.string() }).passthrough()).optional(),
      })
      .passthrough()
      .optional(),
    complaint: z
      .object({
        complainedRecipients: z.array(z.object({ emailAddress: z.string() }).passthrough()).optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export type SesEventDto = z.infer<typeof SesEventSchema>;
