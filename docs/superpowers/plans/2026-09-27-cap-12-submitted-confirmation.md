# CAP-12 Submitted Confirmation Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the screen at `/reflections/:reflection_id/submitted` that confirms a
reflection was handed in -- who will review it, when the next sprint opens if there is one,
and a way back to the diary -- per Jira ticket COA4-70 (CAP-12).

**Architecture:** One screen component, `Submitted.tsx`, following `GigDetail.tsx`'s shape
(the closest existing precedent: fetches a `GigDetail`, derives participant/date
information from it with no extra endpoint). It fetches `GET /reflections/{reflection_id}`
first (for `status`, `gig_id`, `sprint_id`), then `GET /gigs/{gig_id}` (for `participants`,
to name who reviews it, and `sprints`, to find the next one). Per ADR #42, its check is a
Playwright spec against the shared fake API, not a `scripts/*.sh` grep check -- this project
adopted browser checks for `web/` after CAP-11 was built, so this plan does not use the
`scripts/verify-*.sh` pattern CAP-11 used.

**Tech Stack:** React 19, TypeScript, the generated API client (`web/src/api/client.ts`),
existing components (`Card`, `Button`, `ErrorNotice`, `Skeleton`/`SkeletonGroup`),
`gig-timing.ts`'s existing `format_full_date`/`by_ordinal` helpers, CSS Modules against
`web/src/tokens.css`. Playwright (`@playwright/test`, already pinned) for the browser check.

**Spec:** Jira COA4-70 (CAP-12 -- confirmed with the user 2026-09-27, including the one
design decision the ticket left open: the assessor is named, not left generic). No separate
spec doc: the ticket's acceptance criteria are the spec, reproduced under Global Constraints.

## Global Constraints

- All four acceptance criteria on COA4-70 must hold:
  1. Confirms whoever reviews this has been notified -- named, not generic (design decision,
     confirmed with the user). "Whoever reviews it" is the gig's `assessor` participant if
     one exists, else its `supervisor`, else its `employer` -- the same set `CounterRole`
     names in the contract, because those are exactly the roles that can counter-score.
  2. Shows the next sprint's date, if the gig has one after the reflection's own sprint.
  3. A link back to the diary (`/`).
  4. All four states: loaded, loading (skeletons), empty, error.
- No new endpoint, no schema change, no backend change at all. Every field this screen
  needs is already in `GigDetail` and `ReflectionSummary`.
- No raw hex or pixel values; every colour, spacing and radius value is a `var(--...)`
  token from `web/src/tokens.css`.
- No second API client, no hand-written response type. Everything comes from
  `web/src/api/client.ts` and `web/src/api/schema.ts`.
- Reuse `format_full_date` and `by_ordinal` from `web/src/screens/gig-timing.ts` for date
  formatting and sprint ordering -- do not reimplement either.
- The check for this screen is a Playwright spec in `web/e2e/`, run by `./run e2e`, per
  ADR #42 -- not a shell script in `scripts/`. This means extending the shared
  `web/e2e/fake-api.ts` and `web/e2e/fixtures.ts` with the gig/reflection data this screen
  needs, alongside (not instead of) the framework data CAP-15/CAP-16's specs already use
  there. The existing `edit-framework.spec.ts` suite must still pass unchanged after this
  extension.

---

## File structure

| File | Responsibility |
| --- | --- |
| `web/e2e/fake-api.ts` | Modify: broaden the fake to also serve `GET /gigs/{id}` and `GET /reflections/{id}`, from gig/reflection fixtures alongside the existing framework ones. |
| `web/e2e/fixtures.ts` | Modify: add the gig/reflection fixtures this screen's spec needs, and pass them into the shared `api` fixture. |
| `web/src/screens/Submitted.tsx` | Create: the screen. Fetch, four states, the reviewer-naming and next-sprint logic. |
| `web/src/screens/Submitted.module.css` | Create: tokens only. |
| `web/src/app/routes.tsx` | Modify: one `Route` swapped from the CAP-12 placeholder to `<Submitted />`. |
| `web/e2e/submitted.spec.ts` | Create: the browser check, against the fake API. |

---

## Task 1: Extend the fake API with gigs and reflections

