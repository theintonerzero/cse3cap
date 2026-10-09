# AI sidecar and live demo — design

An AI sidecar that asks students questions and finds related reflections, and a
password-protected live demo of the whole diary at `diary.darkovski.dev` that
redeploys itself from `dev`. The sidecar never writes to the product, never
authors a reflection, and never sees anything Laravel would not show the person
asking. With it switched off the diary behaves exactly as it does today.

Decided by Jesse on 2026-10-09, brainstormed from "handle the AI sidecar and
implement it, and deploy a live demo on my VPS". Ticket: HO-9 (COA4-105),
"AI sidecar: ADR and timeboxed spike". The deploy overlaps CAP-26.

## Context that shaped it

- **HO-9's criteria** ask for a sidecar that "reads through the API, owns its own
  storage, and has no write path to scores or reflections", an ADR partially
  superseding ADR #10, and a kill date of 7 October after which it ships as an
  ADR, a sequence diagram and a mocked demo. Jesse chose to build past the kill
  date; the ticket gets a comment saying so.
- **PR #121** (L1quidDroid, open) planned the same feature set and recommended
  putting it inside Laravel with no vector store. This design takes a different
  shape because HO-9's criteria and the cohort features ask for one. The ADR cites
  #121 as the main alternative.
- **The Claude API has no embeddings model.** Vectors come from a local model.
- **MySQL 9.7.2 Community stores `VECTOR` but cannot compare it.** Checked on the
  shared server on 2026-10-09: `STRING_TO_VECTOR` and `VECTOR_DIM` work;
  `DISTANCE` and `VECTOR_DISTANCE` resolve as unknown stored routines, because
  Oracle ships them, and vector indexes, in HeatWave only. MySQL stores, the
  sidecar ranks.
- **The VPS is not the box ADR #45 describes.** `accord` (the same host as
  `rddb.darkovski.dev`) runs one Docker Compose project in `/home/ubuntu/server`:
  Caddy, MySQL 9.7.2, ntfy and `ppk-inbox` on the `web` network, with the
  Caddyfile at `/home/ubuntu/server/Caddyfile`. There is no PHP, no Node and no
  `diary` user on the host. `Deployment.md` says the CAP-26 procedure was "built,
  not yet run". The `ppk.darkovski.dev` block (password, then `reverse_proxy` to a
  compose service) is the pattern this design follows.
- **`./run demo`** comes from PR #120 (open). It runs the dev server with a
  one-click persona picker. Security finding F15 is why that picker is dev-only:
  compiled into a build, it put 60-day full-ability tokens in public JavaScript.
- **Timing.** Sprint 5 closes 13 October with v1.0.0 and the Assessment 3 report.
  The demo this is for comes after that.

## Decisions

| # | Question | Decision |
|---|---|---|
| D1 | Which features | All four: reflection coach, similar past reflections, calibration coach, cohort search with themes |
| D2 | Where vectors live | MySQL, in a separate database `diary_ai` on the same server, with its own user and no grants on any product database |
| D3 | What makes embeddings | A local open model (bge-small, 384 dimensions) in the sidecar process, on the VPS's CPU |
| D4 | Shape | Token passthrough: the browser calls the sidecar, which reads Laravel's existing REST API with the caller's own token. Laravel does not change |
| D5 | Who can reach the demo | Only people with the demo password. Behind it, the one-click persona picker |
| D6 | Which product database | Its own, `reflection_diary_demo`, resettable. Visitors never touch the team's shared `reflection_diary` |
| D7 | Spend | Haiku 5.5 at medium effort, US$5 per UTC day hard cap in the sidecar, plus a spend limit on the key's workspace in the Claude Console as the backstop |
| D8 | Relation to v1.0.0 | Merged to `dev` behind `AI_ENABLED`, off by default. v1.0.0 behaves exactly as without it |
| D9 | How the demo updates | The box polls the public repo and deploys every change to `dev`, with health checks, automatic rollback, ntfy notice and a freeze switch. No credentials in GitHub |

## Architecture

```
internet ─▶ server-caddy-1 (existing)  diary.darkovski.dev
              ├─ no gate cookie ─▶ 302 /gate (basic_auth sets the cookie)
              ├─ /api/*  ─▶ diary-web:80 ─ php_fastcgi ─▶ diary-api:9000  (Laravel, unchanged)
              ├─ /ai/*   ─▶ diary-ai:8000                                (Python sidecar)
              └─ else    ─▶ diary-web:80  (built bundle, /demo/personas.json)

diary-ai ─ reads ─▶ http://diary-web/api/v1/* with the caller's bearer token
diary-ai ─ asks  ─▶ Claude API, claude-haiku-5-5, effort medium
diary-api, diary-ai ─▶ MySQL at rddb.darkovski.dev:3306 (TLS, name verified), via host-gateway
     reflection_diary_demo   user diary_demo_app, grants there only
     diary_ai                user diary_ai, grants there only
```

