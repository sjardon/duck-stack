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
