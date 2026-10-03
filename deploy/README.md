# deploy/

Configuration for the demo on the VPS (CAP-26), kept here so a reviewer can read it in a
pull request rather than on a server they have no account on.

| File | What it is |
| --- | --- |
| `caddy/diary.caddyfile` | The site block: the frontend at `/`, `/api/*` to PHP-FPM |
| `php-fpm/diary.pool.conf` | The demo's own PHP-FPM pool, running as `diary` |

Neither is installed by `scripts/deploy.sh`. Both are copied onto the box by hand, by the
procedures in [`docs/Deployment.md`](../docs/Deployment.md). The Caddy file above all:
the same Caddy issues the certificate the shared MySQL serves (ADR #21), so a mistake in
it is an outage for everyone, and it is changed only by the six steps in that document.

The scripts that use them are `scripts/deploy.sh`, `scripts/rollback.sh` and
`scripts/check-db-tls.sh`. Their checks are tested by `scripts/deploy.test.py`. Why it is
built this way is ADR #45.
