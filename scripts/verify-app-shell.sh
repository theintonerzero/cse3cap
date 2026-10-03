#!/usr/bin/env bash
#
# Proves the app shell's three invariants still hold.
#
#   ./run verify-shell               from the repository root
#   ./scripts/verify-app-shell.sh    the same thing
#
# web/ has no test runner (CLAUDE.md), so this is where a frontend check
# lives. Its sibling scripts/verify-client.sh covers the API client itself;
# this covers the shell built on top of it, and they do not overlap.
#
# 1. One owner for the token. If anything other than the session provider
#    calls setAuthToken, the rule that "the app shell owns it and calls
#    setAuthToken once" has quietly stopped being true, and no compiler will
#    say so.
# 2. Every screen has a route. A screen in the scope document with no route
#    is a screen nobody can reach.
# 3. GET /auth/me really returns what the nav is built from. Needs a server;
#    skips itself loudly rather than failing when there is not one.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

BASE="${BASE:-http://127.0.0.1:8000/api/v1}"
TOKENS="${TOKENS:-$HOME/reflection-diary-tokens.txt}"

if [ -t 1 ]; then
    blu=$'\033[1;34m'; grn=$'\033[1;32m'; red=$'\033[1;31m'
    ylw=$'\033[1;33m'; dim=$'\033[2m';    off=$'\033[0m'
else
    blu=''; grn=''; red=''; ylw=''; dim=''; off=''
fi

pass=0; fail=0; skip=0
say()  { printf '\n%s==>%s %s\n' "$blu" "$off" "$1"; }
ok()   { pass=$((pass+1)); printf '  %sok%s   %-54s %s\n' "$grn" "$off" "$1" "${2:-}"; }
bad()  { fail=$((fail+1)); printf '  %sFAIL%s %-54s %s\n' "$red" "$off" "$1" "${2:-}"; }
meh()  { skip=$((skip+1)); printf '  %sskip%s %-54s %s\n' "$ylw" "$off" "$1" "${2:-}"; }

# --------------------------------------------------------------------------
say "1. One owner for the bearer token"

callers="$(grep -rln 'setAuthToken' web/src --include='*.ts' --include='*.tsx' \
    | grep -v 'web/src/api/client.ts' \
    | sort)"

expected='web/src/session/SessionProvider.tsx'

if [ "$callers" = "$expected" ]; then
    ok "only SessionProvider calls setAuthToken"
else
    bad "only SessionProvider calls setAuthToken" "found: ${callers:-nothing}"
fi


# --------------------------------------------------------------------------
say "2. Every screen has a route"

# routes.tsx carries a CAP-10 handover note with an illustrative sample
# route inside a block comment; its continuation lines are prefixed with
# " *". Strip those before matching, so the sample cannot satisfy a check
# for a route that was actually deleted.
routes_live="$(grep -v '^[[:space:]]*\*' web/src/app/routes.tsx)"

for route in \
    'index' \
    'gigs/:gig_id' \
    'reflections/:reflection_id' \
    'reflections/:reflection_id/submitted' \
    'review-queue' \
    'review-queue/reflections/:reflection_id' \
    'frameworks' \
    'frameworks/:framework_id/edit'
do
    # index has no path= attribute of its own; every other route does, and
    # matching the attribute rather than a bare substring is what stops
    # e.g. "frameworks" being satisfied by "frameworks/:framework_id/edit".
    if [ "$route" = 'index' ]; then
        pattern='<Route index'
    else
        pattern="path=\"$route\""
    fi

    if printf '%s\n' "$routes_live" | grep -qF "$pattern"; then
        ok "route $route"
    else
        bad "route $route" "missing from web/src/app/routes.tsx"
    fi
done

# --------------------------------------------------------------------------
say "3. GET /auth/me returns what the nav is built from"

