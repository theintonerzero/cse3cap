#!/usr/bin/env bash
#
# Proves the diary home's invariants still hold.
#
#   ./run verify-diary                 from the repository root
#   ./scripts/verify-diary-home.sh     the same thing
#
# web/ has no test runner (CLAUDE.md), so this is where a frontend check
# lives. verify-client.sh covers the API client and verify-app-shell.sh the
# shell; this covers the screen mounted inside it, and they do not overlap.
#
# 1. The screen is actually mounted. A screen built but left behind a
#    placeholder is a screen nobody can reach.
# 2. Rows link somewhere the router knows. The diary addresses a reflection
#    rather than an entry, and a link to a route that does not exist lands
#    on the catch-all with no error.
# 3. No second API client, and no hand-written response type. Both are
#    invisible to the compiler and both are how contract drift gets in.
# 4. All four states, including skeletons rather than a spinner.
# 5. GET /me/radar really behaves the way the screen maps it: 200 in a
#    scope with reflections, 404 in one without, which the screen renders
#    as empty rather than as an error. Needs a server and a token; skips
#    itself loudly when there is neither.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

BASE="${BASE:-http://127.0.0.1:8000/api/v1}"
TOKENS="${TOKENS:-$HOME/reflection-diary-tokens.txt}"
SCREEN="web/src/screens/DiaryHome.tsx"
SCOPE="web/src/screens/diary-scope.ts"
ROUTES="web/src/app/routes.tsx"

if [ -t 1 ]; then
    blu=$'\033[1;34m'; grn=$'\033[1;32m'; red=$'\033[1;31m'
    ylw=$'\033[1;33m'; off=$'\033[0m'
else
    blu=''; grn=''; red=''; ylw=''; off=''
fi

pass=0; fail=0; skip=0
say()  { printf '\n%s==>%s %s\n' "$blu" "$off" "$1"; }
ok()   { pass=$((pass+1)); printf '  %sok%s   %-54s %s\n' "$grn" "$off" "$1" "${2:-}"; }
bad()  { fail=$((fail+1)); printf '  %sFAIL%s %-54s %s\n' "$red" "$off" "$1" "${2:-}"; }
meh()  { skip=$((skip+1)); printf '  %sskip%s %-54s %s\n' "$ylw" "$off" "$1" "${2:-}"; }

# --------------------------------------------------------------------------
say "1. The screen is mounted"

if grep -q '<DiaryHome />' "$ROUTES"; then
    ok "routes.tsx renders DiaryHome"
else
    bad "routes.tsx renders DiaryHome" "index route still a placeholder?"
fi

if grep -q 'screen="Diary" ticket="CAP-7"' "$ROUTES"; then
    bad "the CAP-7 placeholder is gone" "still in $ROUTES"
else
    ok "the CAP-7 placeholder is gone"
fi

# --------------------------------------------------------------------------
say "2. Rows link somewhere the router knows"

if grep -q 'to={`/reflections/' "$SCREEN"; then
    if grep -q 'path="reflections/:reflection_id"' "$ROUTES"; then
        ok "/reflections/:reflection_id is a real route"
    else
        bad "/reflections/:reflection_id is a real route" "link with no route"
    fi
else
    bad "rows link to a reflection" "no link found in $SCREEN"
fi

# --------------------------------------------------------------------------
say "3. One API client, no hand-written types"

if grep -qE '\bfetch\(' "$SCREEN" "$SCOPE"; then
    bad "no direct fetch" "$(grep -lE '\bfetch\(' "$SCREEN" "$SCOPE" | tr '\n' ' ')"
else
    ok "no direct fetch"
fi

if grep -qE '^\s*(export )?interface .*(Response|Payload)\b' "$SCREEN" "$SCOPE"; then
    bad "no hand-written response type" "declare it in the contract instead"
else
    ok "no hand-written response type"
fi

if grep -q "from '../api/schema.ts'" "$SCOPE"; then
    ok "payload types come from the generated schema"
else
    bad "payload types come from the generated schema" "check $SCOPE"
fi

# --------------------------------------------------------------------------
say "4. All four states"

states_missing=""
grep -q "status: 'loading'" "$SCREEN"   || states_missing="$states_missing loading"
grep -q "status: 'error'" "$SCREEN"     || states_missing="$states_missing error"
grep -q 'styles.empty' "$SCREEN"        || states_missing="$states_missing empty"
grep -q "status: 'loaded'" "$SCREEN"    || states_missing="$states_missing loaded"

if [ -z "$states_missing" ]; then
    ok "loading, error, empty and loaded all present"
else
    bad "loading, error, empty and loaded all present" "missing:$states_missing"
fi

if grep -q 'Skeleton' "$SCREEN"; then
    ok "loading uses skeletons, not a spinner"
else
    bad "loading uses skeletons, not a spinner"
fi

# --------------------------------------------------------------------------
say "5. GET /me/radar behaves the way the screen maps it"

TOKEN=""
[ -f "$TOKENS" ] && TOKEN="$(grep -s 'Jane N' "$TOKENS" | awk '{print $NF}')"

if [ -z "$TOKEN" ]; then
    meh "live radar checks" "no token for Jane N in $TOKENS"
elif ! curl -fsS -o /dev/null "$BASE/auth/me" -H "Authorization: Bearer $TOKEN" 2>/dev/null; then
    meh "live radar checks" "nothing answering on $BASE"
else
    code="$(curl -s -o /dev/null -w '%{http_code}' "$BASE/me/radar" \
        -H "Authorization: Bearer $TOKEN")"
    if [ "$code" = "200" ]; then
        ok "unscoped radar answers" "200"
    else
        bad "unscoped radar answers" "got $code"
    fi

    # A scope this caller has written nothing in is the 404 the screen
    # renders as empty rather than as an error. A uuid that matches no gig
    # of theirs does it: the framework lookup finds no reflection in scope.
    code="$(curl -s -o /dev/null -w '%{http_code}' \
        "$BASE/me/radar?gig_id=00000000-0000-4000-8000-000000000000" \
        -H "Authorization: Bearer $TOKEN")"
    if [ "$code" = "404" ]; then
        ok "a scope with nothing written 404s" "the screen's empty state"
    else
        bad "a scope with nothing written 404s" "got $code"
    fi
fi

# --------------------------------------------------------------------------
printf '\n%s%d passed%s, %s%d failed%s, %s%d skipped%s\n' \
    "$grn" "$pass" "$off" "$red" "$fail" "$off" "$ylw" "$skip" "$off"

[ "$fail" -eq 0 ]
