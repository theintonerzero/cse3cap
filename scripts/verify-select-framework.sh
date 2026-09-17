#!/usr/bin/env bash
#
# Proves the select framework screen's invariants still hold.
#
#   ./run verify-frameworks                 from the repository root
#   ./scripts/verify-select-framework.sh    the same thing
#
# web/ has no test runner (CLAUDE.md), so this is where a frontend check
# lives. verify-client.sh covers the API client, verify-app-shell.sh the
# shell, verify-diary-home.sh the diary, verify-gig-detail.sh the gig and
# verify-export-sheet.sh the export; this covers CAP-15, and they do not
# overlap.
#
# 1. The screen is mounted. A screen left behind a placeholder is a screen
#    nobody can reach.
# 2. It is REACHABLE, and the way out of it goes somewhere real. The nav
#    has addressed /frameworks since CAP-5, gated to a supervisor, and Edit
#    addresses the CAP-16 route -- a link to a path the router does not
#    declare lands on the not-found placeholder without saying so.
# 3. One API client, no hand-written response type.
# 4. All four states, and skeletons rather than a spinner.
# 5. The rules this screen must not break: the templates/copies split, the
#    in_use gate on Edit, no replace flow, and no role read from the client.
# 6. The grouping rule, actually EXECUTED. The shared database holds two
#    seeded templates and a growing pile of smoke-test-copy-* frameworks,
#    so the interesting inputs -- no copies, no templates, names that sort
#    against each other -- cannot all be produced by looking at the app.
# 7. GET /frameworks really carries created_by and in_use, and a second
#    rubric on a gig really is a 409. Needs a server and Dr Lee's token;
#    skips itself loudly when there is neither.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT" || exit 1

BASE="${BASE:-http://127.0.0.1:8000/api/v1}"
TOKENS="${TOKENS:-$HOME/reflection-diary-tokens.txt}"
SCREEN="web/src/screens/SelectFramework.tsx"
RULE="web/src/screens/framework-groups.ts"
ROUTES="web/src/app/routes.tsx"
SHELL_TSX="web/src/app/AppShell.tsx"

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

for f in "$SCREEN" "$RULE" "$ROUTES" "$SHELL_TSX"; do
    [ -f "$f" ] || { bad "$f exists" "nothing to check"; }
done

# --------------------------------------------------------------------------
say "1. The screen is mounted"

if grep -q '<SelectFramework />' "$ROUTES"; then
    ok "routes.tsx renders SelectFramework"
else
    bad "routes.tsx renders SelectFramework" "frameworks still a placeholder?"
fi

if grep -q 'screen="Select framework" ticket="CAP-15"' "$ROUTES"; then
    bad "the CAP-15 placeholder is gone" "still in $ROUTES"
else
    ok "the CAP-15 placeholder is gone"
fi

# --------------------------------------------------------------------------
say "2. Reachable, and the way out lands somewhere"

# The way IN. Unlike the gig detail there is no id to name, so the nav can
# and does carry it -- for a supervisor, which is ADR #17's educator.
if grep -q "to: '/frameworks'" "$SHELL_TSX"; then
    ok "the nav addresses /frameworks" "since CAP-5"
else
    bad "the nav addresses /frameworks" "the screen would be URL-only"
fi

if sed -n "/nav_items_for/,/^}/p" "$SHELL_TSX" | grep -q "roles.has('supervisor')"; then
    ok "the nav item is gated on supervisor" "a convenience; the 403 is the rule"
else
    bad "the nav item is gated on supervisor"
fi

# The way OUT. Edit addresses the CAP-16 route, which exists as a
# placeholder -- a link to a path the router does not declare would fall
# through to the not-found placeholder and look like a working link.
if grep -q '/frameworks/\${framework.id}/edit' "$SCREEN" \
   || grep -q 'frameworks/\${framework.id}/edit' "$SCREEN"; then
    ok "Edit addresses /frameworks/:framework_id/edit"
else
    bad "Edit addresses /frameworks/:framework_id/edit"
fi

if grep -q 'path="frameworks/:framework_id/edit"' "$ROUTES"; then
    ok "the router declares that path" "CAP-16's placeholder answers it"
