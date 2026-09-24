#!/usr/bin/env bash
#
# Proves the history sheet's invariants still hold.
#
#   ./run verify-history                from the repository root
#   ./scripts/verify-history-sheet.sh   the same thing
#
# web/ has no test runner (CLAUDE.md), so this is where a frontend check
# lives. verify-gig-detail.sh covers the page the sheet opens from; this
# covers the sheet.
#
# 1. The sheet is mounted on the gig page, in a BottomSheet, for a
#    student only.
# 2. One API client, generated types, the events endpoint.
# 3. Four states, by name.
# 4. The rules are REAL. history-log.ts is compiled and executed, because
#    the seed cannot show them: every seeded event on a reflection shares
#    one timestamp, and local time looks like UTC on a machine in UTC.
# 5. Live: the endpoint answers Jane with milestones and Noor's fresh
#    draft with nothing but reflection_created. Needs a server and the
#    seeded tokens; skips itself loudly without them.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

BASE="${BASE:-http://127.0.0.1:8000/api/v1}"
TOKENS="${TOKENS:-$HOME/reflection-diary-tokens.txt}"
SHEET="web/src/screens/HistorySheet.tsx"
LOG="web/src/screens/history-log.ts"
GIG="web/src/screens/GigDetail.tsx"

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

if grep -q "from './HistorySheet.tsx'" "$GIG" && grep -q '<HistorySheet ' "$GIG"; then
    ok "GigDetail renders HistorySheet from its own file"
else
    bad "GigDetail renders HistorySheet from its own file"
fi

if sed -n '/<BottomSheet/,/<\/BottomSheet>/p' "$GIG" | grep -q '<HistorySheet '; then
    ok "inside a BottomSheet" "criterion 1"
else
    bad "inside a BottomSheet" "criterion 1"
fi

if grep -q "on_history={gig.my_role === 'student'" "$GIG"; then
    ok "the History button is offered to a student only"
else
    bad "the History button is offered to a student only"
fi

# --------------------------------------------------------------------------
say "2. One API client"

if grep -qE '\bfetch\(' "$SHEET" "$LOG"; then
    bad "no raw fetch" "client.ts is the only caller"
else
    ok "no raw fetch"
fi

if grep -qE '^\s*(export )?interface .*(Response|Payload)\b' "$SHEET" "$LOG"; then
    bad "no hand-written response type" "types come from schema.ts"
else
    ok "no hand-written response type"
fi

if grep -q "from '../api/schema.ts'" "$SHEET"; then
    ok "types come from the generated schema"
else
    bad "types come from the generated schema"
fi

# Prettier breaks the chain after `api`, so the path is matched on its own
# line with the .get in front of it.
if grep -qF ".get('/reflections/{reflection_id}/events'" "$SHEET"; then
    ok "calls GET /reflections/{reflection_id}/events"
else
    bad "calls GET /reflections/{reflection_id}/events"
fi

if grep -q 'controller.abort()' "$SHEET"; then
    ok "closing the sheet aborts the calls"
else
    bad "closing the sheet aborts the calls"
fi

# --------------------------------------------------------------------------
say "3. Four states"

states_missing=""
grep -q "status: 'loading'" "$SHEET" || states_missing="$states_missing loading"
grep -q "status: 'error'" "$SHEET"   || states_missing="$states_missing error"
grep -q 'styles.empty' "$SHEET"      || states_missing="$states_missing empty"
grep -q "status: 'loaded'" "$SHEET"  || states_missing="$states_missing loaded"

if [ -z "$states_missing" ]; then
    ok "loading, empty, error and loaded all present" "criterion 3"
else
    bad "loading, empty, error and loaded all present" "missing:$states_missing"
fi

if grep -q '<Skeleton' "$SHEET"; then
    ok "loading is a skeleton, not a spinner"
else
    bad "loading is a skeleton, not a spinner"
fi

if grep -q 'on_retry={retry}' "$SHEET"; then
    ok "the error state can be retried"
else
    bad "the error state can be retried"
fi

# --------------------------------------------------------------------------
say "4. The rules, compiled and run"

if grep -qE "^\s*import " "$LOG"; then
    bad "history-log.ts imports nothing" "this section compiles it standalone"
else
    ok "history-log.ts imports nothing"
fi

TSC="web/node_modules/.bin/tsc"
OUT="$(mktemp -d)"
trap 'rm -rf "$OUT"' EXIT

if [ ! -x "$TSC" ]; then
    meh "history rules" "no web/node_modules; run npm install in web/"
elif ! "$TSC" --ignoreConfig --target es2022 --module esnext \
        --moduleResolution bundler --strict --outDir "$OUT" "$LOG" >"$OUT/tsc.log" 2>&1; then
    bad "history-log.ts compiles standalone" "$(head -1 "$OUT/tsc.log")"
else
    ok "history-log.ts compiles standalone"
    printf '{"type":"module"}' > "$OUT/package.json"

    cat > "$OUT/check.mjs" <<'JS'
import { history_rows, humanise, label_for, format_local } from './history-log.js';

