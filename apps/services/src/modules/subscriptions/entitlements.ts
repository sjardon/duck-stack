import type { EntitlementName } from '@repo/types';

export const PLAN_ENTITLEMENTS: Record<string, EntitlementName[]> = {
  free:     [],
  pro:      ['advanced_analytics', 'priority_support', 'api_access'],
  business: ['advanced_analytics', 'priority_support', 'api_access', 'team_collaboration', 'white_label'],
};
