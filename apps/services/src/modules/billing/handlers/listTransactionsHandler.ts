import type { FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../../../shared/infrastructure/db.js';
import { ListTransactionsQuerySchema } from '../dtos/checkout.dto.js';
import { TransactionDBRepository } from '../repositories/transactionDBRepository.js';
import { ListTransactionsUseCase } from '../useCases/listTransactionsUseCase.js';

export async function listTransactionsHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const parsed = ListTransactionsQuerySchema.safeParse(request.query);

  if (!parsed.success) {
    return reply.status(400).send({
      code: 'VALIDATION_ERROR',
      message: parsed.error.issues.map((e) => e.message).join('; '),
    });
  }

  const { limit, cursor } = parsed.data;

  const repo = new TransactionDBRepository(db);
  const useCase = new ListTransactionsUseCase(repo);

  const result = await useCase.execute(request.userId!, request.orgId ?? null, { limit, cursor });

  return reply.send(result);
}
