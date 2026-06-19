import type { WebhookEvent } from '@clerk/backend/webhooks';
import type { UserJSON, OrganizationJSON, OrganizationMembershipJSON } from '@clerk/backend';
import type { ClerkSyncRepository } from './repository.js';

export async function handleUserUpsert(
  event: WebhookEvent & { data: UserJSON },
  repo: ClerkSyncRepository,
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
  });
}

export async function handleOrganizationUpsert(
  event: WebhookEvent & { data: OrganizationJSON },
  repo: ClerkSyncRepository,
): Promise<void> {
  const data = event.data;

  await repo.upsertOrganization({
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
): Promise<void> {
  switch (event.type) {
    case 'user.created':
    case 'user.updated':
      await handleUserUpsert(event as WebhookEvent & { data: UserJSON }, repo);
      break;
    case 'organization.created':
      await handleOrganizationUpsert(event as WebhookEvent & { data: OrganizationJSON }, repo);
      break;
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
