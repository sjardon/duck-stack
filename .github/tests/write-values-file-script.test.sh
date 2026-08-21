#!/usr/bin/env bash
# Acceptance tests for .github/scripts/write-values-file.sh (INFRA-012)
#
# Covers:
#   T004 (R008) — against a fixture file containing ${FOO}/${BAR} placeholders
#     (standing in for .do/app.yaml), with FOO/BAR exported in the
#     environment, `write-values-file.sh services <out> <fixture-path>`
#     (test-only third arg overriding the default .do/app.yaml path) writes
#     exactly FOO=<value> and BAR=<value> to <out>, sorted and de-duplicated
#     the same way .do/deploy.sh's validate_placeholders() already does.
#   T005 (R008) — `write-values-file.sh web <out>` writes the fixed web
#     manifest (common + web-only + shared optional keys), present with their
#     exported values or empty when unset; `write-values-file.sh landing
#     <out>` writes the same common+optional set plus VITE_API_URL,
#     VITE_WEB_URL only (no web-only keys).
#
# This is the "test" phase of INFRA-012: .github/scripts/write-values-file.sh
# does not exist yet, so every assertion below is expected to FAIL until the
# "implement" phase creates it.
#
# Run: bash .github/tests/write-values-file-script.test.sh

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="$REPO_ROOT/.github/scripts/write-values-file.sh"

FAILED=0

pass() { echo "PASS: $1"; }
fail() { echo "FAIL: $1"; FAILED=1; }

WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

if [ ! -f "$SCRIPT" ]; then
  fail "T004: $SCRIPT does not exist"
  fail "T005: $SCRIPT does not exist"
  exit "$FAILED"
fi
if [ ! -x "$SCRIPT" ]; then
  fail "T004: $SCRIPT is not executable"
fi

# --- T004 (R008): services derives its manifest from app.yaml-like placeholders ---
FIXTURE_FILE="$WORK_DIR/fixture-app.yaml"
cat > "$FIXTURE_FILE" <<'EOF'
name: some-app
envs:
  - key: FOO
    value: "${FOO}"
  - key: BAR
    value: "${BAR}"
  - key: FOO_DUPLICATE_REFERENCE
    value: "${FOO}"
EOF

SERVICES_OUT="$WORK_DIR/services.env"
rm -f "$SERVICES_OUT"

FOO="foo-value" BAR="bar-value" "$SCRIPT" services "$SERVICES_OUT" "$FIXTURE_FILE" >/dev/null 2>&1
SERVICES_EXIT=$?

if [ "$SERVICES_EXIT" -eq 0 ]; then
  pass "T004: write-values-file.sh services <out> <fixture> exits 0"
else
  fail "T004: expected write-values-file.sh services <out> <fixture> to exit 0, got exit $SERVICES_EXIT"
fi

if [ -f "$SERVICES_OUT" ]; then
  SERVICES_CONTENT="$(sort "$SERVICES_OUT")"
  EXPECTED_CONTENT="$(printf 'BAR=bar-value\nFOO=foo-value\n' | sort)"
  if [ "$SERVICES_CONTENT" = "$EXPECTED_CONTENT" ]; then
    pass "T004: $SERVICES_OUT contains exactly FOO=foo-value and BAR=bar-value, sorted and de-duplicated"
  else
    fail "T004: expected $SERVICES_OUT to contain exactly:
$EXPECTED_CONTENT
got:
$SERVICES_CONTENT"
  fi
else
  fail "T004: expected $SERVICES_OUT to exist after write-values-file.sh services"
fi

# --- T005 (R008): web fixed manifest ------------------------------------------
WEB_COMMON_KEYS=(CLOUDFLARE_ACCOUNT_ID CLOUDFLARE_API_TOKEN GIT_BRANCH)
WEB_ONLY_KEYS=(VITE_API_URL VITE_CLERK_PUBLISHABLE_KEY VITE_LANDING_URL VITE_PROVIDER_PORTAL_URL)
SHARED_OPTIONAL_KEYS=(VITE_ERROR_TRACKING_DSN VITE_RELEASE VITE_ENVIRONMENT SENTRY_AUTH_TOKEN SENTRY_ORG SENTRY_PROJECT SENTRY_URL VITE_POSTHOG_KEY VITE_POSTHOG_HOST)

WEB_OUT="$WORK_DIR/web.env"
rm -f "$WEB_OUT"

(
  export CLOUDFLARE_ACCOUNT_ID="cf-account"
  export CLOUDFLARE_API_TOKEN="cf-token"
  export GIT_BRANCH="develop"
  export VITE_API_URL="https://api.example.test"
  export VITE_CLERK_PUBLISHABLE_KEY="pk_test_dummy"
  export VITE_LANDING_URL="https://landing.example.test"
  export VITE_PROVIDER_PORTAL_URL="https://portal.example.test"
  export VITE_RELEASE="deadbeef"
  unset VITE_ERROR_TRACKING_DSN VITE_ENVIRONMENT SENTRY_AUTH_TOKEN SENTRY_ORG SENTRY_PROJECT SENTRY_URL VITE_POSTHOG_KEY VITE_POSTHOG_HOST
  "$SCRIPT" web "$WEB_OUT"
) >/dev/null 2>&1
WEB_EXIT=$?

