#!/usr/bin/env bash
#
# Reads the deploy host and reports what is actually there, so CAP-26 stops
# resting on inference. Run it before writing the implementation plan.
#
#   ./scripts/check-deploy-host.sh you@vps      from your laptop, over ssh
#   ./scripts/check-deploy-host.sh              on the box itself
#
# The design in docs/superpowers/specs/2026-09-06-demo-deployment-design.md
# assumes a Caddy instance already on the box, PHP new enough for Laravel,
# and a Node that can run a Vite build. Those came from reading ADR #21 and
# the 2026-08-11 API spec, not from looking at the machine. This looks.
#
# THIS SCRIPT ONLY READS. No file is written, no service is reloaded or
# restarted, no configuration is changed. That is not politeness: MySQL for
# five people runs on this box, and ADR #21 records that the certificate it
# serves is issued by the same Caddy instance we are inspecting. A careless
# write here takes out everyone's environment, which is the shared-database
# rule in CLAUDE.md reached through a different file.
#
# Some checks need root to read /etc. Without it they report "need root"
# and the script carries on rather than failing; rerun with sudo on the box
# for the full picture.
#
# Exit status is 1 only if something would actually block a deploy. A
# "decide" line is a question for the team, not a failure.

set -uo pipefail

TARGET="${1:-}"

# --------------------------------------------------------------------------
# Run remotely by piping this file into bash on the far side. Nothing is
# copied to the box and nothing is left behind. The remote invocation takes
# no argument, so it falls through to the local path below.
# --------------------------------------------------------------------------
if [ -n "$TARGET" ]; then
    printf 'Reading %s over ssh. Nothing is written.\n' "$TARGET"
    exec ssh -o BatchMode=yes "$TARGET" bash -s < "${BASH_SOURCE[0]}"
fi

if [ -t 1 ]; then
    bold=$'\033[1m'; dim=$'\033[2m'; red=$'\033[1;31m'; green=$'\033[1;32m'
    yellow=$'\033[1;33m'; blue=$'\033[1;34m'; off=$'\033[0m'
else
    bold=''; dim=''; red=''; green=''; yellow=''; blue=''; off=''
fi

blockers=0; decisions=0

say()    { printf '\n%s==>%s %s\n' "$blue" "$off" "$1"; }
ok()     { printf '  %sok%s      %s\n' "$green" "$off" "$1"; }
note()   { printf '  %snote%s    %s\n' "$dim" "$off" "$1"; }
decide() { printf '  %sdecide%s  %s\n' "$yellow" "$off" "$1"; decisions=$((decisions + 1)); }
block()  { printf '  %sblock%s   %s\n' "$red" "$off" "$1"; blockers=$((blockers + 1)); }
noroot() { printf '  %s?%s       %s %s(needs root)%s\n' "$yellow" "$off" "$1" "$dim" "$off"; }

have() { command -v "$1" >/dev/null 2>&1; }

# Compare dotted versions. `vge 8.3.2 8.3` is true.
vge() { [ "$(printf '%s\n%s\n' "$2" "$1" | sort -V | head -1)" = "$2" ]; }

# `timeout` is GNU coreutils. It is on the Linux box this script targets, but
# not on a macOS laptop, where running this to sanity-check the script itself
# is a reasonable thing to do. Without the fallback a missing binary reads as
# "the certificate could not be read", which points at the wrong problem.
if have timeout;      then limit() { timeout "$@"; }
elif have gtimeout;   then limit() { gtimeout "$@"; }
else                       limit() { shift; "$@"; }
fi

# --------------------------------------------------------------------------
say "The box"
# --------------------------------------------------------------------------
note "$(uname -srm)"
if [ -r /etc/os-release ]; then
    . /etc/os-release
    note "${PRETTY_NAME:-unknown distribution}"
fi
note "hostname $(hostname -f 2>/dev/null || hostname)"

# A Vite build is short but not free, and it shares this box with MySQL.
mem_mb="$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo 2>/dev/null || echo 0)"
[ "$mem_mb" -gt 0 ] && note "memory ${mem_mb} MB total, $(awk '/MemAvailable/ {print int($2/1024)}' /proc/meminfo) MB available"
if [ "$mem_mb" -gt 0 ] && [ "$mem_mb" -lt 1800 ]; then
    decide "under ~2 GB. A Vite build here may need swap, or build elsewhere"
