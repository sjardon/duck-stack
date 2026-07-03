export interface IUsageCounterRepository {
  /**
   * Atomically increments the counter for (userId, orgId, quotaName, periodStart).
   * Returns the new count after the increment.
   * Satisfies NF001: INSERT … ON CONFLICT DO UPDATE is atomic at the Postgres row level.
   */
  incrementAndReturn(
    userId: string | null,
    orgId: string | null,
    quotaName: string,
    periodStart: string,
  ): Promise<number>;

  /**
   * Atomically increments the counter by `cost` (instead of 1) for (userId, orgId, quotaName, periodStart).
   * Returns the new count after the increment.
   * Uses INSERT … ON CONFLICT DO UPDATE SET count = usage_counters.count + cost RETURNING count.
   */
  incrementByAndReturn(
    userId: string | null,
    orgId: string | null,
    quotaName: string,
    periodStart: string,
    cost: number,
  ): Promise<number>;

  /**
   * Atomically applies delta (positive or negative) to an existing row via
   * UPDATE … SET count = count + delta with no prior SELECT.
   * If no row exists the UPDATE is a no-op.
   * When delta === 0 the method resolves immediately without issuing a query.
   */
  adjustCount(
    userId: string | null,
    orgId: string | null,
    quotaName: string,
    periodStart: string,
    delta: number,
  ): Promise<void>;

  /**
   * Returns the current count (0 if no row exists) for the given scope and period.
   */
  findCount(
    userId: string | null,
    orgId: string | null,
    quotaName: string,
    periodStart: string,
  ): Promise<number>;
}