### The sidecar, `ai/`

A self-contained Python service (FastAPI) in a new top-level `ai/` folder, with
its own `pyproject.toml`, tests, Dockerfile and contract `docs/ai-openapi.yaml`.
Each unit has one job:

| Unit | Does | Depends on |
|---|---|---|
| `DiaryReader` | The only code that calls Laravel. GET only. Forwards the caller's `Authorization` header unchanged; Laravel's 401, 403 and 404 pass straight through. Never sees or infers a role | Laravel `/api/v1` |
| `Embedder` | Text in, 384-dimension vector out | bge-small, loaded once at start |
| `VectorStore` | Reads and writes `diary_ai.entry_vectors`; cosine ranking in Python. **Every query takes the list of entry ids `DiaryReader` just fetched for this caller and ranks only within it** | `diary_ai` |
| `Coach` | Builds the prompt for each feature, validates the reply | `ClaudeGateway` |
| `ClaudeGateway` | The only code that calls Claude: timeout, retry, usage, spend cap, rate limits | Anthropic Python SDK, `diary_ai.usage` |

The scoping rule in `VectorStore` is the security boundary between users: vectors
for everyone's entries share a table, and a search may only ever rank the ids the
caller's own token just returned from Laravel. Its test is the most important one
in `ai/tests/`.

Laravel endpoints read, all existing: `/auth/me`, `GET /reflections` (a student's
own; every reflection on a reviewer's gigs), `GET /reflections/{id}` (entries and
narratives), `/frameworks/{id}` (rubric text), `/me/calibration`, `/me/coverage`.

Embeddings are computed lazily: when a request needs vectors for entries whose
`(entry_id, content_hash)` is not stored, they are embedded then and stored.
Nothing is indexed in the background.

### Sidecar API (`docs/ai-openapi.yaml`)

| Endpoint | Feature | Caller | Claude call |
|---|---|---|---|
| `GET /ai/v1/status` | Which features are on | Any signed-in user | No |
| `POST /ai/v1/entries/{entry_id}/coach` | Reflection coach | The student who owns a draft entry, as Laravel decides | Yes |
| `GET /ai/v1/entries/{entry_id}/related` | Similar past reflections | The same student | No |
| `POST /ai/v1/entries/{entry_id}/calibration` | Calibration coach | The student, on an assessed reflection where the scores differ | Yes |
| `GET /ai/v1/search?q=` | Cohort search | Assessor or supervisor; ranks submitted and assessed reflections the token can list | No |
| `GET /ai/v1/gigs/{gig_id}/themes` | Recurring themes | Assessor or supervisor on that gig | Yes, once per gig per UTC day, cached |

Every response is snake_case JSON. Every non-2xx uses the diary's envelope,
`{ "error": { "code", "message", "details" } }`.

## The features in the UI

The diary's visual world is fixed: white cards on a light grey page, pill-shaped
level choices, purple reserved for the person's own choices and the primary
action. AI output is never purple. It sits in a neutral tinted inset with a small
"AI" `Badge`, so it never reads as something the student chose or wrote. Built
from `Card`, `Badge`, `Button`, `Skeleton`, `ErrorNotice`, `BottomSheet` and
`Chip`, with no new tokens.

**Reflection coach.** Entry stepper, draft, inside the competency card, directly
under "Your reflection" and above Evidence.

```
│ Your reflection                         │
│ ┌─────────────────────────────────────┐ │
│ │ I kept the team updated on my …     │ │
│ └─────────────────────────────────────┘ │
│ ┌ AI ─────────────────────────────────┐ │
│ │ Questions to think about            │ │
│ │ · What happened after you raised    │ │
│ │   the blocker? Who acted on it?     │ │
│ │ · What would you do differently…    │ │
│ │                  Ask again  ·  Hide │ │
│ └─────────────────────────────────────┘ │
│ ▸ From your earlier sprints (2)         │
│ Evidence …                              │
```

- Opt-in: a quiet "Ask me questions" text button. Never runs on its own.
- Two or three plain-text questions. No "insert" or "apply": the coach cannot put
  words into the box.
- The prompt is not given the selected self-score and is told never to suggest a
  level, so it cannot anchor the score.
- States: idle (the button); loading (three skeleton lines); empty (narrative
  under about 15 words: button disabled, "Write a few sentences first"); error
  ("Questions aren't available right now", the rest of the card untouched).

