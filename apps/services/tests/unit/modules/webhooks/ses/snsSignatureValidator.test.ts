// Mock the sns-validator npm package — not installed yet (added by the implement phase),
// so this mock is registered as virtual to avoid a module-resolution error.
const mockValidate = jest.fn();
jest.mock(
  'sns-validator',
  () =>
    jest.fn().mockImplementation(() => ({
      validate: mockValidate,
    })),
  { virtual: true },
);

import { validateSnsMessage } from '../../../../../src/modules/webhooks/ses/snsSignatureValidator.js';

beforeEach(() => {
  jest.clearAllMocks();
});

// T029 — R004: validateSnsMessage resolves on valid signature and rejects on invalid
describe('validateSnsMessage', () => {
  it('WHEN the underlying sns-validator callback invokes with (null, message) THEN the returned promise resolves with message', async () => {
    const validMessage = {
      Type: 'Notification',
      TopicArn: 'arn:aws:sns:us-east-1:123456789012:ses-events',
      Message: '{}',
    };
    mockValidate.mockImplementation(
      (_message: unknown, callback: (err: Error | null, msg?: unknown) => void) => {
        callback(null, validMessage);
      },
    );

    await expect(validateSnsMessage(validMessage)).resolves.toEqual(validMessage);
  });

  it('WHEN the underlying sns-validator callback invokes with (err) THEN the returned promise rejects with err', async () => {
    const validationError = new Error('invalid signature');
    mockValidate.mockImplementation(
      (_message: unknown, callback: (err: Error | null, msg?: unknown) => void) => {
        callback(validationError);
      },
    );

    await expect(validateSnsMessage({ Type: 'Notification' })).rejects.toBe(validationError);
  });
});