# The newest token on a line naming NAME. A token never holds a space, so
# it is the last field, and every Sanctum token is id|secret, so a last
# field without a | is one of ReflectionSeeder's lines, not a token. Read
# by name and not by shape beyond that, because ADR #46's rdiary_ prefix
# changed the shape once. The same line as #97's scripts/lib/token-for.sh.
token_for() {
    [ -f "$2" ] || return 0
    { grep -F -- "$1" "$2" || true; } | tr -d '\r' | awk 'index($NF, "|") { t = $NF } END { if (t != "") print t }'
}

fake="$(printf 'a%.0s' $(seq 40))"
fixture="$(mktemp)"
trap 'rm -f "$fixture"' EXIT

expect_token() {
    if [ "$2" = "$3" ]; then ok "token read: $1"; else bad "token read: $1" "got '$2'"; fi
}

printf 'Jane N   7|rdiary_%s\n' "$fake" > "$fixture"
expect_token "prefixed"            "$(token_for 'Jane N' "$fixture")" "7|rdiary_$fake"

printf 'Jane N   7|%s\n' "$fake" > "$fixture"
expect_token "unprefixed"          "$(token_for 'Jane N' "$fixture")" "7|$fake"

printf 'Jane N   7|rdiary_%s\r\n' "$fake" > "$fixture"
expect_token "CRLF line endings"   "$(token_for 'Jane N' "$fixture")" "7|rdiary_$fake"

printf 'Jane N   7|old%s\nSam O    8|rdiary_%s\nJane N   9|rdiary_%s\n' "$fake" "$fake" "$fake" > "$fixture"
expect_token "newest of two"       "$(token_for 'Jane N' "$fixture")" "9|rdiary_$fake"

printf 'Sam O    8|rdiary_%s\n' "$fake" > "$fixture"
expect_token "no line for Jane"    "$(token_for 'Jane N' "$fixture")" ""

# php artisan db:seed prints ReflectionSeeder's lines after the tokens, and
# each starts with the student's name, so the last line naming Jane is not
# a token line.
printf 'Jane N   7|rdiary_%s\nSam O    8|rdiary_%s\nJane N   Data migration audit   sprint 2  submitted\n' "$fake" "$fake" > "$fixture"
expect_token "full db:seed output" "$(token_for 'Jane N' "$fixture")" "7|rdiary_$fake"

token="$(token_for 'Jane N' "$TOKENS")"

if [ -z "$token" ]; then
    meh "live check" "$dim""no token in $TOKENS$off"
else
    curl -fsS -o /dev/null "$BASE/auth/me" 2>/dev/null
    rc=$?
    # 0 = answered, 22 = answered with an HTTP error status (401
    # unauthenticated is the expected one here, since this probe sends no
    # token). Anything else means nothing is serving.
    if [ "$rc" -ne 0 ] && [ "$rc" -ne 22 ]; then
        meh "live check" "$dim""nothing serving on $BASE. Start it with ./run api$off"
    else
        body="$(curl -fsS -H "Authorization: Bearer $token" -H 'Accept: application/json' \
            "$BASE/auth/me" 2>/dev/null)"

        if [ -z "$body" ]; then
            bad "GET /auth/me" "no body"
        else
            for field in '"id"' '"display_name"' '"participations"'; do
                case "$body" in
                    *"$field"*) ok "/auth/me carries $field" ;;
                    *)          bad "/auth/me carries $field" "nav cannot be built without it" ;;
                esac
            done

            # A participation is what nav_items_for reads. Without gig_id
            # and role on each one, criterion 3 has nothing to derive from.
            for field in '"gig_id"' '"gig_title"' '"role"'; do
                case "$body" in
                    *"$field"*) ok "a participation carries $field" ;;
                    *)          bad "a participation carries $field" "the nav reads this" ;;
                esac
            done
        fi
    fi
fi

# --------------------------------------------------------------------------
printf '\n%s%s passed%s' "$grn" "$pass" "$off"
[ "$skip" -gt 0 ] && printf ', %s%s skipped%s' "$ylw" "$skip" "$off"
[ "$fail" -gt 0 ] && printf ', %s%s FAILED%s' "$red" "$fail" "$off"
printf '\n\n'

exit $([ "$fail" -eq 0 ] && echo 0 || echo 1)