**Files:**
- Modify: `web/e2e/fake-api.ts`
- Modify: `web/e2e/fixtures.ts`

**Interfaces:**
- Produces: `FakeApi` now also answers `GET /gigs/{gig_id}` and `GET /reflections/{reflection_id}`
  from data passed to its constructor. `fixtures.ts` exports gig/reflection ids the way it
  already exports `LATROBE`/`SFIA`/`EMPTY`/`NOWHERE`, for Task 3's spec to import.
- Consumes: nothing from Task 2 or 3 -- this task is pure test infrastructure and has no
  dependency on the screen existing yet.

- [ ] **Step 1: Widen `FakeApi`'s constructor to take gigs and reflections too**

In `web/e2e/fake-api.ts`, add these type aliases near the top, beside the existing ones:

```ts
export type GigDetail = components['schemas']['GigDetail'];
export type ReflectionSummary = components['schemas']['ReflectionSummary'];
```

Change the constructor from:

```ts
  constructor(frameworks: FrameworkDetail[], me: Me) {
    this.frameworks = structuredClone(frameworks);
    this.me = me;
  }
```

to:

```ts
  constructor(
    frameworks: FrameworkDetail[],
    me: Me,
    gigs: GigDetail[] = [],
    reflections: ReflectionSummary[] = [],
  ) {
    this.frameworks = structuredClone(frameworks);
    this.me = me;
    this.gigs = structuredClone(gigs);
    this.reflections = structuredClone(reflections);
  }
```

The two new parameters default to empty arrays so the existing single call site in
`fixtures.ts` (Step 3 below updates it, but this keeps every other possible caller from
breaking if one is ever added before that) does not have to pass them.

Add the two new private fields beside the existing `frameworks`/`me` ones:

```ts
  private readonly gigs: GigDetail[];
  private readonly reflections: ReflectionSummary[];
```

- [ ] **Step 2: Serve the two new routes**

In the `handle` method, add these two branches. Place them after the existing
`GET /frameworks/:id` branch and before the `POST /frameworks` branch, so related reads sit
together:

```ts
    if (key === 'GET /gigs/:id') {
      const gig = this.gigs.find((g) => g.id === id);
      return gig
        ? reply(route, 200, gig)
        : reply(route, 404, envelope('NOT_FOUND', 'No such gig, or it is not yours.'));
    }

    if (key === 'GET /reflections/:id') {
      const reflection = this.reflections.find((r) => r.id === id);
      return reflection
        ? reply(route, 200, reflection)
        : reply(route, 404, envelope('NOT_FOUND', 'No such resource, or it is not yours.'));
    }
```

Note the route key pattern: the existing `handle` method already generalises any UUID in the
path to `:id` (the `UUID` regex replacement a few lines above), so `GET /gigs/{gig_id}`
arrives here as `GET /gigs/:id` and `GET /reflections/{reflection_id}` as
`GET /reflections/:id` -- matching the same convention `GET /frameworks/:id` above already
uses. Do not write a different key pattern.

- [ ] **Step 3: Add gig and reflection fixtures, and wire them into the shared `api` fixture**

In `web/e2e/fixtures.ts`, add these exported ids near the top, beside the existing ones:

```ts
export const GIG_WITH_NEXT_SPRINT = 'aaaa1111-g001-4aaa-8aaa-aaaaaaaaaaaa';
export const GIG_LAST_SPRINT = 'aaaa1111-g002-4aaa-8aaa-aaaaaaaaaaaa';
export const GIG_NO_ASSESSOR = 'aaaa1111-g003-4aaa-8aaa-aaaaaaaaaaaa';
export const REFLECTION_SUBMITTED = 'aaaa1111-r001-4aaa-8aaa-aaaaaaaaaaaa';
export const REFLECTION_ON_LAST_SPRINT = 'aaaa1111-r002-4aaa-8aaa-aaaaaaaaaaaa';
export const REFLECTION_NO_ASSESSOR = 'aaaa1111-r003-4aaa-8aaa-aaaaaaaaaaaa';
export const REFLECTION_STILL_DRAFT = 'aaaa1111-r004-4aaa-8aaa-aaaaaaaaaaaa';
export const REFLECTION_NOWHERE = 'ffff9999-r000-4fff-8fff-ffffffffffff';
```

