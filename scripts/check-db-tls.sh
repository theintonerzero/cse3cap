#!/usr/bin/env bash
#
# Proves the application's own database session is encrypted (CAP-26).
#
#   ./run db-tls                         your api/, against the shared database
#   scripts/check-db-tls.sh <api-dir>    another checkout, e.g. a release on the box
#
# This check exists because the failure lies. The server sets
# require_secure_transport and both accounts carry REQUIRE SSL, and PDO does
# not negotiate TLS unless it is handed a CA file. A missing or wrong
# MYSQL_ATTR_SSL_CA therefore fails as "Access denied", which reads exactly
# like a wrong password.
#
# "The application loaded" is not evidence. The positive proof is that
# Ssl_cipher is non-empty on a connection Laravel made with its own config;
# empty means the session is in the clear. That is what this asserts.
#
# Read-only. It runs two SHOW SESSION STATUS queries and nothing else.

set -euo pipefail

API="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/api}"

if [ -t 1 ]; then
    red=$'\033[1;31m'; green=$'\033[1;32m'; off=$'\033[0m'
else
    red=''; green=''; off=''
fi

[ -f "$API/artisan" ] || { printf '%sFAIL%s    %s is not a Laravel app\n' "$red" "$off" "$API" >&2; exit 1; }
[ -f "$API/vendor/autoload.php" ] || { printf '%sFAIL%s    %s has no vendor/. Run composer install\n' "$red" "$off" "$API" >&2; exit 1; }
[ -e "$API/.env" ] || { printf '%sFAIL%s    %s has no .env\n' "$red" "$off" "$API" >&2; exit 1; }

# `timeout` is GNU coreutils; macOS has gtimeout at best. Without either the
# PDO timeout below still bounds the connect.
if command -v timeout >/dev/null; then limit() { timeout 60 "$@"; }
elif command -v gtimeout >/dev/null; then limit() { gtimeout 60 "$@"; }
else limit() { "$@"; }
fi

# Boots the app the way a request does, so the connection uses the same
# config, the same CA resolution and the same PDO options the API uses. The
# one addition is a connect timeout: an unreachable host otherwise hangs for
# minutes, and inside a deploy that reads as the deploy having hung.
# shellcheck disable=SC2016  # PHP source; the $ signs are PHP's
out="$(cd "$API" && limit php -r '
    require "vendor/autoload.php";
    $app = require "bootstrap/app.php";
    $app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
    $name = config("database.default");
    $options = config("database.connections.$name.options", []);
    $options[PDO::ATTR_TIMEOUT] = 10;
    config(["database.connections.$name.options" => $options]);
    $db = Illuminate\Support\Facades\DB::connection();
    // MySQL takes no placeholder in SHOW ... LIKE, and Laravel prepares on
    // the server, so "LIKE ?" is a syntax error. The name goes in quoted by
    // PDO instead, and only the two fixed names below can reach it.
    $status = function (string $name) use ($db): string {
        if (!in_array($name, ["Ssl_cipher", "Ssl_version"], true)) {
            throw new InvalidArgumentException("not a status this check reads: $name");
        }
        $row = $db->selectOne("SHOW SESSION STATUS LIKE " . $db->getPdo()->quote($name));
        return $row === null ? "" : (string) $row->Value;
    };
    try {
        $cipher = $status("Ssl_cipher");
        $version = $status("Ssl_version");
        echo $db->getConfig("host"), "\n", $cipher, "\n", $version, "\n";
    } catch (Throwable $e) {
        fwrite(STDERR, $e->getMessage() . "\n");
        exit(1);
    }
' 2>&1)" || {
    printf '%sFAIL%s    could not connect:\n' "$red" "$off" >&2
    printf '%s\n' "$out" | fold -s -w 88 | sed 's/^/          /' >&2
    printf '          "Access denied" here usually means MYSQL_ATTR_SSL_CA is missing or wrong, not the password.\n' >&2
    printf '          A timeout means the host or port is unreachable from here.\n' >&2
    exit 1
}

host="$(printf '%s\n' "$out" | sed -n 1p)"
cipher="$(printf '%s\n' "$out" | sed -n 2p)"
version="$(printf '%s\n' "$out" | sed -n 3p)"

if [ -z "$cipher" ]; then
    printf '%sFAIL%s    the session to %s is NOT encrypted (Ssl_cipher is empty)\n' "$red" "$off" "$host" >&2
    exit 1
fi

printf '%sok%s      the session to %s is encrypted: %s, %s\n' "$green" "$off" "$host" "$version" "$cipher"
