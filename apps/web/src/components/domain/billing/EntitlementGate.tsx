import type { ReactNode } from 'react';
import type { EntitlementName } from '@repo/types';
import { useEntitlement } from '../../../hooks/use-entitlement';

function UpgradeCTA() {
  return (
    <div>
      <p>Upgrade your plan to access this feature.</p>
      <a href="/billing">Upgrade now</a>
    </div>
  );
}

interface EntitlementGateProps {
  name: EntitlementName;
  children: ReactNode;
  fallback?: ReactNode;
}

export function EntitlementGate({ name, children, fallback }: EntitlementGateProps) {
  const hasEntitlement = useEntitlement(name);
  if (hasEntitlement) return <>{children}</>;
  return <>{fallback ?? <UpgradeCTA />}</>;
}
