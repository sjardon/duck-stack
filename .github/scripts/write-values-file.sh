#!/usr/bin/env bash
# .github/scripts/write-values-file.sh (INFRA-012: R008)
#
# Usage: .github/scripts/write-values-file.sh <services|web|landing> <output-path> [app-yaml-path]
#
# Materializes a .do/deploy.sh / .cloudflare/deploy.sh values file for the
# given app from the job's already-populated environment.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# Writes NAME=<value> to output_path for every name given, reading each
# value from the same-named shell variable already populated in this
# process's environment (empty when unset). Shared by every write_*_values
# function below so the emit logic exists in exactly one place.
emit_values() {
  local output_path="$1"
  shift
  local name

  : > "$output_path"

  for name in "$@"; do
    echo "${name}=${!name:-}" >> "$output_path"
  done
}

write_services_values() {
  local output_path="$1"
  local app_yaml_path="${2:-$REPO_ROOT/.do/app.yaml}"
  local tokens=()

  while IFS= read -r token; do
    [ -z "$token" ] && continue
    tokens+=("$token")
  done < <(grep -oE '\$\{[A-Z0-9_]+\}' "$app_yaml_path" | sed -e 's/^\${//' -e 's/}$//' | sort -u)

  emit_values "$output_path" "${tokens[@]}"
}

write_web_values() {
  local output_path="$1"

  emit_values "$output_path" \
    CLOUDFLARE_ACCOUNT_ID CLOUDFLARE_API_TOKEN GIT_BRANCH \
    VITE_API_URL VITE_CLERK_PUBLISHABLE_KEY VITE_LANDING_URL VITE_PROVIDER_PORTAL_URL \
    VITE_ERROR_TRACKING_DSN VITE_RELEASE VITE_ENVIRONMENT \
    SENTRY_AUTH_TOKEN SENTRY_ORG SENTRY_PROJECT SENTRY_URL \
    VITE_POSTHOG_KEY VITE_POSTHOG_HOST
}

write_landing_values() {
  local output_path="$1"

  emit_values "$output_path" \
    CLOUDFLARE_ACCOUNT_ID CLOUDFLARE_API_TOKEN GIT_BRANCH \
    VITE_API_URL VITE_WEB_URL \
    VITE_ERROR_TRACKING_DSN VITE_RELEASE VITE_ENVIRONMENT \
    SENTRY_AUTH_TOKEN SENTRY_ORG SENTRY_PROJECT SENTRY_URL \
    VITE_POSTHOG_KEY VITE_POSTHOG_HOST
}

main() {
  if [ "$#" -lt 2 ]; then
    echo "Usage: .github/scripts/write-values-file.sh <services|web|landing> <output-path> [app-yaml-path]" >&2
    exit 1
  fi

  local app="$1"
  local output_path="$2"

  case "$app" in
    services)
      write_services_values "$output_path" "${3:-}"
      ;;
    web)
      write_web_values "$output_path"
      ;;
    landing)
      write_landing_values "$output_path"
      ;;
    *)
      echo "Error: app must be 'services', 'web' or 'landing', got '$app'." >&2
      exit 1
      ;;
  esac
}

main "$@"
