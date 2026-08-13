#!/usr/bin/env bash
# Acceptance test for the .gitignore rule protecting per-environment
# Cloudflare Pages values files (INFRA-009).
#
# Covers:
#   T022 (NF002, NF003) — git check-ignore .cloudflare/.env.deploy.web.dev exits
#                         0 (ignored); .cloudflare/.env.deploy.web.example and
#                         .cloudflare/.env.deploy.landing.example both exit 1
#                         (tracked)
#
# This is the "test" phase of INFRA-009: .gitignore has not been updated yet, so
# this assertion is expected to FAIL until the "implement" phase adds the rule.
#
# Run: bash .cloudflare/tests/gitignore.test.sh

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

FAILED=0

pass() { echo "PASS: $1"; }
fail() { echo "FAIL: $1"; FAILED=1; }

cd "$REPO_ROOT" || { echo "FAIL: T022: cannot cd into $REPO_ROOT"; exit 1; }

if git check-ignore -q ".cloudflare/.env.deploy.web.dev"; then
  pass "T022: .cloudflare/.env.deploy.web.dev is ignored by git"
else
  fail "T022: expected 'git check-ignore .cloudflare/.env.deploy.web.dev' to exit 0 (ignored), it did not"
fi

if git check-ignore -q ".cloudflare/.env.deploy.web.example"; then
  fail "T022: expected 'git check-ignore .cloudflare/.env.deploy.web.example' to exit 1 (tracked), but it is ignored"
else
  pass "T022: .cloudflare/.env.deploy.web.example is not ignored by git (stays tracked)"
fi

if git check-ignore -q ".cloudflare/.env.deploy.landing.example"; then
  fail "T022: expected 'git check-ignore .cloudflare/.env.deploy.landing.example' to exit 1 (tracked), but it is ignored"
else
  pass "T022: .cloudflare/.env.deploy.landing.example is not ignored by git (stays tracked)"
fi

exit "$FAILED"
