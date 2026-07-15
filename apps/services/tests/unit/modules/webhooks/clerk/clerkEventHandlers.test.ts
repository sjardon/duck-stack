// Mock subscriptionsConfig to control signupMode
jest.mock('../../../../../src/shared/configs/subscriptionsConfig.js', () => ({
  subscriptionsConfig: {
    signupMode: 'freemium',
    freeTrialDays: 14,
    strictEntitlementsOnPastDue: false,
  },
}));

// Mock CreateTrialSubscriptionUseCase
const mockTrialExecute = jest.fn().mockResolvedValue(undefined);
jest.mock('../../../../../src/modules/subscriptions/useCases/createTrialSubscriptionUseCase.js', () => ({
  CreateTrialSubscriptionUseCase: jest.fn().mockImplementation(() => ({
    execute: mockTrialExecute,
  })),
}));

import { dispatchClerkEvent, handleUserUpsert } from '../../../../../src/modules/webhooks/clerk/clerkEventHandlers.js';
import { subscriptionsConfig } from '../../../../../src/shared/configs/subscriptionsConfig.js';
import { CreateTrialSubscriptionUseCase } from '../../../../../src/modules/subscriptions/useCases/createTrialSubscriptionUseCase.js';
import type { ClerkSyncRepository } from '../../../../../src/modules/webhooks/repositories/clerkSyncRepository.js';
import type { ISubscriptionRepository } from '../../../../../src/modules/subscriptions/repositories/interfaces/iSubscriptionRepository.js';
import type { IClerkMetadataProvider } from '../../../../../src/shared/providers/interfaces/iClerkMetadataProvider.js';
import type { WebhookEvent } from '@clerk/backend/webhooks';

const mockConfig = subscriptionsConfig as { signupMode: string; freeTrialDays: number };

const mockClerkRepo = {
  upsertUser: jest.fn().mockResolvedValue({ id: 'internal-user-001' }),
  upsertOrganization: jest.fn().mockResolvedValue({ id: 'internal-org-001' }),
  createMembership: jest.fn(),
} as unknown as ClerkSyncRepository;

const mockSubscriptionRepo = {
  findActiveByScopeStatus: jest.fn(),
  findByIdAndScope: jest.fn(),
  findActiveOrWithinPeriodByScope: jest.fn(),
  findPlanByCode: jest.fn(),
  findMostExpensiveActivePlan: jest.fn().mockResolvedValue(null),
  transitionExpiredTrials: jest.fn().mockResolvedValue(null),
  create: jest.fn(),
  setCancelAtPeriodEnd: jest.fn(),
  cancelImmediately: jest.fn(),
} as unknown as ISubscriptionRepository;

const mockMetadataProvider = {
  setUserAppId: jest.fn().mockResolvedValue(undefined),
  setOrgAppId: jest.fn().mockResolvedValue(undefined),
} as unknown as IClerkMetadataProvider;

function makeUserCreatedEvent(): WebhookEvent {
  return {
    type: 'user.created',
    data: {
      id: 'clerk-user-001',
      email_addresses: [{ email_address: 'test@example.com' }],
      first_name: 'Test',
      last_name: 'User',
      image_url: null,
    },
  } as unknown as WebhookEvent;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockConfig.signupMode = 'freemium';
  mockTrialExecute.mockResolvedValue(undefined);
  (mockClerkRepo.upsertUser as jest.Mock).mockResolvedValue({ id: 'internal-user-001' });
  (mockClerkRepo.upsertOrganization as jest.Mock).mockResolvedValue({ id: 'internal-org-001' });
  (mockMetadataProvider.setUserAppId as jest.Mock).mockResolvedValue(undefined);
  (mockMetadataProvider.setOrgAppId as jest.Mock).mockResolvedValue(undefined);
});

