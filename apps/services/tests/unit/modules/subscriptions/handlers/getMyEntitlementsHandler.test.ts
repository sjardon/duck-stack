import type { FastifyRequest, FastifyReply } from 'fastify';

jest.mock('../../../../../src/shared/infrastructure/db.js', () => ({ db: {} }));

const mockExecute = jest.fn();

jest.mock('../../../../../src/modules/subscriptions/repositories/subscriptionDBRepository.js', () => ({
  SubscriptionDBRepository: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../../../../src/modules/subscriptions/useCases/getEntitlementsUseCase.js', () => ({
  GetEntitlementsUseCase: jest.fn().mockImplementation(() => ({ execute: mockExecute })),
}));

import { getMyEntitlementsHandler } from '../../../../../src/modules/subscriptions/handlers/getMyEntitlementsHandler.js';

function makeReply() {
  return {
    send: jest.fn().mockReturnThis(),
    status: jest.fn().mockReturnThis(),
  } as unknown as FastifyReply;
}

function makeRequest(userId = 'user-001', orgId: string | null = null): FastifyRequest {
  return { userId, orgId } as unknown as FastifyRequest;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getMyEntitlementsHandler — response shape (R005)', () => {
  it('WHEN use case resolves THEN replies with { entitlements: EntitlementName[] }', async () => {
    const entitlements = ['advanced_analytics', 'api_access'];
    mockExecute.mockResolvedValue(entitlements);

    const request = makeRequest();
    const reply = makeReply();

    await getMyEntitlementsHandler(request, reply);

    expect(reply.send).toHaveBeenCalledWith({ entitlements });
  });

  it('WHEN use case resolves empty array THEN replies with { entitlements: [] }', async () => {
    mockExecute.mockResolvedValue([]);

    const request = makeRequest();
    const reply = makeReply();

    await getMyEntitlementsHandler(request, reply);

    expect(reply.send).toHaveBeenCalledWith({ entitlements: [] });
  });

  it('WHEN handler is called THEN passes userId and orgId from request to use case', async () => {
    mockExecute.mockResolvedValue([]);

    const request = makeRequest('user-002', 'org-001');
    const reply = makeReply();

    await getMyEntitlementsHandler(request, reply);

    expect(mockExecute).toHaveBeenCalledWith('user-002', 'org-001');
  });
});
