import { UserDBRepository } from '../../../../../src/modules/users/repositories/userDBRepository.js';
import { ProviderError, NotFoundError } from '../../../../../src/shared/errors.js';

// Mock the static logger so we can spy on its methods
jest.mock('../../../../../src/shared/infrastructure/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

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
  // The tagged template call (sql`...`) should reject.
  // The helper call (sql(updates, columns)) must return a sync sentinel (not a rejected promise)
  // to avoid unhandled rejections when the value is interpolated inside a tagged template.
  const taggedFn = jest.fn().mockRejectedValue(error);
  const helperFn = jest.fn().mockReturnValue('__mock_helper__');
  const sql = Object.assign(
    (strings: TemplateStringsArray | unknown, ..._values: unknown[]): unknown => {
      if (Array.isArray(strings) && 'raw' in (strings as object)) {
        // Called as a tagged template literal
        return taggedFn(strings, ..._values);
      }
      // Called as a helper (e.g. sql(updates, columns))
      return helperFn(strings, ..._values);
    },
    taggedFn,
    { taggedFn, helperFn },
  );
  return { sql, mockFn: taggedFn };
}

beforeEach(() => {
  jest.clearAllMocks();
});

// T001 — findByClerkUserId error path

describe('UserDBRepository.findByClerkUserId — SQL error path (R001, R002, R007, NF001, NF002, NF003)', () => {
  it('WHEN sql rejects with a raw Error THEN logger.error is called with repository and method name', async () => {
    const rawError = new Error('connection refused');
    const { sql } = makeRejectingSqlMock(rawError);
    const repo = new UserDBRepository(sql as never);

    await expect(repo.findByClerkUserId('clerk-001')).rejects.toThrow();

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        repository: 'UserDBRepository',
        method: 'findByClerkUserId',
      }),
      expect.any(String),
    );
  });

  it('WHEN sql rejects THEN re-throws ProviderError with statusCode 502 and originalError set', async () => {
    const rawError = new Error('timeout');
    const { sql } = makeRejectingSqlMock(rawError);
    const repo = new UserDBRepository(sql as never);

    let thrown: unknown;
    try {
      await repo.findByClerkUserId('clerk-001');
    } catch (e) {
      thrown = e;
    }

    expect(thrown).toBeInstanceOf(ProviderError);
    expect((thrown as ProviderError).statusCode).toBe(502);
    expect((thrown as ProviderError).originalError).toBe(rawError);
  });
});

// T001 — updatePreferences error path

describe('UserDBRepository.updatePreferences — SQL error path (R001, R002, R003, R007, NF001, NF002, NF003)', () => {
  it('WHEN sql rejects with a raw Error THEN logger.error is called with repository and method name', async () => {
    const rawError = new Error('db down');
    const { sql } = makeRejectingSqlMock(rawError);
    const repo = new UserDBRepository(sql as never);

    await expect(repo.updatePreferences('clerk-001', { locale: 'en' })).rejects.toThrow();

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        repository: 'UserDBRepository',
        method: 'updatePreferences',
      }),
      expect.any(String),
    );
  });

  it('WHEN sql rejects THEN re-throws ProviderError with statusCode 502 and originalError set', async () => {
    const rawError = new Error('deadlock');
    const { sql } = makeRejectingSqlMock(rawError);
    const repo = new UserDBRepository(sql as never);

    let thrown: unknown;
    try {
      await repo.updatePreferences('clerk-001', { locale: 'en' });
    } catch (e) {
      thrown = e;
    }

    expect(thrown).toBeInstanceOf(ProviderError);
    expect((thrown as ProviderError).statusCode).toBe(502);
    expect((thrown as ProviderError).originalError).toBe(rawError);
  });

  it('WHEN updatePreferences throws NotFoundError (domain error) THEN re-throws unchanged without wrapping', async () => {
    // SQL returns empty rows — updatePreferences throws NotFoundError internally
    const { sql } = makeSqlMock([]);
    const repo = new UserDBRepository(sql as never);

    let thrown: unknown;
    try {
      await repo.updatePreferences('clerk-001', { locale: 'en' });
    } catch (e) {
      thrown = e;
    }

    expect(thrown).toBeInstanceOf(NotFoundError);
    // logger.error should NOT be called for a domain error
    expect(mockLogger.error).not.toHaveBeenCalled();
  });
});

// T001 — completeOnboarding error path

describe('UserDBRepository.completeOnboarding — SQL error path (R001, R002, R003, R007, NF001, NF002, NF003)', () => {
  it('WHEN sql rejects with a raw Error THEN logger.error is called with repository and method name', async () => {
    const rawError = new Error('network error');
    const { sql } = makeRejectingSqlMock(rawError);
    const repo = new UserDBRepository(sql as never);

    await expect(
      repo.completeOnboarding('clerk-001', {
        job_role: 'engineer',
        company_size: '50-200',
        primary_use_case: 'analytics',
      }),
    ).rejects.toThrow();

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        repository: 'UserDBRepository',
        method: 'completeOnboarding',
      }),
      expect.any(String),
    );
  });

  it('WHEN sql rejects THEN re-throws ProviderError with statusCode 502 and originalError set', async () => {
    const rawError = new Error('timeout');
    const { sql } = makeRejectingSqlMock(rawError);
    const repo = new UserDBRepository(sql as never);

    let thrown: unknown;
    try {
      await repo.completeOnboarding('clerk-001', {
        job_role: 'engineer',
        company_size: '50-200',
        primary_use_case: 'analytics',
      });
    } catch (e) {
      thrown = e;
    }

    expect(thrown).toBeInstanceOf(ProviderError);
    expect((thrown as ProviderError).statusCode).toBe(502);
    expect((thrown as ProviderError).originalError).toBe(rawError);
  });

  it('WHEN completeOnboarding throws NotFoundError (domain error) THEN re-throws unchanged without wrapping', async () => {
    // SQL returns empty rows — completeOnboarding throws NotFoundError internally
    const { sql } = makeSqlMock([]);
    const repo = new UserDBRepository(sql as never);

    let thrown: unknown;
    try {
      await repo.completeOnboarding('clerk-001', {
        job_role: 'engineer',
        company_size: '50-200',
        primary_use_case: 'analytics',
      });
    } catch (e) {
      thrown = e;
    }

    expect(thrown).toBeInstanceOf(NotFoundError);
    expect(mockLogger.error).not.toHaveBeenCalled();
  });
});
