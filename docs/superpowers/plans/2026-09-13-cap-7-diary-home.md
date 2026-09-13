# CAP-7 Diary Home Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps
> use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the placeholder at `/` with the student's landing screen: scope chips for
all gigs or one gig, sprint chips once a gig is in scope, a `RadarPanel` whose caption says
what the polygon is actually summarising, a list of reflections with status badges linking
through to the stepper, an export link that opens a sheet, and all four states.

**Architecture:** One screen component, `web/src/screens/DiaryHome.tsx`, built the way
`ReviewQueue.tsx` is: its own fetches through the typed client, its own state machine, no
props. Scope lives in the URL as `?gig_id=` and `?sprint_id=` (ADR #27), read and written
through `useSearchParams`. All of the fiddly, testable-by-reading logic -- parsing a scope
out of the URL, deciding which gigs and sprints may be chipped, filtering the list, and
writing the caption -- lives in a separate pure module, `web/src/screens/diary-scope.ts`,
which imports nothing from React. The screen holds two independent loads: gigs and
reflections are fetched once on mount, and the radar is refetched whenever the scope
changes, because the server computes it per scope.

**Tech Stack:** React 19.2.8, TypeScript 6.x (pinned, ADR #18), Vite 8, react-router 8.3.1,
recharts (already wrapped by `RadarPanel`). CSS Modules + `tokens.css` custom properties
only, per ADR #28.

**Spec:** Jira CAP-7, "Diary home screen", epic Student Reflection Journey, exported to
`docs/jira/cap-sprint-3.csv`. The five acceptance criteria are reproduced verbatim below.
There is no separate written spec file for this ticket; the design was agreed in
conversation on 2026-09-13 and its decisions are recorded in "Decisions recorded here".

### The acceptance criteria, verbatim

1. Scope chips: all gigs, or one gig. Sprint chips appear once a gig is in scope.
2. RadarPanel with a caption that changes with the scope, so it is always clear what the
   polygon is actually summarising.
3. Entry list with status badges, linking through to the stepper.
4. Export link opening the export sheet.
5. All four states. Empty is a student with no reflections yet, and it says what to do next.

Depends on CAP-3 (core components), CAP-5 (app shell), CAP-6 (RadarPanel). All three are
merged into `dev`: CAP-3 in #18, CAP-6 in #20, CAP-5 in #30.

---

## Global Constraints

- **CAP-7 only.** Nothing else goes on this branch. Anything found along the way is
  recorded in "Follow-ups, not in this plan" at the foot of this document and left alone.
- **Frontend only.** `api/`, `db/` and `docs/openapi.yaml` are not touched. This screen
  needs no endpoint that does not already exist. If it turns out to need one, stop and say
  so rather than inventing a field.
- **Verification runs against the prism mock**, not the real API. `./run mock` on :4010,
  with `VITE_API_BASE_URL=http://localhost:4010` in `web/.env`. The live half of
  `scripts/verify-diary-home.sh` is written anyway and skips loudly when there is no server
  and no token, the way `scripts/verify-app-shell.sh` does. Restore
  `VITE_API_BASE_URL=http://localhost:8000/api/v1` in `web/.env` before the final commit;
  that file is gitignored, so it cannot be committed either way, but leaving it pointed at
  the mock will confuse the next person on this machine.
- **Every API call goes through `web/src/api/client.ts`.** No component calls `fetch`,
  parses a response body, or declares its own response interface.
- **Types are generated, never written.** `web/src/api/schema.ts` comes from
  `docs/openapi.yaml` via `npm run gen:types` and is not edited. Every payload type in this
  plan is spelled `components['schemas']['X']`.
- **snake_case prop and function names**, matching every existing component (`on_click`,
  `full_width`, `on_retry`). Established by CAP-3/CAP-4, followed by CAP-5 and CAP-6.
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
- **Reusable components first.** `Card`, `Button`, `Chip`, `Badge`, `TextArea`,
  `ProgressBar`, `BottomSheet`, `RadarPanel`, `Skeleton`, `SkeletonGroup`, `ErrorNotice`
  already exist in `web/src/components/` and are imported from the barrel
  `web/src/components/index.ts`. Build nothing this ticket can borrow.
- **`web/tsconfig.app.json` is strict in four ways that bite.** `verbatimModuleSyntax: true`
  -- a type-only import MUST be written `import type { X }` or `import { type X }`.
  `noUnusedLocals` and `noUnusedParameters` -- an unused import fails the build.
  `erasableSyntaxOnly: true` -- no `enum`, no `namespace`, no parameter properties.
  `allowImportingTsExtensions` -- imports carry their `.ts`/`.tsx` extension, as every
  existing file does. `strict: true` throughout.
- **`web/` has no test runner** (CLAUDE.md). Verification is a script in `scripts/` wired
  into `./run`, plus the ritual CAP-3 established: load the screen at 390px and 1280px, in
  both themes, and look.
- **A business rule is never reimplemented here.** This screen renders what the API
  returns. It does not decide who may see a reflection, when one may be submitted, or what
  counts as assessed. The one piece of filtering it does do is a *display* decision and is
  commented as such -- see Decision 3.
- **Branch `feat/CAP-7-diary-home` off `dev`**, in the main working tree rather than a
  worktree, matching how CAP-5 was done. No migration and no seeder runs anywhere in this
  plan, so the shared-database rule in CLAUDE.md is not engaged.

## Decisions recorded here

Six calls this plan makes that the ticket leaves open. Each is written into the code with
its reasoning attached, so reversing one is a small edit rather than archaeology.

**1. Scope lives in the URL, not in component state.** `/?gig_id=…&sprint_id=…`, read and
written with `useSearchParams`. ADR #27 bought routing for exactly this -- "routes that
carry scope: a diary scoped to a gig" -- and the old mock-up's chips were links with the
filter in the query string for the same reason. CAP-8's "diary card linking into the diary
home scoped to that gig" then costs nothing, and a student can send a supervisor a link to
what they are actually looking at.

**2. A scope the data does not support falls back rather than erroring.** A `gig_id` that
is not one of the caller's student gigs, or a `sprint_id` that is not one of that gig's
sprints, is dropped on the way in. Shared and stale URLs are the normal way this happens
and an error screen would be the wrong answer to it.

**3. The list is filtered to the caller's own record, in the client, on purpose.**
`GET /reflections` returns a student's own reflections *and*, for anyone holding an
assessor, supervisor or employer role, every reflection on the gigs they hold that role on
(`api/app/Http/Controllers/Api/V1/ReflectionController.php:39`). That is correct for the
endpoint and wrong for this screen: Dr Lee opening `/` would see four students' reflections
listed as her diary. So the screen keeps only rows whose `gig_id` is one of her *student*
gigs, plus rows with a null `gig_id`, which the endpoint can only return to their own
owner. This is a display decision, not an authorisation one -- the server already refused
anything she may not read -- and it is commented in `diary-scope.ts` as such.

**4. Rows link to `/reflections/:reflection_id`, a route this ticket adds.**
`ReflectionSummary` carries no entry ids, so a row cannot address `/entries/:entry_id`
without a second request per row. CAP-11's stepper is one reflection with N competency
steps ("Competency 3 of 6"), so a reflection id is the right address for it anyway. The
route renders CAP-11's existing placeholder; `entries/:entry_id` is left exactly as CAP-5
wrote it. If CAP-11 wants a different URL it is a one-line change in two files.

**5. The export sheet opens and says what it will contain; it does not request anything.**
CAP-18 owns the format selector, `POST /exports`, the poll loop, the backoff and the
download, and lists five states of its own. CAP-7's criterion is that the link opens the
sheet. The request button is present and disabled with the ticket named on it -- the same
honesty as ReviewQueue's disabled "Score this →" (`web/src/screens/ReviewQueue.tsx:131`).

**6. One flat list, not a card per gig.** The old mock-up grouped sprint rows under an
experience card per gig because it had no scope chips; this screen has them, so grouping
would say the same thing twice. Each row carries its gig title in the meta line while the
scope is all gigs, and drops it once a single gig is in scope and the title is on a chip
above.

## File structure

| File | Responsibility |
| --- | --- |
| `web/src/screens/diary-scope.ts` | **Create.** Pure scope logic: the `Scope` type, parsing and serialising it, which gigs and sprints may be chipped, filtering the list, and the caption and rubric strings. No React import. |
| `web/src/screens/DiaryHome.tsx` | **Create.** The screen: two loads, four states, chips, radar, list, export sheet. |
| `web/src/screens/DiaryHome.module.css` | **Create.** Its styles, tokens only. |
| `web/src/app/routes.tsx` | **Modify.** Mount `DiaryHome` at the index route; add `reflections/:reflection_id`. |
| `scripts/verify-diary-home.sh` | **Create.** The check, since `web/` has no test runner. |
| `run` | **Modify.** A `verify-diary` target and its help line. |
| `docs/Stack-and-Build-Scope.md` | **Modify.** Tick the Diary home row in 4.3. |
| `web/README.md` | **Modify.** Name the screen and its check. |
| `README.md` | **Modify.** Whatever status table claims this screen is unbuilt. |

---

### Task 1: The pure scope module

**Files:**
- Create: `web/src/screens/diary-scope.ts`

**Interfaces:**
- Consumes: `components['schemas']['Gig' | 'ReflectionSummary' | 'Sprint']` from
  `web/src/api/schema.ts`.
- Produces, all used by Task 2 onward:
  - `type Scope = { gig_id: string | null; sprint_id: string | null }`
  - `const ALL_GIGS: Scope`
  - `function student_gigs(gigs: Gig[]): Gig[]`
  - `function scope_from_params(params: URLSearchParams, gigs: Gig[]): Scope`
  - `function params_for_scope(scope: Scope): Record<string, string>`
  - `function chippable_sprints(gig: Gig, today: Date): Sprint[]`
  - `function reflections_in_scope(reflections: ReflectionSummary[], gigs: Gig[], scope: Scope): ReflectionSummary[]`
  - `function radar_caption(scope: Scope, gigs: Gig[], counter_role: string | null): string`
  - `function rubric_line(fw_key: string, scale_min: number, scale_max: number, gigs: Gig[]): string`

- [ ] **Step 1: Write the module**

`web/` has no test runner, so there is no failing test to write first (CLAUDE.md). The
compiler and `scripts/verify-diary-home.sh` are the check, and Task 8 looks at the result.

Create `web/src/screens/diary-scope.ts`:

```ts
/**
 * Everything the diary home decides about scope, with no React in it.
 *
 * Split out so the screen file stays a screen: the parts worth reading
 * twice -- what a URL means, which rows are actually yours, and what the
 * caption under the radar should say -- are all here, in functions that
 * take their inputs and return a value.
 *
 * Scope lives in the URL (ADR #27), so every one of these is a pure
 * function of the query string and the payloads, which is what makes a
 * shared link render the same screen twice.
 */
import type { components } from '../api/schema.ts';

export type Gig = components['schemas']['Gig'];
export type Sprint = components['schemas']['Sprint'];
export type ReflectionSummary = components['schemas']['ReflectionSummary'];

/** What the chips select. Both null is "all gigs". */
export interface Scope {
  gig_id: string | null;
  sprint_id: string | null;
}

export const ALL_GIGS: Scope = { gig_id: null, sprint_id: null };

/**
 * The gigs this screen is about.
 *
 * The diary is the student's own record, so a gig the caller assesses or
 * supervises is not one of its scopes. Role is per gig and comes from the
 * server (`my_role`); the client never decides one.
 */
export function student_gigs(gigs: Gig[]): Gig[] {
  return gigs.filter((gig) => gig.my_role === 'student');
}

/**
 * A scope the data does not support falls back rather than erroring: a
 * stale or shared link is the normal way an unknown id gets here, and an
 * error screen would be the wrong answer to it.
 */
export function scope_from_params(params: URLSearchParams, gigs: Gig[]): Scope {
  const mine = student_gigs(gigs);
  const gig = mine.find((candidate) => candidate.id === params.get('gig_id'));

  if (!gig) return ALL_GIGS;

  const sprint = gig.sprints.find((candidate) => candidate.id === params.get('sprint_id'));

  return { gig_id: gig.id, sprint_id: sprint ? sprint.id : null };
}

/** The inverse. Absent rather than empty, so "all gigs" is a bare URL. */
export function params_for_scope(scope: Scope): Record<string, string> {
  const params: Record<string, string> = {};
  if (scope.gig_id) params.gig_id = scope.gig_id;
  if (scope.sprint_id) params.sprint_id = scope.sprint_id;
  return params;
}

/**
 * Sprints worth offering as chips: the ones that have opened.
 *
 * A sprint nobody could have written in yet has nothing to filter to, and
 * offering it would produce a filtered-empty state that reads as a bug.
 * A null `opens_on` is treated as open, because the alternative is hiding
 * a sprint that may well have reflections against it.
 */
export function chippable_sprints(gig: Gig, today: Date): Sprint[] {
  return [...gig.sprints]
    .filter((sprint) => sprint.opens_on === null || new Date(sprint.opens_on) <= today)
    .sort((a, b) => a.ordinal - b.ordinal);
}

/**
 * The rows that belong on this screen, in this scope.
 *
 * Two filters, and they are different in kind. The first is ownership and
 * applies always: GET /reflections returns a student's own reflections and,
 * to anyone holding an assessor, supervisor or employer role, every
 * reflection on the gigs they hold it on (ReflectionController::index).
 * That is right for the endpoint and wrong for a diary -- a supervisor
 * opening this screen would read four students' reflections as her own --
 * so rows on a gig the caller is not a student on are dropped. A row with a
 * null gig_id is kept: with no gig there is no participation to match, so
 * the endpoint can only have returned it to its owner.
 *
 * This is a display decision, not an authorisation one. The server already
 * refused everything the caller may not read; this only decides what this
 * particular screen is about.
 *
 * The second filter is the chips, and it is exactly what it looks like.
 */
export function reflections_in_scope(
  reflections: ReflectionSummary[],
  gigs: Gig[],
  scope: Scope,
): ReflectionSummary[] {
  const mine = new Set(student_gigs(gigs).map((gig) => gig.id));

  return reflections.filter((reflection) => {
    if (reflection.gig_id !== null && !mine.has(reflection.gig_id)) return false;
    if (scope.gig_id && reflection.gig_id !== scope.gig_id) return false;
    if (scope.sprint_id && reflection.sprint_id !== scope.sprint_id) return false;
    return true;
  });
}

/**
 * What the polygon is summarising, in a sentence, because an unlabelled
 * radar is ambiguous: across the whole record and within one gig it is the
 * latest score per competency, and only within one sprint is it a true
 * self-against-counter comparison of the same piece of work. The API
 * scopes it exactly that way (AnalyticsController::radar) and this says so
 * out loud.
 *
 * `counter_role` is whichever role actually counter-scored, from the radar
 * payload, so the sentence says "supervisor" when a supervisor scored it.
 * Null means nobody has yet, and the clause is left off -- RadarPanel
 * already says "Still awaiting a counter-score" above the chart, and
 * saying it twice in different words reads as a fault.
 */
export function radar_caption(
  scope: Scope,
  gigs: Gig[],
  counter_role: string | null,
): string {
  const gig = gigs.find((candidate) => candidate.id === scope.gig_id);

  if (!gig) {
    return 'The latest score on each competency, across your whole record.';
  }

  if (!scope.sprint_id) {
    return `The latest score on each competency on ${gig.title}.`;
  }

  const sprint = gig.sprints.find((candidate) => candidate.id === scope.sprint_id);
  const which = sprint ? `Sprint ${sprint.ordinal}` : 'This sprint';
  const against = counter_role ? ` against your ${counter_role}'s` : '';

  return `${which} on ${gig.title}: your own score${against}, on that sprint alone.`;
}

/**
 * The footnote under the chart. Scores are only ever read against the
 * rubric they were given under, so the rubric and its scale are named
 * rather than assumed -- the whole point of the framework engine is that
 * neither number is fixed.
 *
 * The radar payload identifies the framework by fw_key; the human-readable
 * name and version come from whichever gig carries the same key. A caller
 * whose gigs do not include it falls back to the key itself rather than
 * printing nothing.
 */
export function rubric_line(
  fw_key: string,
  scale_min: number,
  scale_max: number,
  gigs: Gig[],
): string {
  const match = gigs.find((gig) => gig.framework?.fw_key === fw_key);
  const named = match?.framework
    ? `${match.framework.name} ${match.framework.version}`
    : fw_key;

  return `Levels ${scale_min}–${scale_max} on ${named}.`;
}
```

- [ ] **Step 2: Check it compiles and lints**

Run, from `web/`:

```bash
npx tsc -b --noEmit && npm run lint && npx prettier --check src/screens/diary-scope.ts
```

Expected: no output from `tsc`, `Found 0 warnings` style output from oxlint, and
`All matched files use Prettier code style!`. If prettier disagrees, run
`npx prettier --write src/screens/diary-scope.ts` and re-run.

Note: `npx tsc -b --noEmit` may report that `--noEmit` is not valid with `-b` on this
TypeScript version. If it does, use `npm run build`, which runs `tsc -b` and then Vite.

- [ ] **Step 3: Check the token rule**

Run, from the repository root:

```bash
scripts/check-tokens.sh
```

Expected: `No raw hex or magic pixel values outside tokens.css.`

- [ ] **Step 4: Commit**

```bash
git add web/src/screens/diary-scope.ts
git commit -m "feat(web): the diary's scope logic, with no React in it (CAP-7)"
```

---

### Task 2: The screen, mounted, with its four states

Chips, radar and the export sheet are Tasks 3 to 6. This task is the frame: both fetches,
the four states, a plain list, and the placeholder at `/` gone.

**Files:**
- Create: `web/src/screens/DiaryHome.tsx`
- Create: `web/src/screens/DiaryHome.module.css`
- Modify: `web/src/app/routes.tsx`

**Interfaces:**
- Consumes: `api`, `ApiError` from `web/src/api/client.ts`; `useSession` from
  `web/src/session/useSession.ts`; `Badge`, `ErrorNotice`, `Skeleton`, `SkeletonGroup` from
  `web/src/components/index.ts`; `reflections_in_scope`, `student_gigs`, `ALL_GIGS` and the
  types from Task 1.
- Produces: `export function DiaryHome(): JSX.Element`, taking no props, for `routes.tsx`.

- [ ] **Step 1: Write the screen**

Create `web/src/screens/DiaryHome.tsx`:

```tsx
/**
 * The student's landing screen, and the first place the radar appears in
 * context.
 *
 * Two loads that do not wait on each other. Gigs and reflections are
 * fetched once, because the chips and the list are both filtered from them
 * in memory -- clicking a chip re-filters rather than refetching, so the
 * list does not blink. The radar is refetched per scope, because the server
 * is what computes it: a sprint gives that sprint's comparison, a gig the
 * latest within it, neither the latest across the record
 * (AnalyticsController::radar).
 *
 * Scope lives in the URL (ADR #27). Everything that decides what a scope
 * means is in diary-scope.ts, deliberately free of React.
 */
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';

import { api, ApiError } from '../api/client.ts';
import { Badge, ErrorNotice, Skeleton, SkeletonGroup } from '../components/index.ts';
import { useSession } from '../session/useSession.ts';
import {
  reflections_in_scope,
  scope_from_params,
  student_gigs,
  type Gig,
  type ReflectionSummary,
} from './diary-scope.ts';
import styles from './DiaryHome.module.css';

type Load =
  | { status: 'loading' }
  | { status: 'error'; error: ApiError }
  | { status: 'loaded'; gigs: Gig[]; reflections: ReflectionSummary[] };

/** The shape every failed call in this screen ends up in. */
function as_api_error(error: unknown, fallback: string): ApiError {
  return error instanceof ApiError ? error : new ApiError(0, null, fallback);
}

export function DiaryHome() {
  const { me } = useSession();
  const [params] = useSearchParams();
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [reload_key, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    Promise.all([
      api.get('/gigs', { signal: controller.signal }),
      api.get('/reflections', { signal: controller.signal }),
    ])
      .then(([gigs, reflections]) => setLoad({ status: 'loaded', gigs, reflections }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setLoad({
          status: 'error',
          error: as_api_error(error, 'Something went wrong loading your diary.'),
        });
      });

    return () => controller.abort();
  }, [reload_key]);

  const retry = useCallback(() => {
    setLoad({ status: 'loading' });
    setReloadKey((key) => key + 1);
  }, []);

  if (load.status === 'loading') {
    return (
      <section>
        <h1 className={styles.heading}>Your diary</h1>
        <LoadingState />
      </section>
    );
  }

  if (load.status === 'error') {
    return (
      <section>
        <h1 className={styles.heading}>Your diary</h1>
        <ErrorNotice error={load.error} on_retry={retry} />
      </section>
    );
  }

  const mine = student_gigs(load.gigs);
  const scope = scope_from_params(params, load.gigs);
  const rows = reflections_in_scope(load.reflections, load.gigs, scope);
  const whole_record = reflections_in_scope(load.reflections, load.gigs, {
    gig_id: null,
    sprint_id: null,
  });

  /*
   * Every route stays reachable by URL, so an assessor can land here. The
   * diary is the student's own record and theirs is empty by definition;
   * saying so is better than an empty list that looks broken. A hidden nav
   * item is a convenience; this is the same convenience, one screen in.
   */
  if (mine.length === 0) {
    return (
      <section>
        <h1 className={styles.heading}>Your diary</h1>
        <NotAStudent display_name={me?.display_name ?? null} />
      </section>
    );
  }

  return (
    <section>
      <h1 className={styles.heading}>Your diary</h1>

      {whole_record.length === 0 ? (
        <NothingWritten gigs={mine} />
      ) : (
        <ReflectionList rows={rows} show_gig={scope.gig_id === null} gigs={mine} />
      )}
    </section>
  );
}

