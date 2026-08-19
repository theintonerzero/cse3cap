Architecture Decision Records
Alumable Reflection Diary / CSE3CAP / Team 404 Not Found

An ADR captures one significant decision: the forces that shaped it, what we chose, what it
costs, and what we rejected. Records are append only. A decision that changes later is not
edited or deleted, a new record supersedes it and the old one is marked. That trail is the
point, since it shows how the design actually developed.

Template for new records is in TEMPLATE.md.

Index

#1  PostgreSQL as the primary datastore ............ Superseded by #10
#2  pgvector for the MVP, store behind interface ... Superseded by #10
#3  Competency frameworks stored as data ........... Accepted
#4  AI suggestions kept separate from scores ....... Superseded by #10
#5  Framework version snapshotted per reflection ... Accepted
#6  RESTRICT rather than CASCADE on ownership ...... Accepted
#7  Retrieve then score for competency tagging ..... Superseded by #10
#8  Server side inference, not on device ........... Superseded by #10
#9  No fine tuning ................................. Superseded by #10
#10 Remove AI scope, move to MySQL ................. Accepted, versions per #18
#11 MySQL specific schema workarounds .............. Accepted, extended by #19
#12 React, Vite and TypeScript for the frontend .... Accepted, versions per #18
#13 Contract first with OpenAPI and a mock server .. Accepted
#14 Shared VPS database instead of local Docker .... Accepted, access per #21
#15 Three seeded tokens instead of a login screen .. Accepted
#16 Copy then edit for frameworks .................. Accepted
#17 Educator mapped to the supervisor role ......... Accepted
#18 Stack versions moved to current releases ....... Accepted
#19 Virtual generated columns, context check ....... Accepted
#20 Laravel baselines the schema, does not own it .. Accepted
#21 MySQL public with mandatory TLS ................ Accepted
#22 A Laravel seeder replaces the sql seed file .... Accepted
#23 A counter-score is a class, not a role ......... Accepted
#24 Coverage means never scored, own rubrics ....... Accepted
#25 Export status is stored, not derived ........... Accepted
#26 recharts for the radar ......................... Accepted
#27 React Router for routing ....................... Accepted
#28 CSS variables and modules, not Tailwind ........ Accepted
#29 Files via Laravel's filesystem abstraction ..... Accepted
#30 An export is a queued job, row is record ....... Accepted
#31 The dependencies deliberately not taken ........ Accepted
#32 oxlint in place of ESLint ...................... Accepted
#33 A gig is scored against one rubric ...... Extended by #35
#34 Counter-scores close when a reflection does .... Accepted
#35 One rubric per gig, in the key itself .......... Accepted

===============================================================

ADR #1: PostgreSQL as the primary datastore
Status: Superseded by #10
Date: 2026-07-30
Supersedes: the brief's MySQL requirement

Context:
The brief specifies MySQL. The meeting confirmed that our team will not have access to
Alumable's production db, that the deliverable is an MVP demonstrating ideas rather than a
deployed integration, and that any db is acceptable. The system needs relational data
(frameworks, competencies, levels, scores) and vector data (embeddings for retrieval based
tagging and semantic search).

Decision:
PostgreSQL 18 or later, with the `pgvector` extension, as the single datastore.

Consequences:
Positive:
One datastore covers relational and vector with no synchronisation between systems. Richer
constraint support via `CHECK`, partial indexes and `jsonb` lets integrity rules live in the
schema. Views can serve the analytics layer directly, which keeps the service thin.

Negative:
Diverges from the brief's stack and has to be justified in the report. Migrating to
Alumable's MySQL in prod would mean reworking the Postgres specific features we rely on.
Some team members may be less familiar with Postgres.

Alternatives:
MySQL with a separate vector store. Two systems to keep consistent, and we have no access to
their instance regardless.

MySQL with embeddings as JSON columns and similarity computed in Python. No index support,
so it doesn't scale, and it's a weaker engineering story in the report.

===============================================================

ADR #2: pgvector for the MVP, vector store behind an interface
Status: Superseded by #10
Date: 2026-07-30

Context:
Alumable runs Qdrant in prod, probably for gig and skill matching. We don't have access to
their collections, so sharing a vector space isn't possible. We still need embeddings for the
retrieve then score tagger and for semantic search over the record. David asked for something
that reads as a module of their platform rather than a standalone app.

Decision:
Use pgvector with HNSW indexes for the MVP. Route every vector operation through a narrow
interface of `embed`, `upsert`, `search` and `delete`, implemented in a single module.

Consequences:
Positive:
Swapping to Qdrant in prod becomes a config change for the Alumable team rather than a
rewrite. Demonstrates integration readiness, which is what David asked for. No second service
to run or deploy for the MVP.

Negative:
Research suggests the swap is straightforward but it was never tested against a second
implementation, so the portability is unproven. pgvector and Qdrant differ in metadata
filtering and payload semantics, so the abstraction may leak once a second implementation is
actually written.

Alternatives:
Run our own Qdrant instance. A second service to operate with no consistency benefit, since
we aren't sharing Alumable's collections either way.

Use pgvector directly with no abstraction. Undermines the integration readiness argument,
which is central to the deliverable.

===============================================================

ADR #3: Competency frameworks stored as data, not as code
Status: Accepted
Date: 2026-07-30

Context:
The brief requires interchangeable competency frameworks. The two we know about are
structurally different. La Trobe's has six flat competencies scored 1 to 4, whereas SFIA 9 has
hundreds of skills grouped into categories, scored across seven responsibility levels, with
each skill valid over only a subrange of those levels.

Decision:
Model the rubric as three tables: `frameworks`, `competencies` and `levels`. No competency
name, scale bound or level descriptor appears in the app's code. Levels attach to competencies
rather than to frameworks, so each competency carries its own valid range.

Consequences:
Positive:
Adding a framework is inserting rows, not changing code. Radar axes and scale derive from
data, so the vis serves any framework unchanged. One implementation covers every framework.

Negative:
Queries are more join heavy than a denormalised design would be. There's no compile time
guarantee that a competency code exists, so all validation happens at runtime. Seeding is
more work than hardcoding.

Alternatives:
Hardcode the six competencies. Fails the interchangeability req immediately and would need
rewriting the first time SFIA is loaded.

A config file per framework. Can't be edited at runtime, can't be assigned per gig, and gives
scores no referential integrity against the rubric.

===============================================================

ADR #4: AI suggestions kept separate from scores
Status: Superseded by #10
Date: 2026-07-30

Context:
The AI proposes a competency level for each reflection. These reflections are graded work. La
Trobe's reflective compendium is worth 25% of the subject grade. The system has to
demonstrate, not just assert, that an AI cannot author an assessment score or the reflective
writing itself.

Decision:
A dedicated `ai_suggestions` table. The AI service has write access to that table and to
nothing else. Accepting a suggestion is a human action that inserts a row into `scores`.

Consequences:
Positive:
The AI can't fake grades or write reflections because it has no write path to `scores` at all,
which is a property an assessor can verify rather than take on trust. The `accepted` and
`reviewed_at` columns yield a real world acceptance rate, which is eval data gathered without
hand labelling. Suggestions are reproducible because model name and framework version are
stored alongside them.

Negative:
The scoring UI has to read two tables rather than one. A suggestion and the score it produced
aren't linked by a fk, so tracing which suggestion led to which score isn't possible without a
nullable `suggestion_id` on `scores`.

Alternatives:
Provisional rows in `scores` flagged as unconfirmed. Creates a code path in which a model
writes an assessment score, which is exactly the property we need to rule out.

Suggestions held only in memory and never persisted. Loses both the eval data and the audit
trail.

===============================================================

ADR #5: Framework version snapshotted on each reflection
Status: Accepted
Date: 2026-07-30

