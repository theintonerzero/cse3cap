# Project context: Reflection Diary

A briefing for coding agents working on this repository. Read this before writing code.
It explains what the product is, how it is built, which decisions are already settled, and
which mistakes are easy to make here.

This is not `CLAUDE.md`. This is background. `CLAUDE.md` holds the rules an agent must
follow; this document explains why those rules exist.

---

## 1. The product

Alumable is a Melbourne edtech platform that connects university students with employers
through paid gigs. Students already reflect on the skills they gain, and employers give
capability feedback, but in normal practice all of that is lost when a subject or degree
ends.

The Reflection Diary fixes that. A student on a gig writes a structured reflection at each
sprint, one short piece of writing per competency, attaches evidence, and scores themselves
against a rubric. A supervisor, assessor or employer then scores the same competencies
independently. Both sets of scores appear on a radar chart, so the student can see where
their self-assessment matches an external view and how it changes over time. The record
belongs to the student, is exportable, and outlives the subject, the gig and graduation.

This is a university capstone project (La Trobe CSE3CAP, Semester 2 2026) built by a team
of five for a real client. The client set the target stack. The MVP runs standalone with
seeded data and is designed to integrate with Alumable's platform later.

## 2. Vocabulary

Use these words exactly as defined. Several are easy to conflate.

**Gig.** A paid piece of work a student does through the platform. Divided into sprints.

**Sprint.** A dated period within a gig. Has `opens_on` and `due_on`. A reflection is
normally written per sprint.

**Framework.** A competency rubric, for example La Trobe's six-competency rubric or
SFIA 9. Stored as data, never as code. Versioned.

**Competency.** One skill inside a framework, for example Collaboration, or SFIA's
`PROG`. Belongs to exactly one framework.

**Level.** One scoring band of one competency, with a text descriptor. Belongs to a
competency, not to a framework. This matters, see §5.

**Reflection.** The container for one student's work in one context (a sprint, or a gig).
Has a status: `draft`, `submitted`, `assessed`.

**Reflection entry.** One row per reflection per competency. Holds the narrative text.
Evidence and scores hang off entries, not off reflections. This is the hub of the schema.

**Score.** One person's rating of one entry. Rows, not columns. Tagged with
`scorer_role`: `self`, `assessor`, `supervisor`, `employer`.

**Counter-score.** A score with a role other than `self`. The second opinion.

**Evidence.** A file or link attached to an entry to support what the narrative claims.

**Radar.** The self-versus-assessor chart. Axes are the framework's competencies, so the
number of axes and the scale both vary by framework.

## 3. Stack

| Layer | Technology |
|---|---|
| Database | MySQL 9.7 LTS, self-hosted on an Oracle Cloud VPS |
| Backend | PHP 8.5 / Laravel 13, JSON API |
| Frontend | React 19 + Vite + TypeScript |
| Charts | recharts |
| Auth | Laravel Sanctum bearer tokens |
| Storage | Server filesystem via Laravel's filesystem abstraction |
| Contract | OpenAPI 3, `docs/openapi.yaml` |

The stack was set by the client to match their live platform. Do not propose replacing it.

Repository layout:

```
/db/01-schema.sql          the DDL, applied centrally to the shared instance
/db/02-seed.sql            demo data
/api                       Laravel
/web                       React
/docs/openapi.yaml         the API contract
/docs/adr/                 architecture decision records
```

MySQL is self-hosted on a shared Oracle Cloud VPS, so there is no local database to set
up. See ADR #14.

## 4. Architecture

Three layers, one direction of dependency:

```
React  ->  Laravel API  ->  MySQL
```

The frontend never talks to the database. It only calls the API, which means business
rules cannot be bypassed by the interface.

The API was specified before either side was built. The frontend develops against a mock
server generated from `openapi.yaml` (`prism mock`), and the backend implements the same
contract. Both meet in the middle. This is why the contract is a source of truth rather
than documentation written afterwards.

Analytics endpoints read from SQL views (`v_radar`, `v_calibration_gap`,
`v_coverage_gaps`, `v_framework_scale`) rather than assembling data in PHP. Controllers
serialise; they do not aggregate.

## 5. The schema, and the reasoning behind it

Fourteen tables in four zones.

### Zone 1: integration seam
`users`, `gigs`, `sprints`, `gig_participants`

Alumable owns identity and gigs. We have no access to their database. These tables are
thin local mirrors, and each of `users` and `gigs` carries an `external_ref` holding
Alumable's own id for the same record. That is the entire coupling surface. An adapter
maps their records to ours through those two columns, and nothing else in the schema
knows Alumable exists. In the MVP the refs are null.

