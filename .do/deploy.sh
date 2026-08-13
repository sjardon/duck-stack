#!/usr/bin/env bash
# .do/deploy.sh — render .do/app.yaml against a values file and reconcile the
# DigitalOcean App Platform application via `doctl apps create --upsert`
# (INFRA-008: R010, NF001, EC002, R011, R003).
#
# Usage: .do/deploy.sh <values-file>
#
# <values-file> is a shell-sourceable file declaring every placeholder
# referenced by .do/app.yaml (see .do/.env.deploy.example). Copy the example
# file to .do/.env.deploy.<environment>, fill in the real values, and pass
# its path here. See .do/README.md for the full procedure and prerequisites.

set -euo pipefail

usage() {
  cat <<'EOF'
Usage: .do/deploy.sh <values-file>

<values-file> is a shell-sourceable file declaring every placeholder
referenced by .do/app.yaml (see .do/.env.deploy.example). Copy the example
file to .do/.env.deploy.<environment>, fill in the real values, and pass its
path here.
EOF
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SPEC_FILE="$SCRIPT_DIR/app.yaml"

if [ "$#" -ne 1 ]; then
  usage >&2
  exit 1
fi

VALUES_FILE="$1"

if [ ! -f "$VALUES_FILE" ]; then
  echo "Error: values file '$VALUES_FILE' does not exist." >&2
  usage >&2
  exit 1
fi

RENDERED_SPEC=""

cleanup() {
  if [ -n "$RENDERED_SPEC" ] && [ -f "$RENDERED_SPEC" ]; then
    rm -f "$RENDERED_SPEC"
  fi
}
trap cleanup EXIT

load_values() {
  set -a
  # shellcheck disable=SC1090
  source "$VALUES_FILE"
  set +a
}

# Validates that every ${VAR} placeholder referenced by .do/app.yaml has a
# non-empty value after sourcing the values file. Fails fast, before any
# network call or rendering, on the exact class of misconfiguration described
# in EC002 (e.g. a missing EMAIL_SENDER_ADDRESS), rather than letting it
# surface later as a generic platform deploy failure.
validate_placeholders() {
  local missing=()
  local token

  while IFS= read -r token; do
    [ -z "$token" ] && continue
    if [ -z "${!token:-}" ]; then
      missing+=("$token")
    fi
  done < <(grep -oE '\$\{[A-Z0-9_]+\}' "$SPEC_FILE" | sed -e 's/^\${//' -e 's/}$//' | sort -u)

  if [ "${#missing[@]}" -gt 0 ]; then
    for var in "${missing[@]}"; do
      echo "Error: missing $var — see .do/README.md" >&2
    done
    exit 1
  fi
}

render_spec() {
  RENDERED_SPEC="$(mktemp "${TMPDIR:-/tmp}/infra-008-app-spec.XXXXXX.yaml")"
  envsubst < "$SPEC_FILE" > "$RENDERED_SPEC"
}

deploy() {
  local output app_id default_ingress

  output="$(doctl apps create --spec "$RENDERED_SPEC" --upsert --wait --format ID,DefaultIngress --no-header)"
  app_id="$(printf '%s\n' "$output" | awk '{print $1}')"
  default_ingress="$(printf '%s\n' "$output" | awk '{print $2}')"

  echo "App ID: $app_id"
  echo "Public URL: $default_ingress"
  echo "Record this URL under 'Current deployments' in .do/README.md."
}

load_values
validate_placeholders
render_spec
deploy
