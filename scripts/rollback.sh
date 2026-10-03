#!/usr/bin/env bash
#
# Points the demo at a different release and reloads PHP-FPM (CAP-26).
#
#   scripts/rollback.sh diary@rddb.darkovski.dev          from your laptop
#   scripts/rollback.sh                                   on the box
#   scripts/rollback.sh [user@host] --to <release>        a named release
#   scripts/rollback.sh [user@host] --list                what is there
#
# With no --to it goes to the release before the current one. It does not
# rebuild anything, so it is fast enough to use during a demo.
#
# This is the one place `current` moves. scripts/deploy.sh switches to a new
# release by calling it with --to, so every deploy exercises the same path a
# rollback takes, and a rollback is never a procedure nobody has run.
#
# The switch is atomic: a new symlink is made beside `current` and renamed
# over it, so there is no moment with no site. PHP-FPM is then reloaded,
# because OPcache caches resolved paths and would keep serving the old
# release indefinitely. Caddy needs nothing: it resolves `current` on every
# request, and its configuration is not touched (ADR #21).
#
# Box settings come from /var/www/diary/shared/deploy.conf when present.
# See deploy/README.md.

set -euo pipefail

if [ -t 1 ]; then
    red=$'\033[1;31m'; green=$'\033[1;32m'; dim=$'\033[2m'; off=$'\033[0m'
else
    red=''; green=''; dim=''; off=''
fi

ok()  { printf '  %sok%s      %s\n' "$green" "$off" "$1"; }
die() { printf '  %sFAIL%s    %s\n' "$red" "$off" "$1" >&2; exit 1; }

# --------------------------------------------------------------------------
# From a laptop: pipe this file into bash on the box, as check-deploy-host.sh
# does. Nothing is copied there.
# --------------------------------------------------------------------------
if [ -n "${1:-}" ] && [ "${1#-}" = "$1" ]; then
    target="$1"; shift
    command -v ssh >/dev/null || die "ssh is not installed"
    exec ssh -o BatchMode=yes "$target" bash -s -- "$@" < "${BASH_SOURCE[0]}"
fi

ROOT="${DIARY_ROOT:-/var/www/diary}"
RELEASES="$ROOT/releases"
PHP_FPM_RELOAD="${PHP_FPM_RELOAD:-sudo -n systemctl reload php8.5-fpm}"
# shellcheck source=/dev/null
[ -f "$ROOT/shared/deploy.conf" ] && . "$ROOT/shared/deploy.conf"

[ -d "$RELEASES" ] || die "$RELEASES does not exist. Is this the box?"

current="$(readlink "$ROOT/current" 2>/dev/null || true)"
current="${current:+$(basename "$current")}"

# Oldest first. Names start with a UTC timestamp, so this is date order.
# shellcheck disable=SC2012  # release names are ours: a timestamp and a sha
list() { ls -1 "$RELEASES" | sort; }

case "${1:-}" in
    --list)
        list | while read -r r; do
            if [ "$r" = "$current" ]; then
                printf '  %s*%s %s %s(current, %s)%s\n' "$green" "$off" "$r" "$dim" \
                    "$(cat "$RELEASES/$r/RELEASE" 2>/dev/null || echo 'no RELEASE file')" "$off"
            else
                printf '    %s %s(%s)%s\n' "$r" "$dim" \
                    "$(cat "$RELEASES/$r/RELEASE" 2>/dev/null || echo 'no RELEASE file')" "$off"
            fi
        done
        exit 0
        ;;
    --to)
        [ -n "${2:-}" ] || die "usage: rollback.sh [user@host] --to <release>"
        want="$2"
        ;;
    '')
        [ -n "$current" ] || die "nothing is current, so there is nothing to roll back from"
        want="$(list | awk -v c="$current" '$0 == c {print prev; exit} {prev = $0}')"
        [ -n "$want" ] || die "$current is the oldest release. There is nothing before it"
        ;;
    *)
        die "unknown argument $1. Try --list, or --to <release>"
        ;;
esac

case "$want" in
    */*|.|..) die "'$want' is a release name, not a path" ;;
esac
[ -d "$RELEASES/$want" ] || die "no release called $want. See --list"
[ -f "$RELEASES/$want/web/dist/index.html" ] || die "$want has no built frontend. It is not a finished release"
[ -f "$RELEASES/$want/api/vendor/autoload.php" ] || die "$want has no built API. It is not a finished release"

# One deploy or rollback at a time. Two would share current.next and each
# could check the other's release. A deploy takes the lock for its whole run
# and says so in DIARY_LOCK_HELD, because it moves current through here.
if [ -z "${DIARY_LOCK_HELD:-}" ]; then
    exec 9>"$ROOT/.deploy.lock"
    flock -n 9 || die "a deploy or another rollback is running. Nothing was changed; try again when it finishes"
fi

if [ "$want" = "$current" ]; then
    ok "$want is already current"
else
    ln -sfn "releases/$want" "$ROOT/current.next"
    mv -Tf "$ROOT/current.next" "$ROOT/current"
    ok "current -> $want${current:+ (was $current)}"
fi

printf '  %s$ %s%s\n' "$dim" "$PHP_FPM_RELOAD" "$off"
eval "$PHP_FPM_RELOAD" || die "PHP-FPM did not reload. current points at $want, but PHP may still serve the old code"
ok "PHP-FPM reloaded"