`gig_participants` holds role, not `users`. The same person can be a student on one gig
and an assessor on another, so a global role column would be wrong the first time that
happens. Every authorisation decision resolves through this table.

### Zone 2: framework engine
`frameworks`, `competencies`, `levels`, `framework_assignments`

The rubric is data. No competency name, scale bound or level descriptor appears anywhere
in application code. Adding a framework means inserting rows.

**Levels belong to competencies, not to frameworks.** This looks like over-normalising
until you load SFIA 9, where each skill is only valid across part of the seven-point
responsibility scale: one skill runs 3 to 5, another runs 2 to 7. If the scale sat on the
framework, La Trobe's flat 1 to 4 would fit and SFIA would not. Because of this,
`frameworks` has no `scale_min` or `scale_max`; the scale is computed from the level rows
via `v_framework_scale`.

`framework_assignments` is a table rather than a column on `gigs` because the assignment
is an event with an actor: who chose the rubric and when.

### Zone 3: the record
`reflections`, `reflection_entries`, `scores`, `evidence`

`reflections.user_id` and `reflections.gig_id` use `ON DELETE RESTRICT`, not `CASCADE`.
Deleting a gig fails loudly rather than quietly wiping the reflections written about it.
Student ownership is a database constraint, not a policy document. `sprint_id` uses
`SET NULL` so reorganising sprints loosens context rather than blocking the change.

`framework_version` is stored on `reflections` as a copied string alongside
`framework_id`. This looks redundant. It is not: the id points at a row that can change,
while the copied string is a snapshot of exactly what the student was scored against. A
record intended to be readable in 2040 needs the snapshot.

`reflection_entries` is the hub. One row per reflection per competency. Narrative,
evidence, and scores all attach here, because the assessment unit is the competency, not
the sprint. Entries are created eagerly when a reflection is created, one per competency
in the framework, so the stepper always has its full set of pages and progress is a count
rather than a reconstruction.

`scores` are rows, not `self_score` and `assessor_score` columns. The brief names
assessors, supervisors and employers as scorers, so two columns were wrong from the start.
Rows also record who scored and when, and adding a scorer type needs no migration. The
radar is one query grouped by `scorer_role`.

`scores.level_id` is a foreign key to `levels`, not an integer. A score therefore cannot
reference a level that does not exist. See §7 for the check the database cannot do.

### Zone 4: audit trail
`events`, `exports`

`events` is an append-only log with a `metadata` JSON column, so one table serves every
event type. Notifications are derived from it; there is deliberately no notifications
table.

`exports` is the audit trail proving the exportable-record requirement works, and doubles
as the job record for async export generation.

## 6. MySQL specifics that will trip you up

**All timestamps are `datetime(6)`, never `timestamp`.** MySQL's `TIMESTAMP` type stops
working in January 2038. The product's headline claim is a record that outlives that. All
values are UTC by application convention.

**`reflections` has two generated columns**, `gig_key` and `sprint_key`, which coalesce a
null context id to a sentinel UUID. MySQL has no `UNIQUE NULLS NOT DISTINCT`, and treats
every null as distinct in a unique index, so without the sentinel a student could create
unlimited gig-level reflections on the same gig. The unique index covers
`(user_id, gig_key, sprint_key)`. These columns are database-generated: never write to
them, never put them in `$fillable`. A duplicate surfaces as a MySQL 1062 error, which
the API catches and renders as `409 DUPLICATE_REFLECTION`.

**`frameworks.fw_key`** is named that way because `key` is reserved in MySQL.

**Primary keys are `char(36)` UUIDs**, not auto-increment integers. Ids appear in exported
records and URLs; sequential integers would leak row counts and allow enumeration of other
students' reflections. Every Eloquent model needs `HasUuids`, `$keyType = 'string'` and
`$incrementing = false`.

**Enums are `CHECK` constraints on varchar columns**, not MySQL `ENUM` types, because
altering a real enum type is awkward and hard to reverse.

## 7. Business rules, and where each one lives

Each rule lives in exactly one place. Do not duplicate them, and do not add a second
implementation in a different layer.

**Level belongs to the entry's competency.** A `level_id` must belong to the competency of
the entry being scored. The database cannot express this without denormalising, so it is
enforced in the service layer, in the two scoring endpoints only. This is a known
limitation and it is documented on the ERD rather than hidden. Error:
`LEVEL_NOT_IN_COMPETENCY`.

