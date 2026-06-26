import { useState, useEffect, useCallback } from 'react';
import { listPlans, type LandingPlan } from '../../api/plans';

function formatPrice(price: number, currency: string): string {
  return price.toLocaleString('en-US', { style: 'currency', currency });
}

export default function Pricing(): JSX.Element {
  const [plans, setPlans] = useState<LandingPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const data = await listPlans();
      setPlans(data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCTA = (code: string): void => {
    window.location.href = `${import.meta.env.VITE_WEB_URL}/billing/subscribe?plan=${code}`;
  };

  if (loading) {
    return (
      <section>
        <p>Loading plans…</p>
      </section>
    );
  }

  if (error) {
    return (
      <section>
        <p>Failed to load plans. Please try again.</p>
        <button onClick={() => void load()}>Retry</button>
      </section>
    );
  }

  if (plans.length === 0) {
    return (
      <section>
        <p>No plans available right now.</p>
      </section>
    );
  }

  return (
    <section>
      <h2>Pricing</h2>
      <div>
        {plans.map((plan) => (
          <div key={plan.code}>
            <h3>{plan.name}</h3>
            <p>{formatPrice(plan.price, plan.currency)}</p>
            <p>{plan.interval}</p>
            <ul>
              {plan.features.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
            <button onClick={() => handleCTA(plan.code)}>Get started</button>
          </div>
        ))}
      </div>
    </section>
  );
}
