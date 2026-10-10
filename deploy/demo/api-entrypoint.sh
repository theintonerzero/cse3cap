#!/bin/sh
# Starts the demo API (CAP-54). Storage is a named volume, so its tree is made
# here on every start, then the config is cached from this container's env.
set -eu
cd /app/api
for dir in storage/app/private storage/framework/cache storage/framework/sessions \
           storage/framework/views storage/logs bootstrap/cache; do
    mkdir -p "$dir"
done
chown -R www-data:www-data storage bootstrap/cache
php artisan config:cache --no-ansi >/dev/null
php artisan route:cache --no-ansi >/dev/null
exec "$@"
