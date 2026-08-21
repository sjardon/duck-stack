#!/usr/bin/env bash
# Acceptance tests for .github/scripts/report-deploy-summary.sh (INFRA-012)
#
# Covers:
#   T008 (R006, NF002) — given environment=dev, commit_sha=<sha>, and three
#     (outcome, log-file) pairs (services, web, landing) where each log file
#     contains a "Public URL: https://…" line, running
#     report-deploy-summary.sh prints one line per app naming the app, dev,
#     <sha>, published/not-published, and the parsed URL when published; the
#     script exits 0 when all three outcomes are "success", and exits
#     non-zero — printing which app(s) failed — when any outcome is
#     "failure".
#
# Usage: report-deploy-summary.sh <environment> <commit_sha> \
#          <services-outcome> <services-log> \
#          <web-outcome> <web-log> \
#          <landing-outcome> <landing-log>
#
# This is the "test" phase of INFRA-012:
# .github/scripts/report-deploy-summary.sh does not exist yet, so every
# assertion below is expected to FAIL until the "implement" phase creates it.
#
# Run: bash .github/tests/report-deploy-summary-script.test.sh

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="$REPO_ROOT/.github/scripts/report-deploy-summary.sh"

FAILED=0

pass() { echo "PASS: $1"; }
fail() { echo "FAIL: $1"; FAILED=1; }

WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

if [ ! -f "$SCRIPT" ]; then
  fail "T008: $SCRIPT does not exist"
  exit "$FAILED"
fi
if [ ! -x "$SCRIPT" ]; then
  fail "T008: $SCRIPT is not executable"
fi

ENVIRONMENT="dev"
COMMIT_SHA="a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2"

SERVICES_URL="https://services-app.ondigitalocean.app"
WEB_URL="https://abc123.duck-stack-web.pages.dev"
LANDING_URL="https://abc123.duck-stack-landing.pages.dev"

SERVICES_LOG="$WORK_DIR/services.log"
WEB_LOG="$WORK_DIR/web.log"
LANDING_LOG="$WORK_DIR/landing.log"

printf 'App ID: stub-id\nPublic URL: %s\n' "$SERVICES_URL" > "$SERVICES_LOG"
printf 'Deployed!\nPublic URL: %s\n' "$WEB_URL" > "$WEB_LOG"
printf 'Deployed!\nPublic URL: %s\n' "$LANDING_URL" > "$LANDING_LOG"

# --- T008 (R006, NF002): all three succeed ------------------------------------
SUCCESS_OUTPUT="$("$SCRIPT" "$ENVIRONMENT" "$COMMIT_SHA" \
  success "$SERVICES_LOG" \
  success "$WEB_LOG" \
  success "$LANDING_LOG" 2>&1)"
SUCCESS_EXIT=$?

if [ "$SUCCESS_EXIT" -eq 0 ]; then
  pass "T008: report-deploy-summary.sh exits 0 when all three outcomes are 'success'"
else
  fail "T008: expected report-deploy-summary.sh to exit 0 when all three outcomes are 'success', got exit $SUCCESS_EXIT. Output:
$SUCCESS_OUTPUT"
fi

for pair in "services:$SERVICES_URL" "web:$WEB_URL" "landing:$LANDING_URL"; do
  app="${pair%%:*}"
  url="${pair#*:}"
  if echo "$SUCCESS_OUTPUT" | grep -qF "$app" \
    && echo "$SUCCESS_OUTPUT" | grep -qF "$ENVIRONMENT" \
    && echo "$SUCCESS_OUTPUT" | grep -qF "$COMMIT_SHA" \
    && echo "$SUCCESS_OUTPUT" | grep -qiF 'published' \
    && echo "$SUCCESS_OUTPUT" | grep -qF "$url"; then
    pass "T008: output names $app, $ENVIRONMENT, $COMMIT_SHA, a published status, and the parsed URL $url"
  else
    fail "T008: expected output to name $app, $ENVIRONMENT, $COMMIT_SHA, a published status, and the parsed URL $url. Output:
$SUCCESS_OUTPUT"
  fi
done

# --- T008 (R006, NF002): one app fails -----------------------------------------
FAILURE_OUTPUT="$("$SCRIPT" "$ENVIRONMENT" "$COMMIT_SHA" \
  success "$SERVICES_LOG" \
  failure "$WEB_LOG" \
  success "$LANDING_LOG" 2>&1)"
FAILURE_EXIT=$?

if [ "$FAILURE_EXIT" -ne 0 ]; then
  pass "T008: report-deploy-summary.sh exits non-zero when the web outcome is 'failure'"
else
  fail "T008: expected report-deploy-summary.sh to exit non-zero when the web outcome is 'failure', got exit 0. Output:
$FAILURE_OUTPUT"
fi

if echo "$FAILURE_OUTPUT" | grep -qF 'web' && echo "$FAILURE_OUTPUT" | grep -qiE 'not-published|not published'; then
  pass "T008: output identifies 'web' as not-published when its outcome is 'failure'"
else
  fail "T008: expected output to identify 'web' as not-published. Output:
$FAILURE_OUTPUT"
fi

if echo "$FAILURE_OUTPUT" | grep -qF 'services' && echo "$FAILURE_OUTPUT" | grep -qiF 'published'; then
  pass "T008: output still reports 'services' as published even though 'web' failed"
else
  fail "T008: expected output to still report 'services' as published. Output:
$FAILURE_OUTPUT"
fi

exit "$FAILED"
