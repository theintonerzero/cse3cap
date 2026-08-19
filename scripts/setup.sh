#!/usr/bin/env bash
#
# Sets up a working copy of the Reflection Diary for development.
#
# Run from inside the repository, or via the bootstrap:
#
#   curl -fsSL https://dl.darkovski.dev/git/cse3cap/install.sh | bash
#
# Idempotent. Rerun it after pulling, or when api/ and web/ first appear.
#
# This never contains a password. It asks for the two it needs and writes
# them where they belong. If you are reading this because you are about
# to add one, do not.

set -euo pipefail

say()  { printf '\033[1;34m==>\033[0m %s\n' "$1"; }
ok()   { printf '\033[1;32m  ok\033[0m %s\n' "$1"; }
warn() { printf '\033[1;33m  !!\033[0m %s\n' "$1" >&2; }
die()  { printf '\033[1;31mError:\033[0m %s\n' "$1" >&2; exit 1; }

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
[ -f db/01-schema.sql ] || die "This does not look like the cse3cap repository."

DB_HOST_DEFAULT="rddb.darkovski.dev"
DB_NAME="reflection_diary"

# Piping the bootstrap into bash leaves stdin pointing at a consumed pipe,
# so every prompt has to read the real terminal instead.
#
# Opened rather than tested with -r. /dev/tty exists and looks readable
# even with no terminal attached, and the open is what fails, so -r let
# the script go on to print "Device not configured" three times per
# prompt before carrying on anyway.
if { : </dev/tty; } 2>/dev/null; then TTY=/dev/tty; else TTY=""; fi

# ---------------------------------------------------------------------------
# 1. Prerequisites
# ---------------------------------------------------------------------------
say "Checking prerequisites"

pkg_hint() {
    case "$(uname -s)" in
    Darwin) printf 'brew install %s' "$1" ;;
    Linux)
        if   command -v dnf     >/dev/null 2>&1; then printf 'sudo dnf install -y %s' "$2"
        elif command -v apt-get >/dev/null 2>&1; then printf 'sudo apt-get install -y %s' "$3"
        elif command -v pacman  >/dev/null 2>&1; then printf 'sudo pacman -S %s' "$1"
        else printf 'install %s with your package manager' "$1"
        fi ;;
    *) printf 'install %s' "$1" ;;
    esac
}

missing=0
need() {
    local bin="$1" brew="$2" dnf="$3" apt="$4"
    if command -v "$bin" >/dev/null 2>&1; then
        # sed -n 1p rather than head -1, for the same reason: head closes
        # the pipe early and pipefail turns that into a failure.
        ok "$bin $("$bin" --version 2>/dev/null | sed -n 1p | tr -d '\n' | cut -c1-40)"
    else
        warn "$bin is missing. Try: $(pkg_hint "$brew" "$dnf" "$apt")"
        missing=1
    fi
}

need git      git      git      git
need php      php      "php-cli php-mysqlnd php-mbstring php-xml php-intl php-sodium php-pecl-zip" \
                       "php-cli php-mysql php-mbstring php-xml php-intl php-zip"
need composer composer composer composer
need node     node     nodejs   nodejs
need npm      npm      npm      npm

# The schema needs 8.0.19+ features and Laravel 13 needs 8.3+, so anything
# below 8.3 fails later in a way that is hard to trace back to here.
if command -v php >/dev/null 2>&1; then
    if ! php -r 'exit(PHP_VERSION_ID >= 80300 ? 0 : 1);'; then
        warn "PHP $(php -r 'echo PHP_VERSION;') is too old. Laravel 13 needs 8.3 or newer, and we target 8.5."
        missing=1
    fi
    # Asked of PHP directly rather than by grepping `php -m`. This script
    # runs under `set -o pipefail`, and `grep -q` exits the moment it
    # matches, which SIGPIPEs php and makes the whole pipeline report
    # failure. The result was the extension being reported missing on a
    # machine where it was present and working, which is the worst kind of
    # check: it only lies when it should have passed.
    php -r 'exit(extension_loaded("pdo_mysql") ? 0 : 1);' \
        || { warn "The pdo_mysql extension is missing."; missing=1; }
