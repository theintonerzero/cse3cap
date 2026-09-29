# CAP-24 Final Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close CAP-24's injection criterion with browser checks instead of a read. Every
screen that renders text a person typed gets hostile text through the fake API, and the check
proves none of it runs.

**Architecture:** Extend `web/e2e/fake-api.ts` to serve the three reads the remaining screens
need: a reflection's detail, a gig's reflection list, and a reflection's events. Add one
fixture file of hostile data and one spec. Each test loads a screen, asserts the payload
appears as literal text, and asserts it never became markup: no `img[src="x"]` in the DOM, and
`window.__pwned` still undefined. A mutation per screen, never committed, proves each test can
fail. The review entry and sign-off go in `docs/Security-Review.md`.

**Tech Stack:** Playwright (`@playwright/test`, ADR #42), React 19, the generated `schema.ts`.

**Spec:** CAP-24 (COA4-82) acceptance criteria. The 2026-09-24 review entry in
`docs/Security-Review.md` names the gap this closes.

## Global Constraints

- No shared-database writes. Everything runs against `web/e2e/fake-api.ts` (ADR #42).
- The fake reproduces response shapes, never backend rules (ADR #42).
- Fixtures are typed against `web/src/api/schema.ts`. Never hand-write a response type.
- Findings are raised as tickets, not fixed inside the review (`docs/Security-Review.md`).
- No production code changes. A mutation made to prove a test is reverted before commit.
- `./run e2e` and `./run check` must pass before the PR.

---

### Task 1: The fake serves reflection detail, a gig's list, and events

**Files:**
- Modify: `web/e2e/fake-api.ts`

**Interfaces:**
- Produces: `export type ReflectionDetail`, `export type ReflectionEvent`. The constructor
  gains a fifth parameter, `events: Record<string, ReflectionEvent[]> = {}`. The `reflections`
  parameter widens to `(ReflectionSummary | ReflectionDetail)[]`. New routes:
  `GET /reflections` (filtered by the `gig_id` query, answering summaries) and
  `GET /reflections/:id/events`.

- [ ] **Step 1: Types.** Beside the existing exports:

```ts
export type ReflectionDetail = components['schemas']['ReflectionDetail'];
export type ReflectionEvent =
  paths['/reflections/{reflection_id}/events']['get']['responses']['200']['content']['application/json'][number];
```

Import `paths` alongside `components` from `../src/api/schema.ts`.

- [ ] **Step 2: Constructor.** Widen `reflections` to `(ReflectionSummary | ReflectionDetail)[]`,
  add `private readonly events: Record<string, ReflectionEvent[]>` and the fifth parameter,
  and `structuredClone` it like the others.

- [ ] **Step 3: Routes.** In `handle()`, before the `GET /reflections/:id` branch:

```ts
if (key === 'GET /reflections') {
  const gig_id = new URL(request.url()).searchParams.get('gig_id');
  return reply(
    route,
    200,
    this.reflections.filter((r) => r.gig_id === gig_id).map(summary_of),
  );
}

if (key === 'GET /reflections/:id/events') {
  if (!this.reflections.some((r) => r.id === id)) {
    return reply(route, 404, envelope('NOT_FOUND', 'No such resource, or it is not yours.'));
  }
  return reply(route, 200, this.events[id] ?? []);
}
```

and at the bottom of the file:

```ts
/** A list row is the summary: the detail's owner and entries are not in it. */
function summary_of(reflection: ReflectionSummary | ReflectionDetail): ReflectionSummary {
  const { owner: _owner, entries: _entries, ...rest } = reflection as ReflectionDetail;
  return rest;
}
```

- [ ] **Step 4: Nothing existing moved.** Run `./run e2e`. Expected: every existing spec passes.
  `cd web && npx tsc -b`. Expected: no errors.

- [ ] **Step 5: Commit.** `test(web): the e2e fake serves reflection detail, a gig's list and events (CAP-24)`

### Task 2: Hostile fixtures, and the student stepper

**Files:**
- Create: `web/e2e/hostile.ts`
- Create: `web/e2e/injection.spec.ts`

**Interfaces:**
- Produces from `hostile.ts`: `PAYLOAD`, `JS_URI`, `HOSTILE_FRAMEWORK`, `HOSTILE_GIG`,
  `HOSTILE_REFLECTION`, a `test` fixture wired with that data, `expect`, and
  `assertInert(page)`.

- [ ] **Step 1: `hostile.ts`.** The payload has two vectors. `<script>` added through
  `innerHTML` never runs, but `onerror` on an `img` does, so the `img` is the one that proves a
  sink:

```ts
export const PAYLOAD =
  '<img src=x onerror="window.__pwned=1"><script>window.__pwned=1</script>';
export const JS_URI = 'javascript:window.__pwned=1';

export async function assertInert(page: Page): Promise<void> {
  await expect(page.locator('img[src="x"]')).toHaveCount(0);
  expect(await page.evaluate(() => (window as { __pwned?: number }).__pwned)).toBeUndefined();
}
```

Data, typed with `FrameworkDetail`, `GigDetail`, `ReflectionDetail` and `ReflectionEvent` from
`fake-api.ts`:
- A framework whose first competency's `name` and every level `descriptor` are `PAYLOAD`.
- A gig whose `title` is `PAYLOAD`, with `my_role: 'student'`.
- A submitted reflection on it, `owner.display_name: PAYLOAD`. Entry 1 has `narrative: PAYLOAD`,
  a `link` evidence item with `label: PAYLOAD` and `uri: JS_URI`, a `file` evidence item with
  `label: PAYLOAD`, a self score, and a counter score whose `comment` and `scorer.display_name`
  are `PAYLOAD`.
- Events for that reflection: `reflection_submitted` with `actor_display_name: PAYLOAD`, and
  an unknown `event_type` of `<b>odd</b>`.

The `test` fixture is a copy of `fixtures.ts`'s, auto-installed, and it asserts
`api.unexpected` stays empty.

- [ ] **Step 2: The student stepper test.**

```ts
test('student stepper: every typed field is text, and a javascript: link is not a link', async ({ page }) => {
  await page.goto(`/reflections/${HOSTILE_REFLECTION}`);
  await expect(page.getByRole('heading', { name: 'Reflection' })).toBeVisible();

  await expect(page.getByLabel('Your reflection')).toHaveValue(PAYLOAD);
  await expect(page.getByText(PAYLOAD, { exact: true }).first()).toBeVisible();
  await expect(page.locator(`a[href^="javascript:"]`)).toHaveCount(0);
  await assertInert(page);
});
```

- [ ] **Step 3: Run it.** `./run e2e -g "student stepper"`. Expected: PASS. It passes because
  React already escapes. The failing half is Task 6's mutation, which is where this test
  proves it can catch a sink.

- [ ] **Step 4: Commit.** `test(web): hostile text through the student stepper (CAP-24)`

### Task 3: The assessor stepper

**Files:** Modify `web/e2e/injection.spec.ts`

- [ ] **Step 1: Test.** Open `/review-queue/reflections/${HOSTILE_REFLECTION}`, wait for the
  `Score reflection` heading, assert the owner's name renders literally in the status line and
  in the `… wrote` label, then `assertInert(page)`.
- [ ] **Step 2: Run.** `./run e2e -g "assessor stepper"`. Expected: PASS.
- [ ] **Step 3: Commit.** `test(web): hostile text through the assessor stepper (CAP-24)`

### Task 4: The edit framework screen, including what a supervisor types

**Files:** Modify `web/e2e/injection.spec.ts`

- [ ] **Step 1: Test.** Open `/frameworks/${HOSTILE_FRAMEWORK}/edit`. Assert the competency
  name field and a level field hold `PAYLOAD` as values. Fill `Name of your copy` with
  `PAYLOAD`, click `Save as a new copy`, wait for the `Saved as` text, and assert it contains
  the payload literally. Then `assertInert(page)`.
- [ ] **Step 2: Run.** `./run e2e -g "edit framework"`. Expected: PASS.
- [ ] **Step 3: Commit.** `test(web): hostile text through the edit framework screen (CAP-24)`

### Task 5: The history sheet

**Files:** Modify `web/e2e/injection.spec.ts`

- [ ] **Step 1: Test.** Open `/gigs/${HOSTILE_GIG}`, click `History`, wait for the
  `Reflection submitted (Sprint 1)` row, assert the actor renders literally and the unknown
  type shows as the humanised text `<b>odd</b>`, not bold. Then `assertInert(page)`.
- [ ] **Step 2: Run.** `./run e2e -g "history"`. Expected: PASS.
- [ ] **Step 3: Commit.** `test(web): hostile text through the gig page and its history (CAP-24)`

### Task 6: Prove each test can fail (no commit)

For each screen, swap one text sink for `dangerouslySetInnerHTML`, run its test, expect red,
then `git checkout -- <file>`:

| Screen | Mutation | Test |
| --- | --- | --- |
| Student stepper | `EntryStepper.tsx`, file evidence `<span>{item.label}</span>` | student stepper |
| Assessor stepper | `EntryStepper.tsx`, the owner name in the status line | assessor stepper |
| Edit framework | `EditFramework.tsx`, `Saved as {copy.name}` | edit framework |
| History | `HistorySheet.tsx`, `{row.actor}` | history |

Record each failure message for the PR. Finish with `git status`, which should list only
`web/e2e/`.

### Task 7: Sign-off

**Files:** Modify `docs/Security-Review.md`

- [ ] **Step 1:** Add a `2026-09-29 · The last two screens, and the injection criterion under
  test` entry at the top, with scope, method (the four specs and the four mutations), findings,
  and sign-off. Mark the 09-24 entry's "read, not tested" as superseded by this entry.
- [ ] **Step 2:** `./run check`, then PR into `dev`, CAP-24 In Review once CI is green, and Done
  after merge, with each criterion checked in a comment.
