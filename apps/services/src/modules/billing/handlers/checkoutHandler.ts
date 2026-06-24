import type { FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../../../shared/infrastructure/db.js';
import { CheckoutBodySchema } from '../dtos/checkoutDto.js';
import { TransactionDBRepository } from '../repositories/transactionDBRepository.js';
import { CheckoutUseCase } from '../useCases/checkoutUseCase.js';

export async function checkoutHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const parsed = CheckoutBodySchema.safeParse(request.body);

  if (!parsed.success) {
    return reply.status(400).send({
      code: 'VALIDATION_ERROR',
      message: parsed.error.issues.map((e) => e.message).join('; '),
    });
  }

  const idempotencyKey = (request.headers['idempotency-key'] as string | undefined) ?? undefined;

  const repo = new TransactionDBRepository(db);
  const useCase = new CheckoutUseCase(repo);

  const result = await useCase.execute(
    request.userId!,
    request.orgId ?? null,
    parsed.data,
    idempotencyKey,
    request.log,
  );

  return reply.send(result);
}
