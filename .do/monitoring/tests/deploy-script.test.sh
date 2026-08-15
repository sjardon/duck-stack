#!/usr/bin/env bash
# Acceptance tests for .do/monitoring/deploy.sh (INFRA-011)
#
# Covers:
#   T012 (R007, R008) — running .do/monitoring/deploy.sh with a values file
#                        missing BETTERSTACK_ALERT_EMAIL exits non-zero, prints a
#                        message identifying the missing variable, and never
#                        invokes the stub curl.
#   T014 (R001, R007)  — using a stub curl on PATH: (a) when the stub's
#                        GET .../monitors response contains no matching url,
#                        deploy.sh issues a POST .../monitors with the rendered
#                        body; (b) when the stub's GET response contains a
#                        matching url, deploy.sh issues a
#                        PATCH .../monitors/<id> instead, never a second POST to
#                        the monitors create endpoint.
#   T016 (R003, R004, R007) — the stub curl log shows a POST .../team-members
#                        call with a JSON body containing
#                        BETTERSTACK_ALERT_EMAIL's value; a stub response
#                        indicating the address is already a member still
#                        yields exit 0.
#
# The stub curl records every invocation to a log file and returns canned
# responses driven by env vars set per scenario below. It infers the HTTP
# method from an explicit "-X <METHOD>" flag (defaulting to GET, or POST when
# a request body is present without an explicit method), and distinguishes
# the monitors list/create endpoint from the monitors/<id> update endpoint by
# whether the URL path ends in an id segment after "/monitors/".
#
# This is the "test" phase of INFRA-011: .do/monitoring/deploy.sh does not
# exist yet, so every assertion below is expected to FAIL until the
# "implement" phase creates it.
#
# Run: bash .do/monitoring/tests/deploy-script.test.sh

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
DEPLOY_SCRIPT="$REPO_ROOT/.do/monitoring/deploy.sh"

FAILED=0

pass() { echo "PASS: $1"; }
fail() { echo "FAIL: $1"; FAILED=1; }

WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

STUB_BIN_DIR="$WORK_DIR/bin"
mkdir -p "$STUB_BIN_DIR"
CURL_LOG="$WORK_DIR/curl.log"

MONITOR_ID="stub-monitor-id-987"
MONITOR_URL_VALUE="https://stub-env.ondigitalocean.app/health"
ALERT_EMAIL_VALUE="ops+stub@example.com"

# --- Canned response bodies, one file per scenario ---
NO_MATCH_LIST_RESPONSE="$WORK_DIR/no-match-list.json"
cat > "$NO_MATCH_LIST_RESPONSE" <<EOF
{"data": [{"id": "other-id", "attributes": {"url": "https://unrelated.example.com/health"}}]}
EOF

MATCH_LIST_RESPONSE="$WORK_DIR/match-list.json"
cat > "$MATCH_LIST_RESPONSE" <<EOF
{"data": [{"id": "$MONITOR_ID", "attributes": {"url": "$MONITOR_URL_VALUE"}}]}
EOF

CREATE_RESPONSE="$WORK_DIR/create-response.json"
cat > "$CREATE_RESPONSE" <<EOF
{"data": {"id": "$MONITOR_ID", "attributes": {"url": "$MONITOR_URL_VALUE"}}}
EOF

UPDATE_RESPONSE="$WORK_DIR/update-response.json"
cat > "$UPDATE_RESPONSE" <<EOF
{"data": {"id": "$MONITOR_ID", "attributes": {"url": "$MONITOR_URL_VALUE"}}}
EOF

TEAM_MEMBER_CREATED_RESPONSE="$WORK_DIR/team-member-created.json"
cat > "$TEAM_MEMBER_CREATED_RESPONSE" <<EOF
{"data": {"id": "member-1", "attributes": {"email": "$ALERT_EMAIL_VALUE"}}}
EOF

TEAM_MEMBER_ALREADY_RESPONSE="$WORK_DIR/team-member-already.json"
cat > "$TEAM_MEMBER_ALREADY_RESPONSE" <<EOF
{"errors": "Email has already been taken"}
EOF

