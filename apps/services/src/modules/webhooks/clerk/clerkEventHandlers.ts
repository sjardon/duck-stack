import type { WebhookEvent } from '@clerk/backend/webhooks';
import type { UserJSON, OrganizationJSON, OrganizationMembershipJSON } from '@clerk/backend';
import type { ClerkSyncRepository } from '../repositories/clerkSyncRepository.js';
import type { ISubscriptionRepository } from '../../subscriptions/repositories/interfaces/iSubscriptionRepository.js';
import type { IClerkMetadataProvider } from '../../../shared/providers/interfaces/iClerkMetadataProvider.js';
import { subscriptionsConfig } from '../../../shared/configs/subscriptionsConfig.js';
import { CreateTrialSubscriptionUseCase } from '../../subscriptions/useCases/createTrialSubscriptionUseCase.js';

export async function handleUserUpsert(
  event: WebhookEvent & { data: UserJSON },
  repo: ClerkSyncRepository,
): Promise<{ id: string }> {
  const data = event.data;
  const email = data.email_addresses[0]?.email_address ?? '';
  const firstName = data.first_name ?? '';
  const lastName = data.last_name ?? '';
  const name = [firstName, lastName].filter(Boolean).join(' ') || email;
  const avatarUrl = data.image_url ?? null;

  return repo.upsertUser({
    clerkUserId: data.id,
    email,
    name,
    avatarUrl,
  });
}

export async function handleOrganizationUpsert(
  event: WebhookEvent & { data: OrganizationJSON },
  repo: ClerkSyncRepository,
): Promise<{ id: string }> {
  const data = event.data;

  return repo.upsertOrganization({
    clerkOrgId: data.id,
    name: data.name,
    slug: data.slug,
  });
}

export async function handleMembershipCreate(
  event: WebhookEvent & { data: OrganizationMembershipJSON },
  repo: ClerkSyncRepository,
): Promise<void> {
  const data = event.data;

  await repo.createMembership({
    clerkUserId: data.public_user_data.user_id,
    clerkOrgId: data.organization.id,
    role: data.role,
  });
}

export async function dispatchClerkEvent(
  event: WebhookEvent,
  repo: ClerkSyncRepository,
  subscriptionRepo: ISubscriptionRepository | undefined,
  metadataProvider: IClerkMetadataProvider,
): Promise<void> {
  switch (event.type) {
    case 'user.created': {
      const typedEvent = event as WebhookEvent & { data: UserJSON };
      const { id } = await handleUserUpsert(typedEvent, repo);
      // R009, NF005: blocking write so a failure surfaces as a non-2xx webhook response,
      // letting Clerk retry the event until the identity claim is persisted.
      await metadataProvider.setUserAppId(typedEvent.data.id, id);
      if (subscriptionsConfig.signupMode === 'free_trial' && subscriptionRepo) {
        await new CreateTrialSubscriptionUseCase(subscriptionRepo).execute(id);
      }
      break;
    }
    case 'user.updated':
      await handleUserUpsert(event as WebhookEvent & { data: UserJSON }, repo);
      break;
    case 'organization.created': {
      const typedEvent = event as WebhookEvent & { data: OrganizationJSON };
      const { id } = await handleOrganizationUpsert(typedEvent, repo);
      // R009, NF005: blocking write, same reliability contract as user.created above.
      await metadataProvider.setOrgAppId(typedEvent.data.id, id);
      break;
    }
    case 'organizationMembership.created':
      await handleMembershipCreate(
        event as WebhookEvent & { data: OrganizationMembershipJSON },
        repo,
      );
      break;
    default:
      // Unrecognised event type — no-op, respond HTTP 200 (EC002)
      break;
  }
}