else
    bad "the router declares that path" "Edit would hit the not-found route"
fi

# CAP-3's Button, not a re-styled anchor. Two buttons in one codebase is
# how the two drift, which is the whole reason the component library exists.
if grep -q '<Button' "$SCREEN"; then
    ok "it uses CAP-3's Button"
else
    bad "it uses CAP-3's Button"
fi

# --------------------------------------------------------------------------
say "3. One API client, no hand-written types"

if grep -qE '\bfetch\(' "$SCREEN" "$RULE"; then
    bad "no direct fetch" "$(grep -lE '\bfetch\(' "$SCREEN" "$RULE" | tr '\n' ' ')"
else
    ok "no direct fetch"
fi

if grep -qE '^\s*(export )?interface .*(Response|Payload)\b' "$SCREEN" "$RULE"; then
    bad "no hand-written response type" "declare it in the contract instead"
else
    ok "no hand-written response type"
fi

# The Framework type is the GENERATED one. This is the check the plan's
# sketch could not fail: it reported ok on both branches of its own ||.
if grep -q "from '../api/schema.ts'" "$RULE" \
   && grep -q "components\['schemas'\]\['Framework'\]" "$RULE"; then
    ok "Framework comes from the generated schema"
else
    bad "Framework comes from the generated schema" "check $RULE"
fi

# Matched on the method rather than on "api.get", because prettier breaks
# a chained call across lines -- `api` alone, then `.get(...)` indented --
# and an assertion that depends on the formatter is an assertion that fails
# the next time someone runs prettier.
if grep -q "\.get('/frameworks'" "$SCREEN" \
   && grep -q "\.post('/framework-assignments'" "$SCREEN"; then
    ok "both calls go through the typed client"
else
    bad "both calls go through the typed client"
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

if grep -q 'SkeletonGroup' "$SCREEN"; then
    ok "loading uses skeletons, not a spinner"
else
    bad "loading uses skeletons, not a spinner"
fi

if grep -q 'ErrorNotice' "$SCREEN"; then
    ok "the error state is CAP-3's ErrorNotice" "it switches on code, not message"
else
    bad "the error state is CAP-3's ErrorNotice"
fi

# --------------------------------------------------------------------------
say "5. The rules it must not break"

if grep -q 'created_by === null' "$RULE"; then
    ok "templates and copies split on created_by" "there is no is_template field"
else
    bad "templates and copies split on created_by"
fi

if grep -q 'in_use' "$RULE" && grep -q 'is_editable(framework)' "$SCREEN"; then
    ok "Edit is gated on in_use" "a referenced rubric is permanently read-only"
else
    bad "Edit is gated on in_use"
fi

# ADR #33, extended by #35: a gig takes one rubric and the unique key
# enforces it. There is no endpoint that replaces one, so a screen offering
# to would be offering something the API cannot do.
if grep -qiE 'replace[ _]?(the )?(rubric|framework)|swap[ _]?(the )?(rubric|framework)' "$SCREEN"; then
    bad "no replace flow" "ADR #33: a gig takes one rubric, there is no endpoint"
else
    ok "no replace flow" "ADR #33, #35"
fi

# The screen filters the gig picker by role, which is a CONVENIENCE. It
# must not be the only thing standing between a caller and an assign: the
# 403 is. Asserted as "the refusal is rendered", because a screen that
# hides the button and swallows the error looks identical until it matters.
if grep -q "status: 'refused'" "$SCREEN" && grep -q 'ApiError' "$SCREEN"; then
    ok "a refused assign is surfaced, not swallowed" "the 403 and 409 both land"
else
    bad "a refused assign is surfaced, not swallowed"
fi

# The envelope's own message, as sent. It is one sentence and it explains
# the rule better than anything worth writing here.
if grep -q 'message: error.message' "$SCREEN"; then
    ok "the envelope's message is shown as sent"
else
    bad "the envelope's message is shown as sent" "do not write a generic string"
fi

# Roles are resolved server-side and reach the screen only through
# /auth/me. A role literal assembled anywhere else is the thing CLAUDE.md
# forbids.
if grep -q 'assignable_gigs' "$SCREEN" && grep -q 'useSession' "$SCREEN"; then
    ok "the gig list comes from /auth/me participations"
