export interface ApiResponse<T> {
  data: T;
  success: boolean;
  message?: string;
}

export interface UserProfile {
  name: string;
  email: string;
  avatar_url: string | null;
  locale: string | null;
  timezone: string | null;
}
