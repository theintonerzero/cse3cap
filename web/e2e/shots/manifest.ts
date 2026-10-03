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
  /**
   * FakeApi.install() always plants a placeholder token (supervisor slot) so
   * every other fake-sourced shot never has to think about sign-in. A shot
   * that needs TokenGate's own clean, no-token entry state (token-entry-masked)
   * sets this instead, so capture.spec.ts clears what install() just planted
   * before the app reads it -- no 401, no rejection banner, just the real
   * first-run state.
   */
  no_token?: boolean;
}

export interface RealScenario {
  source: 'real';
  slot: SlotId;
  /**
   * Env vars (beyond the slot's own SHOTS_<SLOT>_TOKEN) this shot needs set
   * before it can hit a real route -- e.g. SHOTS_GIG_ID for a route built
   * from a real seeded gig id this tool has no way to discover on its own.
   * Missing any of these skips the shot with a clear message, the same
   * convention token_env_var (helpers.ts) already uses for a missing token.
   */
  requires_env?: string[];
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
   *
   * An array clicks each text in order (CAP-21, export-sheet-error): the
   * sheet's own `failed` job state is plain component state with no prop or
   * URL to seed it and no fetch on mount, reachable only by opening the
   * sheet and then pressing its Request button, so one click is not enough
   * to get there.
   */
  open?: string | string[];
  /**
   * Selectors to fill with a value after `open`'s click and before the
   * loading/ready wait -- so a masked field (token-entry-masked) visibly
   * covers real content in the screenshot rather than an empty one.
   */
  fill?: { selector: string; value: string }[];
}

