# CAP-26: a demo instance on the VPS

**Date:** 2026-09-06
**Status:** Design agreed, three decisions deferred. Not ready for an implementation plan
until §9 is closed.
**Ticket:** CAP-26, Sprint 5, 8 points. Epic: Demo Data, Hardening and Release.

## What this is for

Something to point the client at that is not somebody's laptop. The acceptance criteria are
the built frontend and the API served over TLS from the VPS, the three seeded tokens working
against it, the mandatory-TLS MySQL connection holding in the deployed environment, a
documented rollback, and nothing secret in the repository or in the deploy config.

The board makes CAP-26 depend on CAP-21, the four-states audit. That dependency is real only
for the *contents* of the bundle. Every risk this ticket actually carries — TLS, the web
server, PHP-FPM, and a MySQL connection whose failure mode lies to you — is indifferent to
how many screens exist. Deferring the deploy until the frontend is finished concentrates all
of that risk in the last sprint, which is where deploy risk least belongs. So the first
deploy happens against what `web/` renders today, and later screens arrive as a redeploy.

## Decisions taken

**The demo runs on the existing VPS, same box as MySQL.** No second host to secure, no
second certificate, and the database is local. The application still connects to
`rddb.darkovski.dev` rather than `127.0.0.1`, because the certificate is issued for that
name and `verify_identity` fails against the loopback address.

**Frontend and API share one origin.** The static build is served at `/`, and `/api/*` is
routed to Laravel. `VITE_API_BASE_URL` becomes the relative `/api/v1`, so no hostname is
compiled into the bundle and the CORS preflight never happens. `api/config/cors.php` names a
single origin from `FRONTEND_URL`; under one origin that configuration stops being reachable
as a failure mode at all.

The rejected alternative was a split `diary` / `rdapi` pair of subdomains, which is closer to
how Alumable would really run this and which an aside in the 2026-08-11 API spec anticipated.
It is rejected for the demo because the API origin would be baked into the bundle at build
time, and every mistake in it surfaces as an opaque CORS error in front of the client. That
aside was a note in a spec rather than an ADR, so nothing is superseded; ADR #38 records the
choice.

**Deploys are triggered by hand, over SSH, and built on the box.** `scripts/deploy.sh`
connects, checks out a tag, builds, and flips a symlink. GitHub holds no deploy key and no
SSH secret, and the only secret involved never leaves the VPS.

Building on the box rather than shipping an artefact from a laptop was chosen so the build
depends on the repository rather than on one developer's toolchain — the same property
CAP-29 exists to verify. The cost is Node and PHP toolchains installed on the VPS.

**No containers for the application.** MySQL is already containerised on that box, but
wrapping Caddy and PHP-FPM in Compose introduces a container story the project does not
otherwise have, to prove something a symlink already proves.

## The box already runs Caddy, and that is a hazard

ADR #21 is load-bearing here and easy to miss. The certificate MySQL presents on
`rddb.darkovski.dev` — the one that lets `verify_identity` work, the one every teammate's
`MYSQL_ATTR_SSL_CA` validates against — **is issued by the Caddy instance already running on
that box.**

So the web server is not a greenfield choice. Caddy is present, it terminates TLS, and it
holds the certificate the shared database depends on. Two things follow.

First, TLS for the demo is nearly free: Caddy provisions and renews automatically, so there
is no certbot, no renewal timer, and no cron entry to forget.

Second, and more importantly: **a careless edit to the Caddy configuration can take the
shared database out for all five people.** This is the shared-database rule from CLAUDE.md
wearing an unfamiliar disguise — the same class of mistake as running a migration without
telling anyone, reached through a different file. Every change to that configuration is made
by editing a copy, validating it with `caddy validate`, reloading rather than restarting, and
confirming afterwards that the database certificate still verifies. The runbook treats this
as its first-class risk, not a footnote.

The 2026-08-11 API spec records that a commented Caddy block for `rdapi.darkovski.dev`
already exists on the box, "carrying a placeholder upstream that is wrong for Laravel and
needs revisiting when deployment happens". This ticket is that revisit. The block is
rewritten, not extended.

