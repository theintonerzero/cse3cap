#!/usr/bin/env bash
#
# Walks the whole product through the real API, with the three seeded
# tokens, against a server you are already running.
#
#   cd api && php artisan serve &
#   ./scripts/smoke.sh
#
# It writes a reflection as Jane, counter-scores it as Sam, reads the
# analytics, exports the record and downloads it, and checks the refusals
# on the way past. Every line prints the status it got and the status it
# wanted, so a failure tells you which call broke rather than that
# something did.
#
# This is not the test suite. `cd api && php artisan test` proves the rules
# in isolation and runs in seconds; this proves the pieces fit together
# over HTTP, which is the thing tests using Sanctum::actingAs cannot see.
#
# Tokens come from the file the seeder wrote, or from the environment:
#
#   TOKENS=~/reflection-diary-tokens.txt ./scripts/smoke.sh
#   JANE=... SAM=... LEE=... ./scripts/smoke.sh
#
# It creates rows. Point it at your own test database, or accept that the
# shared one gains a reflection each time you run it.

set -uo pipefail

BASE="${BASE:-http://127.0.0.1:8000/api/v1}"
TOKENS="${TOKENS:-$HOME/reflection-diary-tokens.txt}"

bold=$'\033[1m'; dim=$'\033[2m'; red=$'\033[1;31m'; green=$'\033[1;32m'
yellow=$'\033[1;33m'; blue=$'\033[1;34m'; off=$'\033[0m'

pass=0; fail=0
say() { printf '\n%s==>%s %s\n' "$blue" "$off" "$1"; }

# --------------------------------------------------------------------------
# call <name> <expected-status> <token> <method> <path> [json-body]
#
# Leaves the response body in $BODY so the caller can pull ids out of it.
# --------------------------------------------------------------------------
BODY=''
call() {
    local name="$1" want="$2" token="$3" method="$4" path="$5" data="${6:-}"
    local args=(-s -o /tmp/smoke.$$ -w '%{http_code}' -X "$method"
                -H "Authorization: Bearer $token" -H 'Accept: application/json')

    [ -n "$data" ] && args+=(-H 'Content-Type: application/json' -d "$data")

    local got
    got="$(curl "${args[@]}" "$BASE$path")"
    BODY="$(cat /tmp/smoke.$$ 2>/dev/null)"
    rm -f /tmp/smoke.$$

    if [ "$got" = "$want" ]; then
        pass=$((pass + 1))
        printf '  %sok%s   %-3s %-52s %s\n' "$green" "$off" "$got" "$name" "$(summarise)"
    else
        fail=$((fail + 1))
        printf '  %sFAIL%s %-3s %-52s wanted %s\n' "$red" "$off" "$got" "$name" "$want"
        printf '       %s%s%s\n' "$dim" "$(printf '%s' "$BODY" | head -c 300)" "$off"
    fi
}

# One short line of whatever is most interesting in the response.
summarise() {
    printf '%s' "$BODY" | python3 -c '
import json, sys
try:
    d = json.load(sys.stdin)
except Exception:
    sys.exit()
if isinstance(d, dict) and "error" in d:
    print(d["error"]["code"]); sys.exit()
if isinstance(d, list):
    print("%d item%s" % (len(d), "" if len(d) == 1 else "s")); sys.exit()
if isinstance(d, dict):
    for k in ("status", "fw_key", "display_name", "level_value", "title"):
        if k in d:
            print("%s=%s" % (k, d[k])); sys.exit()
' 2>/dev/null
}

jq_get() { printf '%s' "$BODY" | python3 -c "import json,sys;print(json.load(sys.stdin)$1)" 2>/dev/null; }

# --------------------------------------------------------------------------
# Tokens
# --------------------------------------------------------------------------
if [ -z "${JANE:-}" ] || [ -z "${SAM:-}" ] || [ -z "${LEE:-}" ]; then
    if [ ! -r "$TOKENS" ]; then
        printf '%sError:%s no tokens.\n' "$red" "$off" >&2
        printf 'Set JANE, SAM and LEE, or point TOKENS at the file the seeder wrote.\n' >&2
        printf 'Reissue them with: cd api && php artisan db:seed --class=DemoSeeder\n' >&2
        exit 1
    fi
    JANE="$(grep 'Jane N' "$TOKENS" | awk '{print $NF}')"
    SAM="$(grep 'Sam O'  "$TOKENS" | awk '{print $NF}')"
    LEE="$(grep 'Dr Lee' "$TOKENS" | awk '{print $NF}')"
