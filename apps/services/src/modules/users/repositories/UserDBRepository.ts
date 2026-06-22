import type { SupabaseClient } from '@supabase/supabase-js';
import type { UserProfile } from '@repo/types';
import type { IUserRepository } from './interfaces/IUserRepository.js';
import type { UserEntity } from '../entities/user.entity.js';

export class UserDBRepository implements IUserRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async findByClerkUserId(clerkUserId: string): Promise<UserProfile | null> {
    const { data, error } = await this.supabase
      .from('users')
      .select('name, email, avatar_url, locale, timezone')
      .eq('clerk_user_id', clerkUserId)
      .maybeSingle<Pick<UserEntity, 'name' | 'email' | 'avatar_url' | 'locale' | 'timezone'>>();

    if (error) {
      throw new Error(`Failed to fetch user profile: ${error.message}`);
    }

    if (!data) {
      return null;
    }

    return {
      name: data.name,
      email: data.email,
      avatar_url: data.avatar_url,
      locale: data.locale,
      timezone: data.timezone,
    };
  }

  async updatePreferences(
    clerkUserId: string,
    patch: { locale?: string | null; timezone?: string | null },
  ): Promise<UserProfile> {
    const updates: Record<string, string | null> = {};
    if ('locale' in patch) updates['locale'] = patch.locale ?? null;
    if ('timezone' in patch) updates['timezone'] = patch.timezone ?? null;

    const { data, error } = await this.supabase
      .from('users')
      .update(updates)
      .eq('clerk_user_id', clerkUserId)
      .select('name, email, avatar_url, locale, timezone')
      .single<Pick<UserEntity, 'name' | 'email' | 'avatar_url' | 'locale' | 'timezone'>>();

    if (error) {
      throw new Error(`Failed to update user preferences: ${error.message}`);
    }

    return {
      name: data.name,
      email: data.email,
      avatar_url: data.avatar_url,
      locale: data.locale,
      timezone: data.timezone,
    };
  }
}
