import { GetRefundsUseCase } from '../../../src/modules/billing/useCases/getRefundsUseCase.js';
import { NotFoundError, ForbiddenError } from '../../../src/shared/errors.js';
import type { ITransactionRepository } from '../../../src/modules/billing/repositories/interfaces/iTransactionRepository.js';
import type { TransactionEntity } from '../../../src/modules/billing/entities/transaction.entity.js';
import type { RefundEntity } from '../../../src/modules/billing/entities/refund.entity.js';

const userTransaction: TransactionEntity = {
  id: 'uuid-001',
  user_id: 'user-001',
  org_id: null,
  provider: 'mobbex',
  provider_transaction_id: 'ptx-001',
  amount: 1000,
  currency: 'ARS',
  status: 'approved',
  description: 'Test checkout',
  reference: 'ref-001',
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
  reference: 'ref-002',
};

const refundEntity: RefundEntity = {
  id: 'refund-001',
  transaction_id: 'uuid-001',
  amount: 500,
  reason: 'Customer request',
  status: 'approved',
  provider_refund_id: 'prov-refund-001',
  created_at: '2026-06-23T01:00:00.000Z',
  updated_at: '2026-06-23T01:00:00.000Z',
};

function makeRepo(
  transaction: TransactionEntity | null,
  refunds: RefundEntity[] = [],
): ITransactionRepository {
  return {
    create: jest.fn(),
    findById: jest.fn().mockResolvedValue(transaction),
    findByIdempotencyKey: jest.fn(),
    updateFailureReason: jest.fn(),
    updateProviderData: jest.fn(),
    list: jest.fn(),
    getRefundsByTransactionId: jest.fn().mockResolvedValue(refunds),
  } as unknown as ITransactionRepository;
}

// T020 — found and owned returns refund list (R009, EC007)

describe('GetRefundsUseCase — found and owned returns refund list', () => {
  it('WHEN findById returns a transaction owned by the requester and getRefundsByTransactionId returns an array THEN execute returns that array', async () => {
    const repo = makeRepo(userTransaction, [refundEntity]);
    const useCase = new GetRefundsUseCase(repo);

    const result = await useCase.execute('uuid-001', 'user-001', null);

    expect(result).toEqual([refundEntity]);
    expect(repo.getRefundsByTransactionId).toHaveBeenCalledWith('uuid-001');
  });

  it('WHEN the transaction exists but has no refunds THEN execute returns an empty array (EC007)', async () => {
    const repo = makeRepo(userTransaction, []);
    const useCase = new GetRefundsUseCase(repo);

    const result = await useCase.execute('uuid-001', 'user-001', null);

    expect(result).toEqual([]);
  });

  it('WHEN requester has orgId and transaction org_id matches THEN execute returns the refund list', async () => {
    const repo = makeRepo(orgTransaction, [refundEntity]);
    const useCase = new GetRefundsUseCase(repo);

    const result = await useCase.execute('uuid-002', 'user-001', 'org-001');

    expect(result).toEqual([refundEntity]);
  });
});

// T021 — transaction not found (R010)

describe('GetRefundsUseCase — transaction not found', () => {
  it('WHEN findById returns null THEN execute throws NotFoundError with statusCode 404 and code NOT_FOUND', async () => {
    const repo = makeRepo(null);
    const useCase = new GetRefundsUseCase(repo);

    await expect(useCase.execute('nonexistent', 'user-001', null)).rejects.toThrow(NotFoundError);
    await expect(useCase.execute('nonexistent', 'user-001', null)).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
    });
  });
});

// T022 — wrong owner (R011)

describe('GetRefundsUseCase — wrong owner', () => {
  it('WHEN transaction user_id differs from requester THEN execute throws ForbiddenError with statusCode 403 and code FORBIDDEN', async () => {
    const repo = makeRepo(userTransaction);
    const useCase = new GetRefundsUseCase(repo);

    await expect(useCase.execute('uuid-001', 'user-999', null)).rejects.toThrow(ForbiddenError);
    await expect(useCase.execute('uuid-001', 'user-999', null)).rejects.toMatchObject({
      statusCode: 403,
      code: 'FORBIDDEN',
    });
  });

  it('WHEN requester has orgId but transaction org_id differs THEN execute throws ForbiddenError', async () => {
    const repo = makeRepo(orgTransaction);
    const useCase = new GetRefundsUseCase(repo);

    await expect(useCase.execute('uuid-002', 'user-001', 'org-999')).rejects.toThrow(ForbiddenError);
  });

  it('WHEN requester has no orgId but transaction has org_id THEN execute throws ForbiddenError', async () => {
    const repo = makeRepo(orgTransaction);
    const useCase = new GetRefundsUseCase(repo);

    await expect(useCase.execute('uuid-002', 'user-001', null)).rejects.toThrow(ForbiddenError);
  });
});