# The stub curl script (below) is a separate executable invoked as a child
# process of deploy.sh, so every value it needs must be exported.
export WORK_DIR CURL_LOG TEAM_MEMBER_ALREADY_RESPONSE TEAM_MEMBER_CREATED_RESPONSE \
  UPDATE_RESPONSE CREATE_RESPONSE

# --- Stub curl: logs every call, routes by URL/method, returns the response
#     file named by the matching STUB_*_RESPONSE env var. ---
cat > "$STUB_BIN_DIR/curl" <<'STUBEOF'
#!/usr/bin/env bash
{
  printf 'CALL'
  for a in "$@"; do printf '\t%s' "$a"; done
  printf '\n'
} >> "$CURL_LOG"

method="GET"
url=""
body=""
prev=""
for a in "$@"; do
  if [ "$prev" = "-X" ]; then
    method="$a"
  fi
  if [ "$prev" = "-d" ] || [ "$prev" = "--data" ]; then
    body="$a"
  fi
  case "$a" in
    http://*|https://*) url="$a" ;;
  esac
  prev="$a"
done

if [ -n "$body" ] && [ "$method" = "GET" ]; then
  method="POST"
fi

case "$url" in
  *"/team-members"*)
    printf '%s\n' "$body" >> "$WORK_DIR/team-members-bodies.log"
    if [ "${STUB_TEAM_MEMBER_ALREADY:-}" = "1" ]; then
      cat "$TEAM_MEMBER_ALREADY_RESPONSE"
    else
      cat "$TEAM_MEMBER_CREATED_RESPONSE"
    fi
    exit 0
    ;;
esac

case "$url" in
  *"/monitors/"*)
    printf '%s\n' "$body" >> "$WORK_DIR/monitor-patch-bodies.log"
    cat "$UPDATE_RESPONSE"
    exit 0
    ;;
  *"/monitors"*)
    if [ "$method" = "GET" ]; then
      cat "$STUB_MONITORS_LIST_RESPONSE"
      exit 0
    fi
    if [ "$method" = "POST" ]; then
      printf '%s\n' "$body" >> "$WORK_DIR/monitor-post-bodies.log"
      cat "$CREATE_RESPONSE"
      exit 0
    fi
    ;;
esac

echo "STUB_CURL: unrecognized request: method=$method url=$url" >&2
exit 1
STUBEOF
chmod +x "$STUB_BIN_DIR/curl"

STUBBED_PATH="$STUB_BIN_DIR:$PATH"

# --- Values every scenario needs (monitor.json placeholders + the two
#     invite-only variables validate_placeholders checks directly) ---
FULL_VALUES_FILE="$WORK_DIR/full.env"
cat > "$FULL_VALUES_FILE" <<EOF
DO_APP_NAME=stub-env
BETTERSTACK_MONITOR_URL=$MONITOR_URL_VALUE
BETTERSTACK_CHECK_FREQUENCY_SECONDS=30
BETTERSTACK_CHECK_TIMEOUT_SECONDS=10
BETTERSTACK_API_TOKEN=stub-api-token
BETTERSTACK_ALERT_EMAIL=$ALERT_EMAIL_VALUE
EOF

INCOMPLETE_VALUES_FILE="$WORK_DIR/incomplete.env"
grep -v '^BETTERSTACK_ALERT_EMAIL=' "$FULL_VALUES_FILE" > "$INCOMPLETE_VALUES_FILE"

if [ ! -f "$DEPLOY_SCRIPT" ]; then
  fail "T012: $DEPLOY_SCRIPT does not exist"
  fail "T014: $DEPLOY_SCRIPT does not exist"
  fail "T016: $DEPLOY_SCRIPT does not exist"
  exit "$FAILED"
fi
if [ ! -x "$DEPLOY_SCRIPT" ]; then
  fail "T012: $DEPLOY_SCRIPT is not executable"
fi

