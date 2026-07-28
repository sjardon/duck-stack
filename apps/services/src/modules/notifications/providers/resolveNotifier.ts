import type { EmailNotifier } from '@repo/types';
import { SesEmailNotifier } from './sesEmailNotifier.js';
import { emailConfig } from '../../../shared/configs/emailConfig.js';

// Singleton — built once at first call; runtime env changes are ignored, mirroring
// resolveProvider.ts (billing).
let cachedNotifier: EmailNotifier | undefined;

export function resolveNotifier(): EmailNotifier {
  if (cachedNotifier !== undefined) {
    return cachedNotifier;
  }

  cachedNotifier = createSesEmailNotifier();
  return cachedNotifier;
}

function createSesEmailNotifier(): SesEmailNotifier {
  const senderEmail = emailConfig.senderEmail;

  if (!senderEmail) {
    throw new Error('Missing required env var: EMAIL_SENDER_ADDRESS');
  }

  return new SesEmailNotifier({
    region: emailConfig.sesRegion,
    senderEmail,
  });
}