// T022 — R004, R005, EC008
describe('dispatchClerkEvent — user.created in free_trial mode (R004, R005)', () => {
  it('WHEN signupMode is free_trial and event is user.created THEN CreateTrialSubscriptionUseCase.execute is called with the userId', async () => {
    mockConfig.signupMode = 'free_trial';
    const event = makeUserCreatedEvent();

    await dispatchClerkEvent(event, mockClerkRepo, mockSubscriptionRepo, mockMetadataProvider);

    const MockUseCase = CreateTrialSubscriptionUseCase as jest.MockedClass<typeof CreateTrialSubscriptionUseCase>;
    expect(MockUseCase).toHaveBeenCalledWith(mockSubscriptionRepo);
    expect(mockTrialExecute).toHaveBeenCalledWith('internal-user-001');
  });

  it('WHEN signupMode is freemium and event is user.created THEN CreateTrialSubscriptionUseCase.execute is NOT called', async () => {
    mockConfig.signupMode = 'freemium';
    const event = makeUserCreatedEvent();

    await dispatchClerkEvent(event, mockClerkRepo, mockSubscriptionRepo, mockMetadataProvider);

    const MockUseCase = CreateTrialSubscriptionUseCase as jest.MockedClass<typeof CreateTrialSubscriptionUseCase>;
    expect(MockUseCase).not.toHaveBeenCalled();
    expect(mockTrialExecute).not.toHaveBeenCalled();
  });

  it('WHEN signupMode is free_trial but subscriptionRepo is undefined THEN CreateTrialSubscriptionUseCase.execute is NOT called', async () => {
    mockConfig.signupMode = 'free_trial';
    const event = makeUserCreatedEvent();

    await dispatchClerkEvent(event, mockClerkRepo, undefined, mockMetadataProvider);

    const MockUseCase = CreateTrialSubscriptionUseCase as jest.MockedClass<typeof CreateTrialSubscriptionUseCase>;
    expect(MockUseCase).not.toHaveBeenCalled();
    expect(mockTrialExecute).not.toHaveBeenCalled();
  });
});

describe('dispatchClerkEvent — user.updated does not trigger trial creation (R005)', () => {
  it('WHEN event is user.updated in free_trial mode THEN CreateTrialSubscriptionUseCase.execute is NOT called', async () => {
    mockConfig.signupMode = 'free_trial';
    const event = {
      type: 'user.updated',
      data: {
        id: 'clerk-user-001',
        email_addresses: [{ email_address: 'test@example.com' }],
        first_name: 'Test',
        last_name: 'User',
        image_url: null,
      },
    } as unknown as WebhookEvent;

    await dispatchClerkEvent(event, mockClerkRepo, mockSubscriptionRepo, mockMetadataProvider);

    const MockUseCase = CreateTrialSubscriptionUseCase as jest.MockedClass<typeof CreateTrialSubscriptionUseCase>;
    expect(MockUseCase).not.toHaveBeenCalled();
  });
});

// T029 — R009, NF005, EC004: blocking metadata write on *.created events
describe('dispatchClerkEvent — blocking Clerk metadata write on created events (R009, NF005, EC004)', () => {
  it('WHEN event.type is user.created THEN metadataProvider.setUserAppId is awaited with the Clerk user ID and the internal id, after the repository upsert', async () => {
    const event = makeUserCreatedEvent();
    const callOrder: string[] = [];
    (mockClerkRepo.upsertUser as jest.Mock).mockImplementation(async () => {
      callOrder.push('upsertUser');
      return { id: 'internal-user-001' };
    });
    (mockMetadataProvider.setUserAppId as jest.Mock).mockImplementation(async () => {
      callOrder.push('setUserAppId');
    });

    await dispatchClerkEvent(event, mockClerkRepo, mockSubscriptionRepo, mockMetadataProvider);

    expect(mockMetadataProvider.setUserAppId).toHaveBeenCalledWith('clerk-user-001', 'internal-user-001');
    expect(callOrder).toEqual(['upsertUser', 'setUserAppId']);
  });

  it('WHEN event.type is organization.created THEN metadataProvider.setOrgAppId is awaited with the Clerk org ID and the internal id', async () => {
    const event = {
      type: 'organization.created',
      data: { id: 'clerk-org-001', name: 'Acme', slug: 'acme' },
    } as unknown as WebhookEvent;

    await dispatchClerkEvent(event, mockClerkRepo, mockSubscriptionRepo, mockMetadataProvider);

    expect(mockMetadataProvider.setOrgAppId).toHaveBeenCalledWith('clerk-org-001', 'internal-org-001');
  });

  it('WHEN metadataProvider.setUserAppId rejects THEN dispatchClerkEvent rejects with the same error', async () => {
    const metadataError = new Error('clerk metadata write failed');
    (mockMetadataProvider.setUserAppId as jest.Mock).mockRejectedValue(metadataError);
    const event = makeUserCreatedEvent();

    await expect(
      dispatchClerkEvent(event, mockClerkRepo, mockSubscriptionRepo, mockMetadataProvider),
    ).rejects.toBe(metadataError);
  });

  it('WHEN event.type is user.updated THEN metadataProvider.setUserAppId is NOT called', async () => {
    const event = {
      type: 'user.updated',
      data: {
        id: 'clerk-user-001',
        email_addresses: [{ email_address: 'test@example.com' }],
        first_name: 'Test',
        last_name: 'User',
        image_url: null,
      },
    } as unknown as WebhookEvent;

    await dispatchClerkEvent(event, mockClerkRepo, mockSubscriptionRepo, mockMetadataProvider);

    expect(mockMetadataProvider.setUserAppId).not.toHaveBeenCalled();
  });
});
