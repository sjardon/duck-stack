#!/usr/bin/env bash
# Acceptance tests for .cloudflare/README.md and the .do/.env.deploy.example
# CORS_ORIGIN documentation (INFRA-009)
#
# Covers:
#   T026 (R008, EC002, EC004, EC005, NF002, NF003) — .cloudflare/README.md
#     documents a "Prerequisites" section naming wrangler/pnpm exec wrangler, a
#     step-by-step procedure invoking .cloudflare/deploy.sh, the exact EC002
#     secret-restriction sentence, a comma-separated multi-origin CORS_ORIGIN
#     format example, the EC005 statement that each environment's CORS_ORIGIN
#     must list only that environment's own SPA URLs, and a "Current
#     deployments" table with App, Environment, Public URL and Last updated
#     columns.
#   T028 (EC004, EC005) — .do/.env.deploy.example's CORS_ORIGIN comment mentions
#     a comma-separated list of origins.
#
# INFRA012-T034 (R001, R002, R003) — the "Contents" table contains a row
#   referencing .github/README.md.
#
# This is the "test" phase of INFRA-009: .cloudflare/README.md does not exist
# yet and .do/.env.deploy.example has not been updated yet, so every assertion
# below is expected to FAIL until the "implement" phase creates/updates them.
# INFRA012-T034's assertion is the "test" phase of INFRA-012:
# .cloudflare/README.md does not yet cross-reference .github/README.md, so
# that assertion is expected to FAIL until INFRA-012's "implement" phase
# adds it.
#
# Run: bash .cloudflare/tests/readme.test.sh

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
README_FILE="$REPO_ROOT/.cloudflare/README.md"
DO_EXAMPLE_FILE="$REPO_ROOT/.do/.env.deploy.example"

FAILED=0

pass() { echo "PASS: $1"; }
fail() { echo "FAIL: $1"; FAILED=1; }

# --- T026 (R008, EC002, EC004, EC005, NF002, NF003) --------------------------

if [ ! -f "$README_FILE" ]; then
  fail "T026: $README_FILE does not exist"
else
  if grep -qiE '^#+[[:space:]]*prerequisites' "$README_FILE"; then
    pass "T026: $README_FILE has a Prerequisites section"
  else
    fail "T026: expected $README_FILE to have a 'Prerequisites' heading"
  fi

  if grep -qi 'wrangler' "$README_FILE" && grep -qF 'pnpm exec wrangler' "$README_FILE"; then
    pass "T026: $README_FILE's Prerequisites name wrangler / pnpm exec wrangler"
  else
    fail "T026: expected $README_FILE to name wrangler and the exact command 'pnpm exec wrangler'"
  fi

  if grep -qF '.cloudflare/deploy.sh' "$README_FILE"; then
    pass "T026: $README_FILE's procedure invokes .cloudflare/deploy.sh"
  else
    fail "T026: expected $README_FILE to document a step invoking .cloudflare/deploy.sh"
  fi

  if grep -qiE 'only public-classified values' "$README_FILE"; then
    pass "T026: $README_FILE states the EC002 secret-restriction sentence"
  else
    fail "T026: expected $README_FILE to state that only public-classified values belong in the values files (EC002)"
  fi

  if grep -qE 'https://[A-Za-z0-9.-]+,https://[A-Za-z0-9.-]+' "$README_FILE"; then
    pass "T026: $README_FILE documents a comma-separated multi-origin CORS_ORIGIN example"
  else
    fail "T026: expected $README_FILE to show a comma-separated multi-origin CORS_ORIGIN example (e.g. https://a,https://b)"
  fi

  if grep -qiE 'own( SPA)? URLs' "$README_FILE" || grep -qiE 'CORS_ORIGIN' "$README_FILE"; then
    if grep -qiE 'each environment' "$README_FILE" && grep -qiE 'own' "$README_FILE"; then
      pass "T026: $README_FILE states the EC005 per-environment CORS_ORIGIN rule"
    else
      fail "T026: expected $README_FILE to state that each environment's CORS_ORIGIN must list only that environment's own SPA URLs (EC005)"
    fi
  else
    fail "T026: expected $README_FILE to state the EC005 per-environment CORS_ORIGIN rule"
  fi

  if grep -qiE 'current deployments' "$README_FILE" \
    && grep -qiE '(^|[^A-Za-z])App([^A-Za-z]|$)' "$README_FILE" \
    && grep -qiE 'environment' "$README_FILE" \
    && grep -qiE 'public url' "$README_FILE" \
    && grep -qiE 'last updated' "$README_FILE"; then
    pass "T026: $README_FILE has a 'Current deployments' table with App, Environment, Public URL and Last updated columns"
  else
    fail "T026: expected $README_FILE to have a 'Current deployments' table with App, Environment, Public URL and Last updated columns"
  fi
fi

# --- INFRA012-T034 (R001, R002, R003) -----------------------------------------

if [ ! -f "$README_FILE" ]; then
  fail "INFRA012-T034: $README_FILE does not exist"
else
  if grep -qF '.github/README.md' "$README_FILE"; then
    pass "INFRA012-T034: $README_FILE's 'Contents' table references .github/README.md"
  else
    fail "INFRA012-T034: expected $README_FILE to have a 'Contents' table row referencing .github/README.md"
  fi
fi

# --- T028 (EC004, EC005) ------------------------------------------------------

if [ ! -f "$DO_EXAMPLE_FILE" ]; then
  fail "T028: $DO_EXAMPLE_FILE does not exist"
else
  CORS_LINE_AND_CONTEXT="$(grep -B3 -E '^CORS_ORIGIN=' "$DO_EXAMPLE_FILE" || true)"
  if echo "$CORS_LINE_AND_CONTEXT" | grep -qiE 'comma-separated' && echo "$CORS_LINE_AND_CONTEXT" | grep -qiE 'origin'; then
    pass "T028: $DO_EXAMPLE_FILE's CORS_ORIGIN comment mentions a comma-separated list of origins"
  else
    fail "T028: expected the comment above CORS_ORIGIN= in $DO_EXAMPLE_FILE to mention a comma-separated list of origins. Context found:
$CORS_LINE_AND_CONTEXT"
  fi
fi

exit "$FAILED"
