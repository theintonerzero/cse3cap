#!/usr/bin/env bash
#
# Fails when either side of the seam has drifted from docs/openapi.yaml.
#
#   ./run contract-drift                 from the repository root
#   ./scripts/check-contract-drift.sh    the same thing
#
# docs/Frontend-and-Backend.md, "What breaks quietly", has the two rows this
# closes (CAP-25):
#
# 1. A contract changed and its types were not regenerated: schema.ts from
#    docs/openapi.yaml, ai-schema.ts from docs/ai-openapi.yaml.
#    TypeScript still compiles, against an API that no longer exists. The
#    types are regenerated into a temp file, with the openapi-typescript
#    version gen:types pins, and compared with the committed file. The
#    committed file is only read, so a local run never overwrites it.
#
# 2. An endpoint changed and the contract did not. Laravel's route list and
#    the contract's operations are compared by scripts/contract-routes.py.
#
# Needs node (npx), php with api/vendor installed, and api/.env. Nothing
# here touches the database: route:list only boots the router.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

CONTRACT="docs/openapi.yaml"
SCHEMA="web/src/api/schema.ts"
AI_CONTRACT="docs/ai-openapi.yaml"
AI_SCHEMA="web/src/api/ai-schema.ts"
# The contract is bundled to JSON so the comparison needs no YAML parser.
# Pinned, unlike CI's lint step, because a bundler that changes its output
# shape would read as drift.
REDOCLY="@redocly/cli@2.55.0"

if [ -t 1 ]; then
    blu=$'\033[1;34m'; grn=$'\033[1;32m'; red=$'\033[1;31m'; dim=$'\033[2m'; off=$'\033[0m'
else
    blu=''; grn=''; red=''; dim=''; off=''
fi

pass=0; fail=0
say() { printf '\n%s==>%s %s\n' "$blu" "$off" "$1"; }
ok()  { pass=$((pass+1)); printf '  %sok%s   %-54s %s\n' "$grn" "$off" "$1" "${2:-}"; }
bad() { fail=$((fail+1)); printf '  %sFAIL%s %-54s %s\n' "$red" "$off" "$1" "${2:-}"; }

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

# --------------------------------------------------------------------------
say "1. The committed types are what the contracts generate"

# One pin, in web/package.json's gen:types, rather than a second copy here.
# Both contracts, Laravel's and the AI sidecar's (ADR #64): the same command
# writes both files, so the same check reads both.
generator="$(grep -o 'openapi-typescript@[0-9][0-9.]*' web/package.json | head -1)"
types_match() {
    local contract="$1" schema="$2" out
    out="$tmp/$(basename "$schema")"
    if ! npx -y "$generator" "$contract" -o "$out" >"$tmp/gen.log" 2>&1; then
        bad "regenerate $schema ($generator)" "see below"
        sed 's/^/    /' "$tmp/gen.log"
    elif diff -q "$out" "$schema" >/dev/null; then
        ok "$schema matches $contract" "$generator"
    else
        bad "$schema matches $contract" "stale"
        diff -u "$schema" "$out" | head -40 | sed 's/^/    /'
        printf '    %sRegenerate and commit: cd web && npm run gen:types%s\n' "$dim" "$off"
    fi
}
if [ -z "$generator" ]; then
    bad "read the openapi-typescript pin from web/package.json" "gen:types changed shape?"
else
    types_match "$CONTRACT" "$SCHEMA"
    types_match "$AI_CONTRACT" "$AI_SCHEMA"
fi

# --------------------------------------------------------------------------
say "2. Laravel's routes are the contract's operations"

if [ ! -d api/vendor ] || [ ! -f api/.env ]; then
    bad "boot the app for route:list" "needs api/vendor and api/.env (./scripts/setup.sh)"
elif ! (cd api && php artisan route:list --json) >"$tmp/routes.json" 2>"$tmp/routes.log"; then
    bad "php artisan route:list --json" "see below"
    sed 's/^/    /' "$tmp/routes.log"
elif ! npx -y "$REDOCLY" bundle "$CONTRACT" --ext json -o "$tmp/contract.json" \
        >"$tmp/bundle.log" 2>&1; then
    bad "bundle the contract to JSON ($REDOCLY)" "see below"
    sed 's/^/    /' "$tmp/bundle.log"
elif result="$(python3 scripts/contract-routes.py "$tmp/routes.json" "$tmp/contract.json")"; then
    ok "routes and operations agree" "$result"
else
    bad "routes and operations agree" "drifted"
    printf '%s\n' "$result" | sed 's/^/    /'
    printf '    %sChange the contract in the same commit as the route (docs/Frontend-and-Backend.md).%s\n' "$dim" "$off"
fi

# --------------------------------------------------------------------------
printf '\n%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
