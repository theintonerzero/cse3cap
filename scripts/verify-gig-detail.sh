#!/usr/bin/env bash
#
# Proves the gig detail screen's invariants still hold.
#
#   ./run verify-gig                  from the repository root
#   ./scripts/verify-gig-detail.sh    the same thing
#
# web/ has no test runner (CLAUDE.md), so this is where a frontend check
# lives. verify-client.sh covers the API client, verify-app-shell.sh the
# shell and verify-diary-home.sh the diary; this covers the gig detail
# screen, and they do not overlap.
#
# 1. The screen is actually mounted. A screen built but left behind a
#    placeholder is a screen nobody can reach.
# 2. The screen is REACHABLE, and the link out of it goes somewhere real.
#    Nothing in the nav addresses a single gig, so the only way in is a
#    link on the diary home; without one the screen exists and nobody can
#    click to it. And the card's link back must be SCOPED to a parameter
#    the diary home actually reads -- a ?gig_id= nobody parses is a link
#    that silently lands on the unfiltered diary.
# 3. No second API client, and no hand-written response type.
# 4. All four states, including skeletons rather than a spinner.
# 5. The relative wording is REAL. gig-timing.ts is compiled and called
#    with dates chosen here, because every seeded sprint is already past
#    due: "not open yet" and "due in 3 days" cannot be produced by looking
#    at the app, so they are proved here or not at all.
# 6. GET /gigs/{gig_id} really carries what the header renders, and a gig
#    the caller is not on is a 404. Needs a server and a token; skips
#    itself loudly when there is neither.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

BASE="${BASE:-http://127.0.0.1:8000/api/v1}"
TOKENS="${TOKENS:-$HOME/reflection-diary-tokens.txt}"
SCREEN="web/src/screens/GigDetail.tsx"
TIMING="web/src/screens/gig-timing.ts"
SCOPE="web/src/screens/diary-scope.ts"
DIARY="web/src/screens/DiaryHome.tsx"
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

if grep -q '<GigDetail />' "$ROUTES"; then
    ok "routes.tsx renders GigDetail"
else
    bad "routes.tsx renders GigDetail" "gigs/:gig_id still a placeholder?"
fi

if grep -q 'screen="Gig detail" ticket="CAP-8"' "$ROUTES"; then
    bad "the CAP-8 placeholder is gone" "still in $ROUTES"
else
    ok "the CAP-8 placeholder is gone"
fi

# --------------------------------------------------------------------------
say "2. Reachable from the diary, and scoped on the way back"

# The way IN. A screen with no route to it is a screen nobody finds: the
# nav cannot carry one because /gigs/:gig_id needs an id and the nav has
# no single gig to name.
#
# Checked as the about_link specifically, NOT as any link to /gigs/. The
# diary home has carried one since CAP-7, inside NothingWritten, which only
# renders for a student who has written nothing -- so a bare grep for
# '/gigs/' passes while every student with a reflection still has no way
# through. This is the always-visible one.
if grep -q 'styles.about_link' "$DIARY" && grep -q 'to={`/gigs/' "$DIARY"; then
    ok "the diary home links to /gigs/:gig_id" "beside the scope chips"
else
    bad "the diary home links to /gigs/:gig_id" "the screen would be URL-only"
fi

if grep -q '/?gig_id=' "$SCREEN"; then
    ok "the card links to /?gig_id="
else
    bad "the card links to /?gig_id=" "criterion 3 is a SCOPED link"
fi

if grep -q "params.get('gig_id')" "$SCOPE"; then
    ok "the diary home reads gig_id back" "scope round-trips"
else
    bad "the diary home reads gig_id back" "check $SCOPE"
fi

# --------------------------------------------------------------------------
say "3. One API client, no hand-written types"

if grep -qE '\bfetch\(' "$SCREEN" "$TIMING"; then
    bad "no direct fetch" "$(grep -lE '\bfetch\(' "$SCREEN" "$TIMING" | tr '\n' ' ')"
else
    ok "no direct fetch"
fi

if grep -qE '^\s*(export )?interface .*(Response|Payload)\b' "$SCREEN" "$TIMING"; then
    bad "no hand-written response type" "declare it in the contract instead"
else
    ok "no hand-written response type"
fi

if grep -q "from '../api/schema.ts'" "$SCREEN"; then
    ok "payload types come from the generated schema"
else
    bad "payload types come from the generated schema" "check $SCREEN"
fi

# gig-timing.ts is import-free ON PURPOSE: that is what lets section 5
# compile and run it. An import creeping in breaks the check silently.
if grep -qE "^\s*import " "$TIMING"; then
    bad "gig-timing.ts imports nothing" "section 5 compiles it standalone"
else
    ok "gig-timing.ts imports nothing"
