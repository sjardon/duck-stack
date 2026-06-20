-- Enable uuid-ossp extension for uuid_generate_v4()
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Reusable trigger function to keep updated_at current
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- users table
CREATE TABLE users (
  id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  clerk_user_id TEXT        UNIQUE NOT NULL,
  email         TEXT        NOT NULL,
  name          TEXT        NOT NULL,
  avatar_url    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER users_set_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- organizations table
CREATE TABLE organizations (
  id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  clerk_org_id TEXT        UNIQUE NOT NULL,
  name         TEXT        NOT NULL,
  slug         TEXT        UNIQUE NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER organizations_set_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- organization_members table
CREATE TABLE organization_members (
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id     UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role       TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, org_id)
);
