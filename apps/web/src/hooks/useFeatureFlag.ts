import { useFeatureFlagEnabled } from "@posthog/react";
import { readAnalyticsConfig } from "../lib/analytics";

export interface FeatureFlagState {
  enabled: boolean;
  isResolved: boolean;
}

export function useFeatureFlag(key: string): FeatureFlagState {
  const rawValue = useFeatureFlagEnabled(key); // always called — Rules of Hooks

  if (!readAnalyticsConfig()) {
    return { enabled: false, isResolved: true };
  }
  if (rawValue === undefined) {
    return { enabled: false, isResolved: false };
  }
  return { enabled: rawValue, isResolved: true };
}