## Release layout

```
/var/www/diary/
  releases/
    2026-09-06-2ab8f24/        a full checkout, built
    2026-09-05-83875c5/        the previous one, kept for rollback
  shared/
    .env                       api/.env, mode 0600, the only secret on the box
    storage/                   Laravel storage/, outlives every deploy
  current -> releases/2026-09-06-2ab8f24
```

Within each release, `api/.env` and `api/storage` are symlinks into `shared/`.

The `storage` link is not tidiness. Evidence uploads land in `storage/app/private`
(`api/config/filesystems.php:35`), which under this layout sits *inside* the release
directory. Without the link, every deploy silently orphans every file a student uploaded,
and nothing fails loudly enough to notice.

A deploy builds the new release directory completely before anything points at it, then
flips `current` atomically. Caddy and PHP-FPM resolve through `current`, so the flip is the
cutover and there is no window in which the site is half-new. The last five releases are
kept; older ones are pruned.

**PHP-FPM must be reloaded after the flip, not merely Caddy.** OPcache caches resolved file
paths, so moving the symlink without reloading the pool serves the previous release
indefinitely, and the deploy appears to have done nothing.

Rollback is the same mechanism in reverse: point `current` at the previous release and
reload. It is one command, it does not rebuild, and it is fast enough to use during a demo.
The runbook states it as a command to run rather than a procedure to follow.

## Proving the MySQL TLS connection

This criterion exists because the failure lies. The server sets `require_secure_transport`
and both accounts carry `REQUIRE SSL`, and PDO does not negotiate TLS unless it is handed a
CA file. A missing or wrong `MYSQL_ATTR_SSL_CA` therefore surfaces as `Access denied` —
indistinguishable from a wrong password, and documented in three places in this repository
because it has already cost someone an hour.

"The application loaded" is not evidence. The positive proof is that `Ssl_cipher` is
non-empty on the application's own connection; empty means the session is in the clear.

That check belongs in `scripts/`, wired into `./run`, not typed into a terminal once. A check
only one person can run is a check the team does not have.

`MYSQL_ATTR_SSL_CA=../db/letsencrypt-roots.pem` needs no change for the deployed
environment. The path is relative to `api/`, the file is committed at `db/letsencrypt-roots.pem`,
and under the release layout it resolves inside each release directory exactly as it does on
a laptop.

## Secrets, and one trap

`shared/.env` is the only secret on the box: mode 0600, owned by the deploy user, outside
every release directory and outside git. `APP_KEY` is generated once into it and stays
stable across releases.

The deploy script asserts `APP_ENV=production` and `APP_DEBUG=false` before it flips.
Laravel's debug renderer prints stack traces containing database credentials, and on a public
host that is a credential leak rather than an inconvenience.

**The trap is `VITE_API_TOKEN`.** `web/src/api/client.ts:141` seeds the auth token from
`import.meta.env.VITE_API_TOKEN`, which exists so a screen can be built against the real API
before the app shell lands. Vite replaces that expression with a **string literal at build
time**. If the box's `web/.env` carries a seeded token when `npm run build` runs, a working
bearer token is compiled into a JavaScript file served to the public internet, and nothing
about the running site looks wrong.

The build therefore runs with `VITE_API_TOKEN` explicitly unset, and the script then greps
the built assets for a bearer-token shape and **aborts the deploy** if it matches. Avoiding
the mistake is not sufficient; the deploy fails closed on it.

`web/.env.production` is committed containing only `VITE_API_BASE_URL=/api/v1`. It holds no
secret, and it keeps the hostname out of the bundle.

## What lands in the repository

```
deploy/caddy/diary.caddyfile       the site block, reviewable in a pull request
deploy/php-fpm/diary.pool.conf     the dedicated pool
deploy/README.md                   a README beside the thing it describes
scripts/deploy.sh                  build, verify, flip, reload, prune
scripts/rollback.sh                flip back, reload
scripts/check-db-tls.sh            asserts Ssl_cipher is non-empty
docs/Deployment.md                 runbook, rollback, first-time provisioning
web/.env.production
```

