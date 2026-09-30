/**
 * Every screenshot HO-6 takes. One entry, one PNG, named `${id}.png` in
 * web/e2e/shots/output/. Ids are descriptive stems, not real figure
 * numbers -- see README.md for why and for the one place to rename them
 * once the linked shot-list doc can actually be read.
 */
import type { components } from '../../src/api/schema.ts';
import type { Fault, FrameworkDetail, GigDetail, ReflectionSummary } from '../fake-api.ts';
import type { SlotId } from '../../src/session/tokens.ts';

type Me = components['schemas']['Me'];
type Viewport = 'desktop' | 'mobile';
type State = 'loaded' | 'loading' | 'empty' | 'error';

export interface FakeScenario {
  source: 'fake';
  me: Me;
  frameworks: FrameworkDetail[];
  gigs?: GigDetail[];
  reflections?: ReflectionSummary[];
  /** For state: 'error' only -- which route to fail, and how. */
  fault?: { route: string; fault: Fault };
  /** For state: 'loading' only -- which route to hold open. */
  hold?: string;
}

export interface RealScenario {
  source: 'real';
  slot: SlotId;
}

export interface Shot {
  id: string;
  screen: string;
  route: string;
  viewport: Viewport;
  state: State;
  /** Text Playwright waits for before screenshotting. Ignored for
   *  state: 'loading', which always waits for the universal
   *  role="status" SkeletonGroup instead (Skeleton.tsx). */
  ready?: string;
  scenario: FakeScenario | RealScenario;
  /** CSS selectors to redact in the screenshot (criterion 3). */
  mask?: string[];
}

import {
  EMPTY_GIG,
  GIG,
  JANE,
  LA_TROBE_FRAMEWORK,
  REFLECTION_DRAFT_DETAIL,
  REFLECTION_EMPTY_DETAIL,
  REFLECTION_SUBMITTED,
  REFLECTION_SUBMITTED_DETAIL,
} from './fixtures.ts';

/**
 * The assessor viewing the Entry Stepper's second mode (CAP-13). Not
 * exported: Task 3 adds its own `SAM` to fixtures.ts for Review Queue and
 * friends (see the plan's Task 3 Step 2), and this shot needs nothing from
 * that beyond the same id GIG.participants already uses for "Sam O", so a
 * second top-level export under a different name would just be a second
 * place this identity is defined.
 */
const ENTRY_STEPPER_ASSESSOR: Me = {
  id: 'ffff1111-0002-4fff-8fff-ffffffffffff',
  display_name: 'Sam O',
  participations: [{ gig_id: GIG.id, gig_title: GIG.title, role: 'assessor' }],
};

/**
 * No live backend is reachable in this environment (Task 2 of HO-6), so
 * there is no way to look up a real seeded gig id the SHOTS_STUDENT_TOKEN
 * user actually participates in. `gig-detail-loaded` and
 * `history-sheet-loaded` both need one, and both currently skip cleanly
 * anyway because no SHOTS_STUDENT_TOKEN is set (capture.spec.ts's
 * `test.skip(!token, ...)` runs before `page.goto` ever fires) -- so this
 * placeholder is inert for now. Task 4, which actually exercises the real
 * path, must replace it with a real id (e.g. read one off that token's own
 * GET /gigs response) before these two entries can produce a real
 * screenshot rather than a 404.
 */
const REAL_GIG_ID_PLACEHOLDER = '00000000-0000-4000-8000-000000000000';

