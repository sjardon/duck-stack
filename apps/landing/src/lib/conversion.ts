const CONVERSION_FLAG_KEY = "landing_conversion_recorded";

// Shared by every hand-off call site (Pricing.tsx, CTA.tsx) so the event
// name stays a single source of truth alongside the flag it is guarded by.
export const CONVERSION_EVENT_NAME = "registration_started";

export function hasConverted(): boolean {
  return localStorage.getItem(CONVERSION_FLAG_KEY) === "true";
}

export function markConverted(): void {
  localStorage.setItem(CONVERSION_FLAG_KEY, "true");
}
