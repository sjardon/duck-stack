#!/usr/bin/env bash
# T015 — Acceptance test for R005, NF001, EC002.
#
# duck-spec/docs/SPEC.md's `infra` entry contains no "pending removal (INFRA-010)" sentence;
# duck-spec/modules/infra/SPEC.md has no "## AWS Base Infrastructure (INFRA-002)",
#   "## Static Hosting — S3 + CloudFront (INFRA-003)", or
#   "## CI/CD Pipeline — GitHub Actions (INFRA-004)" heading, and its INFRA-008/009
#   "What is out of scope here" paragraphs no longer reference INFRA-002/003/004
#   or a pending INFRA-010 removal;
# duck-spec/modules/services/SPEC.md contains no non-SES "App Runner" reference.
#
# Expected to FAIL until T016 (realign SPEC.md files) lands.

set -u

REPO_ROOT="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)"
cd "$REPO_ROOT"

fail=0

GLOBAL_SPEC="duck-spec/docs/SPEC.md"
INFRA_SPEC="duck-spec/modules/infra/SPEC.md"
SERVICES_SPEC="duck-spec/modules/services/SPEC.md"

for f in "$GLOBAL_SPEC" "$INFRA_SPEC" "$SERVICES_SPEC"; do
  if [ ! -f "$f" ]; then
    echo "FAIL: $f does not exist"
    exit 1
  fi
done

if grep -q 'pending removal (INFRA-010)' "$GLOBAL_SPEC"; then
  echo "FAIL: $GLOBAL_SPEC still contains a 'pending removal (INFRA-010)' sentence"
  fail=1
else
  echo "PASS: $GLOBAL_SPEC contains no 'pending removal (INFRA-010)' sentence"
fi

for heading in \
  "## AWS Base Infrastructure (INFRA-002)" \
  "## Static Hosting — S3 + CloudFront (INFRA-003)" \
  "## CI/CD Pipeline — GitHub Actions (INFRA-004)"
do
  if grep -qF "$heading" "$INFRA_SPEC"; then
    echo "FAIL: $INFRA_SPEC still has heading '$heading'"
    fail=1
  else
    echo "PASS: $INFRA_SPEC has no heading '$heading'"
  fi
done

if grep -qE 'INFRA-002|INFRA-003|INFRA-004' "$INFRA_SPEC"; then
  matches="$(grep -nE 'INFRA-002|INFRA-003|INFRA-004' "$INFRA_SPEC")"
  echo "FAIL: $INFRA_SPEC still cross-references a deprecated INFRA-002/003/004 section:"
  echo "$matches"
  fail=1
else
  echo "PASS: $INFRA_SPEC has no leftover INFRA-002/003/004 cross-reference"
fi

if grep -qE 'pending.*INFRA-010|INFRA-010.*pending' "$INFRA_SPEC"; then
  echo "FAIL: $INFRA_SPEC still describes a pending INFRA-010 removal"
  fail=1
else
  echo "PASS: $INFRA_SPEC does not describe a pending INFRA-010 removal"
fi

non_ses_app_runner="$(grep -niE 'app runner' "$SERVICES_SPEC" || true)"
if [ -n "$non_ses_app_runner" ]; then
  echo "FAIL: $SERVICES_SPEC still contains an App Runner reference:"
  echo "$non_ses_app_runner"
  fail=1
else
  echo "PASS: $SERVICES_SPEC contains no App Runner reference"
fi

exit "$fail"
