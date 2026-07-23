import type { IEmailNotifier } from '../../../../../src/modules/notifications/providers/interfaces/iEmailNotifier.js';

function makeStubNotifier(): IEmailNotifier {
  return {
    send: jest.fn().mockResolvedValue(undefined),
  };
}

describe('IEmailNotifier — compile-time variable enforcement (R001, R002)', () => {
  it('WHEN called with the exact variables required by the template THEN it compiles and resolves', async () => {
    const notifier = makeStubNotifier();

    await expect(
      notifier.send('example.ping', { recipientName: 'Ada', sentAt: '2026-07-22T00:00:00.000Z' }, { to: 'ada@example.com' }),
    ).resolves.toBeUndefined();
  });

  it('rejects a call missing a required variable at compile time', async () => {
    const notifier = makeStubNotifier();

    // @ts-expect-error — missing `sentAt`
    await notifier.send('example.ping', { recipientName: 'Ada' }, { to: 'ada@example.com' });
  });

  it('rejects a call with a wrong-typed variable at compile time', async () => {
    const notifier = makeStubNotifier();

    // @ts-expect-error — `sentAt` must be a string, not a number
    await notifier.send('example.ping', { recipientName: 'Ada', sentAt: 123 }, { to: 'ada@example.com' });
  });

  it('rejects a call with an extra, unknown variable at compile time', async () => {
    const notifier = makeStubNotifier();

    // @ts-expect-error — `extra` is not a variable of `example.ping`
    await notifier.send('example.ping', { recipientName: 'Ada', sentAt: '2026-07-22T00:00:00.000Z', extra: 'nope' }, { to: 'ada@example.com' });
  });
});