fi

[ "$missing" -eq 0 ] || die "Install what is missing above, then rerun this script."

# ---------------------------------------------------------------------------
# 2. Credentials
# ---------------------------------------------------------------------------
# Two passwords, both from the team channel. diary_app is what Laravel
# connects as. diary_ro is read only and is what the MySQL MCP server uses
# so coding agents can read the schema without being able to change it.
say "Database credentials"

read_secret() {
    local prompt="$1" __var="$2" value=""
    if [ -z "$TTY" ]; then
        warn "No terminal available, skipping $prompt. Set it yourself later."
        return 1
    fi
    printf '\033[1;34m  ?\033[0m %s: ' "$prompt" > "$TTY"
    IFS= read -rs value < "$TTY" || true
    printf '\n' > "$TTY"
    [ -n "$value" ] || return 1
    printf -v "$__var" '%s' "$value"
}

APP_PW=""; RO_PW=""
read_secret "diary_app password (blank to skip)"  APP_PW || true
read_secret "diary_ro password (blank to skip)"   RO_PW  || true

# ---------------------------------------------------------------------------
# 3. Backend environment
# ---------------------------------------------------------------------------
say "Backend environment"

# Rewrite a whole line rather than substitute into it. A password can
# contain &, | and /, all of which mean something to sed, and escaping
# them correctly is harder than not needing to.
set_env() {
    local file="$1" key="$2" value="$3" tmp
    tmp="$(mktemp)"
    while IFS= read -r line || [ -n "$line" ]; do
        case "$line" in
        "$key"=*) printf '%s\n' "$key=$value" ;;
        *)        printf '%s\n' "$line" ;;
        esac
    done < "$file" > "$tmp"
    mv "$tmp" "$file"
    chmod 600 "$file"
}

if [ -d api ]; then
    if [ -f api/.env ]; then
        ok "api/.env already exists, leaving it alone"
    else
        cp .env.example api/.env
        chmod 600 api/.env

        if [ -n "$APP_PW" ]; then
            set_env api/.env DB_PASSWORD "$APP_PW"
            ok "wrote api/.env with the database password"
        else
            ok "wrote api/.env, but DB_PASSWORD is still blank"
        fi

        # One test database each. The suite runs migrate:fresh, so two
        # people sharing a name here would drop each other's schema
        # mid-run. Non-alphanumerics out: this becomes an identifier, and
        # the grant is on reflection_diary_test_%.
        who="$(id -un 2>/dev/null || echo dev)"
        who="$(printf '%s' "$who" | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9' '_')"
        set_env api/.env DB_TEST_DATABASE "reflection_diary_test_${who}"
        ok "test database is reflection_diary_test_${who}"
    fi

    if [ -f api/composer.json ]; then
        say "Installing PHP dependencies"
        (cd api && composer install --no-interaction)

        # After composer, because artisan needs the vendor tree. APP_KEY
        # is per developer and generated, never shared, so a copied .env
        # always arrives without one.
        if [ -f api/.env ] && grep -q '^APP_KEY=$' api/.env; then
            (cd api && php artisan key:generate --ansi >/dev/null) && ok "generated APP_KEY"
        fi
    fi
else
    warn "api/ does not exist yet. Rerun this script once the Laravel app lands."
fi

if [ -d web ]; then
    if [ ! -f web/.env ]; then
        printf 'VITE_API_BASE_URL=http://localhost:8000/api/v1\n' > web/.env
        ok "wrote web/.env"
    else
        ok "web/.env already exists"
    fi
    [ -f web/package.json ] && { say "Installing frontend dependencies"; (cd web && npm install); }
else
    warn "web/ does not exist yet. Rerun this script once the frontend lands."
