import { useOrganization } from "@clerk/clerk-react";
import type { OrganizationResource } from "@clerk/types";

export function useCurrentOrg(): OrganizationResource | null {
  const { organization } = useOrganization();
  return organization ?? null;
}