if [ "$WEB_EXIT" -eq 0 ]; then
  pass "T005: write-values-file.sh web <out> exits 0"
else
  fail "T005: expected write-values-file.sh web <out> to exit 0, got exit $WEB_EXIT"
fi

if [ -f "$WEB_OUT" ]; then
  MISSING=0
  for key in "${WEB_COMMON_KEYS[@]}" "${WEB_ONLY_KEYS[@]}" "${SHARED_OPTIONAL_KEYS[@]}"; do
    grep -qE "^${key}=" "$WEB_OUT" || MISSING=1
  done
  if [ "$MISSING" -eq 0 ]; then
    pass "T005: $WEB_OUT declares every key of the web manifest (common + web-only + shared optional)"
  else
    fail "T005: expected $WEB_OUT to declare every key of the web manifest. Content:
$(cat "$WEB_OUT")"
  fi

  if grep -qE '^VITE_API_URL=https://api\.example\.test$' "$WEB_OUT" && grep -qE '^VITE_RELEASE=deadbeef$' "$WEB_OUT"; then
    pass "T005: $WEB_OUT reflects the exported values (VITE_API_URL, VITE_RELEASE)"
  else
    fail "T005: expected $WEB_OUT to reflect the exported VITE_API_URL/VITE_RELEASE values. Content:
$(cat "$WEB_OUT")"
  fi

  if grep -qE '^VITE_ERROR_TRACKING_DSN=$' "$WEB_OUT" && grep -qE '^SENTRY_AUTH_TOKEN=$' "$WEB_OUT"; then
    pass "T005: $WEB_OUT writes unset optional keys as empty values"
  else
    fail "T005: expected $WEB_OUT to write unset optional keys (VITE_ERROR_TRACKING_DSN, SENTRY_AUTH_TOKEN, ...) as empty values. Content:
$(cat "$WEB_OUT")"
  fi
else
  fail "T005: expected $WEB_OUT to exist after write-values-file.sh web"
fi

# --- T005 (R008): landing fixed manifest — common+optional plus its own keys only ---
LANDING_ONLY_KEYS=(VITE_API_URL VITE_WEB_URL)

LANDING_OUT="$WORK_DIR/landing.env"
rm -f "$LANDING_OUT"

(
  export CLOUDFLARE_ACCOUNT_ID="cf-account"
  export CLOUDFLARE_API_TOKEN="cf-token"
  export GIT_BRANCH="develop"
  export VITE_API_URL="https://api.example.test"
  export VITE_WEB_URL="https://app.example.test"
  unset VITE_CLERK_PUBLISHABLE_KEY VITE_LANDING_URL VITE_PROVIDER_PORTAL_URL
  unset VITE_ERROR_TRACKING_DSN VITE_RELEASE VITE_ENVIRONMENT SENTRY_AUTH_TOKEN SENTRY_ORG SENTRY_PROJECT SENTRY_URL VITE_POSTHOG_KEY VITE_POSTHOG_HOST
  "$SCRIPT" landing "$LANDING_OUT"
) >/dev/null 2>&1
LANDING_EXIT=$?

if [ "$LANDING_EXIT" -eq 0 ]; then
  pass "T005: write-values-file.sh landing <out> exits 0"
else
  fail "T005: expected write-values-file.sh landing <out> to exit 0, got exit $LANDING_EXIT"
fi

if [ -f "$LANDING_OUT" ]; then
  MISSING=0
  for key in "${WEB_COMMON_KEYS[@]}" "${LANDING_ONLY_KEYS[@]}" "${SHARED_OPTIONAL_KEYS[@]}"; do
    grep -qE "^${key}=" "$LANDING_OUT" || MISSING=1
  done
  if [ "$MISSING" -eq 0 ]; then
    pass "T005: $LANDING_OUT declares every key of the landing manifest (common + landing-only + shared optional)"
  else
    fail "T005: expected $LANDING_OUT to declare every key of the landing manifest. Content:
$(cat "$LANDING_OUT")"
  fi

  WEB_ONLY_NOT_COMMON=(VITE_CLERK_PUBLISHABLE_KEY VITE_LANDING_URL VITE_PROVIDER_PORTAL_URL)
  UNEXPECTED=0
  for key in "${WEB_ONLY_NOT_COMMON[@]}"; do
    grep -qE "^${key}=" "$LANDING_OUT" && UNEXPECTED=1
  done
  if [ "$UNEXPECTED" -eq 0 ]; then
    pass "T005: $LANDING_OUT does not declare any web-only key (VITE_CLERK_PUBLISHABLE_KEY, VITE_LANDING_URL, VITE_PROVIDER_PORTAL_URL)"
  else
    fail "T005: expected $LANDING_OUT to never declare a web-only key. Content:
$(cat "$LANDING_OUT")"
  fi
else
  fail "T005: expected $LANDING_OUT to exist after write-values-file.sh landing"
fi

exit "$FAILED"
