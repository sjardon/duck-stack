import type { BaseLogger } from 'pino';
import type { WebhookEvent } from '@clerk/backend/webhooks';
import type { UserJSON, OrganizationJSON, OrganizationMembershipJSON } from '@clerk/backend';
import type { ClerkSyncRepository } from '../repositories/clerkSyncRepository.js';

export async function handleUserUpsert(
  event: WebhookEvent & { data: UserJSON },
  repo: ClerkSyncRepository,
  logger: BaseLogger,
): Promise<void> {
  const data = event.data;
  const email = data.email_addresses[0]?.email_address ?? '';
  const firstName = data.first_name ?? '';
  const lastName = data.last_name ?? '';
  const name = [firstName, lastName].filter(Boolean).join(' ') || email;
  const avatarUrl = data.image_url ?? null;

  await repo.upsertUser({
    clerkUserId: data.id,
    email,
    name,
    avatarUrl,
  }, logger);
}

export async function handleOrganizationUpsert(
  event: WebhookEvent & { data: OrganizationJSON },
  repo: ClerkSyncRepository,
  logger: BaseLogger,
): Promise<void> {
  const data = event.data;

  await repo.upsertOrganization({
    clerkOrgId: data.id,
    name: data.name,
    slug: data.slug,
  }, logger);
}

export async function handleMembershipCreate(
  event: WebhookEvent & { data: OrganizationMembershipJSON },
  repo: ClerkSyncRepository,
  logger: BaseLogger,
): Promise<void> {
  const data = event.data;

  await repo.createMembership({
    clerkUserId: data.public_user_data.user_id,
    clerkOrgId: data.organization.id,
    role: data.role,
  }, logger);
}

export async function dispatchClerkEvent(
  event: WebhookEvent,
  repo: ClerkSyncRepository,
  logger: BaseLogger,
): Promise<void> {
  switch (event.type) {
    case 'user.created':
    case 'user.updated':
      await handleUserUpsert(event as WebhookEvent & { data: UserJSON }, repo, logger);
      break;
    case 'organization.created':
      await handleOrganizationUpsert(event as WebhookEvent & { data: OrganizationJSON }, repo, logger);
      break;
    case 'organizationMembership.created':
      await handleMembershipCreate(
        event as WebhookEvent & { data: OrganizationMembershipJSON },
        repo,
        logger,
      );
      break;
    default:
      // Unrecognised event type — no-op, respond HTTP 200 (EC002)
      break;
  }
}
