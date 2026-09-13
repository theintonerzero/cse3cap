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
    | grep -v 'web/src/review-queue-dev.tsx' \
    | sort)"

expected='web/src/session/SessionProvider.tsx'

if [ "$callers" = "$expected" ]; then
    ok "only SessionProvider calls setAuthToken"
else
    bad "only SessionProvider calls setAuthToken" "found: ${callers:-nothing}"
fi

# review-queue-dev.tsx is excluded above on purpose: it is CAP-10's
# throwaway dev mount, it predates this shell, and deleting it is CAP-10's
# follow-up rather than CAP-5's business. When that follow-up lands, delete
# the exclusion with the file.

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
    'entries/:entry_id' \
    'reflections/:reflection_id/submitted' \
    'review-queue' \
    'review-queue/entries/:entry_id' \
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

token=''
if [ -f "$TOKENS" ]; then
    token="$(grep -oE '[0-9]+\|[A-Za-z0-9]+' "$TOKENS" | head -1)"
fi

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
