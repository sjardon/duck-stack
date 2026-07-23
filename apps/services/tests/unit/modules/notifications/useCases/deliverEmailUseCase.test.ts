import { DeliverEmailUseCase } from '../../../../../src/modules/notifications/useCases/deliverEmailUseCase.js';
import { FakeEmailSender } from '../../../../mocks/fakeEmailSender.js';
import { FakeEmailDeliveriesRepository } from '../../../../mocks/fakeEmailDeliveriesRepository.js';
import { FakeEmailSuppressionsRepository } from '../../../../mocks/fakeEmailSuppressionsRepository.js';
import type { EmailSendMessage } from '../../../../../src/modules/notifications/entities/emailSendMessage.js';

describe('DeliverEmailUseCase.execute', () => {
  it('WHEN executed with the example.ping template THEN the sender receives the rendered subject/HTML and the recipient (R004, R009)', async () => {
    const sender = new FakeEmailSender();
    const deliveries = new FakeEmailDeliveriesRepository();
    const suppressions = new FakeEmailSuppressionsRepository();
    const useCase = new DeliverEmailUseCase(sender, deliveries, suppressions);

    const message: EmailSendMessage<'example.ping'> = {
      sendId: 'send-001',
      requestId: 'req-1',
      templateId: 'example.ping',
      variables: { recipientName: 'Ada', sentAt: '2026-07-22T00:00:00.000Z' },
      to: 'ada@example.com',
    };

    await useCase.execute(message);

    expect(sender.calls).toHaveLength(1);
    const call = sender.calls[0];
    expect(call.to).toBe('ada@example.com');
    expect(call.subject.length).toBeGreaterThan(0);
    expect(call.html).toContain('Ada');
  });
});

// T022 — R002: DeliverEmailUseCase persists provider id then marks sent
describe('DeliverEmailUseCase.execute — persistence order on first dispatch (R002)', () => {
  it('WHEN delivery succeeds THEN recordProviderMessageId is called with the returned providerMessageId before markSent is called for the same sendId', async () => {
    const sender = new FakeEmailSender();
    const deliveries = new FakeEmailDeliveriesRepository();
    const suppressions = new FakeEmailSuppressionsRepository();
    const recordSpy = jest.spyOn(deliveries, 'recordProviderMessageId');
    const markSentSpy = jest.spyOn(deliveries, 'markSent');
    const useCase = new DeliverEmailUseCase(sender, deliveries, suppressions);

    const message: EmailSendMessage<'example.ping'> = {
      sendId: 'send-001',
      requestId: 'req-1',
      templateId: 'example.ping',
      variables: { recipientName: 'Ada', sentAt: '2026-07-22T00:00:00.000Z' },
      to: 'ada@example.com',
    };

    await useCase.execute(message);

    expect(recordSpy).toHaveBeenCalledWith('send-001', 'fake-provider-message-id');
    expect(markSentSpy).toHaveBeenCalledWith('send-001');
    expect(recordSpy.mock.invocationCallOrder[0]).toBeLessThan(markSentSpy.mock.invocationCallOrder[0]);
  });
});

// T023 — R005, NF002, EC003: DeliverEmailUseCase skips a second dispatch when already dispatched
describe('DeliverEmailUseCase.execute — idempotent skip on retry (R005, NF002, EC003)', () => {
  it('WHEN findById resolves a record with a non-null providerMessageId THEN execute() never calls sender.send() and calls markSent directly', async () => {
    const sender = new FakeEmailSender();
    const deliveries = new FakeEmailDeliveriesRepository();
    const suppressions = new FakeEmailSuppressionsRepository();
    await deliveries.createQueued({ id: 'send-001', templateId: 'example.ping', to: 'ada@example.com', userId: null });
    await deliveries.recordProviderMessageId('send-001', 'existing-provider-id');
    const markSentSpy = jest.spyOn(deliveries, 'markSent');
    const useCase = new DeliverEmailUseCase(sender, deliveries, suppressions);

    const message: EmailSendMessage<'example.ping'> = {
      sendId: 'send-001',
      requestId: 'req-1',
      templateId: 'example.ping',
      variables: { recipientName: 'Ada', sentAt: '2026-07-22T00:00:00.000Z' },
      to: 'ada@example.com',
    };

    await useCase.execute(message);

    expect(sender.calls).toHaveLength(0);
    expect(markSentSpy).toHaveBeenCalledWith('send-001');
  });
});

// T012 — R003, R004: DeliverEmailUseCase short-circuits on a suppressed recipient
describe('DeliverEmailUseCase.execute — suppressed recipient (R003, R004)', () => {
  it('WHEN the recipient address is present in the suppression list THEN execute() never calls sender.send() and calls deliveries.markSuppressed(message.sendId) instead', async () => {
    const sender = new FakeEmailSender();
    const deliveries = new FakeEmailDeliveriesRepository();
    const suppressions = new FakeEmailSuppressionsRepository();
    await deliveries.createQueued({ id: 'send-010', templateId: 'example.ping', to: 'bounced@example.com', userId: null });
    await suppressions.upsert('bounced@example.com', 'bounce');
    const markSuppressedSpy = jest.spyOn(deliveries, 'markSuppressed');
    const useCase = new DeliverEmailUseCase(sender, deliveries, suppressions);

    const message: EmailSendMessage<'example.ping'> = {
      sendId: 'send-010',
      requestId: 'req-1',
      templateId: 'example.ping',
      variables: { recipientName: 'Bea', sentAt: '2026-07-22T00:00:00.000Z' },
      to: 'bounced@example.com',
    };

    await useCase.execute(message);

    expect(sender.calls).toHaveLength(0);
    expect(markSuppressedSpy).toHaveBeenCalledWith('send-010');
  });
});

