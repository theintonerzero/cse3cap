# Alumable Reflection Diary

![Subject](https://img.shields.io/badge/subject-CSE3CAP-blue)
![University](https://img.shields.io/badge/university-La%20Trobe-red)
![Team](https://img.shields.io/badge/team-404%20Not%20Found-6f4fa1)
![Semester](https://img.shields.io/badge/semester-S2%202026-lightgrey)

A lifelong, student-owned learning record built into [Alumable](https://alumable.com).

Students log structured reflections against the gigs they work, self-score themselves
against a competency rubric, and get counter-scored by a supervisor or employer. Both
sets of scores are plotted on a radar chart, and the whole record stays with the student
after the subject closes and after they graduate.

---

## Where this is up to

| Part | State |
| --- | --- |
| Database | Applied and verified on the shared instance. 14 tables, 5 views |
| Backend | **Complete.** 30 endpoints, all seven business rules, 110 feature tests |
| Contract | `docs/openapi.yaml` matches the served routes, checked mechanically |
| Frontend | **Scaffold only.** `web/` renders the word `test`. No screens built |

The API is finished and stable enough to build against. The contract is the agreement, so
the frontend can start now against `prism mock docs/openapi.yaml` without waiting for
anything. Not built on the backend: PDF export, which needs dompdf and is a package
decision for the team.

How the two folders fit together, and what breaks quietly when they drift, is
[`docs/Frontend-and-Backend.md`](docs/Frontend-and-Backend.md).

[`docs/Stack-and-Build-Scope.md`](docs/Stack-and-Build-Scope.md) has the item-by-item
checklist.

---

## Table of contents

- [Where this is up to](#where-this-is-up-to)
- [The problem](#the-problem)
- [The solution](#the-solution)
- [Objectives](#objectives)
- [Scope](#scope)
- [Tech stack](#tech-stack)
- [Data model](#data-model)
- [Repository structure](#repository-structure)
- [Getting started](#getting-started)
  - [Running it](#running-it)
- [Working agreements](#working-agreements)
- [Claude Code](#claude-code)
- [Documentation](#documentation)
- [Team](#team)
- [Client](#client)

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

### Design principles

| Principle     | What it means                                                                                        |
| ------------- | ---------------------------------------------------------------------------------------------------- |
| **Permanent** | Every reflection and score stays with the student for life, not locked inside a subject that closes. |
| **Credible**  | Verified by the people who actually supervised the work.                                             |
| **Useful**    | Built around recognised skill frameworks, so the record means something to a future employer.        |
| **Flexible**  | Works with SFIA 9 today and any other rubric Alumable or its university partners need tomorrow.      |

## Objectives

- Build a Reflection Diary module where students log structured, ideally evidence-based
  reflections on gigs and projects as they do the work.
- Support self-assessment scoring against a competency rubric, with counter-scoring by an
  assessor, supervisor or employer.
- Visualise progress over time as a radar chart of self vs assessor scores across competencies.
- Make competency frameworks interchangeable (SFIA 9, La Trobe's six-competency rubric,
  or anything else) rather than hard-coded.
- Ensure the diary is a persistent, student-owned record that survives subject completion
  and graduation.

## Scope

**Must have**

- Structured reflection entries per sprint and per gig, with supporting evidence.
- Self-assessment scoring against a competency rubric, with assessor/supervisor counter-scoring.
- Radar-chart visualisation of self vs assessor scores across competencies.
- A persistent, student-owned, exportable record that outlives the subject.
- Interchangeable competency frameworks (SFIA 9 and La Trobe's six-competency rubric),
  including copying and editing a framework.

**Nice to have**

- Employer feedback and ratings integrated into the diary.
- Reflection prompts and reminders to drive regular use.
- Longitudinal analytics across semesters.

**Out of scope**

- AI features of any kind. Cut at the scope review, see [ADR #10](docs/adr/).
- Framework creation from scratch, adding or removing competencies, changing level counts.
  Editing means copying a seeded base, then renaming and rewording only.
- Re-scoring by an assessor, pagination, notifications as stored state, real-time updates.

## Tech stack

| Layer    | Choice                            |
| -------- | --------------------------------- |
| Backend  | PHP 8.5 / Laravel 13, JSON API    |
| Frontend | React 19 + Vite + TypeScript      |
| Charts   | recharts                          |
| Database | MySQL 9.7 LTS, self-hosted on an Oracle Cloud VPS |
| Auth     | Laravel Sanctum bearer tokens     |
| Contract | OpenAPI 3, mock-first with Prism  |
| Design   | Figma                             |
| Tracking | Jira                              |

PHP, Laravel and MySQL were set by the client so the Reflection Diary integrates cleanly
with their live platform. Production and staging portals cannot be shared and we have no
access to their database, so the MVP runs standalone against our own seeded data and
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
`framework_assignments` records which rubric applies to which gig, as a table rather than a
column, so we also capture who assigned it and when.

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
notation cannot show. Schema with inline reasoning:
[`db/01-schema.sql`](db/01-schema.sql).

## Repository structure

```
.
├── api/          # Laravel 13 backend
├── web/          # React + Vite + TypeScript frontend (scaffold only)
├── db/           # Schema, patches and seed data
├── docs/         # Brief, ERD, API spec, ADRs. Every document lives here
├── scripts/      # Setup, the smoke and client checks, the two agent guards
├── run           # Task runner. ./run dev starts everything (run.ps1 on Windows)
├── .claude/      # Shared agent configuration: agents, skills, permissions
├── .github/      # CI, and Dependabot's weekly dependency pass
├── CLAUDE.md     # Rules for agents working in this repo
└── README.md
```

## Getting started

### Quick setup

One command does the clone, the environment files and the Claude Code variable. It asks
for the two passwords and installs nothing itself, only telling you what is missing.

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

Windows: `./run.ps1` takes the same commands.

`api/` and `web/` are still two separate applications with two separate toolchains, and
`./run` does not pretend otherwise. It prints every command before running it, so you can
always see what it is doing and run that yourself instead.

### 1. Clone

```bash
git clone https://github.com/theintonerzero/cse3cap.git
cd cse3cap
```

`.env.example` at the root lists every value the project needs and where each one goes.
Host, port, database and usernames are already filled in. The only things missing are the
two passwords, which are pinned in the team channel.

### 2. Backend

```bash
cd api
cp ../.env.example .env
composer install
php artisan key:generate
php artisan serve          # http://localhost:8000
```

Laravel reads `api/.env`, not the copy at the root. Paste `DB_PASSWORD` in before starting
the server; everything else in the database block is already correct.

The database refuses unencrypted connections. `MYSQL_ATTR_SSL_CA` in `.env.example` points
at `db/letsencrypt-roots.pem`, which is committed so the path is the same on every machine.
Without it PDO connects in the clear and the server rejects it as `Access denied`, which
looks like a wrong password and is not.

Do **not** run `php artisan migrate` without saying so in the channel first. See
[shared database](#shared-database).

### 3. Frontend

```bash
cd web
npm install
npm run dev                # http://localhost:5173
```

It renders the word `test`. That is the whole application: the scaffold exists so the
toolchain, the CI job and the dev server are proven before anyone writes a screen. What to
build and in what order is [`web/README.md`](web/README.md).

Vite reads `web/.env`, which needs one line:
`VITE_API_BASE_URL=http://localhost:8000/api/v1`. `scripts/setup.sh` writes it and installs
the dependencies.

The backend is a separate server on a separate port, and nothing proxies between them. You
do not need it running to build a screen; mock the contract instead:

```bash
npx -y @stoplight/prism-cli mock docs/openapi.yaml    # http://localhost:4010
```

[`docs/Frontend-and-Backend.md`](docs/Frontend-and-Backend.md) is the seam between the two
folders: what crosses it, what generates what, and the drift that does not announce itself.

### Shared database

MySQL 9.7 LTS is self-hosted on a shared Oracle Cloud VPS rather than on each machine, so
there is nothing to install locally.

| | |
| --- | --- |
| Host | `rddb.darkovski.dev` port `3306` |
| Database | `reflection_diary` |
| Accounts | `diary_app` for the application, `diary_ro` read-only for agents |
| TLS | Required. Real Let's Encrypt certificate, so `verify_identity` works |

Everyone connects to the same instance, which has two consequences.

**Migrations are applied centrally.** Two people running migrations at once will conflict,
and a bad migration takes out everyone's environment rather than just one. Announce in the
channel before applying anything.

> **Applied 2026-08-19, batch 3.** `2026_08_19_120000_one_framework_assignment_per_gig`
> narrowed `ak_fw_assignments` from `(gig_id, framework_id)` to `(gig_id)`, so a gig holds
> one rubric rather than one per rubric ([ADR #35](docs/adr/architecture-decision-records.md)).
> The shared instance is done and both existing assignments are untouched. Nothing to do
> unless you keep a personal test database: `php artisan migrate` in `api/` brings one into
> line, and is a no-op on any database built from the current `db/01-schema.sql`.

**Seed data is shared.** Treat the seeded users, gigs and frameworks as fixed reference
data. If you need to experiment, create new rows rather than editing the seeds, otherwise
you change what everyone else sees, including mid-demo.

### Authentication

There is no login screen in the MVP. Three tokens are seeded, one per role. Pass them as
`Authorization: Bearer <token>`.

| Role                  | User   | On                | Use for                                                 |
| --------------------- | ------ | ----------------- | ------------------------------------------------------- |
| Student               | Jane N | both gigs         | Writing reflections, self-scoring, export               |
| Assessor              | Sam O  | first gig only    | Review queue, counter-scoring                           |
| Supervisor (educator) | Dr Lee | both gigs         | Framework select, edit and assign, plus counter-scoring |

Sam is on one gig deliberately. Every token seeing every gig would make the scoping rules
untestable, and `GET /gigs` returning two for Jane and one for Sam is the cheapest proof
that authorisation resolves per gig rather than globally.

Tokens are issued by `php artisan db:seed --class=DemoSeeder`, which prints them once, and
are pinned in the team channel. Sanctum stores only a hash, so a token cannot be recovered
after that. The seeder is idempotent and will not reissue a token to a user who has one.
Educator is not a separate role in the schema, it maps to `supervisor`.

### The demo data

`php artisan db:seed` in `api/` runs both seeders and is what the client demo and every
screen are built against. It is idempotent, so running it twice changes nothing.

`DemoSeeder` is the cast above plus the two gigs, their sprints and their rubrics.
`ReflectionSeeder` adds three classmates and nine reflections: on the La Trobe gig five
assessed, one submitted and one draft, and on SFIA one assessed and one submitted.

Scores are shaped rather than random. Each student has a hidden ability profile and rates
themselves against it with a bias, so the radar shows a calibration gap with a shape: Tom
is consistently two levels over-confident, Priya is well calibrated, Jane improves across
sprints and her optimism shrinks with her, and Noor has barely started so she is the one
with coverage gaps. Narratives are written by hand because they are read aloud at the
demo. See ADR #37 for why it is two seeders, and `.claude/skills/seed-data` for the rules
if you are adding to it.

Jane's third sprint on the La Trobe gig is deliberately left free. `scripts/smoke.sh`
writes a reflection there, and filling it would turn its whole write path into a skipped
warning.

That cuts both ways, and it bites on a database smoke has already been run against.
Idempotency is per student and per sprint, so a sprint that already has a reflection on it
is left alone. Smoke writes as Jane on the La Trobe gig every time it runs, so three runs
fill all three of her sprints, and seeding after that quietly skips her La Trobe
reflections and leaves the demo showing her placeholder narratives. Check first:

```sql
SELECT g.title, s.ordinal, r.status FROM reflections r
  JOIN gigs g ON g.id = r.gig_id JOIN sprints s ON s.id = r.sprint_id
  JOIN users u ON u.id = r.user_id WHERE u.display_name = 'Jane N';
```

Delete her smoke reflections before seeding if they are in the way. Entries, scores,
evidence and events cascade with the reflection row, and an export that referenced it is
set to null rather than deleted.

### What the API serves

All thirty endpoints are live: identity, gigs, frameworks, the reflection write path,
scoring, analytics and export. Run `php artisan serve` in `api/` and call
`http://localhost:8000/api/v1`.

Every non-2xx response is the same envelope, including 401 and 404:

```json
{ "error": { "code": "NOT_FOUND", "message": "No such resource, or it is not yours.", "details": {} } }
```

[`docs/openapi.yaml`](docs/openapi.yaml) is the machine contract. The operations it
declares and the routes the application serves are compared mechanically and agree
exactly, so `prism mock docs/openapi.yaml` is a truthful stand-in rather than a wish list.

Not built: PDF export, which needs dompdf and is a package decision for the team, and the
frontend.

[`docs/api-reference.html`](docs/api-reference.html) is a single-page reference covering
auth, the permission matrix, the error envelope, every endpoint with a real response, and
which service class owns each business rule. Open it in a browser, no server needed.

The same page is published at
<https://claude.ai/code/artifact/35e1b32f-52b8-4458-bb3f-898efbd5bd9d>, which is a private
link on Jesse's account and needs a claude.ai login. Ask him if you want access. The file
in the repository is the copy that everyone can read, and the one to edit.

### Testing it

```bash
./run test                          # 110 feature tests, against real MySQL
./run smoke                         # 51 checks, over HTTP, with the three real tokens
./run verify                        # 28 checks on the typed API client, both servers
./run check                         # the first, plus lint, contract and the guards
```

The suite runs `migrate:fresh`, so it needs a database of its own. `scripts/setup.sh` sets
`DB_TEST_DATABASE=reflection_diary_test_<your username>` in `api/.env` for you; if you set
up by hand, set it yourself. `diary_app` is granted DDL on `reflection_diary_test_%`
precisely so yours is yours alone. Pointed at `reflection_diary` the suite refuses to start
rather than dropping the shared schema.

`./run verify` is the frontend counterpart. It proves the typed API client still attaches
the token, resolves the base URL, unwraps the error envelope and refuses off-contract calls
at compile time, against the real API and against the prism mock. It has no test suite
behind it and every screen is built on it, so it is checked directly. `--static` skips the
parts that need servers.

The suite proves the rules in isolation. The smoke script drives the whole product through
a running server, which is where wiring bugs live: it writes a reflection as Jane, submits
it through the gate, counter-scores it as Sam, watches it flip to `assessed`, reads the
analytics and exports the record, checking the refusals on the way past. Start the server
first, and rerun it as often as you like.

## Working agreements

**Contract first.** [`docs/openapi.yaml`](docs/openapi.yaml) is the agreement between
frontend and backend. The frontend develops against a mock generated from it
(`prism mock docs/openapi.yaml`) while the backend implements the real thing. If you change
an endpoint, update the contract in the same PR.

**Decisions get an ADR.** Anything that changes the schema, the contract, or a choice
already recorded gets a new record in [`docs/adr/`](docs/adr/). Supersede, never rewrite.

**Naming is snake_case everywhere:** database, JSON, frontend types. There is no mapping
layer between them.

Branching, commits, PRs and review are in [CONTRIBUTING.md](CONTRIBUTING.md).

## Claude Code

The repository ships shared configuration so everyone gets the same setup.

`.claude/settings.json` enables ten plugins from the official Anthropic marketplace: the PHP
and TypeScript language servers, Context7, frontend design, Playwright, superpowers, security
guidance, GitHub, commit commands, and the PR review toolkit. `.mcp.json` adds a read-only
MySQL connection so agents can inspect the real schema instead of guessing.

Trust the repository folder when prompted and Claude Code should offer to install them. If
nothing appears, run `/plugin` and install from the Discover tab.

Install the language server binaries once per machine; the plugins do not install them:

```bash
npm install -g typescript-language-server typescript
npm install -g intelephense
```

The MySQL MCP connection is deliberately read-only. Agents can read the schema and query
data, but cannot modify a database five people share. That is enforced by the grant on
`diary_ro`, not only by the server's own flags.

Everything it needs is defaulted in `.mcp.json` except the password, so setup is one line
in your shell profile:

```bash
export DB_READONLY_PASSWORD='...'      # from the team channel
```

Restart Claude Code afterwards. Without it the MySQL server fails to start and agents fall
back to guessing from `db/01-schema.sql`.

Only plugins from the official marketplace are enabled. Plugins execute arbitrary code with
your user privileges, so raise it in the channel before adding others.

### Agents

`.claude/agents/` defines six subagents, tiered by what the task costs to get wrong rather
than by how long it takes. Without them every subagent inherits the main model, and a
one-line documentation fix costs the same as a schema change.

| Agent | Model | For |
| --- | --- | --- |
| `schema-migration` | Opus, xhigh | The schema, migrations, views, and the ADR that travels with them |
| `backend-endpoint` | Opus, high | An endpoint end to end: rule, policy, resource, test, contract |
| `frontend-screen` | Sonnet, high | React screens and components in `web/` |
| `contract-sync` | Sonnet | Keeping `openapi.yaml`, the API spec and the generated types in agreement |
| `repo-explorer` | Haiku | Read-only "where is X" before you write anything |
| `docs-tidy` | Haiku | Mechanical doc maintenance: a moved path, a stale version, a broken link |

Neither Haiku agent can run Bash. `.claude/skills/` holds six task recipes, invoked with
`/add-endpoint`, `/add-migration`, `/add-policy`, `/add-screen`, `/seed-data` and
`/write-adr`.

### Guards

Two `PreToolUse` hooks refuse things that a permission rule cannot see, both with their
cases run in CI:

- `scripts/guard-shared-db.sh` blocks any shell command that destroys schema without naming
  a test database. `api/tests/TestCase.php` already refuses inside PHPUnit, but a command
  typed at the shell goes nowhere near it, and five people share one instance.
- `scripts/guard-docs-location.sh` blocks a new document written outside `docs/`. Agents
  produce prose constantly, and left alone it lands wherever the agent happened to be. It
  reads shell redirections as well as the Write tool, because an agent working through
  Bash creates every file with `cat > path`.

Every document this project keeps lives in `docs/` and is listed in the table below. A
working note belongs in your scratchpad, outside the repository.

[`CLAUDE.md`](CLAUDE.md) holds the rules agents must follow.
[`docs/PROJECT-CONTEXT.md`](docs/PROJECT-CONTEXT.md) explains the product, the architecture
and the reasoning behind the unusual decisions.

## Documentation

| Document                                                         | What it covers                                                |
| ---------------------------------------------------------------- | ------------------------------------------------------------- |
| [`docs/PROJECT-CONTEXT.md`](docs/PROJECT-CONTEXT.md)             | Background briefing: product, vocabulary, architecture, traps |
| [`docs/API-Specification.md`](docs/API-Specification.md)         | The annotated API contract                                    |
| [`docs/api-reference.html`](docs/api-reference.html)             | Single-page API reference, including which class owns each rule |
| [`docs/Frontend-and-Backend.md`](docs/Frontend-and-Backend.md)   | How `api/` and `web/` couple, and what drifts silently        |
| [`docs/Retention-and-Erasure.md`](docs/Retention-and-Erasure.md) | What is kept, what can be deleted, and what cannot            |
| [`docs/openapi.yaml`](docs/openapi.yaml)                         | Machine-readable contract, source of truth                    |
| [`docs/Stack-and-Build-Scope.md`](docs/Stack-and-Build-Scope.md) | What is being built, and the definition of done               |
| [`docs/adr/`](docs/adr/)                                         | Architecture decision records                                 |
| [`docs/erd.png`](docs/erd.png)                                   | Entity relationship diagram, with a legend of hidden constraints |
| [`docs/superpowers/specs/`](docs/superpowers/specs/)             | Design specs for each build slice                             |
| [`docs/jira/`](docs/jira/)                                       | Jira CSV imports: the epics and the sprint 3 to 5 backlogs    |
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

Engagement includes at least three touchpoints: a week-2 meet and greet, a mid-semester design
checkpoint, and final handover. Intellectual property in the delivered solution is assigned to
Alumable.