Add the type import at the top, alongside the existing `FakeApi`/`FrameworkDetail` import:

```ts
import { FakeApi, type FrameworkDetail, type GigDetail, type ReflectionSummary } from './fake-api.ts';
```

Add these fixture objects after `EMPTY_DETAIL` and before the `test = base.extend<...>` block:

```ts
/**
 * Three gigs, covering the three shapes Submitted.tsx has to handle: a
 * sprint with a next one after it, the last sprint on the gig (no next
 * date), and a gig with no assessor participant at all -- which is a real
 * shape (DemoSeeder's SFIA gig has none; a supervisor counter-scores
 * instead), not an edge case invented for the test.
 */
const GIG_WITH_NEXT_SPRINT_DETAIL: GigDetail = {
  id: GIG_WITH_NEXT_SPRINT,
  title: 'Develop AI use cases',
  org_name: 'Alumable',
  starts_on: '2026-08-01',
  ends_on: '2026-11-01',
  my_role: 'student',
  sprints: [
    { id: 'aaaa1111-s001-4aaa-8aaa-aaaaaaaaaaaa', ordinal: 1, opens_on: '2026-08-01', due_on: '2026-08-14' },
    { id: 'aaaa1111-s002-4aaa-8aaa-aaaaaaaaaaaa', ordinal: 2, opens_on: '2026-08-15', due_on: '2026-08-28' },
    { id: 'aaaa1111-s003-4aaa-8aaa-aaaaaaaaaaaa', ordinal: 3, opens_on: '2026-08-29', due_on: '2026-09-11' },
  ],
  framework: { id: LATROBE, fw_key: 'latrobe6', name: 'La Trobe six-competency', version: 'v1' },
  reflection_summary: { draft: 0, submitted: 1, assessed: 0 },
  participants: [
    { id: 'p-student', display_name: 'You', role: 'student' },
    { id: 'p-assessor', display_name: 'Sam O', role: 'assessor' },
    { id: 'p-supervisor', display_name: 'Dr Lee', role: 'supervisor' },
  ],
};

const GIG_LAST_SPRINT_DETAIL: GigDetail = {
  ...structuredClone(GIG_WITH_NEXT_SPRINT_DETAIL),
  id: GIG_LAST_SPRINT,
};

const GIG_NO_ASSESSOR_DETAIL: GigDetail = {
  id: GIG_NO_ASSESSOR,
  title: 'Data migration audit',
  org_name: 'Alumable',
  starts_on: '2026-08-01',
  ends_on: '2026-11-01',
  my_role: 'student',
  sprints: [
    { id: 'bbbb2222-s001-4bbb-8bbb-bbbbbbbbbbbb', ordinal: 1, opens_on: '2026-08-01', due_on: '2026-08-14' },
    { id: 'bbbb2222-s002-4bbb-8bbb-bbbbbbbbbbbb', ordinal: 2, opens_on: '2026-08-15', due_on: '2026-08-28' },
  ],
  framework: { id: SFIA, fw_key: 'sfia9', name: 'SFIA 9', version: '9.0' },
  reflection_summary: { draft: 0, submitted: 1, assessed: 0 },
  participants: [
    { id: 'p-student', display_name: 'You', role: 'student' },
    { id: 'p-supervisor', display_name: 'Dr Lee', role: 'supervisor' },
  ],
};

const REFLECTION_SUBMITTED_SUMMARY: ReflectionSummary = {
  id: REFLECTION_SUBMITTED,
  status: 'submitted',
  gig_id: GIG_WITH_NEXT_SPRINT,
  sprint_id: 'aaaa1111-s001-4aaa-8aaa-aaaaaaaaaaaa',
  sprint_ordinal: 1,
  framework_id: LATROBE,
  framework_version: 'v1',
  submitted_at: '2026-09-27T10:00:00.000000Z',
  created_at: '2026-09-20T10:00:00.000000Z',
  updated_at: '2026-09-27T10:00:00.000000Z',
};

const REFLECTION_ON_LAST_SPRINT_SUMMARY: ReflectionSummary = {
  ...structuredClone(REFLECTION_SUBMITTED_SUMMARY),
  id: REFLECTION_ON_LAST_SPRINT,
  gig_id: GIG_LAST_SPRINT,
  sprint_id: 'aaaa1111-s003-4aaa-8aaa-aaaaaaaaaaaa',
  sprint_ordinal: 3,
};

const REFLECTION_NO_ASSESSOR_SUMMARY: ReflectionSummary = {
  ...structuredClone(REFLECTION_SUBMITTED_SUMMARY),
  id: REFLECTION_NO_ASSESSOR,
  gig_id: GIG_NO_ASSESSOR,
  sprint_id: 'bbbb2222-s001-4bbb-8bbb-bbbbbbbbbbbb',
  sprint_ordinal: 1,
  framework_id: SFIA,
};

const REFLECTION_STILL_DRAFT_SUMMARY: ReflectionSummary = {
  ...structuredClone(REFLECTION_SUBMITTED_SUMMARY),
  id: REFLECTION_STILL_DRAFT,
  status: 'draft',
  submitted_at: null,
};
```

