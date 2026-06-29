import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

vi.mock('../../src/hooks/useQuota', () => ({
  useQuota: vi.fn(),
}));

vi.mock('../../src/hooks/use-billing', () => ({
  usePlans: vi.fn(),
  useMySubscription: vi.fn(),
}));

import { useQuota } from '../../src/hooks/useQuota';
import { usePlans, useMySubscription } from '../../src/hooks/use-billing';
import { QuotaGate } from '../../src/components/domain/billing/QuotaGate';

const mockUseQuota = useQuota as ReturnType<typeof vi.fn>;
const mockUsePlans = usePlans as ReturnType<typeof vi.fn>;
const mockUseMySubscription = useMySubscription as ReturnType<typeof vi.fn>;

const defaultNormalQuota = {
  count: 5,
  soft_limit: 80,
  hard_limit: 100,
  state: 'normal' as const,
  period_end: '2026-07-01T00:00:00Z',
  isLoading: false,
};

const plans = [
  {
    id: 'plan-free',
    code: 'free',
    name: 'Free',
    price: 0,
    currency: 'USD',
    interval: 'month' as const,
    features: [],
    is_active: true,
    description: '',
    provider_plan_id: null,
    created_at: '',
    updated_at: '',
  },
  {
    id: 'plan-pro',
    code: 'pro',
    name: 'Pro',
    price: 29,
    currency: 'USD',
    interval: 'month' as const,
    features: [],
    is_active: true,
    description: '',
    provider_plan_id: null,
    created_at: '',
    updated_at: '',
  },
];

const freePlanSubscription = {
  id: 'sub-1',
  user_id: 'user-1',
  org_id: null,
  plan_id: 'plan-free',
  provider: 'stripe',
  provider_subscription_id: null,
  status: 'active' as const,
  current_period_start: null,
  current_period_end: null,
  cancel_at_period_end: false,
  canceled_at: null,
  created_at: '',
  updated_at: '',
};

const proPlanSubscription = {
  ...freePlanSubscription,
  plan_id: 'plan-pro',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockUsePlans.mockReturnValue({ data: plans });
  mockUseMySubscription.mockReturnValue({ data: freePlanSubscription });
});

// T010 — R006, EC001: QuotaGate renders children when state is normal
describe('QuotaGate — renders children when state is normal (R006, EC001)', () => {
  it('WHEN useQuota returns state = normal THEN renders children without warning or blocked decoration', () => {
    mockUseQuota.mockReturnValue(defaultNormalQuota);

    render(
      React.createElement(
        QuotaGate,
        { name: 'api_calls' },
        React.createElement('div', null, 'protected content'),
      ),
    );

    expect(screen.getByText('protected content')).toBeDefined();
    expect(screen.queryByText(/You have reached the limit/i)).toBeNull();
    expect(screen.queryByText(/approaching/i)).toBeNull();
  });

  it('WHEN useQuota returns isLoading = true (state = normal) THEN renders children without blocking', () => {
    mockUseQuota.mockReturnValue({ ...defaultNormalQuota, isLoading: true });

    render(
      React.createElement(
        QuotaGate,
        { name: 'api_calls' },
        React.createElement('div', null, 'loading content'),
      ),
    );

    expect(screen.getByText('loading content')).toBeDefined();
    expect(screen.queryByText(/You have reached the limit/i)).toBeNull();
  });
});

