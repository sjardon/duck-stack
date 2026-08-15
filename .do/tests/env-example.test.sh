#!/usr/bin/env bash
# Acceptance tests for .do/.env.deploy.example (INFRA-008)
#
# Covers:
#   T023 (R007)   — every ${VAR} token referenced in .do/app.yaml has a
#                   corresponding VAR= line in .do/.env.deploy.example
#   T025 (NF003)  — the 7 keys R008 classifies as sensitive are declared with an
#                   empty value (KEY=) in .do/.env.deploy.example
#
#   INFRA011-T004 (R007, R008) — BETTERSTACK_LOGS_TOKEN, BETTERSTACK_API_TOKEN and
#                   BETTERSTACK_ALERT_EMAIL are each declared with an empty value
#                   (KEY=) in .do/.env.deploy.example. T023's existing generic
#                   ${VAR} scan already covers BETTERSTACK_LOGS_TOKEN once it
#                   appears in .do/app.yaml (INFRA-011).
#
# This is the "test" phase of INFRA-008: neither .do/app.yaml nor
# .do/.env.deploy.example exist yet, so every assertion below is expected to FAIL
# until the "implement" phase creates them. INFRA011-T004's assertions are the
# "test" phase of INFRA-011: these three keys are not declared yet, so they are
# expected to FAIL until INFRA-011's "implement" phase adds them.
#
# Run: bash .do/tests/env-example.test.sh

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SPEC_FILE="$REPO_ROOT/.do/app.yaml"
EXAMPLE_FILE="$REPO_ROOT/.do/.env.deploy.example"

FAILED=0

pass() { echo "PASS: $1"; }
fail() { echo "FAIL: $1"; FAILED=1; }

SECRET_KEYS=(
  DATABASE_URL CLERK_SECRET_KEY CLERK_JWT_KEY CLERK_WEBHOOK_SIGNING_SECRET
  MOBBEX_API_KEY MOBBEX_ACCESS_TOKEN MOBBEX_WEBHOOK_SECRET
)

# INFRA011-T004 (R007, R008): monitoring & log-forwarding credentials
INFRA011_SECRET_KEYS=(
  BETTERSTACK_LOGS_TOKEN BETTERSTACK_API_TOKEN BETTERSTACK_ALERT_EMAIL
)

if [ ! -f "$SPEC_FILE" ]; then
  fail "T023: $SPEC_FILE does not exist; cannot enumerate its \${VAR} placeholders"
fi
if [ ! -f "$EXAMPLE_FILE" ]; then
  fail "T023: $EXAMPLE_FILE does not exist"
  fail "T025: $EXAMPLE_FILE does not exist"
  exit "$FAILED"
fi

# --- T023 (R007): every ${VAR} token in app.yaml has a matching VAR= line ---
if [ -f "$SPEC_FILE" ]; then
  TOKENS=()
  while IFS= read -r token; do
    [ -n "$token" ] && TOKENS+=("$token")
  done < <(grep -oE '\$\{[A-Z0-9_]+\}' "$SPEC_FILE" | sed -e 's/^\${//' -e 's/}$//' | sort -u)

  if [ "${#TOKENS[@]}" -eq 0 ]; then
    fail "T023: found no \${VAR} placeholders in $SPEC_FILE"
  fi

  MISSING=()
  for var in "${TOKENS[@]}"; do
    if ! grep -qE "^${var}=" "$EXAMPLE_FILE"; then
      MISSING+=("$var")
    fi
  done

  if [ "${#MISSING[@]}" -eq 0 ] && [ "${#TOKENS[@]}" -gt 0 ]; then
    pass "T023: every \${VAR} placeholder in $SPEC_FILE has a matching VAR= line in $EXAMPLE_FILE"
  else
    fail "T023: $EXAMPLE_FILE is missing a VAR= line for: ${MISSING[*]:-<see above>}"
  fi
fi

# --- T025 (NF003): sensitive keys carry no example value ---
for key in "${SECRET_KEYS[@]}"; do
  line="$(grep -E "^${key}=" "$EXAMPLE_FILE" || true)"
  if [ -z "$line" ]; then
    fail "T025: $EXAMPLE_FILE has no '${key}=' line"
    continue
  fi
  value_part="${line#*=}"
  value_part="${value_part%%#*}"
  value_part="$(printf '%s' "$value_part" | sed -e 's/[[:space:]]*$//')"
  if [ -z "$value_part" ]; then
    pass "T025: ${key} is declared with an empty value in $EXAMPLE_FILE"
  else
    fail "T025: expected ${key}= to have an empty value in $EXAMPLE_FILE, got '${key}=${value_part}'"
  fi
done

# --- INFRA011-T004 (R007, R008): monitoring credential keys carry no example value ---
for key in "${INFRA011_SECRET_KEYS[@]}"; do
  line="$(grep -E "^${key}=" "$EXAMPLE_FILE" || true)"
  if [ -z "$line" ]; then
    fail "INFRA011-T004: $EXAMPLE_FILE has no '${key}=' line"
    continue
  fi
  value_part="${line#*=}"
  value_part="${value_part%%#*}"
  value_part="$(printf '%s' "$value_part" | sed -e 's/[[:space:]]*$//')"
  if [ -z "$value_part" ]; then
    pass "INFRA011-T004: ${key} is declared with an empty value in $EXAMPLE_FILE"
  else
    fail "INFRA011-T004: expected ${key}= to have an empty value in $EXAMPLE_FILE, got '${key}=${value_part}'"
  fi
done

exit "$FAILED"
