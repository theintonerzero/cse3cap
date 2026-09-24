#!/usr/bin/env bash
#
# Proves the edit framework screen's invariants still hold.
#
#   ./run verify-framework-edit             from the repository root
#   ./scripts/verify-edit-framework.sh      the same thing
#
# web/ has no test runner (CLAUDE.md), so this is where a frontend check
# lives. verify-select-framework.sh covers the rubric list (CAP-15); this
# covers the editor it links to (CAP-16), and they do not overlap.
#
# 1. The screen is mounted, in place of CAP-16's placeholder.
# 2. It is REACHABLE. Both seeded templates are in use, so an entry point
#    gated on in_use leaves a freshly seeded database with no way in at all.
# 3. One API client, generated types, and the four calls the ticket names.
# 4. All four states, skeletons rather than a spinner.
# 5. Scope, ADR #16: renaming and rewording only. No add, no remove, no
#    framework from nothing, and no UI for any of them -- not even disabled.
#    FRAMEWORK_IN_USE is handled by code, not by message.
# 6. The save logic, actually EXECUTED: which PATCHes a save still owes,
#    matched by code and level value, and what a retry resends.
# 7. The API really carries what the editor renders, and really refuses a
#    write to a seeded template. Read-only; needs a server and Dr Lee's
#    token and skips itself loudly when there is neither.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT" || exit 1

BASE="${BASE:-http://127.0.0.1:8000/api/v1}"
TOKENS="${TOKENS:-$HOME/reflection-diary-tokens.txt}"
SCREEN="web/src/screens/EditFramework.tsx"
RULE="web/src/screens/framework-edit.ts"
ROUTES="web/src/app/routes.tsx"
SELECT="web/src/screens/SelectFramework.tsx"

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

for f in "$SCREEN" "$RULE" "$ROUTES" "$SELECT"; do
    [ -f "$f" ] || bad "$f exists" "nothing to check"
done

# --------------------------------------------------------------------------
say "1. The screen is mounted"

if grep -q 'path="frameworks/:framework_id/edit" element={<EditFramework />}' "$ROUTES"; then
    ok "routes.tsx renders EditFramework"
else
    bad "routes.tsx renders EditFramework" "still a placeholder?"
fi

if grep -q 'screen="Edit framework" ticket="CAP-16"' "$ROUTES"; then
    bad "the CAP-16 placeholder is gone" "still in $ROUTES"
else
    ok "the CAP-16 placeholder is gone"
fi

# --------------------------------------------------------------------------
say "2. Reachable from every rubric"

if grep -q 'frameworks/\${framework.id}/edit' "$SELECT" && grep -q 'Copy and edit' "$SELECT"; then
    ok "Select framework links Copy and edit to the route"
else
    bad "Select framework links Copy and edit to the route"
fi

# The editor always copies, so whether a reflection references the base has
# no bearing on getting there. Gate the link on in_use and both seeded
# templates -- La Trobe and SFIA 9, both scored against -- lose it.
if grep -q 'is_editable' "$SELECT"; then
    bad "the link is not gated on in_use" "both seeded templates are in use"
else
    ok "the link is not gated on in_use" "both seeded templates are in use"
fi

# --------------------------------------------------------------------------
say "3. One API client, generated types"

if grep -qE '\bfetch\(' "$SCREEN" "$RULE"; then
    bad "no direct fetch"
else
    ok "no direct fetch"
fi

if grep -qE '^\s*(export )?interface .*(Response|Payload)\b' "$SCREEN" "$RULE"; then
    bad "no hand-written response type" "declare it in the contract instead"
else
    ok "no hand-written response type"
fi

if grep -q "components\['schemas'\]\['FrameworkDetail'\]" "$RULE"; then
    ok "FrameworkDetail comes from the generated schema"
else
    bad "FrameworkDetail comes from the generated schema"
fi

# Matched on the method, not on "api.post": prettier breaks a chained call
# across lines, and an assertion that depends on the formatter fails the
# next time somebody formats.
for call in ".get('/frameworks'" ".get('/frameworks/{framework_id}'" \
            ".post('/frameworks'" ".patch('/frameworks/{framework_id}'" \
            ".patch('/competencies/{competency_id}'" ".patch('/levels/{level_id}'"; do
    if grep -qF "$call" "$SCREEN"; then
        ok "calls $call)"
    else
        bad "calls $call)"
    fi
