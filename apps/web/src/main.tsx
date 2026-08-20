import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ClerkProvider } from "@clerk/clerk-react";
import { PostHogProvider } from "@posthog/react";
import App from "./App";
import { initErrorTracking } from "./lib/errorTracking";
import { initAnalytics, adoptPropagatedIdentity, posthog } from "./lib/analytics";
import { AppErrorBoundary } from "./components/error/AppErrorBoundary";

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

if (!publishableKey) {
  throw new Error(
    "VITE_CLERK_PUBLISHABLE_KEY environment variable is missing. " +
      "Set it in your .env file before starting the web application."
  );
}

initErrorTracking();
initAnalytics();
adoptPropagatedIdentity();

const queryClient = new QueryClient();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ClerkProvider publishableKey={publishableKey}>
      <QueryClientProvider client={queryClient}>
        <PostHogProvider client={posthog}>
          <AppErrorBoundary>
            <App />
          </AppErrorBoundary>
        </PostHogProvider>
      </QueryClientProvider>
    </ClerkProvider>
  </StrictMode>
);
