#!/usr/bin/env bash
# Acceptance test for duck-spec/docs/RUNBOOK.md (INFRA-013)
#
# This is the "test" phase of INFRA-013: duck-spec/docs/RUNBOOK.md does not
# exist yet, so every assertion below is expected to FAIL until the
# "implement" phase creates it.
#
# Run: bash duck-spec/docs/tests/runbook.test.sh

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
RUNBOOK_FILE="$REPO_ROOT/duck-spec/docs/RUNBOOK.md"

FAILED=0

pass() { echo "PASS: $1"; }
fail() { echo "FAIL: $1"; FAILED=1; }

if [ ! -f "$RUNBOOK_FILE" ]; then
  fail "$RUNBOOK_FILE does not exist"
  exit 1
fi

# --- T022 (NF001, EC004) — Maintenance rule ------------------------------------

maintenance_line="$(grep -niE '^#+[[:space:]]*maintenance rule' "$RUNBOOK_FILE" | head -n1 | cut -d: -f1)"
catalogue_line="$(grep -niE '^#+[[:space:]]*provider catalogue' "$RUNBOOK_FILE" | head -n1 | cut -d: -f1)"

if [ -n "$maintenance_line" ] && [ -n "$catalogue_line" ] && [ "$maintenance_line" -lt "$catalogue_line" ]; then
  pass "T022: 'Maintenance rule' section appears before 'Provider catalogue'"
else
  fail "T022: expected a 'Maintenance rule' heading appearing before 'Provider catalogue'"
fi

if grep -qiE 'adding|adds' "$RUNBOOK_FILE" \
  && grep -qiE 'renam' "$RUNBOOK_FILE" \
  && grep -qiE 'remov' "$RUNBOOK_FILE" \
  && grep -qiE 'environment variable' "$RUNBOOK_FILE" \
  && grep -qiE 'provider' "$RUNBOOK_FILE" \
  && grep -qiE 'deploy step' "$RUNBOOK_FILE"; then
  pass "T022: states that adding/renaming/removing an env var, provider or deploy step requires updating the runbook"
else
  fail "T022: expected a statement that adding, renaming or removing an environment variable, a provider, or a deploy step requires updating the runbook in the same change"
fi

if grep -qiE 'no credentials' "$RUNBOOK_FILE" || grep -qiE 'contains no credentials' "$RUNBOOK_FILE"; then
  pass "T022: states the document contains no credentials"
else
  fail "T022: expected a statement that the document contains no credentials"
fi

if grep -qiE 'no real environment-specific values|real environment.specific values' "$RUNBOOK_FILE"; then
  pass "T022: states the document contains no real environment-specific values"
else
  fail "T022: expected a statement that the document contains no real environment-specific values"
fi

# --- T001 (R001, R002, R003, EC003) — Provider catalogue -----------------------

if grep -qiE '^#+[[:space:]]*provider catalogue' "$RUNBOOK_FILE"; then
  pass "T001: has a 'Provider catalogue' section"
else
  fail "T001: expected a 'Provider catalogue' heading"
fi

PROVIDERS=(
  "GitHub"
  "DigitalOcean App Platform"
  "Cloudflare Pages"
  "Supabase"
  "Clerk"
  "Mobbex"
  "Resend"
  "Better Stack — Logs & Uptime"
  "Better Stack — error tracking"
  "PostHog"
)

for provider in "${PROVIDERS[@]}"; do
  if grep -qF "$provider" "$RUNBOOK_FILE"; then
    pass "T001: provider catalogue references '$provider'"
  else
    fail "T001: expected the provider catalogue to have a row for '$provider'"
  fi
done

if grep -qiE 'used for' "$RUNBOOK_FILE" \
  && grep -qiE 'resources to create' "$RUNBOOK_FILE" \
  && grep -qiE 'credentials issued' "$RUNBOOK_FILE"; then
  pass "T001: provider catalogue table has 'Used for', 'Resources to create' and 'Credentials issued' columns"
else
  fail "T001: expected the provider catalogue table to have 'Used for', 'Resources to create' and 'Credentials issued' columns"
fi

if grep -qF '.do/monitoring/README.md' "$RUNBOOK_FILE"; then
  pass "T001: Better Stack — Logs & Uptime row references .do/monitoring/README.md (EC003)"
else
  fail "T001: expected the Better Stack — Logs & Uptime row to reference .do/monitoring/README.md (EC003)"
fi

# --- T004 (R004, R005, R006, NF002, NF003) — Environment variable inventory ----

if grep -qiE '^#+[[:space:]]*environment variable inventory' "$RUNBOOK_FILE"; then
  pass "T004: has an 'Environment variable inventory' section"
else
  fail "T004: expected an 'Environment variable inventory' heading"
fi

for subsection in "services" "web" "landing" "Deploy tooling only"; do
  if grep -qiF "$subsection" "$RUNBOOK_FILE"; then
    pass "T004: environment variable inventory has a '$subsection' subsection"
  else
    fail "T004: expected an environment variable inventory subsection for '$subsection'"
  fi
