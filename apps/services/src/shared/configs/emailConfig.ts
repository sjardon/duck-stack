const env = process.env || {};

export const emailConfig = {
  sesRegion: env.SES_REGION ?? 'us-east-1',
  senderEmail: env.EMAIL_SENDER_ADDRESS ?? '',
};
