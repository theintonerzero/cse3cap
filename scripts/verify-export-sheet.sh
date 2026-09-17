#!/usr/bin/env bash
#
# Proves the export sheet's invariants still hold.
#
#   ./run verify-export                 from the repository root
#   ./scripts/verify-export-sheet.sh    the same thing
#
# web/ has no test runner (CLAUDE.md), so this is where a frontend check
# lives. verify-diary-home.sh covers the diary the sheet sits on; this
# covers the sheet, and they do not overlap.
#
# 1. The real sheet is mounted where CAP-7 left the disabled one.
# 2. No second API client, no hand-written response type, and the file
#    arrives through api.blob rather than a URL the browser fetches on
#    its own, so the policy runs on every download.
# 3. Five states, by name. The in-progress state is its own block and
#    not the loading skeleton, so Skeleton is not even imported.
# 4. The backoff is REAL. export-poll.ts is compiled and executed with
#    the attempts 1 to 12, because on a sync queue every export is
#    complete before the 202 arrives and no amount of clicking shows a
#    poll, let alone one that gives up.
# 5. Live: request a pdf, poll it, download it as application/pdf. Needs
#    a server and Jane's token; skips itself loudly without them.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

BASE="${BASE:-http://127.0.0.1:8000/api/v1}"
TOKENS="${TOKENS:-$HOME/reflection-diary-tokens.txt}"
SHEET="web/src/screens/ExportSheet.tsx"
POLL="web/src/screens/export-poll.ts"
DIARY="web/src/screens/DiaryHome.tsx"

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
say "1. The sheet is mounted"

if grep -q "from './ExportSheet.tsx'" "$DIARY" && grep -q '<ExportSheet ' "$DIARY"; then
    ok "DiaryHome renders ExportSheet from its own file"
else
    bad "DiaryHome renders ExportSheet from its own file"
fi

if grep -q 'CAP-18 wires this up' "$DIARY"; then
    bad "the CAP-7 stub is gone" "still in $DIARY"
else
    ok "the CAP-7 stub is gone"
fi

if grep -q 'open={export_open}' "$DIARY"; then
    ok "the sheet is told when it closes" "so the poll stops"
else
    bad "the sheet is told when it closes" "a closed sheet would keep polling"
fi

# --------------------------------------------------------------------------
say "2. One API client"

if grep -q 'fetch(' "$SHEET" "$POLL"; then
    bad "no raw fetch" "client.ts is the only caller"
else
    ok "no raw fetch"
fi

if grep -qE '^\s*(export )?interface .*(Response|Payload)\b' "$SHEET"; then
    bad "no hand-written response type" "types come from schema.ts"
else
    ok "no hand-written response type"
fi

if grep -q "from '../api/schema.ts'" "$SHEET"; then
    ok "types come from the generated schema"
else
    bad "types come from the generated schema"
fi

for call in "api.post('/exports'" "api.get('/exports/{export_id}'" "api.blob('/exports/{export_id}/download'"; do
    if grep -qF "$call" "$SHEET"; then
        ok "calls $call"
    else
        bad "calls $call"
    fi
done

if grep -q 'createObjectURL' "$SHEET" && grep -q 'revokeObjectURL' "$SHEET"; then
    ok "the blob becomes a download and the URL is released"
else
    bad "the blob becomes a download and the URL is released"
fi

# --------------------------------------------------------------------------
say "3. Five states, and in-progress is not the skeleton"

states_missing=""
for state in idle building ready failed; do
    grep -q "status: '$state'" "$SHEET" || states_missing="$states_missing $state"
done
grep -q 'styles.empty' "$SHEET" || states_missing="$states_missing empty"

if [ -z "$states_missing" ]; then
    ok "idle, empty, building, ready and failed all present"
else
    bad "idle, empty, building, ready and failed all present" "missing:$states_missing"
fi

if grep -q 'Skeleton' "$SHEET"; then
    bad "in-progress is its own state, not a skeleton" "Skeleton is imported"
else
    ok "in-progress is its own state, not a skeleton"
fi

if grep -q 'role="status"' "$SHEET" && grep -q 'aria-live' "$SHEET"; then
    ok "the building state is a live region"
else
    bad "the building state is a live region"
fi

if grep -q 'GIVE_UP_MESSAGE' "$SHEET"; then
    ok "giving up has words" "criterion 3"
else
    bad "giving up has words" "criterion 3"
fi

# Both selectable formats, and only those. The contract enumerates them, so
# the compiler already refuses a third; this is about the UI offering both.
if grep -q "setFormat('pdf')" "$SHEET" && grep -q "setFormat('json')" "$SHEET"; then
    ok "PDF and JSON are both selectable" "criterion 1"
else
    bad "PDF and JSON are both selectable" "criterion 1"
fi

# --------------------------------------------------------------------------
say "4. The backoff, compiled and run"

