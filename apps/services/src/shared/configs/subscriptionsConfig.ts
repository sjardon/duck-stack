const env = process.env;

export const subscriptionsConfig = {
  strictEntitlementsOnPastDue: env.STRICT_ENTITLEMENTS_ON_PAST_DUE === 'true',
  signupMode: (env.SIGNUP_MODE ?? 'freemium') as 'freemium' | 'free_trial',
  freeTrialDays: parseInt(env.FREE_TRIAL_DAYS ?? '14', 10),
};