// T011 — R004, R007: QuotaGate renders fallbackBlocked when hard_exceeded
describe('QuotaGate — renders blocked fallback when hard_exceeded (R004, R007)', () => {
  it('WHEN state = hard_exceeded AND fallbackBlocked is provided THEN renders fallbackBlocked', () => {
    mockUseQuota.mockReturnValue({
      ...defaultNormalQuota,
      state: 'hard_exceeded' as const,
    });

    render(
      React.createElement(
        QuotaGate,
        {
          name: 'api_calls',
          fallbackBlocked: React.createElement('div', null, 'custom blocked'),
        },
        React.createElement('div', null, 'protected content'),
      ),
    );

    expect(screen.getByText('custom blocked')).toBeDefined();
    expect(screen.queryByText('protected content')).toBeNull();
  });

  it('WHEN state = hard_exceeded AND fallbackBlocked is NOT provided THEN renders default blocked message', () => {
    mockUseQuota.mockReturnValue({
      ...defaultNormalQuota,
      state: 'hard_exceeded' as const,
    });

    render(
      React.createElement(
        QuotaGate,
        { name: 'api_calls' },
        React.createElement('div', null, 'protected content'),
      ),
    );

    expect(screen.queryByText('protected content')).toBeNull();
    expect(screen.getByText(/You have reached the limit of your plan/i)).toBeDefined();
  });
});

// T012 — R005, R007: QuotaGate renders children plus warning when soft_exceeded
describe('QuotaGate — renders children plus warning when soft_exceeded (R005, R007)', () => {
  it('WHEN state = soft_exceeded AND fallbackWarning is provided THEN renders children plus fallbackWarning', () => {
    mockUseQuota.mockReturnValue({
      ...defaultNormalQuota,
      state: 'soft_exceeded' as const,
    });

    render(
      React.createElement(
        QuotaGate,
        {
          name: 'api_calls',
          fallbackWarning: React.createElement('div', null, 'custom warning'),
        },
        React.createElement('div', null, 'protected content'),
      ),
    );

    expect(screen.getByText('protected content')).toBeDefined();
    expect(screen.getByText('custom warning')).toBeDefined();
  });

  it('WHEN state = soft_exceeded AND fallbackWarning is NOT provided THEN renders children plus default warning', () => {
    mockUseQuota.mockReturnValue({
      ...defaultNormalQuota,
      state: 'soft_exceeded' as const,
    });

    render(
      React.createElement(
        QuotaGate,
        { name: 'api_calls' },
        React.createElement('div', null, 'protected content'),
      ),
    );

    expect(screen.getByText('protected content')).toBeDefined();
    expect(screen.getByText(/approaching/i)).toBeDefined();
  });
});

// T013 — R007: hard_exceeded takes precedence
describe('QuotaGate — hard_exceeded takes precedence over soft_exceeded (R007)', () => {
  it('WHEN state = hard_exceeded THEN renders blocked branch and not soft-exceeded or normal branch', () => {
    mockUseQuota.mockReturnValue({
      ...defaultNormalQuota,
      state: 'hard_exceeded' as const,
    });

    render(
      React.createElement(
        QuotaGate,
        { name: 'api_calls' },
        React.createElement('div', null, 'protected content'),
      ),
    );

    expect(screen.queryByText('protected content')).toBeNull();
    expect(screen.queryByText(/approaching/i)).toBeNull();
    expect(screen.getByText(/You have reached the limit of your plan/i)).toBeDefined();
  });
});

// T014 — R008: upgrade CTA with next-plan link when not on top plan
describe('QuotaGate — renders upgrade CTA with next-plan link (R008)', () => {
  it('WHEN state = hard_exceeded and current plan is not the highest THEN default fallback contains upgrade link to next plan', () => {
    mockUseQuota.mockReturnValue({
      ...defaultNormalQuota,
      state: 'hard_exceeded' as const,
    });
    mockUseMySubscription.mockReturnValue({ data: freePlanSubscription });
    mockUsePlans.mockReturnValue({ data: plans });

    render(
      React.createElement(
        QuotaGate,
        { name: 'api_calls' },
        React.createElement('div', null, 'protected content'),
      ),
    );

    const upgradeLink = screen.getByRole('link', { name: /upgrade/i });
    expect(upgradeLink.getAttribute('href')).toBe('/billing/subscribe?plan=pro');
  });

  it('WHEN state = soft_exceeded and current plan is not the highest THEN default warning contains upgrade link to next plan', () => {
    mockUseQuota.mockReturnValue({
      ...defaultNormalQuota,
      state: 'soft_exceeded' as const,
    });
    mockUseMySubscription.mockReturnValue({ data: freePlanSubscription });
    mockUsePlans.mockReturnValue({ data: plans });

    render(
      React.createElement(
        QuotaGate,
        { name: 'api_calls' },
        React.createElement('div', null, 'protected content'),
      ),
    );

    const upgradeLinks = screen.getAllByRole('link', { name: /upgrade/i });
    expect(upgradeLinks.length).toBeGreaterThan(0);
    expect(upgradeLinks[0].getAttribute('href')).toBe('/billing/subscribe?plan=pro');
  });
});

