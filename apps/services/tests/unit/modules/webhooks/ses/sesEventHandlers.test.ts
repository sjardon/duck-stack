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

function makeRepo(outcome: ApplyDeliveryEventOutcome = 'applied'): IEmailDeliveriesRepository {
  return {
    createQueued: jest.fn(),
    findById: jest.fn(),
    recordProviderMessageId: jest.fn(),
    markSent: jest.fn(),
    applyDeliveryEventByProviderMessageId: jest.fn().mockResolvedValue(outcome),
  } as unknown as IEmailDeliveriesRepository;
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
      const event = { eventType, mail: { messageId: 'ses-msg-1' } };

      await dispatchSesEvent(event, repo);

      expect(repo.applyDeliveryEventByProviderMessageId).toHaveBeenCalledWith('ses-msg-1', state);
    },
  );

  it('WHEN eventType is not one of Delivery/Bounce/Complaint/Reject THEN never calls the repository', async () => {
    const repo = makeRepo();
    const event = { eventType: 'Open', mail: { messageId: 'ses-msg-1' } };

    await dispatchSesEvent(event, repo);

    expect(repo.applyDeliveryEventByProviderMessageId).not.toHaveBeenCalled();
  });
});

// T032 — NF001, EC002, EC004: discarded outcomes are logged, not thrown
describe('dispatchSesEvent — discarded outcomes', () => {
  it.each(['not_found', 'already_terminal'] as const)(
    'WHEN the repository call resolves "%s" THEN dispatchSesEvent resolves without throwing',
    async (outcome) => {
      const repo = makeRepo(outcome);
      const event = { eventType: 'Delivery', mail: { messageId: 'ses-msg-1' } };

      await expect(dispatchSesEvent(event, repo)).resolves.toBeUndefined();
    },
  );
});
