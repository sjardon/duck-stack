import { useEffect, useRef } from "react";
import { posthog } from "../lib/analytics";
import { useCurrentUser } from "./use-current-user";

export function useSyncAnalyticsUser(): void {
  const user = useCurrentUser();
  const previousUserId = useRef<string | null>(null);

  useEffect(() => {
    if (user) {
      posthog.identify(user.id);
      previousUserId.current = user.id;
    } else if (previousUserId.current) {
      posthog.reset();
      previousUserId.current = null;
    }
    // Depend on the id, not the whole user object reference, to avoid redundant identify calls.
  }, [user?.id]);
}
