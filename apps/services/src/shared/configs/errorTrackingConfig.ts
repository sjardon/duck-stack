const env = process.env || {};

export const errorTrackingConfig = {
  dsn: env.ERROR_TRACKING_DSN ?? '',
  enabled: Boolean(env.ERROR_TRACKING_DSN),
  environment: env.NODE_ENV ?? 'development',
  release: env.SERVICE_VERSION ?? 'unknown',
  sampleRate: env.ERROR_TRACKING_SAMPLE_RATE ? Number(env.ERROR_TRACKING_SAMPLE_RATE) : 0.2,
};
