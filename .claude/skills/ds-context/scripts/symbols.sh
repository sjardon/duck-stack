#!/usr/bin/env bash
# symbols.sh — Show exported symbols and signatures from a TypeScript file,
# without function/class/interface bodies.
#
# Captures every `export ...` declaration. Multi-line signatures are joined
# into one line. Bodies (everything from the first top-level `{` of the
# declaration onward) are stripped.
#
# Known limitations (v1):
#   - Does not handle `{` appearing inside strings/comments/JSX in the
#     signature itself (rare in practice for export declarations).
#   - Does not unwrap default exports of expressions (e.g.
#     `export default foo()`).
#
# Usage: symbols.sh <typescript-file>

set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "Usage: $(basename "$0") <typescript-file>" >&2
  exit 1
fi

FILE="$1"
if [ ! -f "$FILE" ]; then
  echo "Error: file not found: $FILE" >&2
  exit 1
fi

awk '
  function flush(line) {
    # Strip body opener and everything after.
    sub(/[[:space:]]*\{.*$/, "", line)
    # Strip trailing whitespace.
    sub(/[[:space:]]+$/, "", line)
    print line
  }

  BEGIN { collecting = 0; buf = "" }

  /^export[[:space:]]/ {
    if (collecting) flush(buf)
    buf = $0
    collecting = 1
    if (index($0, "{") > 0 || index($0, ";") > 0) {
      flush(buf)
      collecting = 0
      buf = ""
    }
    next
  }

  collecting {
    buf = buf " " $0
    sub(/[[:space:]]+/, " ", buf)
    if (index($0, "{") > 0 || index($0, ";") > 0) {
      flush(buf)
      collecting = 0
      buf = ""
    }
  }

  END { if (collecting) flush(buf) }
' "$FILE"
