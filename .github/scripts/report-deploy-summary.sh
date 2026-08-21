#!/usr/bin/env bash
# .github/scripts/report-deploy-summary.sh (INFRA-012: R006, NF002)
#
# Usage: report-deploy-summary.sh <environment> <commit_sha> \
#          <services-outcome> <services-log> \
#          <web-outcome> <web-log> \
#          <landing-outcome> <landing-log>
#
# Prints, per app, whether it was published (its step's outcome was
# "success") and at which commit, plus the public URL parsed from its
# captured deploy output when published. Exits non-zero if any app's
# outcome is not "success", so a partial delivery is never reported as a
# success.

set -uo pipefail

main() {
  if [ "$#" -ne 8 ]; then
    echo "Usage: report-deploy-summary.sh <environment> <commit_sha> <services-outcome> <services-log> <web-outcome> <web-log> <landing-outcome> <landing-log>" >&2
    exit 1
  fi

  local environment="$1"
  local commit_sha="$2"
  local services_outcome="$3"
  local services_log="$4"
  local web_outcome="$5"
  local web_log="$6"
  local landing_outcome="$7"
  local landing_log="$8"

  local exit_code=0

  report_app "services" "$environment" "$commit_sha" "$services_outcome" "$services_log" || exit_code=1
  report_app "web" "$environment" "$commit_sha" "$web_outcome" "$web_log" || exit_code=1
  report_app "landing" "$environment" "$commit_sha" "$landing_outcome" "$landing_log" || exit_code=1

  exit "$exit_code"
}

# Extracts the public URL an app's deploy step printed to its captured log,
# reusing the same `grep -oE` idiom .cloudflare/deploy.sh and .do/deploy.sh's
# own "Public URL: <url>" output line already follows. Empty when the log
# has no such line (e.g. the step failed before reaching that point).
parse_public_url() {
  local log_path="$1"

  grep -oE 'Public URL: https://\S+' "$log_path" 2>/dev/null | head -1 | sed -e 's/^Public URL: //'
}

report_app() {
  local app="$1"
  local environment="$2"
  local commit_sha="$3"
  local outcome="$4"
  local log_path="$5"

  local status url=""

  if [ "$outcome" = "success" ]; then
    status="published"
    url="$(parse_public_url "$log_path")"
  else
    status="not-published"
  fi

  echo "app=${app} environment=${environment} commit=${commit_sha} status=${status} url=${url}"

  [ "$outcome" = "success" ]
}

main "$@"
