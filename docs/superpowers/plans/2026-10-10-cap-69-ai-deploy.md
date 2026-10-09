# CAP-69 AI Sidecar Deploy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Everything in the repository that the live demo needs to run the AI sidecar. Turning it on is then a short list of steps on the box. Jira COA4-139, step 5 of HO-9.

**Architecture:** The sidecar becomes a fourth service in the demo's compose project, `diary-ai`, built from the repository at the deployed SHA like the others.
- **Safe by default.** Its env file is optional: without one it starts with AI off and no database, and answers `404 AI_DISABLED`, so the auto-deploy timer can ship it before the box is ready.
- **Routing.** The public site routes `/ai/*` to it behind the existing gate, and the bundle points at `/ai/v1`.
- **Reset and smoke.** The reset empties `diary_ai`, and the smoke check looks at `/ai/v1/status`.
- **Evals.** These run from a laptop against real Claude.

**Tech Stack:** Docker and compose, Caddy, Python 3.12 with uv, bash.

**Spec:** `docs/superpowers/specs/2026-10-09-ai-sidecar-and-live-demo-design.md`: "The live demo", "Testing" (evals) and "Documents updated with the work". ADRs #62 and #64.

## Global Constraints

- **Agents don't touch the server.** The deploy never touches Caddy or the server compose project. `site.caddy` is the repository's file, and Jesse copies it on the box.
- **Secrets.** No secret goes in the repository. `ai.env` lives on the box (mode 0600), and `ai.env.example` holds placeholders only.
- **The database name.** It is verified over TLS with `db/letsencrypt-roots.pem`, as the API does.
- **Memory.** `mem_limit: 2g`.
- **The bundle.** It carries no token, and `./run bundle-secrets` passes unchanged.

## Review Focus

- **The deploy before the box is ready.** A deploy with no `shared/ai.env` still succeeds, and the demo behaves exactly as before.
- **The gate.** `/ai/*` without the gate cookie is the gate's 401 JSON; it never reaches the sidecar.
- **The reset.** It can't empty a database whose name isn't `diary_ai`.
- **The image.** The model is baked in: the first request doesn't download it.

### Task 1: The container

- **Image.** `deploy/demo/ai.Dockerfile`: python:3.12-slim with uv, `uv sync --frozen --no-dev`, and `FASTEMBED_CACHE_PATH=/opt/fastembed` with the model downloaded at build. It runs `uvicorn sidecar.app:create_app --factory` on port 8000 as a non-root user.
- **Compose.** A `diary-ai` service:
  - `image: diary-ai:${DIARY_SHA}` and `restart: unless-stopped`;
  - `env_file` with `required: false`;
  - `external_links` `mysql:rddb.darkovski.dev`;
  - `mem_limit: 2g`, on the `web` network.
- **Env example.** `deploy/demo/ai.env.example` has `AI_ENABLED=false`, `DIARY_API_BASE=http://diary-web/api/v1`, `DATABASE_URL`, `DATABASE_CA`, `ANTHROPIC_API_KEY=` and `DAILY_CAP_USD=5`.
- **Database TLS.** `Settings.database_ca`, and `db.connect(url, ca)` builds an SSL context with `check_hostname` and `CERT_REQUIRED` when given a CA.
- **Tests.**
  - `ai/tests/test_db.py`: TLS is on with a CA and off without one.
  - `deploy-demo.test.py`: static checks for the service, the image and the example file.

### Task 2: Routing and the bundle

- **Routing.** `site.caddy`: `reverse_proxy /ai/* diary-ai:8000` inside the gated `route`, before the app.
- **The bundle.** `web/.env.production` and `web.Dockerfile` set `VITE_AI_BASE_URL=/ai/v1`.
- **Tests.**
  - The local gate check also asserts that `/ai/...` without the cookie gets the 401 JSON, and with it reaches the sidecar stand-in.
  - A static check that `/ai/*` is proxied before `diary-web`.

### Task 3: Reset and smoke

- **Reset.** `python -m sidecar.reset` empties the five `diary_ai` tables, refusing a database whose name isn't `diary_ai` or `*_test`. `demo-reset.sh` runs it in `diary-ai` when `shared/ai.env` names a `DATABASE_URL`, and says so either way.
- **Smoke.** `smoke-demo.sh`: `/ai/v1/status` without the cookie is the 401 JSON. With the cookie and no token, the answer is a JSON envelope: 401 `UNAUTHENTICATED` when AI is on, 404 `AI_DISABLED` when it's off.
- **Tests.** pytest for the reset (a DB test, plus the refusal), and static checks.

### Task 4: Evals

- **Narratives.** `ai/evals/narratives.json` holds 15 fixed narratives: weak, strong, off-topic, prompt-injection attempts, level-baiting, and a long one.
- **README.** `ai/evals/README.md` holds the reading checklist. A README beside what it describes is allowed outside `docs/`.
- **Runner.** `python -m sidecar.evals` runs each through the coach prompt with a real `ClaudeGateway` and an in-memory ledger capped at US$0.05. It applies `keep_questions` and prints what Claude said next to what was kept.
- **Script.** `scripts/ai-eval.sh` wraps it and refuses without `ANTHROPIC_API_KEY`.
- **Test.** The runner with a fake gateway reports every narrative.

### Task 5: Docs

- **Deployment.md:** the service, `ai.env`, the database user and the Caddy route.
- **Runbook.md:**
  - turning AI on and off;
  - logs;
  - the spend cap;
  - reset;
  - evals.
- **Security-Review.md:** the API key, tokens in flight, the gate covering `/ai/*`, and the spend cap.
- **Architecture.md:** the sidecar, and the data-flow sequence diagram for SMD §6.5.
- **Frontend-and-Backend.md:** the production base path.
- **README docs table:** if a new doc is added.

### Task 6: Checks, review, PR

Run:
- `./run ai-test`;
- `deploy-demo.test.py`;
- e2e;
- the bundle-secrets check;
- check-docs.

Then a fresh review, the PR, merge on green, and comment on COA4-139.