/**
 * Shaped like the loaded screen, not a spinner: a chip row, the radar, and
 * three list rows, so the layout does not jump when data arrives.
 */
function LoadingState() {
  return (
    <SkeletonGroup label="Loading your diary">
      <div className={styles.chip_row}>
        <Skeleton variant="block" width="var(--space-64)" height="var(--space-32)" />
        <Skeleton variant="block" width="var(--space-64)" height="var(--space-32)" />
      </div>
      <div className={styles.radar_skeleton}>
        <Skeleton variant="circle" width="14rem" height="14rem" />
      </div>
      <ul className={styles.list}>
        {[0, 1, 2].map((row) => (
          <li key={row} className={styles.row}>
            <Skeleton variant="text" lines={2} width="60%" />
          </li>
        ))}
      </ul>
    </SkeletonGroup>
  );
}

/** Criterion 5: empty says what to do next. */
function NothingWritten({ gigs }: { gigs: Gig[] }) {
  return (
    <div className={styles.empty}>
      <p className={styles.empty_title}>Nothing in your diary yet.</p>
      <p className={styles.empty_body}>
        A reflection belongs to a sprint: you write one short piece per competency, score
        yourself, and someone on the gig scores you back. Open a gig and pick a sprint to
        write your first.
      </p>
      <ul className={styles.empty_gigs}>
        {gigs.map((gig) => (
          <li key={gig.id}>
            <a className={styles.empty_link} href={`/gigs/${gig.id}`}>
              {gig.title}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

function NotAStudent({ display_name }: { display_name: string | null }) {
  return (
    <div className={styles.empty}>
      <p className={styles.empty_title}>The diary is the student&rsquo;s own record.</p>
      <p className={styles.empty_body}>
        {display_name ? `${display_name}, you are ` : 'You are '}
        not a student on any gig, so there is nothing to show here. The work waiting on you
        is in the review queue.
      </p>
    </div>
  );
}

function ReflectionList({
  rows,
  show_gig,
  gigs,
}: {
  rows: ReflectionSummary[];
  show_gig: boolean;
  gigs: Gig[];
}) {
  if (rows.length === 0) {
    return (
      <div className={styles.empty}>
        <p className={styles.empty_title}>Nothing in this part of your diary.</p>
        <p className={styles.empty_body}>
          You have written reflections elsewhere. Choose a wider scope above to see them.
        </p>
      </div>
    );
  }

  return (
    <ul className={styles.list}>
      {rows.map((row) => (
        <ReflectionRow key={row.id} row={row} show_gig={show_gig} gigs={gigs} />
      ))}
    </ul>
  );
}

function ReflectionRow({
  row,
  show_gig,
  gigs,
}: {
  row: ReflectionSummary;
  show_gig: boolean;
  gigs: Gig[];
}) {
  const gig = gigs.find((candidate) => candidate.id === row.gig_id);
  const title =
    row.sprint_ordinal == null ? 'Whole gig' : `Sprint ${row.sprint_ordinal}`;
  const meta = [
    show_gig ? (gig?.title ?? null) : null,
    row.framework_version,
    when(row),
  ].filter((part): part is string => part !== null);

  return (
    <li className={styles.row}>
      <div className={styles.row_main}>
        <span className={styles.row_title}>{title}</span>
        <span className={styles.row_meta}>{meta.join(' · ')}</span>
      </div>
      <Badge status={row.status} />
    </li>
  );
}

/** "Submitted 29 Aug" once it is in, "Started 17 Aug" while it is a draft. */
function when(row: ReflectionSummary): string {
  const stamp = row.submitted_at ?? row.created_at;
  const label = row.submitted_at ? 'Submitted' : 'Started';
  const date = new Date(stamp).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
  });

  return `${label} ${date}`;
}
```

- [ ] **Step 2: Write the styles**

Create `web/src/screens/DiaryHome.module.css`. Every value is a token; `ReviewQueue.module.css`
is the model.

```css
.heading {
  margin: 0 0 var(--space-16);
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-bold);
  color: var(--color-text);
}

.chip_row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-8);
  margin-bottom: var(--space-12);
}

