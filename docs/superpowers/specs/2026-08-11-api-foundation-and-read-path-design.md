# API slice 1 and 2: foundation and read path

**Date:** 2026-08-11
**Status:** Approved, ready for an implementation plan

## Why this is only part of the API

Stack-and-Build-Scope §4.2 lists roughly twenty-five endpoints, six business rules, a
policy per permission-matrix row and a test suite. That is too much for one design, and a
spec nobody finishes reading is worse than no spec. The API is therefore split into five
slices, each with its own spec, plan and pull request:

1. **Foundation.** Scaffold, conventions, error envelope, Sanctum, role resolution, models.
2. **Read path.** `GET /auth/me`, `/gigs`, `/frameworks`.
3. **Reflection write path.** Create, entries, evidence, the submit gate.
4. **Scoring.** Self-score, counter-score, review queue, the flip to `assessed`.
5. **Analytics, export and history.** The view-backed endpoints, queued exports, events.

This document covers slices 1 and 2 together. They are paired because foundation alone
proves nothing: until something is callable end to end, there is no evidence the layering,
the auth and the serialisation actually work against the real database. Slices 3 and 4
carry nearly every business rule and get their own careful treatment later.

## Decisions taken

**Laravel owns the schema from now on, by baselining.** The DDL becomes one initial
migration. On the shared instance that migration is recorded as already run, so
`php artisan migrate` there is a no-op and cannot damage a database five people share.
`db/01-schema.sql` remains source of truth for the current shape and the migration mirrors
it. This satisfies both CLAUDE.md, which ranks the SQL file first, and Stack-and-Build-Scope
§4.2, which asks for migrations. No superseding ADR is needed because no recorded decision
is reversed.

The alternative of letting migrations own the schema outright was rejected: it demotes
source of truth number one, needs an ADR, and would mean rebuilding the shared instance we
have just provisioned.

**The database host is `rddb.darkovski.dev`.** Renamed from `db.darkovski.dev` so the name
is scoped to this project rather than claiming the generic one on a personal domain. The
API will eventually be served at `rdapi.darkovski.dev` by the same Caddy instance, but
deployment is out of scope here: development runs `php artisan serve` on
`localhost:8000` against the shared database.

**Tests run against real MySQL, one database per developer.** SQLite cannot express
generated columns, `CHECK` constraints or `VALUES` row constructors, so it is not an
option. Each developer gets their own database on the shared instance, named from
`DB_TEST_DATABASE`, and `diary_app` is granted rights on `reflection_diary_test_%` so
`migrate:fresh` works without anyone touching the real schema.

## Architecture

Layering is fixed by CLAUDE.md and is set up in this slice even where it is not yet
exercised:

```
route -> FormRequest (shape) -> Policy (authorisation) -> Service (rules) -> Controller (serialise)
```

This slice has no business rules, so it has no service classes beyond role resolution. The
structure exists from the first commit so that slice 3 has an obvious and only place to put
the submit gate. Analytics controllers will read the SQL views directly and never aggregate
in PHP.

## Components

### Scaffold

`composer create-project laravel/laravel api` on PHP 8.5, Sanctum via
`php artisan install:api`, CORS configured for the Vite dev origin at
`http://localhost:5173`. PHP 8.5 and Composer are not installed on the development machine
yet and are a prerequisite.

### Configuration

`api/.env` is copied from the repository root `.env.example`, which already carries the
real host, port, database and usernames. `MYSQL_ATTR_SSL_CA` must point at
`db/letsencrypt-roots.pem`. This is not optional: the server refuses unencrypted
connections, and PDO does not negotiate TLS at all unless handed a CA file, failing with a
misleading `Access denied` when it does not.

### Base model

A shared base carrying `HasUuids`, `$keyType = 'string'` and `$incrementing = false`.

Timestamp handling needs care, because the schema does not follow Laravel's convention.
Only `reflections` and `reflection_entries` have `created_at` and `updated_at`. `users` and
`gigs` have `created_at` alone. `framework_assignments`, `scores`, `evidence`, `events` and
`exports` each have a single differently named stamp: `assigned_at`, `scored_at`,
`uploaded_at`, `occurred_at`, `requested_at`. `sprints`, `gig_participants`, `frameworks`,
`competencies` and `levels` have none. Models therefore need `$timestamps = false` or
explicit `CREATED_AT` and `UPDATED_AT` constants per table. Getting this wrong makes
Eloquent write to columns that do not exist.