fi

if ! curl -fsS -o /dev/null "${BASE%/api/v1}/up" 2>/dev/null; then
    printf '%sError:%s nothing answering at %s\n' "$red" "$off" "$BASE" >&2
    printf 'Start it with: cd api && php artisan serve\n' >&2
    exit 1
fi

printf '%sReflection Diary smoke test%s  %s%s%s\n' "$bold" "$off" "$dim" "$BASE" "$off"

# --------------------------------------------------------------------------
say "Identity and the refusals"
call "no token is 401"                401 ''      GET /auth/me
call "a bad token is 401"             401 nonsense GET /auth/me
call "an unknown route is 404"        404 "$JANE" GET /nope
call "Jane reads herself"             200 "$JANE" GET /auth/me

say "Gigs are scoped per caller, per gig"
call "Jane sees her gigs"             200 "$JANE" GET /gigs
GIG="$(jq_get '[0]["id"]')"
GIG_FW="$(jq_get '[0]["framework"]["id"]')"
GIG2="$(jq_get '[1]["id"]')"
SPRINT="$(jq_get '[0]["sprints"][0]["id"]')"
call "Sam sees fewer"                 200 "$SAM"  GET /gigs
call "Sam opens the gig he assesses"  200 "$SAM"  GET "/gigs/$GIG"
call "and not the one he does not"    404 "$SAM"  GET "/gigs/$GIG2"

say "Frameworks, and the same endpoint serving two shapes"
call "the rubric list"                200 "$LEE"  GET /frameworks
FW_LATROBE="$(printf '%s' "$BODY" | python3 -c 'import json,sys;print([f["id"] for f in json.load(sys.stdin) if f["fw_key"]=="latrobe6"][0])')"
FW_SFIA="$(printf '%s' "$BODY" | python3 -c 'import json,sys;print([f["id"] for f in json.load(sys.stdin) if f["fw_key"]=="sfia9"][0])')"
call "La Trobe: six axes, 1 to 4"     200 "$LEE"  GET "/frameworks/$FW_LATROBE"
printf '       %sscale %s, %s axes, %s levels on the first%s\n' "$dim" \
    "$(jq_get '["scale"]')" "$(jq_get '["competencies"].__len__()')" \
    "$(jq_get '["competencies"][0]["levels"].__len__()')" "$off"
call "SFIA: six axes, 1 to 7"         200 "$LEE"  GET "/frameworks/$FW_SFIA"
printf '       %sscale %s, %s axes, %s levels on the first%s\n' "$dim" \
    "$(jq_get '["scale"]')" "$(jq_get '["competencies"].__len__()')" \
    "$(jq_get '["competencies"][0]["levels"].__len__()')" "$off"

say "Copy-then-edit"
STAMP="$(date +%s)"
call "Dr Lee copies a base template"  201 "$LEE"  POST /frameworks \
     "{\"based_on_framework_id\":\"$FW_LATROBE\",\"name\":\"Smoke test copy $STAMP\"}"
COPY="$(jq_get '["id"]')"
call "and renames her own copy"       200 "$LEE"  PATCH "/frameworks/$COPY" '{"name":"Renamed by smoke test"}'
call "a student cannot copy"          403 "$JANE" POST /frameworks \
     "{\"based_on_framework_id\":\"$FW_LATROBE\",\"name\":\"Not mine\"}"
call "nobody edits a seeded base"     403 "$LEE"  PATCH "/frameworks/$FW_LATROBE" '{"name":"No"}'

say "A gig is scored against one rubric"
call "the gig already has one"        409 "$LEE"  POST /framework-assignments \
     "{\"gig_id\":\"$GIG\",\"framework_id\":\"$COPY\"}"
call "and the same one again is too"  409 "$LEE"  POST /framework-assignments \
     "{\"gig_id\":\"$GIG\",\"framework_id\":\"$GIG_FW\"}"

say "Jane writes a reflection"

