#!/usr/bin/env bash
#
# CAP-20. Proves the rubric is data rather than code: the same endpoints,
# with no code change, return one framework's competencies and scale for
# one gig and a different framework's for another.
#
#   cd api && php artisan serve &
#   ./scripts/verify-framework-swap.sh
#
# Tokens come from the file the seeder wrote, or from the environment,
# the same way scripts/smoke.sh finds them:
#
#   TOKENS=~/reflection-diary-tokens.txt ./scripts/verify-framework-swap.sh
#   JANE=... ./scripts/verify-framework-swap.sh
#
# Jane is the only seeded student on both rubrics, which is what makes a
# single token enough to prove the swap.
#
# This script writes nothing. The one POST it makes is expected to be
# refused: `ak_fw_assignments` is unique on gig_id since ADR #35, so the
# database declines a second rubric for a gig rather than storing one.
#
# ---------------------------------------------------------------------
# What this does NOT prove, and why. Read this before quoting the result.
#
# 1. That the axis count is not hardcoded. Both seeded frameworks have
#    exactly six competencies, so no swap between them can ever change
#    the number of axes. CLAUDE.md's rule is "never hardcoded to six axes
#    or a four-point scale"; only the second half is testable here.
#
# 2. That skills valid over part of the scale render correctly. Real SFIA
#    restricts each skill to a subrange, but the seed gives all six all
#    seven levels -- a deliberate placeholder, see the comment above the
#    SFIA levels INSERT in db/01-schema.sql, pending Alumable's mapping.
#    There is currently nothing uneven to cope with.
#
# 3. That the radar could cope if there were. v_framework_scale groups by
#    framework_id and returns one min/max for the whole framework, and
#    the /me/radar contract carries that single pair with no per-axis
#    range. A skill valid 5-7 scored at its floor of 5 would plot at 5/7
#    of the radius and read as mediocre. The stepper is unaffected: it
#    reads levels per competency from /frameworks/{id}.
#
# Those three are findings for the team, not failures of this script.
# ---------------------------------------------------------------------

set -uo pipefail

BASE="${BASE:-http://127.0.0.1:8000/api/v1}"
TOKENS="${TOKENS:-$HOME/reflection-diary-tokens.txt}"

if [ -t 1 ]; then
    dim=$'\033[2m'; red=$'\033[1;31m'; green=$'\033[1;32m'
    yellow=$'\033[1;33m'; blue=$'\033[1;34m'; off=$'\033[0m'
else
    dim=''; red=''; green=''; yellow=''; blue=''; off=''
fi

pass=0; fail=0
say()  { printf '\n%s==>%s %s\n' "$blue" "$off" "$1"; }
die()  { printf '%sError:%s %s\n' "$red" "$off" "$1" >&2; exit 2; }

BODY=''
get() {
    local token="$1" path="$2" tmp
    tmp="$(mktemp)"
    STATUS="$(curl -s -o "$tmp" -w '%{http_code}' \
        -H "Authorization: Bearer $token" -H 'Accept: application/json' \
        "$BASE$path")"
    BODY="$(cat "$tmp")"; rm -f "$tmp"
}

post() {
    local token="$1" path="$2" data="$3" tmp
    tmp="$(mktemp)"
    STATUS="$(curl -s -o "$tmp" -w '%{http_code}' -X POST \
        -H "Authorization: Bearer $token" -H 'Accept: application/json' \
        -H 'Content-Type: application/json' -d "$data" "$BASE$path")"
    BODY="$(cat "$tmp")"; rm -f "$tmp"
}

# Read a value out of the response already in $BODY.
jq_get() { printf '%s' "$BODY" | python3 -c "import json,sys;print(json.load(sys.stdin)$1)" 2>/dev/null; }

check() {
    if [ "$2" = 1 ]; then
        pass=$((pass + 1))
        printf '  %sok%s     %s\n' "$green" "$off" "$1"
    else
        fail=$((fail + 1))
        printf '  %sFAIL%s   %s%s\n' "$red" "$off" "$1" "${3:+  ${dim}got: $3${off}}"
    fi
}

