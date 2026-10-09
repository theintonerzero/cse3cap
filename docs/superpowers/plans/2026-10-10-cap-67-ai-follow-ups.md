# CAP-67 AI Sidecar Follow-ups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close every minor finding deferred by the reviews of the AI sidecar's core (#134), its student features (#135) and its reviewer features (#136). Jira COA4-137.

**Architecture:** No new features. Each item is a small change at the place its finding names, behind a test that fails first. The sidecar keeps its units: `DiaryReader`, `ClaudeGateway`, `SpendLedger`, `RateLimiter`, `VectorStore`, `ThemeCache`.

**Tech Stack:** Python 3.12, FastAPI, aiomysql, pytest. React 19 and Playwright for two web items.

**Spec:** `docs/superpowers/specs/2026-10-09-ai-sidecar-and-live-demo-design.md` and ADR #64. The findings are quoted on COA4-137 and in the ledgers of the three earlier plans (now in git history and this session's record).

## Global Constraints

- Laravel does not change (ADR #64).
- Tests never touch the shared database; DB tests need a `_test` database.
- A contract change goes in `docs/ai-openapi.yaml` in the same commit, then `npm run gen:types`.

## Review Focus

- A non-UUID id is refused with the envelope before any Laravel call.
- Two concurrent theme misses on one gig and day call Claude once, and neither request fails.
- A timed-out Claude call still counts against the day's cap.
- With AI off, any route, any method, answers 404 AI_DISABLED.

### Task 1: Request safety

Each item gets a failing test, then the fix:
- **The owner check fails closed.** `own_reflection` requires a non-empty `me.id` equal to the owner's id.
- **Path ids are UUIDs.** `reflection_id`, `entry_id` and `gig_id` are typed `uuid.UUID`, so a bad one is `400 VALIDATION_FAILED` before Laravel is called. This covers core M6 and 4a's "ids not UUIDs". Tests move to UUID fixtures.
- **AI off covers every route.** With AI off, an unmatched path or method is `404 AI_DISABLED` (M4).
- **`/status` with no database** answers `{"features": []}`.
- **The question filter** drops spelled-out numbers up to the scale's maximum, drops questions naming a level (the part of a descriptor before " — ", where one exists), and de-duplicates case-insensitively.
- **The coach's route tests:**
  - a self-score in the fixture never reaches the prompt;
  - a rate-limit refusal means no Claude call.

### Task 2: Similar reflections

- **Concurrent reads.** Read details through `reviewer.details()`: concurrent, and skipping a reflection that answers 403 or 404.
- **Gig names.** Add `gig_title` (string or null) to each related row; it comes from `/auth/me`'s participations. The web shows it when the row's gig is not this reflection's.

### Task 3: Themes

- **One call per gig and day.** `ThemeCache.lock(gig_id, day)` uses MySQL `GET_LOCK`. The route checks the cache again once it holds the lock.
- **No retry storm.** A failed reply (`invalid_reply` or `refusal`) is remembered in memory for 10 minutes and answered `{"themes": []}` without calling Claude.
- **Realistic `/auth/me`.** Tests use the shape Laravel returns: one row per gig, and `student` when they study there.
- **Contract wording.** The contract says "up to five".

### Task 4: Spend and housekeeping

- **Spend.**
  - A Claude timeout or connection error after a reservation settles at the reserved worst case (M1).
  - A counted prompt over 100,000 tokens is refused as `AI_UNAVAILABLE` with `reason: too_long`, before reserving (M2).
  - Amounts are quantised to 6 decimals (M3).
- **Housekeeping (M10).**
  - `RateLimiter` deletes windows older than a day, at most once a minute.
  - `content_hash` includes the embedding model's name.
- **Docs and tooling.**
  - The spec's data table names `usage_log` and `spend_days` (M10).
  - Retention-and-Erasure's paragraphs are reordered (M8).
  - `./run check` and `./run help` include `ai-test` and the AI contract lint (M7).
  - `coach.py` formatting.
  - Search's one detail read per reflection is recorded as a known cost in `docs/API-Specification.md` §13, not changed: Laravel has no bulk read, and ADR #64 keeps Laravel unchanged.

### Task 5: Web

- **No skeleton flash.** The similar-reflections skeleton shows only after 300 ms, so a quick reply never flashes it; a held reply still shows it.
- **Question keys.** `QuestionsPanel` keys questions by position, so a repeated question doesn't collide.

### Task 6: Checks and PR

Run:
- `./run ai-test` with the slow test;
- Redocly on both contracts;
- `npm run gen:types`;
- lint, prettier, tsc, build and e2e;
- tokens, contrast, `check-docs` and `contract-drift`.

Then a fresh whole-branch review, a PR into `dev`, and a comment on COA4-137.
