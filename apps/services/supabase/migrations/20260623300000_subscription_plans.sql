CREATE TABLE subscription_plans (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  code             text        NOT NULL UNIQUE,
  name             text        NOT NULL,
  description      text        NOT NULL,
  price            numeric     NOT NULL CHECK (price >= 0),
  currency         text        NOT NULL,
  interval         text        NOT NULL CHECK (interval IN ('month', 'year')),
  features         jsonb       NOT NULL DEFAULT '[]',
  is_active        boolean     NOT NULL DEFAULT true,
  provider_plan_id text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

INSERT INTO subscription_plans (id, code, name, description, price, currency, interval, features, is_active, provider_plan_id)
VALUES
  (
    '00000000-0000-0000-0001-000000000001',
    'free',
    'Free',
    'Get started at no cost.',
    0,
    'USD',
    'month',
    '["Up to 3 projects", "Community support"]',
    true,
    null
  ),
  (
    '00000000-0000-0000-0001-000000000002',
    'pro',
    'Pro',
    'For individuals and small teams.',
    12,
    'USD',
    'month',
    '["Unlimited projects", "Priority support", "Advanced analytics"]',
    true,
    null
  ),
  (
    '00000000-0000-0000-0001-000000000003',
    'business',
    'Business',
    'For growing teams that need more power.',
    49,
    'USD',
    'month',
    '["Everything in Pro", "SSO", "SLA", "Dedicated support"]',
    true,
    null
  )
ON CONFLICT (code) DO NOTHING;