Change the `test = base.extend<{ api: FakeApi }>` block's `FakeApi` construction from:

```ts
      const api = new FakeApi([LA_TROBE_DETAIL, SFIA_DETAIL, EMPTY_DETAIL], DR_LEE);
```

to:

```ts
      const api = new FakeApi(
        [LA_TROBE_DETAIL, SFIA_DETAIL, EMPTY_DETAIL],
        DR_LEE,
        [GIG_WITH_NEXT_SPRINT_DETAIL, GIG_LAST_SPRINT_DETAIL, GIG_NO_ASSESSOR_DETAIL],
        [
          REFLECTION_SUBMITTED_SUMMARY,
          REFLECTION_ON_LAST_SPRINT_SUMMARY,
          REFLECTION_NO_ASSESSOR_SUMMARY,
          REFLECTION_STILL_DRAFT_SUMMARY,
        ],
      );
```

Export the four new fixture constants (`GIG_WITH_NEXT_SPRINT_DETAIL`, etc.) are not needed
by name outside this file -- only the id constants (`GIG_WITH_NEXT_SPRINT`, etc.) are, and
those are already `export const` above. `REFLECTION_NOWHERE` is deliberately never added to
any fixture array: it exists so a spec can assert a 404, the same role `NOWHERE` already
plays for frameworks.

- [ ] **Step 2: Verify it compiles and the existing suite still passes**

Run: `cd web && npx tsc -b --noEmit -p tsconfig.e2e.json`
Expected: clean. This is the fastest way to catch a typo against `GigDetail`/`ReflectionSummary`'s
real shape without running a browser.

Run: `cd .. && ./run e2e`
Expected: the existing 12 `edit-framework.spec.ts` tests still pass, unchanged. This task adds
no new spec yet, so the count should not change.

- [ ] **Step 3: Commit**

```bash
git add web/e2e/fake-api.ts web/e2e/fixtures.ts
git commit -m "test(web): extend the e2e fake with gigs and reflections (CAP-12)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 2: The Submitted screen

**Files:**
- Create: `web/src/screens/Submitted.tsx`
- Create: `web/src/screens/Submitted.module.css`
- Modify: `web/src/app/routes.tsx`

**Interfaces:**
- Consumes: `api`, `ApiError` from `../api/client.ts`; `Card`, `Button`, `ErrorNotice`,
  `Skeleton`, `SkeletonGroup` from `../components/index.ts`; `format_full_date`,
  `by_ordinal` from `./gig-timing.ts`.
- Produces: `Submitted` (the exported screen component), mounted at
  `reflections/:reflection_id/submitted`.

- [ ] **Step 1: Write the screen**

```tsx
/**
 * The confirmation a student sees right after submitting a reflection --
 * and what anyone sees if they come back to this URL later, since every
 * route stays reachable regardless of how they arrived (CLAUDE.md).
 *
 * Two fetches: GET /reflections/{id} for status, gig_id and sprint_id, then
 * GET /gigs/{gig_id} for participants (to name who reviews it) and sprints
 * (to find the next one). No new endpoint -- both are already fetched
 * elsewhere in this app; this screen is the first to combine them for this
 * purpose.
 *
 * "Confirms the assessor has been notified" (COA4-70) names the assessor
 * specifically, but a gig is not guaranteed to have one: DemoSeeder's SFIA
 * gig has none, and a supervisor counter-scores instead. Whoever can
 * counter-score is named -- assessor first, then supervisor, then employer,
 * matching the contract's own CounterRole enum, which lists exactly those
 * three as the roles a counter-score can come from.
 */