done

ENV_VARS=(
  NODE_ENV LOG_LEVEL HOST PORT CORS_ORIGIN
  DATABASE_URL
  CLERK_SECRET_KEY CLERK_JWT_KEY CLERK_WEBHOOK_SIGNING_SECRET
  EMAIL_SENDER_ADDRESS RESEND_API_KEY
  BILLING_PROVIDER MOBBEX_API_KEY MOBBEX_ACCESS_TOKEN MOBBEX_TEST_MODE MOBBEX_TIMEOUT_MS MOBBEX_WEBHOOK_SECRET
  ERROR_TRACKING_DSN ERROR_TRACKING_SAMPLE_RATE SERVICE_VERSION
  SIGNUP_MODE FREE_TRIAL_DAYS STRICT_ENTITLEMENTS_ON_PAST_DUE
  BETTERSTACK_LOGS_TOKEN
  VITE_API_URL VITE_CLERK_PUBLISHABLE_KEY VITE_LANDING_URL VITE_PROVIDER_PORTAL_URL
  VITE_POSTHOG_KEY VITE_POSTHOG_HOST VITE_ERROR_TRACKING_DSN VITE_ENVIRONMENT VITE_RELEASE
  VITE_WEB_URL
  DO_APP_NAME GITHUB_REPO GIT_BRANCH DIGITALOCEAN_ACCESS_TOKEN
  CLOUDFLARE_ACCOUNT_ID CLOUDFLARE_API_TOKEN CLOUDFLARE_PROJECT_NAME
  BETTERSTACK_API_TOKEN BETTERSTACK_ALERT_EMAIL BETTERSTACK_MONITOR_URL
  BETTERSTACK_CHECK_FREQUENCY_SECONDS BETTERSTACK_CHECK_TIMEOUT_SECONDS
  SENTRY_AUTH_TOKEN SENTRY_ORG SENTRY_PROJECT SENTRY_URL
)

missing_vars=()
for var in "${ENV_VARS[@]}"; do
  if ! grep -qF "$var" "$RUNBOOK_FILE"; then
    missing_vars+=("$var")
  fi
done

if [ "${#missing_vars[@]}" -eq 0 ]; then
  pass "T004: every environment variable from design.md's inventory appears at least once"
else
  fail "T004: expected these environment variables to appear at least once: ${missing_vars[*]}"
fi

if grep -qiE '^#+[[:space:]]*verifiability' "$RUNBOOK_FILE" \
  || grep -qiE 'verifiability' "$RUNBOOK_FILE"; then
  if grep -qF '.do/app.yaml' "$RUNBOOK_FILE" \
    && grep -qF '.cloudflare/.env.deploy.web.example' "$RUNBOOK_FILE" \
    && grep -qF '.cloudflare/.env.deploy.landing.example' "$RUNBOOK_FILE" \
    && grep -qF '.github/README.md' "$RUNBOOK_FILE"; then
    pass "T004: 'Verifiability' paragraph names .do/app.yaml, the .cloudflare env example files and .github/README.md"
  else
    fail "T004: expected the 'Verifiability' paragraph to name .do/app.yaml, .cloudflare/.env.deploy.web.example, .cloudflare/.env.deploy.landing.example and .github/README.md"
  fi
else
  fail "T004: expected a 'Verifiability' paragraph"
fi

secret_matches="$(grep -nE 'sk_live_[A-Za-z0-9]{10,}|postgres://[^$]' "$RUNBOOK_FILE" || true)"
if [ -z "$secret_matches" ]; then
  pass "T004: no line matches a real-secret-looking pattern (NF003)"
else
  fail "T004: found lines matching a real-secret-looking pattern (NF003): $secret_matches"
fi

# --- T007 (R007, EC001, EC002, EC005) — From-scratch provisioning sequence -----

if grep -qiE '^#+[[:space:]]*from-scratch provisioning sequence' "$RUNBOOK_FILE"; then
  pass "T007: has a 'From-scratch provisioning sequence' section"
else
  fail "T007: expected a 'From-scratch provisioning sequence' heading"
fi

if grep -qiE 'scope' "$RUNBOOK_FILE" && grep -qiE 'blocking' "$RUNBOOK_FILE"; then
  pass "T007: provisioning sequence table has 'Scope' and 'Blocking' columns"
else
  fail "T007: expected the provisioning sequence table to have 'Scope' and 'Blocking' columns"
fi

if grep -qF 'per-account' "$RUNBOOK_FILE"; then
  pass "T007: at least one row is scoped 'per-account'"
else
  fail "T007: expected at least one 'per-account' row"
fi

if grep -qF 'per-environment' "$RUNBOOK_FILE"; then
  pass "T007: at least one row is scoped 'per-environment'"
else
  fail "T007: expected at least one 'per-environment' row"
fi

blocking_count="$(grep -oiE 'blocking' "$RUNBOOK_FILE" | wc -l | tr -d ' ')"
if [ "${blocking_count:-0}" -ge 2 ]; then
  pass "T007: at least two rows marked 'blocking'"
