const env = process.env || {};

export const emailConfig = {
  resendApiKey: env.RESEND_API_KEY ?? '',
  senderEmail: env.EMAIL_SENDER_ADDRESS ?? '',
};