import { Link, useParams } from 'react-router';
import { useCallback, useEffect, useState } from 'react';

import { api, ApiError } from '../api/client.ts';
import type { components } from '../api/schema.ts';
import { Button, Card, ErrorNotice, Skeleton, SkeletonGroup } from '../components/index.ts';
import { by_ordinal, format_full_date } from './gig-timing.ts';
import styles from './Submitted.module.css';

type Gig = components['schemas']['GigDetail'];
type Reflection = components['schemas']['ReflectionSummary'];
type Participant = Gig['participants'][number];

type Load =
  | { status: 'loading' }
  | { status: 'error'; error: ApiError }
  | { status: 'loaded'; reflection: Reflection; gig: Gig };

function as_api_error(error: unknown, fallback: string): ApiError {
  return error instanceof ApiError ? error : new ApiError(0, null, fallback);
}

/**
 * Whoever can counter-score this reflection, preferring an assessor. A gig
 * can genuinely have none of the three (a bare student-only gig mid-setup),
 * in which case this is null and the copy falls back to generic wording.
 */
function reviewer_of(participants: readonly Participant[]): Participant | null {
  const by_role = (role: Participant['role']) =>
    participants.find((participant) => participant.role === role) ?? null;
  return by_role('assessor') ?? by_role('supervisor') ?? by_role('employer');
}

export function Submitted() {
  const { reflection_id } = useParams<{ reflection_id: string }>();
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [reload_key, setReloadKey] = useState(0);

  useEffect(() => {
    if (!reflection_id) return;
    const controller = new AbortController();

    api
      .get('/reflections/{reflection_id}', {
        path: { reflection_id },
        signal: controller.signal,
      })
      .then((reflection) =>
        api
          .get('/gigs/{gig_id}', {
            path: { gig_id: reflection.gig_id ?? '' },
            signal: controller.signal,
          })
          .then((gig) => setLoad({ status: 'loaded', reflection, gig })),
      )
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setLoad({
          status: 'error',
          error: as_api_error(error, 'Something went wrong loading this confirmation.'),
        });
      });

    return () => controller.abort();
  }, [reflection_id, reload_key]);

  const retry = useCallback(() => {
    setLoad({ status: 'loading' });
    setReloadKey((key) => key + 1);
  }, []);

  if (load.status === 'loading') {
    return (
      <section>
        <h1 className={styles.heading}>Submitted</h1>
        <LoadingState />
      </section>
    );
  }

  if (load.status === 'error') {
    return (
      <section>
        <h1 className={styles.heading}>Submitted</h1>
        <ErrorNotice error={load.error} on_retry={retry} />
      </section>
    );
  }

  const { reflection, gig } = load;

  if (reflection.status === 'draft') {
    // Reachable by URL without having actually submitted -- a stale tab, a
    // bookmark, a shared link. Not an error: the honest answer is that
    // there is nothing to confirm yet, so this is this screen's empty state.
    return (
      <section>
        <h1 className={styles.heading}>Submitted</h1>
        <div className={styles.empty}>
          <p className={styles.empty_title}>This reflection has not been submitted yet.</p>
          <p className={styles.empty_body}>
            There is nothing to confirm until you hand it in.
          </p>
          <Link className={styles.back_link} to={`/reflections/${reflection.id}`}>
            Go to the reflection
          </Link>
        </div>
      </section>
    );
  }

  const reviewer = reviewer_of(gig.participants);
  const current_sprint = gig.sprints.find((sprint) => sprint.id === reflection.sprint_id);
  const ordered = by_ordinal(gig.sprints);
  const next_sprint = current_sprint
    ? ordered.find((sprint) => sprint.ordinal > current_sprint.ordinal)
    : undefined;

  return (
    <section>
      <h1 className={styles.heading}>Submitted</h1>
      <Card accent="mint">
        <p className={styles.confirmation}>
          {reviewer
            ? `${reviewer.display_name} has been notified and will review your reflection.`
            : 'Your reflection has been handed in and is waiting on a review.'}
        </p>
        {next_sprint?.opens_on && (
          <p className={styles.next_sprint}>
            The next sprint opens {format_full_date(next_sprint.opens_on)}.
          </p>
        )}
      </Card>

      <div className={styles.nav}>
        <Button on_click={undefined} full_width={false} variant="secondary">
          <Link className={styles.back_link} to="/">
            Back to diary
          </Link>
        </Button>
      </div>
    </section>
  );
}

