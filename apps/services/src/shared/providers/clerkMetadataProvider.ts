import type { ClerkClient } from '@clerk/backend';
import type { IClerkMetadataProvider } from './interfaces/iClerkMetadataProvider.js';
import { ProviderError } from '../errors.js';
import { logger } from '../infrastructure/logger.js';

export class ClerkMetadataProvider implements IClerkMetadataProvider {
  constructor(private readonly clerkClient: ClerkClient) {}

  async setUserAppId(clerkUserId: string, appUserId: string): Promise<void> {
    try {
      await this.clerkClient.users.updateUserMetadata(clerkUserId, {
        privateMetadata: { appUserId },
      });
    } catch (err: unknown) {
      logger.error(
        { err, provider: 'ClerkMetadataProvider', method: 'setUserAppId', clerkUserId },
        'ClerkMetadataProvider.setUserAppId failed',
      );
      throw new ProviderError('Failed to write Clerk user metadata', 502, err);
    }
  }

  async setOrgAppId(clerkOrgId: string, appOrgId: string): Promise<void> {
    try {
      await this.clerkClient.organizations.updateOrganizationMetadata(clerkOrgId, {
        privateMetadata: { appOrgId },
      });
    } catch (err: unknown) {
      logger.error(
        { err, provider: 'ClerkMetadataProvider', method: 'setOrgAppId', clerkOrgId },
        'ClerkMetadataProvider.setOrgAppId failed',
      );
      throw new ProviderError('Failed to write Clerk organization metadata', 502, err);
    }
  }
}
