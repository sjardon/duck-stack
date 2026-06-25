import type { SubscriptionStatusValue } from '@repo/types';

export interface SubscriptionEntity {
  id: string;
  user_id: string | null;
  org_id: string | null;
  plan_id: string;
  provider: string;
  provider_subscription_id: string | null;
  status: SubscriptionStatusValue;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  canceled_at: string | null;
  created_at: string;
  updated_at: string;
}