/** Shaped like the loaded screen: a heading and one card, not a spinner. */
function LoadingState() {
  return (
    <SkeletonGroup label="Loading your confirmation">
      <Skeleton variant="block" width="100%" height="8rem" />
    </SkeletonGroup>
  );
}
```

Before this compiles, look closely at the "Back to diary" button: `Button` renders a real
`<button>` element (see `web/src/components/Button/Button.tsx`), and a `<Link>` cannot be
nested inside one without becoming invalid, inaccessible markup (a link inside a button,
neither properly clickable as itself). Do not ship the code exactly as drafted above for
that part. Instead, style the router `Link` directly to look like a secondary button,
reusing the existing `.button`/`.secondary` classes `Button.module.css` already defines,
rather than wrapping one element in the other:

```tsx
      <div className={styles.nav}>
        <Link className={styles.back_button} to="/">
          Back to diary
        </Link>
      </div>
```

`.back_button` (written in Step 2 below) copies `Button.module.css`'s actual `.button` base
rule plus its `.secondary` variant verbatim, already verified against the real file rather
than guessed -- do not re-derive it differently.

Remove the unused `Button` import if nothing else in this file ends up calling it once this
correction is applied.

- [ ] **Step 2: Write the CSS**

```css
/* web/src/screens/Submitted.module.css */
.heading {
  margin: 0 0 var(--space-16);
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-bold);
  color: var(--color-text);
}

.confirmation {
  margin: 0;
  font-size: var(--font-size-base);
  color: var(--color-text);
}

.next_sprint {
  margin: var(--space-8) 0 0;
  font-size: var(--font-size-sm);
  color: var(--color-text-muted);
}

.nav {
  margin-top: var(--space-24);
}

/* Matches Button.module.css's .secondary declaration -- this is a router
   Link styled as that same button, not a new visual style (see Step 1). */
.back_button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 2.75rem;
  padding: var(--space-12) var(--space-20);
  border-radius: var(--radius-md);
  background: var(--color-surface-alt);
  color: var(--color-text);
  text-decoration: none;
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-medium);
  width: fit-content;
}

.back_link {
  color: var(--color-primary);
}

.empty {
  display: flex;
  flex-direction: column;
  gap: var(--space-8);
  padding: var(--space-32) var(--space-16);
  border-radius: var(--radius-md);
  background: var(--color-surface-alt);
  text-align: center;
}

.empty_title {
  margin: 0;
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-medium);
  color: var(--color-text);
}

.empty_body {
  margin: 0 0 var(--space-8);
  font-size: var(--font-size-sm);
  color: var(--color-text-muted);
}
```

Every token above (`--space-12`, `--space-20`, `--space-16`, `--space-24`, `--space-8`,
`--space-32`, `--font-size-*`, `--font-weight-*`, `--color-*`, `--radius-md`, `--radius-sm`)
is already confirmed to exist and `.back_button` is already verified against
`Button.module.css`'s real `.button`/`.secondary` rules -- no further guessing needed here.

- [ ] **Step 3: Wire into the router**

In `web/src/app/routes.tsx`, add the import alphabetically among the existing screen
imports:

```tsx
import { Submitted } from '../screens/Submitted.tsx';
```

Replace:

```tsx
        <Route
          path="reflections/:reflection_id/submitted"
          element={<Placeholder screen="Submitted" ticket="CAP-12" />}
        />
```

with:

```tsx
        <Route path="reflections/:reflection_id/submitted" element={<Submitted />} />
