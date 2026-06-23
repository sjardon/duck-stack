export interface UserEntity {
  id: string;
  clerk_user_id: string;
  email: string;
  name: string;
  avatar_url: string | null;
  locale: string | null;
  timezone: string | null;
  job_role: string | null;
  company_size: string | null;
  primary_use_case: string | null;
  onboarding_completed: boolean;
  created_at: string;
  updated_at: string;
}
