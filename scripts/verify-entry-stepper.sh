#!/usr/bin/env bash
#
# Proves the entry stepper's invariants still hold.
#
#   ./run verify-entry-stepper           from the repository root
#   ./scripts/verify-entry-stepper.sh    the same thing
#
# web/ has no test runner (CLAUDE.md), so this is where a frontend check
# lives, same as verify-diary-home.sh and verify-app-shell.sh.
#
# 1. The screen is actually mounted, and the placeholder it replaced is gone
#    from that one route (entries/:entry_id keeps its placeholder on
#    purpose -- see routes.tsx's own comment).
# 2. No second API client, no hand-written response type.
# 3. All four states, including skeletons rather than a spinner.
# 4. The security condition from the ticket's own comment: a link evidence
#    item carries rel="noopener noreferrer", and no evidence item of any
#    other kind is ever given a clickable href.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

SCREEN="web/src/screens/EntryStepper.tsx"
LOGIC="web/src/screens/entry-stepper-logic.ts"
ROUTES="web/src/app/routes.tsx"

if [ -t 1 ]; then
    blu=$'\033[1;34m'; grn=$'\033[1;32m'; red=$'\033[1;31m'; off=$'\033[0m'
else
    blu=''; grn=''; red=''; off=''
fi

pass=0; fail=0
say() { printf '\n%s==>%s %s\n' "$blu" "$off" "$1"; }
ok()  { pass=$((pass+1)); printf '  %sok%s   %-54s %s\n' "$grn" "$off" "$1" "${2:-}"; }
bad() { fail=$((fail+1)); printf '  %sFAIL%s %-54s %s\n' "$red" "$off" "$1" "${2:-}"; }

# --------------------------------------------------------------------------
say "1. The screen is mounted"

if grep -q '<EntryStepper />' "$ROUTES"; then
    ok "routes.tsx renders EntryStepper"
else
    bad "routes.tsx renders EntryStepper" "reflections/:reflection_id still a placeholder?"
fi

if grep -q 'path="reflections/:reflection_id"' "$ROUTES" && \
   ! grep -A1 'path="reflections/:reflection_id"' "$ROUTES" | grep -q 'Placeholder'; then
    ok "the CAP-11 placeholder is gone from reflections/:reflection_id"
else
    bad "the CAP-11 placeholder is gone from reflections/:reflection_id"
fi

# --------------------------------------------------------------------------
say "2. One API client, no hand-written response type"

if grep -q "from '../api/client.ts'" "$SCREEN"; then
    ok "imports the shared client"
else
    bad "imports the shared client"
fi

if grep -qE '\bfetch\(' "$SCREEN"; then
    bad "no direct fetch() in the screen" "found one -- route it through api/client.ts"
else
    ok "no direct fetch() in the screen"
fi

# --------------------------------------------------------------------------
say "3. Four states"

for state in loading error loaded; do
    if grep -q "status: '$state'" "$SCREEN"; then
        ok "state present: $state"
    else
        bad "state present: $state"
    fi
done

if grep -q 'SkeletonGroup' "$SCREEN"; then
    ok "loading uses skeletons, not a spinner"
else
    bad "loading uses skeletons, not a spinner"
fi

if grep -q 'Nothing to reflect on' "$SCREEN"; then
    ok "empty state present"
else
    bad "empty state present"
fi

# --------------------------------------------------------------------------
say "4. Evidence link security condition (ticket comment, 2026-09-19)"

if grep -q 'rel="noopener noreferrer"' "$SCREEN"; then
    ok "link evidence carries rel=noopener noreferrer"
else
    bad "link evidence carries rel=noopener noreferrer"
fi

# A second <a ...href={item.uri}...> outside the kind === 'link' branch would
# mean a file or image item got a clickable URL too, which is exactly what
# the ticket comment warns against. One href in the whole evidence render is
# correct; more than one means a second, un-gated link crept in.
href_count=$(grep -c 'href={item.uri}' "$SCREEN" || true)
if [ "$href_count" = "1" ]; then
    ok "exactly one evidence href, gated on kind === 'link'"
else
    bad "exactly one evidence href, gated on kind === 'link'" "found $href_count"
fi

if grep -q "kind === 'link'" "$SCREEN"; then
    ok "the one href is behind a kind === 'link' check"
else
    bad "the one href is behind a kind === 'link' check"
fi

# --------------------------------------------------------------------------
say "5. Pure logic stays free of React"

if grep -q "from 'react'" "$LOGIC"; then
    bad "entry-stepper-logic.ts has no React import" "found one"
else
    ok "entry-stepper-logic.ts has no React import"
fi

# --------------------------------------------------------------------------
printf '\n%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
