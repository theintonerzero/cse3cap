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
#10 Remove AI scope, move to MySQL ................. Accepted
#11 MySQL specific schema workarounds .............. Accepted
#12 React, Vite and TypeScript for the frontend .... Accepted
#13 Contract first with OpenAPI and a mock server .. Accepted
#14 Shared VPS database instead of local Docker .... Accepted
#15 Three seeded tokens instead of a login screen .. Accepted
#16 Copy then edit for frameworks .................. Accepted
#17 Educator mapped to the supervisor role ......... Accepted

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
Status: Accepted
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
Status: Accepted
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
Status: Accepted
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
