import { DeliverEmailUseCase } from '../../../../../src/modules/notifications/useCases/deliverEmailUseCase.js';
import { FakeEmailSender } from '../../../../mocks/fakeEmailSender.js';
import type { EmailSendMessage } from '../../../../../src/modules/notifications/entities/emailSendMessage.js';

describe('DeliverEmailUseCase.execute', () => {
  it('WHEN executed with the example.ping template THEN the sender receives the rendered subject/HTML and the recipient (R004, R009)', async () => {
    const sender = new FakeEmailSender();
    const useCase = new DeliverEmailUseCase(sender);

    const message: EmailSendMessage<'example.ping'> = {
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
