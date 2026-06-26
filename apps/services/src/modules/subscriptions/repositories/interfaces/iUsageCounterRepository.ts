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
   * Returns the current count (0 if no row exists) for the given scope and period.
   */
  findCount(
    userId: string | null,
    orgId: string | null,
    quotaName: string,
    periodStart: string,
  ): Promise<number>;
}
