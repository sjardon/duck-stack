import 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    userId: string | undefined;
    orgId: string | null | undefined;
    clerkUserId: string | undefined;
    clerkOrgId: string | null | undefined;
  }
}
