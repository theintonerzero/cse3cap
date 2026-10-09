# Runbook

How to start the Reflection Diary, where its data lives, how to reseed the demo, and how to
issue a token. Written for someone taking the system over who has not met the team (CAP-30).
Every command runs from the repository root unless it says otherwise.

The reasoning behind each choice lives elsewhere and is linked rather than repeated:
`README.md` for setup in full, `docs/Frontend-and-Backend.md` for how the two halves fit,
`docs/adr/architecture-decision-records.md` for why.

## What is running where

| Part | Where | Reached at |
| --- | --- | --- |
| API | Laravel 13 on PHP 8.5, `api/` | `http://localhost:8000/api/v1` locally |
| Frontend | React 19 and Vite, `web/` | `http://localhost:5173` locally |
| Database | MySQL 9.7 LTS on a shared VPS | `rddb.darkovski.dev:3306`, database `reflection_diary` |

There is no deployed instance yet. The deploy kit is built (#88, ADR #45) and its deploy and
rollback steps are in `docs/Deployment.md`, but it has not been run, because it needs a shell
on the VPS (CAP-26).

## Start it

First time on a machine:

```bash
./run setup          # writes api/.env and web/.env, installs dependencies, asks for two passwords
```

The two passwords are the database's, and they are handed over out of band (see
[Credentials](#credentials)). Nothing else in `.env.example` is secret.

Every time after:

```bash
./run dev            # API on :8000 and web on :5173. Ctrl-C stops both
```

Or one half at a time with `./run api` and `./run web`. Windows: `./run.ps1` takes the
everyday commands (dev, api, web, test, check, setup). `smoke`, `verify`, `e2e`, `deps`,
`jira` and the per-screen `verify-*` checks need bash.

**Check it is up:**

```bash
./run smoke          # walks the product over HTTP with the three seeded tokens
```

`scripts/smoke.sh` needs the API running and the three tokens, either as `JANE`, `SAM` and
`LEE` in the environment or in `~/reflection-diary-tokens.txt` (the seeder's output saved
as printed, one `Name token` line each; `TOKENS=` points elsewhere). It
writes a reflection as Jane, so read [the smoke trap](#the-smoke-trap) before running it on
a database a demo depends on.

**Without a backend at all**, the frontend runs against a mock built from the contract:

```bash
./run mock           # prism on :4010; point VITE_API_BASE_URL at it
```

## Run the demo on your laptop

Anyone on the team can run the full client demo (`docs/Demo-Script.md`) on their own laptop,
against the shared database:

```bash
./run demo           # Windows: ./run.ps1 demo
```

It checks two things, then starts both servers exactly as `./run dev` does:

1. **The shared database answers** on the host and port in `api/.env`. If it doesn't, it
   stops and says so: venue and campus wifi often block port 3306, so switch to a phone
   hotspot and run it again. If it still fails, present the recorded video.
2. **The demo sign-in's people.** It reads the team's tokens file,
   `~/reflection-diary-tokens.txt` (on Windows `%USERPROFILE%\reflection-diary-tokens.txt`;
   `TOKENS=` points elsewhere), and writes Jane N, Noor A, Sam O and Dr Lee (and Priya R and
   Tom H if their lines are there) into `web/.env.development.local`. That file is git-ignored
   and read only by the dev server, never by a production build (F15). It keeps any other line
   in that file, and prints who it found, never a token.

**Getting the tokens file.** It is the seeder's output saved as printed, one `Name token`
line per person, plus Noor's from [Issue a token](#issue-a-token). Tony holds the current
one and sends it to each presenter directly, never in a channel, a commit or a pull request.
Save it at the path above and keep it to yourself. Without it the demo still starts, and the
sign-in asks you to paste a token instead.

First time on the laptop, run `./run setup` before this: the demo needs `api/.env` and the
dependencies it installs. Then open `http://localhost:5173`; Ctrl-C stops both servers.

## The live demo

`https://diary.darkovski.dev`, behind a shared demo password (user `demo`; ask Jesse). Behind
it is the same one-click picker as on a laptop, on its own database, `reflection_diary_demo`,
so nothing done there reaches the team's `reflection_diary`. It follows `dev` by itself
within about 5 minutes of a merge. How it is built and changed: [`Deployment.md`](Deployment.md).
All of these run on the box, reached with `ssh accord`.

| To | Run |
| --- | --- |
| Hold it still for a presentation | `touch /home/ubuntu/diary/freeze`, and `rm` it afterwards |
| Start the data again | `/home/ubuntu/diary/src/scripts/demo-reset.sh`. Everyone signed in reloads |
| Go back to the commit before | `/home/ubuntu/diary/bin/deploy-demo.sh $(cat /home/ubuntu/diary/previous)`. This freezes the timer; `rm /home/ubuntu/diary/freeze` to follow `dev` again |
| See why it is down | `docker compose -p diary ps`, then `journalctl -u diary-deploy -n 50` |
| Change the password or sign everyone out | `/home/ubuntu/diary/src/scripts/demo-gate.sh`, then "Changing Caddy" in Deployment.md |
| Check it from outside | `scripts/smoke-demo.sh` from a laptop |

## Stop it

Ctrl-C in the terminal running `./run dev`. It stops both servers; if a port is still held
afterwards, `lsof -i :8000` and `lsof -i :5173` name the process.

## The database

MySQL runs on a VPS shared by everyone working on the project, not on each machine.

| | |
| --- | --- |
| Host | `rddb.darkovski.dev`, port 3306 |
| Database | `reflection_diary` |
| Accounts | `diary_app` for the application, `diary_ro` read-only |
| Test databases | `reflection_diary_test_<username>`, one per person. `diary_app` has DDL there only |
| TLS | Required. `MYSQL_ATTR_SSL_CA` points at the committed `db/letsencrypt-roots.pem` |

Three things that are not obvious:

- **A missing CA looks like a wrong password.** Without `MYSQL_ATTR_SSL_CA`, PDO connects in
  the clear and the server answers `Access denied`. Check the CA before the password.
- **Port 3306 is blocked on some networks**, and then every request and the test suite
  hang rather than fail. `nc -z rddb.darkovski.dev 3306` separates "the network" from "the
  credentials".
- **Caddy on the VPS issues the database's certificate.** Editing Caddy's configuration
  there can take the database down for everyone (ADR #21). Read before you write.

The schema is `db/01-schema.sql`. Migrations are applied centrally: announce in the team
channel before running `php artisan migrate` against `reflection_diary`, because a bad one
breaks every environment at once. The test suite refuses to run against
`reflection_diary` at all.

## Reseed the demo

```bash
cd api && php artisan db:seed
```

That runs `DemoSeeder` (the three users, two gigs, their sprints and rubrics, and the
tokens) and then `ReflectionSeeder` (three classmates and nine reflections, built through
the real services rather than inserted). Both are idempotent: running it twice changes
nothing, and existing rows are left alone rather than reset. ADR #37 says why there are
two.

It writes to the shared database, so say so in the channel first. Seeded users, gigs and
frameworks are fixed reference data; to experiment, create new rows rather than editing
them.

### The smoke trap

Seeding is idempotent per student and per sprint, so a sprint that already holds a
reflection is skipped. `./run smoke` writes a reflection as Jane on the La Trobe gig each
time it runs, so after three runs all three of her sprints are full and a reseed quietly
leaves the demo showing smoke's placeholder text instead of her written narratives. Check
before seeding:

```sql
SELECT g.title, s.ordinal, r.status FROM reflections r
  JOIN gigs g ON g.id = r.gig_id JOIN sprints s ON s.id = r.sprint_id
  JOIN users u ON u.id = r.user_id WHERE u.display_name = 'Jane N';
```

Delete Jane's smoke reflections first if they are in the way. Entries, scores, evidence and
events cascade with the reflection row. `reflections.user_id` is `ON DELETE RESTRICT`, so a
user cannot be deleted out from under their record (`docs/Retention-and-Erasure.md`).

Smoke copies La Trobe as Dr Lee and renames the copy "Renamed by smoke test"
(`scripts/smoke.sh`). Since CAP-50 it deletes that copy again at the end of the framework
section, so a run that reaches it leaves no framework behind. Runs from before CAP-50, and a
run that stops partway, left theirs. They are never assigned or scored against, so they are
harmless, but they pile up in the framework list. To clear them, announced first:

```sql
DELETE FROM frameworks WHERE name = 'Renamed by smoke test';
```

Competencies and levels cascade. A copy that a gig or a reflection references cannot be
deleted (no cascade on those keys), so the statement refuses rather than damaging anything.

## Issue a token

There is no login screen (ADR #15). Access is a Sanctum bearer token per user, sent as
`Authorization: Bearer <token>`, and pasted into the app's token screen.

| Seeded user | Role | On |
| --- | --- | --- |
| Jane N | Student | both gigs |
| Sam O | Assessor | the La Trobe gig only |
| Dr Lee | Supervisor | both gigs |
| Noor A | Student | the La Trobe gig. No token from the seeder: issue one below |

**For the seeded users,** `php artisan db:seed --class=DemoSeeder` prints a token for each
of the three who does not already have one (`api/database/seeders/DemoSeeder.php`). It
prints it once: Sanctum stores only a hash, so a lost token cannot be recovered, only
replaced.

**To replace one,** delete the user's row in `personal_access_tokens` and run the
`DemoSeeder` again. Deleting the row is also how a token is revoked.

**For any other user,** issue one from Tinker. The demo script uses Noor A, because Jane's
sprints are all full and Noor still has empty ones (`docs/Demo-Script.md`). Name it `demo`
and give it the same 60 days as the seeded three (ADR #46), so it expires with them and the
reissue below deletes it too:

```bash
cd api && php artisan tinker --execute 'echo App\Models\User::where("display_name","Noor A")->firstOrFail()->createToken("demo", ["*"], now()->addDays(Database\Seeders\DemoSeeder::TOKEN_LIFETIME_DAYS))->plainTextToken;'
```

Swap `Noor A` for `Priya R` or `Tom H` when Noor has no empty sprint left. A token issued
without an expiry never expires, which is the gap ADR #46 closed for the seeded three.

What the token can do comes from that user's rows in `gig_participants`, resolved per gig
on the server (`api/app/Services/RoleResolver.php`). The token itself carries no role.

**Seeded tokens expire 60 days after they are issued** (`DemoSeeder::TOKEN_LIFETIME_DAYS`,
ADR #46). All three are issued together, so they expire together. That looks like everyone
being signed out at once, which is the cue to reissue, not an outage. See when the current
ones end:

```bash
cd api && php artisan tinker --execute 'echo Laravel\Sanctum\PersonalAccessToken::where("name","demo")->min("expires_at");'
```

Tokens issued since ADR #46 start `<id>|rdiary_`, so a leaked one is recognised by secret
scanning. They carry every ability on purpose: what a token can do is decided by the
policies, never by the token. A token from before ADR #46 has no prefix and no expiry until
it is reissued.

**To reissue the three, announced first** (everyone pastes new ones afterwards):

```bash
cd api && php artisan tinker --execute 'Laravel\Sanctum\PersonalAccessToken::where("name","demo")->delete();'
php artisan db:seed --class=DemoSeeder        # prints the three new tokens, once
```

## Credentials

Never in the repository, and never in a chat log that outlives the project. `./run
bundle-secrets` fails a production build that carries a token (F1 in
`docs/Security-Review.md`).

What has to be handed over, and to whom, is in SMD 13.7 of the handover report, not here,
because this file is public.

## Handing over

What a new owner needs that is not obvious from the code. Facts are as of 3 October 2026.

### Who holds what

| Asset | Where | Held by |
| --- | --- | --- |
| Source code | GitHub, `theintonerzero/cse3cap` | A team member's personal GitHub account |
| Database and VPS | `rddb.darkovski.dev`, an Oracle Cloud VPS (`.env.example`) | The team member who owns `darkovski.dev` |
| Installer | `dl.darkovski.dev` (README, Quick setup) | The same domain |
| Ticket history | Jira project COA4 on `latrobecomsci.atlassian.net` | La Trobe University. Not reachable from outside it |

Every row is on a team member's or the university's account, not Alumable's. The intellectual
property in the delivered solution is assigned to Alumable (README, Client), so each of these
needs an explicit transfer or replacement before the team leaves. Who moves what, and when, is
recorded in the handover report (SMD 13.7), not here, because this file is public. Decisions
recorded only in Jira comments leave with Jira: the ADRs in `docs/adr/` are the record that
travels.

### The database certificate expires on 9 November 2026

MySQL's TLS certificate is the Let's Encrypt one for `rddb.darkovski.dev`, issued by the Caddy
server on the same VPS (ADR #21). Checked on 3 October 2026: `notAfter=Nov  9 05:19:33 2026
GMT`. Caddy renews it automatically, but how a renewed certificate reaches MySQL is not
recorded anywhere in this repository. Confirm it with whoever holds the VPS before November.

If renewal fails, every client sees `Access denied`, which reads as a wrong password and is
not. Check the certificate the database actually presents:

```bash
openssl s_client -connect rddb.darkovski.dev:3306 -starttls mysql </dev/null 2>/dev/null \
  | openssl x509 -noout -subject -enddate
```

Treat the Caddy configuration as part of the database: edit a copy, `caddy validate`, reload
rather than restart, then run the check above.

### Shell access to the VPS

Shell access is confirmed only for the VPS owner. Another attempt was refused with
`Permission denied (publickey)`. fail2ban runs on the box, so do not guess usernames: ask the
owner to install your public key. `./run check-host <user>@rddb.darkovski.dev` reads the box
and writes nothing (`scripts/check-deploy-host.sh`).

### Backups and monitoring

**There are no backups.** Neither the database nor the evidence files have a backup routine,
and ADR #29 records that the files sit on one VPS with no replication. Set one up before
relying on the data. A database dump, views included:

```bash
mysqldump --single-transaction --routines --triggers -h rddb.darkovski.dev -u <admin> -p \
  reflection_diary > reflection_diary-$(date +%F).sql
```

Evidence files and exports are on the API server's disk under `api/storage/app/private/` (the
`local` disk in `api/config/filesystems.php`), not in the database, so they need their own
copy.

**There is no monitoring.** fail2ban bans repeated failed MySQL logins in the DOCKER-USER
chain, and ADR #21 records that nothing alerts if a Docker upgrade silently stops it banning.
Check it is still active after any change to Docker on the box.

### Rotating credentials

| Credential | How | What it affects |
| --- | --- | --- |
| One user's API token | Delete their `personal_access_tokens` row, then issue a new one (above) | That user only |
| Every API token | `DELETE FROM personal_access_tokens;`, then `php artisan db:seed --class=DemoSeeder` | Everyone is signed out. The seeder prints three new tokens |
| `diary_app` password | As a MySQL admin, `ALTER USER 'diary_app'@'<host>' IDENTIFIED BY '…';` (the host part from `SELECT user, host FROM mysql.user;`), then `DB_PASSWORD` in every `api/.env` | The API and every developer machine |
| `diary_ro` password | The same for `diary_ro`, then `DB_READONLY_PASSWORD` in each shell profile | Agents' read-only schema access |
| `APP_KEY` | `php artisan key:generate` in `api/` | Very little. Nothing in `api/app` encrypts with it, and Sanctum stores token hashes, so no one is signed out |

Seeded tokens expire 60 days after they are issued (`DemoSeeder::TOKEN_LIFETIME_DAYS`, ADR #46),
and rotating is how one stops working sooner. A token issued before ADR #46, or from Tinker
without an expiry, never expires until it is rotated.
New credentials go to the new owner out of band, never into this repository or a chat log.

### CI, Dependabot and branch protection

- **CI** (`.github/workflows/ci.yml`) runs on every pull request into `dev` or `main`, in
  three jobs:
  - **Contract:** lints `docs/openapi.yaml`, checks the generated types and Laravel's routes
    against it (`./run contract-drift`), and runs the guard and rule checks.
  - **Backend:** Pint, then the PHPUnit suite against a throwaway MySQL 9.7 container, never
    the shared database. Then the same container is reseeded, the API is served on :8000,
    and `scripts/smoke.sh` walks the product over HTTP with the three seeded tokens.
  - **Frontend:** lint, Prettier, design tokens, contrast, the build, the bundle-secrets
    check, the per-screen checks and the Playwright browser checks.

  `./run check` runs the same locally. The Node version comes from `.nvmrc`.
- **`ubuntu-latest` moves to Ubuntu 26 from 19 October 2026.** If a job breaks after that
  date for no code reason, the runner image is the first suspect.
- **Dependabot** (`.github/dependabot.yml`) opens grouped updates for GitHub Actions, Composer
  and npm every Monday at 09:00 Melbourne time, against `dev`. After merging any of them, run
  `./run deps` and commit the regenerated `docs/Dependency-Register.md`. CI fails until you
  do: `./run docs` compares the register's recorded lockfile hashes with the lockfiles.
- **Docs drift:** `./run docs` (`scripts/check-docs.py`) also fails CI on a broken relative
  link, a `./run` command that does not exist, a file in `docs/` missing from the README
  table, or an ADR index that disagrees with the records.
- **Branch protection:** the `protected-branches` ruleset requires a pull request into `dev`
  and `main` and forbids force pushes, but requires no approving review (CONTRIBUTING).
  Request a reviewer anyway.

## When something is wrong

| Symptom | First check |
| --- | --- |
| `Access denied` from MySQL | `MYSQL_ATTR_SSL_CA` set, then the password, then the network (`nc -z`), then the certificate's expiry ([Handing over](#the-database-certificate-expires-on-9-november-2026)) |
| Every request hangs, tests hang | Port 3306 blocked on this network |
| The app shows the token screen again | The token was rejected (401). Paste it again, or issue a new one |
| `409 DUPLICATE_REFLECTION` | One reflection per student per sprint, enforced by a unique index. Expected |
| `409 FRAMEWORK_IN_USE` | A rubric referenced by any reflection is read-only. Copy it and edit the copy |
| CI's Contract job fails | `./run contract-drift` names the route or the stale `schema.ts` |

`./run` with no arguments lists every command, and `./run check` runs what CI runs.