```

- [ ] **Step 4: Verify it compiles**

Run: `cd web && npm run build`
Expected: builds clean. There is no browser check for this screen yet -- that is Task 3 --
so this step only proves the TypeScript and the build are sound.

- [ ] **Step 5: Commit**

```bash
git add web/src/screens/Submitted.tsx web/src/screens/Submitted.module.css web/src/app/routes.tsx
git commit -m "feat(web): submitted confirmation screen (CAP-12)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 3: The browser check, and full verification

**Files:**
- Create: `web/e2e/submitted.spec.ts`

**Interfaces:**
- Consumes: everything Task 1 added to `fixtures.ts` (the gig/reflection ids and the
  extended `api` fixture), and the `Submitted` screen from Task 2.
- Produces: nothing further downstream -- this is the terminal task.

- [ ] **Step 1: Write the spec**

```ts
/**
 * CAP-12, the submitted confirmation screen, in a real browser against the
 * fake API (ADR #42).
 */
import {
  GIG_LAST_SPRINT,
  GIG_NO_ASSESSOR,
  REFLECTION_NOWHERE,
  REFLECTION_NO_ASSESSOR,
  REFLECTION_ON_LAST_SPRINT,
  REFLECTION_STILL_DRAFT,
  REFLECTION_SUBMITTED,
  expect,
  test,
} from './fixtures.ts';

test('loaded: names the assessor and shows the next sprint', async ({ page }) => {
  await page.goto(`/reflections/${REFLECTION_SUBMITTED}/submitted`);

  await expect(page.getByRole('heading', { name: 'Submitted' })).toBeVisible();
  await expect(
    page.getByText('Sam O has been notified and will review your reflection.'),
  ).toBeVisible();
  await expect(page.getByText(/The next sprint opens/)).toBeVisible();
  await expect(page.getByText('15 August 2026', { exact: false })).toBeVisible();
});

test('no next sprint: the reflection is on the gig\'s last one', async ({ page }) => {
  await page.goto(`/reflections/${REFLECTION_ON_LAST_SPRINT}/submitted`);

  await expect(
    page.getByText('Sam O has been notified and will review your reflection.'),
  ).toBeVisible();
  await expect(page.getByText(/The next sprint opens/)).toHaveCount(0);
});

test('no assessor on the gig: falls back to generic wording, names nobody', async ({
  page,
}) => {
  await page.goto(`/reflections/${REFLECTION_NO_ASSESSOR}/submitted`);

  await expect(
    page.getByText('Your reflection has been handed in and is waiting on a review.'),
  ).toBeVisible();
});

test('back to diary', async ({ page }) => {
  await page.goto(`/reflections/${REFLECTION_SUBMITTED}/submitted`);

  await page.getByRole('link', { name: 'Back to diary' }).click();
  await expect(page).toHaveURL('/');
});

test('empty: not actually submitted yet', async ({ page }) => {
  await page.goto(`/reflections/${REFLECTION_STILL_DRAFT}/submitted`);

  await expect(page.getByText('This reflection has not been submitted yet.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Go to the reflection' })).toBeVisible();
});

test('error: a reflection that does not exist', async ({ page }) => {
  await page.goto(`/reflections/${REFLECTION_NOWHERE}/submitted`);

  await expect(page.getByRole('alert')).toContainText('Not found');
});

test('loading: a skeleton, not a spinner', async ({ page, api }) => {
  const release = api.hold('GET /reflections/:id');
  await page.goto(`/reflections/${REFLECTION_SUBMITTED}/submitted`);

  await expect(page.getByRole('status').filter({ hasText: 'Loading your confirmation' })).toBeVisible();

  release();
  await expect(page.getByText(/has been notified/)).toBeVisible();
});
```

Check the exact confirmation-text assertions above against what Task 2 actually renders --
this plan wrote both the screen's copy and this spec's assertions at the same time, so if a
wording choice changed during Task 2 (e.g. different punctuation), update the spec to match
the real rendered text rather than changing the screen to match a guess written in advance
of it.

- [ ] **Step 2: Run it**