else
  fail "T007: expected at least two rows marked 'blocking', found $blocking_count"
fi

depends_count="$(grep -oiE 'Depends on' "$RUNBOOK_FILE" | wc -l | tr -d ' ')"
if [ "${depends_count:-0}" -ge 3 ]; then
  pass "T007: at least three rows contain the text 'Depends on'"
else
  fail "T007: expected at least three rows containing 'Depends on', found $depends_count"
fi

# --- T010 (R008, R009) — Deploy and deploy-specific-commit operations ---------

if grep -qiE '^#+[[:space:]]*recurring operations' "$RUNBOOK_FILE"; then
  pass "T010: has a 'Recurring operations' section"
else
  fail "T010: expected a 'Recurring operations' heading"
fi

if grep -qiE 'deploy to an environment' "$RUNBOOK_FILE"; then
  if grep -qF '.do/deploy.sh' "$RUNBOOK_FILE" && grep -qF '.cloudflare/deploy.sh' "$RUNBOOK_FILE"; then
    pass "T010: 'Deploy to an environment' subsection references .do/deploy.sh and .cloudflare/deploy.sh"
  else
    fail "T010: expected the 'Deploy to an environment' subsection to reference .do/deploy.sh and .cloudflare/deploy.sh"
  fi
else
  fail "T010: expected a 'Deploy to an environment' subsection"
fi

if grep -qiE 'deploy a specific commit' "$RUNBOOK_FILE"; then
  if grep -qF 'deploy-manual.yml' "$RUNBOOK_FILE"; then
    pass "T010: 'Deploy a specific commit' subsection references deploy-manual.yml"
  else
    fail "T010: expected the 'Deploy a specific commit' subsection to reference deploy-manual.yml"
  fi
else
  fail "T010: expected a 'Deploy a specific commit' subsection"
fi

# --- T013 (R010) — Rollback operation ------------------------------------------

if grep -qiE '^#+[[:space:]]*rollback' "$RUNBOOK_FILE"; then
  if grep -qF 'rollback.yml' "$RUNBOOK_FILE"; then
    pass "T013: 'Rollback' subsection references rollback.yml"
  else
    fail "T013: expected the 'Rollback' subsection to reference rollback.yml"
  fi

  if grep -qiE 'data' "$RUNBOOK_FILE" && grep -qiE 'not (be )?revert' "$RUNBOOK_FILE"; then
    pass "T013: states that already-applied data changes are not reverted"
  else
    fail "T013: expected a statement that already-applied data changes are not reverted"
  fi
else
  fail "T013: expected a 'Rollback' subsection"
fi

# --- T016 (R011) — Credential rotation operation -------------------------------

if grep -qiE '^#+[[:space:]]*credential rotation' "$RUNBOOK_FILE"; then
  pass "T016: has a 'Credential rotation' subsection"

  if grep -qiE 'backend secret' "$RUNBOOK_FILE" \
    && grep -qiE 'VITE_' "$RUNBOOK_FILE" \
    && grep -qiE 'deploy-tooling-only secret|deploy tooling.only secret' "$RUNBOOK_FILE"; then
    pass "T016: per-category table covers backend secret, public VITE_* value and deploy-tooling-only secret"
  else
    fail "T016: expected the per-category table to cover backend secret, public VITE_* value and deploy-tooling-only secret"
  fi

  if grep -qiE 'revoke' "$RUNBOOK_FILE" && grep -qiE 'reissu' "$RUNBOOK_FILE"; then
    pass "T016: states the revoke/reissue universal sub-step"
  else
    fail "T016: expected a revoke-and-reissue universal sub-step"
  fi

  if grep -qiE 'every place' "$RUNBOOK_FILE" || grep -qiE 'every.*stor' "$RUNBOOK_FILE"; then
    pass "T016: states the 'update every stored location' universal sub-step"
  else
    fail "T016: expected an 'update every place the value is stored' universal sub-step"
  fi

  if grep -qiE 'redeploy' "$RUNBOOK_FILE"; then
    pass "T016: states the redeploy universal sub-step"
  else
    fail "T016: expected a 'redeploy' universal sub-step"
  fi
else
  fail "T016: expected a 'Credential rotation' subsection"
fi

# --- T019 (R012) — Manual steps enumeration ------------------------------------

if grep -qiE '^#+[[:space:]]*manual steps enumeration' "$RUNBOOK_FILE"; then
  pass "T019: has a 'Manual steps enumeration' subsection"

  step_ref_count="$(grep -oiE '\bstep [0-9]+\b' "$RUNBOOK_FILE" | sort -u | wc -l | tr -d ' ')"
  if [ "${step_ref_count:-0}" -ge 4 ]; then
    pass "T019: cross-references at least four distinct step numbers from the provisioning sequence"
  else
    fail "T019: expected at least four distinct 'step N' cross-references, found $step_ref_count"
  fi
else
  fail "T019: expected a 'Manual steps enumeration' subsection"
fi

exit "$FAILED"