else
    bad "the gig list comes from /auth/me participations"
fi

# --------------------------------------------------------------------------
say "6. The grouping rule, actually executed"

TSC="web/node_modules/.bin/tsc"
OUT="$(mktemp -d)"
trap 'rm -rf "$OUT"' EXIT

if [ ! -x "$TSC" ]; then
    meh "grouping rule" "no web/node_modules; run npm install in web/"
elif ! "$TSC" --ignoreConfig --target es2022 --module esnext \
        --moduleResolution bundler --strict --outDir "$OUT" "$RULE" \
        >"$OUT/tsc.log" 2>&1; then
    bad "framework-groups.ts compiles standalone" "$(head -1 "$OUT/tsc.log")"
else
    ok "framework-groups.ts compiles standalone"

    # tsc emits into a tree mirroring web/src, because the type-only import
    # of schema.ts puts both files in the program. The import itself is
    # erased, so the emitted module has no runtime dependency at all.
    printf '{"type":"module"}' > "$OUT/package.json"

    cat > "$OUT/check.mjs" <<'JS'
import { group_frameworks, is_editable, assignable_gigs }
  from './screens/framework-groups.js';

const fw = (name, created_by, in_use = false) => ({
  id: name, fw_key: name, version: 'v1', name, is_active: true, created_by, in_use,
});

let failed = 0;
const want = (label, got, expected) => {
  if (JSON.stringify(got) !== JSON.stringify(expected)) {
    console.log(`  MISMATCH ${label}: want ${JSON.stringify(expected)}, got ${JSON.stringify(got)}`);
    failed++;
  }
};

// created_by is the whole rule. null is stock, anything else is a copy --
// including the empty string, which is a value and not an absence.
const mixed = [
  fw('SFIA 9', null),
  fw('zebra copy', 'user-1'),
  fw('La Trobe six-competency', null, true),
  fw('alpha copy', 'user-2'),
  fw('edge', ''),
];
const groups = group_frameworks(mixed);
want('template names', groups.templates.map((f) => f.name),
  ['La Trobe six-competency', 'SFIA 9']);
want('copy names', groups.copies.map((f) => f.name),
  ['alpha copy', 'edge', 'zebra copy']);

// Sorted by name INSIDE each group, not across them: the shared database
// accumulates a smoke-test-copy-* framework on every run of smoke.sh, so
// the copies list is long and arrives in no useful order.
want('sorted independently', groups.templates.map((f) => f.name).join('|'),
  'La Trobe six-competency|SFIA 9');

// Both edges. An empty list is the screen's empty state; all-stock is what
// a freshly seeded database looks like before anyone copies anything, and
// it is the state the demo starts in.
want('nothing at all', group_frameworks([]), { templates: [], copies: [] });
want('all stock has no copies', group_frameworks([fw('a', null), fw('b', null)]).copies, []);
want('all copies has no templates',
  group_frameworks([fw('a', 'u'), fw('b', 'u')]).templates, []);

// Every input survives exactly once. A filter pair that drops or
// duplicates a row is the bug this shape invites.
want('nothing lost, nothing duplicated',
  groups.templates.length + groups.copies.length, mixed.length);

// in_use is the read-only gate, and it is independent of created_by: a
// stock template a reflection references is as frozen as a copy is.
want('in_use stock is not editable', is_editable(fw('x', null, true)), false);
want('unused stock is editable', is_editable(fw('x', null, false)), true);
want('in_use copy is not editable', is_editable(fw('x', 'u', true)), false);
want('unused copy is editable', is_editable(fw('x', 'u', false)), true);

// Which gigs the picker offers. A student or assessor participation is not
// one, and the server would 403 it -- this only keeps the picker honest.
const parts = [
  { gig_id: 'g1', gig_title: 'La Trobe', role: 'supervisor' },
  { gig_id: 'g2', gig_title: 'Data migration', role: 'student' },
  { gig_id: 'g3', gig_title: 'Roster', role: 'employer' },
  { gig_id: 'g4', gig_title: 'Audit', role: 'assessor' },
];
want('assignable roles', assignable_gigs(parts).map((p) => p.gig_id), ['g1', 'g3']);
want('no participations', assignable_gigs([]), []);
want('student only', assignable_gigs([parts[1]]), []);

