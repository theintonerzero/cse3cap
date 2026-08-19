# CLAUDE.md

Rules for agents working in this repository. Background and reasoning live in
`docs/PROJECT-CONTEXT.md`. Read that first if you have not.

## What this is

The Reflection Diary: a competency reflection and scoring module for Alumable, an edtech
platform. Students write reflections per sprint on a gig, score themselves against a
swappable rubric, and a supervisor or assessor counter-scores. Both appear on a radar
chart. The record belongs to the student and is exportable.

University capstone project (La Trobe CSE3CAP, Semester 2 2026), five people, real client.

## Stack

MySQL 9.7 LTS on a shared VPS · PHP 8.5 / Laravel 13 · React 19 + Vite + TypeScript ·
recharts · Sanctum tokens · REST with an OpenAPI 3 contract.

The client set the backend stack. Do not propose replacing it.

## Sources of truth

In this order. If they disagree, the higher one wins and the lower one is a bug.

1. `db/01-schema.sql`, the schema
2. `docs/openapi.yaml`, the API contract
3. `docs/adr/`, why decisions were made
4. `docs/PROJECT-CONTEXT.md`, background
5. This file

`docs/Frontend-and-Backend.md` is the seam between `api/` and `web/`: what crosses it, what
is generated from what, and what drifts without anyone noticing. Read it before your first
change in either folder. `docs/Retention-and-Erasure.md` covers what the `ON DELETE`
behaviour means for deleting a person.

Never invent a column or an endpoint. Read the schema and the contract first.

## Hard rules

**Never weaken a database constraint to make something pass.** The constraints encode
product requirements. In particular `ON DELETE RESTRICT` on `reflections.user_id` and
`reflections.gig_id` is what makes the record student-owned.

**Never write to generated columns.** `reflections.gig_key` and `sprint_key` are
database-generated. Keep them out of `$fillable`. A duplicate surfaces as MySQL 1062 and
is rendered as `409 DUPLICATE_REFLECTION`.

**Never accept a role from the client.** Roles resolve server-side from
`gig_participants` for the gig in question, in `api/app/Services/RoleResolver.php`.
Authorisation lives in `api/app/Policies/`, nowhere else.

**Never duplicate a business rule.** Each rule has exactly one implementation, and this is
where it lives. Read the class before you write anything that touches its rule.
- submit gate, evidence included → `api/app/Services/SubmitGate.php`
- comment required when a counter-score is lower → `api/app/Services/Scoring.php`
- level belongs to the entry's competency → `api/app/Services/Scoring.php`
- assessed once every entry has a counter-score → `api/app/Services/Scoring.php`
- framework immutable once referenced → `api/app/Services/FrameworkEditing.php`
- one rubric per gig → `api/app/Services/FrameworkAssigner.php`
- one entry per competency, on create → `api/app/Services/ReflectionCreator.php`

**Never mutate a framework that is in use.** Editing is copy-then-edit. A framework
referenced by any reflection is permanently read-only (`409 FRAMEWORK_IN_USE`). Mutating
one would silently change what past students were scored against.

**Never change the schema or reverse a decision without a superseding ADR** in
`docs/adr/`. Decisions are appended, never rewritten or deleted.

**Never use MySQL `TIMESTAMP`.** It stops working in January 2038 and this product is a
record that outlives that. Everything is `DATETIME(6)`, UTC by application convention.

**Never draft a team member's reflective compendium.** Those are individually graded
reflections on personal learning. An agent writing one is academic misconduct. The product
itself is built on the principle that a machine can scaffold reflection but never author
it; the same applies to the people building it.

## Conventions

**Documentation:** every document this project keeps lives in `docs/` and is listed in the
README table. Do not create a markdown or HTML file anywhere else. A plan, a summary or a
note to yourself either belongs in `docs/` or belongs in your scratchpad outside the
repository, never at the repository root. `scripts/guard-docs-location.sh` refuses it,
whether you reach for the Write tool or for `cat >`. Agent and skill definitions under
`.claude/` are configuration rather than documentation, and a `README` next to the thing it
describes is fine.

**Naming:** snake_case in the database, in JSON, and in frontend types. There is no
mapping layer. Do not camelCase API fields.

**Primary keys:** `char(36)` UUIDs. Every Eloquent model needs `HasUuids`,
`$keyType = 'string'`, `$incrementing = false`.

**Errors:** one envelope for every non-2xx response.
```json
{ "error": { "code": "COMMENT_REQUIRED", "message": "...", "details": {} } }
```
Codes are enumerated in `docs/openapi.yaml`. 400 validation or rule failure, 401 bad
token, 403 wrong role, 404 not found or not yours, 409 conflict.

**Backend layering:** FormRequests validate shape. Service classes hold business rules.
Policies hold authorisation. Controllers orchestrate and serialise, nothing more.
Analytics controllers read the SQL views (`v_entry_score`, `v_radar`,
`v_calibration_gap`, `v_coverage_gaps`, `v_framework_scale`) and do not aggregate in PHP.

**Frontend:** no raw hex anywhere. All colour, spacing and radius come from CSS variables
in `web/src/tokens.css`. API types are generated from `docs/openapi.yaml`; do not
hand-write them. The radar component takes axes and scale as props and is never hardcoded
to six axes or a four-point scale.

**Every screen ships four states:** loaded, loading (skeletons, not spinners), empty, and
error. Not three.

## Out of scope

Do not build these. They were considered and cut.

- AI features of any kind. No suggestion tables, no embeddings. Older documents may
  reference them; those references are stale.
- Framework creation from scratch, or adding/removing competencies. Copy from a seeded
  base, rename and reword only.
- Re-scoring. An assessor cannot revise a submitted score; a repeat is a 409.
- A login screen. Three seeded tokens; auth exists server-side.
- Pagination, a notifications table, real-time updates, multi-tenancy.

## Shared database

MySQL runs on a shared VPS, not locally. Everyone points at the same instance.

- Do not run migrations without saying so. A bad one takes out everyone's environment.
- Treat seeded users, gigs and frameworks as fixed reference data. Create new rows to
  experiment; do not edit the seeds.
- The MySQL MCP connection is read-only by design. Do not work around it.

## Before you finish

- Did you update `docs/openapi.yaml` in the same change as the endpoint?
- Does every new rule live in exactly one place?
- Did you add loading, empty and error states?
- Does it need an ADR?
