import * as Sentry from "@sentry/react";

interface ErrorTrackingConfig {
  dsn: string;
  environment: string;
  release: string;
}

// URL schemes used by browser extensions' injected scripts (EC003): errors whose
// entire stack originates from one of these are third-party noise, not app bugs.
const EXTENSION_URL_SCHEMES = [
  "chrome-extension:",
  "moz-extension:",
  "safari-extension:",
  "safari-web-extension:",
];

export function readErrorTrackingConfig(): ErrorTrackingConfig | null {
  const dsn = import.meta.env.VITE_ERROR_TRACKING_DSN;
  if (!dsn) return null;

  return {
    dsn,
    environment: import.meta.env.VITE_ENVIRONMENT || "production",
    release: import.meta.env.VITE_RELEASE || "unknown",
  };
}

export function isThirdPartyError(event: Sentry.ErrorEvent): boolean {
  const frames = event.exception?.values?.[0]?.stacktrace?.frames ?? [];
  if (frames.length === 0) return false;

  return frames.every((frame) =>
    EXTENSION_URL_SCHEMES.some((scheme) => frame.filename?.startsWith(scheme))
  );
}

function scrubEvent(event: Sentry.ErrorEvent): Sentry.ErrorEvent | null {
  if (isThirdPartyError(event)) return null;
  if (event.user) event.user = { id: event.user.id };
  return event;
}

export function initErrorTracking(): void {
  const config = readErrorTrackingConfig();
  if (!config) return;

  try {
    Sentry.init({
      dsn: config.dsn,
      environment: config.environment,
      release: config.release,
      sendDefaultPii: false,
      beforeSend: scrubEvent,
    });
  } catch (err) {
    // A provider/init failure must never block the app from rendering.
    console.error("Error tracking initialization failed", err);
  }
}