**Assessor scoring lower must comment.** If a counter-score is below the student's self
score, a comment is mandatory. Also mandatory whenever the framework's `comment_required`
flag is set. Lives in the counter-score endpoint. Error: `COMMENT_REQUIRED`.

**The submit gate.** A reflection can only be submitted if every entry has a narrative,
every entry has a self score, and, when the framework requires it, every entry has
evidence. Lives in the submit endpoint. Errors: `NARRATIVE_REQUIRED`,
`SELF_SCORE_MISSING`, `EVIDENCE_REQUIRED`, each returning the offending entry ids in
`details`.

**Role resolution.** The caller's role is always resolved server-side from
`gig_participants` for the gig in question. The client never sends a role. Authorisation
lives in policies, nowhere else.

**Status lifecycle.** `draft` -> `submitted` -> `assessed`, never backwards. `draft` is
the only editable state. A reflection becomes `assessed` automatically when every entry has
a counter-score.

## 8. API conventions

Base path `/api/v1`. Bearer token on every request. There is no login endpoint in the MVP.
Three tokens are seeded instead. See ADR #15.

Field names are snake_case everywhere, matching the database exactly, so there is no
mapping layer between database, API and frontend. Do not camelCase JSON.

Every non-2xx response uses one envelope:

```json
{ "error": { "code": "COMMENT_REQUIRED", "message": "...", "details": {} } }
```

Codes are enumerated in `openapi.yaml` so the frontend can switch on them. Status codes:
400 for validation and rule failures, 401 for a bad token, 403 for the wrong role, 404 for
not found or not yours (deliberately indistinguishable), 409 for conflicts.

Self-scoring is `PUT` because it is an upsert: a student changing their mind before
submitting replaces the score. Counter-scoring is `POST` because a second attempt is an
error. That distinction is deliberate, not an inconsistency to tidy up.

Export returns `202` with a job id; generation is a queued job and the client polls.

## 9. Frontend conventions

All colour, spacing and radius values come from CSS variables defined in one tokens file.
No raw hex in components. Light and dark are both supported through a `data-theme`
attribute, which only works if every value is a token.

The API client is a single typed wrapper. Types are generated from `openapi.yaml`
(openapi-typescript), so contract drift becomes a compile error rather than a runtime
surprise.

Every screen ships four states, not one: loaded, loading (skeletons rather than spinners),
empty, and error. The error state surfaces the envelope's `message` and switches on `code`
where it matters, particularly the submit gate, which reports which entries failed.

The radar component takes axes and scale as props. It is never hardcoded to six axes or a
four-point scale, because SFIA has neither.

## 10. Out of scope

Do not build these. They were considered and cut, and the reasoning is in the ADRs.

**AI features.** An earlier scope included an LLM that suggested which competencies a
piece of writing evidenced. It is cut. There are no `ai_suggestions` or embedding tables,
and no AI writes to any table. If you find references to them in old documents, they are
stale.

**Framework creation from scratch.** Frameworks are seeded. A supervisor can copy a seeded
base and then rename competencies or reword level descriptors, but cannot build one from
nothing, add or remove competencies, or change level counts. See ADR #16.

**Re-scoring.** An assessor cannot revise a submitted score. A second attempt is a 409.

**Pagination.** Result sets are small. Revisit only if a list exceeds roughly 200 rows.

**Notifications as stored state.** Derived from `events` and the review queue.

## 11. Hard rules

Never invent a column or an endpoint. The schema and `openapi.yaml` are the sources of
truth; read them.

Never weaken a database constraint to make a test pass. The constraints encode product
requirements, particularly `RESTRICT` on reflection ownership.

Never edit the ERD or reverse a recorded decision without writing a superseding ADR in
`/docs/adr`. Decisions are appended, not rewritten.

Never write to generated columns.

Never accept a role from the client.

Never duplicate a business rule into a second layer.

Never draft any team member's reflective compendium. Those are individually graded
reflections on their own learning, and an agent writing them is academic misconduct. The
product itself is built on the principle that a machine can scaffold reflection but never
author it; the same rule applies to the people building it.

## 12. Where to look

`db/01-schema.sql` for the schema, including comments explaining each unusual choice.
`docs/openapi.yaml` for the contract. `docs/adr/` for why any given decision was made.
`docs/erd.png` for the diagram, whose legend lists the constraints that crow's foot
notation cannot show.

If something in this document contradicts the schema or the contract, the schema and the
contract win, and the contradiction is a bug in this document worth reporting.
