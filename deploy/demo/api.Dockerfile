# The demo API (CAP-54, ADR #62): Laravel on PHP 8.5-FPM. Built on the box
# from the repository at one commit; nothing secret is copied in.
FROM php:8.5-fpm

COPY --from=mlocati/php-extension-installer /usr/bin/install-php-extensions /usr/local/bin/
RUN install-php-extensions pdo_mysql intl zip opcache
COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

WORKDIR /app/api
COPY api/composer.json api/composer.lock ./
RUN composer install --no-dev --no-interaction --no-progress --prefer-dist --no-scripts --no-autoloader
COPY api/ ./
RUN composer dump-autoload --no-dev --optimize --classmap-authoritative \
 && rm -f .env

# The CA bundle MYSQL_ATTR_SSL_CA names, relative to api/.
COPY db/letsencrypt-roots.pem /app/db/letsencrypt-roots.pem
# The reset builds personas.json here; the box has no PHP.
COPY scripts/demo-personas.php /app/scripts/demo-personas.php
COPY scripts/lib/token-for.php scripts/lib/demo-people.php /app/scripts/lib/

COPY deploy/demo/php-fpm-diary.conf /usr/local/etc/php-fpm.d/zz-diary.conf
COPY deploy/demo/api-entrypoint.sh /usr/local/bin/diary-api-entrypoint
RUN chmod 755 /usr/local/bin/diary-api-entrypoint

ENTRYPOINT ["diary-api-entrypoint"]
CMD ["php-fpm"]
