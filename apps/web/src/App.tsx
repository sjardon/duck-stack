import { RouterProvider } from "react-router-dom";
import { router } from "./router";
import { useSyncErrorTrackingUser } from "./hooks/use-sync-error-tracking-user";
import { useSyncAnalyticsUser } from "./hooks/use-sync-analytics-user";

export default function App() {
  useSyncErrorTrackingUser();
  useSyncAnalyticsUser();
  return <RouterProvider router={router} />;
}