Context:
The record is meant to stay meaningful for a graduate's whole career. Rubrics get revised over
time. A fk to `frameworks` points at a row whose contents can change, which means a score's
meaning could silently shift years after it was awarded.

Decision:
`reflections` stores `framework_version` as a copied text value alongside `framework_id`.

Consequences:
Positive:
A score made in 2026 stays interpretable after the rubric is revised. Rubric revisions never
mutate historical records.

Negative:
The value is denormalised and can drift from the referenced row if a version string is edited
in place. We mitigate that by treating `frameworks` rows as immutable once assigned, so a
revision creates a new row with a new version rather than editing an existing one. Minor
storage overhead.

Alternatives:
Rely on `framework_id` alone. The referenced row can change underneath it, so the score loses
its meaning over time.

Full temporal versioning of every rubric table. Overkill for an MVP, and the snapshot achieves
the same outcome for the case that actually matters.

===============================================================

ADR #6: RESTRICT rather than CASCADE on reflection ownership
Status: Accepted
Date: 2026-07-30

Context:
A persistent, student owned record that outlives the subject is a must have req. `users` and
`gigs` are local mirrors of Alumable entities that may be archived or removed upstream. The
conventional default for these fks is `ON DELETE CASCADE`.

Decision:
`reflections.user_id` and `reflections.gig_id` use `ON DELETE RESTRICT`.
`reflections.sprint_id` uses `ON DELETE SET NULL`, so reorganising sprint structure loosens a
reflection's context rather than blocking the change.

Consequences:
Positive:
Deleting a gig can't destroy the reflections written about it, because the deletion fails
loudly instead. Student ownership is enforced by a db constraint rather than a policy doc,
which is a much stronger claim to make in the report.

Negative:
Removing test data needs explicit ordering. A real right to erasure request needs a deliberate
deletion routine rather than relying on a cascade. Arguably that's the correct behaviour for
personal data, but it's extra work.

Alternatives:
`ON DELETE CASCADE`. Directly contradicts the core product promise, since a gig being archived
would wipe the student's record with it.

Soft deletes everywhere. Adds a `deleted_at` filter to every query for little MVP benefit.

===============================================================

ADR #7: Retrieve then score for competency tagging
Status: Superseded by #10
Date: 2026-07-30

Context:
The tagger has to work for La Trobe's six competencies and for SFIA 9. A complete SFIA rubric
of hundreds of skills across seven levels won't fit in a prompt, and including it would be
expensive and slow even where it did fit.

Decision:
A two stage pipeline. Embed the reflection, retrieve candidate level descriptors by vector
similarity, then have an LLM confirm the level and quote supporting evidence for the shortlist
only.

Consequences:
Positive:
Scales to frameworks where whole rubric prompting can't. Smaller prompts mean lower cost and
latency. Suggestions are grounded in actual rubric text rather than the model's prior. One
code path serves every framework.

Negative:
Two stages means two failure modes and more moving parts. Retrieval can miss a correct
competency, which caps recall no matter how good the LLM is, so retrieval recall@k has to be
measured separately in the eval. Level descriptors have to be embedded and kept in sync
whenever a rubric is edited.

Alternatives:
Whole rubric in the prompt. Doesn't scale to SFIA, and costs more per call even for the
frameworks where it would work.

Train a classifier per framework. No labelled corpus exists, and a per framework model breaks
the interchangeability from ADR #3.

===============================================================

ADR #8: Server side inference, not on device
Status: Superseded by #10
Date: 2026-07-30

Context:
On device inference is practical now through platform APIs and quantised small models, and it
would keep reflection text off the network entirely. Alumable's users are uni students though,
which is a population with a wide spread of device ages and capabilities.

Decision:
All model inference runs server side.

Consequences:
Positive:
Every student gets the same suggestion for the same reflection regardless of device, which is
a req rather than a preference when the output feeds an assessment. No increase in app bundle
size, no battery or thermal cost. The model can be changed without an app store release.

Negative:
Needs connectivity, so there's no offline tagging. Reflection text leaves the device.
Acceptable for the MVP since no real student data is involved.

Alternatives:
On device via Apple Foundation Models or Gemini Nano. Output varies with device, model version
and quantisation, which becomes an equity problem when suggestions inform graded assessment.

Hybrid with on device PII redaction before sending. Genuinely good option for prod, out of
scope for the MVP.

===============================================================

ADR #9: No fine tuning
Status: Superseded by #10
Date: 2026-07-30

Context:
A fine tuned model could plausibly beat prompting on competency classification. The project
has around ten weeks, no labelled corpus, and core deliverables that aren't the tagger.

Decision:
Prompt engineering with schema constrained output, output validation and formal eval. No fine
tuning.

Consequences:
Positive:
Needs no labelled training corpus, which is lucky because none exists. Works immediately
across both frameworks, where a fine tuned model would be specific to the rubric it was
trained on and would break interchangeability. Frees up several weeks for the core
deliverables.

Negative:
Probably leaves some accuracy unclaimed. Creates a dependency on a hosted model whose
behaviour can change under us, which we mitigate by pinning model versions and recording model
name against every suggestion.

Alternatives:
Fine tune a small open weight model. Needs thousands of labelled reflections, and a framework
specific model contradicts ADR #3.

Embedding classifier as the primary approach. Rejected as primary but kept as the eval
baseline, so the LLM's advantage can be quantified rather than assumed.

===============================================================

ADR #10: Remove AI from scope, move to MySQL
Status: Accepted. Version pin revised by #18
Date: 2026-08-01
Supersedes: #1, #2, #4, #7, #8, #9

Context:
After a scope review the team agreed to cut the AI features and return to the brief's original
MySQL requirement. The AI work was the reason Postgres was chosen in ADR #1, since pgvector
was needed for embeddings. With that gone the reason for diverging from the client's stack
disappears with it.

Decision:
MySQL 8.4 as the datastore. Remove `ai_suggestions`, `entry_embeddings` and `level_embeddings`
from the schema, along with every AI feature: the competency tagger, reflection prompt
generation, semantic search and theme clustering.

Consequences:
Positive:
Back on the client's stack, which strengthens the integration story rather than needing a
justification in the report. Fourteen tables instead of seventeen, and the removed ones were
leaf tables, so nothing structural had to change. Frees a large amount of build time for the
core reflection and scoring features, which are the actual must haves.

Negative:
Loses the most technically distinctive feature of the project. Five of the original ten Data
and AI deliverables go with it, so that lane rebalances toward the framework engine, the
analytics layer and the integration contract. MySQL lacks several Postgres features the schema
relied on, handled in ADR #11.

Alternatives:
Keep the AI features and stay on Postgres. Rejected at the scope review as more than the team
can deliver alongside the must haves.

Keep Postgres without the AI features. Postgres is a fine db, but with no vector requirement
there is no argument for diverging from the client's stack, and the report would have to
defend a choice with no remaining benefit.

===============================================================

ADR #11: MySQL specific schema workarounds
Status: Accepted
Date: 2026-08-01

Context:
Moving to MySQL under ADR #10 broke three things the Postgres schema relied on. Each needed a
deliberate answer rather than a silent downgrade.

Decision:
Three workarounds, all documented on the ERD legend and in schema comments.

All timestamps are `DATETIME(6)`, never `TIMESTAMP`, stored as UTC by application convention.
MySQL's `TIMESTAMP` stops working in January 2038 and the product's headline claim is a record
that outlives that.

`reflections` gains two generated columns, `gig_key` and `sprint_key`, which coalesce a null
context id to a sentinel uuid. The unique index covers `(user_id, gig_key, sprint_key)`. MySQL
has no `UNIQUE NULLS NOT DISTINCT` and treats every null as distinct in a unique index, so
without the sentinel a student could create unlimited gig level reflections on the same gig.

`frameworks.key` is renamed `fw_key`, since `key` is reserved in MySQL.

