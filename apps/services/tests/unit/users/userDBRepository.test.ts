import { UserDBRepository } from '../../../src/modules/users/repositories/userDBRepository.js';
import type { UserProfile } from '@repo/types';
import type { BaseLogger } from 'pino';

function makeLogger(): BaseLogger {
  return {
    trace: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    fatal: jest.fn(),
    silent: jest.fn(),
    level: 'info',
    child: jest.fn(),
  } as unknown as BaseLogger;
}

const userProfileRow: UserProfile = {
  name: 'Alice',
  email: 'alice@example.com',
  avatar_url: null,
  locale: 'en',
  timezone: 'UTC',
  job_role: 'Engineer',
  company_size: '11-50',
  primary_use_case: 'Build internal tools',
  onboarding_completed: true,
};

function makeSqlMock(returnValue: unknown = [userProfileRow]) {
  const mockFn = jest.fn().mockResolvedValue(returnValue);
  const sql = Object.assign(
    (strings: TemplateStringsArray, ..._values: unknown[]) => mockFn(strings, ..._values),
    mockFn,
  );
  // Add sql() helper used in updatePreferences
  (sql as unknown as Record<string, unknown>)['sql'] = sql;
  return { sql, mockFn };
}

describe('UserDBRepository.findByClerkUserId — logger (R003, NF001, EC003)', () => {
  it('WHEN findByClerkUserId is called THEN calls logger.info at least once', async () => {
    const { sql } = makeSqlMock([userProfileRow]);
    const repo = new UserDBRepository(sql as never);
    const fakeLogger = makeLogger();

    await repo.findByClerkUserId('clerk_abc', fakeLogger);

    expect(fakeLogger.info).toHaveBeenCalledTimes(1);
  });

  it('WHEN findByClerkUserId returns no rows THEN returns null and calls logger.info', async () => {
    const { sql } = makeSqlMock([]);
    const repo = new UserDBRepository(sql as never);
    const fakeLogger = makeLogger();

    const result = await repo.findByClerkUserId('clerk_missing', fakeLogger);

    expect(result).toBeNull();
    expect(fakeLogger.info).toHaveBeenCalledTimes(1);
  });
});

describe('UserDBRepository.updatePreferences — logger (R003, NF001, EC003)', () => {
  it('WHEN updatePreferences is called THEN calls logger.info at least once', async () => {
    const { sql } = makeSqlMock([userProfileRow]);
    const repo = new UserDBRepository(sql as never);
    const fakeLogger = makeLogger();

    await repo.updatePreferences(
      'clerk_abc',
      { locale: 'es', timezone: 'America/Buenos_Aires' },
      fakeLogger,
    );

    expect(fakeLogger.info).toHaveBeenCalledTimes(1);
  });
});

describe('UserDBRepository.completeOnboarding — logger (R003, NF001, EC003)', () => {
  it('WHEN completeOnboarding is called THEN calls logger.info at least once', async () => {
    const { sql } = makeSqlMock([userProfileRow]);
    const repo = new UserDBRepository(sql as never);
    const fakeLogger = makeLogger();

    await repo.completeOnboarding(
      'clerk_abc',
      { job_role: 'Engineer', company_size: '11-50', primary_use_case: 'Build internal tools' },
      fakeLogger,
    );

    expect(fakeLogger.info).toHaveBeenCalledTimes(1);
  });
});
