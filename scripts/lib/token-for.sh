# shellcheck shell=bash
# Sourced, not run. Every script that reads a seeded token by name gets it
# here, so the rule lives in one place (CAP-45).
#
#   token_for NAME [FILE]     FILE defaults to $TOKENS
#
# Prints the token on the last line naming NAME, or nothing. DemoSeeder
# prints one line per person, name then token, and a token never holds a
# space, so it is the last field. By name and not by its characters, because
# ADR #46's rdiary_ prefix changed those once (CAP-44).
#
# Only a last field holding the "|" every Sanctum token has (id|secret)
# counts: `php artisan db:seed` goes on to print a ReflectionSeeder line per
# reflection that also starts with the name and ends in its status.
#
# The last such line, because a tokens file the reissue was appended to holds
# the old token and the new one. The \r goes, because a file saved on Windows
# ends every line in one and the token would carry it into the header.
# Never fails, so a caller under `set -e -o pipefail` survives a missing
# file or a missing name and can say so itself.
token_for() {
    local file="${2:-${TOKENS:-}}"
    [ -n "$file" ] && [ -f "$file" ] || return 0
    { grep -F -- "$1" "$file" || true; } | tr -d '\r' | awk 'index($NF, "|") { t = $NF } END { if (t != "") print t }'
}
