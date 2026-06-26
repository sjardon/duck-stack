import type { Subscription, SubscriptionPlan } from '@repo/types';
import { formatDate } from '../../../lib/formatters';
import StatusBadge from './StatusBadge';

interface SubscriptionStatusCardProps {
  subscription: Subscription | null;
  plan: SubscriptionPlan | null;
  onCancel: () => void;
  cancelLoading: boolean;
  onNavigateToPricing: () => void;
}

export default function SubscriptionStatusCard({
  subscription,
  plan,
  onCancel,
  cancelLoading,
  onNavigateToPricing,
}: SubscriptionStatusCardProps): JSX.Element {
  if (subscription === null) {
    return (
      <div>
        <p>You are on the free plan.</p>
        <button onClick={onNavigateToPricing}>View pricing</button>
      </div>
    );
  }

  if (subscription.status === 'past_due') {
    return (
      <div>
        <StatusBadge status="past_due" />
        <p>Your last payment failed — please update your payment method.</p>
        <a
          href={import.meta.env.VITE_PROVIDER_PORTAL_URL}
          target="_blank"
          rel="noopener noreferrer"
        >
          Go to customer portal
        </a>
      </div>
    );
  }

  if (subscription.status === 'canceled') {
    return (
      <div>
        <StatusBadge status="canceled" />
        {subscription.current_period_end && (
          <p>Canceled — access ends {formatDate(subscription.current_period_end)}</p>
        )}
      </div>
    );
  }

  return (
    <div>
      {plan ? (
        <p>{plan.name}</p>
      ) : (
        <p>{subscription.plan_id} (legacy plan)</p>
      )}
      <StatusBadge status={subscription.status} />
      {subscription.current_period_end && (
        <p>Renews {formatDate(subscription.current_period_end)}</p>
      )}
      <button disabled={cancelLoading} onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}
