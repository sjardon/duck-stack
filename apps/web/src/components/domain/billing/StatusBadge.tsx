import type { SubscriptionStatusValue } from '@repo/types';

const statusStyles: Record<SubscriptionStatusValue, React.CSSProperties> = {
  pending: { backgroundColor: '#facc15', color: '#1a1a1a' },
  active: { backgroundColor: '#22c55e', color: '#fff' },
  past_due: { backgroundColor: '#ef4444', color: '#fff' },
  canceled: { backgroundColor: '#9ca3af', color: '#fff' },
  expired: { backgroundColor: '#6b7280', color: '#fff' },
};

interface StatusBadgeProps {
  status: SubscriptionStatusValue;
}

export default function StatusBadge({ status }: StatusBadgeProps): JSX.Element {
  return (
    <span
      data-status={status}
      style={{
        ...statusStyles[status],
        padding: '2px 8px',
        borderRadius: '9999px',
        fontSize: '0.75rem',
        fontWeight: 600,
      }}
    >
      {status}
    </span>
  );
}
