# Alumable Reflection Diary

![Release](https://img.shields.io/github/v/release/theintonerzero/cse3cap)
![Licence](https://img.shields.io/github/license/theintonerzero/cse3cap)
![Subject](https://img.shields.io/badge/subject-CSE3CAP-blue)
![University](https://img.shields.io/badge/university-La%20Trobe-red)
![Team](https://img.shields.io/badge/team-404%20Not%20Found-6f4fa1)
![Semester](https://img.shields.io/badge/semester-S2%202026-lightgrey)

A lifelong, student-owned learning record built for [Alumable](https://alumable.com).

Students write structured reflections on the gigs they work, score themselves against a
competency rubric, and are counter-scored by a supervisor or assessor. Both sets of scores are
drawn on a radar chart, so the gap between how a student sees their work and how others see it
is visible at a glance. The record belongs to the student, survives the subject and graduation,
and exports to PDF or JSON.

---

## Try it

Docker and git are all you need. Everything runs in containers with its own database and the
seeded demo, and nothing touches the team's servers.

```bash
git clone https://github.com/theintonerzero/cse3cap.git && cd cse3cap
./assess            # Windows, in PowerShell 7: .\assess.ps1
```

Open <http://localhost:8080> and pick a person to sign in as. `./assess ai` turns on the AI
features with your own Anthropic key, and `./assess test` runs every test suite. The full guide
is [`docs/Assessor-Guide.md`](docs/Assessor-Guide.md).

A live demo also runs at <https://diary.darkovski.dev>, behind a password the team holds.

## Status

| Part | State |
| --- | --- |
| Backend | **Complete.** 31 endpoints, all eight business rules in their own services, 179 tests |
| Database | 14 tables and 5 views on MySQL 9.7, the schema in [`db/01-schema.sql`](db/01-schema.sql) |
| Contract | [`docs/openapi.yaml`](docs/openapi.yaml), checked mechanically against the served routes |
| Frontend | **Complete.** Every screen in the build scope, with 453 Playwright browser checks in 64 spec files |
| AI sidecar | **Built, off unless enabled.** Asks questions and finds related reflections, never writes ([ADR #64](docs/adr/architecture-decision-records.md)). 131 tests. On in the live demo |
| Assessor setup | One command, in Docker ([ADR #67](docs/adr/architecture-decision-records.md)) |
| Release | **v1.1.1**, 12 October 2026. Changes are in [`CHANGELOG.md`](CHANGELOG.md) |

The item-by-item checklist is [`docs/Stack-and-Build-Scope.md`](docs/Stack-and-Build-Scope.md).

## Contents

- [The problem](#the-problem)
- [The solution](#the-solution)
- [What's built](#whats-built)
- [Scope](#scope)
- [Tech stack](#tech-stack)
- [Data model](#data-model)
- [Repository structure](#repository-structure)
- [Getting started](#getting-started)
- [Working agreements](#working-agreements)
- [Documentation](#documentation)
- [Team](#team)
- [Client](#client)
- [Licence](#licence)

---

## The problem

Every semester students undertake real gigs that are guided and assessed by supervisors.
They reflect on what they learned, supervisors give feedback, then the subject ends and
all of it disappears.

- Reflections are gone the moment the grade is submitted.
- Skills gained on the job are never mapped to a recognised framework.
- Feedback from supervisors and employers is informal, undocumented and easy to forget.
- Students graduate with a transcript, but no lasting record of what they actually became
  capable of.

## The solution

A Reflection Diary module inside Alumable where:

1. A student opens a diary entry against a gig or sprint and writes a structured reflection,
   attaching evidence such as notes, files or links.
2. The student self-scores against each competency in the active framework.
3. A supervisor, assessor or employer submits an independent counter-score on the same
   competencies.
4. Both score sets render on a radar chart, so the gap between self-perception and outside
   assessment is visible at a glance.
5. The record is exportable and persists beyond the subject and beyond graduation.

| Principle     | What it means                                                                                        |
| ------------- | ---------------------------------------------------------------------------------------------------- |
| **Permanent** | Every reflection and score stays with the student for life, not locked inside a subject that closes. |
| **Credible**  | Verified by the people who actually supervised the work.                                             |
| **Useful**    | Built around recognised skill frameworks, so the record means something to a future employer.        |
| **Flexible**  | Works with SFIA 9 today and any other rubric Alumable or its university partners need tomorrow.      |

## What's built

**For students.** The diary home shows the radar for the chosen gig and sprint, the sprints
that still need a reflection, and every reflection with its status. The entry stepper walks
one competency at a time: a narrative, evidence as links or files, and a self-score on one row
of levels. The learning record is the whole record as one table per gig, and it is the one
place an export starts ([ADR #66](docs/adr/architecture-decision-records.md)), to PDF or JSON.

**For assessors and supervisors.** The review queue lists every reflection waiting on you,
across your gigs. The same stepper in assessor mode shows the student's work read-only and
takes a counter-score, with a comment required when it is lower. Supervisors choose a gig's
rubric, copy a seeded one and reword it, and delete a copy until it is assigned.

**A swappable rubric.** La Trobe's six competencies on a four-level scale and SFIA 9 on seven
run through the same code. Competencies, scales and level descriptions are data, never code
([`docs/Framework-Swap-Verification.md`](docs/Framework-Swap-Verification.md)).

**An optional AI sidecar.** A separate Python service, off unless it is enabled. It asks a
student questions about a draft, asks about the gap between their score and their assessor's,
finds similar earlier reflections, and lets reviewers search by meaning and see recurring
themes. It never writes a reflection, suggests a score or drafts a comment, and every control
that uses it carries an AI mark ([ADR #64](docs/adr/architecture-decision-records.md)).

## Scope

**Must have**

- Structured reflection entries per sprint and per gig, with supporting evidence.
- Self-assessment scoring against a competency rubric, with assessor and supervisor
  counter-scoring.
- Radar-chart visualisation of self vs assessor scores across competencies.
- A persistent, student-owned, exportable record that outlives the subject.
- Interchangeable competency frameworks (SFIA 9 and La Trobe's six-competency rubric),
  including copying and editing a framework.

**Nice to have**

- Employer feedback and ratings integrated into the diary.
- Reflection prompts and reminders to drive regular use.
- Longitudinal analytics across semesters.

**Out of scope**

- AI inside the product. Cut by [ADR #10](docs/adr/architecture-decision-records.md); an
  optional sidecar that asks and never writes was added beside it (ADR #64).
- Framework creation from scratch, adding or removing competencies, changing level counts.
  Editing means copying a seeded base, then renaming and rewording only.
- A login screen (Alumable signs people in), re-scoring by an assessor, pagination,
  notifications as stored state, and real-time updates.

## Tech stack

| Layer      | Choice                                                     |
| ---------- | ---------------------------------------------------------- |
| Backend    | PHP 8.5 / Laravel 13, JSON API                             |
| Frontend   | React 19 + Vite + TypeScript, charts with recharts         |
| Database   | MySQL 9.7 LTS                                              |
| Auth       | Laravel Sanctum bearer tokens                              |
| Contract   | OpenAPI 3, mock-first with Prism                           |
| AI sidecar | Python 3.12 / FastAPI, Claude through the Anthropic API    |
| Running it | Docker Compose for the live demo and the assessor's stack  |
| Design     | Figma, mapped to the build in [`docs/Design-Inventory.md`](docs/Design-Inventory.md) |
| Tracking   | Jira                                                       |

PHP, Laravel and MySQL were set by the client so the Reflection Diary integrates cleanly
with their live platform. Production and staging portals cannot be shared and we have no
access to their database, so the module runs standalone against our own seeded data and
connects later through the `external_ref` columns described below.

## Data model

The schema is grouped into three areas plus an audit trail. Once you know which group a
table belongs to, the design mostly explains itself.

**Integration:** `users`, `gigs`, `sprints`, `gig_participants`

Alumable owns identity and gigs, we do not, and we have no direct database access. These are
small local mirrors, and `users` and `gigs` each carry an `external_ref` holding Alumable's id
for the same record. Those two columns are the entire coupling surface, which is what keeps
the adapter small.

Role lives on `gig_participants` rather than `users`, because the same person can be a student
on one gig and an assessor on another. It is also where role-based access control checks
resolve. `sprints` is a table rather than an integer on `reflections` because sprints have
dates, which lets the UI say things like "due in 3 days" or "not open yet".

**Framework engine:** `frameworks`, `competencies`, `levels`, `framework_assignments`

The rubric is data, not code. Competency names, scales and level descriptions should not
appear anywhere in application logic. `levels` hangs off `competencies` rather than
`frameworks`, because SFIA skills are each valid over only part of the seven levels. One
skill might run 3 to 5 and another 2 to 7, so the valid range has to live in the data.
The seeded SFIA copy uses the full 1 to 7 for every skill until Alumable supplies the real
ranges. `framework_assignments` records which rubric applies to which gig, as a table rather
than a column, so we also capture who assigned it and when.

A framework referenced by any reflection is permanently read-only. Editing is copy-then-edit,
because mutating a framework in place would silently change what past students were scored
against.

**Record:** `reflections`, `reflection_entries`, `scores`, `evidence`

`reflections` is the container: one per student per sprint, or per gig for gig-level
reflections. It belongs to the student rather than the gig, and the foreign keys to `users`
and `gigs` use `RESTRICT` so a mistaken gig delete fails loudly instead of erasing the
reflections written for it.

`reflection_entries` is the hub. One row per reflection per competency, and it holds the
narrative text. Evidence and scores attach here rather than to the reflection, because the
assessment unit is the competency, not the sprint.

`scores` are rows, not columns. There is no `self_score`/`assessor_score` pair; each row is one
scorer's opinion tagged with `scorer_role`, recording who scored and when. The radar chart is
just a query grouped by role, and adding a new scorer type later needs no migration. One score
per person per role per entry: a student may change their self-score before submitting, but an
assessor cannot revise a counter-score once given.

`framework_version` on `reflections` looks redundant next to `framework_id`, but the id points
at a row that can change, while the copied string snapshots exactly what the student was scored
against.

**Audit:** `events`, `exports`

`events` is an append-only log that powers the history sheet, with a JSON metadata column so
one table serves every event type. Notifications are derived from it rather than stored.
`exports` logs downloads as the audit trail for the exportable-record requirement, and doubles
as the job record for async export generation.

Full ERD: [`docs/erd.png`](docs/erd.png), whose legend lists the constraints crow's foot
notation cannot show. It is drawn from [`docs/erd.mmd`](docs/erd.mmd) by `./run erd`, so
update that file and redraw after any schema change. Schema with inline reasoning:
[`db/01-schema.sql`](db/01-schema.sql).

## Repository structure

```
.
├── api/            # Laravel 13 backend
├── web/            # React + Vite + TypeScript frontend
├── ai/             # The optional AI sidecar, Python FastAPI (ADR #64)
├── db/             # Schema, patches and the TLS root bundle
├── deploy/         # demo/: the live demo's containers and gate (ADR #62); assess/: the assessor's stack (ADR #67)
├── docs/           # Every document: brief, ERD, API spec, ADRs, guides
├── scripts/        # Setup, smoke, the client and per-screen checks, CI checks, the guards, the deploy
├── assess          # The assessor's one command (assess.ps1 on Windows)
├── *.md, LICENSE   # README, PRODUCT, CHANGELOG, CONTRIBUTING, SECURITY, PRIVACY, CODE_OF_CONDUCT, CLAUDE
├── run             # The team's task runner. ./run dev starts everything (run.ps1 on Windows)
├── .claude/        # Shared agent configuration: agents, skills, permissions
└── .github/        # CI, Dependabot, and the issue and pull request templates
```

## Getting started

This is the team's own setup, against the shared database on the VPS. To run the product
without any of that, use [`./assess`](#try-it) instead.

### Quick setup

One command does the clone, the environment files and the Claude Code variable. It asks
for the two passwords and installs the project's own dependencies (`composer install`,
`npm install`). It installs no system tools: a missing PHP, Composer or Node is reported
with the command to install it.

```bash
curl -fsSL https://dl.darkovski.dev/git/cse3cap/install.sh | bash    # Linux, macOS
irm https://dl.darkovski.dev/git/cse3cap/install.ps1 | iex           # Windows
```

Checksums are at [SHA256SUMS](https://dl.darkovski.dev/git/cse3cap/SHA256SUMS), worth
checking for anything piped to a shell. The script itself is
[`scripts/setup.sh`](scripts/setup.sh) in this repository, so you can read it before
running it. The manual steps below are what it automates.

### Running it

Once set up, everything runs from the repository root. No `cd` into `api/` or `web/`.

```bash
./run dev            # both servers. api on :8000, web on :5173. Ctrl-C stops both
./run test           # the backend test suite
./run check          # everything CI runs, in CI's order
./run                # the full list
```

Windows: `./run.ps1` takes the everyday commands (dev, test, check and the rest). `jira`,
`deps`, `e2e` and the per-screen `verify-*` checks are bash only.

`api/` and `web/` are still two separate applications with two separate toolchains, and
`./run` does not pretend otherwise. It prints every command before running it, so you can
always see what it is doing and run that yourself instead.

### By hand

```bash
git clone https://github.com/theintonerzero/cse3cap.git && cd cse3cap

cd api
cp ../.env.example .env    # then paste DB_PASSWORD in
composer install
php artisan key:generate
php artisan serve          # http://localhost:8000

cd ../web
npm install
npm run dev                # http://localhost:5173
```

`.env.example` at the root lists every value the project needs and where each one goes.
Laravel reads `api/.env`, not the copy at the root. Host, port, database and usernames are
filled in. The two passwords are held by the team.

The database refuses unencrypted connections. `MYSQL_ATTR_SSL_CA` in `.env.example` points
at `db/letsencrypt-roots.pem`, which is committed so the path is the same on every machine.
Without it PDO connects in the clear and the server rejects it as `Access denied`, which
looks like a wrong password and is not.

Vite reads `web/.env`, which needs one line:
`VITE_API_BASE_URL=http://localhost:8000/api/v1`. `web/gallery.html` renders every core
component in each of its states. The backend is a separate server on a separate port; you
do not need it running to build a screen, because the contract can be mocked:

```bash
npx -y @stoplight/prism-cli mock docs/openapi.yaml    # http://localhost:4010
```

[`docs/Frontend-and-Backend.md`](docs/Frontend-and-Backend.md) is the seam between the two
folders: what crosses it, what generates what, and the drift that does not announce itself.

### Shared database

MySQL 9.7 LTS is self-hosted on a shared Oracle Cloud VPS rather than on each machine.

| | |
| --- | --- |
| Host | `rddb.darkovski.dev` port `3306` |
| Database | `reflection_diary` |
| Accounts | `diary_app` for the application, `diary_ro` read-only for agents |
| TLS | Required. Real Let's Encrypt certificate, so `verify_identity` works |

Everyone connects to the same instance. **Migrations are applied centrally**: announce in
the channel before applying anything, because a bad migration takes out everyone's
environment. **Seed data is shared**: treat the seeded users, gigs and frameworks as fixed,
and create new rows to experiment.

### Authentication

There is no login screen: Alumable signs people in, and this module trusts the token it is
given. Three tokens are seeded, one per role, passed as `Authorization: Bearer <token>`.

| Role                  | User   | On             | Use for                                                 |
| --------------------- | ------ | -------------- | ------------------------------------------------------- |
| Student               | Jane N | both gigs      | Writing reflections, self-scoring, export               |
| Assessor              | Sam O  | first gig only | Review queue, counter-scoring                           |
| Supervisor (educator) | Dr Lee | both gigs      | Framework select, edit and assign, plus counter-scoring |

Sam is on one gig deliberately. Every token seeing every gig would make the scoping rules
untestable, and `GET /gigs` returning two for Jane and one for Sam is the cheapest proof
that authorisation resolves per gig rather than globally.

Tokens are issued by `php artisan db:seed --class=DemoSeeder`, which prints them once.
Sanctum stores only a hash, so a token cannot be recovered after that. The seeder is
idempotent and will not reissue a token to a user who has one. Educator is not a separate
role in the schema, it maps to `supervisor`.

### The demo data

`php artisan db:seed` in `api/` runs both seeders and is what every screen is built against.
`DemoSeeder` is the cast above plus the two gigs, their sprints and their rubrics.
`ReflectionSeeder` adds three classmates and nine reflections: on the La Trobe gig five
assessed, one submitted and one draft, and on SFIA one assessed and one submitted.

Scores are shaped rather than random. Each student has a hidden ability profile and rates
themselves against it with a bias, so the radar shows a calibration gap with a shape: Tom
is consistently two levels over-confident, Priya is well calibrated, Jane improves across
sprints and her optimism shrinks with her, and Noor has barely started so she is the one
with coverage gaps. Narratives are written by hand because they are read aloud at the
demo. See ADR #37 for why it is two seeders, and `.claude/skills/seed-data` for the rules.

Jane's third sprint on the La Trobe gig is deliberately left free, because
`scripts/smoke.sh` writes a reflection there. Idempotency is per student and per sprint, so
on a database smoke has run against three times, seeding quietly skips her La Trobe
reflections. Read [the smoke trap](docs/Runbook.md#the-smoke-trap) before seeding a
shared database.

### What the API serves

All thirty-one endpoints are live: identity, gigs, frameworks, the reflection write path,
scoring, analytics and export, at `http://localhost:8000/api/v1`. Every non-2xx response is
the same envelope, including 401 and 404:

```json
{ "error": { "code": "NOT_FOUND", "message": "No such resource, or it is not yours.", "details": {} } }
```

[`docs/openapi.yaml`](docs/openapi.yaml) is the machine contract. The operations it
declares and the routes the application serves are compared mechanically and agree
exactly, so `prism mock docs/openapi.yaml` is a truthful stand-in rather than a wish list.
[`docs/api-reference.html`](docs/api-reference.html) is a single-page reference covering
auth, the permission matrix, the error envelope, every endpoint with a real response, and
which service class owns each business rule. Open it in a browser, no server needed.

### Testing it

```bash
./run test        # 179 backend tests, against a test database of your own
./run smoke       # 71 checks over HTTP with the three real tokens (CI runs it too)
./run verify      # 28 checks on the typed API client, both servers (CI runs it too)
./run e2e         # 453 browser checks, Playwright against a fake API
./run ai-test     # 131 AI sidecar tests (pytest, needs uv)
./run check       # the suite, lint, contract, guards, build and browser checks
```

Without any of the team's setup, `./assess test` runs the backend, AI and browser suites in
containers.

The backend suite runs `migrate:fresh`, so it needs a database of its own. `scripts/setup.sh`
sets `DB_TEST_DATABASE=reflection_diary_test_<your username>` in `api/.env`; if you set up
by hand, set it yourself. Pointed at `reflection_diary`, the suite refuses to start rather
than dropping the shared schema.

`./run verify` proves the typed API client still attaches the token, resolves the base URL,
unwraps the error envelope and refuses off-contract calls at compile time, against the real
API and against the prism mock. The smoke script drives the whole product through a running
server, which is where wiring bugs live: it writes a reflection as Jane, submits it, counter-
scores it as Sam, watches it flip to `assessed`, reads the analytics and exports the record.

## Working agreements

**Contract first.** [`docs/openapi.yaml`](docs/openapi.yaml) is the agreement between
frontend and backend. If you change an endpoint, update the contract in the same PR.

**Decisions get an ADR.** Anything that changes the schema, the contract, or a choice
already recorded gets a new record in [`docs/adr/`](docs/adr/). Supersede, never rewrite.

**Naming is snake_case everywhere:** database, JSON, frontend types. There is no mapping
layer between them.

**Every document lives in `docs/`** and is listed in the table below, apart from the
community files at the root (ADR #68).

Branching, commits, pull requests and review are in [CONTRIBUTING.md](CONTRIBUTING.md). The
team builds with Claude Code; its shared configuration, the read-only database and Jira
connections, the subagents and the guards are in
[`docs/Agent-Tooling.md`](docs/Agent-Tooling.md), and the rules agents follow are in
[`CLAUDE.md`](CLAUDE.md).

## Documentation

At the root, beside this README:

| File | What it covers |
| --- | --- |
| [`PRODUCT.md`](PRODUCT.md) | What the product is for, who it serves, its principles, and where it stops |
| [`CHANGELOG.md`](CHANGELOG.md) | Every release, in Keep a Changelog form with semantic versioning, and the sprints before v1.0.0 |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | Branches, Conventional Commits, pull requests, review and releases |
| [`SECURITY.md`](SECURITY.md) | Supported versions, reporting a vulnerability, and how the product is protected |
| [`PRIVACY.md`](PRIVACY.md) | The personal data the product handles, where it goes, and what can be deleted |
| [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md) | What we expect of everyone taking part |
| [`LICENSE`](LICENSE) | MIT |
| [`CLAUDE.md`](CLAUDE.md) | Rules for agents working in this repository |

In [`docs/`](docs/):

| Document                                                         | What it covers                                                |
| ---------------------------------------------------------------- | ------------------------------------------------------------- |
| [`docs/Assessor-Guide.md`](docs/Assessor-Guide.md)               | Run the whole product, the AI and the tests with one command  |
| [`docs/PROJECT-CONTEXT.md`](docs/PROJECT-CONTEXT.md)             | Background briefing: product, vocabulary, architecture, traps |
| [`docs/Architecture.md`](docs/Architecture.md)                   | The system and the request path as diagrams, and which class owns each rule |
| [`docs/API-Specification.md`](docs/API-Specification.md)         | The annotated API contract                                    |
| [`docs/api-reference.html`](docs/api-reference.html)             | Single-page API reference, including which class owns each rule |
| [`docs/openapi.yaml`](docs/openapi.yaml)                         | Machine-readable contract, source of truth                    |
| [`docs/ai-openapi.yaml`](docs/ai-openapi.yaml)                   | The AI sidecar's contract, `/ai/v1` (ADR #64)                 |
| [`docs/Frontend-and-Backend.md`](docs/Frontend-and-Backend.md)   | How `api/` and `web/` couple, and what drifts silently        |
| [`docs/Retention-and-Erasure.md`](docs/Retention-and-Erasure.md) | What is kept, what can be deleted, and what cannot            |
| [`docs/Framework-Swap-Verification.md`](docs/Framework-Swap-Verification.md) | Proof the rubric is data, and what the seed cannot prove |
| [`docs/Stack-and-Build-Scope.md`](docs/Stack-and-Build-Scope.md) | What is being built, and the definition of done               |
| [`docs/adr/`](docs/adr/)                                         | Architecture decision records                                 |
| [`docs/Security-Review.md`](docs/Security-Review.md)             | Security reviews, appended per change                         |
| [`docs/Dependency-Register.md`](docs/Dependency-Register.md)     | Every dependency, its licence and advisories. Generated by `./run deps` |
| [`docs/Runbook.md`](docs/Runbook.md)                             | Start, stop, the shared database, reseeding, tokens, and handing over: who holds what, backups, rotating credentials, CI |
| [`docs/Deployment.md`](docs/Deployment.md)                       | The live demo on the VPS: setup, deploy, rollback, the AI sidecar, and changing Caddy safely |
| [`docs/Demo-Script.md`](docs/Demo-Script.md)                     | The client demo, step by step, for someone new to the product |
| [`docs/Design-Inventory.md`](docs/Design-Inventory.md)           | Every Figma frame and what the build did with it              |
| [`docs/Agent-Tooling.md`](docs/Agent-Tooling.md)                 | Claude Code setup, the database and Jira connections, the agents and the guards |
| [`docs/erd.png`](docs/erd.png)                                   | Entity relationship diagram, with a legend of hidden constraints |
| [`docs/superpowers/specs/`](docs/superpowers/specs/)             | Design specs for each build slice                             |
| [`docs/superpowers/plans/`](docs/superpowers/plans/)             | Implementation plans as executed. History: the code wins where they differ |
| [`docs/jira/`](docs/jira/)                                       | The Jira CSV **imports**, historical. Ticket status lives in Jira, not here (ADR #38) |
| [`.claude/skills/jira-tickets/`](.claude/skills/jira-tickets/)   | How agents read and move COA4 tickets (ADR #38)               |
| [`db/01-schema.sql`](db/01-schema.sql)                           | The schema, with inline reasoning                             |

## Team

**404 Not Found**, CSE3CAP, Semester 2, 2026

| Name             | Student Number | Role                  | GitHub                                               |
| ---------------- | -------------- | --------------------- | ---------------------------------------------------- |
| Tony To          | 22817115       | Cybersecurity Lead    | [@L1quidDroid](https://github.com/L1quidDroid)       |
| Amenah Sabri     | 22209031       | Frontend Engineer     | [@amn-4](https://github.com/amn-4)                   |
| Jesse Darkovski  | 21707695       | Data & Analytics Lead | [@theintonerzero](https://github.com/theintonerzero) |
| Patrick Anley    | 19517303       | Full Stack Engineer   | [@RickLTCS](https://github.com/RickLTCS)             |
| Andrew Johansson | 21703763       | Cybersecurity Analyst | [@Thinkeel](https://github.com/Thinkeel)             |

## Client

**Alumable** is a Melbourne edtech platform connecting university students with employers
through paid gigs and projects, with a gamified portfolio that tracks skills mapped to
frameworks such as SFIA 9.

Project owner: David Yip, Founder & CEO. Contact details are held by the team and are not
published here.

The engagement included a week-2 meet and greet, a mid-semester design checkpoint and a final
handover.

## Licence

[MIT](LICENSE), copyright the team. Built as a La Trobe University capstone project for
CSE3CAP.
