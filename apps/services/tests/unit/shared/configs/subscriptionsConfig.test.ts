// T005 — R001, R002: SIGNUP_MODE and FREE_TRIAL_DAYS
describe('subscriptionsConfig — SIGNUP_MODE (R001)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('WHEN SIGNUP_MODE is absent THEN signupMode is freemium', async () => {
    delete process.env.SIGNUP_MODE;
    const { subscriptionsConfig } = await import('../../../../src/shared/configs/subscriptionsConfig.js');
    expect(subscriptionsConfig.signupMode).toBe('freemium');
  });

  it('WHEN SIGNUP_MODE is free_trial THEN signupMode is free_trial', async () => {
    process.env.SIGNUP_MODE = 'free_trial';
    const { subscriptionsConfig } = await import('../../../../src/shared/configs/subscriptionsConfig.js');
    expect(subscriptionsConfig.signupMode).toBe('free_trial');
  });

  it('WHEN SIGNUP_MODE is freemium THEN signupMode is freemium', async () => {
    process.env.SIGNUP_MODE = 'freemium';
    const { subscriptionsConfig } = await import('../../../../src/shared/configs/subscriptionsConfig.js');
    expect(subscriptionsConfig.signupMode).toBe('freemium');
  });
});

describe('subscriptionsConfig — FREE_TRIAL_DAYS (R002)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('WHEN FREE_TRIAL_DAYS is absent THEN freeTrialDays is 14', async () => {
    delete process.env.FREE_TRIAL_DAYS;
    const { subscriptionsConfig } = await import('../../../../src/shared/configs/subscriptionsConfig.js');
    expect(subscriptionsConfig.freeTrialDays).toBe(14);
  });

  it('WHEN FREE_TRIAL_DAYS is 7 THEN freeTrialDays is 7', async () => {
    process.env.FREE_TRIAL_DAYS = '7';
    const { subscriptionsConfig } = await import('../../../../src/shared/configs/subscriptionsConfig.js');
    expect(subscriptionsConfig.freeTrialDays).toBe(7);
  });

  it('WHEN FREE_TRIAL_DAYS is 30 THEN freeTrialDays is 30', async () => {
    process.env.FREE_TRIAL_DAYS = '30';
    const { subscriptionsConfig } = await import('../../../../src/shared/configs/subscriptionsConfig.js');
    expect(subscriptionsConfig.freeTrialDays).toBe(30);
  });
});

describe('subscriptionsConfig — STRICT_ENTITLEMENTS_ON_PAST_DUE (R002)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('WHEN STRICT_ENTITLEMENTS_ON_PAST_DUE is "true" THEN strictEntitlementsOnPastDue is true', async () => {
    process.env.STRICT_ENTITLEMENTS_ON_PAST_DUE = 'true';
    const { subscriptionsConfig } = await import('../../../../src/shared/configs/subscriptionsConfig.js');
    expect(subscriptionsConfig.strictEntitlementsOnPastDue).toBe(true);
  });

  it('WHEN STRICT_ENTITLEMENTS_ON_PAST_DUE is absent THEN strictEntitlementsOnPastDue is false', async () => {
    delete process.env.STRICT_ENTITLEMENTS_ON_PAST_DUE;
    const { subscriptionsConfig } = await import('../../../../src/shared/configs/subscriptionsConfig.js');
    expect(subscriptionsConfig.strictEntitlementsOnPastDue).toBe(false);
  });

  it('WHEN STRICT_ENTITLEMENTS_ON_PAST_DUE is "false" THEN strictEntitlementsOnPastDue is false', async () => {
    process.env.STRICT_ENTITLEMENTS_ON_PAST_DUE = 'false';
    const { subscriptionsConfig } = await import('../../../../src/shared/configs/subscriptionsConfig.js');
    expect(subscriptionsConfig.strictEntitlementsOnPastDue).toBe(false);
  });

  it('WHEN STRICT_ENTITLEMENTS_ON_PAST_DUE is "1" THEN strictEntitlementsOnPastDue is false', async () => {
    process.env.STRICT_ENTITLEMENTS_ON_PAST_DUE = '1';
    const { subscriptionsConfig } = await import('../../../../src/shared/configs/subscriptionsConfig.js');
    expect(subscriptionsConfig.strictEntitlementsOnPastDue).toBe(false);
  });
});