import {
  DR_LEE,
  EMPTY_FRAMEWORK,
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
 * `gig-detail-loaded` and `history-sheet-loaded` both need a route built
 * from a real seeded gig id the SHOTS_STUDENT_TOKEN user actually
 * participates in -- this tool only navigates and reads (Global
 * Constraints), so it has no way to discover one on its own. SHOTS_GIG_ID
 * supplies it from the environment, the same convention token_env_var
 * (helpers.ts) already uses for tokens: with it unset, capture.spec.ts's
 * `requires_env` check (RealScenario) skips these two entries and their
 * mobile copies with a clear message, rather than letting them 404 against
 * a placeholder that was never a real id.
 */
const SHOTS_GIG_ID = process.env.SHOTS_GIG_ID;

/**
 * Same situation as SHOTS_GIG_ID above, for `edit-framework-loaded`:
 * SHOTS_FRAMEWORK_ID supplies a real seeded framework id the
 * SHOTS_SUPERVISOR_TOKEN user may open to edit.
 */
const SHOTS_FRAMEWORK_ID = process.env.SHOTS_FRAMEWORK_ID;

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
  // Two fetches in sequence (Submitted.tsx: GET /reflections/{id}, then
  // GET /gigs/{gig_id}) -- loading holds the first, since the second never
  // fires until it resolves.
  {
    id: 'submitted-loading',
    screen: 'Submitted confirmation',
    route: `/reflections/${REFLECTION_SUBMITTED.id}/submitted`,
    viewport: 'desktop',
    state: 'loading',
    scenario: {
      source: 'fake',
      me: JANE,
      frameworks: [LA_TROBE_FRAMEWORK],
      gigs: [GIG],
      reflections: [REFLECTION_SUBMITTED],
      hold: 'GET /reflections/:id',
    },
  },
  // Empty is reaching this URL for a reflection that is still a draft --
  // reachable by a stale tab, a bookmark, or a shared link rather than only
  // right after submitting (Submitted.tsx's own comment: "not an error: the
  // honest answer is that there is nothing to confirm yet"). Needs a GIG
  // row for the second fetch even though the draft itself is what renders.
  {
    id: 'submitted-empty',
    screen: 'Submitted confirmation',
    route: `/reflections/${REFLECTION_DRAFT_DETAIL.id}/submitted`,
    viewport: 'desktop',
    state: 'empty',
    ready: 'This reflection has not been submitted yet.',
    scenario: {
      source: 'fake',
      me: JANE,
      frameworks: [LA_TROBE_FRAMEWORK],
      gigs: [GIG],
      reflections: [REFLECTION_DRAFT_DETAIL],
    },
  },
  // Same StrictMode-vs-fail() mount-effect gap as diary-home-error -- see
  // that entry's comment. `times: 2` for the same reason.
  {
    id: 'submitted-error',
    screen: 'Submitted confirmation',
    route: `/reflections/${REFLECTION_SUBMITTED.id}/submitted`,
    viewport: 'desktop',
    state: 'error',
    ready: 'Something went wrong.',
    scenario: {
      source: 'fake',
      me: JANE,
      frameworks: [LA_TROBE_FRAMEWORK],
      gigs: [GIG],
      reflections: [REFLECTION_SUBMITTED],
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
    // Not the page's h1: the shell's bar renders it in the loading branch
    // too, so waiting on it would resolve the instant the page mounts,
    // before gigs/reflections actually load, and could screenshot the
    // skeleton under a "loaded" name. This Button
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
    scenario: {
      source: 'fake',
      me: JANE,
      frameworks: [LA_TROBE_FRAMEWORK],
      gigs: [EMPTY_GIG],
    },
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
  // for a student. The `loaded` shots below are real-sourced; the other
  // three states further down are fake (CAP-21). "Reflection diary" is the
  // DiaryCard's own heading, present once the gig has loaded and absent
  // from the skeleton.
  //
  // Needs SHOTS_GIG_ID (see SHOTS_GIG_ID above) alongside SHOTS_STUDENT_TOKEN
  // -- skips cleanly with either unset.
  {
    id: 'gig-detail-loaded',
    screen: 'Gig detail',
    route: `/gigs/${SHOTS_GIG_ID}`,
    viewport: 'desktop',
    state: 'loaded',
    ready: 'Reflection diary',
    scenario: { source: 'real', slot: 'student', requires_env: ['SHOTS_GIG_ID'] },
  },
  {
    id: 'gig-detail-loaded-mobile',
    screen: 'Gig detail',
    route: `/gigs/${SHOTS_GIG_ID}`,
    viewport: 'mobile',
    state: 'loaded',
    ready: 'Reflection diary',
    scenario: { source: 'real', slot: 'student', requires_env: ['SHOTS_GIG_ID'] },
  },
  // Loading/empty/error are fake-sourced (Global Constraints), unlike the
  // two `loaded` shots above which need a real seeded gig. GET /gigs/{id}
  // is the key route; a student's GET /reflections only fires once it
  // resolves, so holding/failing the gig fetch is enough for all three.
  {
    id: 'gig-detail-loading',
    screen: 'Gig detail',
    route: `/gigs/${GIG.id}`,
    viewport: 'desktop',
    state: 'loading',
    scenario: {
      source: 'fake',
      me: JANE,
      frameworks: [LA_TROBE_FRAMEWORK],
      gigs: [GIG],
      hold: 'GET /gigs/:id',
    },
  },
  // Empty is `gig.sprints.length === 0` (DiaryCard, GigDetail.tsx around
  // line 352) -> "No sprints on this gig yet." EMPTY_GIG already has no
  // sprints and is the same fixture diary-home-empty uses for its own
  // "a gig the caller is a student on" case.
  {
    id: 'gig-detail-empty',
    screen: 'Gig detail',
    route: `/gigs/${EMPTY_GIG.id}`,
    viewport: 'desktop',
    state: 'empty',
    ready: 'No sprints on this gig yet.',
    scenario: {
      source: 'fake',
      me: JANE,
      frameworks: [LA_TROBE_FRAMEWORK],
      gigs: [EMPTY_GIG],
    },
  },
  // Same StrictMode-vs-fail() mount-effect gap as diary-home-error -- see
  // that entry's comment. `times: 2` for the same reason.
  {
    id: 'gig-detail-error',
    screen: 'Gig detail',
    route: `/gigs/${GIG.id}`,
    viewport: 'desktop',
    state: 'error',
    ready: 'Something went wrong.',
    scenario: {
      source: 'fake',
      me: JANE,
      frameworks: [LA_TROBE_FRAMEWORK],
      gigs: [GIG],
      fault: {
        route: 'GET /gigs/:id',
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
  // Loaded shots are real-sourced; the other states below are fake (CAP-21).
  // Not a route of its own -- it is a BottomSheet
  // over Gig Detail (routes.tsx: "they open over the diary rather than
  // navigating away from it"; Stack-and-Build-Scope.md: "History sheet on
  // the same frame [as Gig Detail] is CAP-14"), opened by GigHeader's
  // "History" Button (GigDetail.tsx). `route` is Gig Detail's own route and
  // `open` is that button's exact visible text; capture.spec.ts clicks it
  // after `page.goto` and before waiting on `ready`. "Reflection submitted"
  // is history-log.ts's own label for a reflection_submitted milestone.
  // Needs SHOTS_GIG_ID (see SHOTS_GIG_ID above) alongside SHOTS_STUDENT_TOKEN
  // -- skips cleanly with either unset.
  {
    id: 'history-sheet-loaded',
    screen: 'History sheet',
    route: `/gigs/${SHOTS_GIG_ID}`,
    open: 'History',
    viewport: 'desktop',
    state: 'loaded',
    ready: 'Reflection submitted',
    scenario: { source: 'real', slot: 'student', requires_env: ['SHOTS_GIG_ID'] },
  },
  {
    id: 'history-sheet-loaded-mobile',
    screen: 'History sheet',
    route: `/gigs/${SHOTS_GIG_ID}`,
    open: 'History',
    viewport: 'mobile',
    state: 'loaded',
    ready: 'Reflection submitted',
    scenario: { source: 'real', slot: 'student', requires_env: ['SHOTS_GIG_ID'] },
  },
  // Loading/empty/error are fake-sourced over a fake GIG, opened the same
  // way the real `loaded` shots above are (History button on Gig Detail).
  // GET /reflections/{id}/events, once per reflection GigDetail handed in.
  {
    id: 'history-sheet-loading',
    screen: 'History sheet',
    route: `/gigs/${GIG.id}`,
    open: 'History',
    viewport: 'desktop',
    state: 'loading',
    scenario: {
      source: 'fake',
      me: JANE,
      frameworks: [LA_TROBE_FRAMEWORK],
      gigs: [GIG],
      reflections: [REFLECTION_SUBMITTED],
      hold: 'GET /reflections/:id/events',
    },
  },
  // Empty is `rows.length === 0` (HistorySheet.tsx around line 110) ->
  // "Nothing has happened yet." With no reflections handed in at all,
  // Promise.all([]) resolves with nothing to fetch, which is itself the
  // honest empty case -- a student on this gig who has written nothing yet.
  {
    id: 'history-sheet-empty',
    screen: 'History sheet',
    route: `/gigs/${GIG.id}`,
    open: 'History',
    viewport: 'desktop',
    state: 'empty',
    ready: 'Nothing has happened yet.',
    scenario: {
      source: 'fake',
      me: JANE,
      frameworks: [LA_TROBE_FRAMEWORK],
      gigs: [GIG],
      reflections: [],
    },
  },
  // Same StrictMode-vs-fail() mount-effect gap as diary-home-error -- see
  // that entry's comment. `times: 2` for the same reason; this sheet mounts
  // fresh on every open, same as any other effect-bearing component.
  {
    id: 'history-sheet-error',
    screen: 'History sheet',
    route: `/gigs/${GIG.id}`,
    open: 'History',
    viewport: 'desktop',
    state: 'error',
    ready: 'Something went wrong.',
    scenario: {
      source: 'fake',
      me: JANE,
      frameworks: [LA_TROBE_FRAMEWORK],
      gigs: [GIG],
      reflections: [REFLECTION_SUBMITTED],
      fault: {
        route: 'GET /reflections/:id/events',
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

  // -- Export sheet (CAP-18) -----------------------------------------------
  // Loaded shots are real-sourced; the empty/error states below are fake
  // (CAP-21; no loading entry at all -- see that state's own comment below
  // for why). Not a route of its own either -- a BottomSheet
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
  // No `export-sheet-loading` entry: confirmed by reading ExportSheet.tsx --
  // it takes `reflections` as a prop the parent (Diary Home) already
  // loaded, and it never fetches anything on its own mount, so it has no
  // loading state to demonstrate (Task 1 Step 2's own instruction).
  //
  // Empty is `reflections.length === 0` -> "Nothing to export yet." A whole
  // record with nothing written yet, not a scope filter (the sheet counts
  // the whole record -- see this file's ExportSheet.tsx header comment).
  {
    id: 'export-sheet-empty',
    screen: 'Export sheet',
    route: '/',
    open: 'Export your record',
    viewport: 'desktop',
    state: 'empty',
    ready: 'Nothing to export yet.',
    scenario: {
      source: 'fake',
      me: JANE,
      frameworks: [LA_TROBE_FRAMEWORK],
      gigs: [GIG],
      reflections: [],
    },
  },
  // The sheet's own `failed` job status (ExportSheet.tsx's Job type), not
  // DiaryHome's error state: it is plain component state with no fetch on
  // mount, so it is reached by opening the sheet and then pressing Request,
  // which POST /exports here answers with a fault -- `open` as an array
  // (manifest.ts's own Shot.open doc) clicks both in order. No `times: 2`:
  // this call fires from a click handler, not a mount effect, so React
  // StrictMode's double-invoke (see diary-home-error) does not apply.
  {
    id: 'export-sheet-error',
    screen: 'Export sheet',
    route: '/',
    open: ['Export your record', 'Request a PDF export'],
    viewport: 'desktop',
    state: 'error',
    ready: 'Something went wrong.',
    scenario: {
      source: 'fake',
      me: JANE,
      frameworks: [LA_TROBE_FRAMEWORK],
      gigs: [GIG],
      reflections: [REFLECTION_SUBMITTED],
      fault: {
        route: 'POST /exports',
        fault: {
          kind: 'error',
          status: 500,
          code: 'VALIDATION_FAILED',
          message: 'Something went wrong.',
        },
      },
    },
  },

  // -- Review queue (CAP-10) ----------------------------------------------
  // GET /review-queue (ReviewQueueController::index), scoped to the caller's
  // own role server-side -- nothing in the route or the fixture asserts
  // that. Loaded shots are real-sourced; the other states below are fake
  // (CAP-21). "Score this →" is ReviewQueueRow's own link into the assessor
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
  // Loading/empty/error are fake-sourced. fake-api.ts has no populated
  // GET /review-queue fixture of its own (the `loaded` shots above are
  // real-sourced instead) -- it always answers 200 [], which is exactly
  // this screen's own empty shape, and is enough of a base for hold()/
  // fail() to intercept ahead of it for the other two.
  {
    id: 'review-queue-loading',
    screen: 'Review queue',
    route: '/review-queue',
    viewport: 'desktop',
    state: 'loading',
    scenario: {
      source: 'fake',
      me: SAM,
      frameworks: [LA_TROBE_FRAMEWORK],
      hold: 'GET /review-queue',
    },
  },
  // Empty is `entries.length === 0` (ReviewQueue.tsx around line 62) ->
  // "Nothing is waiting on you right now."
  {
    id: 'review-queue-empty',
    screen: 'Review queue',
    route: '/review-queue',
    viewport: 'desktop',
    state: 'empty',
    ready: 'Nothing is waiting on you right now.',
    scenario: {
      source: 'fake',
      me: SAM,
      frameworks: [LA_TROBE_FRAMEWORK],
    },
  },
  // Same StrictMode-vs-fail() mount-effect gap as diary-home-error -- see
  // that entry's comment. `times: 2` for the same reason.
  {
    id: 'review-queue-error',
    screen: 'Review queue',
    route: '/review-queue',
    viewport: 'desktop',
    state: 'error',
    ready: 'Something went wrong.',
    scenario: {
      source: 'fake',
      me: SAM,
      frameworks: [LA_TROBE_FRAMEWORK],
      fault: {
        route: 'GET /review-queue',
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
  // No FRAMEWORK_IN_USE error-state demo here (final-review finding, HO-6):
  // docs/openapi.yaml declares FRAMEWORK_IN_USE only on the three PATCH
  // routes a save makes (updateFramework, updateCompetency, updateLevel),
  // never on GET /frameworks or GET /frameworks/{framework_id}, which are
  // the only routes Select Framework's and Edit Framework's own loads call
  // and the only kind of request this tool drives (Global Constraints: a
  // real-API shot is a read-only navigation the screen already makes to
  // render itself). Faulting the list route with a 409 the contract never
  // lets it return would depict a state the real backend cannot reach --
  // see README.md's coverage section for the one-sentence version.
  //
  // Loading/empty/error are fake-sourced, as DR_LEE (the supervisor
  // identity, CAP-15/CAP-16).
  {
    id: 'select-framework-loading',
    screen: 'Select framework',
    route: '/frameworks',
    viewport: 'desktop',
    state: 'loading',
    scenario: {
      source: 'fake',
      me: DR_LEE,
      frameworks: [LA_TROBE_FRAMEWORK],
      hold: 'GET /frameworks',
    },
  },
  // Empty is `templates.length === 0 && copies.length === 0`
  // (SelectFramework.tsx's own LoadedState, around line 110) ->
  // "No rubrics yet." -- the whole list empty, not either group, per that
  // function's own comment. Only reachable with an unseeded-shaped fixture
  // (the audit's own finding: a seeded database always has templates).
  {
    id: 'select-framework-empty',
    screen: 'Select framework',
    route: '/frameworks',
    viewport: 'desktop',
    state: 'empty',
    ready: 'No rubrics yet.',
    scenario: {
      source: 'fake',
      me: DR_LEE,
      frameworks: [],
    },
  },
  // Same StrictMode-vs-fail() mount-effect gap as diary-home-error -- see
  // that entry's comment. `times: 2` for the same reason.
  {
    id: 'select-framework-error',
    screen: 'Select framework',
    route: '/frameworks',
    viewport: 'desktop',
    state: 'error',
    ready: 'Something went wrong.',
    scenario: {
      source: 'fake',
      me: DR_LEE,
      frameworks: [LA_TROBE_FRAMEWORK],
      fault: {
        route: 'GET /frameworks',
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

  // -- Edit framework (CAP-16) ---------------------------------------------
  // GET /frameworks then GET /frameworks/{framework_id} (EditFramework.tsx,
  // Promise.all), the latter keyed by the route param. Loaded-only for the
  // real shot; "Based on" is the base-picker's own label, rendered only once
  // load.status === 'loaded', regardless of whether the base framework turns
  // out to have competencies to rename -- the "Copy and edit a rubric" h1
  // above it renders in every status (same trap as the other screens' own
  // h1s in this file), so it cannot be the wait target.
  //
  // Needs SHOTS_FRAMEWORK_ID (see SHOTS_FRAMEWORK_ID above) alongside
  // SHOTS_SUPERVISOR_TOKEN -- skips cleanly with either unset.
  {
    id: 'edit-framework-loaded',
    screen: 'Edit framework',
    route: `/frameworks/${SHOTS_FRAMEWORK_ID}/edit`,
    viewport: 'desktop',
    state: 'loaded',
    ready: 'Based on',
    scenario: { source: 'real', slot: 'supervisor', requires_env: ['SHOTS_FRAMEWORK_ID'] },
  },
  {
    id: 'edit-framework-loaded-mobile',
    screen: 'Edit framework',
    route: `/frameworks/${SHOTS_FRAMEWORK_ID}/edit`,
    viewport: 'mobile',
    state: 'loaded',
    ready: 'Based on',
    scenario: { source: 'real', slot: 'supervisor', requires_env: ['SHOTS_FRAMEWORK_ID'] },
  },
  // Loading/empty/error are fake-sourced, as DR_LEE. EditFramework.tsx
  // fetches GET /frameworks and GET /frameworks/{framework_id} together
  // (Promise.all); holding/failing the by-id route is enough for all three,
  // since neither call waits on the other.
  {
    id: 'edit-framework-loading',
    screen: 'Edit framework',
    route: `/frameworks/${LA_TROBE_FRAMEWORK.id}/edit`,
    viewport: 'desktop',
    state: 'loading',
    scenario: {
      source: 'fake',
      me: DR_LEE,
      frameworks: [LA_TROBE_FRAMEWORK],
      hold: 'GET /frameworks/:id',
    },
  },
  // Empty is `base.competencies.length === 0` (Editor, EditFramework.tsx
  // around line 253) -> "Nothing to rename." EMPTY_FRAMEWORK is the one
  // fixture shaped for it -- see fixtures.ts's own comment on why this is
  // reachable only by a broken or hand-edited row, not by normal use.
  {
    id: 'edit-framework-empty',
    screen: 'Edit framework',
    route: `/frameworks/${EMPTY_FRAMEWORK.id}/edit`,
    viewport: 'desktop',
    state: 'empty',
    ready: 'Nothing to rename.',
    scenario: {
      source: 'fake',
      me: DR_LEE,
      frameworks: [EMPTY_FRAMEWORK],
    },
  },
  // Same StrictMode-vs-fail() mount-effect gap as diary-home-error -- see
  // that entry's comment. `times: 2` for the same reason.
  {
    id: 'edit-framework-error',
    screen: 'Edit framework',
    route: `/frameworks/${LA_TROBE_FRAMEWORK.id}/edit`,
    viewport: 'desktop',
    state: 'error',
    ready: 'Something went wrong.',
    scenario: {
      source: 'fake',
      me: DR_LEE,
      frameworks: [LA_TROBE_FRAMEWORK],
      fault: {
        route: 'GET /frameworks/:id',
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

  // -- Sign in (masking demonstration) ------------------------------------
  // This is the actual sign-in screen the product uses (ADR #15: no login
  // screen in the traditional sense; tokens are pasted here). Demonstrates
  // the `mask` field (criterion 3) by rendering the token form and masking
  // the token input field (id="token-input") so the screenshot shows where
  // to paste without revealing an actual token. The form only appears after
  // clicking a chip to select which role's token to enter.
  //
  // `no_token` (final-review finding, HO-6): FakeApi.install() always plants
  // a placeholder token, so without this the session effect fires GET
  // /auth/me on mount and a faulted 401 there evicts it, landing back on
  // TokenGate with its "That token was rejected" banner showing -- a
  // confusing figure for "how to sign in". `no_token` has capture.spec.ts
  // clear what install() planted before the app ever reads it, so no request
  // is made at all and TokenGate renders its clean, first-run state instead.
  // `fill` puts a dummy value in the input once it opens, so the masked box
  // in the screenshot covers real-looking content rather than an empty field.
  {
    id: 'token-entry-masked',
    screen: 'Sign in',
    route: '/',
    open: 'Student +',
    viewport: 'desktop',
    state: 'loaded',
    ready: 'Paste the student token',
    scenario: {
      source: 'fake',
      me: JANE,
      frameworks: [],
      reflections: [],
      gigs: [],
      no_token: true,
    },
    fill: [{ selector: '#token-input', value: '1|dGhpcyBpcyBub3QgYSByZWFsIHRva2Vu' }],
    mask: ['#token-input'],
  },
];
