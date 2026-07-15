// Mock the static logger so we can spy on its methods
jest.mock('../../../../src/shared/infrastructure/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import { IdentityDBRepository } from '../../../../src/shared/repositories/identityDBRepository.js';
import { ProviderError } from '../../../../src/shared/errors.js';
import { logger } from '../../../../src/shared/infrastructure/logger.js';

const mockLogger = logger as unknown as {
  info: jest.Mock;
  warn: jest.Mock;
  error: jest.Mock;
};

function makeSqlMock(returnValue: unknown = []) {
  const mockFn = jest.fn().mockResolvedValue(returnValue);
  const sql = Object.assign(
    (strings: TemplateStringsArray, ..._values: unknown[]) => mockFn(strings, ..._values),
    mockFn,
  );
  return { sql, mockFn };
}

function makeRejectingSqlMock(error: Error) {
  const mockFn = jest.fn().mockRejectedValue(error);
  const sql = Object.assign(
    (strings: TemplateStringsArray, ..._values: unknown[]) => mockFn(strings, ..._values),
    mockFn,
  );
  return { sql, mockFn };
}

beforeEach(() => {
  jest.clearAllMocks();
});

// T007 — R001, R002, R006: IdentityDBRepository lookups
describe('IdentityDBRepository.findUserIdByClerkUserId', () => {
  it('WHEN a row matches THEN returns the row id', async () => {
    const { sql } = makeSqlMock([{ id: 'internal-user-001' }]);
    const repo = new IdentityDBRepository(sql as never);

    const result = await repo.findUserIdByClerkUserId('clerk_abc');

    expect(result).toBe('internal-user-001');
  });

  it('WHEN no row matches THEN returns null', async () => {
    const { sql } = makeSqlMock([]);
    const repo = new IdentityDBRepository(sql as never);

    const result = await repo.findUserIdByClerkUserId('clerk_missing');

    expect(result).toBeNull();
  });

  it('WHEN sql rejects THEN logs the error and re-throws ProviderError', async () => {
    const rawError = new Error('connection refused');
    const { sql } = makeRejectingSqlMock(rawError);
    const repo = new IdentityDBRepository(sql as never);

    let thrown: unknown;
    try {
      await repo.findUserIdByClerkUserId('clerk_abc');
    } catch (e) {
      thrown = e;
    }

    expect(thrown).toBeInstanceOf(ProviderError);
    expect((thrown as ProviderError).statusCode).toBe(502);
    expect((thrown as ProviderError).originalError).toBe(rawError);
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        repository: 'IdentityDBRepository',
        method: 'findUserIdByClerkUserId',
      }),
      expect.any(String),
    );
  });
});

describe('IdentityDBRepository.findOrgIdByClerkOrgId', () => {
  it('WHEN a row matches THEN returns the row id', async () => {
    const { sql } = makeSqlMock([{ id: 'internal-org-001' }]);
    const repo = new IdentityDBRepository(sql as never);

    const result = await repo.findOrgIdByClerkOrgId('org_abc');

    expect(result).toBe('internal-org-001');
  });

  it('WHEN no row matches THEN returns null', async () => {
    const { sql } = makeSqlMock([]);
    const repo = new IdentityDBRepository(sql as never);

    const result = await repo.findOrgIdByClerkOrgId('org_missing');

    expect(result).toBeNull();
  });

  it('WHEN sql rejects THEN logs the error and re-throws ProviderError', async () => {
    const rawError = new Error('timeout');
    const { sql } = makeRejectingSqlMock(rawError);
    const repo = new IdentityDBRepository(sql as never);

    let thrown: unknown;
    try {
      await repo.findOrgIdByClerkOrgId('org_abc');
    } catch (e) {
      thrown = e;
    }

    expect(thrown).toBeInstanceOf(ProviderError);
    expect((thrown as ProviderError).statusCode).toBe(502);
    expect((thrown as ProviderError).originalError).toBe(rawError);
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        repository: 'IdentityDBRepository',
        method: 'findOrgIdByClerkOrgId',
      }),
      expect.any(String),
    );
  });
});
