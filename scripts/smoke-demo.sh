#!/usr/bin/env bash
# Checks the live demo from outside (CAP-54, ADR #62). Read-only: it never
# signs in and never sends the password.
#   scripts/smoke-demo.sh [https://diary.darkovski.dev]
set -euo pipefail
url="${1:-https://diary.darkovski.dev}"
fails=0
expect() {
    local name="$1" want="$2" got="$3"
    if [ "$got" = "$want" ]; then
        printf '  ok    %s\n' "$name"
    else
        printf '  FAIL  %s (got %s, want %s)\n' "$name" "$got" "$want"
        fails=$((fails + 1))
    fi
}
code() { curl -s -o /dev/null -w '%{http_code}' "$@"; }

expect "a page without the cookie redirects" 303 "$(code "$url/")"
expect "it redirects to /gate" "$url/gate" "$(curl -s -o /dev/null -w '%{redirect_url}' "$url/")"
expect "the API without the cookie is 401" 401 "$(code "$url/api/v1/auth/me")"
expect "the persona file without the cookie is not served" 303 "$(code "$url/demo/personas.json")"
expect "/gate asks for the password" 401 "$(code "$url/gate")"
expect "/gate without the password sets no cookie" "" \
    "$(curl -sI "$url/gate" | tr -d '\r' | grep -i '^set-cookie:' || true)"
expect "HTTPS is enforced" "max-age=31536000; includeSubDomains" \
    "$(curl -sI "$url/gate" | tr -d '\r' | sed -n 's/^[Ss]trict-[Tt]ransport-[Ss]ecurity: //p')"

if [ "$fails" -eq 0 ]; then
    printf '\nPassed.\n'
else
    printf '\n%d failed.\n' "$fails"
    exit 1
fi
