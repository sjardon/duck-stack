import { DeliverEmailUseCase } from '../../../../../src/modules/notifications/useCases/deliverEmailUseCase.js';
import { FakeEmailSender } from '../../../../mocks/fakeEmailSender.js';
import { FakeEmailDeliveriesRepository } from '../../../../mocks/fakeEmailDeliveriesRepository.js';
import type { EmailSendMessage } from '../../../../../src/modules/notifications/entities/emailSendMessage.js';

describe('DeliverEmailUseCase.execute', () => {
  it('WHEN executed with the example.ping template THEN the sender receives the rendered subject/HTML and the recipient (R004, R009)', async () => {
    const sender = new FakeEmailSender();
    const deliveries = new FakeEmailDeliveriesRepository();
    const useCase = new DeliverEmailUseCase(sender, deliveries);

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
    const recordSpy = jest.spyOn(deliveries, 'recordProviderMessageId');
    const markSentSpy = jest.spyOn(deliveries, 'markSent');
    const useCase = new DeliverEmailUseCase(sender, deliveries);

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
    await deliveries.createQueued({ id: 'send-001', templateId: 'example.ping', to: 'ada@example.com', userId: null });
    await deliveries.recordProviderMessageId('send-001', 'existing-provider-id');
    const markSentSpy = jest.spyOn(deliveries, 'markSent');
    const useCase = new DeliverEmailUseCase(sender, deliveries);

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
