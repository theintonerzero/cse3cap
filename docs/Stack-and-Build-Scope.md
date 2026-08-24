# Reflection Diary: stack and build scope

**CSE3CAP / Alumable · Semester 2 2026**
What we are building, what it runs on, and what has to exist for it to be done. Companion
to the API specification (v2) and the ERD.

---

## 1. What this is

An MVP, not a prototype. Feature-complete, running on real data, designed to plug into
Alumable's platform later. Twelve screens across three roles, backed by a JSON API
and a MySQL database that is already designed and reviewed.

Scope in one line: a student writes reflections per sprint, scores themselves against a
swappable rubric, a supervisor or assessor counter-scores, both appear on a radar chart,
and the student keeps and exports the record.

---

## 2. The stack

| Layer | Technology | Why |
|---|---|---|
| Database | MySQL 9.7 LTS, self-hosted on an Oracle Cloud VPS | Set by the client; matches their live platform. One shared instance means no local setup for anyone |
| Backend | PHP 8.5 / Laravel 13 | Set by the client; Sanctum, policies, queues, Faker all built in |
| API style | REST, OpenAPI 3 contract | Screens map cleanly to resources; contract enables parallel build |
| Frontend | React 19 + Vite + TypeScript | Recharts radar; types generated from the contract catch drift at compile time |
| Charts | recharts | First-class React radar component |
| Routing | React Router | Standard, nothing exotic needed |
| Styling | CSS variables + CSS modules | Design tokens already exist as variables; no Tailwind config to maintain |
| Auth | Sanctum bearer tokens, three seeded | Real token handling, no login screen in MVP |
| Storage | Server filesystem via Laravel's filesystem abstraction | Swapping to S3 later is config, not code |
| Export | Queued jobs; JSON native, PDF via dompdf | The `exports` row is the job record |

**Not using, deliberately:** Next.js (no need for SSR or API routes when Laravel is the
backend), Tailwind (tokens are already CSS variables), axios (one typed fetch wrapper is
enough), pagination libraries (result sets are small), any vector database or AI service
(cut from scope).

### Database access

MySQL is self-hosted on a shared Oracle Cloud VPS rather than on each machine, so there is
nothing to install locally. Everyone connects to the same instance with credentials from
`.env`. Two consequences worth knowing:

- The schema is applied once, centrally, rather than each person running the DDL.
  Migrations are run against the shared database by whoever owns the change.
- Seed data is shared, so anything one person changes, everyone sees. Treat the seeded
  users, gigs and frameworks as fixed reference data and create new rows for
  experimentation rather than editing the existing ones.

---

## 3. Repository layout

```
/db
  01-schema.sql          the reviewed DDL
                         frameworks are seeded here; everything else is a Laravel seeder
/api                     Laravel 13
/web                     React + Vite + TS
/docs
  openapi.yaml           the API contract, source of truth
  PROJECT-CONTEXT.md     briefing for coding agents
  adr/                   architecture decision records
  erd.png
.claude/settings.json    shared plugins + marketplaces for the team
.mcp.json                Context7, MySQL MCP
README.md                setup, connection details, the three tokens
```

---

## 4. What has to be built

### 4.1 Environment and data

- [x] MySQL 9.7 LTS provisioned on the VPS, credentials distributed, `.env.example` committed
- [x] `01-schema.sql` applied and verified, including the ADR #23 to #25 patch
- [~] `DemoSeeder`: three token holders covering every role, two gigs with sprints,
      reflections at every status, scores with a shaped distribution (hidden ability
      profile per student, self-scores slightly optimistic, assessor scores closer to
      truth), hand-written narratives rather than lorem. The two frameworks are already
      seeded by `01-schema.sql`.
      Role holders, gigs, sprints and assignments are seeded and the tokens are issued.
      The reflections, shaped scores and narratives arrive with the slices that create
      them, since nothing can write a reflection yet
- [x] Three seeded tokens issued and documented in the README
- [x] Views verified: `v_entry_score`, `v_radar`, `v_calibration_gap`, `v_coverage_gaps`,
      `v_framework_scale`

### 4.2 Backend

