import { GetTransactionUseCase } from '../../../src/modules/billing/useCases/getTransactionUseCase.js';
import { NotFoundError, ForbiddenError } from '../../../src/shared/errors.js';
import type { ITransactionRepository } from '../../../src/modules/billing/repositories/interfaces/iTransactionRepository.js';
import type { TransactionEntity } from '../../../src/modules/billing/entities/transaction.entity.js';

const userTransaction: TransactionEntity = {
  id: 'uuid-001',
  user_id: 'user-001',
  org_id: null,
  provider: 'mobbex',
  provider_transaction_id: null,
  amount: 1000,
  currency: 'ARS',
  status: 'pending',
  description: 'Test checkout',
  reference: 'uuid-001',
  idempotency_key: null,
  metadata: null,
  failure_reason: null,
  checkout_url: null,
  created_at: '2026-06-23T00:00:00.000Z',
  updated_at: '2026-06-23T00:00:00.000Z',
};

const orgTransaction: TransactionEntity = {
  ...userTransaction,
  id: 'uuid-002',
  user_id: 'user-001',
  org_id: 'org-001',
  reference: 'uuid-002',
};

function makeRepo(findByIdResult: TransactionEntity | null): ITransactionRepository {
  return {
    create: jest.fn(),
    findById: jest.fn().mockResolvedValue(findByIdResult),
    findByIdempotencyKey: jest.fn(),
    updateFailureReason: jest.fn(),
    updateProviderData: jest.fn(),
    list: jest.fn(),
  } as unknown as ITransactionRepository;
}

describe('GetTransactionUseCase — found and owned by user (R006)', () => {
  it('WHEN transaction exists and user_id matches requester (no orgId) THEN returns the full record', async () => {
    const repo = makeRepo(userTransaction);
    const useCase = new GetTransactionUseCase(repo);

    const result = await useCase.execute('uuid-001', 'user-001', null);

    expect(result).toEqual(userTransaction);
  });
});

describe('GetTransactionUseCase — not found (R007)', () => {
  it('WHEN transaction does not exist THEN throws NotFoundError (404)', async () => {
    const repo = makeRepo(null);
    const useCase = new GetTransactionUseCase(repo);

    await expect(useCase.execute('nonexistent', 'user-001', null)).rejects.toThrow(NotFoundError);
    await expect(useCase.execute('nonexistent', 'user-001', null)).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
    });
  });
});

describe('GetTransactionUseCase — wrong owner (R008)', () => {
  it('WHEN transaction user_id differs from requester THEN throws ForbiddenError (403)', async () => {
    const repo = makeRepo(userTransaction);
    const useCase = new GetTransactionUseCase(repo);

    await expect(useCase.execute('uuid-001', 'user-999', null)).rejects.toThrow(ForbiddenError);
    await expect(useCase.execute('uuid-001', 'user-999', null)).rejects.toMatchObject({
      statusCode: 403,
      code: 'FORBIDDEN',
    });
  });
});

describe('GetTransactionUseCase — org-scoped ownership (R008, EC005)', () => {
  it('WHEN requester has orgId and transaction org_id matches THEN returns the record', async () => {
    const repo = makeRepo(orgTransaction);
    const useCase = new GetTransactionUseCase(repo);

    const result = await useCase.execute('uuid-002', 'user-001', 'org-001');

    expect(result).toEqual(orgTransaction);
  });

  it('WHEN requester has orgId but transaction org_id differs THEN throws ForbiddenError', async () => {
    const repo = makeRepo(orgTransaction);
    const useCase = new GetTransactionUseCase(repo);

    await expect(useCase.execute('uuid-002', 'user-001', 'org-999')).rejects.toThrow(ForbiddenError);
  });
});