Consequences:
Positive:
Every constraint the Postgres schema enforced is still enforced. The 2038 reasoning is a
genuinely good illustration of the product requirement driving a technical choice, which is
worth a line in the report.

Negative:
The sentinel columns are visibly a workaround and need explaining to anyone reading the
schema. They are database generated, so they must never appear in `$fillable`, and a violation
surfaces as a MySQL 1062 error which the API has to catch and translate into a 409.

Alternatives:
Enforce the one reflection per context rule in application code. Fails the moment two requests
race, which is exactly what a unique index exists to prevent.

Make `gig_id` and `sprint_id` non nullable. Would remove the need for sentinels but also
removes gig level reflections, which the brief asks for.

===============================================================

ADR #12: React, Vite and TypeScript for the frontend
Status: Accepted. Version pin revised by #18
Date: 2026-08-06

Context:
The client set the backend stack but not the frontend. The radar chart is a must have, the
frontend and backend are built in parallel by different people, and four of the five of us are
stronger in PHP than JS.

Decision:
React 18 with Vite and TypeScript. recharts for the radar. React Router for routing. CSS
variables with CSS modules for styling.

Consequences:
Positive:
recharts has a first class radar component, which is the one chart we cannot do without.
TypeScript types are generated from the OpenAPI contract, so a backend field rename becomes a
compile error rather than a blank screen at a demo. Vite is only a dev server and a bundler,
so no framework concepts leak into the components.

Negative:
It is a second language and toolchain for a team that is mostly PHP. TypeScript adds friction
early, before the generated types start paying for themselves.

Alternatives:
Blade with Livewire. Everything stays in Laravel, no separate frontend, no contract needed
between the halves, and genuinely less total work. Rejected because it merges the frontend and
backend lanes into one, which is awkward with five people and defined roles, and it weakens the
"this is a module that could plug into their platform" story.

Next.js. Brings routing, server rendering and its own conventions, none of which we need with
Laravel as the backend.

Tailwind. The design tokens already exist as CSS variables from the Figma work, so Tailwind
would mean re-expressing them in a config for no gain.

===============================================================

ADR #13: Contract first with OpenAPI and a mock server
Status: Accepted
Date: 2026-08-06

Context:
Frontend and backend are built by different people at the same time. The default is that one
waits for the other, or both guess at the shape of the data and reconcile painfully later.

Decision:
Write `docs/openapi.yaml` before either side starts. The frontend develops against a mock
server generated from it (`prism mock`), the backend implements the same spec, and TypeScript
types are generated from it. Any PR that changes an endpoint updates the contract in the same
PR.

Consequences:
Positive:
Both halves progress in parallel from day one. Contract drift becomes a compile error on the
frontend rather than a runtime surprise. The contract doubles as the integration deliverable
we owe the client, since it documents exactly what the module exposes and expects.

Negative:
Up front work before any feature exists, which feels slow in week one. The contract has to be
kept honest, and a PR that quietly diverges from it undoes the benefit for everyone.

Alternatives:
Backend first, frontend follows. Leaves the frontend blocked for weeks and wastes a lane.

Generate the spec from the implementation afterwards. Documents what was built rather than
agreeing what to build, so it cannot be used to unblock parallel work.

===============================================================

ADR #14: Shared VPS database instead of local Docker
Status: Accepted. Version pin revised by #18, access model settled by #21
Date: 2026-08-06

Context:
Everyone needs the same database with the same schema and seed data. The obvious answer is
Docker Compose in the repo, but not everyone on the team is comfortable with Docker, and
setup problems in week one cost more than they save.

Decision:
One MySQL 8.4 instance on a team VPS. Everyone connects to it with credentials from `.env`.
No local database, no containers.

Consequences:
Positive:
Zero setup for four of five people. Everyone sees identical data, so a bug or a demo looks the
same for all of us. The schema is applied once, centrally, rather than five times.

Negative:
Requires connectivity to work at all. One person's bad migration takes out everyone's
environment rather than just their own, so migrations have to be announced before they run.
Shared seed data means an experiment on Jane's reflections changes what everyone else sees,
so the seeds are treated as fixed reference data.

Alternatives:
Docker Compose per developer. Better isolation and offline capability, rejected on team
comfort.

Everyone installs MySQL natively. Five different setups on three operating systems, which is
the problem containers exist to solve.

===============================================================

ADR #15: Three seeded tokens instead of a login screen
Status: Accepted
Date: 2026-08-06

Context:
The system needs to know who the user is, since almost every rule depends on it. But in
production Alumable owns identity, so a login screen we build is something we would throw
away. Building and polishing one costs time the must haves need.

Decision:
No login screen. Three Sanctum tokens seeded, one per role: student, assessor, and supervisor
which also covers the educator screens. Auth exists server side as normal.

Consequences:
Positive:
Role switching in a demo is instant, which is better than logging out and back in. Auth,
policies and role resolution are all real, so nothing about the security model is faked. A
real login form later is an afternoon's work and changes nothing else in the contract.

Negative:
Anyone with a token has full access to that role, so the tokens must not leak. Not a
production auth story, which needs stating plainly in the report rather than glossed.

Alternatives:
Full email and password login. Real, but throwaway work for a module that will sit inside a
platform that already handles identity.

No auth at all, with the user id in a query parameter. Would make the entire permission model
unenforceable and untestable.

===============================================================

ADR #16: Copy then edit for frameworks
Status: Accepted
Date: 2026-08-06

Context:
Educators need to adapt a rubric, which the Figma showed as "based on" plus "your copy". The
obvious implementation is a PATCH that edits a framework in place. That would work fine in
testing, where no historical reflections exist.

Decision:
Editing means copying. `POST /frameworks` deep copies a base framework's competencies and
levels into a new row owned by the caller. A framework referenced by any reflection is
permanently read only and mutation attempts return 409 `FRAMEWORK_IN_USE`. Editing is limited
to renaming competencies and rewording level descriptors.

Consequences:
Positive:
The version snapshot from ADR #5 stays meaningful, since the thing it points at can never
change. Educators get the adaptation they need. The rule is enforced server side, so the UI
cannot bypass it.

Negative:
More rows in the frameworks table over time, one per copy. Users may expect edit to mean edit,
so the UI has to make copying obvious rather than surprising. Adding and removing competencies
is out of scope, which is a real limitation on how far a rubric can be adapted.

Alternatives:
Edit in place. Silently changes what past students were scored against, which corrupts the
record model. It would pass every test we write and only fail once there is real historical
data.

Full versioning with an edit creating a new version automatically. Cleaner conceptually but
more machinery than an MVP needs, and copy then edit achieves the same protection.

===============================================================

ADR #17: Educator mapped to the supervisor role
Status: Accepted
Date: 2026-08-06

Context:
The Figma has three user types: student, assessor and educator. The schema has four roles:
student, assessor, supervisor and employer. There is no educator. Either it is a fifth role or
it maps to an existing one, and the seed data cannot be written until this is settled.

Decision:
Educator maps to the existing `supervisor` role. No schema change, no CHECK constraint edit.

Consequences:
Positive:
No migration, and the mapping is honest, since the person supervising a gig is the natural
person to decide which rubric applies to it. One fewer role to reason about in the permission
matrix.

Negative:
A supervisor can both manage frameworks and counter-score, so the educator and assessor
screens are available to the same user. That is probably desirable but it means the two flows
are not cleanly separated for demo purposes.

Alternatives:
Add `educator` as a fifth role. A CHECK constraint change plus a new row in the permission
matrix, for a distinction that does not clearly exist in the real workflow.

Reuse `employer` for framework management. Employers are external to the university, so
letting them define assessment rubrics is the wrong permission boundary.

===============================================================

ADR #18: Stack versions moved to current releases
Status: Accepted
Date: 2026-08-11
Revises the version pins in: #10, #12, #14

