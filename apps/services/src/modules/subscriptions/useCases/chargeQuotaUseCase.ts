import type { IUsageCounterRepository } from '../repositories/interfaces/iUsageCounterRepository.js';
import { resolveStrategy } from '../entitlements.js';
import { ValidationError, ProgrammingError } from '../../../shared/errors.js';
import { logger } from '../../../shared/infrastructure/logger.js';

export interface QuotaRowKey {
  userId: string | null;
  orgId: string | null;
  periodStart: string;
}

export interface QuotaReservation {
  reserved: number;
  charged: number;
  rowKey: QuotaRowKey;
}

export class ChargeQuotaUseCase {
  constructor(private readonly counterRepo: IUsageCounterRepository) {}

  /**
   * Reconciles a quota reservation against the actual cost consumed by the handler.
   *
   * - Throws ValidationError if actual < 0 (EC004).
   * - Throws ProgrammingError if the quota strategy mode is not 'post' (EC006).
   * - Computes delta = actual - reservation.charged and applies it atomically (NF001).
   * - Logs a warning when delta > 0 so operators know count may exceed hard_limit (R009).
   * - Returns the new charged value (actual).
   */
  async execute(
    reservation: QuotaReservation,
    quotaName: string,
    actual: number,
  ): Promise<number> {
    // EC004: negative actual is invalid
    if (actual < 0) {
      throw new ValidationError(`chargeQuota: actual must be >= 0, got ${actual}`);
    }

    // EC006: chargeQuota is only valid for post-mode quotas
    const strategy = resolveStrategy(quotaName);
    if (strategy.mode !== 'post') {
      throw new ProgrammingError(
        `chargeQuota called for quota '${quotaName}' which has mode '${strategy.mode}' — only 'post' mode quotas support chargeQuota`,
      );
    }

    const delta = actual - reservation.charged;

    if (delta !== 0) {
      // R009: log warning when delta is positive (count may exceed hard_limit)
      if (delta > 0) {
        logger.warn(
          { quotaName, delta, reserved: reservation.reserved, charged: reservation.charged, actual },
          'chargeQuota: positive delta — count may exceed hard_limit',
        );
      }

      await this.counterRepo.adjustCount(
        reservation.rowKey.userId,
        reservation.rowKey.orgId,
        quotaName,
        reservation.rowKey.periodStart,
        delta,
      );
    }

    return actual;
  }
}