done

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

grep -q 'SkeletonGroup' "$SCREEN" \
    && ok "loading uses skeletons, not a spinner" \
    || bad "loading uses skeletons, not a spinner"

grep -q 'ErrorNotice' "$SCREEN" \
    && ok "errors render through CAP-3's ErrorNotice" \
    || bad "errors render through CAP-3's ErrorNotice"

# --------------------------------------------------------------------------
say "5. Scope, ADR #16"

# The only write that creates anything is the copy. A POST or DELETE on a
# competency or level would be adding or removing one, which is a rubric of
# a different shape and so a different rubric.
if grep -qE "\.(post|put|delete)\('/(competencies|levels)" "$SCREEN" "$RULE"; then
    bad "no competency or level is created or deleted"
else
    ok "no competency or level is created or deleted"
fi

if grep -qE "\.delete\(" "$SCREEN"; then
    bad "nothing is deleted from this screen"
else
    ok "nothing is deleted from this screen"
fi

# "Do not add UI for any of them, not even disabled." The words a control
# for it would carry.
if grep -qiE "(add|remove|delete|new) (a )?(competenc|level)|from scratch|blank (framework|rubric)" "$SCREEN"; then
    bad "no add/remove/from-scratch controls" "$(grep -niE '(add|remove|delete|new) (a )?(competenc|level)|from scratch|blank (framework|rubric)' "$SCREEN" | head -1)"
else
    ok "no add/remove/from-scratch controls"
fi

# The base is sent as based_on_framework_id: a copy, never a framework
# conjured from a name alone.
grep -q 'based_on_framework_id' "$SCREEN" \
    && ok "saving copies a base" "POST /frameworks carries based_on_framework_id" \
    || bad "saving copies a base"

grep -q "'FRAMEWORK_IN_USE'" "$SCREEN" \
    && ok "FRAMEWORK_IN_USE is handled by code" "surfaced plainly, not as a generic failure" \
    || bad "FRAMEWORK_IN_USE is handled by code"

# --------------------------------------------------------------------------
say "6. The save logic, actually executed"

TSC="web/node_modules/.bin/tsc"
OUT="$(mktemp -d)"
trap 'rm -rf "$OUT"' EXIT

if [ ! -x "$TSC" ]; then
    meh "save logic" "no web/node_modules; run npm install in web/"
elif [ ! -f "$RULE" ]; then
    bad "framework-edit.ts compiles standalone" "it does not exist"
elif ! "$TSC" --ignoreConfig --target es2022 --module esnext \
        --moduleResolution bundler --strict --outDir "$OUT" "$RULE" \
        >"$OUT/tsc.log" 2>&1; then
    bad "framework-edit.ts compiles standalone" "$(head -1 "$OUT/tsc.log")"
else
    ok "framework-edit.ts compiles standalone"

    printf '{"type":"module"}' > "$OUT/package.json"

    cat > "$OUT/check.mjs" <<'JS'
import {
  draft_from, set_competency, set_level, missing_text,
  pending_edits, apply_edit, is_dirty,
} from './screens/framework-edit.js';

let failed = 0;
let count = 0;
const want = (label, got, expected) => {
  count++;
  if (JSON.stringify(got) !== JSON.stringify(expected)) {
    console.log(`  MISMATCH ${label}: want ${JSON.stringify(expected)}, got ${JSON.stringify(got)}`);
    failed++;
  }
};
const throws = (label, fn) => {
  count++;
  try { fn(); console.log(`  MISMATCH ${label}: did not throw`); failed++; } catch { /* wanted */ }
};

// A base shaped like the seeded ones, deliberately out of order: the API
// sorts, but the draft must not depend on it.
const base = {
  id: 'base', fw_key: 'latrobe6', version: 'v1', name: 'La Trobe',
  created_by: null, in_use: true, comment_required: true, evidence_required: false,
  accepted_file_types: null, max_file_bytes: 1, scale: { min: 1, max: 2 },
  competencies: [
    { id: 'b-comm', code: 'communication', name: 'Communication', short_label: 'Comms',
      category: null, position: 2,
      levels: [{ id: 'b-comm-2', level_value: 2, descriptor: 'Clear.' },
               { id: 'b-comm-1', level_value: 1, descriptor: 'Unclear.' }] },
    { id: 'b-coll', code: 'collaboration', name: 'Collaboration', short_label: null,
      category: null, position: 1,
      levels: [{ id: 'b-coll-1', level_value: 1, descriptor: 'Alone.' },
               { id: 'b-coll-2', level_value: 2, descriptor: 'Together.' }] },
  ],
};

