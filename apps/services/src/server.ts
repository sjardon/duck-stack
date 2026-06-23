import { createApp } from './app.js';
import { serverConfig } from './shared/configs/serverConfig.js';

async function main() {
  const fastify = await createApp();

  const host = serverConfig.host;
  const port = serverConfig.port;

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
