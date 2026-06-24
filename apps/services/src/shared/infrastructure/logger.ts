import pino from 'pino';
import { serverConfig } from '../configs/serverConfig.js';
import { requestContext } from './requestContext.js';

export const logger = pino({
  level: serverConfig.logLevel,
  transport:
    serverConfig.nodeEnv !== 'production'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
  mixin() {
    const store = requestContext.getStore();
    return store ? { requestId: store.requestId } : {};
  },
});
