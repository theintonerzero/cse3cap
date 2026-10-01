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
  /**
   * For state: 'error' only -- which route to fail, and how. `times`
   * defaults to 1, matching FakeApi.fail()'s own default; set it higher
   * (e.g. 2) when the route is fetched from a mount effect, because React
   * StrictMode (main.tsx) double-invokes those in dev and the first,
   * faulted request gets aborted by the effect's own cleanup before the
   * component sees it -- the second, unfaulted request would otherwise
   * succeed and the screen would load normally instead of erroring.
   */
  fault?: { route: string; fault: Fault; times?: number };
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
  /**
   * The visible text of a button or link to click after `page.goto(route)`
   * and before the loading/ready wait -- for a screen that is not a route
   * of its own but a BottomSheet opened over one (History Sheet over Gig
   * Detail, Export Sheet over Diary Home; routes.tsx: "they open over the
   * diary rather than navigating away from it"). Omit for anything that is
   * itself a route.
   */
  open?: string;
}

import {
  DR_LEE,
  EMPTY_GIG,
  GIG,
  JANE,
  LA_TROBE_FRAMEWORK,
  REFLECTION_DRAFT_DETAIL,
  REFLECTION_EMPTY_DETAIL,
  REFLECTION_SUBMITTED,
  REFLECTION_SUBMITTED_DETAIL,
  SAM,
} from './fixtures.ts';

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

/**
 * Same placeholder situation as REAL_GIG_ID_PLACEHOLDER above, for
 * `edit-framework-loaded`: there is no live backend to read a real seeded
 * framework id from, and the shot currently skips cleanly anyway because no
 * SHOTS_SUPERVISOR_TOKEN is set. Task 4 must replace it with a real id (e.g.
 * one read off GET /frameworks under that token) before this entry can
 * produce a real screenshot rather than a 404.
 */
