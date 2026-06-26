ALTER TABLE billing_webhook_events
  ADD CONSTRAINT billing_webhook_events_subscription_id_fkey
  FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE SET NULL;

ALTER TABLE billing_webhook_events
  ADD COLUMN event_id TEXT;

CREATE INDEX billing_webhook_events_provider_event_id_idx
  ON billing_webhook_events (provider, event_id)
  WHERE event_id IS NOT NULL;