# --- T012 (R007, R008): fails fast on a missing required variable ---
rm -f "$CURL_LOG"
INCOMPLETE_RUN_OUTPUT="$(CURL_LOG="$CURL_LOG" PATH="$STUBBED_PATH" "$DEPLOY_SCRIPT" "$INCOMPLETE_VALUES_FILE" 2>&1)"
INCOMPLETE_RUN_EXIT=$?

if [ "$INCOMPLETE_RUN_EXIT" -ne 0 ]; then
  pass "T012: deploy.sh exits non-zero when BETTERSTACK_ALERT_EMAIL is missing"
else
  fail "T012: expected deploy.sh to exit non-zero when BETTERSTACK_ALERT_EMAIL is missing, got exit 0. Output:
$INCOMPLETE_RUN_OUTPUT"
fi

if echo "$INCOMPLETE_RUN_OUTPUT" | grep -qF 'BETTERSTACK_ALERT_EMAIL'; then
  pass "T012: deploy.sh error output identifies BETTERSTACK_ALERT_EMAIL as the missing variable"
else
  fail "T012: expected deploy.sh error output to identify BETTERSTACK_ALERT_EMAIL as missing. Output:
$INCOMPLETE_RUN_OUTPUT"
fi

if [ ! -s "$CURL_LOG" ]; then
  pass "T012: deploy.sh did not invoke the stub curl when a required variable is missing"
else
  fail "T012: expected the stub curl to never be invoked when BETTERSTACK_ALERT_EMAIL is missing, but it was: $(cat "$CURL_LOG")"
fi

# --- T014a (R001, R007): no matching monitor -> POST create ---
rm -f "$CURL_LOG" "$WORK_DIR/monitor-post-bodies.log" "$WORK_DIR/monitor-patch-bodies.log"
NO_MATCH_OUTPUT="$(CURL_LOG="$CURL_LOG" STUB_MONITORS_LIST_RESPONSE="$NO_MATCH_LIST_RESPONSE" \
  PATH="$STUBBED_PATH" "$DEPLOY_SCRIPT" "$FULL_VALUES_FILE" 2>&1)"
NO_MATCH_EXIT=$?

if [ "$NO_MATCH_EXIT" -eq 0 ]; then
  pass "T014: deploy.sh exits 0 when no existing monitor matches the configured url"
else
  fail "T014: expected deploy.sh to exit 0 when no existing monitor matches, got exit $NO_MATCH_EXIT. Output:
$NO_MATCH_OUTPUT"
fi

if [ -f "$WORK_DIR/monitor-post-bodies.log" ] && [ -s "$WORK_DIR/monitor-post-bodies.log" ]; then
  pass "T014: deploy.sh issued a POST .../monitors (create) when no existing monitor matches the url"
else
  fail "T014: expected deploy.sh to issue a POST .../monitors (create) when no existing monitor matches the url. curl.log:
$(cat "$CURL_LOG" 2>/dev/null || echo '<no log>')"
fi

if [ -f "$WORK_DIR/monitor-post-bodies.log" ] && grep -qF "$MONITOR_URL_VALUE" "$WORK_DIR/monitor-post-bodies.log"; then
  pass "T014: the POST .../monitors body is the rendered monitor spec (contains the configured monitor url)"
else
  fail "T014: expected the POST .../monitors body to be the rendered monitor spec (containing $MONITOR_URL_VALUE). Body log:
$(cat "$WORK_DIR/monitor-post-bodies.log" 2>/dev/null || echo '<no body log>')"
fi

if [ ! -s "$WORK_DIR/monitor-patch-bodies.log" ] 2>/dev/null; then
  pass "T014: deploy.sh did not issue a PATCH when no existing monitor matches the url"
else
  fail "T014: expected no PATCH call when no existing monitor matches the url, but one was made: $(cat "$WORK_DIR/monitor-patch-bodies.log")"
fi

# --- T014b (R001, R007): matching monitor -> PATCH update, no create POST ---
rm -f "$CURL_LOG" "$WORK_DIR/monitor-post-bodies.log" "$WORK_DIR/monitor-patch-bodies.log"
MATCH_OUTPUT="$(CURL_LOG="$CURL_LOG" STUB_MONITORS_LIST_RESPONSE="$MATCH_LIST_RESPONSE" \
  PATH="$STUBBED_PATH" "$DEPLOY_SCRIPT" "$FULL_VALUES_FILE" 2>&1)"