// T015 — R009, EC003: top-plan message when on highest plan
describe('QuotaGate — renders top-plan message when on highest plan (R009, EC003)', () => {
  it('WHEN state = hard_exceeded and current plan is the highest THEN renders top-plan message and no upgrade link', () => {
    mockUseQuota.mockReturnValue({
      ...defaultNormalQuota,
      state: 'hard_exceeded' as const,
    });
    mockUseMySubscription.mockReturnValue({ data: proPlanSubscription });
    mockUsePlans.mockReturnValue({ data: plans });

    render(
      React.createElement(
        QuotaGate,
        { name: 'api_calls' },
        React.createElement('div', null, 'protected content'),
      ),
    );

    expect(
      screen.getByText(/You are on our highest plan — contact us for custom limits/i),
    ).toBeDefined();
    expect(screen.queryByRole('link', { name: /upgrade/i })).toBeNull();
  });

  it('WHEN state = soft_exceeded and current plan is the highest (EC003) THEN renders top-plan message and no upgrade link', () => {
    mockUseQuota.mockReturnValue({
      ...defaultNormalQuota,
      state: 'soft_exceeded' as const,
    });
    mockUseMySubscription.mockReturnValue({ data: proPlanSubscription });
    mockUsePlans.mockReturnValue({ data: plans });

    render(
      React.createElement(
        QuotaGate,
        { name: 'api_calls' },
        React.createElement('div', null, 'protected content'),
      ),
    );

    expect(
      screen.getByText(/You are on our highest plan — contact us for custom limits/i),
    ).toBeDefined();
    expect(screen.queryByRole('link', { name: /upgrade/i })).toBeNull();
  });

  it('WHEN state = hard_exceeded and current plan is removed from catalog (EC003) THEN renders top-plan message and no upgrade link', () => {
    mockUseQuota.mockReturnValue({
      ...defaultNormalQuota,
      state: 'hard_exceeded' as const,
    });
    // Subscription references a plan code not present in the catalog at all (legacy-plan)
    mockUseMySubscription.mockReturnValue({
      data: { ...freePlanSubscription, plan_id: 'legacy-plan' },
    });
    // Catalog only has free and pro — neither matches legacy-plan
    mockUsePlans.mockReturnValue({ data: plans });

    render(
      React.createElement(
        QuotaGate,
        { name: 'api_calls' },
        React.createElement('div', null, 'protected content'),
      ),
    );

    expect(
      screen.getByText(/You are on our highest plan — contact us for custom limits/i),
    ).toBeDefined();
    expect(screen.queryByRole('link', { name: /upgrade/i })).toBeNull();
  });

  it('WHEN state = soft_exceeded and current plan is removed from catalog (EC003) THEN renders top-plan message and no upgrade link', () => {
    mockUseQuota.mockReturnValue({
      ...defaultNormalQuota,
      state: 'soft_exceeded' as const,
    });
    // Subscription references a plan code not present in the catalog at all (legacy-plan)
    mockUseMySubscription.mockReturnValue({
      data: { ...freePlanSubscription, plan_id: 'legacy-plan' },
    });
    // Catalog only has free and pro — neither matches legacy-plan
    mockUsePlans.mockReturnValue({ data: plans });

    render(
      React.createElement(
        QuotaGate,
        { name: 'api_calls' },
        React.createElement('div', null, 'protected content'),
      ),
    );

    expect(
      screen.getByText(/You are on our highest plan — contact us for custom limits/i),
    ).toBeDefined();
    expect(screen.queryByRole('link', { name: /upgrade/i })).toBeNull();
  });
});