// T013 — R003, EC002: DeliverEmailUseCase dispatches normally for a non-suppressed recipient
describe('DeliverEmailUseCase.execute — non-suppressed recipient dispatches normally (R003, EC002)', () => {
  it('WHEN isSuppressed resolves false THEN sender.send() is called and the existing recordProviderMessageId -> markSent flow proceeds unchanged', async () => {
    const sender = new FakeEmailSender();
    const deliveries = new FakeEmailDeliveriesRepository();
    const suppressions = new FakeEmailSuppressionsRepository();
    await deliveries.createQueued({ id: 'send-011', templateId: 'example.ping', to: 'grace@example.com', userId: null });
    const recordSpy = jest.spyOn(deliveries, 'recordProviderMessageId');
    const markSentSpy = jest.spyOn(deliveries, 'markSent');
    const useCase = new DeliverEmailUseCase(sender, deliveries, suppressions);

    const message: EmailSendMessage<'example.ping'> = {
      sendId: 'send-011',
      requestId: 'req-1',
      templateId: 'example.ping',
      variables: { recipientName: 'Grace', sentAt: '2026-07-22T00:00:00.000Z' },
      to: 'grace@example.com',
    };

    await useCase.execute(message);

    expect(sender.calls).toHaveLength(1);
    expect(recordSpy).toHaveBeenCalledWith('send-011', 'fake-provider-message-id');
    expect(markSentSpy).toHaveBeenCalledWith('send-011');
  });
});

// T014 — R003, R005: DeliverEmailUseCase does not re-check suppression on an already-dispatched retry
describe('DeliverEmailUseCase.execute — already-dispatched retry skips the suppression check (R003, R005)', () => {
  it('WHEN findById resolves a record with a non-null providerMessageId THEN execute() calls markSent directly without consulting isSuppressed', async () => {
    const sender = new FakeEmailSender();
    const deliveries = new FakeEmailDeliveriesRepository();
    const suppressions = new FakeEmailSuppressionsRepository();
    await deliveries.createQueued({ id: 'send-012', templateId: 'example.ping', to: 'ada@example.com', userId: null });
    await deliveries.recordProviderMessageId('send-012', 'existing-provider-id');
    const isSuppressedSpy = jest.spyOn(suppressions, 'isSuppressed');
    const markSentSpy = jest.spyOn(deliveries, 'markSent');
    const useCase = new DeliverEmailUseCase(sender, deliveries, suppressions);

    const message: EmailSendMessage<'example.ping'> = {
      sendId: 'send-012',
      requestId: 'req-1',
      templateId: 'example.ping',
      variables: { recipientName: 'Ada', sentAt: '2026-07-22T00:00:00.000Z' },
      to: 'ada@example.com',
    };

    await useCase.execute(message);

    expect(isSuppressedSpy).not.toHaveBeenCalled();
    expect(markSentSpy).toHaveBeenCalledWith('send-012');
  });
});

// T027 — EC004: concurrent sends to a newly-suppressed address all resolve to suppressed
describe('DeliverEmailUseCase.execute — concurrent sends to a newly-suppressed address (EC004)', () => {
  it('WHEN two messages with distinct sendIds but the same suppressed "to" address are executed concurrently THEN both calls resolve with deliveries.markSuppressed called for their own respective sendId, and sender.send() is never called for either', async () => {
    const sender = new FakeEmailSender();
    const deliveries = new FakeEmailDeliveriesRepository();
    const suppressions = new FakeEmailSuppressionsRepository();
    await deliveries.createQueued({ id: 'send-013', templateId: 'example.ping', to: 'bounced@example.com', userId: null });
    await deliveries.createQueued({ id: 'send-014', templateId: 'example.ping', to: 'bounced@example.com', userId: null });
    await suppressions.upsert('bounced@example.com', 'bounce');
    const markSuppressedSpy = jest.spyOn(deliveries, 'markSuppressed');
    const useCase = new DeliverEmailUseCase(sender, deliveries, suppressions);

    const messageA: EmailSendMessage<'example.ping'> = {
      sendId: 'send-013',
      requestId: 'req-1',
      templateId: 'example.ping',
      variables: { recipientName: 'Bea', sentAt: '2026-07-22T00:00:00.000Z' },
      to: 'bounced@example.com',
    };
    const messageB: EmailSendMessage<'example.ping'> = {
      sendId: 'send-014',
      requestId: 'req-2',
      templateId: 'example.ping',
      variables: { recipientName: 'Bea', sentAt: '2026-07-22T00:00:00.000Z' },
      to: 'bounced@example.com',
    };

    await Promise.all([useCase.execute(messageA), useCase.execute(messageB)]);

    expect(sender.calls).toHaveLength(0);
    expect(markSuppressedSpy).toHaveBeenCalledWith('send-013');
    expect(markSuppressedSpy).toHaveBeenCalledWith('send-014');
  });
});