fi

# --------------------------------------------------------------------------
say "4. All four states"

states_missing=""
grep -q "status: 'loading'" "$SCREEN" || states_missing="$states_missing loading"
grep -q "status: 'error'" "$SCREEN"   || states_missing="$states_missing error"
grep -q 'styles.empty' "$SCREEN"      || states_missing="$states_missing empty"
grep -q "status: 'loaded'" "$SCREEN"  || states_missing="$states_missing loaded"

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
# The screen's shape is the whole point of the CAP-8 re-shape: the design
# draws My Gig -> Overview as three cards, and a flat list of sections is
# what it looked like when it was built from the ticket's bullets alone.
# Grepped rather than rendered because web/ has no test runner (CLAUDE.md).
say "4a. The frame's three cards"

cards_missing=""
grep -q 'Gig details' "$SCREEN"       || cards_missing="$cards_missing gig-details"
grep -q 'Timeline' "$SCREEN"          || cards_missing="$cards_missing timeline"
grep -q 'Reflection diary' "$SCREEN"  || cards_missing="$cards_missing reflection-diary"

if [ -z "$cards_missing" ]; then
    ok "Gig details, Timeline and Reflection diary" "docs/06_figma_diary_frames.pdf p5"
else
    bad "Gig details, Timeline and Reflection diary" "missing:$cards_missing"
fi

# Each card is a Card with one of CAP-1's accents, which is what makes the
# three read as three. The frame tints them purple, blue and pink.
if [ "$(grep -c '<Card accent=' "$SCREEN")" -ge 3 ]; then
    ok "each card carries an accent"
else
    bad "each card carries an accent" "want 3 accented Cards"
fi

# The SELF / ASSESSOR split is a real table with a real header row: the
# columns carry the meaning, so a div grid would leave a screen reader
# reading two labels with nothing tying them to a sprint.
if grep -q '<th scope="col">Self reflection</th>' "$SCREEN" \
   && grep -q '<th scope="col">Assessor reflection</th>' "$SCREEN" \
   && grep -q '<th scope="row"' "$SCREEN"; then
    ok "the sprint table is a table, with scoped headers"
else
    bad "the sprint table is a table, with scoped headers"
fi

# GET /reflections is what fills those columns, and it is asked for ONLY
# for a student: it returns every student's rows to an assessor, so a
# one-student table built from it for anybody else would be wrong.
if grep -q "api.get('/reflections'" "$SCREEN" \
   && grep -q "my_role !== 'student'" "$SCREEN"; then
    ok "the second call is made, and only for a student"
else
    bad "the second call is made, and only for a student"
fi

# --------------------------------------------------------------------------
say "5. The relative wording, actually executed"

TSC="web/node_modules/.bin/tsc"
OUT="$(mktemp -d)"
trap 'rm -rf "$OUT"' EXIT

if [ ! -x "$TSC" ]; then
    meh "sprint wording" "no web/node_modules; run npm install in web/"
elif ! "$TSC" --ignoreConfig --target es2022 --module esnext \
        --moduleResolution bundler --strict --outDir "$OUT" "$TIMING" >"$OUT/tsc.log" 2>&1; then
    bad "gig-timing.ts compiles standalone" "$(head -1 "$OUT/tsc.log")"
else
    ok "gig-timing.ts compiles standalone"

    # tsc emits gig-timing.JS, and node decides CommonJS or ESM from the
    # nearest package.json. There is none in a mktemp dir, so node 24 gets
    # there by syntax detection and node 20 does not. Say it explicitly
    # rather than depend on which node the reader has.
    printf '{"type":"module"}' > "$OUT/package.json"

    # Every case the acceptance criterion names, plus the boundaries and
    # the timezone trap. "today" is fixed, so this cannot drift.
    cat > "$OUT/check.mjs" <<'JS'
import {
  sprint_timing, days_between, format_short_date, gig_dates,
  sprint_progress, gig_duration_weeks,
} from './gig-timing.js';

const today = new Date(2026, 8, 14);

