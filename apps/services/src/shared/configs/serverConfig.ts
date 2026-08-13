const env = process.env || {};

const rawCorsOrigin = env.CORS_ORIGIN ?? '*';

export const serverConfig = {
  nodeEnv: env.NODE_ENV ?? 'development',
  logLevel: env.LOG_LEVEL ?? 'info',
  host: env.HOST ?? '0.0.0.0',
  port: Number(env.PORT ?? 3000),
  corsOrigin: rawCorsOrigin.includes(',')
    ? rawCorsOrigin
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean)
    : rawCorsOrigin,
};
