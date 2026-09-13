#!/usr/bin/env bash
#
# Builds the frontend the way a deploy would, with a bearer token deliberately
# present in the environment, and fails if that token survives into the built
# assets.
#
#   ./run bundle-secrets
#
# This is the regression test for F1 in docs/Security-Review.md. Vite replaces
# `import.meta.env.VITE_API_TOKEN` with a string literal at build time, so
# before the fix a seeded token compiled straight into public JavaScript the
# moment any shipped code path read it. Nothing about the running site looked
# wrong, no error was raised, and the only reason it was not already happening
# was that no screen called the API client yet -- an accident that ends with
# CAP-5.
#
# client.ts now gates the seed behind `import.meta.env.DEV`, which is
# statically false in a production build, so the branch and the value are
# eliminated before the bundle is written. This proves that stayed true.
#
# It writes .env.production.local, builds, greps, and removes it again. That
# filename is gitignored at the repository root and takes priority over
# web/.env, so a developer's own token file is neither read nor touched.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB="$ROOT/web"

if [ -t 1 ]; then
    dim=$'\033[2m'; red=$'\033[1;31m'; green=$'\033[1;32m'
    blue=$'\033[1;34m'; off=$'\033[0m'
else
    dim=''; red=''; green=''; blue=''; off=''
fi

say() { printf '\n%s==>%s %s\n' "$blue" "$off" "$1"; }
die() { printf '%sError:%s %s\n' "$red" "$off" "$1" >&2; exit 2; }

[ -d "$WEB/node_modules" ] || die "web/node_modules is missing. Run npm install in web/ first."

# Recognisable, and not a real credential. If this string ever appears in a
# built asset the build carried an environment value into public code.
CANARY='CANARY-bundle-secrets-do-not-ship-8f14e45f'
LOCAL_ENV="$WEB/.env.production.local"
OUT="$WEB/.bundle-secrets-out"

cleanup() { rm -f "$LOCAL_ENV"; rm -rf "$OUT"; }
trap cleanup EXIT INT TERM

[ -e "$LOCAL_ENV" ] && die ".env.production.local already exists. Move it aside; this script owns that file."

say "Building for production with a token in the environment"
printf 'VITE_API_BASE_URL=/api/v1\nVITE_API_TOKEN=%s\n' "$CANARY" > "$LOCAL_ENV"

build_log="$(cd "$WEB" && npx vite build --outDir "$OUT" --emptyOutDir --logLevel error 2>&1)"
status=$?

if [ "$status" -ne 0 ] || [ ! -d "$OUT" ]; then
    # The stack trace is the least useful part and the longest, so show the
    # lines that actually name the problem. A missing dependency reads as a
    # failed resolve, which is a stale node_modules rather than a bad build.
    printf '%s\n' "$build_log" | grep -viE '^\s+at |^\s*\}$|errors: \[' | tail -8 | sed 's/^/  /'
    die "the production build failed, so nothing could be checked. If an import would not resolve, run npm install in web/."
fi

printf '  %sbuilt %s assets%s\n' "$dim" "$(find "$OUT" -type f -name '*.js' | wc -l | tr -d ' ')" "$off"

say "Looking for the token in what would be served"
hits="$(grep -rl "$CANARY" "$OUT" 2>/dev/null)"

if [ -n "$hits" ]; then
    printf '  %sFAIL%s   a bearer token from the environment is in the built output:\n' "$red" "$off"
    printf '%s\n' "$hits" | sed 's/^/           /'
    printf '\n         %s\n' "Context:"
    grep -roh ".\{40\}$CANARY.\{10\}" "$OUT" 2>/dev/null | head -2 | sed 's/^/           /'
    cat <<'WHY'

         Anyone who loads the page can read this out of the JavaScript.
         The seed in web/src/api/client.ts must stay behind
         import.meta.env.DEV, which is statically false in a production
         build. See F1 in docs/Security-Review.md.
WHY
    exit 1
fi

printf '  %sok%s     no token in the production bundle\n' "$green" "$off"

# The inverse, so a pass cannot come from the build silently ignoring the
# environment file. If the base URL did not make it in either, the check
# proved nothing and should say so rather than reporting a green tick.
if ! grep -rq "api/v1" "$OUT" 2>/dev/null; then
    printf '  %sFAIL%s   VITE_API_BASE_URL is not in the bundle either, so the build\n' "$red" "$off"
    printf '         ignored .env.production.local and this check proved nothing.\n'
    exit 1
fi

printf '  %sok%s     the environment file was read, so the absence above is real\n' "$green" "$off"
printf '\n%sPassed.%s A production build cannot carry VITE_API_TOKEN.\n' "$green" "$off"
exit 0
