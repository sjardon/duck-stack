// Mock the static logger so we can spy on its methods
jest.mock('../../../../../src/shared/infrastructure/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import { dispatchSesEvent } from '../../../../../src/modules/webhooks/ses/sesEventHandlers.js';
import type {
  IEmailDeliveriesRepository,
  ApplyDeliveryEventOutcome,
} from '../../../../../src/shared/repositories/interfaces/iEmailDeliveriesRepository.js';
import type { IEmailSuppressionsRepository } from '../../../../../src/shared/repositories/interfaces/iEmailSuppressionsRepository.js';

function makeRepo(outcome: ApplyDeliveryEventOutcome = 'applied'): IEmailDeliveriesRepository {
  return {
    createQueued: jest.fn(),
    findById: jest.fn(),
    recordProviderMessageId: jest.fn(),
    markSent: jest.fn(),
    markSuppressed: jest.fn(),
    applyDeliveryEventByProviderMessageId: jest.fn().mockResolvedValue(outcome),
  } as unknown as IEmailDeliveriesRepository;
}

function makeSuppressionsRepo(): IEmailSuppressionsRepository {
  return {
    upsert: jest.fn(),
    isSuppressed: jest.fn(),
  } as unknown as IEmailSuppressionsRepository;
}

beforeEach(() => {
  jest.clearAllMocks();
});

// T031 — R003: dispatchSesEvent maps known event types and ignores unknown ones
describe('dispatchSesEvent — known event types', () => {
  it.each([
    ['Delivery', 'delivered'],
    ['Bounce', 'bounced'],
    ['Complaint', 'complained'],
    ['Reject', 'failed'],
  ])(
    'WHEN eventType is "%s" THEN calls applyDeliveryEventByProviderMessageId with "%s" and mail.messageId',
    async (eventType, state) => {
      const repo = makeRepo('applied');
      const suppressions = makeSuppressionsRepo();
      const event = { eventType, mail: { messageId: 'ses-msg-1' } };

      await dispatchSesEvent(event, repo, suppressions);

      expect(repo.applyDeliveryEventByProviderMessageId).toHaveBeenCalledWith('ses-msg-1', state);
    },
  );

  it('WHEN eventType is not one of Delivery/Bounce/Complaint/Reject THEN never calls the repository', async () => {
    const repo = makeRepo();
    const suppressions = makeSuppressionsRepo();
    const event = { eventType: 'Open', mail: { messageId: 'ses-msg-1' } };

    await dispatchSesEvent(event, repo, suppressions);

    expect(repo.applyDeliveryEventByProviderMessageId).not.toHaveBeenCalled();
  });
});

// T032 — NF001, EC002, EC004: discarded outcomes are logged, not thrown
describe('dispatchSesEvent — discarded outcomes', () => {
  it.each(['not_found', 'already_terminal'] as const)(
    'WHEN the repository call resolves "%s" THEN dispatchSesEvent resolves without throwing',
    async (outcome) => {
      const repo = makeRepo(outcome);
      const suppressions = makeSuppressionsRepo();
      const event = { eventType: 'Delivery', mail: { messageId: 'ses-msg-1' } };

      await expect(dispatchSesEvent(event, repo, suppressions)).resolves.toBeUndefined();
    },
  );
});

// T019 — R002: dispatchSesEvent suppresses on a permanent bounce
describe('dispatchSesEvent — permanent bounce suppression (R002)', () => {
  it('WHEN eventType is "Bounce" and bounce.bounceType is "Permanent" THEN suppressions.upsert is called with reason "bounce" for every email in bounce.bouncedRecipients', async () => {
    const repo = makeRepo('applied');
    const suppressions = makeSuppressionsRepo();
    const event = {
      eventType: 'Bounce',
      mail: { messageId: 'ses-msg-1' },
      bounce: {
        bounceType: 'Permanent',
        bouncedRecipients: [{ emailAddress: 'a@example.com' }, { emailAddress: 'b@example.com' }],
      },
    };

    await dispatchSesEvent(event, repo, suppressions);

    expect(suppressions.upsert).toHaveBeenCalledWith('a@example.com', 'bounce');
    expect(suppressions.upsert).toHaveBeenCalledWith('b@example.com', 'bounce');
  });
});

// T020 — EC001: dispatchSesEvent does not suppress on a transient bounce
describe('dispatchSesEvent — transient bounce is not suppressed (EC001)', () => {
  it('WHEN eventType is "Bounce" and bounce.bounceType is "Transient" THEN suppressions.upsert is never called', async () => {
    const repo = makeRepo('applied');
    const suppressions = makeSuppressionsRepo();
    const event = {
      eventType: 'Bounce',
      mail: { messageId: 'ses-msg-1' },
      bounce: {
        bounceType: 'Transient',
        bouncedRecipients: [{ emailAddress: 'a@example.com' }],
      },
    };

    await dispatchSesEvent(event, repo, suppressions);

    expect(suppressions.upsert).not.toHaveBeenCalled();
  });
});

// T021 — R002, EC003: dispatchSesEvent suppresses on complaint independent of delivery outcome
describe('dispatchSesEvent — complaint suppression independent of delivery outcome (R002, EC003)', () => {
  it.each(['applied', 'already_terminal'] as const)(
    'WHEN eventType is "Complaint" and applyDeliveryEventByProviderMessageId resolves "%s" THEN suppressions.upsert is still called with reason "complaint" for every email in complaint.complainedRecipients',
    async (outcome) => {
      const repo = makeRepo(outcome);
      const suppressions = makeSuppressionsRepo();
      const event = {
        eventType: 'Complaint',
        mail: { messageId: 'ses-msg-1' },
        complaint: {
          complainedRecipients: [{ emailAddress: 'c@example.com' }],
        },
      };

      await dispatchSesEvent(event, repo, suppressions);

      expect(suppressions.upsert).toHaveBeenCalledWith('c@example.com', 'complaint');
    },
  );
});