const REAL_FRAMEWORK_ID_PLACEHOLDER = '00000000-0000-4000-8000-000000000000';

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
  // React StrictMode (main.tsx) double-invokes DiaryHome's mount effect in
  // dev (SessionProvider.tsx's own comment already names this: "you will
  // see two requests on first load"). `times: 2` below means both the
  // StrictMode-aborted first request AND the real second request get the
  // fault, so the screen actually renders the error notice instead of the
  // second, unfaulted-by-default request quietly succeeding. Confirmed
  // fixed by running it after adding `times`.
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
        times: 2,
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
      me: SAM,
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
      me: SAM,
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
  // Same StrictMode-vs-fail() mount-effect gap as diary-home-error above --
  // see that entry's comment. `times: 2` for the same reason.
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
        times: 2,
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
  // Loaded-only in this task. Not a route of its own -- it is a BottomSheet
  // over Gig Detail (routes.tsx: "they open over the diary rather than
  // navigating away from it"; Stack-and-Build-Scope.md: "History sheet on
  // the same frame [as Gig Detail] is CAP-14"), opened by GigHeader's
  // "History" Button (GigDetail.tsx). `route` is Gig Detail's own route and
  // `open` is that button's exact visible text; capture.spec.ts clicks it
  // after `page.goto` and before waiting on `ready`. "Reflection submitted"
  // is history-log.ts's own label for a reflection_submitted milestone.
  {
    id: 'history-sheet-loaded',
    screen: 'History sheet',
    route: `/gigs/${REAL_GIG_ID_PLACEHOLDER}`,
    open: 'History',
    viewport: 'desktop',
    state: 'loaded',
    ready: 'Reflection submitted',
    scenario: { source: 'real', slot: 'student' },
  },
  {
    id: 'history-sheet-loaded-mobile',
    screen: 'History sheet',
    route: `/gigs/${REAL_GIG_ID_PLACEHOLDER}`,
    open: 'History',
    viewport: 'mobile',
    state: 'loaded',
    ready: 'Reflection submitted',
    scenario: { source: 'real', slot: 'student' },
  },

  // -- Export sheet (CAP-18) -----------------------------------------------
  // Loaded-only in this task. Not a route of its own either -- a BottomSheet
  // over Diary Home (Stack-and-Build-Scope.md: Diary Home's "export link...
  // opens the sheet CAP-18 fills in"), opened by DiaryHome's "Export your
  // record" Button. `route` is Diary Home's own route and `open` is that
  // button's exact visible text. `ready` is "Request a PDF export" (the
  // idle-state Button inside the sheet itself), not "Export your record"
  // again -- that text is also the trigger, so it is already visible before
  // the click and would make the wait resolve immediately regardless of
  // whether the sheet actually opened.
  {
    id: 'export-sheet-loaded',
    screen: 'Export sheet',
    route: '/',
    open: 'Export your record',
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
    open: 'Export your record',
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

  // -- Review queue (CAP-10) ----------------------------------------------
  // GET /review-queue (ReviewQueueController::index), scoped to the caller's
  // own role server-side -- nothing in the route or the fixture asserts
  // that. Loaded-only in this task (same progress-ledger ruling as Gig
  // Detail). "Score this →" is ReviewQueueRow's own link into the assessor
  // stepper (CAP-13), present only once state.status === 'loaded' with at
  // least one entry -- the "Review queue" h1 above it renders in every
  // status, so it cannot be the wait target (same trap as Diary Home's own
  // h1; see that entry's comment).
  //
  // CONCERN: inert today, same as every other real-sourced entry in this
  // file -- no SHOTS_ASSESSOR_TOKEN is set, so capture.spec.ts skips before
  // page.goto ever fires, and "Score this →" assumes the real seeded
  // assessor has at least one submission waiting, which Task 4 confirms.
  {
    id: 'review-queue-loaded',
    screen: 'Review queue',
    route: '/review-queue',
    viewport: 'desktop',
    state: 'loaded',
    ready: 'Score this →',
    scenario: { source: 'real', slot: 'assessor' },
  },
  {
    id: 'review-queue-loaded-mobile',
    screen: 'Review queue',
    route: '/review-queue',
    viewport: 'mobile',
    state: 'loaded',
    ready: 'Score this →',
    scenario: { source: 'real', slot: 'assessor' },
  },

  // -- Select framework (CAP-15) -------------------------------------------
  // GET /frameworks (SelectFramework.tsx). Loaded-only for the real shot;
  // "Templates" is the Group heading for the shipped-with-the-product group,
  // rendered only from LoadedState once state.status === 'loaded' -- the
  // "Frameworks" h1 and its sub paragraph above it render in every status
  // (same trap as Diary Home's and Review Queue's own h1s), so neither can
  // be the wait target. A seeded database always has templates (CLAUDE.md:
  // "Treat seeded ... frameworks as fixed reference data"), so the group is
  // never actually empty.
  {
    id: 'select-framework-loaded',
    screen: 'Select framework',
    route: '/frameworks',
    viewport: 'desktop',
    state: 'loaded',
    ready: 'Templates',
    scenario: { source: 'real', slot: 'supervisor' },
  },
  {
    id: 'select-framework-loaded-mobile',
    screen: 'Select framework',
    route: '/frameworks',
    viewport: 'mobile',
    state: 'loaded',
    ready: 'Templates',
    scenario: { source: 'real', slot: 'supervisor' },
  },
  // A 409 FRAMEWORK_IN_USE demonstration (ADR #42: a refusal is injected by
  // code, the fake never reimplements the rule itself -- the rule that an
  // in-use framework can no longer be edited directly lives in
  // api/app/Services/FrameworkEditing.php and is tested in api/tests/, not
  // here). FRAMEWORK_IN_USE is a real code from docs/openapi.yaml's Error
  // schema (ErrorCode enum, used on PATCH /frameworks/{framework_id} and
  // friends in EditFramework.tsx's own save path). Faulting it on Select
  // Framework's own load route demonstrates the code's ErrorNotice rendering
  // without needing a copy already saved and already in use, which the fake
  // scenarios in this file do not otherwise construct. ErrorNotice's default
  // branch (ErrorNotice.tsx: any code besides UNAUTHENTICATED / ROLE_FORBIDDEN
  // / NOT_FOUND) shows the envelope's own message verbatim, so `ready` is
  // that same string. `times: 2` for the same StrictMode-vs-mount-effect gap
  // as diary-home-error and entry-stepper-error above -- SelectFramework.tsx
  // uses the identical AbortController-in-a-mount-effect shape.
  {
    id: 'select-framework-error',
    screen: 'Select framework',
    route: '/frameworks',
    viewport: 'desktop',
    state: 'error',
    ready: 'This framework has reflections against it and cannot be edited directly.',
    scenario: {
      source: 'fake',
      me: DR_LEE,
      frameworks: [LA_TROBE_FRAMEWORK],
      fault: {
        route: 'GET /frameworks',
        times: 2,
        fault: {
          kind: 'error',
          status: 409,
          code: 'FRAMEWORK_IN_USE',
          message: 'This framework has reflections against it and cannot be edited directly.',
        },
      },
    },
  },

  // -- Edit framework (CAP-16) ---------------------------------------------
  // GET /frameworks then GET /frameworks/{framework_id} (EditFramework.tsx,
  // Promise.all), the latter keyed by the route param. Loaded-only for the
  // real shot; "Based on" is the base-picker's own label, rendered only once
  // load.status === 'loaded', regardless of whether the base framework turns
  // out to have competencies to rename -- the "Copy and edit a rubric" h1
  // above it renders in every status (same trap as the other screens' own
  // h1s in this file), so it cannot be the wait target.
  //
  // CONCERN: needs a real seeded framework id, same placeholder situation as
  // REAL_GIG_ID_PLACEHOLDER (see REAL_FRAMEWORK_ID_PLACEHOLDER above) --
  // inert today because no SHOTS_SUPERVISOR_TOKEN is set either.
  {
    id: 'edit-framework-loaded',
    screen: 'Edit framework',
    route: `/frameworks/${REAL_FRAMEWORK_ID_PLACEHOLDER}/edit`,
    viewport: 'desktop',
    state: 'loaded',
    ready: 'Based on',
    scenario: { source: 'real', slot: 'supervisor' },
  },
  {
    id: 'edit-framework-loaded-mobile',
    screen: 'Edit framework',
    route: `/frameworks/${REAL_FRAMEWORK_ID_PLACEHOLDER}/edit`,
    viewport: 'mobile',
    state: 'loaded',
    ready: 'Based on',
    scenario: { source: 'real', slot: 'supervisor' },
  },
];