if grep -qE "^\s*import " "$POLL"; then
    bad "export-poll.ts imports nothing" "this section compiles it standalone"
else
    ok "export-poll.ts imports nothing"
fi

TSC="web/node_modules/.bin/tsc"
OUT="$(mktemp -d)"
trap 'rm -rf "$OUT"' EXIT

if [ ! -x "$TSC" ]; then
    meh "backoff schedule" "no web/node_modules; run npm install in web/"
elif ! "$TSC" --ignoreConfig --target es2022 --module esnext \
        --moduleResolution bundler --strict --outDir "$OUT" "$POLL" >"$OUT/tsc.log" 2>&1; then
    bad "export-poll.ts compiles standalone" "$(head -1 "$OUT/tsc.log")"
else
    ok "export-poll.ts compiles standalone"
    printf '{"type":"module"}' > "$OUT/package.json"

    cat > "$OUT/check.mjs" <<'JS'
import {
  MAX_POLLS, GIVE_UP_MESSAGE, next_delay_ms, should_give_up, download_name,
} from './export-poll.js';

let failed = 0;
const is = (name, got, want) => {
  const same = JSON.stringify(got) === JSON.stringify(want);
  console.log(`  ${same ? 'ok  ' : 'FAIL'} ${name}${same ? '' : `: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
  if (!same) failed++;
};

// Doubles, then holds. Never below the first delay, never above the cap.
is('delays for attempts 1..6', [1, 2, 3, 4, 5, 6].map(next_delay_ms),
   [1000, 2000, 4000, 8000, 8000, 8000]);
is('attempt 0 is treated as the first', next_delay_ms(0), 1000);

// Gives up after MAX_POLLS, not before and not never.
is('does not give up on the last allowed poll', should_give_up(MAX_POLLS), false);
is('gives up on the poll after it', should_give_up(MAX_POLLS + 1), true);

// The whole schedule fits inside a patience a person actually has.
let total = 0;
for (let a = 1; a <= MAX_POLLS; a++) total += next_delay_ms(a);
is('the schedule gives up within 90 seconds', total <= 90_000, true);
is('...but not in under 30', total >= 30_000, true);

is('giving up says something a person can act on',
   GIVE_UP_MESSAGE.length > 40 && /try again/i.test(GIVE_UP_MESSAGE), true);

is('download name carries the id and the format',
   download_name('abc', 'pdf'), 'reflection-diary-abc.pdf');

process.exit(failed ? 1 : 0);
JS

    if node "$OUT/check.mjs"; then
        ok "the schedule backs off and gives up"
    else
        bad "the schedule backs off and gives up" "see the lines above"
    fi
fi

# --------------------------------------------------------------------------
say "5. Request, poll, download, live"

TOKEN=""
[ -f "$TOKENS" ] && TOKEN="$(grep -s 'Jane N' "$TOKENS" | awk '{print $NF}')"

if [ -z "$TOKEN" ]; then
    meh "live export checks" "no token for Jane N in $TOKENS"
elif ! curl -fsS -o /dev/null "$BASE/auth/me" -H "Authorization: Bearer $TOKEN" 2>/dev/null; then
    meh "live export checks" "nothing answering on $BASE"
else
    for format in pdf json; do
        BODY="$(curl -s -w '\n%{http_code}' "$BASE/exports" \
            -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
            -H 'Accept: application/json' -d "{\"format\":\"$format\"}")"
        code="${BODY##*$'\n'}"
        ID="$(printf '%s' "$BODY" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)"

        if [ "$code" = "202" ] && [ -n "$ID" ]; then
            ok "POST /exports $format is 202 with an id" "criterion 2"
        else
            bad "POST /exports $format is 202 with an id" "got $code"
            continue
        fi

        status="$(curl -fsS "$BASE/exports/$ID" -H "Authorization: Bearer $TOKEN" \
            | grep -o '"status":"[^"]*"' | cut -d'"' -f4)"
        case "$status" in
            complete|pending) ok "GET /exports/{id} polls" "status=$status" ;;
            *) bad "GET /exports/{id} polls" "status=$status" ;;
        esac

        if [ "$status" = "complete" ]; then
            type="$(curl -s -o /dev/null -w '%{content_type}' \
                "$BASE/exports/$ID/download" -H "Authorization: Bearer $TOKEN")"
            case "$format:$type" in
                pdf:application/pdf*|json:application/json*) ok "the $format downloads as $type" ;;
                *) bad "the $format downloads with its own content type" "got $type" ;;
            esac
        else
            meh "the $format download" "still pending on a real queue; the sheet polls"
        fi
    done
fi

# --------------------------------------------------------------------------
printf '\n%s%d passed%s, %s%d failed%s, %s%d skipped%s\n' \
    "$grn" "$pass" "$off" "$red" "$fail" "$off" "$ylw" "$skip" "$off"

[ "$fail" -eq 0 ]
