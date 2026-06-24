export interface SubscriptionPlanEntity {
  id: string;
  code: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  interval: 'month' | 'year';
  features: string[];
  is_active: boolean;
  provider_plan_id: string | null;
  created_at: string;
  updated_at: string;
}
