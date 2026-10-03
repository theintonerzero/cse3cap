# HO-6: Automated Screenshot Capture with Playwright — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A repeatable Playwright-driven tool, run as `./run shots`, that captures every screen of the Reflection Diary in every state it can be reached in, for the User Manual and the SMD, without ever writing to the shared database.

**Architecture:** A second, separate Playwright config (`web/playwright.shots.config.ts`) that is explicitly excluded from the CI-facing config (`web/playwright.config.ts`). One generic, data-driven test (`web/e2e/shots/capture.spec.ts`) iterates a manifest (`web/e2e/shots/manifest.ts`) of shot descriptions; each entry says which screen, which state, which viewport, and whether to hit the real seeded API (read-only screens) or the fake one (write flows, and every loading/empty/error state, so the shared database is never touched). A self-contained fixture module (`web/e2e/shots/fixtures.ts`) supplies the fake-API scenarios; real-API shots read a seeded token from an environment variable per role, exactly as `VITE_API_TOKEN` already works for local dev, and skip themselves — never fail the run — when that variable is absent, matching every existing `scripts/verify-*.sh`'s "the live half skips rather than fails."

**Tech Stack:** `@playwright/test` 1.63.0 (already pinned in `web/package.json`), the existing `web/e2e/fake-api.ts` (`FakeApi`, `hold()`, `fail()`), the existing `SkeletonGroup`'s `role="status"` as the universal loading-state locator, `page.clock` for a fixed clock, `page.emulateMedia` + an injected stylesheet for animations-off.

**Spec:** COA4-102 (HO-6 · Automated screenshot capture with Playwright). Acceptance criteria, verbatim from the ticket:
1. A separate Playwright config outside the CI test run, and a `./run shots` target that writes PNGs named by figure number.
2. Read-only screens are captured against the real seeded API. Write flows, and the empty, error and loading states, are captured against the fake API, so the shared database is never written to.
3. Fixed clock, animations off, `deviceScaleFactor` 2, and anything sensitive masked.
4. Desktop and mobile viewport for each screen.
5. Run once after the UI freeze on Wednesday 7 October, then again before submission.

The ticket also links a Google Doc shot list (`https://docs.google.com/document/d/1FD7ChOtsMn7cwtHmCDcP-WFtB0lcXyu9FFJ-3Dlgbx4/edit`). It is auth-gated; it could not be read to build this plan. **This plan does not guess at real figure numbers.** Every shot id below is a descriptive stem (`diary-home-loaded`, not `figure-14`); `web/e2e/shots/README.md` (Task 5) says this plainly and gives the one place to rename them once the real doc is available.

## Global Constraints

- Never write to the shared database. Every write-flow screen and every non-`loaded` state goes through the fake API, per criterion 2. Real-API shots are `loaded`-state, read-only navigations only (`GET` requests the screen already makes to render itself).
- `web/e2e/shots/**` must never run under `./run e2e`, `npm run test:e2e`, or `./run check`. Those all resolve to `web/playwright.config.ts`, whose `testDir` is `./e2e`; without an explicit exclusion it would pick up `shots/capture.spec.ts` too.
- No hardcoded bearer token anywhere in committed code. Real-API shots read `process.env.SHOTS_<SLOT>_TOKEN`; the actual token values live only in a developer's own environment or `web/.env` (gitignored), exactly as `VITE_API_TOKEN` already does.
- Snake_case, no raw hex or pixel literals introduced (this plan adds no UI, only test/tooling code, so this mostly doesn't apply, but `web/e2e/shots/README.md` and any comments follow the repository's existing tone).
- Windows: `./run shots` (bash) is the primary target; `run.ps1` gets a matching entry that tells a PowerShell user to use Git Bash, mirroring the existing `smoke`/`verify` entries there — `run.ps1` has no `e2e` case at all today, so no Playwright command works from pure PowerShell yet, and fixing that gap is not this ticket's job.

---

## Task 1: The shots pipeline — config, run target, helpers, generic runner, one proving shot

This task builds the entire mechanism and proves it end-to-end with exactly one shot: the CAP-12 Submitted screen, loaded, against the fake API. Every later task only adds manifest entries and fixture data; nothing about the runner itself should need to change again.

**Files:**
- Create: `web/playwright.shots.config.ts`
- Modify: `web/playwright.config.ts` (exclude `e2e/shots/**`)
- Create: `web/e2e/shots/helpers.ts`
- Create: `web/e2e/shots/fixtures.ts`
- Create: `web/e2e/shots/manifest.ts`
- Create: `web/e2e/shots/capture.spec.ts`
- Modify: `run` (add a `shots` case)
- Modify: `run.ps1` (add a matching `shots` case that fails with a clear pointer, per the `smoke`/`verify` pattern)

**Interfaces:**
- Produces: `Shot` type, `SHOTS: Shot[]` from `manifest.ts` — every later task appends to this array.
- Produces: `freeze_clock(page)`, `disable_animations(page)`, `sign_in_real(page, slot, token)` from `helpers.ts` — every later task's manifest entries rely on these already being wired into `capture.spec.ts`; no later task calls them directly.
- Produces: `SHOTS_OUT = web/e2e/shots/output/` — the directory every PNG lands in, named `${shot.id}.png`.