MATCH_EXIT=$?

if [ "$MATCH_EXIT" -eq 0 ]; then
  pass "T014: deploy.sh exits 0 when an existing monitor matches the configured url"
else
  fail "T014: expected deploy.sh to exit 0 when an existing monitor matches, got exit $MATCH_EXIT. Output:
$MATCH_OUTPUT"
fi

if [ -f "$WORK_DIR/monitor-patch-bodies.log" ] && grep -qF "/monitors/$MONITOR_ID" "$CURL_LOG"; then
  pass "T014: deploy.sh issued a PATCH .../monitors/$MONITOR_ID when an existing monitor matches the url"
else
  fail "T014: expected deploy.sh to issue a PATCH .../monitors/$MONITOR_ID when an existing monitor matches the url. curl.log:
$(cat "$CURL_LOG" 2>/dev/null || echo '<no log>')"
fi

if [ ! -s "$WORK_DIR/monitor-post-bodies.log" ] 2>/dev/null; then
  pass "T014: deploy.sh did not issue a second POST .../monitors (create) when an existing monitor matches the url"
else
  fail "T014: expected no POST .../monitors (create) call when an existing monitor matches the url, but one was made: $(cat "$WORK_DIR/monitor-post-bodies.log")"
fi

# --- T016 (R003, R004, R007): invites the configured recipient ---
rm -f "$CURL_LOG" "$WORK_DIR/team-members-bodies.log"
INVITE_OUTPUT="$(CURL_LOG="$CURL_LOG" STUB_MONITORS_LIST_RESPONSE="$NO_MATCH_LIST_RESPONSE" \
  PATH="$STUBBED_PATH" "$DEPLOY_SCRIPT" "$FULL_VALUES_FILE" 2>&1)"
INVITE_EXIT=$?

if grep -qF "/team-members" "$CURL_LOG" 2>/dev/null; then
  pass "T016: deploy.sh issued a POST .../team-members call"
else
  fail "T016: expected deploy.sh to issue a POST .../team-members call. curl.log:
$(cat "$CURL_LOG" 2>/dev/null || echo '<no log>')"
fi

if [ -f "$WORK_DIR/team-members-bodies.log" ] && grep -qF "$ALERT_EMAIL_VALUE" "$WORK_DIR/team-members-bodies.log"; then
  pass "T016: the POST .../team-members body contains the configured BETTERSTACK_ALERT_EMAIL value"
else
  fail "T016: expected the POST .../team-members body to contain $ALERT_EMAIL_VALUE. Body log:
$(cat "$WORK_DIR/team-members-bodies.log" 2>/dev/null || echo '<no body log>')"
fi

if [ "$INVITE_EXIT" -eq 0 ]; then
  pass "T016: deploy.sh exits 0 on a normal invite"
else
  fail "T016: expected deploy.sh to exit 0 on a normal invite, got exit $INVITE_EXIT. Output:
$INVITE_OUTPUT"
fi

# --- T016: an already-a-member response still yields exit 0 ---
rm -f "$CURL_LOG" "$WORK_DIR/team-members-bodies.log"
ALREADY_MEMBER_OUTPUT="$(CURL_LOG="$CURL_LOG" STUB_MONITORS_LIST_RESPONSE="$NO_MATCH_LIST_RESPONSE" \
  STUB_TEAM_MEMBER_ALREADY=1 PATH="$STUBBED_PATH" "$DEPLOY_SCRIPT" "$FULL_VALUES_FILE" 2>&1)"
ALREADY_MEMBER_EXIT=$?

if [ "$ALREADY_MEMBER_EXIT" -eq 0 ]; then
  pass "T016: deploy.sh exits 0 when the stub response indicates the address is already a member"
else
  fail "T016: expected deploy.sh to exit 0 when the recipient is already a member, got exit $ALREADY_MEMBER_EXIT. Output:
$ALREADY_MEMBER_OUTPUT"
fi

exit "$FAILED"
