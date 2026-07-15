-- refunds table for tracking provider-initiated refund events
CREATE TABLE refunds (
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id      UUID         NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  amount              NUMERIC      NOT NULL,
  reason              TEXT,
  status              TEXT         NOT NULL CHECK (status IN ('pending', 'approved', 'failed')),
  provider_refund_id  TEXT         NOT NULL UNIQUE,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_refunds_transaction_id ON refunds (transaction_id);

CREATE TRIGGER set_refunds_updated_at
  BEFORE UPDATE ON refunds
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
