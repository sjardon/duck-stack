import type { FastifyRequest } from 'fastify';
import type { EntitlementName } from '@repo/types';

jest.mock('../../../../../src/shared/infrastructure/db.js', () => ({ db: {} }));

const mockExecute = jest.fn();

jest.mock('../../../../../src/modules/subscriptions/repositories/subscriptionDBRepository.js', () => ({
  SubscriptionDBRepository: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../../../../src/modules/subscriptions/useCases/getEntitlementsUseCase.js', () => ({
  GetEntitlementsUseCase: jest.fn().mockImplementation(() => ({ execute: mockExecute })),
}));

import { requireEntitlement } from '../../../../../src/modules/subscriptions/plugins/requireEntitlement.js';
import { EntitlementRequiredError } from '../../../../../src/shared/errors.js';

function makeRequest(entitlements?: EntitlementName[]): FastifyRequest {
  return {
    userId: 'user-001',
    orgId: null,
    entitlements,
  } as unknown as FastifyRequest;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('requireEntitlement — allow when entitlement present (R003)', () => {
  it('WHEN entitlement is present THEN preHandler resolves without throwing', async () => {
    mockExecute.mockResolvedValue(['advanced_analytics', 'api_access']);
    const request = makeRequest();

    await expect(requireEntitlement('advanced_analytics')(request)).resolves.toBeUndefined();
  });
});

describe('requireEntitlement — deny when entitlement absent (R004)', () => {
  it('WHEN entitlement is absent THEN throws EntitlementRequiredError', async () => {
    mockExecute.mockResolvedValue(['api_access']);
    const request = makeRequest();

    await expect(requireEntitlement('team_collaboration')(request)).rejects.toThrow(EntitlementRequiredError);
  });

  it('WHEN entitlements are empty (free plan) THEN throws EntitlementRequiredError', async () => {
    mockExecute.mockResolvedValue([]);
    const request = makeRequest();

    await expect(requireEntitlement('advanced_analytics')(request)).rejects.toThrow(EntitlementRequiredError);
  });
});

describe('requireEntitlement — NF001: caches entitlements per request', () => {
  it('WHEN called twice on the same request THEN use case execute is called only once', async () => {
    mockExecute.mockResolvedValue(['advanced_analytics', 'api_access']);
    const request = makeRequest();

    await requireEntitlement('advanced_analytics')(request);
    await requireEntitlement('api_access')(request);

    expect(mockExecute).toHaveBeenCalledTimes(1);
  });

  it('WHEN request.entitlements is already set THEN does not call use case again', async () => {
    const request = makeRequest(['advanced_analytics', 'api_access']);

    await requireEntitlement('advanced_analytics')(request);

    expect(mockExecute).not.toHaveBeenCalled();
  });
});
