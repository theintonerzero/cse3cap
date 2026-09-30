#!/usr/bin/env bash
#
# Deploys a tagged release of the demo to the VPS (CAP-26).
#
#   scripts/deploy.sh diary@rddb.darkovski.dev v0.3.0     from your laptop
#
# Deliberately not on the ./run menu (spec §9.2): a production deploy one
# mistyped word away from ./run dev is a loaded gun next to the coffee
# machine. Type the path.
#
# What happens, in order. Nothing public changes until step 7.
#
#   1. The tag must exist on origin at the same commit as here, so what is
#      deployed is something the team can read.
#   2. `git archive` of the tag is streamed over ssh into a new release
#      directory. The box never talks to GitHub and holds no key for it.
#   3. On the box, this same script from inside the release (--on-box):
#      shared/.env is asserted to be production-safe, api/.env and
#      api/storage are linked into shared/, and both apps are built.
#   4. The frontend is built with VITE_API_TOKEN unset, then the bundle is
#      grepped for a token shape and for the box's own secrets. A match
#      aborts the deploy (F1 in docs/Security-Review.md).
#   5. The database session is checked for TLS (scripts/check-db-tls.sh).
#   6. Migrations are checked, never run. The database is the team's shared
#      one, and a pending migration means the code is ahead of the schema.
#      That is a conversation, not something a deploy does on its own.
#   7. `current` is switched to the new release and PHP-FPM is reloaded,
#      through scripts/rollback.sh --to, the one place `current` moves.
#   8. The public URL is checked. If it fails, `current` goes back to the
#      previous release and the deploy exits non-zero.
#   9. Releases beyond the newest five are pruned.
#
# It never touches the Caddy configuration. That configuration also issues
# the certificate the shared MySQL serves (ADR #21), so changing it is a
# separate, deliberate step in docs/Deployment.md, not a side effect of
# shipping code. Caddy needs no reload for a release switch: it resolves
# `current` on every request.
#
# Two further modes exist so the checks can be tested on their own, by
# scripts/deploy.test.py, without a box:
#
#   scripts/deploy.sh --check-env <file>             the shared/.env rules
#   scripts/deploy.sh --check-bundle <dist> <file>   the bundle grep
#   scripts/deploy.sh --prune <releases> <keep>      the pruning

set -euo pipefail

if [ -t 1 ]; then
    red=$'\033[1;31m'; green=$'\033[1;32m'; blue=$'\033[1;34m'; dim=$'\033[2m'; off=$'\033[0m'
else
    red=''; green=''; blue=''; dim=''; off=''
fi

say()  { printf '\n%s==>%s %s\n' "$blue" "$off" "$1"; }
ok()   { printf '  %sok%s      %s\n' "$green" "$off" "$1"; }
fail() { printf '  %sFAIL%s    %s\n' "$red" "$off" "$1" >&2; }
die()  { fail "$1"; exit 1; }
run()  { printf '  %s$ %s%s\n' "$dim" "$*" "$off"; "$@"; }

KEEP_RELEASES=5

