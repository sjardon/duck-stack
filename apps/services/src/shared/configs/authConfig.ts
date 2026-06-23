const env = process.env || {};

export const authConfig = {
  clerkJwtKey: env.CLERK_JWT_KEY,
  clerkWebhookSigningSecret: env.CLERK_WEBHOOK_SIGNING_SECRET,
};
