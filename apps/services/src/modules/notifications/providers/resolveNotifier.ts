import type { EmailNotifier } from '@repo/types';
import { ResendEmailNotifier } from './resendEmailNotifier.js';
import { emailConfig } from '../../../shared/configs/emailConfig.js';

// Singleton — built once at first call; runtime env changes are ignored, mirroring
// resolveProvider.ts (billing).
let cachedNotifier: EmailNotifier | undefined;

export function resolveNotifier(): EmailNotifier {
  if (cachedNotifier !== undefined) {
    return cachedNotifier;
  }

  cachedNotifier = createResendEmailNotifier();
  return cachedNotifier;
}

function createResendEmailNotifier(): ResendEmailNotifier {
  const { resendApiKey, senderEmail } = emailConfig;

  if (!resendApiKey) {
    throw new Error('Missing required env var: RESEND_API_KEY');
  }

  if (!senderEmail) {
    throw new Error('Missing required env var: EMAIL_SENDER_ADDRESS');
  }

  return new ResendEmailNotifier({
    apiKey: resendApiKey,
    senderEmail,
  });
}