`reflections.gig_key` and `sprint_key` are database-generated and stay out of `$fillable`.

### Error envelope

One renderable registered in `bootstrap/app.php`, plus an `ApiException` carrying `code`,
`message` and `details` for domain failures. Every non-2xx response uses the single
envelope from CLAUDE.md.

| Condition | Status | Code |
|---|---|---|
| FormRequest validation failure | 400 | `VALIDATION_FAILED` |
| Missing or bad bearer token | 401 | none |
| Policy denial | 403 | `ROLE_FORBIDDEN` |
| Model not found, or not the caller's | 404 | none |
| `QueryException` with MySQL 1062 | 409 | `DUPLICATE_REFLECTION` |

The 1062 mapping lives here rather than in a service because it is the database's
uniqueness guarantee surfacing as a contract error, and no application code raises it.

### Role resolution

`roleFor(User, Gig): ?string` returns `student`, `assessor`, `supervisor`, `employer` or
null, resolved from `gig_participants` and memoised per request. Null means not a
participant, which is a 404 rather than a 403, because the caller should not learn the
resource exists. The client never sends a role.

### Endpoints

All read-only, no business rules.

- `GET /auth/me`, the caller plus their participations, driving role-aware navigation.
- `GET /gigs`, gigs the caller participates in, any role, with sprints, the assigned
  framework and a reflection status summary.
- `GET /gigs/{id}`, the same shape plus participants. 404 if not a participant.
- `GET /frameworks`, with `in_use` computed by an existence check against reflections.
- `GET /frameworks/{id}`, the full nested rubric, with `scale` read from
  `v_framework_scale` rather than computed in PHP.

Resources emit snake_case directly. There is no mapping layer and JSON keys match column
names exactly.

### Contract

`docs/openapi.yaml` gains real paths, the error envelope and schemas for these five
endpoints in the same commit, as CONTRIBUTING requires. It stays on OpenAPI 3.1, because
neither Prism nor openapi-typescript reads 3.2 yet. This also unblocks `prism mock` for
whoever starts the frontend.

## Testing

Feature tests per endpoint covering the happy path, the wrong role, a non-participant
receiving 404, and an unauthenticated request receiving 401. Factories supply fixtures.
One test per rule rather than per line, in line with the `add-endpoint` skill.

## Out of scope for this slice

Writing endpoints, business rules, the submit gate, scoring, analytics, export and the
event log. Deployment of the API to `rdapi.darkovski.dev`, including the commented Caddy
block, which currently carries a placeholder upstream that is wrong for Laravel and needs
revisiting when deployment happens. Any frontend work.

## Resolved: DemoSeeder is canonical

Decided after this spec was written. `db/02-seed.sql` has been removed and the Laravel
seeder owns demo data. The two frameworks stay in `db/01-schema.sql`, because they are part
of the reviewed schema rather than demo data. The shaped scores and written narratives
described in the `seed-data` skill extend `DemoSeeder` when the scoring slice needs them.

The section below is kept for the reasoning that led there.

## Open question for the team

`db/02-seed.sql` is still a set of TODO comments, so the database holds the two seeded
frameworks and nothing else. No users, gigs, sprints or tokens exist. Tests are unaffected
because they use factories, but nothing is manually demoable and `GET /gigs` returns an
empty array against the live database.

This slice will include a minimal Laravel seeder producing the three documented tokens and
two gigs, enough to exercise the endpoints by hand. That overlaps `db/02-seed.sql`, and the
team should decide which of the two is canonical rather than maintaining both. The
`seed-data` skill assumes the SQL file.

## Done when

1. `php artisan migrate` runs clean against a fresh test database and is a no-op against
   the shared instance.
2. All five endpoints return correct shapes against real seeded data.
3. A student token, an assessor token and a supervisor token each see only what the
   permission matrix allows, and a non-participant gets 404.
4. Every failure path returns the single error envelope with the documented code.
5. `docs/openapi.yaml` describes exactly these endpoints and `prism mock` serves them.
6. Feature tests pass against MySQL.
