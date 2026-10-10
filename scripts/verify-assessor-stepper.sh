#!/usr/bin/env bash
#
# Proves the assessor stepper's invariants still hold.
#
#   ./run verify-assessor-stepper           from the repository root
#   ./scripts/verify-assessor-stepper.sh    the same thing
#
# web/ has no test runner (CLAUDE.md), so this is where a frontend check
# lives, next to verify-entry-stepper.sh, which covers the student mode of
# the same component.
#
# 1. One component: assessor mode is a prop on EntryStepper, not a second
#    screen, and the queue links to it.
# 2. POST, never PUT: there is no re-scoring (ADR #34).
# 3. The errors are handled by code, including COMMENT_REQUIRED arriving
#    despite the disabled button (CAP-13 criteria 3 and 4).
# 4. The client reflects the flip to assessed and never makes it.
# 5. The comment hint names the rule it mirrors, so nobody mistakes it for
#    the rule.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

SCREEN="web/src/screens/EntryStepper.tsx"
LOGIC="web/src/screens/entry-stepper-logic.ts"
ROUTES="web/src/app/routes.tsx"
QUEUE="web/src/screens/ReviewQueue.tsx"

if [ -t 1 ]; then
    blu=$'\033[1;34m'; grn=$'\033[1;32m'; red=$'\033[1;31m'; off=$'\033[0m'
else
    blu=''; grn=''; red=''; off=''
fi

pass=0; fail=0
say() { printf '\n%s==>%s %s\n' "$blu" "$off" "$1"; }
ok()  { pass=$((pass+1)); printf '  %sok%s   %-54s %s\n' "$grn" "$off" "$1" "${2:-}"; }
bad() { fail=$((fail+1)); printf '  %sFAIL%s %-54s %s\n' "$red" "$off" "$1" "${2:-}"; }

# has <description> <file> <fixed-string>
has()   { if grep -qF -- "$3" "$2"; then ok "$1"; else bad "$1" "not found in $2"; fi; }
# lacks <description> <file> <extended-regex>
lacks() { if grep -qE -- "$3" "$2"; then bad "$1" "found in $2"; else ok "$1"; fi; }

# --------------------------------------------------------------------------
say "1. One component, mounted, and reachable from the queue"

has   "routes.tsx mounts EntryStepper in assessor mode" "$ROUTES" '<EntryStepper mode="assessor" />'
has   "on review-queue/reflections/:reflection_id"      "$ROUTES" 'path="review-queue/reflections/:reflection_id"'
lacks "the CAP-13 placeholder is gone"                  "$ROUTES" 'ticket="CAP-13"'

if ls web/src/screens/ | grep -qi 'assessor'; then
    bad "no second assessor screen file" "$(ls web/src/screens/ | grep -i assessor | tr '\n' ' ')"
else
    ok "no second assessor screen file"
fi

has   "the queue links into it"                "$QUEUE" '/review-queue/reflections/${entry.reflection_id}'
lacks "the queue's link is no longer disabled" "$QUEUE" 'aria-disabled="true"'

# --------------------------------------------------------------------------
say "2. POST, never PUT (ADR #34)"

has   "counter-scores are POSTed"                 "$SCREEN" "'/entries/{entry_id}/scores',"
lacks "no PUT or PATCH to the counter-score path" "$SCREEN" "api\.(put|patch)\('/entries/\{entry_id\}/scores'"

# --------------------------------------------------------------------------
say "3. Errors handled by code"

for code in COMMENT_REQUIRED NOT_SUBMITTED ALREADY_SCORED; do
    has "handles $code" "$LOGIC" "case '$code':"
done
has   "the screen switches on the mapped failure" "$SCREEN" 'counter_score_failure(api_error.code)'
lacks "never switches on a message"               "$SCREEN" 'switch \(.*\.message'

# --------------------------------------------------------------------------
say "4. Reflects the flip, never makes it"

has   "status comes from the 201 body" "$SCREEN" 'reflection_status, completed_the_reflection'
lacks "never sets status: 'assessed'"  "$SCREEN" "status: 'assessed'"

# --------------------------------------------------------------------------
say "5. The comment hint is labelled as a hint"

has "reads the rubric's own flag" "$LOGIC" 'framework.comment_required'
has "names the rule it mirrors"   "$LOGIC" 'api/app/Services/Scoring.php'

# --------------------------------------------------------------------------
say "6. Review round 1: drafts, Save all, green chips, landing"

has   "drafts are held per entry by the stepper"      "$SCREEN" 'drafts[current.id]'
has   "Save all decides what is missing in pure logic" "$LOGIC"  'export function missing_before_save_all('
has   "Save all goes through the same single save"     "$SCREEN" 'await save_entry('
lacks "Save all never batches into a new endpoint"     "$SCREEN" "'/reflections/\{reflection_id\}/scores'"
has   "assessor chips use the counter tone"            "$SCREEN" 'tone="counter"'
has   "a reviewer with no student role lands on the queue" "$ROUTES" '<Navigate to="/review-queue" replace />'

# --------------------------------------------------------------------------
printf '\n%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
