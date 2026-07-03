import type { EntitlementName, QuotaThresholds, QuotaStrategy } from '@repo/types';

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

export const DEFAULT_QUOTA_STRATEGY: QuotaStrategy = {
  unit: 'request',
  mode: 'pre',
  compute: () => 1,
};

export const QUOTA_STRATEGIES: Record<string, QuotaStrategy> = {
  api_requests: { unit: 'request', mode: 'pre', compute: () => 1 },
};

export function resolveStrategy(quotaName: string): QuotaStrategy {
  return QUOTA_STRATEGIES[quotaName] ?? DEFAULT_QUOTA_STRATEGY;
}
