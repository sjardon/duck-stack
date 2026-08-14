#!/usr/bin/env bash
# T021 — Acceptance test for NF001.
#
# WHEN duck-spec/docs/*.md, duck-spec/modules/*/SPEC.md, and .github/workflows/
#      are grepped (recursively) for
#      Terraform|VPC|ECR|App Runner|CloudFront|DynamoDB|AWS OIDC|S3 bucket
# THEN there are zero matches outside lines explicitly flagged as
#      SES-related/pending NOTIFICATIONS-002 migration.
#
# Expected to FAIL until every prior implement task (T002, T005, T010, T013,
# T016, T019) lands, then PASS.

set -u

REPO_ROOT="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)"
cd "$REPO_ROOT"

fail=0
PATTERN='Terraform|\bVPC\b|\bECR\b|App Runner|CloudFront|DynamoDB|AWS OIDC|S3 bucket'

# Collect candidate files: duck-spec/docs/*.md, duck-spec/modules/*/SPEC.md, .github/workflows/**
files=()
while IFS= read -r -d '' f; do files+=("$f"); done < <(find duck-spec/docs -maxdepth 1 -name '*.md' -print0 2>/dev/null)
while IFS= read -r -d '' f; do files+=("$f"); done < <(find duck-spec/modules -mindepth 2 -maxdepth 2 -name 'SPEC.md' -print0 2>/dev/null)
if [ -d .github/workflows ]; then
  while IFS= read -r -d '' f; do files+=("$f"); done < <(find .github/workflows -type f -print0 2>/dev/null)
fi

any_leftover=0
for f in "${files[@]}"; do
  matches="$(grep -nE "$PATTERN" "$f" 2>/dev/null || true)"
  [ -z "$matches" ] && continue

  # Filter out lines explicitly flagged as SES/NOTIFICATIONS-002-pending.
  leftover="$(echo "$matches" | grep -viE 'SES|NOTIFICATIONS-002' || true)"
  if [ -n "$leftover" ]; then
    echo "FAIL: $f still contains forbidden AWS/Terraform references outside SES scope:"
    echo "$leftover"
    any_leftover=1
    fail=1
  fi
done

if [ "$any_leftover" -eq 0 ]; then
  echo "PASS: no forbidden AWS/Terraform reference found across the NF001 surface"
fi

exit "$fail"
