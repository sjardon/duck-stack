#!/usr/bin/env bash
# Acceptance test for .do/README.md (INFRA-008)
#
# Covers T029 (NF002, R010, R011, EC003, EC005) — the deploy runbook documents:
#   - a "Prerequisites" section
#   - a step-by-step procedure that invokes .do/deploy.sh
#   - the statement that console edits are overwritten by the next run (EC005)
#   - the exact EC002 error string: "Missing required env var: EMAIL_SENDER_ADDRESS"
#   - the `doctl apps delete` command (EC003)
#   - a "Current deployments" table with Environment, Public URL and Last updated
#     columns (R011)
#
# INFRA012-T032 (R001, R002, R003) — the "Contents" table contains a row
#   referencing .github/README.md, and the file states that automatic deploys
#   now exist on merge alongside the still-valid manual procedure.
#
# This is the "test" phase of INFRA-008: .do/README.md does not exist yet, so every
# assertion below is expected to FAIL until the "implement" phase creates it.
# INFRA012-T032's assertions are the "test" phase of INFRA-012: .do/README.md
# does not yet cross-reference .github/README.md, so that assertion is
# expected to FAIL until INFRA-012's "implement" phase adds it.
#
# Run: bash .do/tests/readme.test.sh

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
README_FILE="$REPO_ROOT/.do/README.md"

FAILED=0

pass() { echo "PASS: $1"; }
fail() { echo "FAIL: $1"; FAILED=1; }

if [ ! -f "$README_FILE" ]; then
  fail "T029: $README_FILE does not exist"
  exit "$FAILED"
fi

if grep -qiE '^#+[[:space:]]*prerequisites' "$README_FILE"; then
  pass "T029: $README_FILE has a Prerequisites section"
else
  fail "T029: expected $README_FILE to have a 'Prerequisites' heading"
fi

if grep -qF '.do/deploy.sh' "$README_FILE"; then
  pass "T029: $README_FILE's procedure invokes .do/deploy.sh"
else
  fail "T029: expected $README_FILE to document a step invoking .do/deploy.sh"
fi

if grep -qi 'console' "$README_FILE" && grep -qiE 'overwrit|not durable' "$README_FILE"; then
  pass "T029: $README_FILE states console edits are overwritten by the next deploy run (EC005)"
else
  fail "T029: expected $README_FILE to state that console edits are overwritten / not durable (EC005)"
fi

if grep -qF 'Missing required env var: EMAIL_SENDER_ADDRESS' "$README_FILE"; then
  pass "T029: $README_FILE documents the exact EC002 error string"
else
  fail "T029: expected $README_FILE to contain the exact string 'Missing required env var: EMAIL_SENDER_ADDRESS' (EC002)"
fi

if grep -qF 'doctl apps delete' "$README_FILE"; then
  pass "T029: $README_FILE documents the 'doctl apps delete' command (EC003)"
else
  fail "T029: expected $README_FILE to document the 'doctl apps delete <app-id>' command (EC003)"
fi

if grep -qiE 'current deployments' "$README_FILE" \
  && grep -qiE 'environment' "$README_FILE" \
  && grep -qiE 'public url' "$README_FILE" \
  && grep -qiE 'last updated' "$README_FILE"; then
  pass "T029: $README_FILE has a 'Current deployments' table with Environment, Public URL and Last updated columns"
else
  fail "T029: expected $README_FILE to have a 'Current deployments' table with Environment, Public URL and Last updated columns"
fi

# --- INFRA012-T032 (R001, R002, R003) -----------------------------------------

if grep -qF '.github/README.md' "$README_FILE"; then
  pass "INFRA012-T032: $README_FILE's 'Contents' table references .github/README.md"
else
  fail "INFRA012-T032: expected $README_FILE to have a 'Contents' table row referencing .github/README.md"
fi

if grep -qiE 'automatic' "$README_FILE" && grep -qiE 'merge' "$README_FILE" && grep -qiE 'manual' "$README_FILE"; then
  pass "INFRA012-T032: $README_FILE states that automatic deploys now exist on merge alongside the still-valid manual procedure"
else
  fail "INFRA012-T032: expected $README_FILE to state that automatic deploys now exist on merge alongside the still-valid manual procedure"
fi

exit "$FAILED"
