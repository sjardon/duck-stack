import type { FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../../../shared/infrastructure/db.js';
import { TransactionDBRepository } from '../repositories/transactionDBRepository.js';
import { GetTransactionUseCase } from '../useCases/getTransactionUseCase.js';

export async function getTransactionHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { id } = request.params as { id: string };

  const repo = new TransactionDBRepository(db);
  const useCase = new GetTransactionUseCase(repo);

  const transaction = await useCase.execute(id, request.userId!, request.orgId ?? null, request.log);

  return reply.send({ data: transaction });
}
