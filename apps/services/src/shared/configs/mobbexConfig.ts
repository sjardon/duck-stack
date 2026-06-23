const env = process.env || {};

export const mobbexConfig = {
  webhookSecret: env.MOBBEX_WEBHOOK_SECRET,
};