# The value of KEY in an env file: the last assignment wins, as it does for
# Laravel's loader, and one layer of matching quotes is removed.
env_value() {
    local file="$1" key="$2" line value
    line="$(grep -E "^[[:space:]]*${key}=" "$file" | tail -1 || true)"
    value="${line#*=}"
    value="${value%$'\r'}"
    case "$value" in
        \"*\") value="${value#\"}"; value="${value%\"}" ;;
        \'*\') value="${value#\'}"; value="${value%\'}" ;;
    esac
    printf '%s' "$value"
}

# --------------------------------------------------------------------------
# shared/.env must be safe to serve to the internet with. Laravel's debug
# renderer prints stack traces with database credentials in them, so
# APP_DEBUG=true on a public host is a credential leak, not an inconvenience.
# --------------------------------------------------------------------------
check_env() {
    local file="$1" problems=0 mode

    [ -f "$file" ] || die "$file does not exist. First-time setup is in docs/Deployment.md"

    mode="$(stat -c '%a' "$file" 2>/dev/null || stat -f '%Lp' "$file")"
    if [ "$mode" != "600" ]; then
        fail "$file is mode $mode. It holds the database password: chmod 600"
        problems=$((problems + 1))
    fi

    expect() {
        local key="$1" want="$2" why="$3" got
        got="$(env_value "$file" "$key")"
        if [ "$got" != "$want" ]; then
            fail "$key is '${got}', must be '$want'. $why"
            problems=$((problems + 1))
        fi
    }
    present() {
        local key="$1" why="$2"
        if [ -z "$(env_value "$file" "$key")" ]; then
            fail "$key is empty. $why"
            problems=$((problems + 1))
        fi
    }

    expect APP_ENV production "Anything else changes error handling and caching"
    expect APP_DEBUG false "Debug pages print credentials"
    expect QUEUE_CONNECTION sync "There is no jobs table and no worker (ADR #30)"
    expect CACHE_STORE file "There is no cache table (root .env.example)"
    expect SESSION_DRIVER file "There is no sessions table (root .env.example)"
    present APP_KEY "Generate it once with php artisan key:generate --show"
    present DB_PASSWORD "The app cannot reach the database"
    present MYSQL_ATTR_SSL_CA "Without it PDO never negotiates TLS and fails as 'Access denied'"

    case "$(env_value "$file" APP_URL)" in
        https://*) ;;
        *) fail "APP_URL must be the https:// address the demo is served on"
           problems=$((problems + 1)) ;;
    esac

    if grep -qE '^[[:space:]]*VITE_API_TOKEN=' "$file"; then
        fail "VITE_API_TOKEN is in $file. It has no production meaning; remove the line"
        problems=$((problems + 1))
    fi

    [ "$problems" -eq 0 ] || die "$problems problem(s) in $file. Nothing was deployed"
    ok "$file is production-safe"
}

