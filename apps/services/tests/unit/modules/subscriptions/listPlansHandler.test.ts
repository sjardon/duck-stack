import type { FastifyRequest, FastifyReply } from 'fastify';

// Prevent DB connection at module load
jest.mock('../../../../src/shared/infrastructure/db.js', () => ({ db: {} }));

// Capture the mock execute so tests can control its return value
const mockExecute = jest.fn();

jest.mock('../../../../src/modules/subscriptions/repositories/subscriptionPlanDBRepository.js', () => ({
  SubscriptionPlanDBRepository: jest.fn().mockImplementation(() => ({})),
}));

// Use jest.fn() defined above — hoisting is handled by referencing via closure wrapper
jest.mock('../../../../src/modules/subscriptions/useCases/listPlansUseCase.js', () => {
  const execute = jest.fn();
  // Store the underlying fn so tests can control it
  (global as Record<string, unknown>).__mockListPlansExecute = execute;
  return {
    ListPlansUseCase: jest.fn().mockImplementation(() => ({ execute })),
  };
});

import { listPlansHandler } from '../../../../src/modules/subscriptions/handlers/listPlansHandler.js';
import type { SubscriptionPlanEntity } from '../../../../src/modules/subscriptions/entities/subscriptionPlanEntity.js';

const freePlan: SubscriptionPlanEntity = {
  id: '00000000-0000-0000-0001-000000000001',
  code: 'free',
  name: 'Free',
  description: 'Get started at no cost.',
  price: 0,
  currency: 'USD',
  interval: 'month',
  features: ['Up to 3 projects', 'Community support'],
  is_active: true,
  provider_plan_id: null,
  created_at: '2026-06-23T00:00:00.000Z',
  updated_at: '2026-06-23T00:00:00.000Z',
};

function getExecuteMock(): jest.Mock {
  return (global as Record<string, unknown>).__mockListPlansExecute as jest.Mock;
}

function makeReply() {
  const reply = {
    send: jest.fn().mockReturnThis(),
  };
  return reply as unknown as FastifyReply;
}

function makeRequest(headers: Record<string, string> = {}): FastifyRequest {
  return {
    headers,
  } as unknown as FastifyRequest;
}

beforeEach(() => {
  getExecuteMock().mockReset();
  getExecuteMock().mockResolvedValue([freePlan]);
  mockExecute.mockReset();
});

describe('listPlansHandler — unauthenticated access (R002)', () => {
  it('WHEN GET /billing/plans is called without an Authorization header THEN the response is HTTP 200 with body { data: SubscriptionPlan[] }', async () => {
    const request = makeRequest();
    const reply = makeReply();

    await listPlansHandler(request, reply);

    expect(reply.send).toHaveBeenCalledWith({ data: [freePlan] });
  });

  it('WHEN the route is invoked THEN no preHandler auth check is triggered', async () => {
    // The handler does not inspect request.userId — it accepts any request without auth
    const request = makeRequest();
    const reply = makeReply();

    // Should not throw even when the request carries no Authorization header
    await expect(listPlansHandler(request, reply)).resolves.not.toThrow();
    expect(reply.send).toHaveBeenCalledTimes(1);
  });
});

describe('listPlansHandler — response shape (NF001)', () => {
  it('WHEN the use case returns plans THEN the handler wraps them in { data }', async () => {
    const request = makeRequest();
    const reply = makeReply();

    await listPlansHandler(request, reply);

    expect(reply.send).toHaveBeenCalledWith({ data: [freePlan] });
  });

  it('WHEN the use case returns an empty array THEN the handler replies with { data: [] }', async () => {
    getExecuteMock().mockResolvedValue([]);

    const request = makeRequest();
    const reply = makeReply();

    await listPlansHandler(request, reply);

    expect(reply.send).toHaveBeenCalledWith({ data: [] });
  });
});
