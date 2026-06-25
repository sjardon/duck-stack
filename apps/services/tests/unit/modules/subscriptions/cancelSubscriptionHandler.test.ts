import type { FastifyRequest, FastifyReply } from 'fastify';
import { cancelSubscriptionHandler } from '../../../../src/modules/subscriptions/handlers/cancelSubscriptionHandler.js';
import type { SubscriptionEntity } from '../../../../src/modules/subscriptions/entities/subscriptionEntity.js';

jest.mock('../../../../src/shared/infrastructure/db.js', () => ({ db: {} }));
jest.mock('../../../../src/modules/billing/providers/resolveProvider.js', () => ({
  resolveProvider: jest.fn().mockReturnValue({}),
}));

const mockExecute = jest.fn();

jest.mock('../../../../src/modules/subscriptions/repositories/subscriptionDBRepository.js', () => ({
  SubscriptionDBRepository: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../../../src/modules/subscriptions/useCases/cancelSubscriptionUseCase.js', () => ({
  CancelSubscriptionUseCase: jest.fn().mockImplementation(() => ({ execute: mockExecute })),
}));

const updatedSubscription: SubscriptionEntity = {
  id: 'sub-001',
  user_id: 'user-001',
  org_id: null,
  plan_id: 'plan-pro-001',
  provider: 'mobbex',
  provider_subscription_id: 'prov-sub-001',
  status: 'active',
  current_period_start: null,
  current_period_end: null,
  cancel_at_period_end: true,
  canceled_at: null,
  created_at: '2026-06-24T00:00:00.000Z',
  updated_at: '2026-06-24T00:00:00.000Z',
};

function makeReply() {
  return {
    send: jest.fn().mockReturnThis(),
    status: jest.fn().mockReturnThis(),
  } as unknown as FastifyReply;
}

function makeRequest(
  id: string,
  body: unknown,
  userId = 'user-001',
  orgId: string | null = null,
): FastifyRequest {
  return {
    params: { id },
    body,
    userId,
    orgId,
  } as unknown as FastifyRequest;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('cancelSubscriptionHandler — Zod validation gating (NF001)', () => {
  it('WHEN body has non-boolean atPeriodEnd THEN replies 400 VALIDATION_ERROR without calling use case', async () => {
    const request = makeRequest('sub-001', { atPeriodEnd: 'yes' });
    const reply = makeReply();

    await cancelSubscriptionHandler(request, reply);

    expect(reply.status).toHaveBeenCalledWith(400);
    expect(reply.send).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'VALIDATION_ERROR' }),
    );
    expect(mockExecute).not.toHaveBeenCalled();
  });
});

describe('cancelSubscriptionHandler — happy path (R008)', () => {
  it('WHEN body is valid with atPeriodEnd = true THEN calls use case and replies with subscription', async () => {
    mockExecute.mockResolvedValue(updatedSubscription);

    const request = makeRequest('sub-001', { atPeriodEnd: true });
    const reply = makeReply();

    await cancelSubscriptionHandler(request, reply);

    expect(mockExecute).toHaveBeenCalledWith('user-001', null, 'sub-001', { atPeriodEnd: true });
    expect(reply.send).toHaveBeenCalledWith({ subscription: updatedSubscription });
  });

  it('WHEN body is empty THEN defaults atPeriodEnd to true and calls use case', async () => {
    mockExecute.mockResolvedValue(updatedSubscription);

    const request = makeRequest('sub-001', {});
    const reply = makeReply();

    await cancelSubscriptionHandler(request, reply);

    expect(mockExecute).toHaveBeenCalledWith('user-001', null, 'sub-001', { atPeriodEnd: true });
    expect(reply.send).toHaveBeenCalledWith({ subscription: updatedSubscription });
  });

  it('WHEN atPeriodEnd = false THEN calls use case with atPeriodEnd false', async () => {
    const canceledSubscription: SubscriptionEntity = { ...updatedSubscription, status: 'canceled' };
    mockExecute.mockResolvedValue(canceledSubscription);

    const request = makeRequest('sub-001', { atPeriodEnd: false });
    const reply = makeReply();

    await cancelSubscriptionHandler(request, reply);

    expect(mockExecute).toHaveBeenCalledWith('user-001', null, 'sub-001', { atPeriodEnd: false });
    expect(reply.send).toHaveBeenCalledWith({ subscription: canceledSubscription });
  });
});
