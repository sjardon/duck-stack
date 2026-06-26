export interface LandingPlan {
  code: string;
  name: string;
  price: number;
  currency: string;
  interval: 'month' | 'year';
  features: string[];
}

export async function listPlans(): Promise<LandingPlan[]> {
  const response = await fetch(`${import.meta.env.VITE_API_URL}/billing/plans`);
  if (!response.ok) {
    throw new Error(`Failed to fetch plans: ${response.statusText}`);
  }
  const json = (await response.json()) as { data: LandingPlan[] };
  return json.data;
}
