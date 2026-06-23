import type { FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../../../shared/infrastructure/db.js';
import { TransactionDBRepository } from '../repositories/transactionDBRepository.js';
import { GetRefundsUseCase } from '../useCases/getRefundsUseCase.js';

export async function getRefundsHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { id } = request.params as { id: string };

  const repo = new TransactionDBRepository(db);
  const useCase = new GetRefundsUseCase(repo);

  const refunds = await useCase.execute(id, request.userId!, request.orgId ?? null);

  return reply.send({ data: refunds });
}