# One reflection per student per sprint is a unique index, so a second run
# would collide on whichever sprint the first one used. Ask which sprints
# she has already written on and take a free one, so the script is worth
# running more than once.
call "her reflections so far"         200 "$JANE" GET "/reflections?gig_id=$GIG"
USED="$BODY"
call "the gig, for its sprints"       200 "$JANE" GET "/gigs/$GIG"
SPRINT="$(printf '%s' "$BODY" | USED="$USED" python3 -c "
import json, sys, os
gig = json.load(sys.stdin)
used = {r.get('sprint_id') for r in json.loads(os.environ['USED'])}
free = [s['id'] for s in gig['sprints'] if s['id'] not in used]
print(free[0] if free else '')
")"

if [ -z "$SPRINT" ]; then
    printf '  %s!!%s  Every sprint on this gig already has a reflection from Jane.\n' "$yellow" "$off"
    printf '      Reseed to run the write path again; the read path below still runs.\n'
    REFLECTION=''
else
    call "create it"                  201 "$JANE" POST /reflections "{\"sprint_id\":\"$SPRINT\"}"
    REFLECTION="$(jq_get '["id"]')"
fi

if [ -n "$REFLECTION" ]; then
    ENTRIES="$(jq_get '["entries"].__len__()')"
    printf '       %s%s entries created eagerly, one per competency%s\n' "$dim" "$ENTRIES" "$off"
    E1="$(jq_get '["entries"][0]["id"]')"

    call "the gate refuses an empty one"  400 "$JANE" POST "/reflections/$REFLECTION/submit"
    call "autosave a narrative"           200 "$JANE" PATCH "/entries/$E1" \
         '{"narrative":"Wrote the importer and paired on the parser."}'
    call "attach a link as evidence"      201 "$JANE" POST "/entries/$E1/evidence" \
         '{"kind":"link","label":"The pull request","uri":"https://example.org/pr/4"}'
    call "Sam cannot write on it"         403 "$SAM"  PATCH "/entries/$E1" '{"narrative":"Not mine"}'

    # Fill everything in, so the gate can pass.
    call "read it back"                   200 "$JANE" GET "/reflections/$REFLECTION"
    printf '%s' "$BODY" | python3 -c '
import json, sys
d = json.load(sys.stdin)
print(json.dumps([{"entry": e["id"], "competency": e["competency_id"]} for e in d["entries"]]))
' > /tmp/smoke-entries.$$
    call "the rubric, for its level ids"  200 "$JANE" GET "/frameworks/$FW_LATROBE"
    printf '%s' "$BODY" > /tmp/smoke-fw.$$

    python3 - /tmp/smoke-entries.$$ /tmp/smoke-fw.$$ > /tmp/smoke-plan.$$ <<'PY'
import json, sys
entries = json.load(open(sys.argv[1]))
fw = json.load(open(sys.argv[2]))
levels = {c["id"]: {l["level_value"]: l["id"] for l in c["levels"]} for c in fw["competencies"]}
for e in entries:
    by_value = levels[e["competency"]]
    print("%s %s %s" % (e["entry"], by_value[3], by_value[2]))
