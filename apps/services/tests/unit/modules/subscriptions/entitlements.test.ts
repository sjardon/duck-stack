import { PLAN_ENTITLEMENTS } from '../../../../src/modules/subscriptions/entitlements.js';

describe('PLAN_ENTITLEMENTS — mapping coverage (R001)', () => {
  it('WHEN PLAN_ENTITLEMENTS is imported THEN it has entries for free, pro, and business', () => {
    expect(PLAN_ENTITLEMENTS).toHaveProperty('free');
    expect(PLAN_ENTITLEMENTS).toHaveProperty('pro');
    expect(PLAN_ENTITLEMENTS).toHaveProperty('business');
  });

  it('WHEN free plan is looked up THEN it returns an empty array', () => {
    expect(PLAN_ENTITLEMENTS['free']).toEqual([]);
  });

  it('WHEN pro plan is looked up THEN it returns an array of EntitlementName values', () => {
    const proEntitlements = PLAN_ENTITLEMENTS['pro'];
    expect(Array.isArray(proEntitlements)).toBe(true);
    expect(proEntitlements.length).toBeGreaterThan(0);
    expect(proEntitlements).toContain('advanced_analytics');
    expect(proEntitlements).toContain('priority_support');
    expect(proEntitlements).toContain('api_access');
  });

  it('WHEN business plan is looked up THEN it returns a superset of pro entitlements', () => {
    const businessEntitlements = PLAN_ENTITLEMENTS['business'];
    const proEntitlements = PLAN_ENTITLEMENTS['pro'];
    expect(Array.isArray(businessEntitlements)).toBe(true);
    expect(businessEntitlements.length).toBeGreaterThanOrEqual(proEntitlements!.length);
    expect(businessEntitlements).toContain('team_collaboration');
    expect(businessEntitlements).toContain('white_label');
  });

  it('WHEN an unknown plan code is looked up THEN it returns undefined', () => {
    expect(PLAN_ENTITLEMENTS['unknown_plan']).toBeUndefined();
  });
});