# --------------------------------------------------------------------------
JANE="${JANE:-}"
if [ -z "$JANE" ]; then
    [ -r "$TOKENS" ] || die "No token. Set JANE=..., or point TOKENS at the file the seeder wrote."
    JANE="$(grep 'Jane N' "$TOKENS" | awk '{print $NF}')"
fi
[ -n "$JANE" ] || die "Could not find Jane's token in $TOKENS"

curl -fsS -o /dev/null "$BASE/auth/me" -H "Authorization: Bearer $JANE" 2>/dev/null \
    || die "Nothing is serving on $BASE, or the token is not valid. Start it with ./run api"

# --------------------------------------------------------------------------
say "One student, two gigs, two rubrics"
# --------------------------------------------------------------------------
# Discovered rather than hardcoded: ids differ per database, and a check
# that only works against one machine's uuids is not a check the team has.
get "$JANE" /gigs
LATROBE_GIG="$(printf '%s' "$BODY" | python3 -c 'import json,sys;print(next(g["id"] for g in json.load(sys.stdin) if g["framework"] and g["framework"]["fw_key"]=="latrobe6"))' 2>/dev/null)"
SFIA_GIG="$(printf '%s' "$BODY" | python3 -c 'import json,sys;print(next(g["id"] for g in json.load(sys.stdin) if g["framework"] and g["framework"]["fw_key"]=="sfia9"))' 2>/dev/null)"

check "GET /gigs is 200" "$([ "$STATUS" = 200 ] && echo 1 || echo 0)" "$STATUS"
check "a gig carrying latrobe6" "$([ -n "$LATROBE_GIG" ] && echo 1 || echo 0)"
check "a gig carrying sfia9" "$([ -n "$SFIA_GIG" ] && echo 1 || echo 0)"
[ -n "$LATROBE_GIG" ] && [ -n "$SFIA_GIG" ] || die "Both rubrics must be assigned somewhere. Run php artisan db:seed."

get "$JANE" "/gigs/$LATROBE_GIG"; LA_FW="$(jq_get '["framework"]["id"]')"
get "$JANE" "/gigs/$SFIA_GIG";    SF_FW="$(jq_get '["framework"]["id"]')"
check "the two gigs point at different frameworks" "$([ "$LA_FW" != "$SF_FW" ] && echo 1 || echo 0)"

# --------------------------------------------------------------------------
say "The rubric is data: same endpoint, different competencies and scale"
# --------------------------------------------------------------------------
get "$JANE" "/frameworks/$LA_FW"
LA_CODES="$(printf '%s' "$BODY" | python3 -c 'import json,sys;print(",".join(c["code"] for c in json.load(sys.stdin)["competencies"]))' 2>/dev/null)"
LA_LEVELS="$(printf '%s' "$BODY" | python3 -c 'import json,sys;d=json.load(sys.stdin);print(len(d["competencies"][0]["levels"]))' 2>/dev/null)"

get "$JANE" "/frameworks/$SF_FW"
SF_CODES="$(printf '%s' "$BODY" | python3 -c 'import json,sys;print(",".join(c["code"] for c in json.load(sys.stdin)["competencies"]))' 2>/dev/null)"
SF_LEVELS="$(printf '%s' "$BODY" | python3 -c 'import json,sys;d=json.load(sys.stdin);print(len(d["competencies"][0]["levels"]))' 2>/dev/null)"

check "latrobe6 competencies are its own" "$([ "$LA_CODES" = "contribution,communication,collaboration,agile,continuous,leadership" ] && echo 1 || echo 0)" "$LA_CODES"
check "sfia9 competencies are its own"    "$([ "$SF_CODES" = "PROG,DESN,TEST,DATM,RLMT,METL" ] && echo 1 || echo 0)" "$SF_CODES"
check "latrobe6 has four levels per competency" "$([ "$LA_LEVELS" = 4 ] && echo 1 || echo 0)" "$LA_LEVELS"
check "sfia9 has seven"                          "$([ "$SF_LEVELS" = 7 ] && echo 1 || echo 0)" "$SF_LEVELS"
check "the codes differ entirely"  "$([ "$LA_CODES" != "$SF_CODES" ] && echo 1 || echo 0)"

