#!/usr/bin/env bash
# Acceptance tests for .cloudflare/.env.deploy.web.example and
# .cloudflare/.env.deploy.landing.example (INFRA-009)
#
# Covers:
#   T018 (R006, R007, EC002) — .env.deploy.web.example declares exactly its
#                              required keys and no secret-classified name
#   T020 (R006, R007, EC002) — .env.deploy.landing.example declares exactly its
#                              required keys and no secret-classified name
#
# This is the "test" phase of INFRA-009: neither example file exists yet, so
# every assertion below is expected to FAIL until the "implement" phase creates
# them.
#
# Run: bash .cloudflare/tests/env-example.test.sh

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WEB_EXAMPLE="$REPO_ROOT/.cloudflare/.env.deploy.web.example"
LANDING_EXAMPLE="$REPO_ROOT/.cloudflare/.env.deploy.landing.example"

FAILED=0

pass() { echo "PASS: $1"; }
fail() { echo "FAIL: $1"; FAILED=1; }

SECRET_KEYS=(
  CLERK_SECRET_KEY CLERK_WEBHOOK_SIGNING_SECRET
  MOBBEX_API_KEY MOBBEX_ACCESS_TOKEN MOBBEX_WEBHOOK_SECRET
  DATABASE_URL
)

WEB_REQUIRED_KEYS=(
  CLOUDFLARE_ACCOUNT_ID CLOUDFLARE_API_TOKEN GIT_BRANCH
  VITE_API_URL VITE_CLERK_PUBLISHABLE_KEY VITE_LANDING_URL VITE_PROVIDER_PORTAL_URL
)

LANDING_REQUIRED_KEYS=(
  CLOUDFLARE_ACCOUNT_ID CLOUDFLARE_API_TOKEN GIT_BRANCH
  VITE_API_URL VITE_WEB_URL
)

# --- T018 (R006, R007, EC002): web example file -----------------------------

if [ ! -f "$WEB_EXAMPLE" ]; then
  fail "T018: $WEB_EXAMPLE does not exist"
else
  MISSING=()
  for key in "${WEB_REQUIRED_KEYS[@]}"; do
    if ! grep -qE "^${key}=" "$WEB_EXAMPLE"; then
      MISSING+=("$key")
    fi
  done
  if [ "${#MISSING[@]}" -eq 0 ]; then
    pass "T018: $WEB_EXAMPLE declares every required key (${WEB_REQUIRED_KEYS[*]})"
  else
    fail "T018: $WEB_EXAMPLE is missing a line for: ${MISSING[*]}"
  fi

  LEAKED=()
  for key in "${SECRET_KEYS[@]}"; do
    if grep -qF "$key" "$WEB_EXAMPLE"; then
      LEAKED+=("$key")
    fi
  done
  if [ "${#LEAKED[@]}" -eq 0 ]; then
    pass "T018: $WEB_EXAMPLE contains no secret-classified variable name"
  else
    fail "T018: $WEB_EXAMPLE must not mention: ${LEAKED[*]}"
  fi
fi

# --- T020 (R006, R007, EC002): landing example file --------------------------

if [ ! -f "$LANDING_EXAMPLE" ]; then
  fail "T020: $LANDING_EXAMPLE does not exist"
else
  MISSING=()
  for key in "${LANDING_REQUIRED_KEYS[@]}"; do
    if ! grep -qE "^${key}=" "$LANDING_EXAMPLE"; then
      MISSING+=("$key")
    fi
  done
  if [ "${#MISSING[@]}" -eq 0 ]; then
    pass "T020: $LANDING_EXAMPLE declares every required key (${LANDING_REQUIRED_KEYS[*]})"
  else
    fail "T020: $LANDING_EXAMPLE is missing a line for: ${MISSING[*]}"
  fi

  LEAKED=()
  for key in "${SECRET_KEYS[@]}"; do
    if grep -qF "$key" "$LANDING_EXAMPLE"; then
      LEAKED+=("$key")
    fi
  done
  if [ "${#LEAKED[@]}" -eq 0 ]; then
    pass "T020: $LANDING_EXAMPLE contains no secret-classified variable name"
  else
    fail "T020: $LANDING_EXAMPLE must not mention: ${LEAKED[*]}"
  fi
fi

exit "$FAILED"
