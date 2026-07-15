import { createClerkClient } from '@clerk/backend';
import type { ClerkClient } from '@clerk/backend';

const secretKey = process.env.CLERK_SECRET_KEY;

if (!secretKey) {
  throw new Error(
    'CLERK_SECRET_KEY environment variable is missing. ' +
      'Set it before starting the services application.',
  );
}

export const clerkClient: ClerkClient = createClerkClient({ secretKey });