.radar_skeleton {
  display: flex;
  justify-content: center;
  padding: var(--space-24) 0;
}

.list {
  display: flex;
  flex-direction: column;
  gap: var(--space-12);
  margin: var(--space-16) 0 0;
  padding: 0;
  list-style: none;
}

.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-16);
  padding: var(--space-16);
  border: var(--border-width-sm) solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
}

.row_main {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.row_title {
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-medium);
  color: var(--color-text);
}

.row_meta {
  font-size: var(--font-size-sm);
  color: var(--color-text-muted);
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
  margin: 0;
  font-size: var(--font-size-sm);
  line-height: var(--line-height-relaxed);
  color: var(--color-text-muted);
}

.empty_gigs {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--space-12);
  margin: var(--space-8) 0 0;
  padding: 0;
  list-style: none;
}

.empty_link {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--color-primary);
}
```

- [ ] **Step 3: Mount it**

In `web/src/app/routes.tsx`, add the import beside the existing ones:

```tsx
import { DiaryHome } from '../screens/DiaryHome.tsx';
```

and replace the index route:

```tsx
        <Route index element={<Placeholder screen="Diary" ticket="CAP-7" />} />
```

with:

```tsx
        <Route index element={<DiaryHome />} />
```

- [ ] **Step 4: Build and look at the error state**

```bash
cd web && npm run build && npm run lint && npx prettier --check src
```

Expected: a clean build. Then, with nothing serving the API:

```bash
cd web && npm run dev
```

Open `http://localhost:5173/`, paste any string into the token gate, and confirm the shell
shows its own error state -- the screen's error path is exercised in Task 8 against the
mock, because the shell refuses a bad token before this screen mounts.

