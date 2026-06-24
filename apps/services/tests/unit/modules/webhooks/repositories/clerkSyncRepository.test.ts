import { ClerkSyncRepository } from '../../../../../src/modules/webhooks/repositories/clerkSyncRepository.js';
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

function makeSqlMock(returnValue: unknown = []) {
  const mockFn = jest.fn().mockResolvedValue(returnValue);
  const sql = Object.assign(
    (strings: TemplateStringsArray, ..._values: unknown[]) => mockFn(strings, ..._values),
    mockFn,
  );
  return { sql, mockFn };
}

// T030 — ClerkSyncRepository methods accept logger and emit through it (R003, R004, NF001, EC003)

describe('ClerkSyncRepository.upsertUser — logger (R003, R004, NF001, EC003)', () => {
  it('WHEN upsertUser is called THEN calls logger.info at least once', async () => {
    const { sql } = makeSqlMock([]);
    const repo = new ClerkSyncRepository(sql as never);
    const fakeLogger = makeLogger();

    await repo.upsertUser(
      { clerkUserId: 'user_001', email: 'alice@example.com', name: 'Alice', avatarUrl: null },
      fakeLogger,
    );

    expect(fakeLogger.info).toHaveBeenCalledTimes(1);
  });
});

describe('ClerkSyncRepository.upsertOrganization — logger (R003, R004, NF001, EC003)', () => {
  it('WHEN upsertOrganization is called THEN calls logger.info at least once', async () => {
    const { sql } = makeSqlMock([]);
    const repo = new ClerkSyncRepository(sql as never);
    const fakeLogger = makeLogger();

    await repo.upsertOrganization(
      { clerkOrgId: 'org_001', name: 'Acme', slug: 'acme' },
      fakeLogger,
    );

    expect(fakeLogger.info).toHaveBeenCalledTimes(1);
  });
});

describe('ClerkSyncRepository.createMembership — user found and org found (R003, R004, NF001, EC003)', () => {
  it('WHEN both user and org exist THEN calls logger.info at least once', async () => {
    const userRow = { id: 'local-user-uuid' };
    const orgRow = { id: 'local-org-uuid' };

    // First call: SELECT user → [userRow]; Second call: SELECT org → [orgRow]; Third call: INSERT → []
    const mockFn = jest.fn()
      .mockResolvedValueOnce([userRow])
      .mockResolvedValueOnce([orgRow])
      .mockResolvedValueOnce([]);
    const sql = Object.assign(
      (strings: TemplateStringsArray, ..._values: unknown[]) => mockFn(strings, ..._values),
      mockFn,
    );

    const repo = new ClerkSyncRepository(sql as never);
    const fakeLogger = makeLogger();

    await repo.createMembership(
      { clerkUserId: 'user_001', clerkOrgId: 'org_001', role: 'admin' },
      fakeLogger,
    );

    expect(fakeLogger.info).toHaveBeenCalledTimes(3);
  });
});

describe('ClerkSyncRepository.createMembership — user not found (R003, EC003)', () => {
  it('WHEN user is not found THEN calls logger.warn and returns without inserting membership', async () => {
    const { sql, mockFn } = makeSqlMock([]);
    // First call: SELECT user → []
    mockFn.mockResolvedValueOnce([]);

    const repo = new ClerkSyncRepository(sql as never);
    const fakeLogger = makeLogger();

    await repo.createMembership(
      { clerkUserId: 'user_missing', clerkOrgId: 'org_001', role: 'admin' },
      fakeLogger,
    );

    expect(fakeLogger.warn).toHaveBeenCalledTimes(1);
    // Only one SQL call (SELECT user); membership INSERT was skipped
    expect(mockFn).toHaveBeenCalledTimes(1);
  });
});

describe('ClerkSyncRepository.createMembership — org not found (R003, EC003)', () => {
  it('WHEN org is not found THEN calls logger.warn and returns without inserting membership', async () => {
    const userRow = { id: 'local-user-uuid' };

    const mockFn = jest.fn()
      .mockResolvedValueOnce([userRow]) // SELECT user → found
      .mockResolvedValueOnce([]);        // SELECT org → not found

    const sql = Object.assign(
      (strings: TemplateStringsArray, ..._values: unknown[]) => mockFn(strings, ..._values),
      mockFn,
    );

    const repo = new ClerkSyncRepository(sql as never);
    const fakeLogger = makeLogger();

    await repo.createMembership(
      { clerkUserId: 'user_001', clerkOrgId: 'org_missing', role: 'member' },
      fakeLogger,
    );

    expect(fakeLogger.warn).toHaveBeenCalledTimes(1);
    // Two SQL calls (SELECT user, SELECT org); INSERT was skipped
    expect(mockFn).toHaveBeenCalledTimes(2);
  });
});
