import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { initErrorTracking } from "./lib/errorTracking";
import { initAnalytics } from "./lib/analytics";
import { AppErrorBoundary } from "./components/error/AppErrorBoundary";

initErrorTracking();
initAnalytics();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>
);
