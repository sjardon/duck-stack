#!/usr/bin/env bash
# .do/monitoring/deploy.sh — render .do/monitoring/monitor.json against a
# values file and reconcile a Better Stack Uptime monitor via its REST API,
# then invite the configured alert recipient into the same team (INFRA-011:
# R001, R002, R003, R004, R007, R008).
#
# Usage: .do/monitoring/deploy.sh <values-file>
#
# <values-file> is the same shell-sourceable file used by .do/deploy.sh (see
# .do/.env.deploy.example): it must declare every placeholder referenced by
# .do/monitoring/monitor.json, plus BETTERSTACK_API_TOKEN and
# BETTERSTACK_ALERT_EMAIL. See .do/monitoring/README.md for the full
# procedure and prerequisites.

set -euo pipefail

usage() {
  cat <<'EOF'
Usage: .do/monitoring/deploy.sh <values-file>

<values-file> is a shell-sourceable file declaring every placeholder
referenced by .do/monitoring/monitor.json, plus BETTERSTACK_API_TOKEN and
BETTERSTACK_ALERT_EMAIL (see .do/.env.deploy.example). Copy the example file
to .do/.env.deploy.<environment>, fill in the real values, and pass its path
here — it is the same file .do/deploy.sh uses.
EOF
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MONITOR_FILE="$SCRIPT_DIR/monitor.json"

UPTIME_API_BASE="https://uptime.betterstack.com/api/v2"
TEAM_MEMBERS_URL="https://betterstack.com/api/v2/team-members"

# Read via `python3 -c "$CODE" ...` (code passed as an argument, not on
# stdin) so stdin stays free for the piped API response — `python3 - <<EOF`
# would otherwise consume the heredoc as the script itself, leaving nothing
# on stdin for json.load() to parse.
FIND_MONITOR_SCRIPT='
import json
import sys

target_url = sys.argv[1]

try:
    data = json.load(sys.stdin)
except Exception:
    sys.exit(0)

for entry in data.get("data", []) if isinstance(data, dict) else []:
    attributes = entry.get("attributes", {}) if isinstance(entry, dict) else {}
    if attributes.get("url") == target_url:
        print(entry.get("id", ""))
        break
'

EXTRACT_MONITOR_ID_SCRIPT='
import json
import sys

try:
    data = json.load(sys.stdin)
    print(data.get("data", {}).get("id", ""))
except Exception:
    print("")
'

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
RENDERED_MONITOR_BODY=""
EXISTING_MONITOR_ID=""
MONITOR_ID=""

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

# Validates that every ${VAR} placeholder referenced by monitor.json, plus
# the two invite-only variables (BETTERSTACK_API_TOKEN, BETTERSTACK_ALERT_EMAIL)
# that never appear in monitor.json itself, have a non-empty value after
# sourcing the values file. Fails fast, before any network call or rendering,
# listing every missing variable.
validate_placeholders() {
  local missing=()
  local token

  while IFS= read -r token; do
    [ -z "$token" ] && continue
    if [ -z "${!token:-}" ]; then
      missing+=("$token")
    fi
  done < <(grep -oE '\$\{[A-Z0-9_]+\}' "$MONITOR_FILE" | sed -e 's/^\${//' -e 's/}$//' | sort -u)

  for token in BETTERSTACK_API_TOKEN BETTERSTACK_ALERT_EMAIL; do
    if [ -z "${!token:-}" ]; then
      local already_listed=""
      local m
      for m in "${missing[@]:-}"; do
        [ "$m" = "$token" ] && already_listed=1
      done
      [ -z "$already_listed" ] && missing+=("$token")
    fi
  done

  if [ "${#missing[@]}" -gt 0 ]; then
    for var in "${missing[@]}"; do
      echo "Error: missing $var — see .do/monitoring/README.md" >&2
    done
    exit 1
  fi
}

# Renders monitor.json with envsubst into a temp file (cleaned up on exit)
# and keeps its content in RENDERED_MONITOR_BODY, the exact string sent as
# the request body to the Better Stack Uptime API.
render_monitor_spec() {
  RENDERED_SPEC="$(mktemp "${TMPDIR:-/tmp}/infra-011-monitor-spec.XXXXXX.json")"
  envsubst < "$MONITOR_FILE" > "$RENDERED_SPEC"
  RENDERED_MONITOR_BODY="$(cat "$RENDERED_SPEC")"
}

# Shared helper for every Better Stack API call: sends $method to $url with
# the team-scoped bearer token, adding the JSON body and its Content-Type
# header only when $body is given, prints the response body to stdout, and
# returns curl's exit status — the single place find_existing_monitor,
# upsert_monitor, and invite_recipient get their Authorization/curl
# boilerplate from, instead of each repeating it.
api_request() {
  local method="$1" url="$2" body="${3:-}"

  if [ -n "$body" ]; then
    curl -sS --fail-with-body -X "$method" \
      -H "Authorization: Bearer ${BETTERSTACK_API_TOKEN}" \
      -H "Content-Type: application/json" \
      -d "$body" \
      "$url"
  else
    curl -sS --fail-with-body -X "$method" \
      -H "Authorization: Bearer ${BETTERSTACK_API_TOKEN}" \
      "$url"
  fi
}

# Lists the team's existing Uptime monitors and sets EXISTING_MONITOR_ID to
# the id of the entry whose attributes.url matches BETTERSTACK_MONITOR_URL,
# or to the empty string when no monitor targets that url yet.
find_existing_monitor() {
  local response curl_exit

  response="$(api_request GET "$UPTIME_API_BASE/monitors")"
  curl_exit=$?

  if [ "$curl_exit" -ne 0 ]; then
    echo "Error: failed to list Better Stack Uptime monitors (curl exit $curl_exit)." >&2
    echo "$response" >&2
    exit 1
  fi

  EXISTING_MONITOR_ID="$(printf '%s' "$response" | python3 -c "$FIND_MONITOR_SCRIPT" "$BETTERSTACK_MONITOR_URL")"
}

# Idempotently reconciles the Better Stack Uptime monitor: PATCHes the
# existing monitor found by find_existing_monitor, or POSTs a new one when
# none targets BETTERSTACK_MONITOR_URL yet. Sets MONITOR_ID to the resulting
# monitor's id.
upsert_monitor() {
  find_existing_monitor

  local response curl_exit method url

  if [ -n "$EXISTING_MONITOR_ID" ]; then
    method="PATCH"
    url="$UPTIME_API_BASE/monitors/$EXISTING_MONITOR_ID"
  else
    method="POST"
    url="$UPTIME_API_BASE/monitors"
  fi

  response="$(api_request "$method" "$url" "$RENDERED_MONITOR_BODY")"
  curl_exit=$?

  if [ "$curl_exit" -ne 0 ]; then
    echo "Error: failed to $method the Better Stack Uptime monitor (curl exit $curl_exit)." >&2
    echo "$response" >&2
    exit 1
  fi

  MONITOR_ID="$(printf '%s' "$response" | python3 -c "$EXTRACT_MONITOR_ID_SCRIPT")"

  if [ -z "$MONITOR_ID" ]; then
    MONITOR_ID="$EXISTING_MONITOR_ID"
  fi
}

# Invites BETTERSTACK_ALERT_EMAIL into the team scoped by BETTERSTACK_API_TOKEN
# so it receives that environment's downtime/recovery notifications (R003,
# R004). A response indicating the address is already a member is treated as
# success, keeping the step idempotent (EC005 depends on this recipient
# being a confirmed team member before the mandatory delivery test).
invite_recipient() {
  local response curl_exit body

  body="$(printf '{"email": "%s"}' "$BETTERSTACK_ALERT_EMAIL")"

  response="$(api_request POST "$TEAM_MEMBERS_URL" "$body")"
  curl_exit=$?

  if [ "$curl_exit" -eq 0 ]; then
    return 0
  fi

  if printf '%s' "$response" | grep -qi 'already'; then
    return 0
  fi

  echo "Error: failed to invite $BETTERSTACK_ALERT_EMAIL as a Better Stack team member (curl exit $curl_exit)." >&2
  echo "$response" >&2
  exit 1
}

main() {
  load_values
  validate_placeholders
  render_monitor_spec
  upsert_monitor
  invite_recipient

  echo "Monitor ID: $MONITOR_ID"
  echo "Monitor URL: $BETTERSTACK_MONITOR_URL"
  echo
  echo "Reminder: this environment is not considered monitored until the"
  echo "mandatory end-to-end delivery test (EC005) has been performed —"
  echo "deliberately force a downtime notification and a recovery"
  echo "notification and confirm both are received at $BETTERSTACK_ALERT_EMAIL."
  echo "See .do/monitoring/README.md."
}

main
