import type { SubscriptionPlan } from '@repo/types';
import { formatCurrency } from '../../../lib/formatters';

interface PlanCardProps {
  plan: SubscriptionPlan;
  onSelect: (code: string) => void;
  loading?: boolean;
}

export default function PlanCard({ plan, onSelect, loading }: PlanCardProps): JSX.Element {
  return (
    <div>
      <h3>{plan.name}</h3>
      <p>
        {formatCurrency(plan.price, plan.currency)} / {plan.interval}
      </p>
      <ul>
        {plan.features.map((f) => (
          <li key={f}>{f}</li>
        ))}
      </ul>
      <button disabled={loading} onClick={() => onSelect(plan.code)}>
        Get started
      </button>
    </div>
  );
}
