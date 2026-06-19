import type { SupabaseClient } from '@supabase/supabase-js';

export interface UpsertUserData {
  clerkUserId: string;
  email: string;
  name: string;
  avatarUrl: string | null;
}

export interface UpsertOrganizationData {
  clerkOrgId: string;
  name: string;
  slug: string;
}

export interface CreateMembershipData {
  clerkUserId: string;
  clerkOrgId: string;
  role: string;
}

export class ClerkSyncRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async upsertUser(data: UpsertUserData): Promise<void> {
    const { error } = await this.supabase.from('users').upsert(
      {
        clerk_user_id: data.clerkUserId,
        email: data.email,
        name: data.name,
        avatar_url: data.avatarUrl,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'clerk_user_id' },
    );

    if (error) {
      throw new Error(`Failed to upsert user: ${error.message}`);
    }
  }

  async upsertOrganization(data: UpsertOrganizationData): Promise<void> {
    const { error } = await this.supabase.from('organizations').upsert(
      {
        clerk_org_id: data.clerkOrgId,
        name: data.name,
        slug: data.slug,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'clerk_org_id' },
    );

    if (error) {
      throw new Error(`Failed to upsert organization: ${error.message}`);
    }
  }

  async createMembership(data: CreateMembershipData): Promise<void> {
    // Resolve local user UUID from clerk_user_id
    const { data: userRow, error: userError } = await this.supabase
      .from('users')
      .select('id')
      .eq('clerk_user_id', data.clerkUserId)
      .maybeSingle();

    if (userError) {
      throw new Error(`Failed to look up user by clerk_user_id: ${userError.message}`);
    }

    if (!userRow) {
      console.warn(
        `[ClerkSyncRepository] createMembership: user with clerk_user_id="${data.clerkUserId}" not found; skipping membership insert (EC005)`,
      );
      return;
    }

    // Resolve local org UUID from clerk_org_id
    const { data: orgRow, error: orgError } = await this.supabase
      .from('organizations')
      .select('id')
      .eq('clerk_org_id', data.clerkOrgId)
      .maybeSingle();

    if (orgError) {
      throw new Error(`Failed to look up organization by clerk_org_id: ${orgError.message}`);
    }

    if (!orgRow) {
      console.warn(
        `[ClerkSyncRepository] createMembership: organization with clerk_org_id="${data.clerkOrgId}" not found; skipping membership insert (EC005)`,
      );
      return;
    }

    const { error } = await this.supabase.from('organization_members').upsert(
      {
        user_id: userRow.id,
        org_id: orgRow.id,
        role: data.role,
      },
      { onConflict: 'user_id,org_id', ignoreDuplicates: true },
    );

    if (error) {
      throw new Error(`Failed to insert organization membership: ${error.message}`);
    }
  }
}
