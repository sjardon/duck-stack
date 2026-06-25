// Mock the static logger so we can spy on its methods
jest.mock('../../../../../src/shared/infrastructure/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import { ClerkSyncRepository } from '../../../../../src/modules/webhooks/repositories/clerkSyncRepository.js';
import { ProviderError } from '../../../../../src/shared/errors.js';
import { logger } from '../../../../../src/shared/infrastructure/logger.js';

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

// T009 — upsertUser error path

describe('ClerkSyncRepository.upsertUser — SQL error path (R001, R002, R007, NF001, NF002, NF003)', () => {
  it('WHEN sql rejects THEN logger.error is called with repository: \'ClerkSyncRepository\' and method: \'upsertUser\'', async () => {
    const rawError = new Error('connection refused');
    const { sql } = makeRejectingSqlMock(rawError);
    const repo = new ClerkSyncRepository(sql as never);

    await expect(
      repo.upsertUser({ clerkUserId: 'clerk-001', email: 'a@b.com', name: 'Alice', avatarUrl: null }),
    ).rejects.toThrow();

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        repository: 'ClerkSyncRepository',
        method: 'upsertUser',
      }),
      expect.any(String),
    );
  });

  it('WHEN sql rejects THEN re-throws ProviderError with statusCode 502 and originalError set', async () => {
    const rawError = new Error('timeout');
    const { sql } = makeRejectingSqlMock(rawError);
    const repo = new ClerkSyncRepository(sql as never);

    let thrown: unknown;
    try {
      await repo.upsertUser({ clerkUserId: 'clerk-001', email: 'a@b.com', name: 'Alice', avatarUrl: null });
    } catch (e) {
      thrown = e;
    }

    expect(thrown).toBeInstanceOf(ProviderError);
    expect((thrown as ProviderError).statusCode).toBe(502);
    expect((thrown as ProviderError).originalError).toBe(rawError);
  });
});

// T009 — upsertOrganization error path

describe('ClerkSyncRepository.upsertOrganization — SQL error path (R001, R002, R007, NF001, NF002, NF003)', () => {
  it('WHEN sql rejects THEN logger.error is called with repository: \'ClerkSyncRepository\' and method: \'upsertOrganization\'', async () => {
    const rawError = new Error('db error');
    const { sql } = makeRejectingSqlMock(rawError);
    const repo = new ClerkSyncRepository(sql as never);

    await expect(
      repo.upsertOrganization({ clerkOrgId: 'org-001', name: 'Acme', slug: 'acme' }),
    ).rejects.toThrow();

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        repository: 'ClerkSyncRepository',
        method: 'upsertOrganization',
      }),
      expect.any(String),
    );
  });

  it('WHEN sql rejects THEN re-throws ProviderError with statusCode 502 and originalError set', async () => {
    const rawError = new Error('network failure');
    const { sql } = makeRejectingSqlMock(rawError);
    const repo = new ClerkSyncRepository(sql as never);

    let thrown: unknown;
    try {
      await repo.upsertOrganization({ clerkOrgId: 'org-001', name: 'Acme', slug: 'acme' });
    } catch (e) {
      thrown = e;
    }

    expect(thrown).toBeInstanceOf(ProviderError);
    expect((thrown as ProviderError).statusCode).toBe(502);
    expect((thrown as ProviderError).originalError).toBe(rawError);
  });
});

// T009 — createMembership error path

describe('ClerkSyncRepository.createMembership — SQL error path (R001, R002, R007, NF001, NF002, NF003)', () => {
  it('WHEN sql rejects THEN logger.error is called with repository: \'ClerkSyncRepository\' and method: \'createMembership\'', async () => {
    const rawError = new Error('query failed');
    const { sql } = makeRejectingSqlMock(rawError);
    const repo = new ClerkSyncRepository(sql as never);

    await expect(
      repo.createMembership({ clerkUserId: 'clerk-001', clerkOrgId: 'org-001', role: 'member' }),
    ).rejects.toThrow();

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        repository: 'ClerkSyncRepository',
        method: 'createMembership',
      }),
      expect.any(String),
    );
  });

  it('WHEN sql rejects THEN re-throws ProviderError with statusCode 502 and originalError set', async () => {
    const rawError = new Error('deadlock');
    const { sql } = makeRejectingSqlMock(rawError);
    const repo = new ClerkSyncRepository(sql as never);

    let thrown: unknown;
    try {
      await repo.createMembership({ clerkUserId: 'clerk-001', clerkOrgId: 'org-001', role: 'member' });
    } catch (e) {
      thrown = e;
    }

    expect(thrown).toBeInstanceOf(ProviderError);
    expect((thrown as ProviderError).statusCode).toBe(502);
    expect((thrown as ProviderError).originalError).toBe(rawError);
  });

  it('WHEN createMembership finds no user THEN returns early without entering the error catch (sentinel path preserved)', async () => {
    // First call (SELECT user) returns empty; should warn and return early, NOT enter catch
    const { sql } = makeSqlMock([]);
    const repo = new ClerkSyncRepository(sql as never);

    await expect(
      repo.createMembership({ clerkUserId: 'clerk-missing', clerkOrgId: 'org-001', role: 'member' }),
    ).resolves.toBeUndefined();

    expect(mockLogger.warn).toHaveBeenCalled();
    expect(mockLogger.error).not.toHaveBeenCalled();
  });
});