// One line per row, chosen by state: when it opens, how long is left, or
// which window it was. A past sprint shows its dates and NOT a countdown --
// that is the whole point of the shape, so it is asserted, not assumed.
// Dates are matched loosely because word order follows the reader's locale.
const cases = [
  [{ opens_on: '2026-09-20', due_on: '2026-10-03' }, 'not_open', 'Opens in 6 days'],
  [{ opens_on: '2026-09-15', due_on: '2026-09-28' }, 'not_open', 'Opens tomorrow'],
  [{ opens_on: '2026-09-01', due_on: '2026-09-17' }, 'open',     'Due in 3 days'],
  [{ opens_on: '2026-09-01', due_on: '2026-09-15' }, 'open',     'Due tomorrow'],
  [{ opens_on: '2026-09-01', due_on: '2026-09-14' }, 'open',     'Due today'],
  [{ opens_on: '2026-08-31', due_on: '2026-09-13' }, 'past_due', /31.*13|13.*31/],
  [{ opens_on: '2026-08-03', due_on: '2026-08-16' }, 'past_due', /3.*16|16.*3/],
  [{ opens_on: '2027-06-01', due_on: '2027-06-14' }, 'not_open', /Opens.*1/],
  [{ opens_on: '2026-09-01', due_on: '2027-06-14' }, 'open',     /Due.*14/],
  [{ opens_on: null,         due_on: '2026-09-17' }, 'open',     'Due in 3 days'],
  [{ opens_on: null,         due_on: null         }, 'undated',  'No dates set'],
];

let failed = 0;
for (const [sprint, state, line] of cases) {
  const got = sprint_timing(sprint, today);
  const label = `${sprint.opens_on ?? '-'}..${sprint.due_on ?? '-'}`;
  const line_ok = line instanceof RegExp ? line.test(got.line) : got.line === line;
  if (got.state !== state || !line_ok) {
    console.log(`  MISMATCH ${label}: want ${state}/${line}, got ${got.state}/${got.line}`);
    failed++;
  }
}

// A finished sprint must NOT read as a countdown. This is the change the
// Figma frames prompted, and the thing most likely to get undone by someone
// "restoring" the relative phrase everywhere.
for (const past of [{ opens_on: '2026-08-03', due_on: '2026-08-16' },
                    { opens_on: '2026-08-31', due_on: '2026-09-13' }]) {
  if (/ago|Due in|Due to/.test(sprint_timing(past, today).line)) {
    console.log(`  MISMATCH a finished sprint counts down: ${sprint_timing(past, today).line}`);
    failed++;
  }
}

// The timezone trap, stated twice. days_between must put today at zero,
// and format_short_date must render the 14th as the 14th -- west of
// Greenwich a naively parsed 'YYYY-MM-DD' renders as the 13th, which is
// the bug this module exists to not have. The script runs this file under
// two TZs, so both assertions are made from both sides of UTC.
if (days_between('2026-09-14', today) !== 0) {
  console.log(`  MISMATCH today is not day zero: ${days_between('2026-09-14', today)}`);
  failed++;
}

if (!format_short_date('2026-09-14').includes('14')) {
  console.log(`  MISMATCH the 14th rendered as ${format_short_date('2026-09-14')}`);
  failed++;
}

// Deliberately NOT asserted: the word order. format_short_date passes
// `undefined` as the locale, so the viewer's browser decides between
// "14 Sep" and "Sep 14", exactly as DiaryHome's own date line does.
// Pinning a string here would assert the developer's locale on everyone.

// Every row says something. A blank cell is the one outcome that would
// read as broken rather than as informative.
for (const shape of [{ opens_on: '2026-01-05', due_on: null },
                     { opens_on: null, due_on: '2026-01-18' },
                     { opens_on: null, due_on: null }]) {
  if (!sprint_timing(shape, today).line) {
    console.log(`  MISMATCH empty line for ${JSON.stringify(shape)}`);
    failed++;
  }
}

// The gig's own span travels with the sprints' dates, same trap, same fix.
if (!gig_dates('2026-08-03', '2026-10-26')?.includes('26')) {
  console.log(`  MISMATCH gig span: ${gig_dates('2026-08-03', '2026-10-26')}`);
  failed++;
}

// --------------------------------------------------------------------- //
// The frame's two columns: SELF REFLECTION and ASSESSOR REFLECTION.
//
// These are the design's five sprint states split in two, not a second
// vocabulary (see sprint_progress). Executed rather than grepped for the
// same reason the wording above is: every seeded sprint is past due, so
// the not-open and open rows cannot be produced by looking at the app.
const OPEN = { opens_on: '2026-09-01', due_on: '2026-09-17' };
const PAST = { opens_on: '2026-08-03', due_on: '2026-08-16' };
const FUTURE = { opens_on: '2026-09-20', due_on: '2026-10-03' };

const progress_cases = [
  // a reflection exists -- its status decides, whatever the calendar says
  [OPEN,   'assessed',  'Submitted',   'Scored'],
  [PAST,   'assessed',  'Submitted',   'Scored'],
  [OPEN,   'submitted', 'Submitted',   'Awaiting'],
  [PAST,   'submitted', 'Submitted',   'Awaiting'],
  [OPEN,   'draft',     'In progress', null],
  // A draft behind a past due date is still "In progress" HERE, where the
  // prototype says "Closed, no entry". Nothing in api/app/Services/ reads
  // due_on, so this build lets it still be submitted, and a label claiming
  // otherwise would claim a gate the API does not enforce.
  [PAST,   'draft',     'In progress', null],
  // no row at all -- now it is a question about the calendar
  [FUTURE, null,        null,          null],
  [OPEN,   null,        'In progress', null],
  [PAST,   null,        'No entry',    null],
];

