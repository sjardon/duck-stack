import { createApp } from './app.js';

async function main() {
  const fastify = await createApp();

  const host = process.env.HOST ?? '0.0.0.0';
  const port = Number(process.env.PORT ?? 3000);

  await fastify.listen({ host, port });

  async function shutdown() {
    try {
      await fastify.close();
      process.exit(0);
    } catch {
      process.exit(1);
    }
  }

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main();
