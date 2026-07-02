-- SUBS-008: extend subscriptions table to support free trial mode

-- Drop and re-add the status CHECK constraint to include 'trialing'
ALTER TABLE subscriptions
  DROP CONSTRAINT subscriptions_status_check,
  ADD CONSTRAINT subscriptions_status_check
    CHECK (status IN ('pending', 'active', 'past_due', 'canceled', 'expired', 'trialing'));

-- Add the trial_ends_at column (nullable timestamptz)
ALTER TABLE subscriptions
  ADD COLUMN trial_ends_at timestamptz;