**Similar past reflections.** Same card, below the coach: a collapsed "From your
earlier sprints (n)" disclosure listing up to three of the student's own earlier
entries (sprint, competency, a one-line excerpt). A row opens that entry
read-only in a `BottomSheet`, so the student keeps their place. No Claude call:
it runs when a competency opens and again when the narrative settles. With
nothing earlier, the disclosure is not shown.

**Calibration coach.** The read-only stepper of an assessed reflection, under the
counter-score and the reviewer's comment, only on competencies where the
self-score and counter-score differ: "Why might you and Dr Lee see this
differently?" and two or three questions, in the same inset. Only after
assessment, so it cannot influence a self-score.

**Cohort search and themes.** The top of the review queue, for assessors and
supervisors.

- One field, "Search reflections by meaning". Results reuse the queue's row:
  student, gig and sprint, competency, the matched excerpt. No similarity
  percentage. A result opens the existing reviewer stepper route.
- With the field empty, three to five "Recurring themes" chips. A chip runs as a
  search.
- Searches submitted and assessed reflections only. Drafts are the student's
  working space even where Laravel would let a reviewer list them; this is a
  narrowing filter in the sidecar, not authorisation.

**Everywhere.** Each piece ships the four states. Output is plain text, never
markdown or HTML. `GET /ai/v1/status` is called once per session; a 404 or a
network failure means no AI element renders, and the screen is today's.

**In the frontend.** `web/src/api/client.ts` remains the only caller. It gains
the `/ai/v1` base path and a generated `web/src/api/ai-schema.ts` from
`docs/ai-openapi.yaml` (`npm run gen:types` extended). No component calls
`fetch`.

## Claude

