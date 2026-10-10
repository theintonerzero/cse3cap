#!/usr/bin/env bash
# Deploys the live demo on accord (CAP-54, ADR #62). Runs ON the box.
#
#   deploy-demo.sh --if-changed dev   what the timer runs every 5 minutes
#   deploy-demo.sh <sha|tag|branch>   by hand, e.g. to pin a version with freeze
#
# Builds the commit's images, migrates the demo database (and only a database
# whose name ends in _demo), starts them, health-checks, and on failure puts
# the previous images back. Never touches Caddy or the server compose project.
set -euo pipefail

DIARY_HOME="${DIARY_HOME:-/home/ubuntu/diary}"
SRC="$DIARY_HOME/src"
COMPOSE="$SRC/deploy/demo/compose.yml"
# shellcheck disable=SC1091
[ -f "$DIARY_HOME/shared/deploy.env" ] && . "$DIARY_HOME/shared/deploy.env"
DIARY_REPO="${DIARY_REPO:-https://github.com/theintonerzero/cse3cap.git}"

say() { printf '==> %s\n' "$*"; }
notify() {
    [ -n "${DIARY_NTFY_URL:-}" ] || return 0
    curl -fsS -m 10 ${DIARY_NTFY_TOKEN:+-H "Authorization: Bearer $DIARY_NTFY_TOKEN"} \
        -H "Title: diary demo" -d "$*" "$DIARY_NTFY_URL" >/dev/null || true
}
fail() { printf 'Error: %s\n' "$*" >&2; notify "failed: $*"; exit 1; }
compose() { DIARY_SHA="$1" DIARY_HOME="$DIARY_HOME" docker compose -f "$COMPOSE" "${@:2}"; }

# One run at a time, and demo-reset.sh takes the same lock. flock exits 75
# when another run holds it: the timer just tries again in 5 minutes, but a
# person is told, rather than getting a silent success that deployed nothing.
if [ "${DIARY_LOCKED:-}" != 1 ]; then
    rc=0
    DIARY_LOCKED=1 flock -n -E 75 "$DIARY_HOME/deploy.lock" "$0" "$@" || rc=$?
    if [ "$rc" -eq 75 ]; then
        [ "${1:-}" = "--if-changed" ] && exit 0
        printf 'Error: another deploy or a reset is running. Nothing was changed; try again when it finishes.\n' >&2
        exit 1
    fi
    exit "$rc"
fi

# The one rule that protects the team: only a *_demo database is migrated.
db="$(sed -n 's/^DB_DATABASE=["'\'']\{0,1\}\([^"'\'']*\).*/\1/p' "$DIARY_HOME/shared/api.env" | tail -n 1)"
case "$db" in
    *_demo) ;;
    *) fail "shared/api.env names DB_DATABASE='$db'. The demo only ever migrates a database ending in _demo." ;;
esac

deployed="$(cat "$DIARY_HOME/deployed" 2>/dev/null || true)"
failed="$(cat "$DIARY_HOME/failed" 2>/dev/null || true)"

if [ "${1:-}" = "--if-changed" ]; then
    branch="${2:?--if-changed needs a branch}"
    if [ -e "$DIARY_HOME/freeze" ]; then say "frozen, not deploying"; exit 0; fi
    want="$(git ls-remote "$DIARY_REPO" "refs/heads/$branch" | cut -f1)"
    [ -n "$want" ] || fail "could not read $branch from $DIARY_REPO"
    [ "$want" = "$deployed" ] && exit 0
    # A commit that already failed is not retried every 5 minutes (it would
    # take the demo down for a minute and re-run its migration each time);
    # the timer waits for the next commit. A deploy by hand still tries it.
    [ "$want" = "$failed" ] && exit 0
    ref="$want"
else
    ref="${1:?usage: deploy-demo.sh --if-changed <branch> | deploy-demo.sh <sha|tag|branch>}"
    # Pinning by hand (a version, or a rollback) stops the timer from putting
    # dev back 5 minutes later. Following dev again is a deliberate rm.
    touch "$DIARY_HOME/freeze"
    say "froze the timer: rm $DIARY_HOME/freeze to follow dev again"
fi
# Remembers the commit that failed, so the timer leaves it alone, then fails.
fail_at() { printf '%s\n' "$1" > "$DIARY_HOME/failed"; fail "$2"; }

say "fetching $ref"
[ -d "$SRC/.git" ] || git clone --quiet --no-checkout "$DIARY_REPO" "$SRC"
git -C "$SRC" fetch --quiet --depth 1 origin "$ref"
git -C "$SRC" checkout --quiet --force FETCH_HEAD
sha="$(git -C "$SRC" rev-parse HEAD)"
short="${sha:0:7}"

say "building $short"
compose "$sha" build || fail_at "$sha" "build of $short failed; nothing running was changed"

say "migrating $db"
compose "$sha" run --rm diary-api php artisan migrate --force --no-interaction \
    || fail_at "$sha" "migration at $short failed; the running demo was left as it was"

say "starting $short"
compose "$sha" up -d --remove-orphans

# About a minute by default; the tests set both to keep a failed check fast.
healthy() {
    local i=0
    while [ "$i" -lt "${DIARY_HEALTH_TRIES:-12}" ]; do
        compose "$1" exec -T diary-web wget -q -O /dev/null http://127.0.0.1/up && return 0
        i=$((i + 1))
        sleep "${DIARY_HEALTH_WAIT:-5}"
    done
    return 1
}

if healthy "$sha"; then
    if [ -n "$deployed" ] && [ "$deployed" != "$sha" ]; then
        printf '%s\n' "$deployed" > "$DIARY_HOME/previous"
    fi
    printf '%s\n' "$sha" > "$DIARY_HOME/deployed"
    rm -f "$DIARY_HOME/failed"
    # The timer runs bin/, never the checkout this run just rewrote. mv swaps
    # the file atomically, so a running copy keeps reading its old inode.
    { install -m 755 "$SRC/scripts/deploy-demo.sh" "$DIARY_HOME/bin/deploy-demo.sh.new" \
        && mv -f "$DIARY_HOME/bin/deploy-demo.sh.new" "$DIARY_HOME/bin/deploy-demo.sh"; } 2>/dev/null || true
    # Keep this commit's images and the one before; drop the rest.
    docker image ls --format '{{.Repository}}:{{.Tag}}' 'diary-*' \
        | grep -v -e ":$sha$" -e ":${deployed:-none}$" | xargs -r docker image rm >/dev/null 2>&1 || true
    say "deployed $short"
    notify "deployed $short"
    exit 0
fi

printf '%s\n' "$sha" > "$DIARY_HOME/failed"
if [ -z "$deployed" ]; then
    printf 'Error: %s failed its health check and there is nothing to roll back to.\n' "$short" >&2
    notify "first deploy $short failed its health check; nothing to roll back to"
    exit 1
fi
say "health check failed, rolling back to ${deployed:0:7}"
compose "$deployed" up -d --remove-orphans
notify "rolled back: $short failed /up, back on ${deployed:0:7}. If $short migrated, run demo-reset.sh."
exit 1
