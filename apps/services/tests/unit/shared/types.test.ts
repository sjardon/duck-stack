// T003 — NF005: @repo/types SubscriptionStatusValue includes 'trialing'
// and Subscription has trial_ends_at / days_remaining fields

import type { SubscriptionStatusValue, Subscription } from '@repo/types';

describe('@repo/types — SubscriptionStatusValue includes trialing (NF005)', () => {
  it('WHEN status is trialing THEN it is assignable to SubscriptionStatusValue without a type error', () => {
    const status: SubscriptionStatusValue = 'trialing';
    expect(status).toBe('trialing');
  });

  it('WHEN Subscription has trial_ends_at THEN it accepts string or null', () => {
    const sub: Subscription = {
      id: 'sub-001',
      user_id: 'user-001',
      org_id: null,
      plan_id: 'plan-001',
      provider: 'internal',
      provider_subscription_id: null,
      status: 'trialing',
      current_period_start: null,
      current_period_end: null,
      cancel_at_period_end: false,
      canceled_at: null,
      trial_ends_at: '2026-07-15T00:00:00.000Z',
      created_at: '2026-07-01T00:00:00.000Z',
      updated_at: '2026-07-01T00:00:00.000Z',
    };
    expect(sub.trial_ends_at).toBe('2026-07-15T00:00:00.000Z');
  });

  it('WHEN Subscription has days_remaining THEN it accepts a number', () => {
    const sub: Subscription = {
      id: 'sub-001',
      user_id: 'user-001',
      org_id: null,
      plan_id: 'plan-001',
      provider: 'internal',
      provider_subscription_id: null,
      status: 'trialing',
      current_period_start: null,
      current_period_end: null,
      cancel_at_period_end: false,
      canceled_at: null,
      trial_ends_at: '2026-07-15T00:00:00.000Z',
      days_remaining: 14,
      created_at: '2026-07-01T00:00:00.000Z',
      updated_at: '2026-07-01T00:00:00.000Z',
    };
    expect(sub.days_remaining).toBe(14);
  });
});