- [ ] **Step 5: Commit**

```bash
git add web/src/screens/DiaryHome.tsx web/src/screens/DiaryHome.module.css web/src/app/routes.tsx
git commit -m "feat(web): the diary home screen, with its four states (CAP-7)"
```

---

### Task 3: Scope chips and sprint chips

**Files:**
- Modify: `web/src/screens/DiaryHome.tsx`
- Modify: `web/src/screens/DiaryHome.module.css`

**Interfaces:**
- Consumes: `Chip` from `web/src/components/index.ts`; `chippable_sprints`,
  `params_for_scope`, `ALL_GIGS` from Task 1.
- Produces: nothing new for later tasks; the `scope` value already read in Task 2 now
  changes when a chip is clicked.

- [ ] **Step 1: Add the chips**

In `DiaryHome.tsx`, extend the imports:

```tsx
import { Badge, Chip, ErrorNotice, Skeleton, SkeletonGroup } from '../components/index.ts';
```

```tsx
import {
  ALL_GIGS,
  chippable_sprints,
  params_for_scope,
  reflections_in_scope,
  scope_from_params,
  student_gigs,
  type Gig,
  type ReflectionSummary,
  type Scope,
} from './diary-scope.ts';
```

Take the setter from `useSearchParams`:

```tsx
  const [params, setParams] = useSearchParams();
```