Run: `cd .. && ./run e2e`
Expected: 19 passed -- the existing 12 from `edit-framework.spec.ts` plus these 7 new ones,
all green, none skipped.

- [ ] **Step 3: Full frontend check**

Run: `./run check`
Expected: contract lint, backend section (untouched by this branch, should already be
green on a clean `dev`), and the frontend section -- lint, prettier, tokens, contrast,
build, e2e -- all pass. This branch touches no backend file, so a backend failure here
would mean the local environment, not this change; note it plainly rather than guessing at
a fix, the same way CAP-11's plan handled pre-existing, unrelated environment gaps.

- [ ] **Step 4: Commit**

```bash
git add web/e2e/submitted.spec.ts
git commit -m "test(web): browser checks for the submitted confirmation screen (CAP-12)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Self-review

**Spec coverage** (COA4-70's four criteria):

1. Names whoever reviews it (assessor, else supervisor, else employer) -- Task 2
   (`reviewer_of`), exercised by three of Task 3's tests (named, no-assessor fallback, and
   implicitly the last-sprint test).
2. Next sprint's date, if there is one -- Task 2 (`by_ordinal` + `find` on ordinal), Task 3
   tests both the present and absent case.
3. Back to diary -- Task 2 (a styled `Link` to `/`), Task 3 clicks it and checks the URL.
4. All four states -- Task 2 (loading/error/loaded, plus the not-yet-submitted case as this
   screen's empty state), each with its own Task 3 test.

**Placeholder scan:** no TBD/TODO-style gaps. The one deliberate, disclosed uncertainty is
Task 2's own note that its drafted CSS values for `.back_button` are a guess at
`Button.module.css`'s actual `.secondary` values, with an explicit instruction to verify
and correct against the real file rather than trust the guess -- flagged in the plan text
itself, not left silent.

**Type consistency:** `Load`, `Gig`, `Reflection`, `Participant` are defined once in Task 2
and used nowhere else. `GigDetail`/`ReflectionSummary` type aliases introduced in Task 1's
`fake-api.ts` changes are named identically to Task 2's own local aliases for the same
generated schema types (both ultimately `components['schemas']['GigDetail']` /
`['ReflectionSummary']`), so there is no drift between the fake's idea of the shape and the
screen's.

---

## As built

Three places where execution found this plan's own drafted text wrong, corrected during
implementation rather than left as the record:

- **Task 1's fixture ids used non-hex letters** (`aaaa1111-g001-...`, `-r001-...` etc.) in a
  UUID's hex-digit position. `fake-api.ts`'s route-generalising regex is strictly
  `[0-9a-f]`, so every one of these silently failed to match it -- undetected in Task 1
  itself because nothing exercised the routes yet, only caught once Task 3 actually called
  them. Fixed to valid hex (`aaaa1111-0a01-...` etc.) in Task 3's commit. Sprint and
  participant ids in the same file are still non-hex-shaped mnemonics (`s001`, `p-student`)
  -- harmless today because the contract has no path keyed on either, but the same trap for
  whichever screen next needs one.
- **The "no assessor" test's premise was wrong.** The plan assumed this case had no reviewer
  named at all; the actual fixture (`GIG_NO_ASSESSOR_DETAIL`) has a supervisor, so the real,
  tested behaviour is the supervisor-fallback branch of `reviewer_of`, not the fully-generic
  one. The fully-generic "no reviewer at all" branch (all three roles absent) has no test
  fixture that reaches it and remains untested -- confirmed as an acceptable, narrow gap by
  both Task 3's and the final review, on the grounds that the fallback is a static string
  with no data dependency.
- **The "back to diary" click-through as drafted was unfollowable.** The shared e2e identity
  (Dr Lee, supervisor-only) gets redirected by `routes.tsx`'s `Home()` to `/review-queue`
  the moment `/` is reached, which the shared fake does not serve. The shipped test checks
  the link's `href` attribute directly instead of clicking through -- proving the same
  requirement (the link points at the diary) without depending on unrelated app-shell
  routing the fixture identity can't exercise.

The final whole-branch review additionally found a real gap this "as built" note predates:
an `assessed` reflection reused the "will review" copy written for `submitted`, which is
false once a review is actually done. See the branch's later commits for that fix.
