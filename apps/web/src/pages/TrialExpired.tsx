import { useNavigate } from 'react-router-dom';
import { usePlans, useSubscribe } from '../hooks/use-billing';
import { useInvalidateMySubscription } from '../hooks/useTrialStatus';
import PlanCard from '../components/domain/billing/PlanCard';

export default function TrialExpiredPage(): JSX.Element {
  const navigate = useNavigate();
  const { data: plans = [], isLoading } = usePlans();
  const { mutate: subscribe, isPending } = useSubscribe();
  const invalidate = useInvalidateMySubscription();

  const freePlanExists = plans.some((p) => p.code === 'free');

  function handleContinueWithFree() {
    subscribe(
      { planCode: 'free' },
      {
        onSuccess: () => {
          void invalidate();
          navigate('/');
        },
      },
    );
  }

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '2rem' }}>
      <h1>Your free trial has ended</h1>
      <p>Choose a plan to continue using the service.</p>

      {isLoading ? (
        <div>Loading plans...</div>
      ) : (
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          {plans.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              onSelect={(code) => {
                subscribe({ planCode: code });
              }}
              loading={isPending}
            />
          ))}
        </div>
      )}

      {freePlanExists && (
        <div style={{ marginTop: '1.5rem' }}>
          <button onClick={handleContinueWithFree} disabled={isPending}>
            Continue with free
          </button>
        </div>
      )}
    </div>
  );
}
