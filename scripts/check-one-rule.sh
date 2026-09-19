#!/usr/bin/env bash
#
# CLAUDE.md: "Never duplicate a business rule. Each rule has exactly one
# implementation." Nothing enforced that until CAP-19's audit found the
# reviewer-role list written out five times -- twice in ReflectionPolicy and
# once each in ReviewQueueController, ReflectionController and GigController,
# the last three as the same six-line query fragment copied verbatim.
#
#   ./run one-rule
#
# It greps for rules that have a single home, and fails when a second copy
# appears. A rule goes in this list when it is a literal that could be
# retyped somewhere else and nobody would notice.
#
# This cannot catch a rule reimplemented in different words. It catches the
# copy-paste, which is how all five of those happened.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT" || exit 1

if [ -t 1 ]; then
    dim=$'\033[2m'; red=$'\033[1;31m'; green=$'\033[1;32m'; blue=$'\033[1;34m'; off=$'\033[0m'
else
    dim=''; red=''; green=''; blue=''; off=''
fi

fail=0
printf '\n%s==>%s Rules that must have exactly one home\n' "$blue" "$off"

# check <description> <home> <grep-pattern>
#
# <home> is the one file allowed to contain the pattern. Every other hit in
# api/app is a duplicate.
check() {
    local what="$1" home="$2" pattern="$3"
    local hits others

    hits="$(grep -rln -- "$pattern" api/app 2>/dev/null | sort)"
    others="$(printf '%s\n' "$hits" | grep -v "^$home$" | grep -v '^$')"

    if [ -z "$hits" ]; then
        printf '  %sFAIL%s   %-44s %s\n' "$red" "$off" "$what" "not found at all — has it moved?"
        fail=$((fail + 1))
        return
    fi

    if [ -n "$others" ]; then
        printf '  %sFAIL%s   %-44s copied outside %s:\n' "$red" "$off" "$what" "$home"
        printf '%s\n' "$others" | sed 's/^/           /'
        printf '           %suse the constant or the scope instead of retyping it%s\n' "$dim" "$off"
        fail=$((fail + 1))
        return
    fi

    printf '  %sok%s     %-44s only in %s\n' "$green" "$off" "$what" "$home"
}

# absent <description> <extended-regex>
#
# For a rule whose one home is a directory rather than a file. Every hit in
# api/app is a copy outside it.
absent() {
    local what="$1" pattern="$2"
    local hits

    hits="$(grep -rnE -- "$pattern" api/app 2>/dev/null)"

    if [ -n "$hits" ]; then
        printf '  %sFAIL%s   %-44s decided outside api/app/Policies:\n' "$red" "$off" "$what"
        printf '%s\n' "$hits" | sed 's/^/           /'
        printf '           %sput it in a policy method and call Gate::authorize%s\n' "$dim" "$off"
        fail=$((fail + 1))
        return
    fi

    printf '  %sok%s     %-44s only in api/app/Policies\n' "$green" "$off" "$what"
}

check "the reviewer roles" \
      "api/app/Services/RoleResolver.php" \
      "'assessor', 'supervisor', 'employer'"

check "the reflections-you-review join" \
      "api/app/Models/Reflection.php" \
      "whereColumn('gig_participants.gig_id'"

# CAP-19: "authorisation lives in api/app/Policies/ and nowhere else". The
# audit found the create-reflection role check as abort_if(403) in
# ReflectionCreator and the export ownership check as abort(404) in
# ExportController. A 403 or 404 decided by hand is authorisation that
# skipped the policy.
absent "a 403 or 404 decided by abort()" \
       "abort(_if|_unless)?\(.*\b40[34]\b"

printf '\n'
if [ "$fail" -gt 0 ]; then
    printf '%s%s rule(s) with more than one implementation.%s\n' "$red" "$fail" "$off"
    exit 1
fi
printf '%sEvery listed rule has one home.%s\n' "$green" "$off"
exit 0