// What POST /frameworks returns: the same shape, fresh ids, the new name.
// Its competencies and levels are in the OPPOSITE order to the draft's
// (which sorts by position and value), so matching by array index pairs
// the wrong rows and fails here. Proven by mutation when this was written.
const copy_of = (name) => ({
  ...base, id: 'copy', fw_key: 'mine', created_by: 'me', in_use: false, name,
  competencies: [
    { ...base.competencies[0], id: 'c-comm',
      levels: [{ id: 'c-comm-2', level_value: 2, descriptor: 'Clear.' },
               { id: 'c-comm-1', level_value: 1, descriptor: 'Unclear.' }] },
    { ...base.competencies[1], id: 'c-coll',
      levels: [{ id: 'c-coll-2', level_value: 2, descriptor: 'Together.' },
               { id: 'c-coll-1', level_value: 1, descriptor: 'Alone.' }] },
  ],
});

// --- draft_from
const fresh = draft_from(base);
want('default name says it is a copy', fresh.name, 'Copy of La Trobe');
want('competencies by position', fresh.competencies.map((c) => c.code),
  ['collaboration', 'communication']);
want('levels by value', fresh.competencies[1].levels.map((l) => l.level_value), [1, 2]);
want('a null radar label is an empty field', fresh.competencies[0].short_label, '');
want('the base is not mutated', base.competencies[0].code, 'communication');

// --- pending_edits, against a copy that already carries the draft's name
const copy = copy_of('Copy of La Trobe');
want('an untouched draft owes nothing', pending_edits(copy, fresh), []);

// The POST set the name, so a first save needs no framework PATCH -- but a
// name changed after the copy exists does.
want('a changed name is one framework edit',
  pending_edits(copy, { ...fresh, name: 'Our rubric' }),
  [{ kind: 'framework', id: 'copy', body: { name: 'Our rubric' } }]);

const renamed = set_competency(fresh, 'communication', { name: 'Speaking up', short_label: 'Speak' });
want('a rename is one competency edit, matched by code', pending_edits(copy, renamed),
  [{ kind: 'competency', id: 'c-comm', body: { name: 'Speaking up', short_label: 'Speak' } }]);

const unlabelled = set_competency(fresh, 'communication', { short_label: '   ' });
want('a blank radar label goes out as null', pending_edits(copy, unlabelled),
  [{ kind: 'competency', id: 'c-comm', body: { name: 'Communication', short_label: null } }]);

const reworded = set_level(fresh, 'collaboration', 2, 'Lifts others.');
want('a reword is one level edit, matched by value', pending_edits(copy, reworded),
  [{ kind: 'level', id: 'c-coll-2', body: { descriptor: 'Lifts others.' } }]);

// Laravel trims input, so padding is not a change and must not cost a PATCH.
const padded = set_level(set_competency(fresh, 'collaboration', { name: ' Collaboration ' }),
  'communication', 1, 'Unclear.  ');
want('whitespace alone owes nothing', pending_edits(copy, padded), []);
want('what is sent is trimmed',
  pending_edits(copy, set_level(fresh, 'collaboration', 1, '  Solo.  '))[0].body,
  { descriptor: 'Solo.' });

// --- apply_edit: the retry after a partial failure resends only what is left
const several = set_level(renamed, 'collaboration', 2, 'Lifts others.');
const owed = pending_edits(copy, several);
want('two edits owed', owed.length, 2);
const after_first = apply_edit(copy, owed[0]);
want('after one lands, one is left', pending_edits(after_first, several), [owed[1]]);
want('after both land, nothing is left',
  pending_edits(apply_edit(after_first, owed[1]), several), []);
want('apply_edit does not mutate', copy.competencies[0].name, 'Communication');
want('a framework edit renames the copy',
  apply_edit(copy, { kind: 'framework', id: 'copy', body: { name: 'X' } }).name, 'X');

