ALTER TABLE users
  ADD COLUMN job_role             TEXT,
  ADD COLUMN company_size         TEXT,
  ADD COLUMN primary_use_case     TEXT,
  ADD COLUMN onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE;
