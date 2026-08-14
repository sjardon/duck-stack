#!/usr/bin/env bash
# T007 — Acceptance test for R010, EC004.
#
# `.do/app.yaml` still declares SES_REGION and EMAIL_SENDER_ADDRESS,
# `apps/services/src/modules/notifications/providers/sesEmailNotifier.ts` still exists,
# and `apps/services/package.json` still lists `@aws-sdk/client-sesv2` as a dependency.
#
# Expected to PASS immediately (no production code changes in this feature) —
# run it before and after every other task to guard against accidental regressions.

set -u

REPO_ROOT="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)"
cd "$REPO_ROOT"

fail=0

if grep -q 'SES_REGION' .do/app.yaml 2>/dev/null; then
  echo "PASS: .do/app.yaml still declares SES_REGION"
else
  echo "FAIL: .do/app.yaml no longer declares SES_REGION"
  fail=1
fi

if grep -q 'EMAIL_SENDER_ADDRESS' .do/app.yaml 2>/dev/null; then
  echo "PASS: .do/app.yaml still declares EMAIL_SENDER_ADDRESS"
else
  echo "FAIL: .do/app.yaml no longer declares EMAIL_SENDER_ADDRESS"
  fail=1
fi

if [ -f apps/services/src/modules/notifications/providers/sesEmailNotifier.ts ]; then
  echo "PASS: sesEmailNotifier.ts still exists"
else
  echo "FAIL: sesEmailNotifier.ts is missing"
  fail=1
fi

if grep -q '"@aws-sdk/client-sesv2"' apps/services/package.json 2>/dev/null; then
  echo "PASS: apps/services/package.json still lists @aws-sdk/client-sesv2"
else
  echo "FAIL: apps/services/package.json no longer lists @aws-sdk/client-sesv2"
  fail=1
fi

exit "$fail"