Add a `go_to` callback beside `retry`, which is the only thing in this screen that writes
the URL:

```tsx
  /*
   * Replace rather than push: a student clicking along four sprint chips
   * should be one Back away from where they came from, not four.
   */
  const go_to = useCallback(
    (next: Scope) => setParams(params_for_scope(next), { replace: true }),
    [setParams],
  );
```

Render the chips above the list, inside the loaded return, directly under the `<h1>`:

```tsx
      <ScopeChips gigs={mine} scope={scope} on_select={go_to} />
```

And add the component:

```tsx
/**
 * Criterion 1: all gigs or one gig, and sprint chips only once a gig is in
 * scope. Chips are Chip components rather than links because they write the
 * URL through the router; the URL is still the state, and a shared link
 * still restores it.
 */
function ScopeChips({
  gigs,
  scope,
  on_select,
}: {
  gigs: Gig[];
  scope: Scope;
  on_select: (next: Scope) => void;
}) {
  const gig = gigs.find((candidate) => candidate.id === scope.gig_id);
  const sprints = gig ? chippable_sprints(gig, new Date()) : [];

  return (
    <div>
      <div className={styles.chip_row} role="group" aria-label="Scope">
        <Chip selected={scope.gig_id === null} on_click={() => on_select(ALL_GIGS)}>
          All gigs
        </Chip>
        {gigs.map((candidate) => (
          <Chip
            key={candidate.id}
            selected={scope.gig_id === candidate.id}
            on_click={() => on_select({ gig_id: candidate.id, sprint_id: null })}
          >
            {candidate.title}
          </Chip>
        ))}
      </div>

      {gig && sprints.length > 0 && (
        <div className={styles.chip_row} role="group" aria-label="Sprint">
          <Chip
            selected={scope.sprint_id === null}
            on_click={() => on_select({ gig_id: gig.id, sprint_id: null })}
          >
            All sprints
          </Chip>
          {sprints.map((sprint) => (
            <Chip
              key={sprint.id}
              selected={scope.sprint_id === sprint.id}
              on_click={() => on_select({ gig_id: gig.id, sprint_id: sprint.id })}
            >
              Sprint {sprint.ordinal}
            </Chip>
          ))}
        </div>
      )}
    </div>
  );
}
```

Note: the chips render above the empty states too, so a student who has filtered into a
sprint with nothing in it can click back out. Move the `ScopeChips` line above the
`whole_record.length === 0` conditional so it renders in both branches -- except when
`mine.length === 0`, which returns earlier and has no chips to draw.

- [ ] **Step 2: Build, lint, format**

```bash
cd web && npm run build && npm run lint && npx prettier --check src
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add web/src/screens/DiaryHome.tsx web/src/screens/DiaryHome.module.css
git commit -m "feat(web): scope and sprint chips, with the scope in the URL (CAP-7)"
```

---

### Task 4: The radar, and a caption that changes with the scope

**Files:**
- Modify: `web/src/screens/DiaryHome.tsx`
- Modify: `web/src/screens/DiaryHome.module.css`

**Interfaces:**
- Consumes: `RadarPanel` from `web/src/components/index.ts`; `radar_caption` and
  `rubric_line` from Task 1.
- Produces: nothing for later tasks.

- [ ] **Step 1: Add the radar load**

`GET /me/radar` answers 404 when the caller has written nothing in that scope
(`AnalyticsController::frameworkInScope`). That is this screen's empty state, not its error
state, and getting that mapping right is the whole of this task's risk.

Extend the imports:

```tsx
import {
  Badge,
  Chip,
  ErrorNotice,
  RadarPanel,
  Skeleton,
  SkeletonGroup,
} from '../components/index.ts';
```

```tsx
import {
  ALL_GIGS,
  chippable_sprints,
  params_for_scope,
  radar_caption,
  reflections_in_scope,
  rubric_line,
  scope_from_params,
  student_gigs,
  type Gig,
  type ReflectionSummary,
  type Scope,
} from './diary-scope.ts';
```

Add the radar's own load type beside `Load`:

```tsx
type Radar = Awaited<ReturnType<typeof api.get<'/me/radar'>>>;

type RadarLoad =
  | { status: 'loading' }
  | { status: 'error'; error: ApiError }
  | { status: 'empty' }
  | { status: 'loaded'; radar: Radar };
```

If `api.get` is not generic in that form, type it from the contract instead, which is the
same source:

```tsx
import type { paths } from '../api/schema.ts';

type Radar = paths['/me/radar']['get']['responses']['200']['content']['application/json'];
```

Use whichever compiles; prefer the `paths` form, which is what `ReviewQueue.tsx:19` does.

Add a second component that owns the radar load, so a scope change refetches the chart
without touching the list:

