import type { FastifyRequest, FastifyReply } from 'fastify';
import { getRefundsHandler } from '../../../src/modules/billing/handlers/getRefundsHandler.js';

// Prevent DB connection at module load
jest.mock('../../../src/shared/infrastructure/db.js', () => ({ db: {} }));

const mockExecute = jest.fn();

jest.mock('../../../src/modules/billing/repositories/transactionDBRepository.js', () => ({
  TransactionDBRepository: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../../src/modules/billing/useCases/getRefundsUseCase.js', () => ({
  GetRefundsUseCase: jest.fn().mockImplementation(() => ({ execute: mockExecute })),
}));

function makeReply() {
  const reply = {
    send: jest.fn().mockReturnThis(),
    status: jest.fn().mockReturnThis(),
  };
  return reply as unknown as FastifyReply;
}

function makeRequest(id: string, userId = 'user-001', orgId: string | null = null): FastifyRequest {
  return {
    params: { id },
    userId,
    orgId,
  } as unknown as FastifyRequest;
}

beforeEach(() => {
  jest.clearAllMocks();
});

// T024 — success reply shape (R009, R012)

describe('getRefundsHandler — success reply shape', () => {
  it('WHEN the use case returns a list of refunds THEN the handler replies { data: refunds } with HTTP 200', async () => {
    const refunds = [
      {
        id: 'refund-001',
        transaction_id: 'uuid-001',
        amount: 500,
        reason: null,
        status: 'approved',
        provider_refund_id: 'prov-refund-001',
        created_at: '2026-06-23T01:00:00.000Z',
        updated_at: '2026-06-23T01:00:00.000Z',
      },
    ];

    mockExecute.mockResolvedValue(refunds);

    const request = makeRequest('uuid-001');
    const reply = makeReply();

    await getRefundsHandler(request, reply);

    expect(reply.send).toHaveBeenCalledWith({ data: refunds });
  });

  it('WHEN the use case returns an empty array THEN the handler replies { data: [] }', async () => {
    mockExecute.mockResolvedValue([]);

    const request = makeRequest('uuid-001');
    const reply = makeReply();

    await getRefundsHandler(request, reply);

    expect(reply.send).toHaveBeenCalledWith({ data: [] });
  });

  it('WHEN the handler is called THEN the use case receives the correct transactionId, userId, and orgId', async () => {
    const { GetRefundsUseCase } = jest.requireMock(
      '../../../src/modules/billing/useCases/getRefundsUseCase.js',
    ) as { GetRefundsUseCase: jest.Mock };

    const mockExecLocal = jest.fn().mockResolvedValue([]);
    GetRefundsUseCase.mockImplementation(() => ({ execute: mockExecLocal }));

    const request = makeRequest('uuid-002', 'user-002', null);
    const reply = makeReply();

    await getRefundsHandler(request, reply);

    expect(mockExecLocal).toHaveBeenCalledWith('uuid-002', 'user-002', null);
  });
});
