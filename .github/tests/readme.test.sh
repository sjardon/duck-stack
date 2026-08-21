#!/usr/bin/env bash
# Acceptance test for .github/README.md (INFRA-012)
#
# Covers T029 (NF001, NF002, EC001, EC003, EC004, EC005, EC006) — the
# pipeline runbook documents:
#   - every vars.*/secrets.* name from the design's per-environment contract
#   - the EC001 partial-failure recovery procedure (re-run deploy-manual.yml
#     with the same commit, or rollback.yml with the previous one)
#   - the EC003 rollback data-caveat verbatim ("not reverted" + "database
#     state", case-insensitive)
#   - the EC004/R007 concurrency queueing behavior
#   - the EC005 cross-reference (new placeholders must be added to
#     app.yaml/the values contract and to the environment's CI configuration)
#   - the EC006 wait-for-all-three-apps guarantee
#   - that no secret is ever committed (NF001)
#   - that a partial delivery always fails the run (NF002)
#
# This is the "test" phase of INFRA-012: .github/README.md does not exist
# yet, so every assertion below is expected to FAIL until the "implement"
# phase creates it.
#
# Run: bash .github/tests/readme.test.sh

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
README_FILE="$REPO_ROOT/.github/README.md"

FAILED=0

pass() { echo "PASS: $1"; }
fail() { echo "FAIL: $1"; FAILED=1; }

if [ ! -f "$README_FILE" ]; then
  fail "T029: $README_FILE does not exist"
  exit "$FAILED"
fi

VAR_NAMES=(
  DO_APP_NAME NODE_ENV LOG_LEVEL HOST PORT CORS_ORIGIN EMAIL_SENDER_ADDRESS
  BILLING_PROVIDER MOBBEX_TEST_MODE MOBBEX_TIMEOUT_MS ERROR_TRACKING_SAMPLE_RATE
  SIGNUP_MODE FREE_TRIAL_DAYS STRICT_ENTITLEMENTS_ON_PAST_DUE GIT_BRANCH
  VITE_API_URL VITE_CLERK_PUBLISHABLE_KEY VITE_LANDING_URL VITE_PROVIDER_PORTAL_URL
  VITE_WEB_URL VITE_ENVIRONMENT VITE_POSTHOG_KEY VITE_POSTHOG_HOST
  VITE_ERROR_TRACKING_DSN SENTRY_ORG SENTRY_PROJECT SENTRY_URL
)

SECRET_NAMES=(
  DIGITALOCEAN_ACCESS_TOKEN DATABASE_URL CLERK_SECRET_KEY CLERK_JWT_KEY
  CLERK_WEBHOOK_SIGNING_SECRET RESEND_API_KEY MOBBEX_API_KEY MOBBEX_ACCESS_TOKEN
  MOBBEX_WEBHOOK_SECRET ERROR_TRACKING_DSN BETTERSTACK_LOGS_TOKEN
  CLOUDFLARE_ACCOUNT_ID CLOUDFLARE_API_TOKEN SENTRY_AUTH_TOKEN
)

MISSING=0
for name in "${VAR_NAMES[@]}" "${SECRET_NAMES[@]}"; do
  grep -qF "$name" "$README_FILE" || { MISSING=1; echo "  missing: $name"; }
done
if [ "$MISSING" -eq 0 ]; then
  pass "T029: $README_FILE lists every vars.*/secrets.* name from the per-environment contract"
else
  fail "T029: expected $README_FILE to list every vars.*/secrets.* name from the per-environment contract (see missing names above)"
fi

if grep -qF 'deploy-manual.yml' "$README_FILE" && grep -qF 'rollback.yml' "$README_FILE" \
  && grep -qiE 'same commit' "$README_FILE" && grep -qiE 'previous' "$README_FILE"; then
  pass "T029: $README_FILE states the EC001 partial-failure recovery procedure"
else
  fail "T029: expected $README_FILE to state the EC001 recovery procedure (re-run deploy-manual.yml with the same commit, or rollback.yml with the previous one)"
fi

if grep -qiF 'not reverted' "$README_FILE" && grep -qiF 'database state' "$README_FILE"; then
  pass "T029: $README_FILE states the EC003 rollback data-caveat"
else
  fail "T029: expected $README_FILE to state the EC003 rollback data-caveat ('not reverted' + 'database state')"
fi

if grep -qiE 'concurrency' "$README_FILE" && grep -qiE 'queue|hold' "$README_FILE" \
  && grep -qiE 'cancel' "$README_FILE"; then
  pass "T029: $README_FILE states the EC004/R007 concurrency queueing behavior"
else
  fail "T029: expected $README_FILE to state the EC004/R007 concurrency queueing behavior (holds instead of cancelling)"
fi

if grep -qiE 'app\.yaml' "$README_FILE" && grep -qiE "environment'?s? CI configuration" "$README_FILE"; then
  pass "T029: $README_FILE states the EC005 cross-reference"
else
  fail "T029: expected $README_FILE to state the EC005 cross-reference (new placeholders added to app.yaml/the values contract and to the environment's CI configuration)"
fi

if grep -qiE 'all three' "$README_FILE" && grep -qiE 'wait' "$README_FILE"; then
  pass "T029: $README_FILE states the EC006 wait-for-all-three-apps guarantee"
else
  fail "T029: expected $README_FILE to state the EC006 wait-for-all-three-apps guarantee"
fi

if grep -qiE 'no secret' "$README_FILE" || grep -qiE 'never (be )?committed' "$README_FILE"; then
  pass "T029: $README_FILE states that no secret is ever committed (NF001)"
else
  fail "T029: expected $README_FILE to state that no secret is ever committed (NF001)"
fi

if grep -qiE 'partial delivery' "$README_FILE" && grep -qiE 'fail' "$README_FILE"; then
  pass "T029: $README_FILE states that a partial delivery always fails the run (NF002)"
else
  fail "T029: expected $README_FILE to state that a partial delivery always fails the run (NF002)"
fi

exit "$FAILED"