```tsx
/**
 * The radar for one scope.
 *
 * Its own component and its own fetch because the scope decides it and the
 * list does not: clicking a sprint chip refetches this and re-filters the
 * list in memory. A 404 here is the API saying "nothing written in this
 * scope yet" (AnalyticsController::frameworkInScope), which is an empty
 * state, not an error -- rendering an error notice for it would tell a new
 * student their diary is broken on their first visit.
 */
function ScopedRadar({ scope, gigs }: { scope: Scope; gigs: Gig[] }) {
  const [load, setLoad] = useState<RadarLoad>({ status: 'loading' });
  const [reload_key, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoad({ status: 'loading' });

    const query: Record<string, string> = params_for_scope(scope);

    api
      .get('/me/radar', { query, signal: controller.signal })
      .then((radar) => setLoad({ status: 'loaded', radar }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        if (error instanceof ApiError && error.status === 404) {
          setLoad({ status: 'empty' });
          return;
        }
        setLoad({
          status: 'error',
          error: as_api_error(error, 'Something went wrong loading your radar.'),
        });
      });

    return () => controller.abort();
  }, [scope.gig_id, scope.sprint_id, reload_key]);

  const retry = useCallback(() => setReloadKey((key) => key + 1), []);

  if (load.status === 'loading') return <RadarPanel state="loading" />;
  if (load.status === 'error') {
    return <RadarPanel state="error" error={load.error} on_retry={retry} />;
  }
  if (load.status === 'empty') {
    return (
      <div className={styles.radar_block}>
        <RadarPanel state="empty" />
        <p className={styles.caption}>Nothing scored in this scope yet.</p>
      </div>
    );
  }

  const counter_role =
    load.radar.axes.find((axis) => axis.counter_role !== null)?.counter_role ?? null;

  return (
    <div className={styles.radar_block}>
      <p className={styles.caption}>{radar_caption(scope, gigs, counter_role)}</p>
      <RadarPanel
        state="loaded"
        scale={{ min: load.radar.framework.scale_min, max: load.radar.framework.scale_max }}
        axes={load.radar.axes}
      />
      <p className={styles.footnote}>
        {rubric_line(
          load.radar.framework.fw_key,
          load.radar.framework.scale_min,
          load.radar.framework.scale_max,
          gigs,
        )}
      </p>
    </div>
  );
}
```

Render it between the chips and the list, in the branch where the record is not empty:

```tsx
      <ScopedRadar scope={scope} gigs={mine} />
```

Do not render it in the `whole_record.length === 0` branch: a student with nothing written
gets one empty state, not two saying the same thing.

- [ ] **Step 2: Add the styles**

Append to `DiaryHome.module.css`:

```css
.radar_block {
  margin-top: var(--space-16);
  padding: var(--space-16);
  border: var(--border-width-sm) solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
}

.caption {
  margin: 0 0 var(--space-8);
  font-size: var(--font-size-sm);
  line-height: var(--line-height-relaxed);
  color: var(--color-text);
}

.footnote {
  margin: var(--space-8) 0 0;
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
}
```

- [ ] **Step 3: Build, lint, format, tokens**

```bash
cd web && npm run build && npm run lint && npx prettier --check src
cd .. && scripts/check-tokens.sh
```

Expected: clean, and `No raw hex or magic pixel values outside tokens.css.`

- [ ] **Step 4: Commit**

```bash
git add web/src/screens/DiaryHome.tsx web/src/screens/DiaryHome.module.css
git commit -m "feat(web): the radar in context, captioned by scope (CAP-7)"
```

---

### Task 5: Rows link through to the stepper

**Files:**
- Modify: `web/src/screens/DiaryHome.tsx`
- Modify: `web/src/screens/DiaryHome.module.css`
- Modify: `web/src/app/routes.tsx`

**Interfaces:**
- Consumes: `Link` from `react-router`.
- Produces: the route `reflections/:reflection_id`, which CAP-11 will claim.

- [ ] **Step 1: Add the route**

In `web/src/app/routes.tsx`, beneath the existing `entries/:entry_id` route, add:

```tsx
        {/*
         * The diary home links here rather than to entries/:entry_id:
         * GET /reflections carries no entry ids, so a row could not
         * address an entry without a request per row, and CAP-11's
         * stepper is one reflection with N competency steps anyway
         * ("Competency 3 of 6"). CAP-11 owns both routes and is free to
         * keep one, the other, or both.
         */}
        <Route
          path="reflections/:reflection_id"
          element={<Placeholder screen="Entry stepper" ticket="CAP-11" />}
        />
```

- [ ] **Step 2: Make the row a link**

In `DiaryHome.tsx`, import `Link`:

```tsx
import { Link, useSearchParams } from 'react-router';
```

Replace the body of `ReflectionRow` so the whole row is the link:

```tsx
  return (
    <li>
      <Link className={styles.row} to={`/reflections/${row.id}`}>
        <div className={styles.row_main}>
          <span className={styles.row_title}>{title}</span>
          <span className={styles.row_meta}>{meta.join(' · ')}</span>
        </div>
        <Badge status={row.status} />
        <span className={styles.chevron} aria-hidden="true">
          &#8250;
        </span>
      </Link>
    </li>
  );
```

Change `NothingWritten`'s gig links from `<a href>` to `<Link to>` in the same edit, so the
screen has one way of navigating:

```tsx
            <Link className={styles.empty_link} to={`/gigs/${gig.id}`}>
              {gig.title}
            </Link>
```

- [ ] **Step 3: Style the link row**

The `.row` rule already exists; add the text-decoration reset and the chevron to
`DiaryHome.module.css`:

```css
.row {
  text-decoration: none;
}

.chevron {
  font-size: var(--font-size-lg);
  color: var(--color-text-muted);
}
```

Merge `text-decoration: none;` into the existing `.row` block rather than repeating the
selector.

- [ ] **Step 4: Build, lint, format**

```bash
cd web && npm run build && npm run lint && npx prettier --check src
```

Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add web/src/screens/DiaryHome.tsx web/src/screens/DiaryHome.module.css web/src/app/routes.tsx
git commit -m "feat(web): diary rows link through to the stepper (CAP-7)"
```

---

### Task 6: The export link and its sheet

**Files:**
- Modify: `web/src/screens/DiaryHome.tsx`
- Modify: `web/src/screens/DiaryHome.module.css`

**Interfaces:**
- Consumes: `BottomSheet`, `Button` from `web/src/components/index.ts`.
- Produces: nothing for later tasks.

- [ ] **Step 1: Add the sheet**

Extend the imports:

```tsx
import {
  Badge,
  BottomSheet,
  Button,
  Chip,
  ErrorNotice,
  RadarPanel,
  Skeleton,
  SkeletonGroup,
} from '../components/index.ts';
```

Add the open state beside the others in `DiaryHome`:

```tsx
  const [export_open, setExportOpen] = useState(false);
```

Render the link and the sheet at the foot of the loaded screen, outside the
`whole_record.length === 0` conditional so the record can be exported even from a scope
with nothing in it:

```tsx
      <div className={styles.export_row}>
        <Button variant="secondary" full_width={false} on_click={() => setExportOpen(true)}>
          Export your record
        </Button>
      </div>

      <BottomSheet
        open={export_open}
        title="Export your record"
        onClose={() => setExportOpen(false)}
      >
        <ExportSheet reflections={whole_record} />
      </BottomSheet>
