import { useUser } from "@clerk/clerk-react";
import type { UserResource } from "@clerk/types";

export function useCurrentUser(): UserResource | null {
  const { user } = useUser();
  return user ?? null;
}
