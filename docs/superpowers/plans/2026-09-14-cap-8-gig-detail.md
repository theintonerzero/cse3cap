# CAP-8 Gig Detail Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps
> use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the placeholder at `/gigs/:gig_id` with the gig detail screen: a header
carrying the gig, its assigned framework and the people on it with their roles; a sprint
list that says when each sprint opens and is due, in relative words where they help; a
diary card linking into the diary home already scoped to this gig; and all four states.

**Architecture:** One screen component, `web/src/screens/GigDetail.tsx`, built the way
`DiaryHome.tsx` and `ReviewQueue.tsx` are: its own fetch through the typed client, its own
state machine, no props. It needs exactly one call — `GET /gigs/{gig_id}` returns
`GigDetail`, which already carries the title, the org, the dates, `my_role`, the sprints
with `opens_on` and `due_on`, the framework, `reflection_summary` and `participants`. The
only logic worth reading twice is the relative date wording, and it lives in a separate
pure module, `web/src/screens/gig-timing.ts`, which imports nothing at all — not React, not
the generated schema — so a check in `scripts/` can compile it and call it with dates of its
own choosing.

**Tech Stack:** React 19.2.8, TypeScript 6.x (pinned, ADR #18), Vite 8, react-router 8.3.1.
CSS Modules + `tokens.css` custom properties only, per ADR #28. No new dependency.

**Spec:** Jira CAP-8, "Gig detail screen", epic Student Reflection Journey, exported to
`docs/jira/cap-sprint-3.csv`. The four acceptance criteria are reproduced verbatim below.
There is no separate written spec file: the ticket carries written acceptance criteria, so
the design conversation the brainstorming skill asks for has already happened. The calls
this plan makes beyond them are recorded in "Decisions recorded here".

### The acceptance criteria, verbatim

1. Header with the gig, the assigned framework and the participant roles.
2. Sprint list with `opens_on` and `due_on`, worded relatively where it helps: "due in 3
   days", "not open yet". Sprints are a table rather than an integer precisely so this is
   possible.
3. Diary card linking into the diary home scoped to that gig.
4. All four states.

Depends on CAP-3 (core components) and CAP-5 (app shell). Both are merged into `dev`:
CAP-3 in #18, CAP-5 in #30. CAP-7 (#32) is merged too, which matters because criterion 3
links into the screen CAP-7 built — `origin/dev` is at `29c949b` and carries all three.
Nothing else has landed since; the only open PRs are four dependabot bumps, none of which
this plan touches.

The Jira export still labels CAP-8 `owner-andrew`. Patrick has taken the ticket over. Any
later work of Tony's that assumes this screen exists is his to hook up; it is not in scope
here and is not a reason to change anything below.

**The commands in Task 4 were trialled before this plan was written**, not guessed: the
module was compiled with `web/node_modules/.bin/tsc --ignoreConfig …`, the eleven cases and
four date assertions were run under `TZ=Pacific/Auckland` and `TZ=America/Los_Angeles`, and
breaking the `Due tomorrow` boundary was confirmed to print
`MISMATCH 2026-09-01..2026-09-15: want open/Due tomorrow, got open/Due in 1 days` and exit
1. Two things that trial caught are already folded in: node needs `{"type":"module"}` in the
temp directory, and the check must not assert day/month word order, which follows the
reader's locale.

---

## Global Constraints

- **CAP-8 only.** Nothing else goes on this branch. Anything found along the way is
  recorded in "Follow-ups, not in this plan" at the foot of this document and left alone.
- **Frontend only.** `api/`, `db/`, `docs/openapi.yaml` and the seeders are not touched.
  This screen needs no endpoint and no field that does not already exist. If it turns out
  to need one, stop and say so rather than inventing it.
- **No migration and no seeder runs anywhere in this plan**, so the shared-database rule in
  `CLAUDE.md` is not engaged. Nothing here writes to MySQL at all.
- **Every API call goes through `web/src/api/client.ts`.** No component calls `fetch`,
  parses a response body, or declares its own response interface.
- **Types are generated, never written.** `web/src/api/schema.ts` comes from
  `docs/openapi.yaml` via `npm run gen:types` and is not edited. Every payload type in this
  plan is spelled `components['schemas']['X']`.
- **snake_case prop and function names**, matching every existing component (`on_click`,
  `full_width`, `on_retry`). Established by CAP-3/CAP-4, followed by CAP-5, CAP-6 and CAP-7.
- **No raw hex and no `px` value anywhere in `web/src/` outside `tokens.css`.**
  `scripts/check-tokens.sh` reads `.tsx` as well as `.css` and fails CI on either.
  Available tokens: `--color-bg --color-surface --color-surface-alt --color-border
  --color-text --color-text-muted --color-text-inverse --color-primary --color-primary-hover
  --color-success --color-success-bg --color-danger --color-danger-bg --color-focus-ring
  --color-accent-peach --color-accent-mint --color-accent-cream --color-accent-coral
  --color-accent-pink --color-accent-lavender --color-accent-evidence --space-4 --space-8
  --space-12 --space-16 --space-20 --space-24 --space-32 --space-48 --space-64 --radius-sm
  --radius-md --radius-lg --radius-full --font-size-xs --font-size-sm --font-size-base
  --font-size-lg --font-size-xl --font-size-2xl --font-weight-regular --font-weight-medium
  --font-weight-bold --line-height-tight --line-height-normal --line-height-relaxed
  --font-family-base --border-width-sm`.
- **A tinted background takes a `--color-text` foreground.** Four pairs fail WCAG AA in
  light mode: `--color-text-muted` on `--color-surface-alt` (4.32), `--color-success` on
  `--color-success-bg` (4.32), `--color-danger` on `--color-danger-bg` (3.97),
  `--color-primary` on `--color-bg` (4.29). Any new text-on-background pair this screen
  introduces is added to `PAIRS` in `scripts/check-contrast.mjs`.
- **Reusable components first.** `Card`, `Button`, `Chip`, `Badge`, `TextArea`,
  `ProgressBar`, `BottomSheet`, `RadarPanel`, `Skeleton`, `SkeletonGroup`, `ErrorNotice`
  already exist in `web/src/components/` and are imported from the barrel
  `web/src/components/index.ts`. Build nothing this ticket can borrow.
- **`web/tsconfig.app.json` is strict in four ways that bite.** `verbatimModuleSyntax: true`
  — a type-only import MUST be written `import type { X }` or `import { type X }`.
  `noUnusedLocals` and `noUnusedParameters` — an unused import fails the build.
  `erasableSyntaxOnly: true` — no `enum`, no `namespace`, no parameter properties.
  `allowImportingTsExtensions` — imports carry their `.ts`/`.tsx` extension, as every
  existing file does. `strict: true` throughout.
- **`web/` has no test runner** (CLAUDE.md). Verification is a script in `scripts/` wired
  into `./run`, plus the ritual CAP-3 established: load the screen at 390px and 1280px, in
  both themes, and look.
- **A business rule is never reimplemented here.** This screen renders what the API
  returns. Nothing in `api/app/Services/` reads `opens_on` or `due_on` — grep confirms it —
  so the sprint dates are *informational*, and the copy must not imply a gate that does not
  exist. See Decision 4.
- **Branch `feat/CAP-8-gig-detail` off `origin/dev`**, in the main working tree, matching
  how CAP-5 and CAP-7 were done. The local `dev` is stale at `a0a6c79`; fetch first.

## Decisions recorded here

Six calls this plan makes that the ticket leaves open. Each is written into the code with
its reasoning attached, so reversing one is a small edit rather than archaeology.

**1. One call, no second fetch.** `GET /gigs/{gig_id}` returns `GigDetail`, which is every
field all four criteria need, including `reflection_summary` for the diary card and
`participants` for the header. `GET /reflections?gig_id=…` would give a list of rows this
screen has no criterion to show, and the counts are already server-computed and
role-scoped — `GigController::visibleReflections` gives a student their own and an
assessor, supervisor or employer every one on the gig. Re-deriving that here would be the
second implementation of a rule.

**2. `gig-timing.ts` imports nothing, including the generated schema.** Its functions take
a structural `{ opens_on: string | null; due_on: string | null }` rather than
`components['schemas']['Sprint']`. Two reasons, and the first is the important one: a
module with no imports can be compiled by `tsc` on its own and called from `node`, which is
what lets the check in Task 4 assert the wording at real boundary dates instead of grepping
for the word "Due". The second is that the wording genuinely depends on two dates and
nothing else. The screen still types its payload as `components['schemas']['GigDetail']`
and passes contract-typed sprints straight in; TypeScript checks the shapes match at the
call site, which is where a contract change should break. This is a deliberate difference
from `diary-scope.ts`, which does import the schema, and the module header says so.

**3. Date arithmetic is done in whole calendar days, in UTC, from the string parts.**
`opens_on` and `due_on` are `format: date` — `YYYY-MM-DD`, no time. `new Date('2026-08-03')`
is UTC midnight, so comparing it against a local `new Date()` is off by a day for every
user west of Greenwich, and `toLocaleDateString` with no `timeZone` renders "2 Aug" for
them. Both are fixed the same way: parse the parts by hand, build `Date.UTC(...)` for both
the sprint date and today's *local* calendar day, subtract, divide by 86,400,000. There is
no hour arithmetic anywhere, so no DST case exists. This is the bug the executable check in
Task 4 is there to catch, and it is why that check is executable.

**4. Past due is worded "Due 2 days ago", never "Closed" or "Overdue".** Nothing in
`api/app/Services/` reads either date; the submit gate is about evidence and narrative, not
the calendar. "Closed" would tell a student a sprint is shut when the API will happily
accept it, and "Overdue" adds a judgement the product does not make. The relative phrase
states the fact and stops.

**5. A relative phrase is dropped beyond 30 days, and the absolute dates are always shown.**
"Due in 312 days" is noise, and the ticket says relative wording is for "where it helps".
Past the horizon the row falls back to the dates alone, which it was carrying anyway: every
row shows `3 Aug – 16 Aug` under its heading regardless, because the criterion asks for
`opens_on` and `due_on`, not only for a paraphrase of them.

**6. The diary card's link is for a student; the counts are for everyone.** Criterion 3 is
a card linking into the diary home scoped to that gig, and CAP-7 built that scope as
`/?gig_id=…` (its Decision 1 anticipated this ticket by name). But the diary home is the
student's own record and renders "The diary is the student's own record" to anybody else,
so linking Dr Lee there would be a link to a dead end. The card therefore renders the
counts for every role, and the link only when `my_role === 'student'`. For any other role
it says where that person's work actually is, without linking to `/review-queue` — that
route is still CAP-10's placeholder, and a link to a placeholder is worse than a sentence.

## What the seed actually shows, and what it does not

`DemoSeeder` gives both gigs three fortnightly sprints from 2026-08-03: sprint 1 opens
08-03 due 08-16, sprint 2 opens 08-17 due 08-30, sprint 3 opens 08-31 due 09-13. Today is
2026-09-14. **Every seeded sprint is open and past due**, so the screen rendered against
the seed shows three "Due N days ago" rows and no other wording. "Not open yet" and "Due in
3 days" cannot be produced by looking at the app.

This is exactly why Task 4's check compiles `gig-timing.ts` and calls it with dates of its
own: the wordings the acceptance criterion names by example are proved there rather than by
screenshot. Reshaping the seed so a future sprint exists is a `/seed-data` change to a
database five people share, it is backend, and it is not CAP-8 — recorded as a follow-up.

## File structure

| File | Responsibility |
| --- | --- |
| `web/src/screens/gig-timing.ts` | **Create.** Pure date logic: whole-day arithmetic, the sprint's state, its relative phrase, its absolute date range, and ordinal sorting. No imports at all. |
| `web/src/screens/GigDetail.tsx` | **Create.** The screen: one load, four states, header, sprint list, diary card. |
| `web/src/screens/GigDetail.module.css` | **Create.** Its styles, tokens only. |
| `web/src/app/routes.tsx` | **Modify.** Mount `GigDetail` at `gigs/:gig_id` in place of the CAP-8 placeholder. |
| `scripts/verify-gig-detail.sh` | **Create.** The check, since `web/` has no test runner. Greps for the invariants, *executes* `gig-timing.ts`, and hits the live endpoint when a server and a token are there. |
| `run` | **Modify.** A `verify-gig` target and its help line. |
| `docs/Stack-and-Build-Scope.md` | **Modify.** Tick the Gig detail row in 4.3. |
| `web/README.md` | **Modify.** Name the screen and its check. |
| `README.md` | **Modify.** Whatever status table claims this screen is unbuilt. |

---

### Task 1: The pure timing module

**Files:**
- Create: `web/src/screens/gig-timing.ts`

**Interfaces:**
- Consumes: nothing. This module imports nothing.
- Produces: `DatedSprint`, `SprintState`, `SprintTiming`, `RELATIVE_HORIZON_DAYS`,
  `days_between(iso: string, today: Date): number`,
  `format_short_date(iso: string): string`,
  `sprint_dates(sprint: DatedSprint): string | null`,
  `gig_dates(starts_on: string | null, ends_on: string | null): string | null`,
  `sprint_timing(sprint: DatedSprint, today: Date): SprintTiming`,
  `by_ordinal<T extends { ordinal: number }>(sprints: readonly T[]): T[]`.

- [ ] **Step 1: Write the module**

Create `web/src/screens/gig-timing.ts`:

```ts
/**
 * When a sprint opens, when it is due, and how to say so in words.
 *
 * Sprints are a table rather than an integer on the reflection precisely
 * so this file can exist (CAP-8's criterion 2 says as much). Everything
 * here is a pure function of two dates and "today", with no React and --
 * deliberately, unlike diary-scope.ts -- no import of the generated
 * schema either. The screen passes contract-typed sprints straight in and
 * TypeScript checks the shapes match at the call site; keeping this module
 * import-free is what lets scripts/verify-gig-detail.sh compile it on its
 * own and call it with dates of its own choosing, which is the only way
 * the wordings in the acceptance criteria get proved at all. The seeded
 * sprints are all in the past.
 *
 * Nothing in api/app/Services/ reads opens_on or due_on: the submit gate
 * is about evidence and narrative, not the calendar. So a past sprint is
 * "Due 2 days ago", never "Closed" and never "Overdue" -- the first would
 * claim a gate the API does not enforce and the second adds a judgement
 * the product does not make.
 */

/**
 * The shape this module needs, which is the shape the contract's Sprint
 * happens to have. Structural rather than imported: see the header.
 */
export interface DatedSprint {
  opens_on: string | null;
  due_on: string | null;
}

export type SprintState = 'not_open' | 'open' | 'past_due' | 'undated';

export interface SprintTiming {
  state: SprintState;
  /** The relative phrase, or null when a relative phrase does not help. */
  relative: string | null;
  /** "3 Aug – 16 Aug". Null only when the sprint carries no dates at all. */
  dates: string | null;
}

/**
 * Past this many days a relative phrase stops helping and starts being
 * noise: "Due in 312 days" tells a student nothing the date beside it did
 * not. The row keeps its absolute dates either way.
 */
export const RELATIVE_HORIZON_DAYS = 30;

const MS_PER_DAY = 86_400_000;

/**
 * Whole calendar days from today to an ISO date. Negative is the past.
 *
 * Both sides are reduced to a UTC midnight before subtracting: the left
 * from the string's own parts, the right from today's LOCAL calendar day.
 * Parsing 'YYYY-MM-DD' with the Date constructor gives UTC midnight, so
 * comparing it against a local `new Date()` is a day out for every user
 * west of Greenwich. There is no hour arithmetic here, so DST never
 * arises.
 */
export function days_between(iso: string, today: Date): number {
  const [year, month, day] = iso.split('-').map(Number);
  const then = Date.UTC(year, month - 1, day);
  const now = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());

  return Math.round((then - now) / MS_PER_DAY);
}

/** "3 Aug". Formatted in UTC for the same reason days_between is. */
export function format_short_date(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);

  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

/**
 * Criterion 2 asks for opens_on and due_on, not only for a paraphrase of
 * them, so this is rendered on every row whatever the relative phrase says
 * -- and it is all a row past the horizon has left.
 */
export function sprint_dates(sprint: DatedSprint): string | null {
  const { opens_on, due_on } = sprint;

  if (opens_on && due_on) {
    return `${format_short_date(opens_on)} – ${format_short_date(due_on)}`;
  }
  if (opens_on) return `From ${format_short_date(opens_on)}`;
  if (due_on) return `Due ${format_short_date(due_on)}`;

  return null;
}

/**
 * The state a sprint is in and the sentence that says so.
 *
 * A null opens_on counts as open rather than as never opening, matching
 * chippable_sprints in diary-scope.ts: the alternative hides a sprint that
 * may well have reflections against it.
 */
/**
 * The gig's own span, for the line under its title. Here rather than in the
 * screen because it is the same date-only value with the same timezone
 * trap, and a second copy of format_short_date beside it is how the two
 * drift.
 */
export function gig_dates(starts_on: string | null, ends_on: string | null): string | null {
  if (starts_on && ends_on) {
    return `${format_short_date(starts_on)} – ${format_short_date(ends_on)}`;
  }
  if (starts_on) return `From ${format_short_date(starts_on)}`;
  if (ends_on) return `Until ${format_short_date(ends_on)}`;

  return null;
}

export function sprint_timing(sprint: DatedSprint, today: Date): SprintTiming {
  const dates = sprint_dates(sprint);

  if (!sprint.opens_on && !sprint.due_on) {
    return { state: 'undated', relative: null, dates: null };
  }

  if (sprint.opens_on) {
    const until_open = days_between(sprint.opens_on, today);

    if (until_open > 0) {
      return { state: 'not_open', relative: opens_phrase(until_open), dates };
    }
  }

  if (!sprint.due_on) {
    return { state: 'open', relative: null, dates };
  }

  const until_due = days_between(sprint.due_on, today);

  if (until_due < 0) {
    return { state: 'past_due', relative: past_due_phrase(-until_due), dates };
  }

  return { state: 'open', relative: due_phrase(until_due), dates };
}

function opens_phrase(days: number): string {
  if (days > RELATIVE_HORIZON_DAYS) return 'Not open yet';
  if (days === 1) return 'Not open yet, opens tomorrow';

  return `Not open yet, opens in ${days} days`;
}

function due_phrase(days: number): string | null {
  if (days > RELATIVE_HORIZON_DAYS) return null;
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';

  return `Due in ${days} days`;
}

function past_due_phrase(days: number): string | null {
  if (days > RELATIVE_HORIZON_DAYS) return null;
  if (days === 1) return 'Due yesterday';

  return `Due ${days} days ago`;
}

/**
 * Ordinal order, from a copy. GigController eager-loads sprints with no
 * order by, so the array arrives in whatever order MySQL returned it, and
 * sorting the payload in place would mutate a caller's object.
 */
export function by_ordinal<T extends { ordinal: number }>(sprints: readonly T[]): T[] {
  return [...sprints].sort((a, b) => a.ordinal - b.ordinal);
}
```

Note `opens_phrase` keeps "Not open yet" past the horizon while the two due phrases return
null. That asymmetry is deliberate: "not open yet" is a *state*, and a row that says only
"3 Sep – 16 Sep" with no other mark would read as though it were live. "Due in 312 days" is
a *countdown*, and dropping it loses nothing the date does not already say.

- [ ] **Step 2: Check it compiles and lints**

```bash
cd web && npx tsc -b --noEmit && npm run lint
```

Expected: no output from `tsc`, and oxlint reporting no warnings for this file. `tsc -b`
builds the whole project, so an error elsewhere is not yours.

- [ ] **Step 3: Check the token rule**

```bash
./scripts/check-tokens.sh
```

Expected: passes. This module has no colours or pixel values in it; the run is to confirm
the en dash in `sprint_dates` is not read as a raw value the way a numeric HTML entity
would be.

- [ ] **Step 4: Commit**

```bash
git add web/src/screens/gig-timing.ts
git commit -m "feat(web): when a sprint opens, when it is due, in words (CAP-8)"
```

---

### Task 2: The screen, mounted, with its four states

**Files:**
- Create: `web/src/screens/GigDetail.tsx`
- Create: `web/src/screens/GigDetail.module.css`
- Modify: `web/src/app/routes.tsx`

**Interfaces:**
- Consumes: `by_ordinal`, `gig_dates` and `sprint_timing` from `./gig-timing.ts`; `api` and `ApiError`
  from `../api/client.ts`; `components` from `../api/schema.ts`; `useSession` from
  `../session/useSession.ts`; `Badge`, `Card`, `ErrorNotice`, `Skeleton` and
  `SkeletonGroup` from `../components/index.ts`.
- Produces: `GigDetail`, a component taking no props, mounted at `gigs/:gig_id`.

- [ ] **Step 1: Write the screen**

Create `web/src/screens/GigDetail.tsx`:

```tsx
/**
 * One gig: who is on it, what rubric it is scored against, when its
 * sprints open and are due, and the way into the diary scoped to it.
 *
 * One call. GET /gigs/{gig_id} returns GigDetail, which carries every
 * field all four criteria need -- including reflection_summary, already
 * counted and already role-scoped by the server
 * (GigController::visibleReflections gives a student their own and an
 * assessor, supervisor or employer every one on the gig), and
 * participants, which only this endpoint returns. Fetching reflections
 * again to count them here would be that rule implemented twice.
 *
 * The relative date wording is all in gig-timing.ts, which imports
 * nothing, so scripts/verify-gig-detail.sh can compile it and call it with
 * dates the seed does not contain. Every seeded sprint is already past
 * due, so "not open yet" and "due in 3 days" are unreachable by looking at
 * the app.
 */
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';

import { api, ApiError } from '../api/client.ts';
import type { components } from '../api/schema.ts';
import {
  Badge,
  Card,
  ErrorNotice,
  Skeleton,
  SkeletonGroup,
} from '../components/index.ts';
import { useSession } from '../session/useSession.ts';
import { by_ordinal, gig_dates, sprint_timing } from './gig-timing.ts';
import styles from './GigDetail.module.css';

type Gig = components['schemas']['GigDetail'];
type Participant = Gig['participants'][number];
type Role = components['schemas']['Role'];

type Load =
  | { status: 'loading' }
  | { status: 'error'; error: ApiError }
  | { status: 'loaded'; gig: Gig };

/** How a role is said to a person, rather than how the database spells it. */
const ROLE_LABEL: Record<Role, string> = {
  student: 'Student',
  assessor: 'Assessor',
  supervisor: 'Supervisor',
  employer: 'Employer',
};

export function GigDetail() {
  const { gig_id } = useParams<{ gig_id: string }>();
  const { me } = useSession();
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [reload_key, setReloadKey] = useState(0);

  useEffect(() => {
    // The route pattern guarantees this, the type does not. A missing id
    // is the same answer the API would give for a bad one, and
    // ErrorNotice already owns the copy for NOT_FOUND.
    if (!gig_id) {
      setLoad({
        status: 'error',
        error: new ApiError(404, 'NOT_FOUND', 'No such gig, or it is not yours.'),
      });
      return;
    }

    const controller = new AbortController();

    api
      .get('/gigs/{gig_id}', { path: { gig_id }, signal: controller.signal })
      .then((gig) => setLoad({ status: 'loaded', gig }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setLoad({
          status: 'error',
          error:
            error instanceof ApiError
              ? error
              : new ApiError(0, null, 'Something went wrong loading this gig.'),
        });
      });

    return () => controller.abort();
  }, [gig_id, reload_key]);

  const retry = useCallback(() => {
    setLoad({ status: 'loading' });
    setReloadKey((key) => key + 1);
  }, []);

  if (load.status === 'loading') return <LoadingState />;

  /*
   * A 404 here is "no such gig, or it is not yours", and the two are
   * deliberately indistinguishable (docs/openapi.yaml, NotFound).
   * ErrorNotice already switches on NOT_FOUND and on ROLE_FORBIDDEN and
   * already decides that a 4xx is not worth a retry button, so this hands
   * it the error rather than re-deciding any of that here.
   */
  if (load.status === 'error') {
    return (
      <section>
        <h1 className={styles.heading}>Gig</h1>
        <ErrorNotice error={load.error} on_retry={retry} />
      </section>
    );
  }

  const { gig } = load;

  return (
    <section>
      <GigHeader gig={gig} me_id={me?.id ?? null} />
      <SprintList sprints={gig.sprints} today={new Date()} />
      <DiaryCard gig={gig} />
    </section>
  );
}

/**
 * Criterion 1: the gig, the assigned framework, and the participant roles.
 *
 * The framework line names the rubric and its version because a score is
 * only ever read against the rubric it was given under, and neither the
 * axes nor the scale are fixed -- that is the whole point of the framework
 * engine. Null is a real state: GigFramework is nullable in the contract
 * and a gig with no assignment yet cannot be reflected on at all.
 */
function GigHeader({ gig, me_id }: { gig: Gig; me_id: string | null }) {
  const when = gig_dates(gig.starts_on, gig.ends_on);
  const where = [gig.org_name, when].filter((part): part is string => part !== null);

  return (
    <header className={styles.header}>
      <h1 className={styles.heading}>{gig.title}</h1>
      {where.length > 0 && <p className={styles.sub}>{where.join(' · ')}</p>}

      <p className={styles.framework}>
        {gig.framework ? (
          <>
            Scored against <strong>{gig.framework.name}</strong> ({gig.framework.version})
          </>
        ) : (
          'No rubric assigned to this gig yet.'
        )}
      </p>

      <ParticipantList participants={gig.participants} me_id={me_id} />
    </header>
  );
}

/**
 * Everyone on the gig and what they are on it. Roles come from the server,
 * resolved from gig_participants; the client never decides one.
 *
 * The caller is marked rather than hidden. On a gig the point is who else
 * is here, and a list that silently omits you reads as though the API
 * dropped a row.
 */
function ParticipantList({
  participants,
  me_id,
}: {
  participants: Participant[];
  me_id: string | null;
}) {
  if (participants.length === 0) {
    return <p className={styles.sub}>Nobody is on this gig yet.</p>;
  }

  return (
    <ul className={styles.people}>
      {participants.map((person) => (
        <li key={`${person.id}:${person.role}`} className={styles.person}>
          <span className={styles.person_name}>
            {person.display_name}
            {person.id === me_id && <span className={styles.you}> (you)</span>}
          </span>
          <span className={styles.person_role}>{ROLE_LABEL[person.role]}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Criterion 2. Every row carries its dates; the relative phrase is added
 * where it helps and dropped past gig-timing's horizon.
 *
 * The rows are not links. A sprint has no screen of its own -- CAP-11's
 * stepper addresses a reflection, and this screen cannot know whether one
 * exists for a sprint without a request per row. The way into the diary is
 * the card below, which is what criterion 3 asks for.
 */
function SprintList({
  sprints,
  today,
}: {
  sprints: Gig['sprints'];
  today: Date;
}) {
  if (sprints.length === 0) {
    return (
      <section className={styles.block}>
        <h2 className={styles.block_heading}>Sprints</h2>
        <div className={styles.empty}>
          <p className={styles.empty_title}>No sprints on this gig yet.</p>
          <p className={styles.empty_body}>
            A reflection belongs to a sprint, so nothing can be written here until someone
            adds one.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.block}>
      <h2 className={styles.block_heading}>Sprints</h2>
      <ul className={styles.sprints}>
        {by_ordinal(sprints).map((sprint) => {
          const timing = sprint_timing(sprint, today);

          return (
            <li key={sprint.id} className={styles.sprint}>
              <span className={styles.sprint_title}>Sprint {sprint.ordinal}</span>
              <span className={styles.sprint_dates}>
                {timing.dates ?? 'No dates set'}
              </span>
              {timing.relative && (
                <span className={`${styles.sprint_when} ${styles[timing.state]}`}>
                  {timing.relative}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * Criterion 3: into the diary home, already scoped to this gig.
 *
 * CAP-7 put scope in the URL as ?gig_id= for exactly this (its Decision 1
 * names this ticket), so the link is a query string and nothing more.
 *
 * The counts are the server's, role-scoped, and shown to everyone. The
 * link is not: the diary home is the student's own record and tells
 * anybody else so, and sending a supervisor there would be a link to a
 * dead end. /review-queue is not offered as the alternative because that
 * route is still CAP-10's placeholder, and a link to a placeholder is
 * worse than a sentence.
 */
function DiaryCard({ gig }: { gig: Gig }) {
  const counts = gig.reflection_summary;
  const total = counts.draft + counts.submitted + counts.assessed;
  const is_student = gig.my_role === 'student';

  return (
    <section className={styles.block}>
      <h2 className={styles.block_heading}>Diary</h2>
      <Card accent="lavender">
        <div className={styles.diary}>
          <p className={styles.diary_body}>{diary_copy(gig.my_role, total)}</p>

          <ul className={styles.counts}>
            <li>
              {counts.assessed} assessed
              <Badge status="assessed" />
            </li>
            <li>
              {counts.submitted} submitted
              <Badge status="submitted" />
            </li>
            <li>
              {counts.draft} draft
              <Badge status="draft" />
            </li>
          </ul>

          {is_student && (
            <Link className={styles.diary_link} to={`/?gig_id=${gig.id}`}>
              Open your diary for this gig
            </Link>
          )}
        </div>
      </Card>
    </section>
  );
}

/**
 * What the card says, which depends on the role and on whether anything has
 * been written. Pulled out of the JSX because a nested ternary in the middle
 * of a paragraph is unreadable at prettier's 92 columns.
 */
function diary_copy(my_role: Role, total: number): string {
  if (my_role !== 'student') {
    return (
      'Reflections on this gig that you can see. The diary itself is each ' +
      'student’s own record; your work on it is in the review queue.'
    );
  }

  if (total === 0) {
    return 'Nothing written on this gig yet. Your diary is where a reflection starts.';
  }

  return 'Your reflections on this gig, and the radar for them.';
}

/** Shaped like the loaded screen: a header, three sprint rows, a card. */
function LoadingState() {
  return (
    <SkeletonGroup label="Loading this gig">
      <div className={styles.header}>
        <Skeleton variant="text" width="50%" />
        <Skeleton variant="text" width="30%" />
        <Skeleton variant="text" lines={2} width="70%" />
      </div>
      <ul className={styles.sprints}>
        {[0, 1, 2].map((row) => (
          <li key={row} className={styles.sprint}>
            <Skeleton variant="text" lines={2} width="45%" />
          </li>
        ))}
      </ul>
      <div className={styles.block}>
        <Skeleton variant="block" height="var(--space-64)" />
      </div>
    </SkeletonGroup>
  );
}
```

- [ ] **Step 2: Write the styles**

Create `web/src/screens/GigDetail.module.css`. Tokens only — no hex, no pixel value.

```css
.heading {
  margin: 0 0 var(--space-4);
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-bold);
  color: var(--color-text);
}

.header {
  display: flex;
  flex-direction: column;
  gap: var(--space-8);
  margin-bottom: var(--space-24);
}

.sub {
  margin: 0;
  font-size: var(--font-size-sm);
  color: var(--color-text-muted);
}

.framework {
  margin: 0;
  font-size: var(--font-size-sm);
  line-height: var(--line-height-relaxed);
  color: var(--color-text);
}

.people {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-8);
  margin: var(--space-4) 0 0;
  padding: 0;
  list-style: none;
}

.person {
  display: flex;
  align-items: baseline;
  gap: var(--space-8);
  padding: var(--space-4) var(--space-12);
  border: var(--border-width-sm) solid var(--color-border);
  border-radius: var(--radius-full);
  background: var(--color-surface);
}

.person_name {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--color-text);
}

.you {
  font-weight: var(--font-weight-regular);
  color: var(--color-text-muted);
}

.person_role {
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
}

.block {
  margin-top: var(--space-24);
}

.block_heading {
  margin: 0 0 var(--space-12);
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-medium);
  color: var(--color-text);
}

.sprints {
  display: flex;
  flex-direction: column;
  gap: var(--space-12);
  margin: 0;
  padding: 0;
  list-style: none;
}

.sprint {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--space-8) var(--space-16);
  padding: var(--space-16);
  border: var(--border-width-sm) solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
}

.sprint_title {
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-medium);
  color: var(--color-text);
}

.sprint_dates {
  font-size: var(--font-size-sm);
  color: var(--color-text-muted);
}

/* The relative phrase is the one thing on the row worth colouring, and
   the tint carries --color-text rather than the semantic colour: four
   pairs of coloured-text-on-tinted-fill fail AA in light mode, and
   --color-danger on --color-danger-bg is the worst of them at 3.97. */
.sprint_when {
  margin-left: auto;
  padding: var(--space-4) var(--space-12);
  border-radius: var(--radius-full);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
  color: var(--color-text);
  background: var(--color-surface-alt);
}

.not_open {
  background: var(--color-accent-cream);
}

.open {
  background: var(--color-accent-mint);
}

.past_due {
  background: var(--color-accent-peach);
}

.undated {
  background: var(--color-surface-alt);
}

.diary {
  display: flex;
  flex-direction: column;
  gap: var(--space-12);
}

.diary_body {
  margin: 0;
  font-size: var(--font-size-sm);
  line-height: var(--line-height-relaxed);
  color: var(--color-text);
}

.counts {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-8) var(--space-16);
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: var(--font-size-sm);
  color: var(--color-text);
}

.counts li {
  display: flex;
  align-items: center;
  gap: var(--space-8);
}

.diary_link {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
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

/* --color-text-muted on --color-surface-alt is 4.32:1 in light mode and
   fails AA, so the body copy in a tinted empty state stays --color-text.
   DiaryHome has the same pairing and is a recorded follow-up, not a
   precedent to copy. */
.empty_body {
  margin: 0;
  font-size: var(--font-size-sm);
  line-height: var(--line-height-relaxed);
  color: var(--color-text);
}
```

- [ ] **Step 3: Mount it**

In `web/src/app/routes.tsx`, add the import beside `DiaryHome`:

```tsx
import { GigDetail } from '../screens/GigDetail.tsx';
```

and replace the CAP-8 placeholder route:

```tsx
        <Route path="gigs/:gig_id" element={<GigDetail />} />
```

Also update the file's opening comment: it currently says "The diary home is the first one
that is no longer a placeholder (CAP-7)." Make it name both.

- [ ] **Step 4: Build, lint, format, tokens**

```bash
cd web && npx tsc -b --noEmit && npm run lint && npx prettier --write src/screens/GigDetail.tsx src/screens/GigDetail.module.css src/screens/gig-timing.ts src/app/routes.tsx
cd .. && ./scripts/check-tokens.sh
```

Expected: all four clean. If `check-tokens.sh` flags the en dash or the right single quote
in the diary copy, read its known-false-positive header before changing anything.

- [ ] **Step 5: Commit**

```bash
git add web/src/screens/GigDetail.tsx web/src/screens/GigDetail.module.css web/src/app/routes.tsx
git commit -m "feat(web): the gig, its rubric, its people and its sprints (CAP-8)"
```

---

### Task 3: Look at it against real data

**Files:** none. This task changes nothing; it is the looking CAP-3 established, and it
comes before the check so that what the check asserts is what was actually seen.

- [ ] **Step 1: Start a server and point the app at it**

Either the real API, which is what shows the seeded gigs:

```bash
./run api            # :8000, in one terminal
./run web            # :5173, in another
```

`web/.env` should read `VITE_API_BASE_URL=http://localhost:8000/api/v1`. Jane's token is
the one to develop with — she is a student on both gigs. Tokens are in
`~/reflection-diary-tokens.txt`.

- [ ] **Step 2: Look at the loaded state, both themes, both widths**

Open `/gigs/<the La Trobe gig id>` as Jane. Expect: the title, `Alumable · 3 Aug – 26 Oct`,
"Scored against La Trobe six-competency (v1)", Jane marked "(you)" beside Dr Lee and Sam
with their roles, three sprint rows each reading `3 Aug – 16 Aug` and so on with a peach
"Due N days ago" pill, and a lavender diary card with the counts and a link.

**The day/month order follows your browser's locale**, so an en-US browser renders
`Aug 3 – Aug 16` and an en-AU one `3 Aug – 16 Aug`. Both are correct; `format_short_date`
passes `undefined` as the locale on purpose, exactly as `DiaryHome`'s own date line does.
What must be true in either is the *number*: the sprint that opens on the 3rd says 3, not
2. That is the timezone assertion Task 4 makes from both sides of UTC.

Check at 390px and at 1280px, in light and dark. At 390px the sprint row wraps and the
relative pill drops to its own line; confirm it does not overflow.

- [ ] **Step 3: Look at the other three states**

- **Loading:** throttle the network in devtools, or stop the API mid-navigation.
- **Error, 404:** open `/gigs/00000000-0000-4000-8000-000000000000`. Expect ErrorNotice's
  "Not found", with no retry button — a 4xx is a considered answer.
- **Error, unreachable:** stop the API and reload. Expect "Cannot reach the server" *with*
  a retry button.
- **Empty:** no seeded gig has zero sprints and none has a null framework, so the two empty
  branches cannot be reached against the seed. Reach them by temporarily editing the loaded
  payload in the React devtools, or by running `./run mock` and letting prism return a gig
  with an empty `sprints` array. Do not change the seeder.
- **Another role:** open the same gig with Dr Lee's token. Expect the counts with no diary
  link and the supervisor wording.

Jane is a student on both gigs, so `my_role` is `student` on each and the diary link
renders. Sam is an assessor on the La Trobe gig only — use his token on the *other* gig to
confirm this screen 404s rather than leaking it.

- [ ] **Step 4: Record what you saw**

Nothing to commit. Note anything that looked wrong; fix it in Task 2's files and amend, or
record it as a follow-up if it is not CAP-8's.

---

### Task 4: The check

**Files:**
- Create: `scripts/verify-gig-detail.sh`
- Modify: `run`

**Interfaces:**
- Consumes: `web/src/screens/gig-timing.ts` (compiled and executed), `web/src/screens/GigDetail.tsx`
  and `web/src/app/routes.tsx` (grepped), `GET /gigs/{gig_id}` (live, optional).
- Produces: `./run verify-gig`.

- [ ] **Step 1: Write the script**

Create `scripts/verify-gig-detail.sh`, modelled on `scripts/verify-diary-home.sh` and
sharing its output helpers verbatim so the three verify scripts read alike.

```bash
#!/usr/bin/env bash
#
# Proves the gig detail screen's invariants still hold.
#
#   ./run verify-gig                  from the repository root
#   ./scripts/verify-gig-detail.sh    the same thing
#
# web/ has no test runner (CLAUDE.md), so this is where a frontend check
# lives. verify-client.sh covers the API client, verify-app-shell.sh the
# shell and verify-diary-home.sh the diary; this covers the gig detail
# screen, and they do not overlap.
#
# 1. The screen is actually mounted. A screen built but left behind a
#    placeholder is a screen nobody can reach.
# 2. The diary card links into the diary home SCOPED, and the diary home
#    still reads that scope back. A ?gig_id= nobody parses is a link that
#    silently lands on the unfiltered diary.
# 3. No second API client, and no hand-written response type.
# 4. All four states, including skeletons rather than a spinner.
# 5. The relative wording is REAL. gig-timing.ts is compiled and called
#    with dates chosen here, because every seeded sprint is already past
#    due: "not open yet" and "due in 3 days" cannot be produced by looking
#    at the app, so they are proved here or not at all.
# 6. GET /gigs/{gig_id} really carries what the header renders, and a gig
#    the caller is not on is a 404. Needs a server and a token; skips
#    itself loudly when there is neither.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

BASE="${BASE:-http://127.0.0.1:8000/api/v1}"
TOKENS="${TOKENS:-$HOME/reflection-diary-tokens.txt}"
SCREEN="web/src/screens/GigDetail.tsx"
TIMING="web/src/screens/gig-timing.ts"
SCOPE="web/src/screens/diary-scope.ts"
ROUTES="web/src/app/routes.tsx"

if [ -t 1 ]; then
    blu=$'\033[1;34m'; grn=$'\033[1;32m'; red=$'\033[1;31m'
    ylw=$'\033[1;33m'; off=$'\033[0m'
else
    blu=''; grn=''; red=''; ylw=''; off=''
fi

pass=0; fail=0; skip=0
say()  { printf '\n%s==>%s %s\n' "$blu" "$off" "$1"; }
ok()   { pass=$((pass+1)); printf '  %sok%s   %-54s %s\n' "$grn" "$off" "$1" "${2:-}"; }
bad()  { fail=$((fail+1)); printf '  %sFAIL%s %-54s %s\n' "$red" "$off" "$1" "${2:-}"; }
meh()  { skip=$((skip+1)); printf '  %sskip%s %-54s %s\n' "$ylw" "$off" "$1" "${2:-}"; }

# --------------------------------------------------------------------------
say "1. The screen is mounted"

if grep -q '<GigDetail />' "$ROUTES"; then
    ok "routes.tsx renders GigDetail"
else
    bad "routes.tsx renders GigDetail" "gigs/:gig_id still a placeholder?"
fi

if grep -q 'screen="Gig detail" ticket="CAP-8"' "$ROUTES"; then
    bad "the CAP-8 placeholder is gone" "still in $ROUTES"
else
    ok "the CAP-8 placeholder is gone"
fi

# --------------------------------------------------------------------------
say "2. The diary card links into the diary, scoped"

if grep -q '/?gig_id=' "$SCREEN"; then
    ok "the card links to /?gig_id="
else
    bad "the card links to /?gig_id=" "criterion 3 is a SCOPED link"
fi

if grep -q "params.get('gig_id')" "$SCOPE"; then
    ok "the diary home reads gig_id back" "scope round-trips"
else
    bad "the diary home reads gig_id back" "check $SCOPE"
fi

# --------------------------------------------------------------------------
say "3. One API client, no hand-written types"

if grep -qE '\bfetch\(' "$SCREEN" "$TIMING"; then
    bad "no direct fetch" "$(grep -lE '\bfetch\(' "$SCREEN" "$TIMING" | tr '\n' ' ')"
else
    ok "no direct fetch"
fi

if grep -qE '^\s*(export )?interface .*(Response|Payload)\b' "$SCREEN" "$TIMING"; then
    bad "no hand-written response type" "declare it in the contract instead"
else
    ok "no hand-written response type"
fi

if grep -q "from '../api/schema.ts'" "$SCREEN"; then
    ok "payload types come from the generated schema"
else
    bad "payload types come from the generated schema" "check $SCREEN"
fi

# gig-timing.ts is import-free ON PURPOSE: that is what lets section 5
# compile and run it. An import creeping in breaks the check silently.
if grep -qE "^\s*import " "$TIMING"; then
    bad "gig-timing.ts imports nothing" "section 5 compiles it standalone"
else
    ok "gig-timing.ts imports nothing"
fi

# --------------------------------------------------------------------------
say "4. All four states"

states_missing=""
grep -q "status: 'loading'" "$SCREEN" || states_missing="$states_missing loading"
grep -q "status: 'error'" "$SCREEN"   || states_missing="$states_missing error"
grep -q 'styles.empty' "$SCREEN"      || states_missing="$states_missing empty"
grep -q "status: 'loaded'" "$SCREEN"  || states_missing="$states_missing loaded"

if [ -z "$states_missing" ]; then
    ok "loading, error, empty and loaded all present"
else
    bad "loading, error, empty and loaded all present" "missing:$states_missing"
fi

if grep -q 'Skeleton' "$SCREEN"; then
    ok "loading uses skeletons, not a spinner"
else
    bad "loading uses skeletons, not a spinner"
fi

# --------------------------------------------------------------------------
say "5. The relative wording, actually executed"

TSC="web/node_modules/.bin/tsc"
OUT="$(mktemp -d)"
trap 'rm -rf "$OUT"' EXIT

if [ ! -x "$TSC" ]; then
    meh "sprint wording" "no web/node_modules; run npm install in web/"
elif ! "$TSC" --ignoreConfig --target es2022 --module esnext \
        --moduleResolution bundler --strict --outDir "$OUT" "$TIMING" >"$OUT/tsc.log" 2>&1; then
    bad "gig-timing.ts compiles standalone" "$(head -1 "$OUT/tsc.log")"
else
    ok "gig-timing.ts compiles standalone"

    # tsc emits gig-timing.JS, and node decides CommonJS or ESM from the
    # nearest package.json. There is none in a mktemp dir, so node 24 gets
    # there by syntax detection and node 20 does not. Say it explicitly
    # rather than depend on which node the reader has.
    printf '{"type":"module"}' > "$OUT/package.json"

    # Every case the acceptance criterion names, plus the boundaries and
    # the timezone trap. "today" is fixed, so this cannot drift.
    cat > "$OUT/check.mjs" <<'JS'
import { sprint_timing, days_between, format_short_date, gig_dates } from './gig-timing.js';

const today = new Date(2026, 8, 14);          // 14 Sep 2026, LOCAL
const cases = [
  [{ opens_on: '2026-09-20', due_on: '2026-10-03' }, 'not_open', 'Not open yet, opens in 6 days'],
  [{ opens_on: '2026-09-15', due_on: '2026-09-28' }, 'not_open', 'Not open yet, opens tomorrow'],
  [{ opens_on: '2026-09-01', due_on: '2026-09-17' }, 'open',     'Due in 3 days'],
  [{ opens_on: '2026-09-01', due_on: '2026-09-15' }, 'open',     'Due tomorrow'],
  [{ opens_on: '2026-09-01', due_on: '2026-09-14' }, 'open',     'Due today'],
  [{ opens_on: '2026-08-31', due_on: '2026-09-13' }, 'past_due', 'Due yesterday'],
  [{ opens_on: '2026-08-03', due_on: '2026-08-16' }, 'past_due', 'Due 29 days ago'],
  [{ opens_on: '2026-01-05', due_on: '2026-01-18' }, 'past_due', null],
  [{ opens_on: '2027-06-01', due_on: '2027-06-14' }, 'not_open', 'Not open yet'],
  [{ opens_on: null,         due_on: '2026-09-17' }, 'open',     'Due in 3 days'],
  [{ opens_on: null,         due_on: null         }, 'undated',  null],
];

let failed = 0;
for (const [sprint, state, relative] of cases) {
  const got = sprint_timing(sprint, today);
  const label = `${sprint.opens_on ?? '-'}..${sprint.due_on ?? '-'}`;
  if (got.state !== state || got.relative !== relative) {
    console.log(`  MISMATCH ${label}: want ${state}/${relative}, got ${got.state}/${got.relative}`);
    failed++;
  }
}

// The timezone trap, stated twice. days_between must put today at zero,
// and format_short_date must render the 14th as the 14th -- west of
// Greenwich a naively parsed 'YYYY-MM-DD' renders as the 13th, which is
// the bug this module exists to not have. The script runs this file under
// two TZs, so both assertions are made from both sides of UTC.
if (days_between('2026-09-14', today) !== 0) {
  console.log(`  MISMATCH today is not day zero: ${days_between('2026-09-14', today)}`);
  failed++;
}

if (!format_short_date('2026-09-14').includes('14')) {
  console.log(`  MISMATCH the 14th rendered as ${format_short_date('2026-09-14')}`);
  failed++;
}

// Deliberately NOT asserted: the word order. format_short_date passes
// `undefined` as the locale, so the viewer's browser decides between
// "14 Sep" and "Sep 14", exactly as DiaryHome's own date line does.
// Pinning a string here would assert the developer's locale on everyone.

// Dates are rendered whatever the phrase says: criterion 2 asks for
// opens_on and due_on, not only for a paraphrase.
if (sprint_timing({ opens_on: '2026-01-05', due_on: '2026-01-18' }, today).dates === null) {
  console.log('  MISMATCH a past-horizon sprint lost its dates');
  failed++;
}

// The gig's own span travels with the sprints' dates, same trap, same fix.
if (!gig_dates('2026-08-03', '2026-10-26')?.includes('26')) {
  console.log(`  MISMATCH gig span: ${gig_dates('2026-08-03', '2026-10-26')}`);
  failed++;
}

process.exit(failed === 0 ? 0 : 1);
JS

    if TZ=Pacific/Auckland node "$OUT/check.mjs" && TZ=America/Los_Angeles node "$OUT/check.mjs"; then
        ok "sprint wording, 11 cases + 4 date assertions" "east and west of UTC"
    else
        bad "sprint wording, 11 cases + 4 date assertions" "see mismatches above"
    fi
fi

# --------------------------------------------------------------------------
say "6. GET /gigs/{gig_id} carries what the header renders"

TOKEN=""
[ -f "$TOKENS" ] && TOKEN="$(grep -s 'Jane N' "$TOKENS" | awk '{print $NF}')"

if [ -z "$TOKEN" ]; then
    meh "live gig checks" "no token for Jane N in $TOKENS"
elif ! curl -fsS -o /dev/null "$BASE/auth/me" -H "Authorization: Bearer $TOKEN" 2>/dev/null; then
    meh "live gig checks" "nothing answering on $BASE"
else
    GIG="$(curl -fsS "$BASE/gigs" -H "Authorization: Bearer $TOKEN" \
        | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)"

    if [ -z "$GIG" ]; then
        bad "a gig to read" "GET /gigs returned none for Jane"
    else
        BODY="$(curl -fsS "$BASE/gigs/$GIG" -H "Authorization: Bearer $TOKEN")"

        for field in participants sprints framework reflection_summary my_role; do
            if printf '%s' "$BODY" | grep -q "\"$field\""; then
                ok "the payload carries $field"
            else
                bad "the payload carries $field" "the header renders it"
            fi
        done

        if printf '%s' "$BODY" | grep -q '"opens_on"' && printf '%s' "$BODY" | grep -q '"due_on"'; then
            ok "sprints carry opens_on and due_on" "criterion 2"
        else
            bad "sprints carry opens_on and due_on" "criterion 2"
        fi
    fi

    # A gig that is not the caller's is 404, not 403: the two are
    # deliberately indistinguishable. The screen renders it through
    # ErrorNotice's NOT_FOUND branch.
    code="$(curl -s -o /dev/null -w '%{http_code}' \
        "$BASE/gigs/00000000-0000-4000-8000-000000000000" \
        -H "Authorization: Bearer $TOKEN")"
    if [ "$code" = "404" ]; then
        ok "a gig that is not yours 404s" "the screen's not-found state"
    else
        bad "a gig that is not yours 404s" "got $code"
    fi
fi

# --------------------------------------------------------------------------
printf '\n%s%d passed%s, %s%d failed%s, %s%d skipped%s\n' \
    "$grn" "$pass" "$off" "$red" "$fail" "$off" "$ylw" "$skip" "$off"

[ "$fail" -eq 0 ]
```

- [ ] **Step 2: Make it executable and wire it into `./run`**

```bash
chmod +x scripts/verify-gig-detail.sh
```

In `run`, beside the `verify-diary` case:

```bash
    # The gig detail screen's own invariants: the screen is mounted, its
    # diary card links into a scope the diary home actually reads back, it
    # ships four states, and the relative sprint wording is compiled and
    # executed rather than grepped for -- every seeded sprint is already
    # past due, so "not open yet" is unreachable by looking at the app.
    # The live half needs a server and a token; it skips rather than fails.
    verify-gig) step ./scripts/verify-gig-detail.sh ;;
```

and in the help heredoc, after the `verify-diary` line:

```
  ${GREEN}./run verify-gig${RESET}    the gig detail: mounted, linked, four states, dates
```

`run.ps1` carries no `verify-diary` or `verify-shell` case — its only `verify` line is
`Fail 'verify needs bash. Use Git Bash or WSL: ./scripts/verify-client.sh'`. Leave it
alone. Bringing the Windows runner into line is a job of its own, recorded as a follow-up.

- [ ] **Step 3: Run it**

```bash
./run verify-gig
```

Expected: every section passing, with section 6 either passing against a running API or
skipping loudly. Read the output. Do not move on from a `FAIL`.

- [ ] **Step 4: Prove the check can fail**

A check that cannot fail is not a check. Break each of its three kinds of assertion in
turn, confirm the matching line goes red, then restore:

```bash
# grep assertion
sed -i 's|<GigDetail />|<GigDetailX />|' web/src/app/routes.tsx
./run verify-gig; git checkout web/src/app/routes.tsx

# executed assertion -- the boundary, which is the one most likely to rot
sed -i 's|if (days === 1) return .Due tomorrow.;||' web/src/screens/gig-timing.ts
./run verify-gig; git checkout web/src/screens/gig-timing.ts
```

Expected: `FAIL routes.tsx renders GigDetail` the first time, and
`FAIL sprint wording, 11 cases + 4 date assertions` with a
`MISMATCH 2026-09-01..2026-09-15` line the second.

- [ ] **Step 5: Commit**

```bash
git add scripts/verify-gig-detail.sh run
git commit -m "test(web): verify the gig detail screen's invariants (CAP-8)"
```

---

### Task 5: Say so in the docs, and run everything CI runs

**Files:**
- Modify: `docs/Stack-and-Build-Scope.md`
- Modify: `web/README.md`
- Modify: `README.md`

- [ ] **Step 1: Find every claim that this screen is unbuilt**

```bash
grep -rn "CAP-8\|Gig detail" README.md web/README.md docs/ --include='*.md'
```

Expected, as of writing: `docs/Stack-and-Build-Scope.md:163`, an unticked
`- [ ] Gig detail: header, sprint list with dates, diary card linking in scoped to that
gig` in the 4.3 build order; `README.md:31`, which says "Of the twelve screens, the
student's diary home is built and mounted at…"; and `web/README.md:4`, which says the same
thing in one sentence. Neither README carries a per-screen table, so the change to each is
a sentence naming the second built screen, plus `./run verify-gig` wherever
`./run verify-diary` is already named in `web/README.md`. Match how CAP-7 worded its own.

Do not create a new document. Every document lives in `docs/` and is listed in the README
table; `docs/superpowers/plans/` is already a row there, so this plan needs no new one and
this ticket adds no other file.

- [ ] **Step 2: Update CAP-7's recorded follow-up**

`docs/superpowers/plans/2026-09-13-cap-7-diary-home.md` records "The empty state links to
`/gigs/:gig_id`, which is CAP-8's placeholder until CAP-8 lands." That is now done. Add one
line saying so rather than deleting the entry — plans are a record of what was decided when.

- [ ] **Step 3: Run everything CI runs**

```bash
./run check
```

Expected: green. Read the output rather than assuming it — a green run nobody executed is
worse than no claim at all.

`./run check` runs the contract lint, the two guards, pint, the 110 PHPUnit feature tests,
oxlint, prettier, `check-tokens.sh`, `check-contrast.mjs`, the production build and
`check-bundle-secrets.sh`. It runs **no** `verify-*` target — not `verify-client`, not
`verify-shell`, not `verify-diary`. So do not add `verify-gig` to it either: that would
make this ticket the one that changed the CI contract for all four scripts. Run
`./run verify-gig` separately, as Task 4 Step 3 already does. The gap is a follow-up.

- [ ] **Step 4: Commit and open the PR**

```bash
git add README.md web/README.md docs/Stack-and-Build-Scope.md docs/superpowers/plans/2026-09-13-cap-7-diary-home.md
git commit -m "docs: the gig detail screen is built, and how to check it (CAP-8)"
git push -u origin feat/CAP-8-gig-detail
```

Open the PR into `dev` with **no reviewers assigned**, then ask who should be added. The
`protected-branches` ruleset requires a PR and sets `required_approving_review_count` to 0,
so merging is allowed — but request a reviewer before merging, because a merge nobody was
told about is how the team stops knowing what landed.

---

## Follow-ups, not in this plan

Recorded here rather than done, because CAP-8 is CAP-8.

- **Every seeded sprint is in the past.** `DemoSeeder` starts sprints at 2026-08-03 and the
  last is due 2026-09-13, so from 2026-09-14 the demo shows three past-due rows and can
  never show "not open yet" or "due in 3 days" — the two wordings the acceptance criterion
  names by example. Worth a `/seed-data` ticket to anchor the sprints relative to "now", or
  to add a fourth, future sprint. It is backend, it touches a database five people share,
  and it is not this ticket.
- **`GigController` eager-loads `sprints` with no `orderBy`.** The frontend sorts by
  ordinal in `by_ordinal` and in `chippable_sprints`, so nothing is broken, but two screens
  now compensate for the same missing clause. One line in `api/`.
- **`/review-queue` is still CAP-10's placeholder** while `web/src/screens/ReviewQueue.tsx`
  sits built and unmounted. CAP-5 and CAP-7 both recorded this; it is Tony's. It is why the
  diary card does not offer a non-student a link anywhere.
- **The link colour is an open accessibility finding for the team, not a fix anyone should
  make alone.** `--color-primary` as normal-size link text measures 4.07:1 on
  `--color-surface-alt` (`.empty_link`), 4.29:1 on `--color-bg` (`.about_link`) and 3.93:1
  on `--color-accent-lavender` (`.diary_link`) — all below the 4.5:1 AA threshold, all in
  light mode. Colour is also the only affordance marking these as links.

  This branch changed `.diary_link` and `.empty_link` to `--color-text` plus an underline
  and Patrick reverted it on 2026-09-14: *"imagine if everyone did small changes to the css
  our design would end up fucked."* He is right, and the reasoning generalises — a link
  treatment is a property of the design system, so five people each fixing it locally
  produces five link styles and no fix. All three links are now `--color-primary`,
  consistently. Raising it as its own ticket against whoever owns the palette is the way
  this gets solved.
- **`DiaryHome.module.css` has two AA failures in light mode**, both measured while
  building this ticket, neither fixed here. `.empty_body` puts `--color-text-muted` on
  `--color-surface-alt` at **4.32:1**, and `.empty_link` puts `--color-primary` on the same
  fill at **4.07:1** — the second is a link, so colour is also its only affordance. The
  same pairing on the lavender card in this ticket measured 3.93:1 and was fixed here
  (commit `8ba6e1a`); CAP-7's two are the same family and are CAP-7's to fix.
  `scripts/check-contrast.mjs` does not catch any of them because `PAIRS` is a hand-kept
  list and nobody added these rows.
- **`scripts/check-tokens.sh` is not executable.** `./run` and `./run check` invoke it as
  `scripts/check-tokens.sh`, which works only because `step` runs it through a shell that
  finds the shebang; calling `./scripts/check-tokens.sh` directly is "Permission denied".
  Every `verify-*.sh` beside it has the execute bit. One `chmod +x`, and it was already
  noticed once while closing CAP-3.
- **The gig detail screen has never been rendered in a browser.** Chromium is not installed
  on this machine, so the Playwright half of Task 3 could not run and the screen went to
  review unlooked-at. The checks that did run are static, the compiler, and the executed
  date module.
- **No `verify-*` script runs in `./run check`.** `verify-client`, `verify-shell`,
  `verify-diary` and now `verify-gig` are all run by hand. Three of the four have a live
  half that skips without a server, so wiring them in is not just a line in the `check`
  case — it needs a decision about whether CI starts an API. Worth a ticket.
- **`run.ps1` has no `verify-*` case at all**, only a message telling Windows users to
  use bash. Four scripts now, one message.
- **No screen has an automated accessibility or visual check.** The looking in Task 3 is a
  ritual a person performs. If `web/` should have a test runner, that is an ADR and a team
  decision, not something to add in passing.

## Added after the plan was written

**The screen had no way in.** Nothing in the nav addresses a single gig, the diary's list
rows are already links to reflections, and the one existing link to `/gigs/:gig_id` lives
inside `NothingWritten`, which renders only for a student who has written nothing. So every
student with a reflection could reach the screen by URL and no other way.

Patrick authorised the fix on this branch on 2026-09-14 ("we worked on cap-5 and cap-7
together so it only makes sense that I'm able to work on access to the details screen"),
and `e8e5503` adds a link under the scope chips, shown when one gig is in scope. The
alternatives were each ruled out rather than weighed: a nav item cannot carry an id, and a
link on a list row would nest an anchor inside an anchor.

`verify-gig` section 2 asserts it by class name. The obvious grep — any link to `/gigs/` in
`DiaryHome.tsx` — passed while the screen was still unreachable, because CAP-7's empty-state
link satisfied it.

## The design, found late (2026-09-15)

The screen was built from the ticket's three bullets, which are all
`docs/Stack-and-Build-Scope.md` has too. There is more, and it is not in this
repository: Patrick's earlier working prototype at `~/projects/alumable-diary`
carries the Figma exports and a finished implementation of this exact screen.
Designs stay out of git deliberately, so this is a pointer, not a copy.

| Where | What |
| --- | --- |
| `docs/06_figma_diary_frames.pdf` p5 | My Gig → Overview: Gig Details, Timeline, Reflection Diary cards |
| `docs/05_figma_frames.pdf` p5 | The sprint rows, with a state pill and a chevron each |
| `docs/02_AI_Assistant_Document_v3.md` §11.4a, §11.5, §6.1 | The prose spec for all of it |
| `api/resources/views/shell/gig.blade.php` | The working implementation |
| `api/app/Diary/SprintState.php` | The five states, derived, with split labels |

Three things it settles:

**1. The relative wording replaces the dates; it does not sit beside them.**
Acted on — commit `8a2c646`. The first build showed `3 Aug – 16 Aug` and a tinted
"Due 29 days ago" pill on the same row, which is one fact told twice, and with
every seeded sprint past due it rendered as three identical warnings.

**2. Each sprint row carries a state and is tappable.** NOT acted on. §11.4a:
"a row per sprint: `SPRINT` / `SELF REFLECTION` / `ASSESSOR REFLECTION`. Same
states as §6.1, same component as 11.5's sprint rows with the columns split
out." The five states are `Not open`, `In progress`, `Awaiting assessor`,
`Scored`, `Closed, no entry`, derived from the reflection's status and the
sprint's dates. Split into columns they read `In progress` / `Submitted` /
`No entry` for the student and `Awaiting` / `Scored` for the assessor.

This needs `GET /reflections?gig_id=` — an existing endpoint with an existing
query parameter, no backend change — and five states CAP-8 does not ask for. It
was offered on 2026-09-15 and declined as scope: the rows would link into
CAP-11's stepper route, and the "N sprints need your reflection this week"
banner from the same frames is already a CAP-7 follow-up. Those three belong to
one story — *surface diary state where the student already is* — and a third of
it smuggled into CAP-8 makes the rest harder to pick up.

One caution for whoever takes it: the prototype's fifth state is worded
"Closed, no entry" and this build has no such thing, because nothing in
`api/app/Services/` reads `opens_on` or `due_on`. The split label is `No entry`,
which is a statement about what is there rather than about what is permitted,
and that one is safe to port.

**3. There is no participant roster anywhere in the design.** All 45 frames
checked. The screen called "Participants" is the host's scoring worklist —
names with Score / Done / Waiting pills — which is CAP-10 and CAP-13 territory.
Criterion 1's "participant roles" came from whoever wrote the ticket, not from
the design. It is built and it meets the criterion; it is also the one block on
the screen with no design behind it.

Also unbuilt and specified: a **Gig Details** card and a **Timeline** card
(`START | END | DURATION`, weeks computed) above the diary card, in place of the
current `org · dates` subtitle. Small, cosmetic, and nobody asked for it.

## What this ticket does not touch

`api/`, `db/`, `docs/openapi.yaml`, the seeders, `web/src/api/client.ts`,
`web/src/api/schema.ts`, and every component under `web/src/components/`. If any of them
needs to change, that is a finding worth raising before changing it, not a detail of this
ticket.

## Re-shaped to the frame (2026-09-15)

The screen above was built from CAP-8's four bullets, which are all the ticket
carries. The design was found afterwards, and the section before this one
recorded three things it settled — one acted on, two not. Patrick then asked
the question the ticket never answers: *what is this screen actually for?*

The answer is in the prototype, and it changes the shape rather than the
content. **The gig detail is not a diary screen.** In the design it belongs to
the host app — `Earn → My Gigs → a gig`, tabs `Overview / Application / Offer`
— and the diary appears on its Overview tab as **one card of three**, below
Gig Details and Timeline. §4.1 is the decision that explains it: the diary has
no nav tab at all, and is reached from a Reflection Diary card on Home, Learn
and Earn, "scoped by context". The prototype's own `bottom-nav.blade.php` says
why in as many words — a sixth tab "would make the diary a section sitting
beside the app instead of part of the work the student is already doing".

cse3cap has what that decision refused, and not by mistake: the team scoped ten
screens covering the diary feature alone, so there is no Earn section for this
screen to hang off. `AppShell.tsx` gives a student one nav item, `Diary`, and
the diary list is the root route. **The arrow is therefore reversed** — in the
design you reach the diary from a gig; here you reach the gig from the diary.
That is why the screen read as contextless: its job was to be where a gig's
work and its reflections meet, and with Earn, Gigs, Home and Learn all absent,
only the reflection half arrived.

Access is left as it is. Building a host app shell to restore the original
direction is a different project, and `e8e5503`'s link from the diary is a
real way in. What changed is the screen itself, so that it reads as the gig's
own page rather than as a second diary list.

### What changed

| Frame | Before | Now |
| --- | --- | --- |
| Gig Details card | an `org · dates` subtitle | a card, `GIG TITLE` / `HOST` |
| Timeline card | — | a card, `START` / `END` / `DURATION` in weeks |
| Reflection Diary card | a "Diary" block with counts | a card: framework, the sprint table, counts, the link |
| Sprint rows | one line of relative date text | `SPRINT` / `SELF REFLECTION` / `ASSESSOR REFLECTION` |
| Tappable rows | not links | the ordinal links to `/reflections/{id}` where one exists |

### Decisions taken here

**1. The two columns are §6.1's five states split, not a new vocabulary.**
`sprint_progress` in `gig-timing.ts` derives them, so there is one
implementation and the check can execute it. The prototype splits them the
same way in `SprintState::selfLabel()` and `assessorLabel()`.

**2. A draft behind a past due date still reads "In progress".** The prototype
calls it "Closed, no entry", and the earlier section of this plan already
flagged why that does not port: nothing in `api/app/Services/` reads `opens_on`
or `due_on`, so this build enforces no deadline and such a draft is genuinely
still submittable. A label claiming otherwise would claim a gate the API does
not have. The only date-derived label kept is `No entry`, which is a statement
about what exists rather than about what is permitted. The check asserts both.

**3. The sprint table is a student view; everybody else gets the calendar.**
`GET /reflections?gig_id=` returns a student their own rows but returns an
assessor, supervisor or employer *every* student's rows on the gig
(`ReflectionController::index`). A single-student SELF/ASSESSOR table cannot be
built out of that, so a non-student sees the sprint list with its dates and the
server's own counts. This also means the second call is made only for a
student.

**4. The participants stay, as a row of the Gig Details card.** Criterion 1
asks for "the participant roles" and no frame anywhere carries a roster, so it
is built but subordinated: the criterion is met and the screen still reads as
three cards. Recorded again because it remains the one block with no design
behind it.

**5. Rows link to `/reflections/{id}`, which is CAP-11's placeholder.** The
frame draws a chevron per row. CAP-7's entry list already links to that same
placeholder, so this follows the precedent rather than inventing a second
answer. A sprint with no reflection is not a link: creating one is the
stepper's job.

### Restoring the previous shape

Tagged before the re-shape, so it is one command rather than an archaeology
exercise:

```bash
git checkout cap-8-pre-frame -- web/src/screens/GigDetail.tsx web/src/screens/GigDetail.module.css
```

`cap-8-pre-frame` is `c0d52da`. The tag is local; the commits are on the branch
either way.

### Still not done

- **The History chip and sheet** are on this frame, top right, and are filed as
  **CAP-14**. The backlog split one screen into two tickets without saying so.
  Whoever takes CAP-14 should know its home is here, and that the prototype
  builds it from what the `events` table returns rather than from a list of
  event types (§11.4a).
- **The `Overview / Application / Offer` tabs** are not built. Application and
  Offer are out of scope in the design too — the prototype draws both tabs and
  fills them with "not part of this build" — so a single-tab screen is the
  honest rendering here, not a gap.
- **The status pill** (`Applied` / `Accepted`) is not built: this product has no
  application state, and a pill that always says one word is decoration.
- **`.sprint_link` is the link-colour finding again, one shade worse.**
  `--color-primary` as normal-size link text measures **3.79:1** on
  `--color-accent-pink`, against 3.93:1 on lavender and 4.07:1 on
  `--color-surface-alt`. Same family, same cause, same resolution: it stays
  `--color-primary` and consistent with every other link in the product,
  because the link treatment belongs to whoever owns the palette and five
  people fixing it locally produces five link styles and no fix. Measured and
  recorded, not fixed here. `scripts/check-contrast.mjs` does not catch it
  because `PAIRS` is hand-kept -- and adding a failing row would turn a
  recorded team finding into a red build, which is also not one person's call.
- **Still never rendered in a browser.** Chromium is not installed on this
  machine, and minting a demo token to run the live half of `verify-gig` was
  refused by the sandbox as credential materialisation. The static checks, the
  compiler and the executed date and state modules are what have run.