// A copy that lacks a row the draft has is not a copy of this base. Better
// loud than an edit silently dropped.
throws('a copy missing a competency throws', () =>
  pending_edits({ ...copy, competencies: copy.competencies.slice(0, 1) }, fresh));
throws('a copy missing a level throws', () =>
  pending_edits({ ...copy, competencies: copy.competencies.map((c) => ({ ...c, levels: c.levels.slice(0, 1) })) }, fresh));

// --- missing_text
want('a complete draft is missing nothing', missing_text(fresh), []);
want('blank fields are named',
  missing_text(set_level(set_competency({ ...fresh, name: ' ' }, 'collaboration', { name: '' }),
    'communication', 2, '')),
  ['Name of your copy', 'collaboration: name', 'communication: level 2']);
want('a blank radar label is allowed', missing_text(unlabelled), []);

// --- is_dirty
want('a fresh draft is not dirty', is_dirty(base, fresh), false);
want('a reworded draft is dirty', is_dirty(base, reworded), true);
want('a renamed copy is dirty', is_dirty(base, { ...fresh, name: 'Other' }), true);

if (failed > 0) { console.log(`${failed} of ${count} mismatched`); process.exit(1); }
console.log(count);
JS

    if node "$OUT/check.mjs" >"$OUT/run.log" 2>&1; then
        ok "draft, outstanding edits, retry, blanks" "$(tail -1 "$OUT/run.log") assertions"
    else
        bad "draft, outstanding edits, retry, blanks" "see below"
        sed 's/^/    /' "$OUT/run.log"
    fi
fi

# --------------------------------------------------------------------------
say "7. The API really carries what the editor renders"

TOKEN=""
[ -f "$TOKENS" ] && TOKEN="$(grep -s 'Dr Lee' "$TOKENS" | awk '{print $NF}')"

if [ -z "$TOKEN" ]; then
    meh "live framework checks" "no token for Dr Lee in $TOKENS"
elif ! curl -fsS -o /dev/null "$BASE/auth/me" -H "Authorization: Bearer $TOKEN" 2>/dev/null; then
    meh "live framework checks" "nothing answering on $BASE"
else
    LIST="$(curl -fsS "$BASE/frameworks" -H "Authorization: Bearer $TOKEN")"
    # A seeded template: created_by null. Its id is the one before it.
    TEMPLATE="$(printf '%s' "$LIST" | grep -o '"id":"[^"]*","fw_key":"[^"]*","version":"[^"]*","name":"[^"]*","is_active":[a-z]*,"created_by":null' \
        | head -1 | cut -d'"' -f4)"

    if [ -z "$TEMPLATE" ]; then
        meh "live framework checks" "no seeded template in GET /frameworks"
    else
        DETAIL="$(curl -fsS "$BASE/frameworks/$TEMPLATE" -H "Authorization: Bearer $TOKEN")"
        for field in competencies levels descriptor short_label code level_value scale; do
            if printf '%s' "$DETAIL" | grep -q "\"$field\""; then
                ok "GET /frameworks/{id} carries $field"
            else
                bad "GET /frameworks/{id} carries $field" "the editor renders it"
            fi
        done

        # A write to a template must be refused before it reaches the row:
        # a seeded template belongs to nobody. The body is the template's
        # own name, so even a regression that let it through changes nothing.
        NAME="$(printf '%s' "$DETAIL" | grep -o '"name":"[^"]*"' | head -1 | cut -d'"' -f4)"
        CODE="$(curl -s -o /dev/null -w '%{http_code}' -X PATCH "$BASE/frameworks/$TEMPLATE" \
            -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
            -d "{\"name\":\"$NAME\"}")"
        if [ "$CODE" = "403" ]; then
            ok "a PATCH on a seeded template is refused" "403, so the editor must copy"
        else
            bad "a PATCH on a seeded template is refused" "got $CODE"
        fi
    fi
fi

# --------------------------------------------------------------------------
printf '\n%s%d passed%s, %s%d failed%s, %s%d skipped%s\n' \
    "$grn" "$pass" "$off" "$red" "$fail" "$off" "$ylw" "$skip" "$off"

[ "$fail" -eq 0 ]
