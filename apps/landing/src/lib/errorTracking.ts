import * as Sentry from "@sentry/react";

interface ErrorTrackingConfig {
  dsn: string;
  environment: string;
  release: string;
}

export function readErrorTrackingConfig(): ErrorTrackingConfig | null {
  const dsn = import.meta.env.VITE_ERROR_TRACKING_DSN;
  if (!dsn) return null;

  return {
    dsn,
    environment: import.meta.env.VITE_ENVIRONMENT || "production",
    release: import.meta.env.VITE_RELEASE || "unknown",
  };
}

export function scrubEvent(event: Sentry.ErrorEvent): Sentry.ErrorEvent {
  // The landing has no session and no visitor identity to attach: nothing in
  // this app ever calls Sentry.setUser, but strip it defensively in case a
  // future dependency populates it.
  if (event.user) delete event.user;
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
    // A provider/init failure must never block the landing from rendering.
    console.error("Error tracking initialization failed", err);
  }
}