- [ ] **Step 1: Read the two existing Playwright surfaces this depends on**

Read `web/playwright.config.ts` in full and `web/e2e/fake-api.ts` lines 1–160 (the `FakeApi` class through its `handle()` method, in particular `hold()` at line 91 and `install()` at line 115). Confirm for yourself: `hold(route)` returns a release function and holds every response on that route key until it is called; `install(page)` wires `page.route('**/api/v1/**', ...)` and seeds `sessionStorage` with a supervisor-slot placeholder token — the slot label is cosmetic (`web/src/session/tokens.ts`'s own comment: "NOTHING HERE DECIDES WHAT A USER MAY DO... A label is a hint about which token to paste, never a role"), so which `Me` object the fake returns from `GET /auth/me` is the only thing that decides what renders, not the slot. This is why `capture.spec.ts` below never needs to touch `install()`'s signature.

- [ ] **Step 2: Write the shots Playwright config**

```typescript
// web/playwright.shots.config.ts
/**
 * The screenshot-capture config for HO-6, separate from playwright.config.ts
 * (ADR #42) on purpose: this one is never run by CI or by ./run check, only
 * by ./run shots. See web/e2e/shots/README.md for when to run it and how the
 * figure numbering works.
 */
import { defineConfig, devices } from '@playwright/test';

const PORT = 5176;
const ORIGIN = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './e2e/shots',
  fullyParallel: false, // real-API shots share one signed-in session per test; keep runs predictable
  retries: 0,
  reporter: 'list',
  timeout: 30_000,
  use: {
    baseURL: ORIGIN,
    deviceScaleFactor: 2,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', use: { ...devices['Desktop Chrome'], viewport: { width: 360, height: 800 } } },
  ],
  webServer: {
    command: `npx vite --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: ORIGIN,
    reuseExistingServer: false,
    env: {
      // No VITE_API_TOKEN: fake-API shots sign themselves in via
      // sessionStorage (FakeApi.install / sign_in_real), and real-API shots
      // need the real backend on :8000, which this dev server proxies to
      // exactly as web/vite.config.ts already configures for ./run web.
      VITE_API_TOKEN: '',
    },
  },
});
```

Check `web/vite.config.ts` for how it resolves `VITE_API_BASE_URL` / whether it proxies `/api/v1` to `:8000` in dev. If it does not already proxy, real-API shots need `VITE_API_BASE_URL=http://127.0.0.1:8000/api/v1` added to the `env` block above instead of relying on a proxy — read the file before assuming either way, and use whichever the existing dev setup (`./run web`) actually relies on, so shots behaves identically to a developer's own `npm run dev`.

- [ ] **Step 3: Exclude `e2e/shots/**` from the CI-facing config**

In `web/playwright.config.ts`, add `testIgnore` next to the existing `testDir`:

```typescript
export default defineConfig({
  testDir: './e2e',
  testIgnore: ['**/shots/**'],
  fullyParallel: true,
  ...
```

- [ ] **Step 4: Verify the exclusion**

Run: `cd web && npx playwright test --config=playwright.config.ts --list`
Expected: the list includes `edit-framework.spec.ts`, `submitted.spec.ts`, `injection.spec.ts` and nothing under `shots/`.

- [ ] **Step 5: Write the shared helpers**

```typescript
// web/e2e/shots/helpers.ts
/**
 * Shared setup every shot in capture.spec.ts applies, regardless of manifest
 * entry: a fixed clock (HO-6 criterion 3, so two runs of the same shot
 * produce the same pixels), animations off (ditto), and signing in against
 * the REAL backend for a read-only shot (fake-API sign-in is FakeApi.install
 * itself, called directly in capture.spec.ts -- this file only covers the
 * real-API half).
 */
import type { Page } from '@playwright/test';
import type { SlotId } from '../../src/session/tokens.ts';

/** Same instant on every run. Chosen after every seeded sprint's date, so
 *  relative wording ("due in 3 days") on real-API shots reads the way it
 *  will on the day the shots are actually taken, not as if time has stopped
 *  on some day already known to be in the past for every seeded gig. */
export const SHOTS_CLOCK = '2026-10-07T09:00:00Z';

export async function freeze_clock(page: Page): Promise<void> {
  await page.clock.install({ time: new Date(SHOTS_CLOCK) });
}

export async function disable_animations(page: Page): Promise<void> {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    const style = document.createElement('style');
    style.textContent =
      '*, *::before, *::after { animation-duration: 0s !important; animation-delay: 0s !important; transition-duration: 0s !important; transition-delay: 0s !important; }';
    document.head.appendChild(style);
  });
}

/**
 * Signs the page in against the REAL API as a real seeded user. The token
 * itself never appears in this file or anywhere else in the repository: it
 * is read from the environment at run time, the same convention
 * VITE_API_TOKEN already uses for local dev (see web/README.md and
 * /add-screen). A shot with no token set for its slot is not this
 * function's problem to solve -- capture.spec.ts skips the test before
 * calling this, per the existing scripts/verify-*.sh "the live half skips
 * rather than fails" convention.
 */
export async function sign_in_real(page: Page, slot: SlotId, token: string): Promise<void> {
  await page.addInitScript(
    ([slot, token]) => {
      const slots = { student: null, assessor: null, supervisor: null };
      (slots as Record<string, string | null>)[slot] = token;
      sessionStorage.setItem('reflection-diary-tokens', JSON.stringify(slots));
      sessionStorage.setItem('reflection-diary-active-slot', slot);
    },
    [slot, token] as [string, string],
  );
}

/** The env var a real-API shot for this slot reads its token from. */
export function token_env_var(slot: SlotId): string {
  return `SHOTS_${slot.toUpperCase()}_TOKEN`;
}
```

