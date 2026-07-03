jest.mock('../../../../../src/shared/infrastructure/db.js', () => ({ db: {} }));

jest.mock('../../../../../src/modules/subscriptions/repositories/usageCounterDBRepository.js', () => ({
  UsageCounterDBRepository: jest.fn().mockImplementation(() => ({})),
}));

const mockUseCaseExecute = jest.fn();
jest.mock('../../../../../src/modules/subscriptions/useCases/chargeQuotaUseCase.js', () => ({
  ChargeQuotaUseCase: jest.fn().mockImplementation(() => ({ execute: mockUseCaseExecute })),
}));

import type { FastifyRequest } from 'fastify';
import { chargeQuota } from '../../../../../src/modules/subscriptions/helpers/chargeQuota.js';
import { ProgrammingError } from '../../../../../src/shared/errors.js';

function makeRequest(reservations: Record<string, { reserved: number; charged: number; rowKey: { userId: string | null; orgId: string | null; periodStart: string } }> | null = null): FastifyRequest {
  return { quotaReservations: reservations } as unknown as FastifyRequest;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUseCaseExecute.mockResolvedValue(50); // returns new charged value
});

// T016 — R005, R006, R007, R008
describe('chargeQuota helper — missing reservation (R006)', () => {
  it('WHEN request.quotaReservations is null THEN ProgrammingError is thrown', async () => {
    const request = makeRequest(null);

    await expect(chargeQuota(request, 'api_requests', 50)).rejects.toBeInstanceOf(ProgrammingError);
    expect(mockUseCaseExecute).not.toHaveBeenCalled();
  });

  it('WHEN request.quotaReservations does not contain the quota key THEN ProgrammingError is thrown', async () => {
    const request = makeRequest({});

    await expect(chargeQuota(request, 'api_requests', 50)).rejects.toBeInstanceOf(ProgrammingError);
    expect(mockUseCaseExecute).not.toHaveBeenCalled();
  });
});

describe('chargeQuota helper — single call (R005, R007)', () => {
  it('WHEN chargeQuota is called once with actual=50 THEN ChargeQuotaUseCase.execute is called with reservation and actual=50', async () => {
    const reservation = { reserved: 10, charged: 10, rowKey: { userId: 'user-001', orgId: null, periodStart: '2026-06-01T00:00:00.000Z' } };
    const request = makeRequest({ api_requests: reservation });

    await chargeQuota(request, 'api_requests', 50);

    expect(mockUseCaseExecute).toHaveBeenCalledWith(reservation, 'api_requests', 50);
  });

  it('WHEN chargeQuota is called THEN request.quotaReservations[name].charged is updated to actual (R007)', async () => {
    mockUseCaseExecute.mockResolvedValue(50);
    const reservation = { reserved: 10, charged: 10, rowKey: { userId: 'user-001', orgId: null, periodStart: '2026-06-01T00:00:00.000Z' } };
    const request = makeRequest({ api_requests: reservation });

    await chargeQuota(request, 'api_requests', 50);

    expect(request.quotaReservations!['api_requests']!.charged).toBe(50);
  });
});

describe('chargeQuota helper — incremental charging (R007)', () => {
  it('WHEN chargeQuota is called twice sequentially THEN charged is updated between calls', async () => {
    // Track the reservation.charged value at each call invocation
    const chargedAtCall: number[] = [];
    mockUseCaseExecute.mockImplementation((res: { charged: number }, _name: string, _actual: number) => {
      chargedAtCall.push(res.charged);
      return Promise.resolve(_actual);
    });

    const reservation = { reserved: 10, charged: 10, rowKey: { userId: 'user-001', orgId: null, periodStart: '2026-06-01T00:00:00.000Z' } };
    const request = makeRequest({ api_requests: reservation });

    await chargeQuota(request, 'api_requests', 30);
    // After first call, charged should be 30
    expect(request.quotaReservations!['api_requests']!.charged).toBe(30);

    await chargeQuota(request, 'api_requests', 60);
    // After second call, charged should be 60
    expect(request.quotaReservations!['api_requests']!.charged).toBe(60);

    // At the time of the first call, charged was 10
    expect(chargedAtCall[0]).toBe(10);
    // At the time of the second call, charged was 30 (updated by first call)
    expect(chargedAtCall[1]).toBe(30);
  });
});

describe('chargeQuota helper — no-call behavior (R008)', () => {
  it('WHEN chargeQuota is never called THEN quotaReservations[name].charged remains equal to reserved (R008 — passive)', () => {
    const reservation = { reserved: 10, charged: 10, rowKey: { userId: 'user-001', orgId: null, periodStart: '2026-06-01T00:00:00.000Z' } };
    const request = makeRequest({ api_requests: reservation });

    // No call to chargeQuota — reservation stands as the final cost
    expect(request.quotaReservations!['api_requests']!.charged).toBe(10);
    expect(request.quotaReservations!['api_requests']!.reserved).toBe(10);
  });
});
