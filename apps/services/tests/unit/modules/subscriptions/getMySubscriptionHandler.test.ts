import type { FastifyRequest, FastifyReply } from 'fastify';
import { getMySubscriptionHandler } from '../../../../src/modules/subscriptions/handlers/getMySubscriptionHandler.js';
import type { SubscriptionEntity } from '../../../../src/modules/subscriptions/entities/subscriptionEntity.js';

jest.mock('../../../../src/shared/infrastructure/db.js', () => ({ db: {} }));

const mockExecute = jest.fn();

jest.mock('../../../../src/modules/subscriptions/repositories/subscriptionDBRepository.js', () => ({
  SubscriptionDBRepository: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../../../src/modules/subscriptions/useCases/getMySubscriptionUseCase.js', () => ({
  GetMySubscriptionUseCase: jest.fn().mockImplementation(() => ({ execute: mockExecute })),
}));

const activeSubscription: SubscriptionEntity = {
  id: 'sub-001',
  user_id: 'user-001',
  org_id: null,
  plan_id: 'plan-free-001',
  provider: 'mobbex',
  provider_subscription_id: null,
  status: 'active',
  current_period_start: null,
  current_period_end: null,
  cancel_at_period_end: false,
  canceled_at: null,
  trial_ends_at: null,
  created_at: '2026-06-24T00:00:00.000Z',
  updated_at: '2026-06-24T00:00:00.000Z',
};

function makeReply() {
  return {
    send: jest.fn().mockReturnThis(),
    status: jest.fn().mockReturnThis(),
  } as unknown as FastifyReply;
}

function makeRequest(userId = 'user-001', orgId: string | null = null): FastifyRequest {
  return {
    userId,
    orgId,
  } as unknown as FastifyRequest;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getMySubscriptionHandler — response shape (R011)', () => {
  it('WHEN use case returns a subscription THEN replies with { subscription }', async () => {
    mockExecute.mockResolvedValue(activeSubscription);

    const request = makeRequest();
    const reply = makeReply();

    await getMySubscriptionHandler(request, reply);

    expect(reply.send).toHaveBeenCalledWith({ subscription: activeSubscription });
  });

  it('WHEN use case returns null THEN replies with { subscription: null }', async () => {
    mockExecute.mockResolvedValue(null);

    const request = makeRequest();
    const reply = makeReply();

    await getMySubscriptionHandler(request, reply);

    expect(reply.send).toHaveBeenCalledWith({ subscription: null });
  });

  it('WHEN handler is called THEN passes userId and orgId to use case', async () => {
    mockExecute.mockResolvedValue(null);

    const request = makeRequest('user-002', 'org-001');
    const reply = makeReply();

    await getMySubscriptionHandler(request, reply);

    expect(mockExecute).toHaveBeenCalledWith('user-002', 'org-001');
  });
});
