-- transactions table for billing checkout records
CREATE TABLE transactions (
  id                     UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id                UUID         REFERENCES users(id) ON DELETE SET NULL,
  org_id                 UUID         REFERENCES organizations(id) ON DELETE SET NULL,
  provider               TEXT         NOT NULL,
  provider_transaction_id TEXT,
  amount                 NUMERIC      NOT NULL,
  currency               TEXT         NOT NULL,
  status                 TEXT         NOT NULL
                           CHECK (status IN ('pending', 'approved', 'failed', 'refunded')),
  description            TEXT         NOT NULL,
  reference              TEXT         NOT NULL UNIQUE,
  idempotency_key        TEXT         UNIQUE,
  metadata               JSONB,
  failure_reason         TEXT,
  checkout_url           TEXT,
  created_at             TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TRIGGER transactions_set_updated_at
  BEFORE UPDATE ON transactions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Indexes for paginated listing queries (EC005, NF003)
CREATE INDEX idx_transactions_user_created_at
  ON transactions (user_id, created_at DESC);

CREATE INDEX idx_transactions_org_created_at
  ON transactions (org_id, created_at DESC);
