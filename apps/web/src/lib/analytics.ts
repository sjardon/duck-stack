import posthog from "posthog-js";

interface AnalyticsConfig {
  key: string;
  host: string;
}

export function readAnalyticsConfig(): AnalyticsConfig | null {
  const key = import.meta.env.VITE_POSTHOG_KEY;
  if (!key) return null;

  return {
    key,
    host: import.meta.env.VITE_POSTHOG_HOST || "https://us.i.posthog.com",
  };
}

function maskTextFn(text: string, element?: HTMLElement): string {
  // Masking is opt-out per element, not opt-in — only an explicit
  // data-ph-allow="true" element is ever sent unmasked.
  if (element?.dataset.phAllow === "true") return text;
  return "*".repeat(text.trim().length);
}

function resolveAnalyticsOptions(config: AnalyticsConfig) {
  return {
    api_host: config.host,
    capture_pageview: "history_change" as const,
    autocapture: false,
    capture_heatmaps: false,
    person_profiles: "identified_only" as const,
    session_recording: {
      maskAllInputs: true,
      maskTextSelector: "*",
      maskTextFn,
    },
  };
}

export function initAnalytics(): void {
  const config = readAnalyticsConfig();
  if (!config) return;

  try {
    posthog.init(config.key, resolveAnalyticsOptions(config));
  } catch (err) {
    // A provider/init failure must never block the app from rendering.
    console.error("Analytics initialization failed", err);
  }
}

export function captureEvent(name: string, properties?: Record<string, unknown>): void {
  posthog.capture(name, properties);
}

export { posthog };
