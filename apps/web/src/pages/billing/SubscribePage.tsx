import { useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useSubscribe, usePlans } from '../../hooks/use-billing';
import type { ApiError } from '../../api/client';
import PlanCard from '../../components/domain/billing/PlanCard';

export default function SubscribePage(): JSX.Element {
  const [searchParams] = useSearchParams();
  const planCode = searchParams.get('plan');
  const navigate = useNavigate();
  const { mutate: fireSubscribe, isPending, error } = useSubscribe();
  const { data: plans } = usePlans();

  useEffect(() => {
    if (planCode) {
      fireSubscribe(
        { planCode },
        {
          onSuccess: (data) => {
            if (data.checkoutUrl) {
              window.location.href = data.checkoutUrl;
            } else {
              navigate('/billing');
            }
          },
        },
      );
    }
  }, []);

  const apiError = error as ApiError | null;

  if (!planCode || apiError?.status === 400) {
    return (
      <div>
        <p>Invalid or missing plan. Please choose a plan to continue.</p>
        <a href={import.meta.env.VITE_LANDING_URL}>View pricing</a>
      </div>
    );
  }

  if (apiError?.status === 409) {
    return (
      <div>
        <p>You already have an active subscription.</p>
        <a href="/billing">Go to billing</a>
      </div>
    );
  }

  const plan = plans?.find((p) => p.code === planCode) ?? null;

  return (
    <div>
      <p>Setting up your subscription…</p>
      {plan && (
        <PlanCard
          plan={plan}
          onSelect={() => {}}
          loading={isPending}
        />
      )}
    </div>
  );
}
