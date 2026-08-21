#!/usr/bin/env bash
# .github/scripts/pin-do-deploy-ref.sh — force-update a per-environment
# deploy-ref branch to an exact commit.
#
# DigitalOcean's App Spec `github` source only accepts a branch name (see
# .do/app.yaml's `branch: ${GIT_BRANCH}`), never a commit SHA, so a plain
# reconcile always delivers the tip of that branch rather than a chosen
# commit. Every deploy flow works around this by making a dedicated
# `_deploy/<environment>` branch *be* the exact commit being delivered,
# immediately before `.do/deploy.sh` runs.
#
# Usage: .github/scripts/pin-do-deploy-ref.sh <environment> <commit_sha>

set -euo pipefail

usage() {
  cat <<'EOF'
Usage: .github/scripts/pin-do-deploy-ref.sh <environment> <commit_sha>
EOF
}

main() {
  if [ "$#" -ne 2 ]; then
    usage >&2
    exit 1
  fi

  local environment="$1"
  local commit_sha="$2"
  local ref="_deploy/${environment}"

  git push --force origin "${commit_sha}:refs/heads/${ref}"
  echo "$ref"
}

main "$@"
