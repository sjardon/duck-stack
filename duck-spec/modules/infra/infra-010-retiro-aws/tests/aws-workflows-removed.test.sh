#!/usr/bin/env bash
# T004 — Acceptance test for R002, R003, R009.
#
# WHEN .github/workflows/ is inspected
# THEN none of deploy.yml, deploy-manual.yml, rollback.yml, _deploy-services.yml,
#      _deploy-web.yml, _deploy-landing.yml exist
# AND a recursive grep of .github/workflows/ for AWS auth/service markers
#     (aws-actions|AWS_OIDC_ROLE_ARN|AWS_REGION|ECR_REPOSITORY|S3_BUCKET|
#      CLOUDFRONT_DISTRIBUTION_ID) returns no match.
#
# Expected to FAIL until T005 (delete the six AWS-authenticating workflows) lands.

set -u

REPO_ROOT="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)"
cd "$REPO_ROOT"

fail=0

for workflow in \
  deploy.yml \
  deploy-manual.yml \
  rollback.yml \
  _deploy-services.yml \
  _deploy-web.yml \
  _deploy-landing.yml
do
  if [ -e ".github/workflows/$workflow" ]; then
    echo "FAIL: .github/workflows/$workflow still exists"
    fail=1
  else
    echo "PASS: .github/workflows/$workflow does not exist"
  fi
done

if [ -d .github/workflows ]; then
  matches="$(grep -rEn 'aws-actions|AWS_OIDC_ROLE_ARN|AWS_REGION|ECR_REPOSITORY|S3_BUCKET|CLOUDFRONT_DISTRIBUTION_ID' .github/workflows/ 2>/dev/null || true)"
  if [ -n "$matches" ]; then
    echo "FAIL: .github/workflows/ still references AWS auth/services:"
    echo "$matches"
    fail=1
  else
    echo "PASS: .github/workflows/ contains no AWS auth/service reference"
  fi
else
  echo "PASS: .github/workflows/ does not exist"
fi

exit "$fail"