```

And the sheet's body:

```tsx
/**
 * What the export will contain, and nothing that requests one.
 *
 * CAP-18 owns the format selector, POST /exports, the poll loop with its
 * backoff, and the download -- five states of its own, not four. CAP-7's
 * criterion is that the link opens the sheet, so the button is here and
 * disabled with the ticket on it, the same way ReviewQueue's "Score this"
 * waits for CAP-13.
 */
function ExportSheet({ reflections }: { reflections: ReflectionSummary[] }) {
  const counted = {
    draft: reflections.filter((row) => row.status === 'draft').length,
    submitted: reflections.filter((row) => row.status === 'submitted').length,
    assessed: reflections.filter((row) => row.status === 'assessed').length,
  };

  return (
    <div className={styles.sheet}>
      <p className={styles.empty_body}>
        Your whole record, every gig and every sprint, as one file. It is yours: it outlives
        the gig, the subject and the degree.
      </p>

      <ul className={styles.sheet_counts}>
        <li>
          {counted.assessed} assessed
          <Badge status="assessed" />
        </li>
        <li>
          {counted.submitted} submitted
          <Badge status="submitted" />
        </li>
        <li>
          {counted.draft} draft
          <Badge status="draft" />
        </li>
      </ul>

      <Button disabled>Request a JSON export</Button>
      <p className={styles.footnote}>CAP-18 wires this up, including the poll and the download.</p>
    </div>
  );
}
```

- [ ] **Step 2: Add the styles**

Append to `DiaryHome.module.css`:

```css
.export_row {
  display: flex;
  justify-content: flex-end;
  margin-top: var(--space-24);
}

.sheet {
  display: flex;
  flex-direction: column;
  gap: var(--space-12);
}

.sheet_counts {
  display: flex;
  flex-direction: column;
  gap: var(--space-8);
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: var(--font-size-sm);
  color: var(--color-text);
}

.sheet_counts li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-8);
}
```

- [ ] **Step 3: Build, lint, format, tokens**

```bash
cd web && npm run build && npm run lint && npx prettier --check src
cd .. && scripts/check-tokens.sh
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add web/src/screens/DiaryHome.tsx web/src/screens/DiaryHome.module.css
git commit -m "feat(web): the export link, and the sheet it opens (CAP-7)"
```

---

### Task 7: The check

`web/` has no test runner, so the check is a script in `scripts/` wired into `./run`
(CLAUDE.md). `scripts/verify-app-shell.sh` is the model, including its habit of skipping
loudly rather than failing when there is no server.

**Files:**
- Create: `scripts/verify-diary-home.sh`
- Modify: `run`

- [ ] **Step 1: Write the script**

Create `scripts/verify-diary-home.sh`:

```bash
#!/usr/bin/env bash
#
# Proves the diary home's invariants still hold.
#
#   ./run verify-diary                 from the repository root
#   ./scripts/verify-diary-home.sh     the same thing
#
# web/ has no test runner (CLAUDE.md), so this is where a frontend check
# lives. verify-client.sh covers the API client and verify-app-shell.sh the
# shell; this covers the screen mounted inside it, and they do not overlap.
#
# 1. The screen is actually mounted. A screen built but left behind a
#    placeholder is a screen nobody can reach.
# 2. Rows link somewhere the router knows. The diary addresses a reflection
#    rather than an entry, and a link to a route that does not exist lands
#    on the catch-all with no error.
# 3. No second API client, and no hand-written response type. Both are
#    invisible to the compiler and both are how contract drift gets in.
# 4. All four states, including skeletons rather than a spinner.
# 5. GET /me/radar really behaves the way the screen maps it: 200 in a
#    scope with reflections, 404 in one without, which the screen renders
#    as empty rather than as an error. Needs a server and a token; skips
#    itself loudly when there is neither.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

BASE="${BASE:-http://127.0.0.1:8000/api/v1}"
TOKENS="${TOKENS:-$HOME/reflection-diary-tokens.txt}"
SCREEN="web/src/screens/DiaryHome.tsx"
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

if grep -q '<DiaryHome />' "$ROUTES"; then
    ok "routes.tsx renders DiaryHome"
else
    bad "routes.tsx renders DiaryHome" "index route still a placeholder?"
fi

if grep -q 'screen="Diary" ticket="CAP-7"' "$ROUTES"; then
    bad "the CAP-7 placeholder is gone" "still in $ROUTES"
else
    ok "the CAP-7 placeholder is gone"
fi

# --------------------------------------------------------------------------
say "2. Rows link somewhere the router knows"

if grep -q 'to={`/reflections/' "$SCREEN"; then
    if grep -q 'path="reflections/:reflection_id"' "$ROUTES"; then
        ok "/reflections/:reflection_id is a real route"
    else
        bad "/reflections/:reflection_id is a real route" "link with no route"
    fi
else
    bad "rows link to a reflection" "no link found in $SCREEN"
fi

# --------------------------------------------------------------------------
say "3. One API client, no hand-written types"

if grep -qE '\bfetch\(' "$SCREEN" "$SCOPE"; then
    bad "no direct fetch" "$(grep -lE '\bfetch\(' "$SCREEN" "$SCOPE" | tr '\n' ' ')"
else
    ok "no direct fetch"
fi

if grep -qE '^\s*(export )?interface .*(Response|Payload)\b' "$SCREEN" "$SCOPE"; then
    bad "no hand-written response type" "declare it in the contract instead"
else
    ok "no hand-written response type"
fi

if grep -q "from '../api/schema.ts'" "$SCOPE"; then
    ok "payload types come from the generated schema"
else
    bad "payload types come from the generated schema" "check $SCOPE"
fi

# --------------------------------------------------------------------------
say "4. All four states"

states_missing=""
grep -q "status: 'loading'" "$SCREEN"   || states_missing="$states_missing loading"
grep -q "status: 'error'" "$SCREEN"     || states_missing="$states_missing error"
grep -q 'styles.empty' "$SCREEN"        || states_missing="$states_missing empty"
grep -q "status: 'loaded'" "$SCREEN"    || states_missing="$states_missing loaded"

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
say "5. GET /me/radar behaves the way the screen maps it"

TOKEN=""
[ -f "$TOKENS" ] && TOKEN="$(grep -s 'Jane N' "$TOKENS" | awk '{print $NF}')"

if ! curl -fsS -o /dev/null "$BASE/auth/me" -H "Authorization: Bearer ${TOKEN:-none}" 2>/dev/null \
   && [ -z "$TOKEN" ]; then
    meh "live radar checks" "no server on $BASE or no token in $TOKENS"