- Model `claude-haiku-5-5`, `output_config: { effort: "medium" }`, adaptive
  thinking (the model's default), structured output with schema
  `{ questions: string[] }` holding one to three items, or
  `{ themes: string[] }` for themes.
- Timeout 15 s, one retry on 429, 5xx or a connection error.
- `stop_reason: "refusal"` becomes `AI_UNAVAILABLE`. Haiku has no server-side
  fallback; nothing retries a refusal.
- No tools are given to the model. Narratives and rubric text go into the user
  turn inside delimited data blocks, after an instruction that they are data.
- The validator keeps a question only if it ends in "?", is under 200 characters,
  and does not mention a level, a score or a number on the rubric's scale. If
  none survive: `AI_UNAVAILABLE` with `details.reason: "invalid_reply"`.
- Sent to Claude: narrative text, competency names, level descriptors, the
  reviewer's comment for the calibration coach. Not sent: names, emails, ids.

## Errors and limits

| Code | Status | When |
|---|---|---|
| `UNAUTHENTICATED`, `ROLE_FORBIDDEN`, `NOT_FOUND` | 401, 403, 404 | Laravel's response, envelope and code forwarded unchanged |
| `VALIDATION_FAILED` | 400 | Bad query, empty search |
| `AI_DISABLED` | 404 | `AI_ENABLED` is off |
| `AI_RATE_LIMITED` | 429 | Over a rate limit; `details.retry_after` |
| `AI_UNAVAILABLE` | 503 | `details.reason`: `timeout`, `upstream`, `refusal`, `invalid_reply`, `daily_cap` |

- **Spend.** US$5 per UTC day. `ClaudeGateway` reserves the worst-case cost of a
  call (input tokens counted, `max_tokens` output) before calling and records
  actual usage after, both in `diary_ai.usage`. A call that would cross the cap is
  refused, not made.
- **Rate limits.** Claude-backed endpoints 20 a minute and 200 a day per token;
  search and related 60 a minute. Keyed by a SHA-256 of the token. Tokens are
  never stored.
- **Token check first.** Every endpoint resolves the caller through `/auth/me`
  before doing anything else, so a request without a valid token never reaches
  Claude or the database.

## Data in `diary_ai`

| Table | Holds |
|---|---|
| `entry_vectors` | `entry_id char(36)`, `content_hash char(64)`, `embedding VECTOR(384)`, `created_at DATETIME(6)` |
| `usage` | One row per Claude call: feature, model, input and output tokens, cost, `created_at DATETIME(6)` |
| `theme_cache` | `gig_id char(36)`, UTC day, the theme labels |
| `rate_limits` | Token hash, window, count |

No narrative text, names or emails. No foreign keys to the product database
(it is a different database), so a stale `entry_id` is harmless: it can only be
ranked if Laravel returned it for the caller, and `demo-reset.sh` empties every
table. `DATETIME(6)` in UTC, never `TIMESTAMP`, as everywhere else.

## The live demo

### On the box

A separate compose project, `docker compose -p diary`, in `/home/ubuntu/diary`,
joined to `server_web` as an external network. Bringing the diary up or down can
never restart MySQL or Caddy.

| Service | Image | Notes |
|---|---|---|
| `diary-api` | PHP 8.5-FPM, built from the repo at a SHA, `composer install --no-dev` | `mem_limit: 512m`. Env from `/home/ubuntu/diary/shared/api.env`, mode 0600. `extra_hosts: rddb.darkovski.dev:host-gateway` so TLS verifies the name the certificate carries |
| `diary-web` | `caddy:2` with the built bundle baked in | Serves the bundle, `/demo/personas.json` from a mounted file, and `php_fastcgi diary-api:9000` for `/api/*` and `/up`. Internal only |
| `diary-ai` | Python, model weights baked in at build | `mem_limit: 2g`. Env from `/home/ubuntu/diary/shared/ai.env`, mode 0600, holding `ANTHROPIC_API_KEY`, the `diary_ai` DSN, `AI_ENABLED`, `AI_DAILY_CAP_USD=5` |

The bundle is built with `VITE_API_BASE_URL=/api/v1`, the AI base path, and the
demo picker flag, and **no tokens**. `./run bundle-secrets` must pass on it
unchanged.

### The gate

One `diary.darkovski.dev` block added to `/home/ubuntu/server/Caddyfile`:

- Any request without a valid `diary_gate` cookie is redirected to `/gate`.
- `/gate` is the only path with `basic_auth` (bcrypt line in
  `/home/ubuntu/server/diary-users.caddy`, the `ppk` pattern). On success Caddy
  sets `diary_gate=<random 32-byte secret>` with `HttpOnly; Secure;
  SameSite=Strict; Max-Age=604800` and redirects to `/`.
- Every other path, `/api/*` and `/ai/*` included, requires the cookie. The
  browser sends it on same-origin calls, so the app's `Bearer` header is
  untouched.
- The cookie secret lives only in the box's Caddy config. Changing it signs
  everyone out.
- `import baseline` and `import accesslog` as the other sites do, so the existing
  fail2ban jails cover it.

### The persona picker

The picker reads its people at runtime from `/demo/personas.json` instead of from
`VITE_DEMO_TOKENS` at build time. The file is on the box only, written by
`demo-reset.sh`, mode 0640, and reachable only through the gate. This is a change
to PR #120's demo shell and depends on #120 merging first. In dev the shell keeps
reading `VITE_DEMO_TOKENS` as it does now.

### Databases and reset

One-time admin step, run by Jesse or with him watching, on the MySQL container:
create `reflection_diary_demo` and `diary_ai`, and users `diary_demo_app` and
`diary_ai` with `REQUIRE SSL` and grants on their own database only.

`scripts/demo-reset.sh` runs `migrate:fresh --seed` in `diary-api`, empties
`diary_ai`, and rewrites `personas.json` with the fresh seeded tokens. It
**refuses unless `DB_DATABASE` ends in `_demo`**. A nightly 04:00 UTC timer for it
is optional and off by default.

### Auto-deploy

`diary-deploy.timer` on `accord`, every 5 minutes, runs
`scripts/deploy-demo.sh --if-changed dev`:

1. `git ls-remote` on the public repo. If `dev` is the deployed SHA, or
   `/home/ubuntu/diary/freeze` exists, exit.
2. Fetch the SHA into `/home/ubuntu/diary/src`, build `diary-*:<sha>` images. A
   failed build changes nothing running.
3. `php artisan migrate --force` against `reflection_diary_demo`. Refuses any
   database name without `_demo`.
4. `up -d`, then health checks inside the network: `diary-web:80/up` and
   `diary-ai:8000/health`. On failure, `up -d` on the previous SHA's images.
5. Post the outcome to ntfy and write the SHA to `/home/ubuntu/diary/deployed`.

A rollback restores code, not schema. If a deploy migrated and then failed, the
demo database is fixed with `demo-reset.sh`, a deliberate step in the runbook.
The team's shared database is never on this path.

`deploy-demo.sh <sha|tag>` by hand still works, with `freeze`, to pin a version
for a presentation. Neither script touches Caddy. The Caddy change is a one-time
procedure: say so in the team channel, back up as
`Caddyfile.bak.<yyyymmdd-hhmmss>`, add the block, `caddy validate` inside the
container, reload. The same Caddy issues the `rddb` certificate (ADR #21), so a
broken config is an outage for all five people.

## Testing

| Where | What | Run by |
|---|---|---|
| `ai/tests/` (pytest) | A's search never returns B's entry; 401, 403 and 404 pass through; a request without a valid token never reaches Claude; the validator drops non-questions and level talk; the cap refuses before calling; retry, refusal, timeout (Claude mocked); one real-model embedding test, marked slow | `./run ai-test`, a new CI job |
| `web/e2e/` | One spec per feature, four states each, against the fake API with `/ai/v1` routes added. Refusals are injected, never reimplemented. One spec has `/ai/v1/status` failing and checks the screens are unchanged. **Every existing spec passes unmodified** | `./run e2e` |
| `api/tests/` | Laravel does not change: `./run test` passes exactly as today | `./run test` |
| `ai/evals/` | About 15 fixed narratives: weak, strong, off-topic, injection attempts. Run against real Haiku for under US$0.05; outputs read by a person against a checklist in the same folder | `scripts/ai-eval.sh`, not CI |
| `scripts/deploy-demo.test.py` | Refuses a database without `_demo`; no secret in the repo; never touches Caddy or the `server` project | `./run check` |
| `scripts/smoke-demo.sh` | From outside: no cookie redirects to `/gate`; cookie without token is a 401; `/up` healthy | By hand after the gate is live |

`ai/tests/` is a third place for tests after `api/tests/` and `scripts/`. The
ADR amends CLAUDE.md's "two places" rule to say so.

## Decisions to record

Both are Proposed, for the team to accept. Numbers are the next free ones when
written, expected #62 and #63.

1. **AI sidecar.** Partially supersedes ADR #10. The four features and why the
   coach never authors or anchors; privacy (the demo's data is seeded fiction;
   real students would need the client's sign-off and their consent first, and
   that is not in this scope); alternatives: PR #121's inline Laravel design, a
   Laravel front door with an HMAC link, Voyage embeddings, a separate vector
   database; the MySQL Community finding; `diary_ai` as a separate database;
   `ai/tests/` as a third test location.
2. **The live demo.** Partially supersedes ADR #45: containers in their own
   compose project instead of host PHP-FPM; pull-based auto-deploy from `dev`
   instead of by hand, keeping #45's property that GitHub holds no credentials;
   `reflection_diary_demo` instead of the shared database; the cookie gate; the
   runtime persona file, which amends the dev-only stance of ADR #60 (and #61 if
   it is accepted) without reopening F15, because no token enters the bundle.

## Documents updated with the work

CLAUDE.md (out-of-scope list, stack, test locations), `Architecture.md`,
`Deployment.md` (rewritten for the real box), `Runbook.md` (freeze, reset,
rollback, sidecar logs), `Security-Review.md` (gate, key, persona file),
`Retention-and-Erasure.md` (embeddings derived from narratives; reset wipes
them), `Frontend-and-Backend.md` (the second contract), the README docs table,
and the data-flow sequence diagram HO-9 asks for, for SMD §6.5.

## Order of work

One pull request into `dev` per step.

1. This spec and the two ADRs.
2. The live demo without AI: databases, users and the gate on `accord` (with
   Jesse), then the containers, `demo-reset.sh`, auto-deploy, `AI_ENABLED` off.
   From here everything ships through the auto-deploy.
3. Sidecar core: gateway, reader, embedder, store, `/status`, contract, pytest,
   CI job.
4. Features in value order: coach, similar past reflections, calibration coach,
   cohort search and themes. Each with its specs.
5. `AI_ENABLED` on in the demo; smoke check and eval run, outputs read.

**12 October** is the line for the Assessment 3 report: whatever has merged by
then is documented as built, the rest goes into SMD §10 as in progress, and HO-9's
fallback (ADR, sequence diagram) is met either way. Work continues after
13 October toward the demo.

## Jira

- HO-9 (COA4-105, Jesse's) moves to In Progress once its branch has a commit,
  with a comment recording the decision to build past the 7 October kill date.
- CAP-26: its owner is checked before anything is said on it; a comment proposes
  how this supersedes its layout. It is not moved.
- PR #121 (L1quidDroid) and PR #120 (L1quidDroid) are affected. #120 must merge
  before the picker change; #121's author hears about the different shape from
  Jesse, not from the ADR.

## Not in scope

- Real student data reaching Claude. The demo runs on seeded fiction only.
- Any write from the sidecar to Laravel or to a product database.
- AI that drafts a narrative, sets or suggests a score, or writes a reviewer's
  comment.
- A vector index. At demo scale a brute-force ranking takes milliseconds.
- Background indexing or a queue worker.
- Auto-deploy from GitHub Actions, or any credential in GitHub.