Context:
The versions recorded in #10, #12 and #14 were current when they were written. They are
not now. MySQL 9.7 became the first LTS since 8.4 in April 2026, PHP 8.3 went to security
only support, Laravel 13 shipped in March, and React 19 has been out for over a year.
Nothing was pinned anywhere yet, since `api/` and `web/` did not exist, so the cost of
changing our minds was a few lines of prose rather than a dependency upgrade.

The forcing function was provisioning the db. We had to install a specific version, and
installing an already superseded LTS on a box meant to outlive the semester made no sense.

Decision:
MySQL 9.7 LTS, PHP 8.5, Laravel 13, React 19, Vite 8. The client's stack is unchanged in
kind: still MySQL, still PHP and Laravel, so the integration argument in #10 stands
untouched. Only the numbers move.

Two things deliberately do not move to latest.

The OpenAPI contract stays at 3.1. Version 3.2 is out and is described as a drop in
change, but neither Prism nor openapi-typescript reads it, and those two are what the mock
server and the generated types depend on. Adopting it would break the parallel build that
record #13 set up, for a spec feature we do not use.

TypeScript is pinned to 6.x, not 7. TypeScript 7 is the native compiler rewrite, and
openapi-typescript 7.13 crashes on it with an unresolved upstream bug. Since #13 makes
generated types mandatory rather than optional, the generator picks the compiler version.

Consequences:
Positive:
The db has five years of premier support ahead of it rather than trailing an LTS that was
already superseded. PHP 8.3 was in security only support, which is a weak thing to defend
in a report. Nothing had to be upgraded, only rewritten, because no lockfile existed yet.

Negative:
Fewer answers on the internet apply cleanly to Laravel 13 and MySQL 9.7 than to the
versions they replace, which costs time when something goes wrong. The client runs some
MySQL 8 in prod, so an eventual integration crosses a major version, though the schema
uses nothing 9.x removed. Pinning TypeScript below latest is a debt that has to be revisited
once openapi-typescript catches up.

Alternatives:
Stay on the recorded versions. Consistent with the existing register, and defensible on
"do not change what works". Rejected because nothing was built yet, so there was nothing
working to protect, and shipping a capstone on a security only PHP release invites a
question we would rather not answer.

Take everything at absolute latest including OpenAPI 3.2 and TypeScript 7. Rejected on
evidence rather than caution. Both were tested and both break the contract first
workflow that #13 depends on.

===============================================================

ADR #19: Virtual generated columns, and the context check over the keys
Status: Accepted
Date: 2026-08-11
Extends: #11

Context:
`db/01-schema.sql` had been reviewed but never executed. Applying it to a real server for
the first time failed twice on the `reflections` table.

MySQL rejected `ck_refl_context` with error 3823, because a CHECK cannot reference a
column that carries an ON DELETE SET NULL referential action, and `sprint_id` has one from
#6. It then rejected the table outright with error 1215, because InnoDB will not accept a
STORED generated column whose source carries that same action, and `sprint_key` coalesces
`sprint_id`.

Both restrictions date to MySQL 8.0.16, so this was never going to work on 8.4 either. The
sentinel key design from #11 and the SET NULL rule from #6 are individually sound and were
mutually impossible as written.

Decision:
The generated columns become VIRTUAL rather than STORED. A unique index over a virtual
column is still materialised by InnoDB, so the one reflection per context guarantee is
unchanged, and #11 never specified a storage type.

`ck_refl_context` is expressed over the generated keys instead of the raw fks:
`gig_key <> sentinel OR sprint_key <> sentinel`. The generated columns carry no referential
action of their own, so the restriction does not apply. The two forms are equivalent, since
a key equals the sentinel exactly when its source id is null.

Consequences:
Positive:
Every constraint the design intended is still enforced, verified against MySQL 9.7: the
table creates, a reflection with neither gig nor sprint is rejected, and a duplicate
context still surfaces as 1062 for the API to render as 409. Neither #6 nor #11 had to be
reversed.

Negative:
The check now reads in terms of sentinels rather than nullability, which is a layer removed
from the rule a person would state out loud, so it needs the comment that sits above it.
Virtual columns are computed on read, which costs a little on the index maintenance path,
though at MVP row counts this is not measurable.

The wider lesson is the uncomfortable one. A reviewed schema that has never been run is
not a verified schema, and this cost an afternoon to find at provisioning time rather than
five minutes to find in week one.

Alternatives:
Drop `ck_refl_context` and rely on the service layer, which already returns
CONTEXT_REQUIRED. Rejected because it weakens a db constraint to work around a tooling
limit, and the app level rule was meant to be the second line, not the only one.

Change `sprint_id` to RESTRICT so both the check and the stored column become legal.
Rejected because it reverses #6 for an unrelated reason. Reorganising sprints would start
failing loudly, which is the opposite of what that record decided.

===============================================================

ADR #20: Laravel adopts the schema by baselining, not by owning it
Status: Accepted
Date: 2026-08-11

Context:
Two documents disagreed. CLAUDE.md ranks `db/01-schema.sql` as source of truth number one,
while the build scope asks for the DDL ported to migrations. Both cannot be fully true.
Meanwhile the schema is already applied to the shared instance, so `php artisan migrate`
against it would try to create fourteen tables that exist and fail.

Tests complicate it further. The schema needs generated columns, CHECK constraints and
VALUES row constructors, so sqlite is not an option and `RefreshDatabase` needs a real
MySQL db to rebuild.

Decision:
One baseline migration that reads `db/01-schema.sql` and executes it, rather than restating
the DDL in the Schema builder. On the shared instance that migration is recorded as already
run, so `migrate` there is a no op. Every change after this one is an ordinary migration,
and `01-schema.sql` is updated alongside it.

Each developer gets their own test db on the shared instance, named from
`DB_TEST_DATABASE`, with the app user granted rights on the `reflection_diary_test_%`
pattern only.

Consequences:
Positive:
Neither document has to be wrong. The sql file stays the reviewed artifact the report
refers to, and Laravel gets the migration history it needs. Executing the file rather than
transcribing it means there is no second copy of the schema to drift. A slip cannot reach
the shared db, because the test connection is a separate config entry pointing at a
different database.

Negative:
The baseline is opaque compared to a hand written Schema builder migration, so a reader has
to open the sql file to see what it does. `01-schema.sql` and the migration history must be
kept in step by discipline rather than by tooling, and nothing enforces it. The separate
test connection is a config value, not a wall, so `migrate:fresh` on the wrong connection
still destroys the shared schema.

Alternatives:
Let migrations own the schema outright and delete or demote the sql file. The conventional
Laravel answer. Rejected because it demotes source of truth number one and would mean
rebuilding the shared instance we had just provisioned.

Keep applying the sql file by hand and skip migrations entirely. Simplest, and no risk of
anyone migrating the shared db. Rejected because it contradicts the build scope and leaves
tests with no way to rebuild a database, which makes `RefreshDatabase` unusable.

===============================================================

ADR #21: MySQL published on the public internet with mandatory TLS
Status: Accepted
Date: 2026-08-11

Context:
Five people on residential connections with rotating ip addresses all need tcp access to
one db. #14 settled that the db is shared and on a VPS, but not how anyone reaches it. The
options each trade convenience against exposure, and 3306 on the open internet is scanned
continuously.

Weighing against strictness: the MVP holds seeded demo data and no real student records,
a point #8 already relied on. Weighing for it: losing the db mid semester or mid demo is
the failure that actually hurts.

Decision:
3306 is published. Encryption is not optional: `require_secure_transport` is ON, both
accounts carry REQUIRE SSL at the account level as well, and the certificate is a real
Let's Encrypt one issued by the Caddy instance already on the box, so clients can verify
identity rather than merely encrypt. Remote root is removed. The agent facing account holds
SELECT and SHOW VIEW only, enforced by grant rather than by a client side flag. fail2ban
watches the MySQL error log and bans in the DOCKER-USER chain, because container published
ports never traverse the input chain where the default action writes its rules.

