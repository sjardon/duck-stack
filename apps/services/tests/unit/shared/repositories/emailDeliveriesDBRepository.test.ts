// Mock the static logger so we can spy on its methods
jest.mock('../../../../src/shared/infrastructure/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import { EmailDeliveriesDBRepository } from '../../../../src/shared/repositories/emailDeliveriesDBRepository.js';

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

// T007 — R001: createQueued persists a queued record
describe('EmailDeliveriesDBRepository.createQueued', () => {
  it('WHEN called THEN issues one INSERT with state queued and the given id', async () => {
    const { sql, mockFn } = makeSqlMock([]);
    const repo = new EmailDeliveriesDBRepository(sql as never);

    await repo.createQueued({ id: 'send-001', templateId: 'example.ping', to: 'ada@example.com', userId: null });

    expect(mockFn).toHaveBeenCalledTimes(1);
    const [strings, ...values] = mockFn.mock.calls[0] as [TemplateStringsArray, ...unknown[]];
    const queryText = strings.join('?');
    expect(queryText).toMatch(/INSERT INTO\s+email_deliveries/i);
    expect(queryText).toMatch(/queued/i);
    expect(values).toContain('send-001');
  });
});

// T008 — R002, R005, NF002, EC003: recordProviderMessageId / markSent idempotency
describe('EmailDeliveriesDBRepository.recordProviderMessageId', () => {
  it('WHEN called THEN issues an UPDATE guarded by provider_message_id IS NULL', async () => {
    const { sql, mockFn } = makeSqlMock([]);
    const repo = new EmailDeliveriesDBRepository(sql as never);

    await repo.recordProviderMessageId('send-001', 'ses-msg-1');

    expect(mockFn).toHaveBeenCalledTimes(1);
    const [strings, ...values] = mockFn.mock.calls[0] as [TemplateStringsArray, ...unknown[]];
    const queryText = strings.join('?');
    expect(queryText).toMatch(/UPDATE\s+email_deliveries/i);
    expect(queryText).toMatch(/provider_message_id IS NULL/i);
    expect(values).toEqual(expect.arrayContaining(['send-001', 'ses-msg-1']));
  });

  it('WHEN the guard excludes every row (0 rows affected) THEN resolves without error', async () => {
    const { sql } = makeSqlMock([]);
    const repo = new EmailDeliveriesDBRepository(sql as never);

    await expect(repo.recordProviderMessageId('send-001', 'ses-msg-1')).resolves.toBeUndefined();
  });
});

describe('EmailDeliveriesDBRepository.markSent', () => {
  it("WHEN called THEN issues an UPDATE guarded by state = 'queued'", async () => {
    const { sql, mockFn } = makeSqlMock([]);
    const repo = new EmailDeliveriesDBRepository(sql as never);

    await repo.markSent('send-001');

    expect(mockFn).toHaveBeenCalledTimes(1);
    const [strings, ...values] = mockFn.mock.calls[0] as [TemplateStringsArray, ...unknown[]];
    const queryText = strings.join('?');
    expect(queryText).toMatch(/UPDATE\s+email_deliveries/i);
    expect(queryText).toMatch(/state\s*=\s*'queued'/i);
    expect(values).toContain('send-001');
  });

  it('WHEN the guard excludes every row (0 rows affected) THEN resolves without error', async () => {
    const { sql } = makeSqlMock([]);
    const repo = new EmailDeliveriesDBRepository(sql as never);

    await expect(repo.markSent('send-001')).resolves.toBeUndefined();
  });
});

// T009 — R004: markSuppressed transitions a queued record to the suppressed state
describe('EmailDeliveriesDBRepository.markSuppressed', () => {
  it("WHEN called THEN issues an UPDATE setting state = 'suppressed' guarded by state = 'queued' and the given id", async () => {
    const { sql, mockFn } = makeSqlMock([]);
    const repo = new EmailDeliveriesDBRepository(sql as never);

    await repo.markSuppressed('send-001');

    expect(mockFn).toHaveBeenCalledTimes(1);
    const [strings, ...values] = mockFn.mock.calls[0] as [TemplateStringsArray, ...unknown[]];
    const queryText = strings.join('?');
    expect(queryText).toMatch(/UPDATE\s+email_deliveries/i);
    expect(queryText).toMatch(/state\s*=\s*'suppressed'/i);
    expect(queryText).toMatch(/state\s*=\s*'queued'/i);
    expect(values).toContain('send-001');
  });

  it('WHEN the guard excludes every row (0 rows affected) THEN resolves without error', async () => {
    const { sql } = makeSqlMock([]);
    const repo = new EmailDeliveriesDBRepository(sql as never);

    await expect(repo.markSuppressed('send-001')).resolves.toBeUndefined();
  });
});

// T009 — R003, NF001, EC001, EC002, EC004: applyDeliveryEventByProviderMessageId outcome discrimination
describe('EmailDeliveriesDBRepository.applyDeliveryEventByProviderMessageId', () => {
  it('WHEN a matching non-terminal row exists THEN updates state and returns "applied"', async () => {
    const { sql, mockFn } = makeSqlMock();
    mockFn.mockResolvedValueOnce([{ id: 'send-001' }]);
    const repo = new EmailDeliveriesDBRepository(sql as never);

    const outcome = await repo.applyDeliveryEventByProviderMessageId('ses-msg-1', 'delivered');

    expect(outcome).toBe('applied');
    expect(mockFn).toHaveBeenCalledTimes(1);
    const [strings, ...values] = mockFn.mock.calls[0] as [TemplateStringsArray, ...unknown[]];
    const queryText = strings.join('?');
    expect(queryText).toMatch(/UPDATE\s+email_deliveries/i);
    expect(queryText).toMatch(/state NOT IN/i);
    expect(values).toEqual(expect.arrayContaining(['ses-msg-1', 'delivered']));
  });

  it('WHEN no row matches the provider_message_id THEN returns "not_found" without changing state', async () => {
    const { sql, mockFn } = makeSqlMock();
    mockFn.mockResolvedValueOnce([]); // guarded UPDATE affects 0 rows
    mockFn.mockResolvedValueOnce([]); // follow-up SELECT finds no row at all
    const repo = new EmailDeliveriesDBRepository(sql as never);

    const outcome = await repo.applyDeliveryEventByProviderMessageId('unknown-msg', 'delivered');

    expect(outcome).toBe('not_found');
  });

  it('WHEN the matching row is already in a terminal state THEN returns "already_terminal" without changing state', async () => {
    const { sql, mockFn } = makeSqlMock();
    mockFn.mockResolvedValueOnce([]); // guarded UPDATE excludes the row because it is already terminal
    mockFn.mockResolvedValueOnce([{ id: 'send-001' }]); // follow-up SELECT confirms the row exists
    const repo = new EmailDeliveriesDBRepository(sql as never);

    const outcome = await repo.applyDeliveryEventByProviderMessageId('ses-msg-1', 'bounced');

    expect(outcome).toBe('already_terminal');
  });
});
