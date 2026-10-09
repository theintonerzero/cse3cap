#!/usr/bin/env bash
# Resets the live demo to freshly seeded data (CAP-54, ADR #62). Runs ON the box.
# Every visitor is signed out: their tokens go with the old rows, and the
# picker's personas.json is rewritten with the new ones.
set -euo pipefail

DIARY_HOME="${DIARY_HOME:-/home/ubuntu/diary}"
COMPOSE="$DIARY_HOME/src/deploy/demo/compose.yml"
fail() { printf 'Error: %s\n' "$*" >&2; exit 1; }

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

# Built aside and installed whole: a failure keeps the previous file, so the
# picker never shows an empty list. The seed output holds every new token.
printf '==> writing personas.json\n'
compose run --rm -T -v "$work:/seed:ro" diary-api php /app/scripts/demo-personas.php /seed/seed.txt \
    > "$work/personas.json" || fail "could not build personas.json; the previous file was kept"
install -m 0640 "$work/personas.json" "$DIARY_HOME/shared/demo/personas.json"
printf '==> done. Everyone signed in before the reset must reload the page.\n'
