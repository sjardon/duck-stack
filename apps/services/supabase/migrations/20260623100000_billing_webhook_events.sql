CREATE TABLE billing_webhook_events (
  id              UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider        TEXT         NOT NULL,
  event_type      TEXT         NOT NULL,
  payload         JSONB        NOT NULL,
  received_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  transaction_id  UUID         REFERENCES transactions(id) ON DELETE SET NULL,
  subscription_id UUID         -- reserved; unconstrained until subscriptions table exists
);
