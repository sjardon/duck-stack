// Mock subscriptionsConfig to control signupMode
jest.mock('../../../../../src/shared/configs/subscriptionsConfig.js', () => ({
  subscriptionsConfig: {
    signupMode: 'free_trial',
    freeTrialDays: 14,
    strictEntitlementsOnPastDue: false,
  },
}));

// Mock SubscriptionDBRepository
const mockTransitionExpiredTrials = jest.fn();
const mockFindActiveByScopeStatus = jest.fn();

jest.mock('../../../../../src/modules/subscriptions/repositories/subscriptionDBRepository.js', () => ({
  SubscriptionDBRepository: jest.fn().mockImplementation(() => ({
    transitionExpiredTrials: mockTransitionExpiredTrials,
    findActiveByScopeStatus: mockFindActiveByScopeStatus,
  })),
}));

jest.mock('../../../../../src/shared/infrastructure/db.js', () => ({ db: {} }));

import { requireActiveSubscription } from '../../../../../src/modules/subscriptions/plugins/requireActiveSubscription.js';
import { subscriptionsConfig } from '../../../../../src/shared/configs/subscriptionsConfig.js';
import { TrialExpiredError } from '../../../../../src/shared/errors.js';
import type { FastifyRequest } from 'fastify';
import type { SubscriptionEntity } from '../../../../../src/modules/subscriptions/entities/subscriptionEntity.js';

const mockConfig = subscriptionsConfig as { signupMode: string };

function makeRequest(userId?: string, orgId?: string | null): FastifyRequest {
  return {
    userId,
    orgId: orgId ?? null,
  } as unknown as FastifyRequest;
}


const activeSubscription: SubscriptionEntity = {
  id: 'sub-001',
  user_id: 'user-001',
  org_id: null,
  plan_id: 'plan-enterprise',
  provider: 'internal',
  provider_subscription_id: null,
  status: 'active',
  current_period_start: new Date().toISOString(),
  current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  cancel_at_period_end: false,
  canceled_at: null,
  trial_ends_at: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const trialingSubscription: SubscriptionEntity = {
  ...activeSubscription,
  id: 'sub-trial-001',
  status: 'trialing',
  trial_ends_at: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
};

beforeEach(() => {
  jest.clearAllMocks();
  mockConfig.signupMode = 'free_trial';
  mockTransitionExpiredTrials.mockResolvedValue(null);
  mockFindActiveByScopeStatus.mockResolvedValue(null);
});

// T032 — R007, EC001: blocks expired-trial scopes
describe('requireActiveSubscription — blocks expired-trial scopes (R007, EC001)', () => {
  it('WHEN signupMode is free_trial and no active/trialing subscription exists THEN throws TrialExpiredError', async () => {
    mockTransitionExpiredTrials.mockResolvedValue(null);
    mockFindActiveByScopeStatus.mockResolvedValue(null);

    const request = makeRequest('user-001', null);

    await expect(requireActiveSubscription(request)).rejects.toBeInstanceOf(TrialExpiredError);
  });

  it('WHEN signupMode is freemium THEN the preHandler resolves without any DB call', async () => {
    mockConfig.signupMode = 'freemium';

    const request = makeRequest('user-001', null);

    await expect(requireActiveSubscription(request)).resolves.toBeUndefined();
    expect(mockTransitionExpiredTrials).not.toHaveBeenCalled();
    expect(mockFindActiveByScopeStatus).not.toHaveBeenCalled();
  });

  it('WHEN request has no userId THEN the preHandler skips (unauthenticated request)', async () => {
    const request = makeRequest(undefined, null);

    await expect(requireActiveSubscription(request)).resolves.toBeUndefined();
    expect(mockTransitionExpiredTrials).not.toHaveBeenCalled();
  });
});

// T033 — R007, R008: allows active and trialing scopes
describe('requireActiveSubscription — allows active and trialing scopes (R007, R008)', () => {
  it('WHEN subscription has status active THEN preHandler resolves without throwing', async () => {
    mockFindActiveByScopeStatus.mockResolvedValue(activeSubscription);

    const request = makeRequest('user-001', null);

    await expect(requireActiveSubscription(request)).resolves.toBeUndefined();
  });

  it('WHEN subscription has status trialing THEN preHandler resolves without throwing', async () => {
    mockFindActiveByScopeStatus.mockResolvedValue(trialingSubscription);

    const request = makeRequest('user-001', null);

    await expect(requireActiveSubscription(request)).resolves.toBeUndefined();
  });
});
