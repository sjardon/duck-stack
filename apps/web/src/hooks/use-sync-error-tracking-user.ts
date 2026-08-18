import { useEffect } from "react";
import * as Sentry from "@sentry/react";
import { useCurrentUser } from "./use-current-user";

export function useSyncErrorTrackingUser(): void {
  const user = useCurrentUser();

  useEffect(() => {
    if (user) {
      Sentry.setUser({ id: user.id });
    } else {
      Sentry.setUser(null);
    }
    // Depend on the id, not the whole user object reference, to avoid redundant setUser calls.
  }, [user?.id]);
}
