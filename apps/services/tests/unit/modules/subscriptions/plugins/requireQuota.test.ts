import type { FastifyRequest } from 'fastify';

jest.mock('../../../../../src/shared/infrastructure/db.js', () => ({ db: {} }));

const mockExecute = jest.fn();

jest.mock('../../../../../src/modules/subscriptions/repositories/subscriptionDBRepository.js', () => ({
  SubscriptionDBRepository: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../../../../src/modules/subscriptions/repositories/usageCounterDBRepository.js', () => ({
  UsageCounterDBRepository: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../../../../src/modules/subscriptions/useCases/requireQuotaUseCase.js', () => ({
  RequireQuotaUseCase: jest.fn().mockImplementation(() => ({ execute: mockExecute })),
}));

import { requireQuota } from '../../../../../src/modules/subscriptions/plugins/requireQuota.js';
import { QuotaExceededError } from '../../../../../src/shared/errors.js';

function makeRequest(userId = 'user-001', orgId: string | null = null): FastifyRequest {
  return { userId, orgId } as unknown as FastifyRequest;
}

beforeEach(() => {
  jest.clearAllMocks();
});

// T019 — R003, R005, R006
describe('requireQuota preHandler — allow path (R003, R005, R006)', () => {
  it('WHEN use case resolves THEN preHandler resolves without throwing', async () => {
    mockExecute.mockResolvedValue(undefined);
    const request = makeRequest();

    await expect(requireQuota('api_requests')(request)).resolves.toBeUndefined();
  });

  it('WHEN quota is unlimited for plan THEN preHandler resolves without throwing', async () => {
    // Use case handles unlimited quota internally and resolves
    mockExecute.mockResolvedValue(undefined);
    const request = makeRequest();

    await expect(requireQuota('some_unlimited_quota')(request)).resolves.toBeUndefined();
  });

  it('WHEN orgId is set THEN use case is called with userId and orgId', async () => {
    mockExecute.mockResolvedValue(undefined);
    const request = makeRequest('user-001', 'org-001');

    await requireQuota('api_requests')(request);

    expect(mockExecute).toHaveBeenCalledWith('user-001', 'org-001', 'api_requests', request);
  });
});

// T012 — R003, R004, EC001, EC002
describe('requireQuota preHandler — passes request to use case (R003, R004)', () => {
  it('WHEN requireQuota preHandler is invoked THEN useCase.execute is called with four arguments (userId, orgId, quotaName, request)', async () => {
    mockExecute.mockResolvedValue(undefined);
    const request = makeRequest('user-001', null);

    await requireQuota('api_requests')(request);

    expect(mockExecute).toHaveBeenCalledWith('user-001', null, 'api_requests', request);
    expect(mockExecute.mock.calls[0]).toHaveLength(4);
  });

  it('WHEN the use case decorates request.quotaReservations THEN the field is readable on the same request object (R004)', async () => {
    mockExecute.mockImplementation((_userId: unknown, _orgId: unknown, _name: unknown, req: unknown) => {
      (req as Record<string, unknown>).quotaReservations = {
        api_requests: { reserved: 5, charged: 5, rowKey: { userId: 'user-001', orgId: null, periodStart: '2026-06-01T00:00:00.000Z' } },
      };
      return Promise.resolve(undefined);
    });
    const request = makeRequest();

    await requireQuota('api_requests')(request);

    const reservations = (request as unknown as Record<string, unknown>).quotaReservations as Record<string, { reserved: number; charged: number }>;
    expect(reservations).toBeDefined();
    expect(reservations['api_requests']!.reserved).toBe(5);
    expect(reservations['api_requests']!.charged).toBe(5);
  });
});

// T020 — R004, NF001
describe('requireQuota preHandler — deny path (R004, NF001)', () => {
  it('WHEN use case throws QuotaExceededError THEN preHandler propagates it', async () => {
    const err = new QuotaExceededError('api_requests', 101, 80, 100, '2026-07-01T00:00:00.000Z');
    mockExecute.mockRejectedValue(err);
    const request = makeRequest();

    await expect(requireQuota('api_requests')(request)).rejects.toThrow(QuotaExceededError);
  });

  it('WHEN called twice on same request THEN execute is called twice (no per-request caching)', async () => {
    mockExecute.mockResolvedValue(undefined);
    const request = makeRequest();

    await requireQuota('api_requests')(request);
    await requireQuota('api_requests')(request);

    expect(mockExecute).toHaveBeenCalledTimes(2);
  });
});