**Foundation**
- [x] Laravel 13 scaffold, Sanctum installed, CORS for the Vite dev origin
- [x] DDL ported to migrations. The baseline executes `db/01-schema.sql` verbatim rather
      than restating it, and is recorded as already-run on the shared instance
- [x] Base model: `HasUuids`, `$keyType = 'string'`, `$incrementing = false`
- [x] Exception renderer producing the single error envelope
- [x] `RoleResolver::for(User, Gig)`. `GigPolicy` done; the remaining rows arrive with the
      resources they govern

**Endpoints** (full detail in API spec v2)
- [x] `GET /auth/me`
- [x] `GET /gigs`, `GET /gigs/{id}`
- [x] `GET /frameworks`, `GET /frameworks/{id}`
- [x] `POST /frameworks` (deep copy), `PATCH /frameworks/{id}`, `PATCH /competencies/{id}`,
      `PATCH /levels/{id}`, all behind the `FRAMEWORK_IN_USE` guard
- [x] `POST /framework-assignments`
- [x] `GET/POST /reflections`, `GET /reflections/{id}`, `POST .../submit`, `DELETE`
- [x] `PATCH /entries/{id}`, `POST /entries/{id}/evidence`, `DELETE /evidence/{id}`
- [x] `PUT /entries/{id}/scores/self`, `POST /entries/{id}/scores`
- [x] `GET /review-queue`
- [x] `GET /me/radar`, `/me/progress`, `/me/calibration`, `/me/coverage`
- [x] `POST /exports`, `GET /exports/{id}`, `GET /exports`, `GET /exports/{id}/download`.
      JSON only; PDF needs dompdf, which is a package decision for the team
- [x] `GET /reflections/{id}/events`

**Business rules, one implementation each**
- [x] Submit gate (narrative, self-score, evidence-if-required)
- [x] Comment required when a counter-score is lower than the self score
- [x] Level belongs to the entry's competency (service layer; the database cannot express it)
- [x] Framework immutable once referenced by any reflection
- [x] One rubric per gig. `FrameworkAssigner` refuses a second, and since ADR #35
      `ak_fw_assignments` is unique on `gig_id` so the database refuses it too