fi
note "disk on /: $(df -h / | awk 'NR==2 {print $4" free of "$2}')"

# --------------------------------------------------------------------------
say "PHP"
# --------------------------------------------------------------------------
# api/composer.json requires ^8.3. The team runs 8.5 locally, but the demo
# does not have to match: 8.3 or 8.4 satisfies the constraint, and saying so
# here is cheaper than provisioning 8.5 from a third-party repo for no gain.
if have php; then
    php_v="$(php -r 'echo PHP_VERSION;' 2>/dev/null)"
    if vge "$php_v" 8.3; then
        ok "php $php_v, satisfies composer's ^8.3"
        vge "$php_v" 8.5 || decide "php $php_v is below the 8.5 in the stack table; fine for ^8.3, worth a line in the runbook"
    else
        block "php $php_v is below the ^8.3 api/composer.json requires"
    fi

    # pdo_mysql and openssl are the two that decide whether the mandatory-TLS
    # database connection can happen at all. The rest are ordinary Laravel.
    #
    # `php -m` is captured once rather than piped into `grep -q` per
    # extension. Under `set -o pipefail`, grep -q exits on the first match,
    # php takes SIGPIPE, and the pipeline reports 141 -- so an extension that
    # is present reads as missing, but only when it appears early enough in
    # the alphabetical output for php to still be writing. That fails for
    # curl and openssl and passes for xml, which is the least helpful
    # possible symptom.
    modules="$(php -m 2>/dev/null)"
    missing=''
    for ext in pdo_mysql openssl mbstring tokenizer xml curl; do
        grep -qix "$ext" <<< "$modules" || missing="$missing $ext"
    done
    if [ -n "$missing" ]; then
        block "php extensions missing:$missing"
    else
        ok "pdo_mysql, openssl, mbstring, tokenizer, xml, curl all present"
    fi
else
    block "no php on PATH. Needed to serve the API"
fi

