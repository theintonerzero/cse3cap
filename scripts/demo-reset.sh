#!/usr/bin/env bash
# Resets the live demo to freshly seeded data (CAP-54, ADR #62). Runs ON the box.
# Every visitor is signed out: their tokens go with the old rows, and the
# picker's personas.json is rewritten with the new ones.
set -euo pipefail

DIARY_HOME="${DIARY_HOME:-/home/ubuntu/diary}"
COMPOSE="$DIARY_HOME/src/deploy/demo/compose.yml"
fail() { printf 'Error: %s\n' "$*" >&2; exit 1; }

# The deploy's lock: a timed deploy must not check out a new src/ or migrate
# while this runs migrate:fresh. Waits up to 10 minutes for one to finish.
if [ "${DIARY_LOCKED:-}" != 1 ]; then
    rc=0
    DIARY_LOCKED=1 flock -w 600 -E 75 "$DIARY_HOME/deploy.lock" "$0" "$@" || rc=$?
    [ "$rc" -eq 75 ] && fail "a deploy has held the lock for 10 minutes; nothing was reset. Try again when it finishes."
    exit "$rc"
fi

# The rule deploy-demo.sh keeps too: only a *_demo database is ever touched.
db="$(sed -n 's/^DB_DATABASE=["'\'']\{0,1\}\([^"'\'']*\).*/\1/p' "$DIARY_HOME/shared/api.env" | tail -n 1)"
case "$db" in
    *_demo) ;;
    *) fail "shared/api.env names DB_DATABASE='$db'. A reset only ever runs on a database ending in _demo." ;;
esac

sha="$(cat "$DIARY_HOME/deployed" 2>/dev/null || true)"
[ -n "$sha" ] || fail "nothing is deployed yet; deploy first, then reset"
compose() { DIARY_SHA="$sha" DIARY_HOME="$DIARY_HOME" docker compose -f "$COMPOSE" "$@"; }

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

printf '==> reseeding %s\n' "$db"
compose run --rm diary-api php artisan migrate:fresh --drop-views --seed --force --no-interaction --no-ansi \
    > "$work/seed.txt"

# DemoSeeder issues tokens to Jane, Sam and Dr Lee only. Demo-Script's main
# student is Noor A (Jane's sprints are full), with Priya R and Tom H as
# stand-ins, so the rest of the demo people get one the way the Runbook issues
# Noor's: named demo, expiring with the seeded three (ADR #46).
printf '==> issuing tokens for the rest of the demo people\n'
# shellcheck disable=SC2016 # PHP, not shell: the $ signs are PHP's
compose run --rm -T diary-api php artisan tinker --execute '
    require "/app/scripts/lib/demo-people.php";
    foreach (DEMO_PEOPLE as [$id, $name]) {
        $user = App\Models\User::where("display_name", $name)->first();
        if ($user === null || $user->tokens()->exists()) { continue; }
        $token = $user->createToken("demo", ["*"], now()->addDays(Database\Seeders\DemoSeeder::TOKEN_LIFETIME_DAYS));
        echo $name, " ", $token->plainTextToken, PHP_EOL;
    }' >> "$work/seed.txt"

# Built aside and installed whole: a failure keeps the previous file, so the
# picker never shows an empty list. The seed output holds every new token.
printf '==> writing personas.json\n'
compose run --rm -T -v "$work:/seed:ro" diary-api php /app/scripts/demo-personas.php /seed/seed.txt \
    > "$work/personas.json" || fail "could not build personas.json; the previous file was kept"
install -m 0640 "$work/personas.json" "$DIARY_HOME/shared/demo/personas.json"

# The AI sidecar's own database (CAP-69, ADR #64): vectors, usage, the day's
# spend, cached themes and rate limits. Derived from narratives that were just
# reseeded, so emptied with them. Only once shared/ai.env names a database.
if grep -Eq '^DATABASE_URL=.+' "$DIARY_HOME/shared/ai.env" 2>/dev/null; then
    printf '==> emptying diary_ai\n'
    # The diary is reset by now; a sidecar that can't be reached is said, not fatal.
    compose run --rm -T diary-ai python -m sidecar.reset \
        || printf 'Warning: the demo was reset, but diary_ai was not emptied. Check shared/ai.env.\n' >&2
else
    printf '==> the AI sidecar has no database configured; nothing to empty\n'
fi
printf '==> done. Everyone signed in before the reset must reload the page.\n'
