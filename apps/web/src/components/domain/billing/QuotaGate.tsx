import type { ReactNode } from 'react';
import type { QuotaName } from '@repo/types';
import { useQuota } from '../../../hooks/useQuota';
import { usePlans, useMySubscription } from '../../../hooks/use-billing';

interface QuotaGateProps {
  name: QuotaName;
  children: ReactNode;
  fallbackBlocked?: ReactNode;
  fallbackWarning?: ReactNode;
}

interface UpgradeCTAProps {
  currentPlanId: string | undefined;
}

function UpgradeCTA({ currentPlanId }: UpgradeCTAProps) {
  const { data: plans } = usePlans();
  const catalog = plans ?? [];

  const currentPlan = catalog.find((p) => p.id === currentPlanId);
  const currentPrice = currentPlan !== undefined ? currentPlan.price : Infinity;

  const nextPlan = catalog
    .filter((p) => p.price > currentPrice)
    .sort((a, b) => a.price - b.price)[0];

  if (nextPlan) {
    return (
      <a href={`/billing/subscribe?plan=${nextPlan.code}`}>Upgrade</a>
    );
  }

  return <p>You are on our highest plan — contact us for custom limits</p>;
}

function DefaultBlockedFallback({ currentPlanId }: { currentPlanId: string | undefined }) {
  return (
    <div>
      <p>You have reached the limit of your plan</p>
      <UpgradeCTA currentPlanId={currentPlanId} />
    </div>
  );
}

function DefaultWarningBanner({ currentPlanId }: { currentPlanId: string | undefined }) {
  return (
    <div>
      <p>You are approaching the limit of your plan</p>
      <UpgradeCTA currentPlanId={currentPlanId} />
    </div>
  );
}

export function QuotaGate({ name, children, fallbackBlocked, fallbackWarning }: QuotaGateProps) {
  const { state } = useQuota(name);
  const { data: subscription } = useMySubscription();

  const currentPlanId = subscription?.plan_id;

  if (state === 'hard_exceeded') {
    return <>{fallbackBlocked ?? <DefaultBlockedFallback currentPlanId={currentPlanId} />}</>;
  }

  if (state === 'soft_exceeded') {
    return (
      <>
        {children}
        {fallbackWarning ?? <DefaultWarningBanner currentPlanId={currentPlanId} />}
      </>
    );
  }

  return <>{children}</>;
}
