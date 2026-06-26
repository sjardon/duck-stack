CREATE TABLE usage_counters (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      text        REFERENCES users(id) ON DELETE SET NULL,
  org_id       text        REFERENCES organizations(id) ON DELETE SET NULL,
  quota_name   text        NOT NULL,
  period_start timestamptz NOT NULL,
  count        integer     NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT usage_counters_scope_check CHECK (
    user_id IS NOT NULL OR org_id IS NOT NULL
  ),
  CONSTRAINT usage_counters_unique UNIQUE (user_id, org_id, quota_name, period_start)
);

CREATE INDEX usage_counters_user_idx
  ON usage_counters (user_id, quota_name, period_start)
  WHERE user_id IS NOT NULL;

CREATE INDEX usage_counters_org_idx
  ON usage_counters (org_id, quota_name, period_start)
  WHERE org_id IS NOT NULL;