fi

# ---------------------------------------------------------------------------
# 4. Claude Code
# ---------------------------------------------------------------------------
# .mcp.json defaults everything except the read only password, so this one
# export is the whole of the agent setup. Without it the MySQL MCP server
# fails to start and agents fall back to guessing from the schema file.
say "Claude Code"

if [ -n "$RO_PW" ]; then
    case "${SHELL##*/}" in
    zsh)  profile="$HOME/.zshrc" ;;
    bash) profile="$HOME/.bashrc" ;;
    fish) profile="$HOME/.config/fish/config.fish" ;;
    *)    profile="" ;;
    esac

    if [ -z "$profile" ]; then
        warn "Unrecognised shell ${SHELL##*/}. Export DB_READONLY_PASSWORD yourself."
    elif grep -q 'DB_READONLY_PASSWORD' "$profile" 2>/dev/null; then
        ok "DB_READONLY_PASSWORD already set in ${profile/#$HOME/\~}, leaving it alone"
    else
        mkdir -p "$(dirname "$profile")"
        if [ "${SHELL##*/}" = fish ]; then
            printf '\n# Reflection Diary read only db user, used by the MySQL MCP server\nset -gx DB_READONLY_PASSWORD %q\n' "$RO_PW" >> "$profile"
        else
            printf '\n# Reflection Diary read only db user, used by the MySQL MCP server\nexport DB_READONLY_PASSWORD=%q\n' "$RO_PW" >> "$profile"
        fi
        ok "added DB_READONLY_PASSWORD to ${profile/#$HOME/\~}"
        warn "That file now holds a password in plain text. Check its permissions."
    fi
else
    warn "No diary_ro password given. The MySQL MCP server will not start until you export DB_READONLY_PASSWORD."
fi

# ---------------------------------------------------------------------------
# 5. Verify
# ---------------------------------------------------------------------------
say "Verifying"

if command -v openssl >/dev/null 2>&1; then
    if echo | timeout 15 openssl s_client -connect "$DB_HOST_DEFAULT:3306" \
         -starttls mysql -verify_return_error -brief >/dev/null 2>&1; then
        ok "$DB_HOST_DEFAULT:3306 reachable, certificate verifies"
    else
        warn "Could not verify TLS to $DB_HOST_DEFAULT:3306. Check your network, then ask in the channel."
    fi
fi

# The server refuses unencrypted connections, and PDO does not negotiate
# TLS unless handed a CA file. Without it the failure reads "Access denied",
# which sends people hunting for a password problem that is not there.
if [ -n "$APP_PW" ] && command -v php >/dev/null 2>&1; then
    if APP_PW="$APP_PW" php -r '
        $o = [PDO::MYSQL_ATTR_SSL_CA => __DIR__."/db/letsencrypt-roots.pem"];
        try {
            $p = new PDO("mysql:host='"$DB_HOST_DEFAULT"';dbname='"$DB_NAME"'", "diary_app", getenv("APP_PW"), $o);
            $n = $p->query("SELECT COUNT(*) c FROM frameworks")->fetch()["c"];
            fwrite(STDERR, "frameworks=$n\n");
            exit(0);
        } catch (Throwable $e) { exit(1); }
    ' 2>/dev/null; then
        ok "connected to $DB_NAME as diary_app over TLS"
    else
        warn "Could not connect as diary_app. Wrong password, or MYSQL_ATTR_SSL_CA is not set."
    fi
fi

# ---------------------------------------------------------------------------
say "Done"
cat <<'NEXT'

  Next:
    - Open the repo in Claude Code and trust the folder when prompted.
      Restart it if you set DB_READONLY_PASSWORD just now, since .mcp.json
      reads the environment at startup.
    - Read CLAUDE.md. It is short and it is the rules.
    - Migrations are announced in the channel before they run. The database
      is shared, so a bad one takes out everyone.

NEXT
