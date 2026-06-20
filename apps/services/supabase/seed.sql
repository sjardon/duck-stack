-- Seed data for local development
-- All inserts are idempotent via ON CONFLICT DO NOTHING

-- Example users
INSERT INTO users (id, clerk_user_id, email, name, avatar_url)
VALUES
  (
    '00000000-0000-0000-0000-000000000001',
    'user_seed_alice',
    'alice@example.com',
    'Alice Example',
    'https://example.com/avatars/alice.png'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'user_seed_bob',
    'bob@example.com',
    'Bob Example',
    NULL
  )
ON CONFLICT DO NOTHING;

-- Example organization
INSERT INTO organizations (id, clerk_org_id, name, slug)
VALUES
  (
    '00000000-0000-0000-0000-000000000010',
    'org_seed_acme',
    'Acme Corp',
    'acme-corp'
  )
ON CONFLICT DO NOTHING;

-- Example organization memberships
INSERT INTO organization_members (user_id, org_id, role)
VALUES
  (
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000010',
    'admin'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000010',
    'member'
  )
ON CONFLICT DO NOTHING;
