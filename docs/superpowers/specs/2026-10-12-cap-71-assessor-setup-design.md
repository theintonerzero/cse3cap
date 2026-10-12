# CAP-71: an assessor runs the whole product with one command: design

**Ticket:** CAP-71. **Decided with:** Jesse, 12 October 2026, in a brainstorming session.
**Branch:** `feat/CAP-71-assess`. **Freeze:** built after the v1.0.0 code freeze; the pull
request is a draft, held until Assessment 3 is submitted, as #151 is.

## Why

An assessor (the unit's marker, and possibly the client) clones the public repository onto
their own laptop. Today they can't run it: setup expects the team's shared MySQL on the VPS
and two passwords pinned in the team channel, and the AI needs the team's Anthropic key.
They should get from clone to signing in as Jane, on seeded data, in a few minutes, try
the AI with their own key if they want to, and run every test suite with one command.

## What success looks like

1. With Docker and git, and nothing else, `./assess` (or `.\assess.ps1` on Windows)
   brings up the app at `http://localhost:8080` with the seeded demo. The assessor signs
   in by picking a person; they never see a token or a password.
2. An Anthropic key, given at setup or later, turns the AI on, capped at US$1 a day. No
   key, no AI, and nothing else changes.
3. `./assess test` runs the backend, AI sidecar and browser suites and prints one
   summary.
4. Nothing the assessor runs touches the team's VPS, database or live demo, and no secret
   is committed.

## Constraints

- **Docker only.** Docker Desktop or Engine with Compose v2, and git. No PHP, Composer,
  Node, Python or MySQL on the host.
- **Same images as the live demo.** The three Dockerfiles in `deploy/demo/` are reused,
  not copied. Three shared files change, none of them what the live demo runs:
  `web.Caddyfile` gains an `/ai/*` route the demo never reaches, and `api.Dockerfile` and
  `ai.Dockerfile` each gain a `test` stage that is never their default.
- **No secret in the repository.** Database passwords and `APP_KEY` are generated on the
  first run; the Anthropic key is the assessor's own and stays on their machine.
- **Bash and PowerShell in step.** `assess` and `assess.ps1` offer the same commands with
  the same output, as `setup.sh`/`setup.ps1` and `run`/`run.ps1` do today.

## The commands

| Command | Does |
| --- | --- |
| `./assess`, `./assess up` | Checks Docker is running and the port is free. Builds the images, starts MySQL, seeds the demo on the first run only, and asks once for an optional key. Prints the URL and who to sign in as. A re-run starts what is stopped and reseeds nothing. |
| `./assess ai` | Shows the AI's state. Adds, replaces or removes the key (checked with Anthropic first), or changes the cap, then restarts the sidecar and confirms its answer. Flags: `--cap N`, `--off`. |
| `./assess test [api\|ai\|web]` | All three suites, or one. A summary, and a non-zero exit when any fails. |
| `./assess reset` | Reseeds the demo and empties the AI's tables. |
| `./assess smoke` | Checks the running stack from the outside (below). |
| `./assess status` | What is running, whether the AI is on, the URL. |
| `./assess down [--wipe]` | Stops everything. `--wipe` also deletes the volumes, the images and `.assess/`. |

`ASSESS_PORT` changes the port from 8080. Every failure says what to do next: Docker not
running, the port in use, a build that failed (with the step), a key Anthropic refused
(with Anthropic's own message).

## The stack

A Compose project named `diary-assess`, in `deploy/assess/compose.yml`, separate from the
team's environment and from the live demo's `diary` project.

| Service | From | Role |
| --- | --- | --- |
| `mysql` | `mysql:9.7.2`, as on the VPS | `reflection_diary` and `diary_ai`, plus `reflection_diary_test` and `diary_ai_test` for the suites. Each database has its own user, made by `deploy/assess/mysql-init/`. Never published to the host. Data in a named volume. |
| `diary-api` | `deploy/demo/api.Dockerfile` | Laravel, sync queue, the local MySQL without TLS. Evidence and exports in a named volume. |
| `diary-web` | `deploy/demo/web.Dockerfile` | The only published port, bound to `127.0.0.1:${ASSESS_PORT:-8080}`. Serves the bundle, `/api` to `diary-api`, `/demo/personas.json`, and `/ai` to `diary-ai`. |
| `diary-ai` | `deploy/demo/ai.Dockerfile` | On only with a key. Without one it answers `AI_DISABLED` and the app shows no AI. |

The services keep the demo's names, so `web.Caddyfile`'s upstreams resolve unchanged. The
new `/ai/*` route in `web.Caddyfile` never fires on the live demo, where the VPS's Caddy
sends `/ai` to the sidecar before a request reaches `diary-web`.

No gate and no password locally: the only port is bound to 127.0.0.1, and the persona
picker is the way in.

### Local state

`.assess/` at the repository root, git-ignored, files mode 600:

- `env`: database passwords and Laravel's `APP_KEY`, generated with a CSPRNG on the first
  run and kept, so a re-run keeps the same database.
- `ai.env`: `ANTHROPIC_API_KEY`, `AI_ENABLED`, `DAILY_CAP_USD`. Written only by the key
  prompt and `./assess ai`.
- `personas.json`: written by the seed step, mounted read-only into `diary-web`.

### Seeding

The steps of `scripts/demo-reset.sh`, run with `docker compose run diary-api`:
`migrate:fresh --drop-views --seed`, tokens for the demo people the seeder skips,
`demo-personas.php` to build `personas.json`, and the sidecar's `python -m sidecar.reset`.
The AI tables come from `ai/db/01-schema.sql`, loaded by the MySQL init. The assess script
only ever addresses the `diary-assess` project, so it cannot reach another database.

## The AI key

After the first seed, once:

```
AI features (optional): the coach, calibration questions, similar reflections,
search and themes. They use your own Anthropic key, capped at US$1 a day.
Paste an Anthropic API key, or press Enter to skip:
```

- Read silently. Never echoed, never on a command line (the check sends it as a header
  read from a 0600 file), written only to `.assess/ai.env`.
- `ANTHROPIC_API_KEY` already in the shell: `Use the key in ANTHROPIC_API_KEY? [Y/n]`.
- Checked with `GET /v1/models` before it is saved. A refusal prints Anthropic's message.
  The one seen on 12 October (a key not scoped to a workspace) adds a hint: make the key
  inside a workspace in the Anthropic Console.
- `DAILY_CAP_USD=1`. The sidecar's existing reservation applies: at the cap, the Claude
  features say they're unavailable until midnight UTC, and similar reflections and search,
  which never call Claude, keep working. Model as built, `claude-haiku-5-5`.
- After a change the sidecar restarts and its status is confirmed: 401 when on,
  `AI_DISABLED` when off.

Where to try each feature, printed after a key is accepted and in the guide: Jane on a
draft (the coach, "From your earlier sprints"), Tom on an assessed reflection with a gap
(the calibration coach), Sam in the review queue (search by meaning, recurring themes).

## Tests

| Suite | How |
| --- | --- |
| api | A `test` stage in `api.Dockerfile`, from the same base, with Composer's dev dependencies. PHPUnit against `reflection_diary_test`. The final, default stage is still the runtime, so the live demo builds exactly what it builds today. |
| ai | A `test` stage in `ai.Dockerfile` with the dev dependencies. pytest with `AI_TEST_DATABASE_URL` on `diary_ai_test`, so the database tests that skip on a laptop run. |
| web | `mcr.microsoft.com/playwright`, pinned to the version in `web/package-lock.json` (1.63.0 today). `npm ci` then `npx playwright test` against the fake API, Chromium and Firefox. No backend needed. |

The summary reads like `api 412 passed · ai 131 passed · web 453 passed`.

## Checks on this path

- `scripts/assess.test.py`, static, wired into `./run check` and CI: MySQL never
  published; the web port bound to 127.0.0.1; `.assess/` git-ignored; no secret in
  `deploy/assess/`; `assess` and `assess.ps1` expose the same commands; `web.Caddyfile`
  has the `/ai` route; the default stage of both Dockerfiles is still the runtime.
- `./assess smoke`, against the running stack: the page loads, `/up` answers,
  `personas.json` lists six people, one persona's token reads `/api/v1/auth/me`,
  `/ai/v1/status` answers 401 with a key and `AI_DISABLED` without.
- Before the pull request: a full run on macOS with Docker (`up` with and without a key,
  `ai` on and off, `reset`, `test`, `down --wipe` then `up`), and `assess.ps1` under
  PowerShell 7 on macOS. Real Windows is not proven, and the pull request says so.

## Documentation

- `docs/Assessor-Guide.md`: prerequisites, the commands, who to sign in as for what, the
  AI features and their cost, the tests, troubleshooting, cleaning up. Listed in the
  README's documents table.
- The README gains a short "For assessors" block near the top: clone, `./assess`, open the
  link.
- ADR #67: a second, self-contained way to run the product, with its own local database.
  Why that sits beside, not against, the shared-database rule, which governs the team's
  environment.

## Out of scope

- A login screen, or any change to how the app authenticates.
- Publishing images to a registry. The assessor builds locally.
- Native (non-Docker) assessor setup. The team's own setup is unchanged.
- Changing the live demo's compose project, gate or deploy, beyond the `web.Caddyfile` route
  and the two Dockerfiles' extra `test` stages.

## Shipping

Draft pull request, a reviewer requested, held until Assessment 3 is submitted. After it:
merge #151, merge this, then release `dev` to `main` as v1.0.1, which also carries the PDF
fix the v1.0.0 tag lacks.
