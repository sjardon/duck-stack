#!/usr/bin/env bash
# Acceptance test for .do/monitoring/README.md (INFRA-011)
#
# Covers T019 (EC001, EC002, EC003, EC004, EC005, EC006, NF001, NF002, NF003)
# — the monitoring setup runbook documents:
#   - a "Prerequisites" section
#   - a procedure that invokes .do/monitoring/deploy.sh
#   - EC001 — GET /health does not check the database (shallow-health blind spot)
#   - EC002 — the maximum undetected outage window (interval x confirmation
#     attempts) is recorded
#   - EC003 — the chosen interval, its resulting monthly request count, and the
#     query filter that excludes /health lines from log searches
#   - EC004 — the Logs destination ingestion quota and the LOG_LEVEL-based
#     mitigation
#   - EC005 — the mandatory end-to-end delivery test as a required setup step
#   - EC006 — the default query restricting results to the backend structured
#     JSON lines
#   - NF001 — the one-time manual inspection of the forwarded stream for
#     secret/PII values
#   - NF002 — the platform-level guarantee that a destination failure does not
#     degrade GET /health or request handling
#   - NF003 — the chosen interval resulting request volume against the
#     contracted plan quota
#
# This is the "test" phase of INFRA-011: .do/monitoring/README.md does not
# exist yet, so every assertion below is expected to FAIL until the
# "implement" phase creates it.
#
# Run: bash .do/monitoring/tests/readme.test.sh

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
README_FILE="$REPO_ROOT/.do/monitoring/README.md"

FAILED=0

pass() { echo "PASS: $1"; }
fail() { echo "FAIL: $1"; FAILED=1; }

if [ ! -f "$README_FILE" ]; then
  fail "T019: $README_FILE does not exist"
  exit "$FAILED"
fi

if grep -qiE '^#+[[:space:]]*prerequisites' "$README_FILE"; then
  pass "T019: $README_FILE has a Prerequisites section"
else
  fail "T019: expected $README_FILE to have a Prerequisites heading"
fi

if grep -qF '.do/monitoring/deploy.sh' "$README_FILE"; then
  pass "T019: $README_FILE procedure invokes .do/monitoring/deploy.sh"
else
  fail "T019: expected $README_FILE to document a step invoking .do/monitoring/deploy.sh"
fi

# EC001 — shallow health check blind spot
if grep -qi 'database' "$README_FILE" && grep -qiE 'blind spot|does not check|no dependency' "$README_FILE"; then
  pass "T019: $README_FILE states the EC001 shallow-health-check blind spot"
else
  fail "T019: expected $README_FILE to state the EC001 shallow-health-check blind spot (database not checked)"
fi

# EC002 — maximum undetected outage window formula
if grep -qiE 'undetected outage window' "$README_FILE" && grep -qi 'interval' "$README_FILE" && grep -qi 'confirmation' "$README_FILE"; then
  pass "T019: $README_FILE records the EC002 maximum undetected outage window"
else
  fail "T019: expected $README_FILE to record the EC002 maximum undetected outage window (interval x confirmation attempts)"
fi

# EC003 — interval, monthly request count, /health exclusion query
if grep -qi 'monthly' "$README_FILE" && grep -qi 'request' "$README_FILE" && grep -qF '/health' "$README_FILE" && grep -qiE 'exclu' "$README_FILE"; then
  pass "T019: $README_FILE records the EC003 interval, monthly request count and /health-excluding query"
else
  fail "T019: expected $README_FILE to record the EC003 interval, monthly request count, and the query filter excluding /health lines"
fi

# EC004 — ingestion quota and LOG_LEVEL mitigation
if grep -qi 'ingestion quota' "$README_FILE" && grep -qF 'LOG_LEVEL' "$README_FILE"; then
  pass "T019: $README_FILE records the EC004 ingestion quota and LOG_LEVEL mitigation"
else
  fail "T019: expected $README_FILE to record the EC004 ingestion quota and the LOG_LEVEL-based mitigation"
fi

# EC005 — mandatory end-to-end delivery test
if grep -qiE 'end-to-end' "$README_FILE" && grep -qi 'delivery test' "$README_FILE" && grep -qi 'mandatory' "$README_FILE"; then
  pass "T019: $README_FILE makes the EC005 end-to-end delivery test a mandatory step"
else
  fail "T019: expected $README_FILE to document the EC005 mandatory end-to-end delivery test"
fi

# EC006 — default query restricting to structured JSON lines
if grep -qi 'requestId' "$README_FILE" && grep -qiE 'structured|json line' "$README_FILE" && grep -qi 'query' "$README_FILE"; then
  pass "T019: $README_FILE documents the EC006 default query restricting results to structured JSON lines"
else
  fail "T019: expected $README_FILE to document the EC006 default query restricting results to structured JSON lines (requestId filter)"
fi

# NF001 — one-time manual inspection of the forwarded stream
if grep -qiE 'one-time' "$README_FILE" && grep -qi 'inspect' "$README_FILE" && grep -qiE 'secret|pii' "$README_FILE"; then
  pass "T019: $README_FILE mandates the NF001 one-time inspection of the forwarded stream"
else
  fail "T019: expected $README_FILE to mandate the NF001 one-time manual inspection of the forwarded stream for secret/PII values"
fi

# NF002 — platform-level isolation guarantee
if grep -qiE 'outside the request path|does not degrade|no added latency' "$README_FILE" && grep -qF '200' "$README_FILE"; then
  pass "T019: $README_FILE states the NF002 platform-level isolation guarantee"
else
  fail "T019: expected $README_FILE to state the NF002 platform-level guarantee that a destination failure does not degrade GET /health or request handling"
fi

# NF003 — request volume against the contracted plan quota
if grep -qi 'quota' "$README_FILE" && grep -qi 'plan' "$README_FILE" && grep -qi 'monthly' "$README_FILE"; then
  pass "T019: $README_FILE records the NF003 request volume against the contracted plan quota"
else
  fail "T019: expected $README_FILE to record the NF003 resulting request volume against the contracted plan quota"
fi

exit "$FAILED"
