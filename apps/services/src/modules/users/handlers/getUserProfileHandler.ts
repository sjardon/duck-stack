import type { FastifyRequest, FastifyReply } from 'fastify';
import { supabase } from '../../../shared/infrastructure/supabase.js';
import { UserDBRepository } from '../repositories/UserDBRepository.js';
import { GetUserProfileUseCase } from '../useCases/GetUserProfileUseCase.js';

export async function getUserProfileHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const repo = new UserDBRepository(supabase);
  const useCase = new GetUserProfileUseCase(repo);

  const profile = await useCase.execute(request.userId!);

  return reply.send({ data: profile });
}