if have php-fpm || ls /run/php/*.sock >/dev/null 2>&1 || systemctl list-units --type=service 2>/dev/null | grep -q php.*fpm; then
    fpm_units="$(systemctl list-units --type=service --all --no-legend 2>/dev/null | awk '/php.*fpm/ {print $1}' | tr '\n' ' ')"
    ok "php-fpm present${fpm_units:+: $fpm_units}"
    ls /run/php/*.sock >/dev/null 2>&1 && note "sockets: $(ls /run/php/*.sock | tr '\n' ' ')"
else
    decide "no php-fpm found. The design routes /api through a dedicated pool; it would need installing"
fi

have composer && ok "composer $(composer --version 2>/dev/null | awk '{print $3}')" \
    || decide "no composer on PATH. The deploy builds on the box, so it needs one"

# --------------------------------------------------------------------------
say "Node"
# --------------------------------------------------------------------------
# web/ builds with `tsc -b && vite build`. Vite 8 wants a current Node; an
# old one fails the build rather than producing a bad bundle, which is at
# least honest, but better to know now.
if have node; then
    node_v="$(node -v 2>/dev/null | tr -d v)"
    if vge "$node_v" 20.19; then
        ok "node $node_v, new enough for vite 8"
    else
        block "node $node_v is too old for vite 8 (wants >= 20.19)"
    fi
    have npm && note "npm $(npm -v 2>/dev/null)"
else
    decide "no node on PATH. The deploy builds the frontend on the box, so it needs one"
fi

# --------------------------------------------------------------------------
say "Caddy, and the certificate the database depends on"
# --------------------------------------------------------------------------
# The load-bearing assumption in the spec. ADR #21 says Caddy is already here
# and issues the Let's Encrypt certificate MySQL presents on
# rddb.darkovski.dev. If that is wrong, the design's whole web-server section
# is wrong and the plan must not be written yet.
if have caddy; then
    ok "caddy $(caddy version 2>/dev/null | head -1)"
    note "service: $(systemctl is-active caddy 2>/dev/null || echo 'not a systemd unit')"

    for cfg in /etc/caddy/Caddyfile /etc/caddy/caddy.json /usr/local/etc/caddy/Caddyfile; do
        [ -e "$cfg" ] || continue
        if [ -r "$cfg" ]; then
            ok "config at $cfg ($(wc -l < "$cfg") lines)"
            # The old API spec says a commented rdapi block is already in
            # there, "carrying a placeholder upstream that is wrong for
            # Laravel". This ticket rewrites it, so see it first.
            if grep -qiE 'rdapi|diary' "$cfg"; then
                note "it already mentions rdapi/diary:"
                grep -niE 'rdapi|diary' "$cfg" | sed 's/^/          /'
            else
                note "no rdapi or diary block present"
            fi
            note "site blocks currently defined:"
            grep -nE '^[^#[:space:]].*\{' "$cfg" | sed 's/^/          /' || true
        else
            noroot "config at $cfg is not readable"
        fi
    done
else
    decide "no caddy on PATH. ADR #21 says it is here and issues the database certificate; if that is stale the spec's web-server section needs rewriting"
fi

# Verify the ADR's claim directly rather than believing it. openssl speaks
# MySQL's TLS handshake, so this reads the certificate the database actually
# serves without authenticating or touching any data.
if have openssl; then
    cert="$(echo | limit 10 openssl s_client -starttls mysql \
            -connect rddb.darkovski.dev:3306 2>/dev/null \
          | openssl x509 -noout -issuer -subject -dates 2>/dev/null)"
    if [ -n "$cert" ]; then
        ok "the database serves a readable certificate:"
        printf '%s\n' "$cert" | sed 's/^/          /'
        if grep -qi "let's encrypt" <<< "$cert"; then
            ok "issued by Let's Encrypt, consistent with ADR #21"
        else
            decide "not a Let's Encrypt issuer. ADR #21 says Caddy issues this; check before touching any Caddy config"
        fi
    else
        decide "could not read the database certificate over :3306 from here"
    fi
fi

# --------------------------------------------------------------------------
say "What already holds the ports"
# --------------------------------------------------------------------------
# The demo needs 80 and 443. If something other than Caddy has them, the
# same-origin design has a conflict to resolve before anything is installed.
if have ss; then
    listeners="$(ss -lntp 2>/dev/null | awk 'NR>1 && ($4 ~ /:(80|443|3306)$/)')"
    if [ -n "$listeners" ]; then
        printf '%s\n' "$listeners" | sed 's/^/          /'
    else
        noroot "cannot see listener process names"
        ss -lnt 2>/dev/null | awk 'NR>1 && ($4 ~ /:(80|443|3306)$/)' | sed 's/^/          /'
    fi
else
    note "no ss available"
fi

have docker && {
    if docker ps --format '{{.Names}}  {{.Image}}  {{.Status}}' >/dev/null 2>&1; then
        note "docker containers running:"
        docker ps --format '{{.Names}}  {{.Image}}  {{.Status}}' | sed 's/^/          /'
    else
        noroot "docker is installed but not readable as this user"
    fi
}

# --------------------------------------------------------------------------
say "Where the releases would go"
# --------------------------------------------------------------------------
# The design puts releases under /var/www/diary with a `current` symlink and
# a shared/ holding .env and storage. Report what is there so the plan knows
# whether it is creating or colliding.
if [ -e /var/www/diary ]; then
    decide "/var/www/diary already exists; the plan must not assume it is empty"
    ls -la /var/www/diary 2>/dev/null | sed 's/^/          /'
elif [ -d /var/www ]; then
    ok "/var/www exists, /var/www/diary is free"
    note "currently in /var/www: $(ls /var/www 2>/dev/null | tr '\n' ' ')"
else
    note "/var/www does not exist; the deploy would create it"
fi

# --------------------------------------------------------------------------
printf '\n'
if [ "$blockers" -gt 0 ]; then
    printf '%s%s blocker(s)%s' "$red" "$blockers" "$off"
    [ "$decisions" -gt 0 ] && printf ', %s%s to decide%s' "$yellow" "$decisions" "$off"
    printf '\n%s\n' "Fix the blockers before writing the CAP-26 implementation plan."
    exit 1
fi

if [ "$decisions" -gt 0 ]; then
    printf '%s%s thing(s) to decide%s, nothing blocking.\n' "$yellow" "$decisions" "$off"
else
    printf '%sNothing blocking, nothing to decide.%s\n' "$green" "$off"
fi
printf 'Record what this printed in §9 of the CAP-26 design spec.\n'
exit 0