Consequences:
Positive:
Zero setup for four of five people, which is the same reasoning that produced #14.
Verifiable identity is a stronger position than most self hosted MySQL, and worth a line in
the security section of the report. The read only grant is a property an assessor can test
rather than take on trust.

Negative:
The port is scanned constantly and the password is the thing standing in front of the data,
so the credentials must not leak. This is not a production posture and saying otherwise in
the report would be dishonest. fail2ban depends on a custom chain that a future docker
upgrade could disturb, and nothing alerts us if it silently stops banning.

Alternatives:
A Tailscale or WireGuard mesh with 3306 bound to the tunnel. Genuinely more secure, and it
handles rotating home ip addresses cleanly. Rejected on the same ground as #14 rejected
Docker: it puts a new dependency in front of four teammates before they can do any work,
and week one setup problems cost more than they save.

Allowlisting the five source ip addresses at the firewall. No new software for anyone.
Rejected because residential addresses rotate, so every rotation silently breaks somebody
and needs a firewall edit to fix.

===============================================================

ADR #22: A Laravel seeder replaces the sql seed file
Status: Accepted
Date: 2026-08-11

Context:
`db/02-seed.sql` existed as a header and six TODO comments and was never written. The API
work needs seeded users, gigs and tokens now, and Sanctum tokens cannot sensibly be written
as sql anyway, since the plain text exists only at the moment of creation and the db stores
a hash.

Continuing with both would mean two places to define demo data, which drift.

Decision:
`DemoSeeder` under `api/database/seeders` is the canonical demo data and `db/02-seed.sql`
is removed. The two frameworks stay in `db/01-schema.sql`, because they are part of the
reviewed schema rather than demo data and the analytics views depend on them. The shaped
score distribution and the written narratives described in the seed-data skill extend the
seeder when the scoring work needs them.

Consequences:
Positive:
One definition of demo data instead of two. Tokens can be issued properly and printed once.
Factories and seeders share the model layer, so demo data and test fixtures cannot disagree
about what a valid row looks like. Seeding becomes idempotent by construction, which
matters on a db five people share.

Negative:
Demo data now requires a working PHP toolchain, where a sql file could be piped in by
anyone with a MySQL client. The seed no longer lives next to the schema it populates, so
`/db` tells only half the story and the repo layout documentation had to change to say so.

Alternatives:
Write `02-seed.sql` properly and have the seeder call it. Keeps demo data next to the
schema. Rejected because Sanctum tokens still could not live there, so the split would
persist with extra machinery on top.

Keep both and let each own part of the data. Rejected outright. Two sources of demo data
for one db is the drift we were trying to avoid.

===============================================================

ADR #23: A counter-score is a class, not a role
Status: Accepted
Date: 2026-08-18

Context:
`scores.scorer_role` allows four values and the permission matrix lets three of them
counter-score: assessor, supervisor and employer. Only `self` is special.

`v_calibration_gap` did not reflect that. It pivoted on `scorer_role = 'assessor'` and
discarded everything else, so a supervisor's counter-score produced a null gap and the
calibration screen showed nothing. Dr Lee is a supervisor on both seeded gigs and is
expected to counter-score, so this was reachable in the demo data, not a corner case.

Where two people counter-score the same entry, which was also unhandled, `MAX` silently
picked the higher of them. Gig one has both an assessor and a supervisor, so that is
reachable too.

Verified against MySQL 9.7.2 with an assessor scoring 2 and a supervisor later scoring 3 on
one entry, plus a second entry carrying a supervisor score only. The old definition reported
the supervisor-only entry as a null gap and the two-scorer entry as the assessor's 2.

Decision:
Scores collapse into two classes, `self` and `counter`, and `counter` is whichever
non-self score is most recent. That rule is implemented once, in a new view
`v_entry_score`, which yields at most one row per entry per class. `v_radar` and
`v_calibration_gap` both read through it and neither re-derives it.

The API follows the schema, as it does everywhere else. `/me/radar` returns `self` and
`counter` rather than `self` and `assessor`, and `/me/calibration` returns `counter_level`
alongside a `counter_role` naming who scored.

Consequences:
Positive:
A supervisor's or employer's counter-score now appears everywhere an assessor's does, which
is what the permission matrix always said. Two counter-scorers on one entry resolve
deterministically instead of by whichever number happened to be larger. The rule has one
implementation, so the analytics controllers stay the thin wrappers CLAUDE.md requires. The
frontend gets `counter_role`, so it can name the person instead of labelling every opposing
polygon "assessor".

Negative:
`v_radar` and `v_calibration_gap` now depend on a third view, so a change to scoring
semantics touches a file that reads like plumbing. The names in the payload no longer match
the words on the screen, where "assessor" is what a student sees, so the frontend carries
the mapping in one place instead of the API carrying it in none. "Most recent wins" is a
product rule that nobody has asked for explicitly; it is defensible but it is ours, and it
should go in front of the client.

Alternatives:
Widen the pivot to `scorer_role <> 'self'` and keep the column named `assessor_level`.
Two lines instead of a new view. Rejected because a column named for one role holding
another role's value is exactly the sort of thing that survives into the report.

Return every counter-score and let the frontend choose. Rejected: the choice is a business
rule, and CLAUDE.md puts business rules in one place. Two clients would make it twice.

Forbid a second counter-score on an entry so the ambiguity cannot arise. Rejected because
the permission matrix deliberately lets a supervisor score alongside an assessor, and
narrowing the product to simplify a view is the wrong way round.

===============================================================

ADR #24: Coverage means never scored, on rubrics you study under
Status: Accepted
Date: 2026-08-18

Context:
`v_coverage_gaps` backs the "what is missing" view. Its comment said the rows were
competencies the student had never *evidenced*, but the query tested for the absence of a
*score*. Evidence is optional per framework, `frameworks.evidence_required` defaults to 0,
so the two readings give different answers and the documented one was the wrong one.

Separately the view crossed every user against every active framework. On the seeded data
that reported six gaps in each of two rubrics for the assessor and the supervisor, neither
of whom is scored against anything, and six sfia9 gaps for the student whose gig uses
latrobe6. Thirty-three rows, of which three were true.

The endpoint is `GET /me/coverage?framework_id={required}`, and the view exposed `fw_key`
but not `framework_id`, so the controller could not filter on the parameter it takes
without joining back to `frameworks`.

Decision:
A coverage gap is a competency the user has never been scored on, in a framework assigned
to a gig where that user is a student. The view exposes `framework_id` so the endpoint can
filter on what it is given, plus `short_label` and `position` so the list renders in rubric
order. The wording in `db/01-schema.sql` and the API specification both say scored.

Consequences:
Positive:
The endpoint answers the question a student asks. An assessor calling it gets an empty list
rather than a rubric they have never been measured against. Thirty-three rows became three
on the fixture, and the ordering the screen needs comes from the view instead of a sort in
PHP.

Negative:
A student who has left a gig loses their coverage gaps for it, because the scoping runs
through current `gig_participants` rows. That is the same assumption the rest of the
authorisation layer makes, but it is an assumption, and it sits oddly against a record that
is meant to outlive the gig. `DISTINCT` is doing real work now, since two gigs can share a
framework, and it will quietly hide a duplicate-rows bug if one ever appears upstream.

Alternatives:
Keep the cross join and filter in the controller. Rejected: the controller would be
reimplementing what the view is for, and the view would still be wrong for anyone reading
it directly.

Define coverage as never evidenced, matching the old comment. Rejected because evidence is
optional per framework, so on a framework with `evidence_required = 0` every competency
would read as a gap forever no matter how well the student scored.

===============================================================

