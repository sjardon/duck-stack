import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';

// Mock logger before any imports — must be first so the factory is registered before module load
jest.mock('../../../../../src/shared/infrastructure/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock db before importing routes
jest.mock('../../../../../src/shared/infrastructure/db.js', () => ({ db: {} }));

// Mock notificationsConfig so tests control sesEventsTopicArn without env-driven reloads
let mockTopicArn: string | undefined = 'arn:aws:sns:us-east-1:123456789012:ses-events';
jest.mock('../../../../../src/shared/configs/notificationsConfig.js', () => ({
  get notificationsConfig() {
    return {
      awsRegion: 'us-east-1',
      emailQueueUrl: 'https://sqs.example/queue',
      emailDeadLetterQueueUrl: 'https://sqs.example/dlq',
      sesFromAddress: 'noreply@example.com',
      sqsPollWaitTimeSeconds: 20,
      sesConfigurationSetName: 'test-configuration-set',
      sesEventsTopicArn: mockTopicArn,
    };
  },
}));

// Mock EmailDeliveriesDBRepository so the route can be constructed without a real db
jest.mock('../../../../../src/shared/repositories/emailDeliveriesDBRepository.js', () => ({
  EmailDeliveriesDBRepository: jest.fn().mockImplementation(() => ({
    createQueued: jest.fn(),
    findById: jest.fn(),
    recordProviderMessageId: jest.fn(),
    markSent: jest.fn(),
    applyDeliveryEventByProviderMessageId: jest.fn().mockResolvedValue('applied'),
  })),
}));

// Mock validateSnsMessage
const mockValidateSnsMessage = jest.fn();
jest.mock('../../../../../src/modules/webhooks/ses/snsSignatureValidator.js', () => ({
  validateSnsMessage: (...args: unknown[]) => mockValidateSnsMessage(...args),
}));

// Mock dispatchSesEvent
const mockDispatchSesEvent = jest.fn();
jest.mock('../../../../../src/modules/webhooks/ses/sesEventHandlers.js', () => ({
  dispatchSesEvent: (...args: unknown[]) => mockDispatchSesEvent(...args),
}));

import sesEventsWebhookRoutes from '../../../../../src/modules/webhooks/ses/routes.js';

const TOPIC_ARN = 'arn:aws:sns:us-east-1:123456789012:ses-events';

function makeNotificationEnvelope(overrides: Record<string, unknown> = {}) {
  return {
    Type: 'Notification',
    MessageId: 'sns-msg-1',
    TopicArn: TOPIC_ARN,
    Message: JSON.stringify({ eventType: 'Delivery', mail: { messageId: 'ses-msg-1' } }),
    Signature: 'sig',
    SignatureVersion: '1',
    SigningCertURL: 'https://sns.us-east-1.amazonaws.com/cert.pem',
    Timestamp: '2026-07-23T00:00:00.000Z',
    ...overrides,
  };
}

async function buildApp(): Promise<FastifyInstance> {
  const fastify = Fastify({ logger: false });
  await fastify.register(sesEventsWebhookRoutes);
  return fastify;
}

function post(app: FastifyInstance, envelope: Record<string, unknown>) {
  return app.inject({
    method: 'POST',
    url: '/webhooks/notifications/ses',
    payload: Buffer.from(JSON.stringify(envelope)),
    headers: { 'content-type': 'text/plain; charset=UTF-8' },
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockTopicArn = TOPIC_ARN;
  mockValidateSnsMessage.mockImplementation(async (envelope: Record<string, unknown>) => envelope);
  mockDispatchSesEvent.mockResolvedValue('applied');
  global.fetch = jest.fn().mockResolvedValue({ ok: true }) as unknown as typeof global.fetch;
});

// T034 — R004: reject an unauthenticated notification
describe('sesEventsWebhookRoutes — signature authentication (R004)', () => {
  it('WHEN validateSnsMessage rejects (invalid signature) THEN responds HTTP 401 with code UNAUTHORIZED and never dispatches the event', async () => {
    mockValidateSnsMessage.mockRejectedValue(new Error('invalid signature'));
    const app = await buildApp();

    const response = await post(app, makeNotificationEnvelope());

    expect(response.statusCode).toBe(401);
    const body = JSON.parse(response.body) as { code: string };
    expect(body.code).toBe('UNAUTHORIZED');
    expect(mockDispatchSesEvent).not.toHaveBeenCalled();
  });
});

// T035 — R004: reject a notification for an unexpected TopicArn
describe('sesEventsWebhookRoutes — TopicArn verification (R004)', () => {
  it('WHEN the validated message TopicArn does not equal the configured topic THEN responds HTTP 401 with code UNAUTHORIZED and does not dispatch', async () => {
    const app = await buildApp();
    const envelope = makeNotificationEnvelope({
      TopicArn: 'arn:aws:sns:us-east-1:123456789012:unexpected-topic',
    });
    mockValidateSnsMessage.mockImplementation(async () => envelope);

    const response = await post(app, envelope);

    expect(response.statusCode).toBe(401);
    const body = JSON.parse(response.body) as { code: string };
    expect(body.code).toBe('UNAUTHORIZED');
    expect(mockDispatchSesEvent).not.toHaveBeenCalled();
  });
});

// T036 — R003: confirms a SubscriptionConfirmation
describe('sesEventsWebhookRoutes — SubscriptionConfirmation (R003)', () => {
  it('WHEN Type is SubscriptionConfirmation and the message is validated THEN fetches SubscribeURL and replies 200 without calling dispatchSesEvent', async () => {
    const app = await buildApp();
    const envelope = makeNotificationEnvelope({
      Type: 'SubscriptionConfirmation',
      SubscribeURL: 'https://sns.us-east-1.amazonaws.com/confirm?token=abc',
      Message: 'You have chosen to subscribe to the topic...',
    });
    mockValidateSnsMessage.mockImplementation(async () => envelope);

    const response = await post(app, envelope);

    expect(response.statusCode).toBe(200);
    expect(global.fetch).toHaveBeenCalledWith('https://sns.us-east-1.amazonaws.com/confirm?token=abc');
    expect(mockDispatchSesEvent).not.toHaveBeenCalled();
  });
});

// T037 — R003, NF001, EC001, EC002, EC004: dispatches a valid Notification and always replies 200
describe('sesEventsWebhookRoutes — Notification dispatch always replies 200', () => {
  it.each(['applied', 'not_found', 'already_terminal'] as const)(
    'WHEN Type is Notification and validation succeeds THEN dispatchSesEvent is called with the parsed inner event and the route replies 200 regardless of outcome "%s"',
    async (outcome) => {
      mockDispatchSesEvent.mockResolvedValue(outcome);
      const app = await buildApp();
      const innerEvent = { eventType: 'Delivery', mail: { messageId: 'ses-msg-1' } };
      const envelope = makeNotificationEnvelope({ Message: JSON.stringify(innerEvent) });
      mockValidateSnsMessage.mockImplementation(async () => envelope);

      const response = await post(app, envelope);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body) as { received: boolean };
      expect(body).toEqual({ received: true });
      expect(mockDispatchSesEvent).toHaveBeenCalledWith(
        expect.objectContaining(innerEvent),
        expect.anything(),
      );
    },
  );
});
