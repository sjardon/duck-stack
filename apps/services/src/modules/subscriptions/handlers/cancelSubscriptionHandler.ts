import type { FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../../../shared/infrastructure/db.js';
import { resolveProvider } from '../../billing/providers/resolveProvider.js';
import { CancelSubscriptionBodySchema } from '../dtos/cancelSubscriptionDto.js';
import { SubscriptionDBRepository } from '../repositories/subscriptionDBRepository.js';
import { CancelSubscriptionUseCase } from '../useCases/cancelSubscriptionUseCase.js';

export async function cancelSubscriptionHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { id } = request.params as { id: string };

  const parsed = CancelSubscriptionBodySchema.safeParse(request.body);

  if (!parsed.success) {
    return reply.status(400).send({
      code: 'VALIDATION_ERROR',
      message: parsed.error.issues.map((e) => e.message).join('; '),
    });
  }

  const repo = new SubscriptionDBRepository(db);
  const useCase = new CancelSubscriptionUseCase(repo, resolveProvider());

  const subscription = await useCase.execute(
    request.userId!,
    request.orgId ?? null,
    id,
    parsed.data,
  );

  return reply.send({ subscription });
}
