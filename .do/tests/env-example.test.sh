#!/usr/bin/env bash
# Acceptance tests for .do/.env.deploy.example (INFRA-008)
#
# Covers:
#   T023 (R007)   — every ${VAR} token referenced in .do/app.yaml has a
#                   corresponding VAR= line in .do/.env.deploy.example
#   T025 (NF003)  — the 7 keys R008 classifies as sensitive are declared with an
#                   empty value (KEY=) in .do/.env.deploy.example
#
# This is the "test" phase of INFRA-008: neither .do/app.yaml nor
# .do/.env.deploy.example exist yet, so every assertion below is expected to FAIL
# until the "implement" phase creates them.
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

exit "$FAILED"