# --------------------------------------------------------------------------
say "The radar reads its axes and scale from whichever rubric the gig has"
# --------------------------------------------------------------------------
# This is the claim the product rests on. One endpoint, one implementation,
# two shapes of answer, decided entirely by the gig's assignment.
get "$JANE" "/me/radar?gig_id=$LATROBE_GIG"
LA_MIN="$(jq_get '["framework"]["scale_min"]')"; LA_MAX="$(jq_get '["framework"]["scale_max"]')"
LA_AXES="$(printf '%s' "$BODY" | python3 -c 'import json,sys;print(",".join(a["code"] for a in json.load(sys.stdin)["axes"]))' 2>/dev/null)"
LA_N="$(printf '%s' "$BODY" | python3 -c 'import json,sys;print(len(json.load(sys.stdin)["axes"]))' 2>/dev/null)"

get "$JANE" "/me/radar?gig_id=$SFIA_GIG"
SF_MIN="$(jq_get '["framework"]["scale_min"]')"; SF_MAX="$(jq_get '["framework"]["scale_max"]')"
SF_AXES="$(printf '%s' "$BODY" | python3 -c 'import json,sys;print(",".join(a["code"] for a in json.load(sys.stdin)["axes"]))' 2>/dev/null)"
SF_N="$(printf '%s' "$BODY" | python3 -c 'import json,sys;print(len(json.load(sys.stdin)["axes"]))' 2>/dev/null)"

check "latrobe6 radar scale is 1-4"  "$([ "$LA_MIN" = 1 ] && [ "$LA_MAX" = 4 ] && echo 1 || echo 0)" "$LA_MIN-$LA_MAX"
check "sfia9 radar scale is 1-7"     "$([ "$SF_MIN" = 1 ] && [ "$SF_MAX" = 7 ] && echo 1 || echo 0)" "$SF_MIN-$SF_MAX"
check "the scale actually changed with the rubric" "$([ "$LA_MAX" != "$SF_MAX" ] && echo 1 || echo 0)"
check "latrobe6 radar axes are its competencies" "$([ "$LA_AXES" = "contribution,communication,collaboration,agile,continuous,leadership" ] && echo 1 || echo 0)" "$LA_AXES"
check "sfia9 radar axes are its skills"          "$([ "$SF_AXES" = "PROG,DESN,TEST,DATM,RLMT,METL" ] && echo 1 || echo 0)" "$SF_AXES"

# Recorded, not asserted. Both frameworks have six competencies, so this
# is the one thing the swap cannot demonstrate. Stated so a reader does
# not mistake a matching count for a proof.
printf '  %snote%s   both rubrics have %s axes, so this swap cannot show the axis count is data-driven\n' \
    "$yellow" "$off" "$LA_N"
[ "$LA_N" = "$SF_N" ] || check "axis counts differ, which would prove more than expected" 1

# --------------------------------------------------------------------------
say "A gig keeps the rubric it was given"
# --------------------------------------------------------------------------
# The flip side of the swap, and out of scope by ADR #33: the rubric is
# chosen once per gig. Refused by the unique index, so nothing is written.
post "$JANE" /framework-assignments "{\"gig_id\":\"$SFIA_GIG\",\"framework_id\":\"$LA_FW\"}"
CODE="$(jq_get '["error"]["code"]')"
check "a second rubric on a gig is refused" "$([ "$STATUS" = 409 ] || [ "$STATUS" = 403 ] && echo 1 || echo 0)" "$STATUS ${CODE:-}"

# --------------------------------------------------------------------------
printf '\n%s%s passed%s' "$green" "$pass" "$off"
[ "$fail" -gt 0 ] && printf ', %s%s failed%s' "$red" "$fail" "$off"
printf '\n'

if [ "$fail" -eq 0 ]; then
    cat <<NOTE

${dim}Proven: the scale, the competencies, their codes and their level
descriptors all follow the gig's rubric, through one implementation, with
no code change.

Not proven, and not provable against the current seed: that the axis count
is data-driven (both rubrics have six), and that a skill valid over part of
the scale renders correctly (the seed gives every SFIA skill all seven
levels, and the radar contract carries no per-axis range anyway). See the
header of this script.${off}
NOTE
fi

exit $([ "$fail" -eq 0 ] && echo 0 || echo 1)