Configuration lives in the repository rather than only on the box because nobody merges
their own pull request here. A reviewer can read a Caddy site block in a diff; they cannot
read a server they have no account on. It is also what CAP-29 and the report need.

`docs/Deployment.md` is added to the README documentation table. `deploy/README.md` is
permitted under the CLAUDE.md documentation rule, which allows a README next to what it
describes.

**ADR #38** records the decisions above that had a live alternative: one origin over split
subdomains, a deploy triggered by hand over one triggered by CI, and no containers for the
application. That the demo shares the box with MySQL is not among them — the ticket asks for
the VPS and there was no second host in contention. The highest existing record is #37.

## Testing and verification

Deployment cannot be unit tested, so the evidence is a scripted check that anyone can rerun.

- `scripts/check-db-tls.sh` asserts an encrypted database session, run against the deployed
  environment rather than a laptop.
- `scripts/smoke.sh` already walks the product over HTTP. It is pointed at the deployed base
  URL to prove the three seeded tokens work there, which is an acceptance criterion.
- The bundle grep for a leaked token is part of `deploy.sh` and fails the deploy.
- Rollback is exercised deliberately once, on the first deploy, rather than being written
  down and trusted. A rollback nobody has run is a paragraph, not a rollback.
- `caddy validate` runs before any reload, and the database certificate is re-verified after
  it.

Nothing here belongs in `api/tests/`; all of it is a script in `scripts/`, per CLAUDE.md.

## Out of scope

PDF export, which is CAP-17 and a package decision. Any screen work. A staging environment
distinct from the demo. Monitoring, alerting, log shipping and backups beyond what the box
already does for MySQL. Automatic deployment on merge, which was considered and rejected
above. Multi-tenancy and any second demo instance.

## Open decisions

Recorded rather than resolved. Each carries a default so the spec stays actionable, but the
first two are answered before an implementation plan is written.

**1. The hostname, and who creates the DNS record.** The demo needs a name. `darkovski.dev`
is Jesse's domain, so root on the box does not produce the record — someone else does, and
propagation is not instant. This is the only hard external dependency in the ticket and it
should be requested early, while the rest is built.
*Default if unanswered:* `diary.darkovski.dev`, requested from Jesse.

**2. Whether `./run deploy` exists.** `run` is the development task runner: `./run dev`,
`./run test`, `./run check`. Putting a production deploy on the same menu is a loaded gun
next to the coffee machine, and the failure is one mistyped word.
*Recommendation:* `scripts/deploy.sh`, invoked deliberately and by its full path, not wired
into `./run`. `./run` gets at most a `deploy` entry that prints the real command and exits.
*Default if unanswered:* the recommendation.

**3. PHP 8.5 and Node availability on the box.** Unverified. Ubuntu does not ship PHP 8.5,
so a third-party repository is likely needed. `api/composer.json` requires `^8.3`, so an
older 8.x is survivable and the demo does not have to match every developer's local version.
Node is needed because the build is `tsc -b && vite build`.
*Default if unanswered:* provision PHP 8.5 from `ppa:ondrej/php` or the equivalent; fall
back to the box's newest 8.3+ if that fights the existing Docker or Caddy installation, and
record the divergence in `docs/Deployment.md`.

## Risks

**The Caddy configuration is shared with the database certificate.** Covered above. It is
the single highest-consequence risk in this ticket, because the blast radius is every
teammate's environment rather than the demo.

**The demo shows an unfinished product.** On day one the site renders `test` and a component
gallery. That is a deliberate trade, and the URL should not be sent to the client until
there is a screen worth showing. The pipeline being proven early is the point; the audience
arrives later.

**Building on the box competes for its resources.** MySQL for five people runs there. A Vite
build is short but not free, and deploys should not happen during a demo or while someone is
running the test suite.