export const SHOTS: Shot[] = [
  {
    id: 'submitted-loaded',
    screen: 'Submitted confirmation',
    route: `/reflections/${REFLECTION_SUBMITTED.id}/submitted`,
    viewport: 'desktop',
    state: 'loaded',
    ready: 'has been notified and will review your reflection',
    scenario: {
      source: 'fake',
      me: JANE,
      frameworks: [LA_TROBE_FRAMEWORK],
      gigs: [GIG],
      reflections: [REFLECTION_SUBMITTED],
    },
  },

  // -- Diary home (CAP-7) -----------------------------------------------
  // DiaryHome.tsx fetches `GET /gigs` and `GET /reflections` together on
  // mount (Promise.all). Empty is "Nothing in your diary yet." (NothingWritten,
  // gigs present but no reflections) rather than the different "not a
  // student on any gig" empty state, which is why the empty scenario uses
  // EMPTY_GIG rather than an empty gigs array.
  {
    id: 'diary-home-loaded',
    screen: 'Diary home',
    route: '/',
    viewport: 'desktop',
    state: 'loaded',
    // Not the "Your diary" h1: that heading renders in the loading branch
    // too (same <section> wrapper for both), so waiting on it would resolve
    // the instant the page mounts, before gigs/reflections actually load,
    // and could screenshot the skeleton under a "loaded" name. This Button
    // label only renders once `load.status === 'loaded'` and the caller is
    // a student on at least one gig.
    ready: 'Export your record',
    scenario: { source: 'real', slot: 'student' },
  },
  {
    id: 'diary-home-loaded-mobile',
    screen: 'Diary home',
    route: '/',
    viewport: 'mobile',
    state: 'loaded',
    ready: 'Export your record',
    scenario: { source: 'real', slot: 'student' },
  },
  {
    id: 'diary-home-loading',
    screen: 'Diary home',
    route: '/',
    viewport: 'desktop',
    state: 'loading',
    scenario: {
      source: 'fake',
      me: JANE,
      frameworks: [LA_TROBE_FRAMEWORK],
      gigs: [GIG],
      hold: 'GET /gigs',
    },
  },
  {
    id: 'diary-home-empty',
    screen: 'Diary home',
    route: '/',
    viewport: 'desktop',
    state: 'empty',
    ready: 'Nothing in your diary yet.',
    scenario: { source: 'fake', me: JANE, frameworks: [LA_TROBE_FRAMEWORK], gigs: [EMPTY_GIG] },
  },
  // CONCERN: verified failing under `./run shots` today, not a data mistake.
  // React StrictMode (main.tsx) double-invokes DiaryHome's mount effect in
  // dev (SessionProvider.tsx's own comment already names this: "you will
  // see two requests on first load"). `api.fail(route, fault)` is single-use
  // by default (FakeApi.fail's `times = 1`), and capture.spec.ts always
  // calls it with the default -- it has no way to take a `times` from this
  // manifest entry. The first GET /gigs is the one that gets faulted, but
  // StrictMode's cleanup aborts that request client-side before the
  // component acts on it; the second, unfaulted GET /gigs then succeeds and
  // the screen renders normally instead of erroring. Confirmed by running
  // it: the page shows "Nothing in your diary yet." instead of the error
  // notice, so the wait for `ready` genuinely times out (an honest failure,
  // not a silently mislabelled screenshot). Fixing this needs
  // capture.spec.ts to pass a higher `times` (e.g. 2) through to `fail()`
  // for a mount-effect fault -- out of this task's scope (fixtures.ts and
  // manifest.ts only) and not specific to Diary Home: any future error shot
  // for a mount-effect GET will hit the same thing.
  {
    id: 'diary-home-error',
    screen: 'Diary home',
    route: '/',
    viewport: 'desktop',
    state: 'error',
    ready: 'Something went wrong.',
    scenario: {
      source: 'fake',
      me: JANE,
      frameworks: [LA_TROBE_FRAMEWORK],
      gigs: [GIG],
      fault: {
        route: 'GET /gigs',
        fault: {
          kind: 'error',
          status: 500,
          code: 'VALIDATION_FAILED',
          message: 'Something went wrong.',
        },
      },
    },
  },

  // -- Gig detail (CAP-8) -------------------------------------------------
  // GET /gigs/{gig_id} (key `GET /gigs/:id`), plus GET /reflections?gig_id=
  // for a student. Loaded-only in this task (ruling: Task 2's progress
  // ledger). "Reflection diary" is the DiaryCard's own heading, present
  // once the gig has loaded and absent from the skeleton.
  //
  // CONCERN: this route needs a real seeded gig id the token's student
  // participates in, which is not resolvable without a live backend (see
  // REAL_GIG_ID_PLACEHOLDER above). Inert today because there is no
  // SHOTS_STUDENT_TOKEN in this environment either.
  {
    id: 'gig-detail-loaded',
    screen: 'Gig detail',
    route: `/gigs/${REAL_GIG_ID_PLACEHOLDER}`,
    viewport: 'desktop',
    state: 'loaded',
    ready: 'Reflection diary',
    scenario: { source: 'real', slot: 'student' },
  },
  {
    id: 'gig-detail-loaded-mobile',
    screen: 'Gig detail',
    route: `/gigs/${REAL_GIG_ID_PLACEHOLDER}`,
    viewport: 'mobile',
    state: 'loaded',
    ready: 'Reflection diary',
    scenario: { source: 'real', slot: 'student' },
  },

  // -- Entry stepper (CAP-11 / CAP-13) ------------------------------------
  // GET /reflections/{reflection_id} (key `GET /reflections/:id`) then
  // GET /frameworks/{framework_id} (key `GET /frameworks/:id`), in sequence.
  // Empty is `entries.length === 0` -> "Nothing to reflect on." Both modes
  // are fake per the Global Constraints (write-flow screens).
  {
    id: 'entry-stepper-student-loaded',
    screen: 'Entry stepper',
    route: `/reflections/${REFLECTION_DRAFT_DETAIL.id}`,
    viewport: 'desktop',
    state: 'loaded',
    ready: 'Communication',
    scenario: {
      source: 'fake',
      me: JANE,
      frameworks: [LA_TROBE_FRAMEWORK],
      reflections: [REFLECTION_DRAFT_DETAIL],
    },
  },
  {
    id: 'entry-stepper-student-loaded-mobile',
    screen: 'Entry stepper',
    route: `/reflections/${REFLECTION_DRAFT_DETAIL.id}`,
    viewport: 'mobile',
    state: 'loaded',
    ready: 'Communication',
    scenario: {
      source: 'fake',
      me: JANE,
      frameworks: [LA_TROBE_FRAMEWORK],
      reflections: [REFLECTION_DRAFT_DETAIL],
    },
  },
  {
    id: 'entry-stepper-assessor-loaded',
    screen: 'Entry stepper',
    route: `/review-queue/reflections/${REFLECTION_SUBMITTED_DETAIL.id}`,
    viewport: 'desktop',
    state: 'loaded',
    ready: 'Communication',
    scenario: {
      source: 'fake',
      me: ENTRY_STEPPER_ASSESSOR,
      frameworks: [LA_TROBE_FRAMEWORK],
      reflections: [REFLECTION_SUBMITTED_DETAIL],
    },
  },
  {
    id: 'entry-stepper-assessor-loaded-mobile',
    screen: 'Entry stepper',
    route: `/review-queue/reflections/${REFLECTION_SUBMITTED_DETAIL.id}`,
    viewport: 'mobile',
    state: 'loaded',
    ready: 'Communication',
    scenario: {
      source: 'fake',
      me: ENTRY_STEPPER_ASSESSOR,
      frameworks: [LA_TROBE_FRAMEWORK],
      reflections: [REFLECTION_SUBMITTED_DETAIL],
    },
  },
  {
    id: 'entry-stepper-loading',
    screen: 'Entry stepper',
    route: `/reflections/${REFLECTION_DRAFT_DETAIL.id}`,
    viewport: 'desktop',
    state: 'loading',
    scenario: {
      source: 'fake',
      me: JANE,
      frameworks: [LA_TROBE_FRAMEWORK],
      reflections: [REFLECTION_DRAFT_DETAIL],
      hold: 'GET /reflections/:id',
    },
  },
  {
    id: 'entry-stepper-empty',
    screen: 'Entry stepper',
    route: `/reflections/${REFLECTION_EMPTY_DETAIL.id}`,
    viewport: 'desktop',
    state: 'empty',
    ready: 'Nothing to reflect on.',
    scenario: {
      source: 'fake',
      me: JANE,
      frameworks: [LA_TROBE_FRAMEWORK],
      reflections: [REFLECTION_EMPTY_DETAIL],
    },
  },
  // CONCERN: same StrictMode-vs-fail() gap as diary-home-error above --
  // see that entry's comment. Confirmed by running it: the page shows the
  // fully loaded reflection (the "Communication" entry, self-score and
  // all) instead of the error notice.
  {
    id: 'entry-stepper-error',
    screen: 'Entry stepper',
    route: `/reflections/${REFLECTION_DRAFT_DETAIL.id}`,
    viewport: 'desktop',
    state: 'error',
    ready: 'Something went wrong.',
    scenario: {
      source: 'fake',
      me: JANE,
      frameworks: [LA_TROBE_FRAMEWORK],
      reflections: [REFLECTION_DRAFT_DETAIL],
      fault: {
        route: 'GET /reflections/:id',
        fault: {
          kind: 'error',
          status: 500,
          code: 'VALIDATION_FAILED',
          message: 'Something went wrong.',
        },
      },
    },
  },

  // -- History sheet (CAP-14) ---------------------------------------------
  // Loaded-only in this task. "Reflection submitted" is history-log.ts's
  // own label for a reflection_submitted milestone.
  //
  // CONCERN: HistorySheet is not a route (routes.tsx: "not here... they
  // open over the diary" via BottomSheet) -- it only renders once GigDetail's
  // History button is clicked, and capture.spec.ts's generic goto-then-wait
  // loop has no click step. This entry is inert today (no
  // SHOTS_STUDENT_TOKEN, so it skips before `page.goto`), but as written it
  // cannot produce a real screenshot even once Task 4 supplies a token and a
  // real gig id: `ready` will never appear because the sheet is never
  // opened. Flagged per this task's brief rather than fixed here, since
  // fixing it means either giving capture.spec.ts a click step or giving
  // the history sheet its own URL, and both are runner/product changes out
  // of this task's scope (fixtures.ts and manifest.ts only).
  {
    id: 'history-sheet-loaded',
    screen: 'History sheet',
    route: `/gigs/${REAL_GIG_ID_PLACEHOLDER}`,
    viewport: 'desktop',
    state: 'loaded',
    ready: 'Reflection submitted',
    scenario: { source: 'real', slot: 'student' },
  },
  {
    id: 'history-sheet-loaded-mobile',
    screen: 'History sheet',
    route: `/gigs/${REAL_GIG_ID_PLACEHOLDER}`,
    viewport: 'mobile',
    state: 'loaded',
    ready: 'Reflection submitted',
    scenario: { source: 'real', slot: 'student' },
  },

  // -- Export sheet (CAP-18) -----------------------------------------------
  // Mounted inside DiaryHome's own BottomSheet, opened by `export_open`
  // React state on a button click, same as GigDetail's History button.
  //
  // CONCERN: this shot has the same structural gap as History Sheet above,
  // except this one is fake-sourced, so it WILL actually run in this
  // environment rather than skip. `ready` deliberately names text that only
  // renders once ExportSheet is mounted (open) -- not "Export your record",
  // which is the DiaryHome button that OPENS the sheet and would already be
  // visible on plain `page.goto('/')`, making the test pass without the
  // sheet ever having rendered and mislabelling a Diary Home screenshot as
  // "Export sheet — loaded". With the correct, sheet-only ready text this
  // entry is expected to time out and FAIL until either capture.spec.ts
  // gains a click step or the sheet gets its own URL -- both out of this
  // task's scope (fixtures.ts and manifest.ts only). Left in and reported
  // as a concern rather than silently made to pass on the wrong text.
  {
    id: 'export-sheet-loaded',
    screen: 'Export sheet',
    route: '/',
    viewport: 'desktop',
    state: 'loaded',
    ready: 'Request a PDF export',
    scenario: {
      source: 'fake',
      me: JANE,
      frameworks: [LA_TROBE_FRAMEWORK],
      gigs: [GIG],
      reflections: [REFLECTION_SUBMITTED],
    },
  },
  {
    id: 'export-sheet-loaded-mobile',
    screen: 'Export sheet',
    route: '/',
    viewport: 'mobile',
    state: 'loaded',
    ready: 'Request a PDF export',
    scenario: {
      source: 'fake',
      me: JANE,
      frameworks: [LA_TROBE_FRAMEWORK],
      gigs: [GIG],
      reflections: [REFLECTION_SUBMITTED],
    },
  },
];
