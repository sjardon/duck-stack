import pino from 'pino';
import { serverConfig } from '../configs/serverConfig.js';

export const logger = pino({
  level: serverConfig.logLevel,
  transport:
    serverConfig.nodeEnv !== 'production'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
});
