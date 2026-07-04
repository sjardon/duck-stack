import { SendEmailUseCase } from '../../../../../src/modules/notifications/useCases/sendEmailUseCase.js';
import { ValidationError } from '../../../../../src/shared/errors.js';
import type { ISqsEmailQueue, EmailSendMessage, SqsEnvelope } from '../../../../../src/modules/notifications/ports/iSqsEmailQueue.js';
import type { EmailSendRequest } from '@repo/types';

// Isolate the logger to prevent noise in test output and to allow inspection
jest.mock('../../../../../src/shared/infrastructure/logger.js', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

// Isolate the templateRegistry so the test does not depend on React Email rendering
jest.mock('../../../../../src/modules/notifications/templates/templateRegistry.js', () => ({
  templateRegistry: {
    'example.welcome_demo': {
      subject: 'Welcome',
      render: jest.fn().mockResolvedValue('<p>Hello</p>'),
    },
  },
}));

const { logger } = jest.requireMock('../../../../../src/shared/infrastructure/logger.js');

function makeQueue(overrides: Partial<ISqsEmailQueue> = {}): ISqsEmailQueue {
  return {
    enqueue: jest.fn().mockResolvedValue(undefined),
    receive: jest.fn().mockResolvedValue([] as SqsEnvelope[]),
    delete: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

// T014 — WHEN execute() is called with an unregistered templateId THEN it throws ValidationError
describe('SendEmailUseCase — unknown templateId (R007)', () => {
  it('WHEN execute() is called with an unregistered templateId THEN throws ValidationError and enqueue is not called', async () => {
    const queue = makeQueue();
    const useCase = new SendEmailUseCase(queue);

    const req = {
      to: 'alice@example.com',
      // Cast to bypass compile-time check for this test
      templateId: 'nonexistent.template' as 'example.welcome_demo',
      variables: { recipientName: 'Alice' },
    };

    await expect(useCase.execute(req)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
    });

    expect(queue.enqueue).not.toHaveBeenCalled();
  });
});

// T015 — WHEN execute() is called with a valid templateId THEN enqueue is called and logs are emitted
describe('SendEmailUseCase — valid templateId enqueues and logs (R003, R007, R008, NF001)', () => {
  it('WHEN execute() is called with a known templateId THEN enqueue() is called with correct message fields', async () => {
    const queue = makeQueue();
    const useCase = new SendEmailUseCase(queue);

    const req: EmailSendRequest<'example.welcome_demo'> = {
      to: 'alice@example.com',
      templateId: 'example.welcome_demo',
      variables: { recipientName: 'Alice' },
      userId: 'user-001',
    };

    await useCase.execute(req);

    expect(queue.enqueue).toHaveBeenCalledTimes(1);
    const [enqueuedMsg]: [EmailSendMessage] = (queue.enqueue as jest.Mock).mock.calls[0];

    expect(enqueuedMsg).toMatchObject({
      templateId: 'example.welcome_demo',
      to: 'alice@example.com',
      variables: { recipientName: 'Alice' },
      userId: 'user-001',
    });
    expect(typeof enqueuedMsg.requestId).toBe('string');
    expect(enqueuedMsg.requestId.length).toBeGreaterThan(0);
    expect(typeof enqueuedMsg.enqueuedAt).toBe('string');
  });

  it('WHEN execute() succeeds THEN logger is called with requestId, userId, templateId, outcome:enqueued and NO rendered content', async () => {
    const queue = makeQueue();
    const useCase = new SendEmailUseCase(queue);

    const req: EmailSendRequest<'example.welcome_demo'> = {
      to: 'alice@example.com',
      templateId: 'example.welcome_demo',
      variables: { recipientName: 'Alice' },
      userId: 'user-001',
      requestId: 'req-uuid-001',
    };

    await useCase.execute(req);

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: 'req-uuid-001',
        userId: 'user-001',
        templateId: 'example.welcome_demo',
        outcome: 'enqueued',
        duration: expect.any(Number),
      }),
      expect.any(String),
    );

    // NF001 — rendered HTML must not appear in logs
    const logCall = (logger.info as jest.Mock).mock.calls[0];
    const loggedObj = JSON.stringify(logCall);
    expect(loggedObj).not.toContain('<p>');
    expect(loggedObj).not.toContain('Alice');
  });

  it('WHEN execute() is called without a requestId THEN a requestId is generated automatically', async () => {
    const queue = makeQueue();
    const useCase = new SendEmailUseCase(queue);

    const req: EmailSendRequest<'example.welcome_demo'> = {
      to: 'bob@example.com',
      templateId: 'example.welcome_demo',
      variables: { recipientName: 'Bob' },
    };

    await useCase.execute(req);

    const [enqueuedMsg]: [EmailSendMessage] = (queue.enqueue as jest.Mock).mock.calls[0];
    expect(enqueuedMsg.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });
});
