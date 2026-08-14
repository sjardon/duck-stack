#!/usr/bin/env bash
# T012 — Acceptance test for R006.
#
# WHEN duck-spec/docs/ARCHITECTURE.md is grepped for "AWS App Runner|App Runner URL"
# THEN there are zero matches
# AND the apps/services row of the ## Services table mentions DigitalOcean App Platform.
#
# Expected to FAIL until T013 (fix ARCHITECTURE.md's stale AWS references) lands.

set -u

REPO_ROOT="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)"
cd "$REPO_ROOT"

DOC="duck-spec/docs/ARCHITECTURE.md"
fail=0

if [ ! -f "$DOC" ]; then
  echo "FAIL: $DOC does not exist"
  exit 1
fi

matches="$(grep -nE 'AWS App Runner|App Runner URL' "$DOC" || true)"
if [ -n "$matches" ]; then
  echo "FAIL: $DOC still names an AWS deploy target:"
  echo "$matches"
  fail=1
else
  echo "PASS: $DOC names no AWS deploy target"
fi

services_row="$(grep -E '\| *`apps/services`' "$DOC" || true)"
if [ -z "$services_row" ]; then
  echo "FAIL: no apps/services row found in $DOC"
  fail=1
elif echo "$services_row" | grep -q 'DigitalOcean App Platform'; then
  echo "PASS: apps/services row mentions DigitalOcean App Platform"
else
  echo "FAIL: apps/services row does not mention DigitalOcean App Platform: $services_row"
  fail=1
fi

exit "$fail"
