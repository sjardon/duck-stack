CREATE TABLE subscriptions (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  uuid        REFERENCES users(id) ON DELETE SET NULL,
  org_id                   uuid        REFERENCES organizations(id) ON DELETE SET NULL,
  plan_id                  uuid        NOT NULL REFERENCES subscription_plans(id),
  provider                 text        NOT NULL,
  provider_subscription_id text,
  status                   text        NOT NULL
    CHECK (status IN ('pending', 'active', 'past_due', 'canceled', 'expired')),
  current_period_start     timestamptz,
  current_period_end       timestamptz,
  cancel_at_period_end     boolean     NOT NULL DEFAULT false,
  canceled_at              timestamptz,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX subscriptions_active_per_user
  ON subscriptions (user_id)
  WHERE user_id IS NOT NULL AND status NOT IN ('canceled', 'expired');

CREATE UNIQUE INDEX subscriptions_active_per_org
  ON subscriptions (org_id)
  WHERE org_id IS NOT NULL AND status NOT IN ('canceled', 'expired');