ADR #25: Export status is stored, not derived
Status: Accepted
Date: 2026-08-18

Context:
`exports` had `requested_at` and `completed_at` and no status. The API specification
returns `status` on `GET /exports/{id}` and the frontend polls it after the 202, so status
would have been derived as "complete if `completed_at` is set".

That works for the two happy states and not for the third. A queued job that throws sets no
completion time, so a failed export is indistinguishable from one still running and the
poll loop never terminates. The user sees a spinner until they give up.

The same request also found the response using `download_uri` where the column is `uri`.
CLAUDE.md is explicit that there is no mapping layer.

Decision:
`exports.status` is a stored column, `pending`, `complete` or `failed`, constrained by
`ck_ex_status` and defaulting to `pending`. The job writes it. The response field is `uri`,
matching the column.

Consequences:
Positive:
A failed export can be reported as failed, so the export sheet can show an error state,
which it needs anyway under the four-states rule. Status is one column read rather than a
condition the frontend and the backend could disagree about. The naming rule holds without
an exception, which matters mostly because the first exception is what makes the second one
easy.

Negative:
Two columns now describe one thing, and nothing in the db stops `status = 'pending'` from
sitting next to a non-null `completed_at`. A trigger could enforce it and we are not adding
one, so it rests on the job being the only writer. There is still nowhere to put *why* an
export failed; the row says it failed and the queue log says the rest.

Alternatives:
Derive status from `completed_at` and treat a stale request as failed after a timeout.
Rejected because the timeout is a guess, and a slow job would be reported as failed while
still running.

Add `status` plus a `failure_reason` column now. Rejected as speculative. The export
pipeline is slice five and nobody has designed its error handling yet; the column can be
added when there is something to put in it.

===============================================================

ADR #26: recharts for the radar
Status: Accepted
Date: 2026-08-19

Context:
The radar chart is the product. Both score sets on one polygon is what the client asked to
see, and it is the screen the demo will live or die on.

It cannot be a fixed drawing. Frameworks are swappable by design, so the axis count comes
from the framework and the scale comes from `v_framework_scale`. The seeded La Trobe rubric
has six competencies on a one to four scale; SFIA has six on a different scale, and a
supervisor can copy and reword a framework at any time. A component hardcoded to six axes
or a four-point domain is wrong the first time somebody assigns a different rubric.

It also has to draw two polygons that are frequently incomplete. A student self-scores
before anybody counter-scores them, and `v_radar` deliberately emits every competency
including the ones nobody has scored, so the shape does not change as scores arrive.

Decision:
recharts, using its `RadarChart`, with axes and domain passed as props.

Consequences:
Positive:
recharts is a real React component library rather than a wrapper around an imperative
drawing API, so the radar re-renders from state like everything else and there is no
lifecycle to manage by hand. Two `Radar` children on one chart is the documented way to
overlay two series, which is exactly the self and counter case. `PolarAngleAxis` takes the
categories as data, so the six-axis question never becomes a code question.

Negative:
recharts pulls in d3 internals and is the largest dependency in the frontend by a wide
margin, on a screen that is otherwise text and cards. Its TypeScript types are looser than
the rest of the codebase, so the one place we most want type safety is the place we get the
least. Customising it past a certain point means fighting its internals, and if the client
asks for something recharts does not do, the fallback is a rewrite rather than a tweak.

Alternatives:
d3 directly. Rejected: more control than the project needs, and it drags imperative DOM
manipulation into a React 19 codebase for one screen.

Hand-rolled SVG. Genuinely viable for a radar, which is trigonometry and a polygon, and it
would have no dependency and exact types. Rejected on time: axis labels, tooltips,
responsiveness and accessibility are the parts that take the week, not the polygon.

nivo or victory. Rejected as equivalent to recharts in capability with less familiarity on
the team, and recharts was already named in the brief's stack.

===============================================================

ADR #27: React Router for routing
Status: Accepted
Date: 2026-08-19

Context:
Twelve screens across three roles, with routes that carry scope: a diary scoped to a gig,
a gig scoped to a sprint, an entry stepper addressed by entry. Those need to be linkable
and back-button-correct, because an assessor working a review queue moves in and out of
entries constantly.

There is no server-side rendering requirement and no SEO requirement. This is an
authenticated tool behind three bearer tokens.

Decision:
React Router, client side only.

Consequences:
Positive:
Nothing exotic. Every person on the team has either used it or can read its documentation
without a detour, which matters more than elegance on a five-person capstone with a
deadline. Nested routes map onto the gig-then-sprint-then-entry shape without inventing a
structure. Standard hooks give the scope parameters the diary and radar captions read.

Negative:
It is another dependency for what is, at twelve screens, not a hard problem, and its API has
changed shape enough across major versions that examples found online are often for a
version we are not on. Data loaders are deliberately not used here, since fetching lives in
the typed API client, so part of what the library offers is left on the table.

Alternatives:
TanStack Router, for genuinely better type safety on route params. Rejected on familiarity:
nobody on the team has used it, and route typing is not where this project's risk is.

Hand-rolled `useState` view switching. Rejected: it gives up the URL, and the URL is how an
assessor shares "look at this entry" with a supervisor.

Next.js. Rejected in #31 for reasons that have nothing to do with routing.

===============================================================

ADR #28: CSS variables and CSS modules, not Tailwind
Status: Accepted
Date: 2026-08-19

Context:
The design already exists as tokens: colour, spacing and radius, with a light and a dark
set. That is the input to the frontend, not something to be derived from it.

Light and dark both have to work. The record is something a student opens on a phone at
night as readily as on a laptop, and a theme that only half works reads as unfinished.

Decision:
CSS custom properties in `web/src/tokens.css` for every colour, space and radius, switched
by a `data-theme` attribute on the root. Component styles in CSS modules. No raw hex and no
magic pixel value anywhere else in the codebase.

Consequences:
Positive:
The tokens survive the translation from design to code as the same thing rather than as an
approximation, and dark mode is a single attribute rather than a parallel set of class
names. A custom property is readable in devtools and changeable at runtime, which makes
theme bugs findable. CSS modules scope class names without a build plugin or a naming
convention nobody enforces. There is no config file to maintain and no purge step that can
silently drop a class.

Negative:
It is more typing than a utility class, and it relies on review to catch a hardcoded colour
because nothing in the toolchain refuses one. One raw hex breaks dark mode silently for one
component, which is the kind of bug that ships. If the team grows to like utility classes
mid-project, switching is a rewrite of every component's styles rather than a config change.

Alternatives:
Tailwind. Rejected: the tokens would be re-expressed in `tailwind.config`, creating a second
definition of the design that can drift from the first, plus a config to maintain for a
twelve-screen app.

CSS-in-JS. Rejected: a runtime cost and a build integration for something plain CSS does,
and it puts colour values back inside components where the no-raw-hex rule is hardest to
see.

Plain global stylesheets. Rejected: class name collisions across twelve screens and ten
shared components, with nothing to prevent them.

===============================================================

ADR #29: Files go through Laravel's filesystem abstraction
Status: Accepted
Date: 2026-08-19

Context:
Two things produce files: evidence a student attaches to an entry, and the export of a
record. `evidence` and `exports` both store a URI rather than a blob, so the database says
where a file is and never what is in it.

The VPS holds the database and the application. There is no object storage provisioned and
no budget conversation has happened about provisioning any.

Decision:
The server filesystem, reached only through Laravel's `Storage` facade. No path is
constructed by hand and no controller touches `file_put_contents`.

Consequences:
Positive:
Moving to S3 later is a driver line in `config/filesystems.php` and a credential, not a
change to any calling code, which is the entire reason for accepting an abstraction over a
one-line alternative. Tests get a fake disk for free, so evidence upload is testable without
writing to a real path. Keeping blobs out of MySQL keeps the database small enough that the
whole thing dumps and restores in seconds, which matters on a shared instance five people
depend on.

