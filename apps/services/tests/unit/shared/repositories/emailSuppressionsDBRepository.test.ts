// Mock the static logger so we can spy on its methods
jest.mock('../../../../src/shared/infrastructure/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import { EmailSuppressionsDBRepository } from '../../../../src/shared/repositories/emailSuppressionsDBRepository.js';

function makeSqlMock(returnValue: unknown = []) {
  const mockFn = jest.fn().mockResolvedValue(returnValue);
  const sql = Object.assign(
    (strings: TemplateStringsArray, ..._values: unknown[]) => mockFn(strings, ..._values),
    mockFn,
  );
  return { sql, mockFn };
}

beforeEach(() => {
  jest.clearAllMocks();
});

// T004 — R001, R005, NF002: upsert issues an idempotent INSERT ... ON CONFLICT ... DO UPDATE
describe('EmailSuppressionsDBRepository.upsert', () => {
  it('WHEN called THEN issues one INSERT INTO email_suppressions with ON CONFLICT (email) DO UPDATE and the given email/reason', async () => {
    const { sql, mockFn } = makeSqlMock([]);
    const repo = new EmailSuppressionsDBRepository(sql as never);

    await repo.upsert('ada@example.com', 'bounce');

    expect(mockFn).toHaveBeenCalledTimes(1);
    const [strings, ...values] = mockFn.mock.calls[0] as [TemplateStringsArray, ...unknown[]];
    const queryText = strings.join('?');
    expect(queryText).toMatch(/INSERT INTO\s+email_suppressions/i);
    expect(queryText).toMatch(/ON CONFLICT\s*\(email\)/i);
    expect(queryText).toMatch(/DO UPDATE/i);
    expect(values).toEqual(expect.arrayContaining(['ada@example.com', 'bounce']));
  });
});

// T005 — R001, NF001: isSuppressed queries by email and resolves a boolean based on row presence
describe('EmailSuppressionsDBRepository.isSuppressed', () => {
  it('WHEN called THEN issues a SELECT from email_suppressions keyed on the given email', async () => {
    const { sql, mockFn } = makeSqlMock([]);
    const repo = new EmailSuppressionsDBRepository(sql as never);

    await repo.isSuppressed('ada@example.com');

    expect(mockFn).toHaveBeenCalledTimes(1);
    const [strings, ...values] = mockFn.mock.calls[0] as [TemplateStringsArray, ...unknown[]];
    const queryText = strings.join('?');
    expect(queryText).toMatch(/SELECT/i);
    expect(queryText).toMatch(/FROM\s+email_suppressions/i);
    expect(queryText).toMatch(/WHERE\s+email\s*=/i);
    expect(values).toContain('ada@example.com');
  });

  it('WHEN the query returns a row THEN resolves true', async () => {
    const { sql } = makeSqlMock([{ email: 'ada@example.com' }]);
    const repo = new EmailSuppressionsDBRepository(sql as never);

    await expect(repo.isSuppressed('ada@example.com')).resolves.toBe(true);
  });

  it('WHEN the query returns no rows THEN resolves false', async () => {
    const { sql } = makeSqlMock([]);
    const repo = new EmailSuppressionsDBRepository(sql as never);

    await expect(repo.isSuppressed('ghost@example.com')).resolves.toBe(false);
  });
});
