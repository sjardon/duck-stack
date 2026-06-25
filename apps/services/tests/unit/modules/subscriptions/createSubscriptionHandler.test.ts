import type { FastifyRequest, FastifyReply } from 'fastify';
import { createSubscriptionHandler } from '../../../../src/modules/subscriptions/handlers/createSubscriptionHandler.js';

jest.mock('../../../../src/shared/infrastructure/db.js', () => ({ db: {} }));
jest.mock('../../../../src/modules/billing/providers/resolveProvider.js', () => ({
  resolveProvider: jest.fn().mockReturnValue({}),
}));

const mockExecute = jest.fn();

jest.mock('../../../../src/modules/subscriptions/repositories/subscriptionDBRepository.js', () => ({
  SubscriptionDBRepository: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../../../src/modules/subscriptions/useCases/createSubscriptionUseCase.js', () => ({
  CreateSubscriptionUseCase: jest.fn().mockImplementation(() => ({ execute: mockExecute })),
}));

function makeReply() {
  return {
    send: jest.fn().mockReturnThis(),
    status: jest.fn().mockReturnThis(),
  } as unknown as FastifyReply;
}

function makeRequest(body: unknown, userId = 'user-001', orgId: string | null = null): FastifyRequest {
  return {
    body,
    userId,
    orgId,
  } as unknown as FastifyRequest;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('createSubscriptionHandler — Zod validation gating (NF001)', () => {
  it('WHEN body is missing planCode THEN replies 400 VALIDATION_ERROR without calling use case', async () => {
    const request = makeRequest({});
    const reply = makeReply();

    await createSubscriptionHandler(request, reply);

    expect(reply.status).toHaveBeenCalledWith(400);
    expect(reply.send).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'VALIDATION_ERROR' }),
    );
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it('WHEN planCode is an empty string THEN replies 400 VALIDATION_ERROR', async () => {
    const request = makeRequest({ planCode: '' });
    const reply = makeReply();

    await createSubscriptionHandler(request, reply);

    expect(reply.status).toHaveBeenCalledWith(400);
    expect(mockExecute).not.toHaveBeenCalled();
  });
});

describe('createSubscriptionHandler — happy path (R003)', () => {
  it('WHEN body is valid THEN calls use case and returns the result', async () => {
    const useCaseResult = { subscriptionId: 'sub-001' };
    mockExecute.mockResolvedValue(useCaseResult);

    const request = makeRequest({ planCode: 'free' });
    const reply = makeReply();

    await createSubscriptionHandler(request, reply);

    expect(mockExecute).toHaveBeenCalledWith('user-001', null, { planCode: 'free' });
    expect(reply.send).toHaveBeenCalledWith(useCaseResult);
  });

  it('WHEN body is valid and plan is paid THEN returns checkoutUrl and subscriptionId', async () => {
    const useCaseResult = {
      subscriptionId: 'sub-002',
      checkoutUrl: 'https://mobbex.com/pay/sub-002',
    };
    mockExecute.mockResolvedValue(useCaseResult);

    const request = makeRequest({ planCode: 'pro' });
    const reply = makeReply();

    await createSubscriptionHandler(request, reply);

    expect(reply.send).toHaveBeenCalledWith(useCaseResult);
  });
});