Negative:
The files are on one VPS with no replication and no backup story written down, so a disk
failure loses every piece of evidence while the database still references it. Nothing
reconciles the two: a `Storage` delete that fails leaves a row pointing at nothing, and a
deleted row leaves a file nobody will ever collect. That second case is the one
`docs/Retention-and-Erasure.md` flags, because it means erasure is not complete when the
row goes.

Alternatives:
Blobs in MySQL. Rejected: it inflates a shared database, makes dumps slow for everyone, and
buys consistency the product does not need.

S3 or Oracle Object Storage now. Rejected as premature. It is a credential and a cost
conversation for a capstone MVP, and the abstraction means deferring it costs nothing.

===============================================================

ADR #30: An export is a queued job and its row is the record
Status: Accepted
Date: 2026-08-19

Context:
A student can take their record with them. That is the product's closing promise, and it is
the one operation whose duration is not bounded by a single query: it walks every reflection,
entry, score and evidence reference the student owns.

Doing that inside the request means the request that takes longest is the one a student runs
on the way out the door, and any timeout leaves them with nothing and no explanation.

Decision:
`POST /exports` writes an `exports` row and dispatches a job, returning `202` immediately.
The row is the job record: the client polls `GET /exports/{id}` and downloads when `status`
reaches `complete`. JSON is produced now. PDF is refused rather than faked.

Consequences:
Positive:
The request is bounded and the same shape whether a student has one reflection or fifty.
The row gives the export sheet something concrete to poll and something to show in a
history list, and it survives a restart in a way an in-memory job would not. Refusing PDF
with a validation error rather than quietly returning JSON means the frontend can say what
happened, and nobody demonstrates a PDF button that produces a `.json`.

Negative:
`QUEUE_CONNECTION=sync` in development means the job runs inside the request anyway, so the
asynchronous path is the one least exercised locally and most likely to break in front of
the client. Polling is a worse fit than a push, and it exists because a notifications table
and real-time updates are both explicitly out of scope. A student who requests an export
twice gets two rows and two files, since nothing deduplicates.

Alternatives:
Build the export synchronously and stream it. Rejected: unbounded request time, nothing to
retry, and no history.

Use a real queue driver and a worker now. Rejected as operational work the capstone does not
need; `sync` is honest for a demo and the code path is identical when a driver is added.

Ship PDF with dompdf in this slice. Rejected: adopting a rendering dependency is a team
decision and PDF layout is open-ended work. The schema and the response type already permit
`pdf`, so adding it later changes no contract.

===============================================================

ADR #31: The dependencies deliberately not taken
Status: Accepted
Date: 2026-08-19

Context:
Section 2 of the scope document lists what is not being used as prominently as what is. A
capstone is marked partly on judgement, and a rejected dependency with a reason is evidence
of judgement in a way that an absence is not. This record exists so those reasons are
somewhere other than a table cell.

Decision:
Four things are deliberately absent.

**Next.js.** Laravel is the backend. Next's API routes would be a second one, and its
rendering model solves a problem this product does not have: every screen is behind a bearer
token, so there is nothing to server-render for and nothing to index.

**axios.** One typed fetch wrapper handles the bearer token and unwraps the error envelope
centrally. `fetch` is in the platform and the wrapper is perhaps forty lines.

**A pagination library.** Result sets are a student's reflections and a rubric's
competencies. Pagination is out of scope entirely, so a library for it would be
infrastructure for a feature that does not exist.

**Any vector database or AI service.** Cut in #10.

Consequences:
Positive:
The dependency list stays short enough that a reviewer can read it, and every entry earns
its place. The fetch wrapper is ours, so the error envelope is unwrapped in exactly one
place and a new response shape is a change to one file. Nothing here is load-bearing enough
that reversing a decision is expensive.

Negative:
The fetch wrapper is code the team maintains rather than code somebody else maintains, and
it will grow: retries, aborts and upload progress are all things axios has and it does not.
If result sets ever stop being small, "no pagination" becomes a scope reversal rather than a
missing library.

Alternatives:
Taking each of them anyway. Rejected individually above. The common thread is that each
would add a maintained surface for a problem this product does not currently have, and the
cost of adding one later is low in every case.

===============================================================

ADR #32: oxlint in place of ESLint
Status: Accepted
Date: 2026-08-19

Context:
The scope document names ESLint and Prettier. When `web/` was scaffolded, the current Vite
React TypeScript template shipped oxlint instead, with a `.oxlintrc.json` and a `lint`
script already wired.

The CI frontend job was written before `web/` existed and runs `npm run lint`, so it is
satisfied either way. The choice was live, and taking the template default silently is
exactly how a documented decision gets reversed by accident.

Decision:
Keep oxlint, the template default. Prettier was added separately, since the template ships
no formatter and CI runs `prettier --check`.

Consequences:
Positive:
Zero configuration to write and nothing to keep in step with a TypeScript upgrade, which is
a real consideration given the compiler is pinned to 6.x for openapi-typescript's sake.
It is fast enough that nobody is tempted to skip it. Staying on the template default means
the next person to regenerate anything finds what they expect.

Negative:
It is not what the scope document says, so the document and the repository disagree until
one of them moves. Its rule coverage is narrower than a configured
`typescript-eslint` setup, and the React-specific rules the team might want, exhaustive
dependencies in particular, are not equivalent. Nobody on the team has used it, so the
first time it flags something surprising there is no one to ask.

Alternatives:
Install ESLint with `typescript-eslint` and the React plugins, as written. Still the right
move if the team wants specific React rules; it is a swap, not a rewrite, and no other file
changes. Rejected for now only because it is configuration written before anybody has felt
the lack.

Drop linting and rely on Prettier and TypeScript. Rejected: formatting and type checking are
not linting, and the rules that catch a missing hook dependency are the ones this codebase
will want once there are hooks.

===============================================================

ADR #33: A gig is scored against one rubric
Status: Accepted, extended by #35
Date: 2026-08-19

Context:
`ak_fw_assignments` is unique on `(gig_id, framework_id)`. That stops the same rubric being
assigned to a gig twice and permits a second, different one, and `POST
/framework-assignments` had no check of its own, so a second rubric was accepted with a
201. Its docblock said the unique index caught duplicates, which is true only of the case
it was never going to be asked about.

Nothing downstream is built for two. `Gig::assignment` is a `hasOne`, the contract gives a
gig a single `framework` object, and `ReflectionCreator` snapshots whichever framework that
relation resolves to. The relation carried no `ORDER BY`, so the row it returned was
whatever MySQL produced first. Reproduced on a seeded gig already carrying `latrobe6`: the
second assignment returned 201, the gig then had two rows, and the relation resolved to the
new rubric. Two students starting a reflection on the same gig in the same sprint could be
scored against different rubrics, with nothing on any screen to explain it, and the answer
could change again on the next query.

The seam here is that the schema permits a shape the product does not have. The database is
usually where a rule like this belongs, and `UNIQUE (gig_id)` would say it exactly. It is
not that yet because the constraint change is a migration on the shared database, which is
the team's call rather than one to slip into a bug fix.

Decision:
A gig has at most one framework assignment. The rule lives in
`api/app/Services/FrameworkAssigner.php` and a second assignment is refused with 409
`DUPLICATE_ASSIGNMENT`, whether the rubric offered is the same one or a different one;
`details.framework_id` names the one the gig already has. The unique index stays behind it
as the race backstop for the identical-rubric case. `Gig::assignment` gained
`ofMany(['assigned_at' => 'max', 'id' => 'max'])` so that a gig which somehow holds two
resolves to one of them predictably rather than arbitrarily.

