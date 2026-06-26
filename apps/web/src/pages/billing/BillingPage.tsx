import { useState } from 'react';
import { useMySubscription, usePlans, useCancelSubscription } from '../../hooks/use-billing';
import SubscriptionStatusCard from '../../components/domain/billing/SubscriptionStatusCard';
import CancelDialog from '../../components/domain/billing/CancelDialog';

export default function BillingPage(): JSX.Element {
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);

  const {
    data: subscriptionData,
    isLoading: subLoading,
    isError: subError,
    refetch: refetchSub,
  } = useMySubscription();

  const {
    data: plans,
    isLoading: plansLoading,
    isError: plansError,
    refetch: refetchPlans,
  } = usePlans();

  const { mutate: cancelSubscription, isPending: cancelLoading } = useCancelSubscription();

  if (subLoading || plansLoading) {
    return <div>Loading…</div>;
  }

  if (subError || plansError) {
    return (
      <div>
        <p>Failed to load billing information.</p>
        <button
          onClick={() => {
            void refetchSub();
            void refetchPlans();
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  const subscription = subscriptionData ?? null;
  const resolvedPlan = plans?.find((p) => p.id === subscription?.plan_id) ?? null;

  const handleConfirmCancel = (): void => {
    if (!subscription) return;
    cancelSubscription(
      { id: subscription.id, body: { atPeriodEnd: true } },
      { onSuccess: () => setCancelDialogOpen(false) },
    );
  };

  return (
    <div>
      <h1>Billing</h1>
      <SubscriptionStatusCard
        subscription={subscription}
        plan={resolvedPlan}
        onCancel={() => setCancelDialogOpen(true)}
        cancelLoading={cancelLoading}
        onNavigateToPricing={() => {
          window.location.href = import.meta.env.VITE_LANDING_URL as string;
        }}
      />
      <CancelDialog
        open={cancelDialogOpen}
        onConfirm={handleConfirmCancel}
        onDismiss={() => setCancelDialogOpen(false)}
        loading={cancelLoading}
      />
    </div>
  );
}
