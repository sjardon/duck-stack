const env = process.env;

export const subscriptionsConfig = {
  strictEntitlementsOnPastDue: env.STRICT_ENTITLEMENTS_ON_PAST_DUE === 'true',
};