Consequences:
Positive:
The rubric a gig is scored against cannot change under a student mid-gig, which is what
made the snapshot in ADR #5 worth taking in the first place. The contract's singular
`framework` is now true rather than merely usual. The failure is a 409 naming the rubric
already in place, so a supervisor who assigned the wrong one is told what is there rather
than being left to guess.

Negative:
There is no way to correct a wrong assignment through the API: no PATCH, no DELETE, and the
answer to "I picked the wrong rubric" is now a new gig. That is a real workflow gap and it
is deliberate for the MVP, because replacing a rubric a reflection has already been scored
against is the same problem ADR #16 solved for editing, and it deserves its own decision
rather than falling out of this one.

Two people assigning different rubrics to the same gig in the same instant can still both
succeed, because the check is a read followed by a write and the unique index does not
cover it. The window is small and the fix is the constraint below.

Open, for the team rather than for this change:
`ak_fw_assignments` should become `UNIQUE (gig_id)`, which states the rule where it belongs
and closes the race. No gig on the shared database currently holds more than one
assignment, checked before writing this, so the migration would apply cleanly. It is a
migration on a database five people share and needs saying out loud first, per CLAUDE.md.

Alternatives:
Let the second assignment replace the first. Rejected: reflections already created under
the old rubric keep pointing at it, so the gig would then contain reflections scored against
two rubrics and the radar across it would mean nothing. It is a bigger decision than a
refusal and would need to answer what happens to the existing records.

Leave it and make `Gig::assignment` deterministic only. Rejected: predictable is not the
same as correct. The gig would still be able to hold two rubrics, and the one it ignored
would sit in the table waiting to confuse whoever reads it next.

===============================================================

ADR #34: Counter-scores close when a reflection does
Status: Accepted
Date: 2026-08-19

Context:
`POST /entries/{entry_id}/scores` gated on `status === 'draft'`, so `assessed` fell through
and a late counter-score was accepted with a 201. The contract and the specification both
say the reflection must be `submitted`; the code said it must not be a draft, which is not
the same sentence.

The consequence is not a stray row. `v_entry_score` ranks counter-scores
`ORDER BY scored_at DESC` and reports the most recent, so the late score replaces the one
the reflection was closed on, everywhere at once: the radar, `v_calibration_gap`, and the
export. Reproduced end to end. A reflection was completed by its assessor at level 4 across
six competencies and flipped to `assessed`. An employer on the same gig then scored one
entry at level 1 and was given a 201. The student's radar moved from 4 to 1 on that axis
and the status stayed `assessed` throughout.

The employer's review queue was already empty at that point, because ADR-era behaviour
removes an assessed reflection from everyone's queue. So the two halves of the product
disagreed: the worklist said the reflection was finished and the endpoint said it was still
open.

Decision:
A counter-score requires `status = 'submitted'` exactly. A draft is too early and an
assessed reflection is too late, both refused with 409 `NOT_SUBMITTED` and a message that
says which. The rule stays in `api/app/Services/Scoring.php`, where the rest of the
counter-score rules already live.

Consequences:
Positive:
A record that has been declared assessed cannot move afterwards. That is the promise the
status is making, and it is the one a student would reasonably read into it. The endpoint
now agrees with the review queue, so there is one answer to "is this finished" rather than
two. The window in which a score can be written is the window the contract describes.

Negative:
The first scorer to finish still closes the reflection for everyone else, and now they are
refused rather than merely un-prompted. On a gig with both an assessor and a supervisor,
the second one loses the ability to record their view at all. That consequence already
existed in the queue and this change makes it explicit and unavoidable, which is the honest
version of it but not necessarily the version the client wants. It is the open question
`test_completing_a_reflection_closes_it_for_every_other_scorer` has carried since it was
written, and it is now worth more to ask than it was.

Nothing distinguishes "too early" from "too late" in the error code; both are
`NOT_SUBMITTED`, and a client that wants to tell them apart reads `details.status`. A
second code was not worth the enumeration.

Alternatives:
Accept the late score and make `v_entry_score` prefer the earliest counter-score instead of
the latest. Rejected: it keeps a radar stable but silently discards a score somebody was
told was recorded, which is worse than refusing it, and it would change what every existing
entry with two counter-scores reports.

Hold the flip to `assessed` open until some deadline, so every scorer gets a chance.
Rejected: there is no deadline in the product and inventing one is a product decision. If
the client wants every scorer's view, the answer is to define completeness as all expected
scorers rather than all entries, which is a change to the flip rule and not to this gate.

===============================================================

ADR #35: One rubric per gig, in the key itself
Status: Accepted
Extends: #33
Date: 2026-08-19

Context:
ADR #33 put "a gig is scored against one rubric" in `FrameworkAssigner` and left the
constraint as an open question, because changing a key on a database five people share is
not something to slip into a bug fix. The question was put to the team and the answer was
to make the change.

Two things the service check cannot do. It reads and then writes, so two people assigning
different rubrics to one gig in the same instant can both pass the read and both insert;
the old key, being on `(gig_id, framework_id)`, does not catch that. And it is one code
path among the several that could write the table in future, whereas a key holds for
anything that reaches the database, including a seeder, a console command, or somebody at
a MySQL prompt.

This is what CLAUDE.md means by constraints encoding product requirements. The old key
encoded "the same rubric is not assigned to a gig twice", which is not a requirement anyone
has; the requirement is "a gig has one rubric", and until now nothing in the schema said so.

Decision:
`ak_fw_assignments` becomes `UNIQUE (gig_id)`. `db/01-schema.sql` carries the new
definition and `2026_08_19_120000_one_framework_assignment_per_gig.php` alters databases
built before it.

The migration is idempotent, because the same file runs against two different starting
points: the baseline migration builds a fresh database from `db/01-schema.sql`, which now
has the new key already, while the shared instance was built before the change and needs
the alter. It reads the current key from `information_schema` and does nothing if the work
is done. It also refuses, naming the gigs, if any gig already holds more than one rubric,
rather than letting MySQL fail partway with a duplicate-key value and no indication of
which gig it belongs to. No gig on the shared instance holds two, checked before the change
and again before applying it.

The check in `FrameworkAssigner` stays. It is no longer the rule, it is the explanation:
a 1062 says a duplicate key exists, and the service says which rubric the gig already has,
in `details.framework_id`. Both surface as 409 `DUPLICATE_ASSIGNMENT`, so a client sees one
behaviour and never has to know which layer refused.

`Gig::assignment` went back to a plain `hasOne`. ADR #33 had given it
`ofMany(['assigned_at' => 'max', 'id' => 'max'])` to make an ambiguous answer at least a
predictable one; with the key in place there is nothing to disambiguate, and a subquery on
every gig load to order a set that cannot exceed one row is cost for nothing.

Consequences:
Positive:
The rule now holds for every writer rather than for one endpoint, and it holds under
concurrency. The gig screen's single `framework` and the snapshot every reflection takes
rest on something the database guarantees rather than on a convention. A later change that
adds a second way to assign a rubric cannot reintroduce the bug by forgetting to call the
service.

Negative:
It is a migration on a shared database, so it needs coordinating: everyone runs
`php artisan migrate` in `api/`, and anyone who does not is running against a schema that
still permits what the code refuses. The failure mode is mild, since the service check
covers them in the meantime, but the two are out of step until they do.

Reassigning a rubric is now impossible at the database level as well as the API level. ADR
#33 already noted that "I picked the wrong rubric" has no answer short of a new gig; the
key makes that harder to walk back, and the eventual fix will have to delete the assignment
row explicitly rather than write a second one over the top.

Alternatives:
Leave the constraint alone and rely on the service, as ADR #33 did. Rejected now that the
question has been asked and answered: the race is real, the data is clean, and the change
gets cheaper the earlier it is made.

Make it a `CHECK` or a trigger instead. Rejected: a unique key is the mechanism MySQL
provides for exactly this, it is enforced on write without a scan, and it produces the 1062
the error envelope already maps.
