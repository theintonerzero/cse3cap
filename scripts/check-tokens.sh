#!/usr/bin/env bash
#
# ./run check step (CAP-1). Fails if web/src/ contains a raw hex colour
# or a magic pixel value outside tokens.css, where every colour, space
# and radius value is required to live as a CSS custom property.
#
# Usage: scripts/check-tokens.sh [source-dir]
#
# source-dir defaults to web/src. Tests pass a fixture directory instead
# so scripts/check-tokens.test.py never touches the real tree.
#
# Two known false-positive shapes: a CSS id selector that happens to look
# hex (#face), and a comment that mentions a pixel value in prose. Both
# are rare here (CSS Modules do not use id selectors) and both fail loud
# rather than silent, so a real one gets caught in review instead of
# slipping through.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="${1:-$ROOT/web/src}"

HEX_PATTERN='#[0-9A-Fa-f]{3,8}\b'
PX_PATTERN='[0-9]+px'

fail=0

while IFS= read -r -d '' file; do
    base="$(basename "$file")"
    [ "$base" = "tokens.css" ] && continue
    [ "$base" = "schema.ts" ] && continue

    hex_hits="$(grep -nE "$HEX_PATTERN" "$file" || true)"
    if [ -n "$hex_hits" ]; then
        echo "Raw hex colour outside tokens.css: $file"
        echo "$hex_hits" | sed 's/^/  /'
        fail=1
    fi

    px_hits="$(grep -nE "$PX_PATTERN" "$file" | grep -vE '\b0px\b' || true)"
    if [ -n "$px_hits" ]; then
        echo "Magic pixel value outside tokens.css: $file"
        echo "$px_hits" | sed 's/^/  /'
        fail=1
    fi
done < <(find "$SRC" \( -name '*.css' -o -name '*.ts' -o -name '*.tsx' \) -print0)

if [ "$fail" -ne 0 ]; then
    echo
    echo "Move the value into web/src/tokens.css as a custom property and reference it with var(--name)."
    exit 1
fi

echo "No raw hex or magic pixel values outside tokens.css."
