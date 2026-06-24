import type { FastifyRequest, FastifyReply } from 'fastify';
import { checkoutHandler } from '../../../src/modules/billing/handlers/checkoutHandler.js';

// Prevent DB connection at module load
jest.mock('../../../src/shared/infrastructure/db.js', () => ({ db: {} }));

const mockExecute = jest.fn();

jest.mock('../../../src/modules/billing/repositories/transactionDBRepository.js', () => ({
  TransactionDBRepository: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../../src/modules/billing/useCases/checkoutUseCase.js', () => ({
  CheckoutUseCase: jest.fn().mockImplementation(() => ({ execute: mockExecute })),
}));

function makeReply() {
  const reply = {
    status: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
  };
  return reply as unknown as FastifyReply;
}

function makeRequest(body: unknown, userId = 'user-001', headers: Record<string, string> = {}): FastifyRequest {
  return {
    body,
    userId,
    orgId: null,
    headers,
    log: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  } as unknown as FastifyRequest;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockExecute.mockResolvedValue({
    checkoutUrl: 'https://mobbex.com/pay/session-001',
    transactionId: 'uuid-001',
  });
});

describe('checkoutHandler — Zod validation (NF001, EC006)', () => {
  it('WHEN body has amount <= 0 THEN replies 400 VALIDATION_ERROR', async () => {
    const request = makeRequest({ amount: 0, currency: 'ARS', description: 'Test' });
    const reply = makeReply();

    await checkoutHandler(request, reply);

    expect(reply.status).toHaveBeenCalledWith(400);
    expect(reply.send).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'VALIDATION_ERROR' }),
    );
  });

  it('WHEN currency is unsupported THEN replies 400 VALIDATION_ERROR', async () => {
    const request = makeRequest({ amount: 100, currency: 'EUR', description: 'Test' });
    const reply = makeReply();

    await checkoutHandler(request, reply);

    expect(reply.status).toHaveBeenCalledWith(400);
    expect(reply.send).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'VALIDATION_ERROR' }),
    );
  });

  it('WHEN description is empty THEN replies 400 VALIDATION_ERROR', async () => {
    const request = makeRequest({ amount: 100, currency: 'ARS', description: '' });
    const reply = makeReply();

    await checkoutHandler(request, reply);

    expect(reply.status).toHaveBeenCalledWith(400);
    expect(reply.send).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'VALIDATION_ERROR' }),
    );
  });
});

describe('checkoutHandler — valid body (R002, R004)', () => {
  it('WHEN body is valid THEN delegates to CheckoutUseCase.execute and replies with { checkoutUrl, transactionId }', async () => {
    const { CheckoutUseCase } = jest.requireMock(
      '../../../src/modules/billing/useCases/checkoutUseCase.js',
    ) as { CheckoutUseCase: jest.Mock };

    const mockExecLocal = jest.fn().mockResolvedValue({
      checkoutUrl: 'https://mobbex.com/pay/session-001',
      transactionId: 'uuid-001',
    });
    CheckoutUseCase.mockImplementation(() => ({ execute: mockExecLocal }));

    const request = makeRequest({ amount: 1000, currency: 'ARS', description: 'Test payment' });
    const reply = makeReply();

    await checkoutHandler(request, reply);

    expect(mockExecLocal).toHaveBeenCalledTimes(1);
    expect(reply.send).toHaveBeenCalledWith({
      checkoutUrl: 'https://mobbex.com/pay/session-001',
      transactionId: 'uuid-001',
    });
  });
});

describe('checkoutHandler — Idempotency-Key header passthrough (R012)', () => {
  it('WHEN Idempotency-Key header is present THEN passes it to CheckoutUseCase.execute', async () => {
    const { CheckoutUseCase } = jest.requireMock(
      '../../../src/modules/billing/useCases/checkoutUseCase.js',
    ) as { CheckoutUseCase: jest.Mock };

    const mockExecLocal = jest.fn().mockResolvedValue({
      checkoutUrl: 'https://mobbex.com/pay/session-001',
      transactionId: 'uuid-001',
    });
    CheckoutUseCase.mockImplementation(() => ({ execute: mockExecLocal }));

    const request = makeRequest(
      { amount: 1000, currency: 'ARS', description: 'Test payment' },
      'user-001',
      { 'idempotency-key': 'my-idem-key' },
    );
    const reply = makeReply();

    await checkoutHandler(request, reply);

    expect(mockExecLocal).toHaveBeenCalledWith(
      'user-001',
      null,
      expect.objectContaining({ amount: 1000 }),
      'my-idem-key',
      expect.anything(),
    );
  });
});
