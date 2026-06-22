export interface UserEntity {
  id: string;
  clerk_user_id: string;
  email: string;
  name: string;
  avatar_url: string | null;
  locale: string | null;
  timezone: string | null;
  created_at: string;
  updated_at: string;
}