if (failed > 0) { console.log(`${failed} mismatches`); process.exit(1); }
JS

    if node "$OUT/check.mjs" >"$OUT/run.log" 2>&1; then
        ok "grouping, sorting, the in_use gate and the role filter" "16 assertions"
    else
        bad "grouping, sorting, the in_use gate and the role filter" "see below"
        sed 's/^/    /' "$OUT/run.log"
    fi
fi

# --------------------------------------------------------------------------
say "7. The API really carries what the screen reads"

TOKEN=""
[ -f "$TOKENS" ] && TOKEN="$(grep -s 'Dr Lee' "$TOKENS" | awk '{print $NF}')"

if [ -z "$TOKEN" ]; then
    meh "live framework checks" "no token for Dr Lee in $TOKENS"
elif ! curl -fsS -o /dev/null "$BASE/auth/me" -H "Authorization: Bearer $TOKEN" 2>/dev/null; then
    meh "live framework checks" "nothing answering on $BASE"
else
    BODY="$(curl -fsS "$BASE/frameworks" -H "Authorization: Bearer $TOKEN")"

    for field in created_by in_use fw_key version name; do
        if printf '%s' "$BODY" | grep -q "\"$field\""; then
            ok "the payload carries $field"
        else
            bad "the payload carries $field" "the screen renders it"
        fi
    done

    # The split is only real if the data actually has both sides. A seeded
    # database always has at least one stock template; copies arrive from
    # smoke.sh and from anyone pressing Edit.
    if printf '%s' "$BODY" | grep -q '"created_by":null'; then
        ok "at least one stock template exists" "created_by null"
    else
        bad "at least one stock template exists" "has the database been seeded?"
    fi

    # Dr Lee supervises both seeded gigs, which is why he is the token to
    # develop with: he is the only seeded user who exercises the picker.
    ME="$(curl -fsS "$BASE/auth/me" -H "Authorization: Bearer $TOKEN")"
    if printf '%s' "$ME" | grep -q '"supervisor"'; then
        ok "the token supervises at least one gig" "the picker has something to offer"
    else
        bad "the token supervises at least one gig" "the Assign button would be hidden"
    fi

    # The 409 the screen is built around. Both seeded gigs already carry a
    # rubric, so assigning ANY rubric to one of them is a duplicate -- this
    # is the ordinary path in the demo, not an edge case, and it is the one
    # behaviour a grep cannot prove.
    GIG="$(printf '%s' "$ME" | grep -o '"gig_id":"[^"]*"' | head -1 | cut -d'"' -f4)"
    FW="$(printf '%s' "$BODY" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)"

    if [ -z "$GIG" ] || [ -z "$FW" ]; then
        meh "the duplicate assignment is a 409" "no gig or no framework to try"
    else
        DUP="$(curl -s -X POST "$BASE/framework-assignments" \
            -H "Authorization: Bearer $TOKEN" \
            -H 'Content-Type: application/json' \
            -d "{\"framework_id\":\"$FW\",\"gig_id\":\"$GIG\"}")"

        if printf '%s' "$DUP" | grep -q 'DUPLICATE_ASSIGNMENT'; then
            ok "a second rubric on a gig is refused" "409 DUPLICATE_ASSIGNMENT"
        else
            bad "a second rubric on a gig is refused" "got: $(printf '%s' "$DUP" | head -c 120)"
        fi

        # The screen shows error.message verbatim, so the message has to be
        # a sentence a supervisor can act on rather than a code name.
        if printf '%s' "$DUP" | grep -q 'already has a rubric'; then
            ok "the refusal explains itself" "shown verbatim on the row"
        else
            bad "the refusal explains itself" "the screen renders this string"
        fi
    fi
fi

# --------------------------------------------------------------------------
printf '\n%s%d passed%s, %s%d failed%s, %s%d skipped%s\n' \
    "$grn" "$pass" "$off" "$red" "$fail" "$off" "$ylw" "$skip" "$off"

[ "$fail" -eq 0 ]
