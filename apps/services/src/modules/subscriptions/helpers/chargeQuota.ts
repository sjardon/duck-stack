import type { FastifyRequest } from 'fastify';
import { db } from '../../../shared/infrastructure/db.js';
import { UsageCounterDBRepository } from '../repositories/usageCounterDBRepository.js';
import { ChargeQuotaUseCase } from '../useCases/chargeQuotaUseCase.js';
import { ProgrammingError } from '../../../shared/errors.js';

const counterRepo = new UsageCounterDBRepository(db);
const useCase = new ChargeQuotaUseCase(counterRepo);

/**
 * Reconciles the quota reservation for `name` against the `actual` cost consumed by the handler.
 *
 * Must only be called from handlers running behind a `requireQuota(name)` preHandler in `post` mode.
 * Throws ProgrammingError if no active reservation exists for `name` on the request (R006).
 * Updates `request.quotaReservations[name].charged` after each call (R007).
 */
export async function chargeQuota(
  request: FastifyRequest,
  name: string,
  actual: number,
): Promise<void> {
  const reservation = request.quotaReservations?.[name];

  if (!reservation) {
    throw new ProgrammingError(
      `chargeQuota called for quota '${name}' with no active reservation — ensure requireQuota('${name}') is applied as a preHandler in post mode`,
    );
  }

  const newCharged = await useCase.execute(reservation, name, actual);

  reservation.charged = newCharged;
}
