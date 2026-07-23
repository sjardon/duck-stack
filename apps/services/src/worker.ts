import 'dotenv/config';
import { startEmailWorker } from './modules/notifications/worker/emailWorker.js';
import { logger } from './shared/infrastructure/logger.js';

startEmailWorker().catch((err: unknown) => {
  // Fire-and-forget async work must not crash the process silently — log and exit
  // so the deployment platform can restart the worker.
  logger.error({ err }, 'worker: startEmailWorker crashed');
  process.exit(1);
});
