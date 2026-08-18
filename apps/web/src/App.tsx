import { RouterProvider } from "react-router-dom";
import { router } from "./router";
import { useSyncErrorTrackingUser } from "./hooks/use-sync-error-tracking-user";

export default function App() {
  useSyncErrorTrackingUser();
  return <RouterProvider router={router} />;
}