let failed = 0;
const is = (name, got, want) => {
  const same = JSON.stringify(got) === JSON.stringify(want);
  console.log(`  ${same ? 'ok  ' : 'FAIL'} ${name}${same ? '' : `: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
  if (!same) failed++;
};

const ev = (id, event_type, occurred_at, sprint_ordinal, actor = 'Jane N') =>
  ({ id, event_type, occurred_at, sprint_ordinal, actor_display_name: actor });

// The seed's shape: one instant for the whole lifecycle, served newest first.
const T1 = '2026-08-14T08:40:21.000Z';
const T2 = '2026-08-23T14:42:43.000Z';
const seeded = [
  ev('s2-assessed', 'reflection_assessed', T2, 2, 'Sam O'),
  ev('s2-scored', 'entry_counter_scored', T2, 2, 'Sam O'),
  ev('s2-submitted', 'reflection_submitted', T2, 2),
  ev('s2-created', 'reflection_created', T2, 2),
  ev('s1-assessed', 'reflection_assessed', T1, 1, 'Sam O'),
  ev('s1-submitted', 'reflection_submitted', T1, 1),
  ev('s1-created', 'reflection_created', T1, 1),
];

is('oldest first, submitted before assessed on a shared timestamp',
   history_rows(seeded).map((r) => r.id),
   ['s1-submitted', 's1-assessed', 's2-submitted', 's2-assessed']);

is('the order does not depend on the order served',
   history_rows([...seeded].reverse()).map((r) => r.id),
   history_rows(seeded).map((r) => r.id));

is('a fresh draft has no history', history_rows([ev('d', 'reflection_created', T1, 1)]), []);
is('nothing at all has no history', history_rows([]), []);

is('each counter-score is not its own row',
   history_rows(seeded).some((r) => r.id.endsWith('-scored')), false);

is('the frame’s wording, with the sprint',
   history_rows(seeded).slice(0, 2).map((r) => r.label),
   ['Reflection submitted (Sprint 1)', 'Assessor reflection submitted (Sprint 1)']);

is('the actor rides along', history_rows(seeded)[1].actor, 'Sam O');

// A later instant wins over lifecycle order: time first, rank only on a tie.
is('time beats lifecycle rank',
   history_rows([
     ev('late-submit', 'reflection_submitted', '2026-09-02T00:00:00Z', 2),
     ev('early-assess', 'reflection_assessed', '2026-09-01T00:00:00Z', 1),
   ]).map((r) => r.id),
   ['early-assess', 'late-submit']);

// A type nobody taught this file about is shown, not dropped.
is('an unknown type is kept', history_rows([ev('x', 'portfolio_linked', T1, 1)]).length, 1);
is('...with a readable label', label_for('portfolio_linked', 1), 'Portfolio linked (Sprint 1)');
is('humanise copes with nothing', humanise(''), 'Something happened');
is('no sprint, no suffix', label_for('reflection_submitted', null), 'Reflection submitted');

// Stored UTC, shown local. 22:30 UTC on the 14th is the 15th in Melbourne.
is('UTC is converted to the reader’s zone',
   format_local('2026-08-14T22:30:00Z', 'en-AU', 'Australia/Melbourne'), '15/08/2026, 8:30 am');
is('...and not merely reprinted',
   format_local('2026-08-14T22:30:00Z', 'en-AU', 'UTC'), '14/08/2026, 10:30 pm');

process.exit(failed ? 1 : 0);
JS

    if node "$OUT/check.mjs"; then
        ok "milestones, order, wording and local time"
    else
        bad "milestones, order, wording and local time" "see the lines above"
    fi
fi

# --------------------------------------------------------------------------
say "5. The endpoint, live"

token_for() { [ -f "$TOKENS" ] && grep -s "$1" "$TOKENS" | awk '{print $NF}'; }
JANE="$(token_for 'Jane N')"
NOOR="$(token_for 'Noor A')"

events_for() {
    # $1 token. Prints the event types of the token holder's first
    # reflection with the given status ($2), one per line.
    local id
    id="$(curl -fsS "$BASE/reflections?status=$2" -H "Authorization: Bearer $1" \
        | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)"
    [ -n "$id" ] || return 1
    curl -fsS "$BASE/reflections/$id/events" -H "Authorization: Bearer $1" \
        | grep -o '"event_type":"[^"]*"' | cut -d'"' -f4
}

if [ -z "$JANE" ]; then
    meh "live history checks" "no token for Jane N in $TOKENS"
elif ! curl -fsS -o /dev/null "$BASE/auth/me" -H "Authorization: Bearer $JANE" 2>/dev/null; then
    meh "live history checks" "nothing answering on $BASE"
else
    types="$(events_for "$JANE" assessed)"
    if grep -qx reflection_submitted <<<"$types" && grep -qx reflection_assessed <<<"$types"; then
        ok "an assessed reflection has both milestones" "Jane"
    else
        bad "an assessed reflection has both milestones" "got: $(tr '\n' ' ' <<<"$types")"
    fi

    if [ -z "$NOOR" ]; then
        meh "a fresh draft is empty" "no token for Noor A in $TOKENS"
    else
        types="$(events_for "$NOOR" draft)"
        if [ "$types" = "reflection_created" ]; then
            ok "a fresh draft has only reflection_created" "so the sheet is empty"
        else
            bad "a fresh draft has only reflection_created" "got: $(tr '\n' ' ' <<<"$types")"
        fi
    fi
fi

# --------------------------------------------------------------------------
printf '\n%s%d passed%s, %s%d failed%s, %s%d skipped%s\n' \
    "$grn" "$pass" "$off" "$red" "$fail" "$off" "$ylw" "$skip" "$off"

[ "$fail" -eq 0 ]