- [x] Eager entry creation, one per competency, on reflection create
- [x] Auto-flip to `assessed` when every entry has a counter-score. Counter-scoring closes
      with it: `submitted` is the only state that accepts one (ADR #34)

### 4.3 Frontend

**Foundation, in this order**
- [x] Vite 8 + TS scaffold, Prettier, and oxlint in place of ESLint, which is what the
      current Vite template ships. Renders the word `test` and nothing else: the point is
      that the toolchain and the CI job are proven before a screen is written. Swapping
      oxlint for ESLint is a deliberate decision the team has not made yet.
      Pin TypeScript to 6.x, not 7. TypeScript 7
      is the native compiler rewrite and openapi-typescript 7.13 crashes on it
      (openapi-ts issue #2841, open with no workaround). Generated types are load-bearing
      here, so the generator picks the compiler version
- [ ] `tokens.css`: colour, spacing, radius as CSS variables; light and dark via
      `data-theme`. No raw hex anywhere else in the codebase
- [ ] Core components: Card, Button, Chip, Badge, TextArea (debounced), ProgressBar,
      BottomSheet, RadarPanel (axes and domain from props), Skeleton, ErrorNotice
- [x] Typed API client: one fetch wrapper, types generated from `openapi.yaml` via
      openapi-typescript, error envelope unwrapped centrally. `web/src/api/client.ts`,
      with `schema.ts` generated by `npm run gen:types` and committed. The generator runs
      through `npx` rather than as a dependency, per ADR #36. Verified against the real
      API on :8000 and the prism mock on :4010
- [ ] App shell: router, token context, role-aware nav from `/auth/me`

**Screens.** Twelve, each with loaded / loading / empty / error states

*Student*
- [ ] Diary home: scope chips (all gigs / per gig), sprint chips inside a gig, radar with
      a caption that changes with scope, entry list with status badges, export link
- [ ] Gig detail: header, sprint list with dates, diary card linking in scoped to that gig
- [ ] Entry stepper: one component, N states from the framework payload: competency name,
      tappable level descriptors, narrative with debounced autosave, evidence row,
      "Competency 3 of 6" progress, Back/Next, Submit on last with gate errors mapped to
      the offending entries
- [ ] Submitted confirmation: assessor notified, next sprint date, back to diary
- [ ] Export sheet: PDF/JSON selector, includes summary, request → poll → download
- [ ] History sheet: event timeline

*Assessor*
- [ ] Review queue: worklist with per-reflection progress
- [ ] Assessor stepper: the entry stepper in assessor mode. Student's narrative and
      evidence read-only, their self-score shown, level picker, comment box that becomes
      required when scoring lower

*Educator (supervisor role)*
- [ ] Select framework: available templates vs saved copies, Edit and Assign actions,
      Edit hidden when `in_use`
- [ ] Edit framework: based-on selector, name, competencies with their level descriptors,
      save as a new copy

### 4.4 Security and infrastructure

- [x] Sanctum configuration and token handling
- [~] Policies covering every permission-matrix row, resolved from `gig_participants`.
      `GigPolicy`, `ReflectionPolicy`, `FrameworkPolicy` and `ExportPolicy` are in place;
      the rows they do not cover belong to resources that do not exist yet
- [x] Evidence upload: type and size validation against framework policy, storage wiring
- [~] Export pipeline: queued jobs, JSON, download authorisation. PDF still to come
- [x] VPS access control, `.env.example`, nothing secret committed
- [~] Security review on every PR touching scoring, submit, or framework mutation. Done
      once, on the backend PR, which touches all three: it found a counter-score accepted
      after a reflection was assessed, a gig able to hold two rubrics, and three analytics
      endpoints returning a 500 outside the error envelope. ADRs #33, #34, #35. Stays open
      because the commitment is per PR, not once
- [x] Retention and erasure note for the report (the `RESTRICT` constraints make deletion
      deliberate rather than cascading)

### 4.5 Cross-cutting

- [x] CI running Pint, oxlint, Prettier and both builds, set up before the first feature PR.
      `.github/workflows/ci.yml`. The backend job brings up its own MySQL 9.7 service
      container rather than touching the shared instance, because the suite runs
      `migrate:fresh`. The frontend job is written and skips itself until `web/` exists.
- [x] `openapi.yaml` written from API spec v2 for the read path, mock server running
      (`prism mock`) and serving the seeded data as examples
- [x] `.claude/settings.json` with shared plugins, permissions and the shared-database
      guard; six agents in `.claude/agents/`; `PROJECT-CONTEXT.md` in `/docs`
- [x] ADRs for every decision in §2 of this document (#26 to #32)

---

## 5. Out of scope

Recorded so nobody builds them by accident.

- **AI features.** Cut. No suggestion tables, no embeddings, nothing writes scores but a
  human.
- **Framework creation from scratch.** Copy-then-edit only, from a seeded base.
- **Adding or removing competencies, changing level counts.** Renaming competencies and
  rewording descriptors only.
- **Editing a framework that is in use.** Permanently read-only once referenced.
- **Re-scoring.** An assessor cannot revise a submitted score; a repeat is a 409, and a
  reflection that has flipped to `assessed` stops accepting counter-scores entirely.
- **Changing a gig's rubric once assigned.** A gig takes one and there is no endpoint to
  replace it, because reflections already created point at the framework they snapshotted.
  The answer to "I picked the wrong rubric" is a new gig. See ADR #33.
- **Login screen.** Three seeded tokens; auth exists server-side.
- **Pagination, notifications table, multi-tenancy, real-time updates.**

---

## 6. Definition of done

The MVP is done when all of the following are true.

1. A fresh clone connects to the shared database and runs against real seed data.
2. A student token can create a reflection, write every entry, self-score, and submit,
   with the gate rejecting an incomplete submission.
3. An assessor token can see the review queue, counter-score, and is forced to comment
   when scoring lower than the student did.
4. The radar renders self and assessor polygons from real database rows, with axes and
   scale read from the active framework.
5. Switching a gig to SFIA 9 changes the axes, the scale, and every level descriptor with
   no code change.
6. A supervisor can copy a framework, rename a competency, reword a descriptor, and assign
   the copy to a gig, and cannot edit a framework already in use.
7. A student can export their record and download the file.
8. Every screen has a loading, empty, and error state.
9. CI passes on `main`.
10. The report, the ADRs, and the individual compendiums are written.
