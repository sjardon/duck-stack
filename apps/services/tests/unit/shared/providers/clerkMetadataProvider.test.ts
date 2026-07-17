jest.mock('../../../../src/shared/infrastructure/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import { ClerkMetadataProvider } from '../../../../src/shared/providers/clerkMetadataProvider.js';
import { ProviderError } from '../../../../src/shared/errors.js';
import { logger } from '../../../../src/shared/infrastructure/logger.js';

const mockLogger = logger as unknown as {
  info: jest.Mock;
  warn: jest.Mock;
  error: jest.Mock;
};

function makeFakeClerkClient() {
  return {
    users: {
      updateUserMetadata: jest.fn().mockResolvedValue(undefined),
    },
    organizations: {
      updateOrganizationMetadata: jest.fn().mockResolvedValue(undefined),
    },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

// T009 — R008, R009: ClerkMetadataProvider writes
describe('ClerkMetadataProvider.setUserAppId', () => {
  it('WHEN called THEN calls clerkClient.users.updateUserMetadata with privateMetadata.appUserId', async () => {
    const clerkClient = makeFakeClerkClient();
    const provider = new ClerkMetadataProvider(clerkClient as never);

    await provider.setUserAppId('clerk_abc', 'internal-user-001');

    expect(clerkClient.users.updateUserMetadata).toHaveBeenCalledWith('clerk_abc', {
      privateMetadata: { appUserId: 'internal-user-001' },
    });
  });

  it('WHEN the SDK call rejects THEN logs at error and re-throws ProviderError(502)', async () => {
    const rawError = new Error('clerk api down');
    const clerkClient = makeFakeClerkClient();
    clerkClient.users.updateUserMetadata.mockRejectedValue(rawError);
    const provider = new ClerkMetadataProvider(clerkClient as never);

    let thrown: unknown;
    try {
      await provider.setUserAppId('clerk_abc', 'internal-user-001');
    } catch (e) {
      thrown = e;
    }

    expect(thrown).toBeInstanceOf(ProviderError);
    expect((thrown as ProviderError).statusCode).toBe(502);
    expect((thrown as ProviderError).originalError).toBe(rawError);
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'ClerkMetadataProvider', method: 'setUserAppId' }),
      expect.any(String),
    );
  });
});

describe('ClerkMetadataProvider.setOrgAppId', () => {
  it('WHEN called THEN calls clerkClient.organizations.updateOrganizationMetadata with privateMetadata.appOrgId', async () => {
    const clerkClient = makeFakeClerkClient();
    const provider = new ClerkMetadataProvider(clerkClient as never);

    await provider.setOrgAppId('org_abc', 'internal-org-001');

    expect(clerkClient.organizations.updateOrganizationMetadata).toHaveBeenCalledWith('org_abc', {
      privateMetadata: { appOrgId: 'internal-org-001' },
    });
  });

  it('WHEN the SDK call rejects THEN logs at error and re-throws ProviderError(502)', async () => {
    const rawError = new Error('clerk api down');
    const clerkClient = makeFakeClerkClient();
    clerkClient.organizations.updateOrganizationMetadata.mockRejectedValue(rawError);
    const provider = new ClerkMetadataProvider(clerkClient as never);

    let thrown: unknown;
    try {
      await provider.setOrgAppId('org_abc', 'internal-org-001');
    } catch (e) {
      thrown = e;
    }

    expect(thrown).toBeInstanceOf(ProviderError);
    expect((thrown as ProviderError).statusCode).toBe(502);
    expect((thrown as ProviderError).originalError).toBe(rawError);
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'ClerkMetadataProvider', method: 'setOrgAppId' }),
      expect.any(String),
    );
  });
});
