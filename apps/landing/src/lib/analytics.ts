import posthog from "posthog-js";

interface AnalyticsConfig {
  apiKey: string;
  apiHost: string;
}

export function readAnalyticsConfig(): AnalyticsConfig | null {
  const apiKey = import.meta.env.VITE_POSTHOG_KEY;
  if (!apiKey) return null;

  return {
    apiKey,
    apiHost: import.meta.env.VITE_POSTHOG_HOST || "https://us.i.posthog.com",
  };
}

export function initAnalytics(): void {
  const config = readAnalyticsConfig();
  if (!config) return;

  try {
    posthog.init(config.apiKey, {
      api_host: config.apiHost,
      capture_pageview: false,
      autocapture: false,
      capture_heatmaps: false,
      disable_session_recording: true,
    });
  } catch (err) {
    // A provider/init failure must never block the landing from rendering.
    console.error("Analytics initialization failed", err);
  }
}

export function captureEvent(name: string, properties?: Record<string, unknown>): void {
  posthog.capture(name, properties);
}

export function getDistinctId(): string | null {
  try {
    return posthog.get_distinct_id() ?? null;
  } catch {
    return null;
  }
}
