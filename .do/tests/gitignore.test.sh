#!/usr/bin/env bash
# Acceptance test for the .gitignore rule protecting per-environment values files
# (INFRA-008).
#
# Covers:
#   T027 (NF003)  — git check-ignore .do/.env.deploy.dev exits 0 (ignored) and
#                   git check-ignore .do/.env.deploy.example exits 1 (tracked)
#
# This is the "test" phase of INFRA-008: .gitignore has not been updated yet, so
# this assertion is expected to FAIL until the "implement" phase adds the rule.
#
# Run: bash .do/tests/gitignore.test.sh

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

FAILED=0

pass() { echo "PASS: $1"; }
fail() { echo "FAIL: $1"; FAILED=1; }

cd "$REPO_ROOT" || { echo "FAIL: T027: cannot cd into $REPO_ROOT"; exit 1; }

if git check-ignore -q ".do/.env.deploy.dev"; then
  pass "T027: .do/.env.deploy.dev is ignored by git"
else
  fail "T027: expected 'git check-ignore .do/.env.deploy.dev' to exit 0 (ignored), it did not"
fi

if git check-ignore -q ".do/.env.deploy.example"; then
  fail "T027: expected 'git check-ignore .do/.env.deploy.example' to exit 1 (tracked), but it is ignored"
else
  pass "T027: .do/.env.deploy.example is not ignored by git (stays tracked)"
fi

exit "$FAILED"
