import { dispatchClerkEvent } from '../../../../../src/modules/webhooks/clerk/clerkEventHandlers.js';
import type { ClerkSyncRepository } from '../../../../../src/modules/webhooks/repositories/clerkSyncRepository.js';
import type { BaseLogger } from 'pino';
import type { WebhookEvent } from '@clerk/backend/webhooks';

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

function makeRepo(): ClerkSyncRepository {
  return {
    upsertUser: jest.fn().mockResolvedValue(undefined),
    upsertOrganization: jest.fn().mockResolvedValue(undefined),
    createMembership: jest.fn().mockResolvedValue(undefined),
  } as unknown as ClerkSyncRepository;
}

// T035 — dispatchClerkEvent forwards logger to ClerkSyncRepository methods (R002, R004, EC003)

describe('dispatchClerkEvent — user.created forwards logger to repo.upsertUser', () => {
  it('WHEN event type is "user.created" THEN calls repo.upsertUser with the fake logger as the last argument', async () => {
    const repo = makeRepo();
    const fakeLogger = makeLogger();

    const event = {
      type: 'user.created',
      data: {
        id: 'user_001',
        email_addresses: [{ email_address: 'alice@example.com' }],
        first_name: 'Alice',
        last_name: 'Smith',
        image_url: null,
      },
    } as unknown as WebhookEvent;

    await dispatchClerkEvent(event, repo, fakeLogger);

    expect(repo.upsertUser).toHaveBeenCalledWith(
      expect.objectContaining({ clerkUserId: 'user_001' }),
      fakeLogger,
    );
  });
});

describe('dispatchClerkEvent — user.updated forwards logger to repo.upsertUser', () => {
  it('WHEN event type is "user.updated" THEN calls repo.upsertUser with the fake logger as the last argument', async () => {
    const repo = makeRepo();
    const fakeLogger = makeLogger();

    const event = {
      type: 'user.updated',
      data: {
        id: 'user_002',
        email_addresses: [{ email_address: 'bob@example.com' }],
        first_name: 'Bob',
        last_name: null,
        image_url: 'https://example.com/avatar.png',
      },
    } as unknown as WebhookEvent;

    await dispatchClerkEvent(event, repo, fakeLogger);

    expect(repo.upsertUser).toHaveBeenCalledWith(
      expect.objectContaining({ clerkUserId: 'user_002' }),
      fakeLogger,
    );
  });
});

describe('dispatchClerkEvent — organization.created forwards logger to repo.upsertOrganization', () => {
  it('WHEN event type is "organization.created" THEN calls repo.upsertOrganization with the fake logger as the last argument', async () => {
    const repo = makeRepo();
    const fakeLogger = makeLogger();

    const event = {
      type: 'organization.created',
      data: {
        id: 'org_001',
        name: 'Acme Corp',
        slug: 'acme-corp',
      },
    } as unknown as WebhookEvent;

    await dispatchClerkEvent(event, repo, fakeLogger);

    expect(repo.upsertOrganization).toHaveBeenCalledWith(
      expect.objectContaining({ clerkOrgId: 'org_001' }),
      fakeLogger,
    );
  });
});

describe('dispatchClerkEvent — organizationMembership.created forwards logger to repo.createMembership', () => {
  it('WHEN event type is "organizationMembership.created" THEN calls repo.createMembership with the fake logger as the last argument', async () => {
    const repo = makeRepo();
    const fakeLogger = makeLogger();

    const event = {
      type: 'organizationMembership.created',
      data: {
        public_user_data: { user_id: 'user_001' },
        organization: { id: 'org_001' },
        role: 'admin',
      },
    } as unknown as WebhookEvent;

    await dispatchClerkEvent(event, repo, fakeLogger);

    expect(repo.createMembership).toHaveBeenCalledWith(
      expect.objectContaining({ clerkUserId: 'user_001', clerkOrgId: 'org_001' }),
      fakeLogger,
    );
  });
});

describe('dispatchClerkEvent — unrecognised event type is a no-op', () => {
  it('WHEN event type is unrecognised THEN none of the repo methods are called', async () => {
    const repo = makeRepo();
    const fakeLogger = makeLogger();

    const event = {
      type: 'session.created',
      data: {},
    } as unknown as WebhookEvent;

    await dispatchClerkEvent(event, repo, fakeLogger);

    expect(repo.upsertUser).not.toHaveBeenCalled();
    expect(repo.upsertOrganization).not.toHaveBeenCalled();
    expect(repo.createMembership).not.toHaveBeenCalled();
  });
});
