# shellcheck shell=bash
# Sourced, not run. Every script that reads a seeded token by name gets it
# here, so the rule lives in one place (CAP-45).
#
#   token_for NAME [FILE]     FILE defaults to $TOKENS
#
# Prints the token on the last line naming NAME, or nothing. The seeder
# prints one line per person, name then token (DemoSeeder.php), and a token
# never holds a space, so it is the last field. By name and not by shape,
# because ADR #46's rdiary_ prefix changed the shape once (CAP-44).
#
# The last line, because a tokens file the reissue was appended to holds the
# old token and the new one. The \r goes, because a file saved on Windows
# ends every line in one and the token would carry it into the header.
# Never fails, so a caller under `set -e -o pipefail` survives a missing
# file or a missing name and can say so itself.
token_for() {
    local file="${2:-${TOKENS:-}}"
    [ -n "$file" ] && [ -f "$file" ] || return 0
    { grep -F -- "$1" "$file" || true; } | tr -d '\r' | awk '{print $NF}' | tail -n 1
}
