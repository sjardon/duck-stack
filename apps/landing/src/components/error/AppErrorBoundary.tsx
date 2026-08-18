import * as Sentry from "@sentry/react";
import type { ReactNode } from "react";
import { ErrorFallback } from "./ErrorFallback";

export function AppErrorBoundary({ children }: { children: ReactNode }) {
  return (
    <Sentry.ErrorBoundary fallback={ErrorFallback} showDialog={false}>
      {children}
    </Sentry.ErrorBoundary>
  );
}
