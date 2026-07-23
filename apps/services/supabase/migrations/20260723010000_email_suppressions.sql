CREATE TABLE email_suppressions (
  email         TEXT         PRIMARY KEY,
  reason        TEXT         NOT NULL CHECK (reason IN ('bounce', 'complaint')),
  suppressed_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TRIGGER email_suppressions_set_updated_at
  BEFORE UPDATE ON email_suppressions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- R004: widen email_deliveries.state to include the new 'suppressed' terminal state.
ALTER TABLE email_deliveries DROP CONSTRAINT email_deliveries_state_check;

ALTER TABLE email_deliveries
  ADD CONSTRAINT email_deliveries_state_check
    CHECK (state IN ('queued', 'sent', 'delivered', 'bounced', 'complained', 'failed', 'suppressed'));
