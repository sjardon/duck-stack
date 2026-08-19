import type { ReactNode } from "react";
import { useFeatureFlag } from "../../hooks/useFeatureFlag";

interface FeatureFlagGateProps {
  flag: string;
  children: ReactNode;
  fallback?: ReactNode;
  loading?: ReactNode;
}

export function FeatureFlagGate({ flag, children, fallback = null, loading }: FeatureFlagGateProps) {
  const { enabled, isResolved } = useFeatureFlag(flag);

  if (!isResolved) return <>{loading ?? fallback}</>;
  return <>{enabled ? children : fallback}</>;
}
