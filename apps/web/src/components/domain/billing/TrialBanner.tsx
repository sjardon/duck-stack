import { Link } from 'react-router-dom';
import { useTrialStatus } from '../../../hooks/useTrialStatus';

function getBannerText(daysRemaining: number): string {
  if (daysRemaining === 0) {
    return 'Less than 1 day left in your trial — upgrade now';
  }
  return `${daysRemaining} days left in your trial — upgrade now`;
}

export default function TrialBanner(): JSX.Element | null {
  const { isTrialing, daysRemaining, isLoading } = useTrialStatus();

  if (isLoading || !isTrialing || daysRemaining === null || daysRemaining > 3) {
    return null;
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 1000,
        backgroundColor: '#f59e0b',
        color: '#1f2937',
        textAlign: 'center',
        padding: '0.5rem 1rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.5rem',
      }}
    >
      <span>{getBannerText(daysRemaining)}</span>
      <Link to="/pricing" style={{ fontWeight: 'bold', textDecoration: 'underline' }}>
        Upgrade
      </Link>
    </div>
  );
}
