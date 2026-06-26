import type { EntitlementName, QuotaThresholds } from '@repo/types';

export const PLAN_ENTITLEMENTS: Record<string, EntitlementName[]> = {
  free:     [],
  pro:      ['advanced_analytics', 'priority_support', 'api_access'],
  business: ['advanced_analytics', 'priority_support', 'api_access', 'team_collaboration', 'white_label'],
};

export const PLAN_QUOTAS: Record<string, Record<string, QuotaThresholds>> = {
  free:     { api_requests: { soft_limit: 80,   hard_limit: 100   } },
  pro:      { api_requests: { soft_limit: 800,  hard_limit: 1000  } },
  business: { api_requests: { soft_limit: 8000, hard_limit: 10000 } },
};
