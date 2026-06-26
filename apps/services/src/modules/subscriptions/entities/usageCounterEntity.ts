export interface UsageCounterEntity {
  id: string;
  user_id: string | null;
  org_id: string | null;
  quota_name: string;
  period_start: string;
  count: number;
  created_at: string;
  updated_at: string;
}