- [ ] **Step 6: Write the minimal shots-only fixture data**

This is deliberately its own module, not a reuse of `web/e2e/fixtures.ts`: that file's `DR_LEE`, framework details and reflection summaries are module-private consts scoped to the CI specs that need a supervisor-only world. Shots needs its own small roster (a student scenario for Submitted today; later tasks add an assessor and a second supervisor scenario), and coupling two independent test suites to the same private constants is exactly the kind of drift CLAUDE.md's "never duplicate" is about avoiding -- these are two different concerns (proving a screen's behaviour vs. capturing its appearance) that happen to both need a fake `Me`.

```typescript
// web/e2e/shots/fixtures.ts
/**
 * Self-contained fake-API scenarios for shots, independent of
 * web/e2e/fixtures.ts (which is scoped to the CI specs' own needs). Every id
 * here uses the 'ffff' prefix reserved for throwaway data in
 * web/e2e/fixtures.ts's own convention (NOWHERE), so a shots id can never
 * collide with a real seeded id or a CI fixture id.
 */
import type { components } from '../../src/api/schema.ts';
import type { FrameworkDetail, GigDetail, ReflectionSummary } from '../fake-api.ts';

type Me = components['schemas']['Me'];

export const JANE: Me = {
  id: 'ffff1111-0000-4fff-8fff-ffffffffffff',
  display_name: 'Jane',
  participations: [
    {
      gig_id: 'ffff1111-0a01-4fff-8fff-ffffffffffff',
      gig_title: 'La Trobe capstone',
      role: 'student',
    },
  ],
};

export const LA_TROBE_FRAMEWORK: FrameworkDetail = {
  id: 'ffff1111-0f01-4fff-8fff-ffffffffffff',
  fw_key: 'shots-la-trobe',
  name: 'La Trobe capstone rubric',
  based_on_id: null,
  in_use: true,
  scale: { min: 1, max: 4 },
  competencies: [
    {
      id: 'ffff1111-0c01-4fff-8fff-ffffffffffff',
      code: 'COMM',
      name: 'Communication',
      levels: [
        { level: 1, descriptor: 'Rarely shares progress unprompted.' },
        { level: 2, descriptor: 'Shares progress when asked.' },
        { level: 3, descriptor: 'Shares progress and blockers proactively.' },
        { level: 4, descriptor: 'Keeps the whole team aligned without being asked.' },
      ],
    },
  ],
};

export const GIG: GigDetail = {
  id: 'ffff1111-0a01-4fff-8fff-ffffffffffff',
  title: 'La Trobe capstone',
  framework_id: LA_TROBE_FRAMEWORK.id,
  participants: [
    { user_id: JANE.id, display_name: 'Jane', role: 'student' },
    { user_id: 'ffff1111-0002-4fff-8fff-ffffffffffff', display_name: 'Sam O', role: 'assessor' },
  ],
  sprints: [
    {
      id: 'ffff1111-0s01-4fff-8fff-ffffffffffff',
      ordinal: 1,
      starts_on: '2026-08-01',
      ends_on: '2026-08-14',
    },
    {
      id: 'ffff1111-0s02-4fff-8fff-ffffffffffff',
      ordinal: 2,
      starts_on: '2026-08-15',
      ends_on: '2026-08-28',
    },
  ],
};

export const REFLECTION_SUBMITTED: ReflectionSummary = {
  id: 'ffff1111-0b01-4fff-8fff-ffffffffffff',
  gig_id: GIG.id,
  sprint_id: GIG.sprints[0].id,
  sprint_ordinal: 1,
  status: 'submitted',
  framework_id: LA_TROBE_FRAMEWORK.id,
};
```

Before trusting the shapes above, read `web/src/api/schema.ts` for `GigDetail`, `FrameworkDetail` and `ReflectionSummary` and correct any field this plan guessed wrong -- this plan was written without the generated types open, and the generated schema is the one source of truth for exact field names (CLAUDE.md: "never invent a column or an endpoint"). Fix the fixture to match the real schema before moving on; do not fix the schema to match the fixture.

- [ ] **Step 7: Write the manifest with its one entry**

```typescript
// web/e2e/shots/manifest.ts
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

import { GIG, JANE, LA_TROBE_FRAMEWORK, REFLECTION_SUBMITTED } from './fixtures.ts';

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
];
```

- [ ] **Step 8: Write the generic capture runner**

```typescript
// web/e2e/shots/capture.spec.ts
/**
 * One generic test per manifest entry (web/e2e/shots/manifest.ts). Adding a
 * screenshot is adding a Shot, never adding a test.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';

import { FakeApi } from '../fake-api.ts';
import { SHOTS } from './manifest.ts';
import { disable_animations, freeze_clock, sign_in_real, token_env_var } from './helpers.ts';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'output');
fs.mkdirSync(OUT, { recursive: true });

for (const shot of SHOTS) {
  test(`${shot.screen} — ${shot.state} — ${shot.viewport}: ${shot.id}`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== shot.viewport, `${shot.id} is a ${shot.viewport} shot`);

    await freeze_clock(page);
    await disable_animations(page);

    let release: (() => void) | undefined;

    if (shot.scenario.source === 'fake') {
      const api = new FakeApi(
        shot.scenario.frameworks,
        shot.scenario.me,
        shot.scenario.gigs ?? [],
        shot.scenario.reflections ?? [],
      );
      if (shot.scenario.fault) api.fail(shot.scenario.fault.route, shot.scenario.fault.fault);
      if (shot.scenario.hold) release = api.hold(shot.scenario.hold);
      await api.install(page);
    } else {
      const token = process.env[token_env_var(shot.scenario.slot)];
      test.skip(!token, `${token_env_var(shot.scenario.slot)} is not set -- skipping a real-API shot`);
      await sign_in_real(page, shot.scenario.slot, token!);
    }

    await page.goto(shot.route);

    if (shot.state === 'loading') {
      await expect(page.getByRole('status').first()).toBeVisible();
    } else {
      await expect(page.getByText(shot.ready!)).toBeVisible();
    }

    await page.screenshot({
      path: path.join(OUT, `${shot.id}.png`),
      fullPage: true,
      mask: (shot.mask ?? []).map((selector) => page.locator(selector)),
    });

    release?.();
  });
}
```

- [ ] **Step 9: Wire `./run shots`**

In `run`, add a case alongside `e2e`:

```bash
    # HO-6: screenshots for the User Manual and SMD, against a separate
    # config so this never runs under CI or ./run check. Writes PNGs to
    # web/e2e/shots/output/, named by web/e2e/shots/manifest.ts's ids --
    # see web/e2e/shots/README.md for what those ids mean and when to run
    # this for real (after the UI freeze on 7 Oct, then again before
    # submission).
    shots)
        need_web_deps
        in_dir web npx playwright install chromium
        shift
        in_dir web npx playwright test --config=playwright.shots.config.ts ${@+"$@"}
        ;;
```

In `run.ps1`, add a matching case next to `smoke`/`verify`:

```powershell
    'shots' { Fail 'shots needs bash. Use Git Bash or WSL: ./run shots' }
```

Add one line to `run`'s `help` block and `run.ps1`'s `default` block, matching the existing `e2e` line's style.

- [ ] **Step 10: Run it and see the one shot succeed**

Run: `./run shots`
Expected: `web/e2e/shots/output/submitted-loaded.png` is written, one test passes on the `desktop` project, and the `mobile` project's copy of the same test is skipped (`test.skip` on the project mismatch).

- [ ] **Step 11: Confirm the CI config truly ignores it**

Run: `./run e2e`
Expected: the existing suite runs exactly as before (same pass count as on `dev` before this task), and `shots/capture.spec.ts` does not appear anywhere in the output.

- [ ] **Step 12: Commit**

```bash
git add web/playwright.shots.config.ts web/playwright.config.ts web/e2e/shots run run.ps1
git commit -m "feat(web): screenshot capture pipeline for the user manual (HO-6)"
```

---

## Task 2: Student-facing screens — Diary home, Gig detail, Entry stepper, History sheet, Export sheet

Adds manifest entries and (where fake) fixtures for the rest of the student-visible screens. `loaded` state: real API for the read-only screens (Diary home, Gig detail, History sheet), fake for the write-flow ones (Entry stepper, Export sheet). This task also adds full `loading` + `empty` + `error` coverage for **Diary home** and **Entry stepper**, as the two worked examples proving those three states generalise to every screen — later tasks and future manifest entries repeat the same three fake-API techniques (`hold()`, empty arrays, `fail()`) rather than inventing new ones.

**Files:**
- Modify: `web/e2e/shots/fixtures.ts` (add an Entry-stepper-shaped reflection with entries, an empty-gig scenario)
- Modify: `web/e2e/shots/manifest.ts` (append entries)
- Test: the same `web/e2e/shots/capture.spec.ts` from Task 1, unchanged

**Interfaces:**
- Consumes: `Shot`, `FakeScenario`, `RealScenario` from Task 1's `manifest.ts`; `JANE`, `GIG`, `LA_TROBE_FRAMEWORK` from Task 1's `fixtures.ts`.
- Produces: nothing new later tasks depend on — Task 3 adds its own screens independently.

- [ ] **Step 1: Read each screen's data-loading code**

Open `web/src/screens/DiaryHome.tsx`, `web/src/screens/GigDetail.tsx`, `web/src/screens/EntryStepper.tsx`, `web/src/screens/HistorySheet.tsx` and `web/src/screens/ExportSheet.tsx`. For each, note down:
- the exact `api.get(...)` path(s) it calls on mount (this is the `route` key `hold()`/`fail()` need — it must match `fake-api.ts`'s generalised key format, e.g. `GET /reflections` or `GET /gigs/:id`, which you can confirm against `fake-api.ts`'s own `handle()` method's `key` construction),
- the exact condition that renders the empty state (what does it check — an empty array? a specific field?),
- one literal string visible only once data has loaded, to use as `ready`.

This step has no code of its own; its output is the concrete values Step 2 uses. Do not guess these — a wrong route key means `hold()`/`fail()` silently never fires (the fake still answers normally) and the loading/error shot is actually the loaded shot with a misleading name.

- [ ] **Step 2: Add the fixtures the new scenarios need**

Extend `web/e2e/shots/fixtures.ts` with whatever Step 1 showed is missing — at minimum, a `ReflectionDetail` (not just a summary) carrying entries for the Entry Stepper's `loaded` shot, built the same way Task 1's `REFLECTION_SUBMITTED` was: read the real field names off `schema.ts`'s `ReflectionDetail`, do not invent them. Also add an `EMPTY_GIG: GigDetail` with no sprints/reflections for Diary Home's empty-state shot.

- [ ] **Step 3: Append the manifest entries**

Using the exact `route`, `ready` and empty-condition values Step 1 found, append to `SHOTS` in `manifest.ts`, following this shape for each (shown for Diary Home; repeat the identical shape for Gig detail, Entry Stepper, History sheet and Export sheet, substituting each screen's own route/state/source per the Global Constraints' read-only-vs-write-flow rule):

```typescript
  {
    id: 'diary-home-loaded',
    screen: 'Diary home',
    route: '/',
    viewport: 'desktop',
    state: 'loaded',
    ready: '<the literal string Step 1 found>',
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
      hold: '<the route key Step 1 found>',
    },
  },
  {
    id: 'diary-home-empty',
    screen: 'Diary home',
    route: '/',
    viewport: 'desktop',
    state: 'empty',
    ready: '<the literal empty-state string Step 1 found>',
    scenario: { source: 'fake', me: JANE, frameworks: [LA_TROBE_FRAMEWORK], gigs: [] },
  },
  {
    id: 'diary-home-error',
    screen: 'Diary home',
    route: '/',
    viewport: 'desktop',
    state: 'error',
    ready: '<the literal error-state string Step 1 found, or the generic ErrorNotice fallback text if the screen does not special-case any code>',
    scenario: {
      source: 'fake',
      me: JANE,
      frameworks: [LA_TROBE_FRAMEWORK],
      gigs: [GIG],
      fault: { route: '<the route key Step 1 found>', fault: { kind: 'error', status: 500, code: '<a real ErrorCode from schema.ts>', message: 'Something went wrong.' } },
    },
  },
```

Add a `mobile` copy of each `loaded` entry (same scenario, `viewport: 'mobile'`) to satisfy criterion 4 — `loading`/`empty`/`error` do not need a mobile copy for every screen; two states × two viewports on the worked examples (Diary Home, Entry Stepper) is enough to prove the mechanism, and the README (Task 5) says exactly that this is deliberately not exhaustive yet.

For Entry Stepper, both modes are separate screens for this purpose (they render differently): add `entry-stepper-student-loaded` and `entry-stepper-assessor-loaded` as two entries, routed at `/reflections/:id` and `/review-queue/reflections/:id` respectively (from `web/src/app/routes.tsx`), both `source: 'fake'` since both are write-flow screens per the Global Constraints.

- [ ] **Step 4: Run it**

Run: `./run shots`
Expected: every new `state: 'fake'`-sourced entry's PNG appears in `web/e2e/shots/output/`. The `real`-sourced entries (`diary-home-loaded`, `gig-detail-loaded`, `history-sheet-loaded`) are skipped with a clear "SHOTS_STUDENT_TOKEN is not set" message rather than failing — this is expected with no token in the environment yet; Task 4 covers actually exercising that path.

- [ ] **Step 5: Commit**

```bash
git add web/e2e/shots
git commit -m "feat(web): student-screen shots — diary home, gig detail, entry stepper, history, export (HO-6)"
```

---

## Task 3: Assessor and supervisor screens — Review queue, Entry stepper (assessor mode already added in Task 2), Select framework, Edit framework

**Files:**
- Modify: `web/e2e/shots/fixtures.ts` (add an assessor `Me` and a supervisor `Me`, an in-use framework fixture for the 409 demonstration)
- Modify: `web/e2e/shots/manifest.ts` (append entries)

**Interfaces:**
- Consumes: the same `Shot` shape from Task 1.

- [ ] **Step 1: Read Review Queue, Select Framework and Edit Framework's data-loading code**

Same exercise as Task 2 Step 1: open `web/src/screens/ReviewQueue.tsx`, `web/src/screens/SelectFramework.tsx`, `web/src/screens/EditFramework.tsx`. Note each one's load route, empty condition, and a `ready` string.

- [ ] **Step 2: Add an assessor and a supervisor `Me` to fixtures.ts**

```typescript
export const SAM: Me = {
  id: 'ffff1111-0002-4fff-8fff-ffffffffffff',
  display_name: 'Sam O',
  participations: [{ gig_id: GIG.id, gig_title: GIG.title, role: 'assessor' }],
};

export const DR_LEE: Me = {
  id: 'ffff1111-0003-4fff-8fff-ffffffffffff',
  display_name: 'Dr Lee',
  participations: [{ gig_id: GIG.id, gig_title: GIG.title, role: 'supervisor' }],
};
```

Confirm the `participations` field name and shape against `schema.ts`'s `Me`, the same way Task 1 Step 6 required — this plan's earlier `Me` objects already need that check; do not repeat the mistake here if one was found there.

- [ ] **Step 3: Append manifest entries**

Following the exact pattern from Task 2 Step 3, add `review-queue-loaded` (`source: 'real'`, `slot: 'assessor'`), `select-framework-loaded` and `edit-framework-loaded` (both `source: 'real'`, `slot: 'supervisor'`), each with a `mobile` copy. Add one `error` demonstration on Select Framework using a real business rule the fake is allowed to inject by name (ADR #42): a 409 on attempting to treat an in-use framework as editable, `fault: { route: '<the route Step 1 found>', fault: { kind: 'error', status: 409, code: 'FRAMEWORK_IN_USE', message: 'This framework has reflections against it and cannot be edited directly.' } }` — confirm `FRAMEWORK_IN_USE` is the real code name in `docs/openapi.yaml` before using it verbatim.

- [ ] **Step 4: Run it**

Run: `./run shots`
Expected: the new fake-sourced entries produce PNGs; the new real-sourced entries skip cleanly with no `SHOTS_ASSESSOR_TOKEN`/`SHOTS_SUPERVISOR_TOKEN` set, same as Task 2's real entries.

- [ ] **Step 5: Commit**

```bash
git add web/e2e/shots
git commit -m "feat(web): assessor and supervisor screen shots (HO-6)"
```

---

## Task 4: The real-API path, actually exercised

Tasks 1–3 proved every real-sourced entry skips cleanly with no token. This task proves the other half of criterion 2 — that a real-sourced shot, given a real token, actually captures the real backend's response — using whichever seeded role's token is available in this environment.

**Files:**
- Test: `web/e2e/shots/capture.spec.ts` (no code change expected; this task is a verification task)
- Modify: `web/e2e/shots/README.md` is created here rather than Task 5 if Task 5 has not started yet — whichever lands first owns the file; do not create it twice.

- [ ] **Step 1: Check whether a live backend is reachable**

Run: `curl -fsS -o /dev/null http://localhost:8000/api/v1/auth/me 2>/dev/null; echo $?`
If the exit code is not `0` or `22`, there is no server on `:8000`. Start one with `./run api` in a separate terminal (needs `api/.env` and `api/vendor/` — if this worktree lacks them, follow the same setup `scripts/setup.sh` documents, copying `api/.env` from another already-configured checkout rather than inventing database credentials). This mirrors the exact check `./run smoke` and `./run swap` already perform before running.

- [ ] **Step 2: Get one seeded token**

`web/README.md`'s seeded-user table (referenced by `web/src/session/tokens.ts`'s own comment) names which printed token belongs to which role. Take Jane's (student) token from wherever it was recorded when the database was last seeded — never re-run `php artisan db:seed` to obtain one; CLAUDE.md is explicit that the database is shared and seeded data is fixed reference data. If no token is available and re-seeding would be needed to get one, stop here, say so, and treat this task as blocked rather than seeding a second time to manufacture a token.

- [ ] **Step 3: Run one real shot**

```bash
SHOTS_STUDENT_TOKEN='<Jane's token>' ./run shots -g diary-home-loaded
```

Expected: `diary-home-loaded.png` (and its mobile copy) are written from the real backend's actual response, not the fake's. Open the PNG and confirm it shows real seeded data (Jane's actual gigs), not placeholder text.

- [ ] **Step 4: Repeat for whichever other real-sourced entries this environment's available tokens cover**

Assessor and supervisor tokens follow the same `SHOTS_ASSESSOR_TOKEN` / `SHOTS_SUPERVISOR_TOKEN` pattern. Do not block finishing this task on having all three roles' tokens in hand right now — record in the PR description which slots were actually exercised and which were only proven to skip cleanly.

- [ ] **Step 5: Commit**

If Step 1 required no code change (the expected case), there is nothing to commit for this task beyond noting the verification result in the PR description. If Step 1's vite-proxy check back in Task 1 Step 2 turns out to have been wrong and needs a fix, commit that fix here with a message explaining what was wrong and how this task's real-token run surfaced it.

---

## Task 5: Manifest completeness check, masking demonstration, README

**Files:**
- Create: `web/e2e/shots/manifest.test.ts` (a plain Node/tsx script, not a Playwright test — it only inspects the manifest array, needs no browser)
- Create: `web/e2e/shots/README.md`
- Modify: `web/e2e/shots/manifest.ts` (add the masking demonstration entry)

**Interfaces:**
- Consumes: `SHOTS` from `manifest.ts`, `AppRoutes`'s route list from `web/src/app/routes.tsx` (read, not imported — see Step 1).

- [ ] **Step 1: Write a failing completeness check**

```typescript
// web/e2e/shots/manifest.test.ts
/**
 * A screen added to routes.tsx with no shot in the manifest is a screen
 * HO-6 silently stopped covering. This has no browser in it on purpose --
 * it is a plain assertion over the manifest and the router source, run with
 * `node --experimental-strip-types` (Node 24 ships this; web/package.json's
 * devDependencies already pin @types/node ^24), not through Playwright.
 */
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { SHOTS } from './manifest.ts';

const routes_source = readFileSync(new URL('../../src/app/routes.tsx', import.meta.url), 'utf8');

// Every static (non-dynamic-segment) path in routes.tsx that is not the
// catch-all or a Placeholder. This is intentionally a narrow regex over the
// known file shape, not a JSX parser: routes.tsx is small, hand-written and
// reviewed on every change, and this check's job is to catch a screen that
// forgot a shot, not to be a general-purpose router.
const routed_paths = [...routes_source.matchAll(/<Route\s+(?:index\s+)?path="([^"*]+)"/g)]
  .map((match) => match[1])
  .filter((path) => path !== '*');

const covered_ids = new Set(SHOTS.map((shot) => shot.id));
const covered_screens = new Set(SHOTS.map((shot) => shot.screen));

for (const path of routed_paths) {
  assert.ok(
    [...covered_screens].some((screen) => routes_source.includes(screen) || true),
    `no assertion target yet for ${path}`,
  );
}

assert.equal(covered_ids.size, SHOTS.length, 'two manifest entries share an id -- filenames would collide');

console.log(`${SHOTS.length} shots, ${covered_ids.size} unique ids, ${covered_screens.size} screens covered.`);
```

Run: `cd web && node --experimental-strip-types e2e/shots/manifest.test.ts`
Expected: FAIL or an unhelpful pass — the `routed_paths` loop above is deliberately incomplete (`|| true` always satisfies the assertion). Replace it now that you can see the actual list `routed_paths` produces:

- [ ] **Step 2: Make it a real check**

Read the printed `routed_paths` from Step 1's run. For each dynamic route (`gigs/:gig_id`, `reflections/:reflection_id`, etc.), decide which manifest `screen` name should exist for it (the same names Tasks 2 and 3 already used), and replace the loop with a real mapping:

```typescript
const SCREEN_FOR_ROUTE: Record<string, string> = {
  '': 'Diary home',
  'gigs/:gig_id': 'Gig detail',
  'reflections/:reflection_id': 'Entry stepper',
  'reflections/:reflection_id/submitted': 'Submitted confirmation',
  'review-queue': 'Review queue',
  'review-queue/reflections/:reflection_id': 'Entry stepper',
  frameworks: 'Select framework',
  'frameworks/:framework_id/edit': 'Edit framework',
};

for (const path of routed_paths) {
  const screen = SCREEN_FOR_ROUTE[path];
  assert.ok(screen, `routes.tsx has "${path}" with no entry in SCREEN_FOR_ROUTE -- add one`);
  assert.ok(covered_screens.has(screen), `"${screen}" (route "${path}") has no shot in the manifest yet`);
}
```

Run: `cd web && node --experimental-strip-types e2e/shots/manifest.test.ts`
Expected: PASS, printing the shot/screen counts. If History Sheet or Export Sheet are reached only via a `BottomSheet` rather than a route (per `routes.tsx`'s own comment that they are "not here" as routes), they will not appear in `routed_paths` at all and this check cannot cover them — note that gap in the README rather than forcing them into `SCREEN_FOR_ROUTE` with a fake path.

- [ ] **Step 3: Wire it into `./run shots`**

In `run`'s `shots)` case, run the completeness check before Playwright:

```bash
    shots)
        need_web_deps
        in_dir web node --experimental-strip-types e2e/shots/manifest.test.ts
        in_dir web npx playwright install chromium
        shift
        in_dir web npx playwright test --config=playwright.shots.config.ts ${@+"$@"}
        ;;
```

- [ ] **Step 4: Add the masking demonstration**

Add one manifest entry proving `mask` actually redacts something, on whichever screen in this codebase renders a token or credential-shaped value on screen — check `web/src/app/AppShell.tsx` or wherever the token-entry form lives (`TokenGate`, if that is its name) for the input's `name` or a stable selector, and add:

```typescript
  {
    id: 'token-entry-masked',
    screen: 'Sign in',
    route: '/',
    viewport: 'desktop',
    state: 'loaded',
    ready: '<the literal prompt text the token-entry screen shows>',
    scenario: { source: 'fake', me: JANE, frameworks: [], reflections: [], gigs: [] }, // no_token state: the fake never gets asked, TokenGate renders before any request
    mask: ['<the real selector for the token input, e.g. input[type="password"]>'],
  },
```

If no such screen exists in a form a screenshot would ever need (for instance, if the token-entry UI is dev-only tooling never meant for the manual), say so plainly in the README instead of manufacturing a shot for a screen nobody will ever put in the manual — do not force a masking demonstration to exist if there is genuinely nothing sensitive to mask yet. This is an acceptance criterion about the *mechanism* (`mask` works when used), not about every screen having one.

- [ ] **Step 5: Write the README**

```markdown
<!-- web/e2e/shots/README.md -->
# Screenshot capture (HO-6)

`./run shots` from the repository root. Writes PNGs to `web/e2e/shots/output/`,
one per entry in `manifest.ts`, named `${id}.png`.

## Figure numbers are not real yet

COA4-102 links a Google Doc shot list. It is access-restricted and could not
be read while building this tool, so every id here is a descriptive stem
(`diary-home-loaded`), not the doc's actual figure number. Once the doc is
readable, renaming is a one-line edit per entry in `manifest.ts` — the `id`
field is the only thing that needs to change; nothing else in the pipeline
cares what it is called.

## Real vs fake

Read-only screens (Diary home, Gig detail, Review queue, Select framework,
Edit framework, History sheet) capture their `loaded` state against the real
seeded API, so the manual shows real data. Every write-flow screen (Entry
stepper in both modes, Export sheet, Submitted) and every `loading` / `empty`
/ `error` state on any screen captures against the fake API instead, so
nothing this tool does ever writes to the shared database.

A real-API shot needs a seeded token in the environment: `SHOTS_STUDENT_TOKEN`,
`SHOTS_ASSESSOR_TOKEN`, `SHOTS_SUPERVISOR_TOKEN`. With none set, those shots
skip themselves with a clear message rather than failing the run — the same
convention every `scripts/verify-*.sh`'s live half already uses. Never
re-seed the database to obtain a token; take one already printed from the
last real seed run.

## Coverage today

Not every screen has all four states yet, and neither sheet (History,
Export) has a mobile copy of its `loaded` shot. `manifest.test.ts` only
enforces that every *routed* screen has at least one shot; it does not (and
cannot, without a JSX parser this tool deliberately doesn't carry) enforce
full state × viewport coverage. Extending coverage is adding entries to
`manifest.ts`, never touching `capture.spec.ts`.

## When to run this for real

Once, against the real seeded API, after the UI freeze on Wednesday 7
October. Again before submission, to catch anything that changed since.
```

- [ ] **Step 6: Run the full pipeline once more**

Run: `./run shots`
Expected: the completeness check passes, every fake-sourced shot's PNG is written, every real-sourced shot skips cleanly (or succeeds, if Task 4 left tokens in this shell's environment).

- [ ] **Step 7: Confirm `./run check` is still unaffected**

Run: `./run check`
Expected: passes exactly as it did before this plan started (module the two pre-existing, unrelated Windows gaps this repository's CLAUDE.md and prior sessions already documented — the two Python guard scripts' `subprocess` call and the missing `GD` PHP extension. Note their presence in the PR description if they reappear; do not attempt to fix either as part of this ticket).

- [ ] **Step 8: Commit**

```bash
git add web/e2e/shots run
git commit -m "test(web): manifest completeness check, masking demo, README (HO-6)"
```

---

## Self-Review Notes (from writing this plan)

**Spec coverage:** criterion 1 (config + run target) — Task 1. Criterion 2 (real/fake split) — Tasks 1–4. Criterion 3 (clock/animations/scale/masking) — Task 1 (clock, animations, scale) and Task 5 (masking). Criterion 4 (desktop+mobile) — Task 1's config projects, entries added per-screen in Tasks 2–3. Criterion 5 (when to run) — documented in the README (Task 5), not something a plan step can "do" today since 7 October has not happened yet.

**Known, stated gap:** the real figure numbers from the linked doc. Flagged in the plan header and in the README; not resolved by any task, because it cannot be without a human reading that doc and reporting back what it says.

**Known, stated scope decision:** full state × viewport coverage of every one of the ten screen/mode combinations is not attempted in one pass. Two screens (Diary Home, Entry Stepper) get the full loading/empty/error/mobile treatment as worked examples; the rest get their `loaded` shot (the one every screen unambiguously needs) plus a mobile copy. `manifest.test.ts` enforces the floor (every routed screen has *a* shot) without enforcing the ceiling (every screen has all four states in both viewports), and says so in its own read-out. This is a deliberate, stated scope call for this ticket's first PR, not a silently dropped requirement — the person reviewing HO-6's PR should see this stated plainly rather than discover it by noticing the manifest is shorter than nine screens times four states times two viewports.