else
    code="$(curl -s -o /dev/null -w '%{http_code}' "$BASE/me/radar" \
        -H "Authorization: Bearer $TOKEN")"
    if [ "$code" = "200" ]; then
        ok "unscoped radar answers" "200"
    else
        bad "unscoped radar answers" "got $code"
    fi

    # A gig id that exists but carries nothing of this caller's is the
    # 404 the screen renders as empty. A random uuid does the same job:
    # the framework lookup finds no reflection in scope either way.
    code="$(curl -s -o /dev/null -w '%{http_code}' \
        "$BASE/me/radar?gig_id=00000000-0000-4000-8000-000000000000" \
        -H "Authorization: Bearer $TOKEN")"
    if [ "$code" = "404" ]; then
        ok "a scope with nothing written 404s" "the screen's empty state"
    else
        bad "a scope with nothing written 404s" "got $code"
    fi
fi

# --------------------------------------------------------------------------
printf '\n%s%d passed%s, %s%d failed%s, %s%d skipped%s\n' \
    "$grn" "$pass" "$off" "$red" "$fail" "$off" "$ylw" "$skip" "$off"

[ "$fail" -eq 0 ]
```

Make it executable:

```bash
chmod +x scripts/verify-diary-home.sh
```

- [ ] **Step 2: Wire it into `./run`**

In `run`, beneath the `verify-shell)` case, add:

```bash
    # The diary home's own invariants: the screen is mounted, its rows link
    # to a route that exists, it declares no types of its own, and it ships
    # four states. The live radar check needs a server and a token; it
    # skips itself rather than failing.
    verify-diary) step ./scripts/verify-diary-home.sh ;;
```

And add a line to the `help` heredoc beside the existing `verify-shell` line, matching its
formatting exactly.

- [ ] **Step 3: Run it**

```bash
./run verify-diary
```

Expected: sections 1 to 4 all `ok`, section 5 `skip` with "no server ... or no token",
and a final line reading `N passed, 0 failed, 1 skipped`. Read the output; do not assume
it.

- [ ] **Step 4: Prove the check can fail**

A check that cannot fail is not a check. Temporarily break one invariant and confirm the
script catches it:

```bash
sed -i 's|<DiaryHome />|<Placeholder screen="Diary" ticket="CAP-7" />|' web/src/app/routes.tsx
./run verify-diary            # expect: two FAILs in section 1, exit status 1
git checkout web/src/app/routes.tsx
./run verify-diary            # expect: green again
```

- [ ] **Step 5: Commit**

```bash
git add scripts/verify-diary-home.sh run
git commit -m "test(web): verify the diary home's invariants (CAP-7)"
```

---

### Task 8: Look at it, then say so in the docs

**Files:**
- Modify: `docs/Stack-and-Build-Scope.md`
- Modify: `web/README.md`
- Modify: `README.md`

- [ ] **Step 1: Start the mock and point the app at it**

Two terminals, from the repository root:

```bash
./run mock                                     # prism on :4010
```

```bash
printf 'VITE_API_BASE_URL=http://localhost:4010\n' > web/.env
cd web && npm run dev                          # :5173
```

`web/.env` is gitignored. Restore it in Step 5.

- [ ] **Step 2: Look at all four states, both themes, both widths**

Use Playwright. Paste any non-empty string into the token gate: prism answers `/auth/me`
from the contract's example regardless of the token, which is exactly why the mock is
usable without a real one.

At 390px and at 1280px, in light and in dark, confirm:

- the chip rows wrap rather than overflow at 390px;
- the radar's caption changes when a gig chip and then a sprint chip is selected, and the
  URL changes with it;
- a reload of a scoped URL comes back to the same scope;
- the rows carry a badge and navigate to the CAP-11 placeholder;
- the export button opens the sheet, Escape closes it, and focus returns to the button;
- nothing renders a raw colour that ignores the theme.

Take a screenshot of the loaded state at each width and keep them out of the repository
(Figma and design assets stay out of git).

- [ ] **Step 3: Look at the empty and error states**

Empty: stop prism, restart it with a fixture where `/reflections` returns `[]`, or simply
confirm the copy by selecting a sprint chip whose scope has no rows (the filtered-empty
state). Both empty branches are worth seeing.

Error: stop prism entirely and reload. The shell's own error state appears first; to see
the screen's, keep `/auth/me` answering and stop only the rest -- if that is awkward with
prism, note it in the handover rather than claiming the state was verified. Do not claim a
state was seen that was not.

- [ ] **Step 4: Update the docs**

In `docs/Stack-and-Build-Scope.md` 4.3, change the Diary home line from `- [ ]` to `- [x]`
and append how it is checked, matching the shell line's wording:

```
- [x] Diary home: scope chips (all gigs / per gig), sprint chips inside a gig, radar with
      a caption that changes with scope, entry list with status badges, export link.
      Scope lives in the URL (ADR #27) and `./run verify-diary` checks it
```

In `web/README.md`, add a short section beside the shell's, naming the screen, the file,
the URL shape and the check. In the root `README.md`, find whatever table or list claims
the diary home is unbuilt -- the same claims commit b837648 last corrected -- and correct
it. Do not invent a new section; edit what is there.

- [ ] **Step 5: Restore the environment**

```bash
printf 'VITE_API_BASE_URL=http://localhost:8000/api/v1\n' > web/.env
```

- [ ] **Step 6: Run everything CI runs**

```bash
./run check
```

Expected: `All checks passed.` Read the output. If the backend half fails for a reason that
predates this branch, say so explicitly rather than describing the run as green.

- [ ] **Step 7: Commit**

```bash
git add docs/Stack-and-Build-Scope.md web/README.md README.md
git commit -m "docs: the diary home is built, and how to check it (CAP-7)"
```

---

## Follow-ups, not in this plan

Recorded here rather than done, because CAP-7 is CAP-7.

- **CAP-10's dev mount.** `web/review-queue.html`, `web/src/review-queue-dev.tsx` and the
  third entry in `web/vite.config.ts` are still there, and `/review-queue` still renders a
  placeholder while `web/src/screens/ReviewQueue.tsx` sits built and unmounted. One line in
  `routes.tsx` plus three deletions. It is Tony's, and CAP-5 already left the note.
- **"Two sprints need your reflection."** The old mock-up's diary banner counted sprints
  that are open and unwritten. It is good, and it is not in CAP-7's acceptance criteria.
  Worth raising as its own small ticket rather than smuggling in.
- **A reflection with no sprint** renders as "Whole gig". Nothing seeded produces one, so
  that row has never been looked at; the schema allows it
  (`reflections.sprint_id` is nullable).
- **The empty state links to `/gigs/:gig_id`**, which is CAP-8's placeholder until CAP-8
  lands. The link is correct; its destination is not built.

## What this ticket does not touch

`api/`, `db/`, `docs/openapi.yaml`, `web/src/api/client.ts`, `web/src/api/schema.ts`, and
every component under `web/src/components/`. If any of them needs to change, that is a
finding worth raising before changing it, not a detail of this ticket.