for (const [sprint, status, self_label, assessor_label] of progress_cases) {
  const got = sprint_progress(sprint, status, today);
  if (got.self !== self_label || got.assessor !== assessor_label) {
    console.log(`  MISMATCH progress ${sprint.opens_on}..${sprint.due_on} ${status}: `
      + `want ${self_label}/${assessor_label}, got ${got.self}/${got.assessor}`);
    failed++;
  }
}

// An assessor column never fills in before the student's does: every state
// that says something on the right says "Submitted" on the left. This is
// the invariant the split exists to protect -- a screen free to invent its
// own labels could show a counter-score against a sprint the diary still
// calls a draft.
for (const [sprint, status] of progress_cases) {
  const got = sprint_progress(sprint, status, today);
  if (got.assessor !== null && got.self !== 'Submitted') {
    console.log(`  MISMATCH ${status}: assessor "${got.assessor}" with self "${got.self}"`);
    failed++;
  }
}

// The Timeline card's DURATION cell. The frame prints "13 weeks" against
// 03/08/2026 -> 31/10/2026, so that exact pair is the case to hold.
const duration_cases = [
  ['2026-08-03', '2026-10-31', 13],
  ['2026-08-03', '2026-08-10', 1],
  ['2026-08-03', '2026-08-03', 0],
  ['2026-08-03', null,         null],
  [null,         '2026-10-31', null],
  ['2026-10-31', '2026-08-03', null],   // ends before it starts
];

for (const [starts, ends, weeks] of duration_cases) {
  const got = gig_duration_weeks(starts, ends);
  if (got !== weeks) {
    console.log(`  MISMATCH duration ${starts}..${ends}: want ${weeks}, got ${got}`);
    failed++;
  }
}

process.exit(failed === 0 ? 0 : 1);
JS

    if TZ=Pacific/Auckland node "$OUT/check.mjs" && TZ=America/Los_Angeles node "$OUT/check.mjs"; then
        ok "wording 11, states 9, duration 6, shape 6" "east and west of UTC"
    else
        bad "wording 11, states 9, duration 6, shape 6" "see mismatches above"
    fi
fi

# --------------------------------------------------------------------------
say "6. GET /gigs/{gig_id} carries what the header renders"

TOKEN=""
[ -f "$TOKENS" ] && TOKEN="$(grep -s 'Jane N' "$TOKENS" | awk '{print $NF}')"

if [ -z "$TOKEN" ]; then
    meh "live gig checks" "no token for Jane N in $TOKENS"
elif ! curl -fsS -o /dev/null "$BASE/auth/me" -H "Authorization: Bearer $TOKEN" 2>/dev/null; then
    meh "live gig checks" "nothing answering on $BASE"
else
    GIG="$(curl -fsS "$BASE/gigs" -H "Authorization: Bearer $TOKEN" \
        | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)"

    if [ -z "$GIG" ]; then
        bad "a gig to read" "GET /gigs returned none for Jane"
    else
        BODY="$(curl -fsS "$BASE/gigs/$GIG" -H "Authorization: Bearer $TOKEN")"

        for field in participants sprints framework reflection_summary my_role; do
            if printf '%s' "$BODY" | grep -q "\"$field\""; then
                ok "the payload carries $field"
            else
                bad "the payload carries $field" "the header renders it"
            fi
        done

        if printf '%s' "$BODY" | grep -q '"opens_on"' && printf '%s' "$BODY" | grep -q '"due_on"'; then
            ok "sprints carry opens_on and due_on" "criterion 2"
        else
            bad "sprints carry opens_on and due_on" "criterion 2"
        fi
    fi

    # A gig that is not the caller's is 404, not 403: the two are
    # deliberately indistinguishable. The screen renders it through
    # ErrorNotice's NOT_FOUND branch.
    code="$(curl -s -o /dev/null -w '%{http_code}' \
        "$BASE/gigs/00000000-0000-4000-8000-000000000000" \
        -H "Authorization: Bearer $TOKEN")"
    if [ "$code" = "404" ]; then
        ok "a gig that is not yours 404s" "the screen's not-found state"
    else
        bad "a gig that is not yours 404s" "got $code"
    fi
fi

# --------------------------------------------------------------------------
printf '\n%s%d passed%s, %s%d failed%s, %s%d skipped%s\n' \
    "$grn" "$pass" "$off" "$red" "$fail" "$off" "$ylw" "$skip" "$off"

[ "$fail" -eq 0 ]