# --------------------------------------------------------------------------
# The built frontend must hold no token and none of the box's secrets. A
# Sanctum token is `<id>|<40 characters>`, prefixed when
# SANCTUM_TOKEN_PREFIX is set, so the shape catches one from anywhere. The
# literal values catch what a shape cannot.
# --------------------------------------------------------------------------
check_bundle() {
    local dist="$1" file="$2" hits key value

    [ -d "$dist" ] || die "$dist does not exist. Was the frontend built?"
    [ -n "$(ls -A "$dist")" ] || die "$dist is empty. Was the frontend built?"

    hits="$(grep -rlE '[0-9]+\|[A-Za-z0-9_]*[A-Za-z0-9]{40}' "$dist" || true)"
    if [ -n "$hits" ]; then
        fail "something shaped like a bearer token is in the built frontend:"
        printf '%s\n' "$hits" | sed 's/^/          /' >&2
        die "Deploy aborted before anything was switched"
    fi

    for key in APP_KEY DB_PASSWORD DB_READONLY_PASSWORD; do
        value="$(env_value "$file" "$key")"
        [ ${#value} -ge 8 ] || continue
        if grep -rqF -- "$value" "$dist"; then
            die "the value of $key from $file is in the built frontend. Deploy aborted"
        fi
    done

    ok "no token or secret in $dist"
}

# --------------------------------------------------------------------------
# On the box. Runs from inside the new release, as the user that owns
# /var/www/diary, so the code doing the work is exactly the tagged code.
# --------------------------------------------------------------------------
on_box() {
    # release and name are global on purpose: the EXIT trap below reads
    # them after this function has returned.
    release="$1"
    local tag="$2" sha="$3" root releases shared previous

    release="$(cd "$release" && pwd -P)"
    releases="$(dirname "$release")"
    root="$(dirname "$releases")"
    shared="$root/shared"
    name="$(basename "$release")"

    [ "$(basename "$releases")" = releases ] \
        || die "$release is not inside a releases/ directory"

    # Box settings that are not secret. See deploy/README.md.
    DIARY_URL="https://diary.darkovski.dev"
    PHP_FPM_RELOAD="sudo -n systemctl reload php8.5-fpm"
    # shellcheck source=/dev/null
    [ -f "$shared/deploy.conf" ] && . "$shared/deploy.conf"
    # rollback.sh reads the same root and settings rather than assuming them.
    DIARY_ROOT="$root"
    export DIARY_ROOT DIARY_URL PHP_FPM_RELOAD

    # Remove the half-built release on any failure before the switch, so a
    # broken build never sits where rollback.sh could pick it.
    switched=0
    # shellcheck disable=SC2154  # status is assigned inside the trap itself
    trap 'status=$?; if [ "$status" -ne 0 ] && [ "$switched" -eq 0 ]; then
              rm -rf -- "$release"
              printf "\n  %sRemoved %s. The live site did not change.%s\n" "$red" "$name" "$off" >&2
          fi' EXIT

    printf '%s %s\n' "$tag" "$sha" > "$release/RELEASE"

    say "Checking shared/.env"
    check_env "$shared/.env"

    say "Linking the shared state into $name"
    # Evidence uploads land in storage/app/private. Without this link every
    # deploy would orphan every file a student uploaded, silently.
    mkdir -p "$shared/storage/app/private" "$shared/storage/logs" \
        "$shared/storage/framework/cache" "$shared/storage/framework/sessions" \
        "$shared/storage/framework/views"
    rm -rf -- "$release/api/storage"
    ln -s "$shared/storage" "$release/api/storage"
    ln -sfn "$shared/.env" "$release/api/.env"
    ok "api/.env and api/storage point into shared/"

    say "Building the API"
    ( cd "$release/api" && run composer install --no-dev --optimize-autoloader \
        --no-interaction --no-progress --quiet )
    # Caches resolve MYSQL_ATTR_SSL_CA to this release's absolute path, which
    # is correct: each release carries its own db/letsencrypt-roots.pem.
    ( cd "$release/api" && run php artisan optimize --quiet )
    ok "composer and caches done"

    say "Building the frontend, with VITE_API_TOKEN unset"
    ( cd "$release/web" && run npm ci --no-audit --no-fund --loglevel=error )
    ( cd "$release/web" && run env -u VITE_API_TOKEN npm run build --silent )
    check_bundle "$release/web/dist" "$shared/.env"

    say "Checking the database connection is encrypted"
    run "$release/scripts/check-db-tls.sh" "$release/api"

    say "Checking migrations. They are never run from here"
    local status_out
    status_out="$(cd "$release/api" && php artisan migrate:status --no-ansi)"
    if printf '%s\n' "$status_out" | grep -q 'Pending'; then
        printf '%s\n' "$status_out" | grep 'Pending' | sed 's/^/          /' >&2
        die "the schema is behind this release. Migrations on the shared database are announced and run by a person (CLAUDE.md), then deploy again"
    fi
    ok "no pending migrations"

    previous="$(readlink "$root/current" 2>/dev/null || true)"
    previous="${previous:+$(basename "$previous")}"

    say "Switching to $name"
    switched=1
    "$release/scripts/rollback.sh" --to "$name"

    say "Checking $DIARY_URL"
    if ! check_live "$DIARY_URL"; then
        if [ -n "$previous" ]; then
            fail "the new release is not answering properly. Going back to $previous"
            "$release/scripts/rollback.sh" --to "$previous"
        else
            fail "the new release is not answering properly, and there is no previous release to go back to"
        fi
        exit 1
    fi

    say "Pruning to the newest $KEEP_RELEASES releases"
    prune "$releases" "$name"

    printf '\n%sDeployed %s (%s) as %s.%s\n' "$green" "$tag" "${sha:0:7}" "$name" "$off"
    printf '%sRoll back with: scripts/rollback.sh <user@host>%s\n' "$dim" "$off"
}

# The page is the app, and /api reaches Laravel: an unauthenticated
# /auth/me answers 401 in the error envelope, not Caddy's 404 or a 502.
#
# Asked of this box's own Caddy, with the real name for TLS and SNI. A cloud
# VPS behind NAT often cannot reach its own public address, and a check that
# fails for that reason would roll back a good release. Whether the world can
# reach it is checked from a laptop (docs/Deployment.md, first deploy).
check_live() {
    local url="$1" code body host
    host="${url#https://}"
    host="${host%%/*}"
    curl() { command curl --resolve "$host:443:127.0.0.1" "$@"; }
    code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 "$url/" || true)"
    [ "$code" = 200 ] || { fail "GET $url/ answered $code"; return 1; }
    ok "GET / answers 200"

    body="$(curl -sS --max-time 20 -w '\n%{http_code}' "$url/api/v1/auth/me" || true)"
    code="${body##*$'\n'}"
    body="${body%$'\n'*}"
    [ "$code" = 401 ] || { fail "GET /api/v1/auth/me answered $code, expected 401"; return 1; }
    printf '%s' "$body" | grep -q '"error"' \
        || { fail "GET /api/v1/auth/me answered 401 without the error envelope"; return 1; }
    ok "GET /api/v1/auth/me answers 401 in the envelope, so Laravel is serving"
}

# Keeps the newest KEEP_RELEASES by name, which starts with a UTC timestamp,
# and never the one just deployed.
prune() {
    local releases="$1" keep="$2" old
    # shellcheck disable=SC2012
    ls -1 "$releases" | sort -r | tail -n +$((KEEP_RELEASES + 1)) | while read -r old; do
        [ "$old" = "$keep" ] && continue
        rm -rf -- "${releases:?}/$old"
        ok "removed $old"
    done
}

# --------------------------------------------------------------------------
# From a laptop.
# --------------------------------------------------------------------------
from_laptop() {
    local target="$1" tag="$2" sha refs remote_sha name root release q_root q_release

    command -v ssh >/dev/null || die "ssh is not installed"
    cd "$(git rev-parse --show-toplevel)"

    say "Resolving $tag"
    sha="$(git rev-parse --verify --quiet "refs/tags/$tag^{commit}")" \
        || die "no tag $tag here. Tag a commit on main, push the tag, then deploy it"
    # Both patterns: ls-remote returns the peeled ^{} line only when asked
    # for it by name.
    refs="$(git ls-remote --tags origin "refs/tags/$tag" "refs/tags/$tag^{}")" \
        || die "could not read origin's tags. Check you can reach it, then try again"
    # An annotated tag's commit is listed as ^{}. A lightweight tag has no
    # such line and names the commit directly.
    remote_sha="$(printf '%s\n' "$refs" | awk -v r="refs/tags/$tag^{}" '$2 == r {print $1}')"
    [ -n "$remote_sha" ] \
        || remote_sha="$(printf '%s\n' "$refs" | awk -v r="refs/tags/$tag" '$2 == r {print $1}')"
    [ -n "$remote_sha" ] || die "$tag is not on origin. Push it, so what is deployed is something the team can read"
    [ "$remote_sha" = "$sha" ] || die "$tag is $sha here and $remote_sha on origin. Fetch the tags and look before deploying"
    ok "$tag is ${sha:0:7}, the same here and on origin"

    root="${DIARY_ROOT:-/var/www/diary}"
    name="$(date -u +%Y-%m-%d-%H%M%S)-${sha:0:7}"
    release="$root/releases/$name"
    q_root="$(printf '%q' "$root")"
    q_release="$(printf '%q' "$release")"

    say "Sending $tag to $target:$release"
    git archive --format=tar "$sha" \
        | ssh -o BatchMode=yes "$target" \
            "set -e; test -d $q_root/releases && test -f $q_root/shared/.env || { echo 'Not provisioned: see docs/Deployment.md' >&2; exit 1; }; mkdir $q_release; tar -x -C $q_release"
    ok "unpacked"

    # </dev/null: the box needs nothing from this terminal, and an ssh left
    # holding stdin can wait on it forever.
    ssh -o BatchMode=yes "$target" </dev/null \
        "bash $q_release/scripts/deploy.sh --on-box $q_release $(printf '%q' "$tag") $sha"
}

case "${1:-}" in
    --on-box)       [ $# -eq 4 ] || die "usage: deploy.sh --on-box <release> <tag> <sha>"
                    on_box "$2" "$3" "$4" ;;
    --check-env)    [ $# -eq 2 ] || die "usage: deploy.sh --check-env <file>"
                    check_env "$2" ;;
    --check-bundle) [ $# -eq 3 ] || die "usage: deploy.sh --check-bundle <dist> <env-file>"
                    check_bundle "$2" "$3" ;;
    --prune)        [ $# -eq 3 ] || die "usage: deploy.sh --prune <releases> <keep>"
                    prune "$2" "$3" ;;
    ''|-h|--help)   sed -n '2,47p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
                    [ $# -gt 0 ] ;;
    -*)             die "unknown option $1" ;;
    *)              [ $# -eq 2 ] || die "usage: scripts/deploy.sh <user@host> <tag>"
                    from_laptop "$1" "$2" ;;
esac
