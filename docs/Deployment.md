# Deployment

How the live demo at `https://diary.darkovski.dev` gets onto the VPS, stays current, comes
back off, and is reset. CAP-54, decision record [ADR #62](adr/architecture-decision-records.md),
design in [`superpowers/specs/2026-10-09-ai-sidecar-and-live-demo-design.md`](superpowers/specs/2026-10-09-ai-sidecar-and-live-demo-design.md).
The VPS is reached with `ssh accord`. It is the same machine as `rddb.darkovski.dev`, the
team's shared MySQL, so every step that writes on it is said in the team channel first.

## The live demo (CAP-54, ADR #62)

### What is on the box

The box already runs one Docker Compose project in `/home/ubuntu/server`: Caddy
(`server-caddy-1`), MySQL 9.7.2 (`mysql`) and two unrelated services, on a network called
`web` (`server_web` to Docker). The demo is a second compose project, `diary`, joined to that
network. Bringing it up or down never restarts MySQL or Caddy.

```
/home/ubuntu/diary/
  src/                        checkout of the public repository, at the deployed commit
  bin/deploy-demo.sh          the copy the timer runs (a deploy refreshes it)
  shared/api.env              Laravel's settings, mode 0600. Secret: APP_KEY, DB_PASSWORD
  shared/deploy.env           ntfy topic and publish token for deploy notices, mode 0600. Secret
  failed                      a commit that failed, which the timer will not retry
  shared/demo/personas.json   the picker's people, mode 0640, written by every reset
  deployed, previous          the running commit and the one before
  freeze                      while this exists, the timer deploys nothing
/home/ubuntu/server/
  diary-site.caddy            the public site block, a copy of deploy/demo/site.caddy
  diary-gate.caddy            the password hash and cookie secret, mode 0640, never in git
```

| Container | Image | Does |
| --- | --- | --- |
| `diary-api` | `diary-api:<sha>`, PHP 8.5-FPM | Laravel. Settings from `shared/api.env`, uploads in the `diary_storage` volume |
| `diary-web` | `diary-web:<sha>`, Caddy | The built bundle, `/demo/personas.json`, and `/api` and `/up` passed to `diary-api` |

The database is `reflection_diary_demo`, user `diary_demo_app`, granted on nothing else. It
is reached as `rddb.darkovski.dev`, because the certificate is issued for that name, and
inside `diary-api` that name is a link to the `mysql` container on `server_web`. Not the
Docker host gateway: the box's `iptables` INPUT chain accepts only 22, 80 and 443 and rejects
the rest, so from `server_web` the published 3306 is "No route to host". Visitors never touch
the team's `reflection_diary`.

### The gate

`server-caddy-1` serves `diary.darkovski.dev` from `diary-site.caddy`. Every path needs the
`diary_gate` cookie. Without it a page redirects to `/gate`, and `/api` answers 401 in the
diary's error envelope. `/gate` is the only path with a password (user `demo`); the right one
sets the cookie for 7 days and redirects to `/`. Behind the gate, the persona picker reads
its people from `/demo/personas.json` at runtime, so no token is in the build.

To change the password, or sign everyone out by changing the cookie secret, run
`scripts/demo-gate.sh` on the box and then the Caddy procedure below.

### Changing Caddy

The same Caddy issues the certificate MySQL serves (ADR #21). A broken configuration is an
outage for all five people, so this is done by a person, after a word in the team channel:

```bash
cd /home/ubuntu/server
cp -a Caddyfile "Caddyfile.bak.$(date -u +%Y%m%d-%H%M%S)"
# first time only:
install -m 644 /home/ubuntu/diary/src/deploy/demo/site.caddy diary-site.caddy
printf '\nimport /srv/server/diary-site.caddy\n' >> Caddyfile
docker exec server-caddy-1 caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
```

Only on `Valid configuration`: `docker exec server-caddy-1 caddy reload --config
/etc/caddy/Caddyfile --adapter caddyfile`. Then check the database certificate is untouched:
`openssl s_client -connect rddb.darkovski.dev:3306 -starttls mysql </dev/null 2>/dev/null |
openssl x509 -noout -subject -enddate`. If validate fails, put the backup back and reload
nothing. No deploy script ever runs any of this.

### Deploys

`diary-deploy.timer` runs `bin/deploy-demo.sh --if-changed dev` every 5 minutes. When `dev`
has moved it fetches the commit, builds both images, runs `php artisan migrate` against
`reflection_diary_demo` (it refuses any database whose name does not end in `_demo`), starts
them and checks `/up`. The result goes to ntfy. A failed build or migration changes nothing
that is running.

A commit that fails (build, migration or health check) is written to `failed`, and the timer
does not retry it: retrying would take the demo down for a minute and re-run its migration
every 5 minutes. The timer waits for the next commit on `dev`, or a person deploys it by hand.

For a presentation, `touch /home/ubuntu/diary/freeze` and remove it afterwards. To pin a
commit by hand: `/home/ubuntu/diary/bin/deploy-demo.sh <sha|tag|branch>`. **A deploy by hand
creates `freeze` itself**, so the timer does not put `dev` back 5 minutes later; `rm
/home/ubuntu/diary/freeze` to follow `dev` again. If a deploy or reset is already running, a
deploy by hand says so and changes nothing.

### Rolling back

Automatic: a deploy whose `/up` fails puts the previous images back and says so on ntfy. By
hand: `/home/ubuntu/diary/bin/deploy-demo.sh $(cat /home/ubuntu/diary/previous)`, which freezes
the timer like any deploy by hand. A rollback restores code, not schema. If the bad commit migrated the demo database, follow it with a
reset.

### Resetting the demo

`/home/ubuntu/diary/src/scripts/demo-reset.sh` reseeds `reflection_diary_demo` from scratch,
issues tokens to the demo people the seeder skips (Noor, Priya, Tom), and rewrites
`personas.json`. Everyone signed in is signed out and must reload. It refuses any database
whose name does not end in `_demo`.

### Checking it from outside

`scripts/smoke-demo.sh` from a laptop. It never signs in: it checks the redirect to `/gate`,
the 401 on the API, that `/gate` asks for the password and sets no cookie without it, and
HSTS.

### When it goes wrong

| Symptom | Look at |
| --- | --- |
| The demo is down | `docker compose -p diary ps`, `docker logs diary-diary-api-1`, then `journalctl -u diary-deploy -n 50` |
| It stopped following `dev` | `systemctl list-timers diary-deploy.timer`, the `freeze` file, and the last ntfy notice |
| `Access denied` from the database | TLS before the password, as on a laptop: `MYSQL_ATTR_SSL_CA=../db/letsencrypt-roots.pem` in `shared/api.env` |
| The picker says the demo may have been reset | It was. Reload the page |

## Superseded: the host layout (CAP-26, ADR #45)

ADR #62 replaced what follows. It describes a host install (Caddy at `/etc/caddy`, PHP-FPM
and Node on the host, a `diary` user) that the box does not have: Caddy and MySQL run in
Docker there. It is kept, with its files (`deploy/caddy`, `deploy/php-fpm`,
`scripts/deploy.sh`, `scripts/rollback.sh`), until CAP-26's owner and the team decide what
happens to them.

How the demo gets onto the VPS, how it comes back off, and how to change the one file on
that box that can take out everyone's database. CAP-26. Design:
[`superpowers/specs/2026-09-06-demo-deployment-design.md`](superpowers/specs/2026-09-06-demo-deployment-design.md).
Decision record: [ADR #45](adr/architecture-decision-records.md).

**Status, 2026-09-30: built, not yet run.** Nobody on the team has a working shell on the
box (spec §9.4). Everything here is written to be run by whoever does. Until the first
deploy has happened and been rolled back once, treat this document as a procedure that has
been reviewed, not one that has been proved.

### What is on the box

```
/var/www/diary/
  releases/
    2026-10-02-091500-2ab8f24/   a full release, built on the box
    2026-10-01-164210-83875c5/   the previous one, kept for rollback
  shared/
    .env                         api/.env, mode 0600. The only secret on the box
    deploy.conf                  box settings for the scripts. Not secret
    storage/                     Laravel's storage/. Outlives every deploy
  current -> releases/2026-10-02-091500-2ab8f24
```

Each release's `api/.env` and `api/storage` are symlinks into `shared/`. The `storage` link
is what keeps evidence uploads (`storage/app/private`) alive across deploys. Release names
start with the UTC time of the deploy and end with the commit.

| In the repository | Installed on the box as |
| --- | --- |
| `deploy/caddy/diary.caddyfile` | `/etc/caddy/diary.caddyfile`, imported by `/etc/caddy/Caddyfile` |
| `deploy/php-fpm/diary.pool.conf` | `/etc/php/8.5/fpm/pool.d/diary.conf` |
| `scripts/deploy.sh`, `scripts/rollback.sh` | nothing. Each release carries its own copy |

### The one real risk: Caddy also serves the database certificate

ADR #21: the certificate MySQL presents on `rddb.darkovski.dev`, the one every teammate's
`MYSQL_ATTR_SSL_CA` validates against, is issued by the **same Caddy** that will serve the
demo. A broken Caddy configuration is an outage for all five people, not for the demo.

So `scripts/deploy.sh` never touches Caddy, and nothing else does either except this
procedure, run by a person:

1. Say in the team channel that you are about to change Caddy on the database box.
2. Back up: `sudo cp -a /etc/caddy/Caddyfile /etc/caddy/Caddyfile.bak-$(date -u +%F)`, and
   the same for `/etc/caddy/diary.caddyfile` if it exists.
3. Copy the site block from your checkout of the tag you are deploying (the box has no
   checkout, and before the first deploy it has no release either):
   `scp deploy/caddy/diary.caddyfile you@rddb.darkovski.dev:/tmp/diary.caddyfile`, then on
   the box `sudo install -m 644 /tmp/diary.caddyfile /etc/caddy/diary.caddyfile`.
4. Validate the **whole** configuration, not just the block:
   `sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile`.
   If it fails, restore the backup. Stop.
5. `sudo systemctl reload caddy`. **Reload, never restart.** A reload that fails leaves the
   running configuration serving, untouched. A restart that fails leaves Caddy down, and
   with it the certificate the database presents to everyone.
6. Prove the database certificate still verifies, from your laptop:
   `./run db-tls`. It must print `ok ... the session to rddb.darkovski.dev is encrypted`.
   If it does not, restore the backup, validate, reload, and run it again.

Undoing it is the same six steps with the backup as the source.

### First-time setup

Done once, by someone with sudo on the box, **in this order, all six steps before the first
deploy.** A deploy checks the live site through Caddy and the pool, and the first one has no
earlier release to fall back to. Read the box first, which writes nothing:

```bash
./run check-host you@rddb.darkovski.dev
```

Anything it reports as `block` stops here. Anything reported as `decide` goes to the team.

#### 1. The user

The demo runs as its own user, `diary`, and deploys log in as it. Put the deployer's public
key in its `authorized_keys`.

```bash
sudo adduser --disabled-password --gecos "Reflection Diary demo" diary
sudo install -d -m 700 -o diary -g diary /home/diary/.ssh
sudo tee -a /home/diary/.ssh/authorized_keys < deployer.pub
sudo chown diary:diary /home/diary/.ssh/authorized_keys && sudo chmod 600 /home/diary/.ssh/authorized_keys
```

It may reload PHP-FPM and nothing else. `sudo visudo -f /etc/sudoers.d/diary`:

```
diary ALL=(root) NOPASSWD: /usr/bin/systemctl reload php8.5-fpm
```

#### 2. Toolchains

PHP 8.5 with FPM and the extensions CI uses (`pdo_mysql`, `mbstring`, `xml`, `intl`, `zip`,
`sodium`), Composer, and Node 20.19 or newer with npm (the build is `tsc -b && vite build`).
Ubuntu does not ship PHP 8.5, so it likely comes from `ppa:ondrej/php`. `api/composer.json`
accepts `^8.3`, so if 8.5 fights the existing Docker or Caddy installation, use the newest
8.3+ the box has, change `8.5` everywhere in this document and in `deploy.conf`, and write
the difference here.

#### 3. The directories and the secret

```bash
sudo install -d -m 755 -o diary -g diary /var/www/diary /var/www/diary/releases /var/www/diary/shared
sudo -iu diary
```

As `diary`, write `/var/www/diary/shared/.env` from the repository root's `.env.example`,
changing these:

```
APP_ENV=production
APP_DEBUG=false
APP_URL=https://diary.darkovski.dev
APP_KEY=            # php -r 'echo "base64:".base64_encode(random_bytes(32)), PHP_EOL;'
DB_PASSWORD=        # diary_app's, from the team channel
FRONTEND_URL=https://diary.darkovski.dev
LOG_LEVEL=warning
```

Leave out `DB_READONLY_PASSWORD`, `DB_TEST_DATABASE` and every `VITE_` line. `APP_KEY` is
generated once, here, and kept across every release. Then:

```bash
chmod 600 /var/www/diary/shared/.env
```

**The database is on this same box,** reached by `DB_HOST=rddb.darkovski.dev`, the box's own
public name. A cloud VPS often cannot reach its own public address. Keep the name (the
certificate is issued for it, so `127.0.0.1` fails verification) and, if
`scripts/check-db-tls.sh` cannot connect from the box, add `127.0.0.1 rddb.darkovski.dev` to
`/etc/hosts`.

`scripts/deploy.sh` refuses to deploy against this file if `APP_DEBUG` is anything but
`false`, `APP_ENV` is not `production`, it is readable by anyone else, or it has a
`VITE_API_TOKEN` line. `scripts/deploy.test.py` lists every rule.

Box settings the scripts read, in `/var/www/diary/shared/deploy.conf` (only if they differ
from these defaults):

```bash
DIARY_URL="https://diary.darkovski.dev"
PHP_FPM_RELOAD="sudo -n systemctl reload php8.5-fpm"
```

#### 4. The PHP-FPM pool

From your checkout, since the box has none:

```bash
scp deploy/php-fpm/diary.pool.conf you@rddb.darkovski.dev:/tmp/diary.pool.conf
```

Then on the box:

```bash
sudo install -m 644 /tmp/diary.pool.conf /etc/php/8.5/fpm/pool.d/diary.conf
sudo php-fpm8.5 -t
sudo systemctl reload php8.5-fpm
ls -l /run/php/diary-fpm.sock     # owner diary, group caddy, srw-rw----
```

#### 5. DNS

`diary.darkovski.dev` must resolve to the box. It did on 2026-09-30 (`207.211.146.230`, the
same address as `rddb`), which answers spec §9.1, but confirm with Jesse that the record is
meant to stay.

#### 6. Caddy

Run [the Caddy procedure](#the-one-real-risk-caddy-also-serves-the-database-certificate)
once, and in step 3 also do this in `/etc/caddy/Caddyfile`:

- **delete** the old commented `rdapi.darkovski.dev` block. Its upstream was a placeholder
  that is wrong for Laravel, and the spec says it is rewritten, not extended;
- add one line: `import /etc/caddy/diary.caddyfile`.

The first deploy has to have run before the site answers. Until then Caddy serves a 404 for
`diary.darkovski.dev`, which is harmless.

### Deploying

Deploys are of tags, and the tag has to be on origin. Tag a commit that is on `main`:

```bash
git switch main && git pull
git tag -a demo-2026-10-02 -m "Demo: what changed"
git push origin demo-2026-10-02
scripts/deploy.sh diary@rddb.darkovski.dev demo-2026-10-02
```

There is no `./run deploy`, on purpose (spec §9.2). Typing the script's path is the
confirmation.

Don't deploy during a demo, or while anyone is running the test suite: the build shares the
box with everyone's MySQL for a few minutes.

What it does, and where it stops. Nothing public changes before step 7.

1. Checks the tag is on origin at the same commit as yours.
2. Sends it with `git archive` over ssh into a new release directory.
3. Checks `shared/.env` (above).
4. Links `api/.env` and `api/storage` into `shared/`, then `composer install --no-dev` and
   `php artisan optimize`. The cached `bootstrap/cache/config.php` holds `DB_PASSWORD` and
   `APP_KEY` in plaintext, so it is made mode `600` (the pool runs as its owner).
5. Builds the frontend with `VITE_API_TOKEN` unset, then fails if the bundle holds anything
   shaped like a token or the value of `APP_KEY` or `DB_PASSWORD`.
6. Runs `scripts/check-db-tls.sh` against the new release, and `php artisan migrate:status`.
   **A pending migration stops the deploy.** Migrations on the shared database are announced
   and run by a person (CLAUDE.md). Run it, then deploy again.
7. Switches `current` with `scripts/rollback.sh --to <release>` and reloads PHP-FPM.
8. Checks the site through the box's own Caddy: `/` answers 200 and `/api/v1/auth/me`
   answers 401 in the error envelope, which proves Laravel is behind `/api`.
   **If the switch, the reload or this check fails, it switches back to the previous
   release, deletes the new one** (so a rollback can never land on it) and exits non-zero.
9. Deletes all but the newest five releases, never the new one or the one it replaced.

A failure before step 7 deletes the half-built release and leaves the live site alone. One
deploy or rollback runs at a time: a second one is refused while the first holds the lock.

### Rolling back

```bash
scripts/rollback.sh diary@rddb.darkovski.dev                        # to the release before current
scripts/rollback.sh diary@rddb.darkovski.dev --list                 # what is there
scripts/rollback.sh diary@rddb.darkovski.dev --to <release-name>    # a named one
```

It switches `current` and reloads PHP-FPM. It does not rebuild, so it takes seconds. It does
not touch the database: if the release you roll away from needed a migration, the schema
stays migrated, and the older code has to cope with it. On this project, where migrations
are rare and additive, it will. Check before relying on it.

### Proving it: the first deploy

CAP-26 is done when each of these has been seen, not before. Paste the output into the
ticket.

- [ ] `./run check-host` read the box, and §9.3 of the spec (PHP, Node) is answered.
- [ ] The Caddy procedure ran, and `./run db-tls` passed **after** the reload.
- [ ] `scripts/deploy.sh` ran to `Deployed ...` from a tag on `main`.
- [ ] On the box, `scripts/check-db-tls.sh /var/www/diary/current/api` prints a cipher.
- [ ] `BASE=https://diary.darkovski.dev/api/v1 ./scripts/smoke.sh` passes with the three
      seeded tokens. It writes to the shared database, as it does locally.
- [ ] The app loads at `https://diary.darkovski.dev`, a token pasted into the shell signs
      in, and a deep link such as `/review-queue` survives a reload.
- [ ] **Rollback, once, on purpose:** deploy a second tag, run `scripts/rollback.sh`, see
      the previous release served, then deploy forward again. A rollback nobody has run is a
      paragraph, not a rollback.
- [ ] `curl -sI https://diary.darkovski.dev/` shows `Strict-Transport-Security` and
      `Cache-Control: no-cache`.
- [ ] Nothing secret in the repository:
      `git grep -nE '^[[:space:]]*DB_PASSWORD=[^[:space:]]' -- ':!*.example' ':!scripts/deploy.test.py'`
      is empty (the test file's password is a fixture), and on the box
      `ls -l /var/www/diary/current/api/bootstrap/cache/config.php` shows `-rw-------`.

### When it goes wrong

| Symptom | Likely cause |
| --- | --- |
| Every `/api` request is 502 | The pool is down or Caddy cannot open its socket. `systemctl status php8.5-fpm`, and check the socket is group `caddy` with mode `0660` |
| `Access denied` from the database | Almost never the password. `MYSQL_ATTR_SSL_CA` is missing or wrong, so PDO never negotiated TLS. `scripts/check-db-tls.sh` says which |
| The deploy says it worked and the old version is served | PHP-FPM was not reloaded, so OPcache still has the old paths. `sudo systemctl reload php8.5-fpm` |
| Evidence uploads vanished after a deploy | `api/storage` in the release is a directory, not the link into `shared/`. The deploy makes the link, so something replaced it |
| `./run db-tls` fails after a Caddy change | The Caddy change broke the database certificate. Restore the backup, validate, reload, now |
| The deploy stops on pending migrations | Working as intended. Announce it, run the migration, deploy again |

### What this does not do

No monitoring, alerting or log shipping. Laravel logs to `shared/storage/logs`, Caddy to
`/var/log/caddy/diary.log`. No backups beyond whatever the box already does for MySQL.
Uploaded files in `shared/storage` are not backed up by anything. No
Content-Security-Policy header yet: one worth having needs checking against every screen
first, and a wrong one breaks the demo quietly. No staging environment and no second demo.