PY

    n=0
    while read -r entry self_level counter_level; do
        n=$((n + 1))
        curl -s -o /dev/null -X PATCH -H "Authorization: Bearer $JANE" \
             -H 'Content-Type: application/json' -H 'Accept: application/json' \
             -d '{"narrative":"What I did, and what I would do differently."}' \
             "$BASE/entries/$entry"
        curl -s -o /dev/null -X PUT -H "Authorization: Bearer $JANE" \
             -H 'Content-Type: application/json' -H 'Accept: application/json' \
             -d "{\"level_id\":\"$self_level\"}" "$BASE/entries/$entry/scores/self"
    done < /tmp/smoke-plan.$$
    printf '       %sfilled and self-scored %s entries%s\n' "$dim" "$n" "$off"

    call "now the gate lets it through"   200 "$JANE" POST "/reflections/$REFLECTION/submit"
    call "submitting twice is a conflict" 409 "$JANE" POST "/reflections/$REFLECTION/submit"
    call "and it can no longer be edited" 409 "$JANE" PATCH "/entries/$E1" '{"narrative":"Second thoughts"}'

    say "Sam counter-scores it"
    call "it is in Sam's review queue"    200 "$SAM"  GET /review-queue
    E_FIRST="$(head -1 /tmp/smoke-plan.$$ | awk '{print $1}')"
    L_LOWER="$(head -1 /tmp/smoke-plan.$$ | awk '{print $3}')"
    call "scoring lower needs a comment"  400 "$SAM"  POST "/entries/$E_FIRST/scores" \
         "{\"level_id\":\"$L_LOWER\"}"
    call "with one, it is accepted"       201 "$SAM"  POST "/entries/$E_FIRST/scores" \
         "{\"level_id\":\"$L_LOWER\",\"comment\":\"Solid work, more to do on testing.\"}"
    call "the same scorer cannot repeat"  409 "$SAM"  POST "/entries/$E_FIRST/scores" \
         "{\"level_id\":\"$L_LOWER\",\"comment\":\"Again\"}"
    call "Jane cannot counter-score"      403 "$JANE" POST "/entries/$E_FIRST/scores" \
         "{\"level_id\":\"$L_LOWER\",\"comment\":\"Mine\"}"

    while read -r entry _ counter_level; do
        [ "$entry" = "$E_FIRST" ] && continue
        curl -s -o /dev/null -X POST -H "Authorization: Bearer $SAM" \
             -H 'Content-Type: application/json' -H 'Accept: application/json' \
             -d "{\"level_id\":\"$counter_level\",\"comment\":\"Noted.\"}" \
             "$BASE/entries/$entry/scores"
    done < /tmp/smoke-plan.$$

    call "the last score flips it"        200 "$JANE" GET "/reflections/$REFLECTION"
    printf '       %sstatus is now %s%s\n' "$dim" "$(jq_get '["status"]')" "$off"
    call "the queue has emptied"          200 "$SAM"  GET /review-queue
    call "and it is closed to Dr Lee too" 409 "$LEE"  POST "/entries/$E_FIRST/scores" \
         "{\"level_id\":\"$L_LOWER\",\"comment\":\"Too late.\"}"
    call "a malformed filter is a 400"    400 "$JANE" GET "/me/progress?gig_id%5B%5D=x"
    call "the history reads back"         200 "$JANE" GET "/reflections/$REFLECTION/events"

    rm -f /tmp/smoke-entries.$$ /tmp/smoke-fw.$$ /tmp/smoke-plan.$$
fi

say "Analytics, straight off the views"
call "the radar"                      200 "$JANE" GET /me/radar
printf '       %s%s%s\n' "$dim" "$(printf '%s' "$BODY" | python3 -c '
import json,sys
d=json.load(sys.stdin)
a=d["axes"][0]
print("%s scale %s-%s | %s: self=%s counter=%s (%s)" % (
    d["framework"]["fw_key"], d["framework"]["scale_min"], d["framework"]["scale_max"],
    a["code"], a["self"], a["counter"], a["counter_role"]))' 2>/dev/null)" "$off"
call "progress needs a gig"           400 "$JANE" GET /me/progress
call "progress along the sprints"     200 "$JANE" GET "/me/progress?gig_id=$GIG"
call "calibration"                    200 "$JANE" GET /me/calibration
call "coverage"                       200 "$JANE" GET "/me/coverage?framework_id=$FW_LATROBE"
call "an assessor has no gaps"        200 "$SAM"  GET "/me/coverage?framework_id=$FW_LATROBE"

say "Export"
call "request the record"             202 "$JANE" POST /exports '{"format":"json"}'
EXPORT="$(jq_get '["id"]')"
call "pdf is refused, not faked"      400 "$JANE" POST /exports '{"format":"pdf"}'
call "poll it"                        200 "$JANE" GET "/exports/$EXPORT"
printf '       %ssummary %s%s\n' "$dim" "$(jq_get '["summary"]')" "$off"
call "download it"                    200 "$JANE" GET "/exports/$EXPORT/download"
call "nobody else can"                404 "$LEE"  GET "/exports/$EXPORT/download"
call "the export history"             200 "$JANE" GET /exports

# --------------------------------------------------------------------------
printf '\n%s%s passed%s' "$green" "$pass" "$off"
[ "$fail" -gt 0 ] && printf ', %s%s failed%s' "$red" "$fail" "$off"
printf '\n'
exit $([ "$fail" -eq 0 ] && echo 0 || echo 1)
