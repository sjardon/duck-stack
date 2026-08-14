#!/usr/bin/env bash
# T018 — Acceptance test for R007, R008, NF002, EC002, EC003.
#
# WHEN duck-spec/modules/infra/FEATURES.md is inspected
# THEN the ## INFRA-002, ## INFRA-003, ## INFRA-004, ## INFRA-005, ## INFRA-006,
#      ## INFRA-007 entries each have **Estado:** DEPRECATED;
# INFRA-002 and INFRA-003's bodies contain a "never applied"/"never operated" statement;
# INFRA-005's body names NOTIFICATIONS-002;
# INFRA-006 and INFRA-007's bodies name INFRA-011;
# and every original section heading of each entry (### Contexto, ### Objetivo, etc.)
# is still present (content not deleted).
#
# Expected to FAIL until T019 (deprecate the six AWS feature entries) lands.

set -u

REPO_ROOT="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)"
cd "$REPO_ROOT"

FEATURES="duck-spec/modules/infra/FEATURES.md"
fail=0

if [ ! -f "$FEATURES" ]; then
  echo "FAIL: $FEATURES does not exist"
  exit 1
fi

# Extracts the body of a "## INFRA-XXX ..." entry, up to (excluding) the next "## " heading.
extract_entry() {
  local id="$1"
  awk -v id="## ${id}" '
    $0 ~ "^" id { found=1; print; next }
    found && /^## / { exit }
    found { print }
  ' "$FEATURES"
}

for id in INFRA-002 INFRA-003 INFRA-004 INFRA-005 INFRA-006 INFRA-007; do
  entry="$(extract_entry "$id")"
  if [ -z "$entry" ]; then
    echo "FAIL: entry $id not found in $FEATURES"
    fail=1
    continue
  fi

  if echo "$entry" | grep -q '\*\*Estado:\*\* DEPRECATED'; then
    echo "PASS: $id has **Estado:** DEPRECATED"
  else
    echo "FAIL: $id does not have **Estado:** DEPRECATED"
    fail=1
  fi

  for heading in "### Contexto" "### Objetivo" "### Requerimientos funcionales" \
                 "### Fuera de scope" "### Requerimientos no funcionales" \
                 "### Technical constraints" "### Dependencias"; do
    if echo "$entry" | grep -qF "$heading"; then
      : # present, keep quiet to avoid excessive noise
    else
      echo "FAIL: $id is missing original section heading '$heading' — original content must not be deleted"
      fail=1
    fi
  done

  case "$id" in
    INFRA-002|INFRA-003)
      if echo "$entry" | grep -qiE 'never applied'; then
        :
      else
        echo "FAIL: $id body does not state the design was 'never applied'"
        fail=1
      fi
      if echo "$entry" | grep -qiE 'never operated'; then
        :
      else
        echo "FAIL: $id body does not state the design was 'never operated'"
        fail=1
      fi
      ;;
    INFRA-005)
      if echo "$entry" | grep -q 'NOTIFICATIONS-002'; then
        :
      else
        echo "FAIL: $id body does not name NOTIFICATIONS-002 as the replacement"
        fail=1
      fi
      ;;
    INFRA-006|INFRA-007)
      if echo "$entry" | grep -q 'INFRA-011'; then
        :
      else
        echo "FAIL: $id body does not name INFRA-011 as the replacement"
        fail=1
      fi
      ;;
  esac
done

if [ "$fail" -eq 0 ]; then
  echo "PASS: all six entries carry required deprecation content"
fi

exit "$fail"
