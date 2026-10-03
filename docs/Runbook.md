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

There is no deployed instance. A demo deployment is designed in
`docs/superpowers/specs/2026-09-06-demo-deployment-design.md`, but it was not deployed by
v1.0.0: it needs shell access to the VPS that the team never confirmed. If it is built, its
deploy and rollback steps belong here.

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

## Issue a token

There is no login screen (ADR #15). Access is a Sanctum bearer token per user, sent as
`Authorization: Bearer <token>`, and pasted into the app's token screen.

| Seeded user | Role | On |
| --- | --- | --- |
| Jane N | Student | both gigs |
| Sam O | Assessor | the La Trobe gig only |
| Dr Lee | Supervisor | both gigs |

**For the seeded users,** `php artisan db:seed --class=DemoSeeder` prints a token for each
of the three who does not already have one (`api/database/seeders/DemoSeeder.php`). It
prints it once: Sanctum stores only a hash, so a lost token cannot be recovered, only
replaced.

**To replace one,** delete the user's row in `personal_access_tokens` and run the
`DemoSeeder` again. Deleting the row is also how a token is revoked.

**For any other user,** issue one from Tinker:

```bash
cd api && php artisan tinker
>>> App\Models\User::where('display_name', 'Priya R')->first()->createToken('demo')->plainTextToken
```

What the token can do comes from that user's rows in `gig_participants`, resolved per gig
on the server (`api/app/Services/RoleResolver.php`). The token itself carries no role.

Tokens never expire (`api/config/sanctum.php`, `expiration => null`) and carry every
ability. That is finding F2 to F4 in `docs/Security-Review.md`, tracked as CAP-32, and it
matters before any instance is reachable from the internet.

## Credentials

Never in the repository, and never in a chat log that outlives the project. `./run
bundle-secrets` fails a production build that carries a token (F1 in
`docs/Security-Review.md`).

What has to be handed over, and to whom, is in SMD 13.7 of the handover report, not here,
because this file is public.

## When something is wrong

| Symptom | First check |
| --- | --- |
| `Access denied` from MySQL | `MYSQL_ATTR_SSL_CA` set, then the password, then the network (`nc -z`) |
| Every request hangs, tests hang | Port 3306 blocked on this network |
| The app shows the token screen again | The token was rejected (401). Paste it again, or issue a new one |
| `409 DUPLICATE_REFLECTION` | One reflection per student per sprint, enforced by a unique index. Expected |
| `409 FRAMEWORK_IN_USE` | A rubric referenced by any reflection is read-only. Copy it and edit the copy |
| CI's Contract job fails | `./run contract-drift` names the route or the stale `schema.ts` |

`./run` with no arguments lists every command, and `./run check` runs what CI runs.
