CREATE TABLE email_deliveries (
  id                  UUID         PRIMARY KEY,
  template_id         TEXT         NOT NULL,
  recipient_email     TEXT         NOT NULL,
  user_id             UUID         REFERENCES users(id) ON DELETE SET NULL,
  state               TEXT         NOT NULL DEFAULT 'queued'
                         CHECK (state IN ('queued', 'sent', 'delivered', 'bounced', 'complained', 'failed')),
  provider_message_id TEXT         UNIQUE,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TRIGGER email_deliveries_set_updated_at
  BEFORE UPDATE ON email_deliveries
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Webhook correlation lookup (R003, EC001, EC002)
CREATE UNIQUE INDEX idx_email_deliveries_provider_message_id
  ON email_deliveries (provider_message_id) WHERE provider_message_id IS NOT NULL;
