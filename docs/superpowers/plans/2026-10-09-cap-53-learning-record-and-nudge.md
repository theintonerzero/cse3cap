# CAP-53 · Learning record and the reflection nudge: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the two diary frames the prototype drew and the build left out: the "sprints
need your reflection" nudge on the diary home (Figma `66:34`) and the "Your learning record"
screen at `/record` (Figma `86:936`).

**Architecture:** Both are read-only views over endpoints the API already serves. The nudge is
a pure function in `gig-timing.ts` plus a card on `DiaryHome.tsx` that reuses the gig page's
Start reflection button, moved into its own file. The record is a new screen that reads
`GET /gigs`, `GET /reflections`, and per gig `GET /me/progress` and `GET /frameworks/{id}`,
and draws one competency by sprint table per gig.

**Tech Stack:** React 19, React Router, TypeScript, CSS modules over `web/src/tokens.css`,
Playwright against `web/e2e/fake-api.ts` (ADR #42), a bash and node check in
`scripts/verify-gig-detail.sh`.

**Spec:** `docs/superpowers/specs/2026-10-09-cap-53-learning-record-and-nudge-design.md`

## Global Constraints

- No change to `docs/openapi.yaml`, `db/01-schema.sql`, `api/`, or `web/src/api/schema.ts`.
- No business rule in `web/`: every score comes from `GET /me/progress`; never read
  `entries[].scores` to decide a number.
- No raw hex, no raw pixel values: tokens from `web/src/tokens.css` only. Self is
  `--color-primary`, assessor is `--color-success`.
- Every API call through `web/src/api/client.ts` (`api.get`, `api.post`).
- snake_case for variables and props, as the surrounding code does.
- Copy never says "overdue", "late" or "due" about the nudge.
- Four states on the new screen: loaded, loading (skeletons), empty, error.
- Fake API serves shapes, never rules. Analytics responses are served per spec with
  `page.route`, as `web/e2e/diary-home.spec.ts` does.
- Every spec asserts `api.unexpected` is empty.
- Branch `feat/CAP-53-portfolio-and-journey`, worktree
  `.claude/worktrees/feat+CAP-53-portfolio-and-journey`. Commit per task. Never push to `dev`.
- Refer to designs by their Figma frame (`86:936`, `66:34`), as `docs/Design-Inventory.md` does.
- Before each commit that touches `web/`: `cd web && npx prettier --write <files>`, and the
  task's lint step.

## Review Focus

1. **A gig whose framework is null** (no rubric assigned). The record must skip it, not crash
   on `gig.framework.id`. Task 4 tests it.
2. **A sprint whose progress has a self-score but no counter** (a submitted reflection), and a
   competency with no progress row at all. Both render "–" in the right half or the whole
   cell. Task 4 tests both.
3. **Reflections on a gig where the caller is an assessor.** `GET /reflections` returns them to
   a reviewer. Neither the nudge's "written" set nor the record may count them. Tasks 3 and 4
   use `reflections_in_scope`, which drops them, and test it.
4. **A sprint that opens today, or has no dates.** Both count as needing a reflection; one that
   opens tomorrow does not. Task 1 pins it.
5. **A phone 360 px wide with five sprints.** The table scrolls inside its card and the page
   does not scroll sideways. Task 4 tests it.

---

### Task 1: `sprints_needing_reflection` in gig-timing.ts

**Files:**

- Modify: `scripts/verify-gig-detail.sh` (the `check.mjs` heredoc, about lines 290-451)
- Modify: `web/src/screens/gig-timing.ts` (after `by_ordinal`, about line 190)

**Interfaces:**

- Produces: `export function sprints_needing_reflection<S extends DatedSprint & { id: string; ordinal: number }>(sprints: readonly S[], written_sprint_ids: ReadonlySet<string>, today: Date): S[]`.
  Returns the sprints, in ordinal order, whose `sprint_timing(...).state` is not `'not_open'`
  and whose id is not in `written_sprint_ids`.

- [ ] **Step 1: Write the failing cases**

In `scripts/verify-gig-detail.sh`, add `sprints_needing_reflection` to the import list at the
top of the `check.mjs` heredoc:

```js
import {
  sprint_timing,
  days_between,
  format_short_date,
  gig_dates,
  sprint_progress,
  gig_duration_weeks,
  sprints_needing_reflection,
} from "./gig-timing.js";
```

Then, immediately before the final `process.exit(failed === 0 ? 0 : 1);` line of the heredoc,
add:

```js
// CAP-53: which sprints the diary home's nudge names. Opened (or undated)
// and nothing written. A sprint that has not opened is never counted, and
// nothing here reads due_on: the nudge makes no judgement about lateness.
const S = (id, ordinal, opens_on, due_on) => ({
  id,
  ordinal,
  opens_on,
  due_on,
});
const needing_cases = [
  [
    "past and open, none written, ordinal order",
    [
      S("b", 2, "2026-09-01", "2026-09-17"),
      S("a", 1, "2026-08-03", "2026-08-16"),
    ],
    [],
    ["a", "b"],
  ],
  [
    "a written sprint drops out",
    [
      S("a", 1, "2026-08-03", "2026-08-16"),
      S("b", 2, "2026-09-01", "2026-09-17"),
    ],
    ["a"],
    ["b"],
  ],
  [
    "not yet open is never counted",
    [
      S("a", 1, "2026-08-03", "2026-08-16"),
      S("c", 3, "2026-09-20", "2026-10-03"),
    ],
    [],
    ["a"],
  ],
  [
    "opens tomorrow is not open",
    [S("c", 3, "2026-09-15", "2026-09-28")],
    [],
    [],
  ],
  ["opens today counts", [S("d", 4, "2026-09-14", "2026-09-28")], [], ["d"]],
  ["undated counts", [S("e", 5, null, null)], [], ["e"]],
  ["everything written", [S("a", 1, "2026-08-03", "2026-08-16")], ["a"], []],
];

for (const [name, sprints, written, want] of needing_cases) {
  const got = sprints_needing_reflection(sprints, new Set(written), today).map(
    (s) => s.id,
  );
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    console.log(
      `  MISMATCH needing "${name}": want ${want.join(",")}, got ${got.join(",")}`,
    );
    failed++;
  }
}
```

And change both summary lines after the heredoc from `"wording 11, states 9, duration 6, shape 6"`
to `"wording 11, states 9, duration 6, shape 6, needing 7"`.

- [ ] **Step 2: Run it and watch it fail**

Run: `cd /Users/tonyto/Documents/GitHub/cse3cap/.claude/worktrees/feat+CAP-53-portfolio-and-journey && ./run verify-gig 2>&1 | sed -n '/^==> 5/,/^==> 6/p'`
Expected: section 5 reports a failure. Either tsc compiles and node throws
`SyntaxError: The requested module './gig-timing.js' does not provide an export named
'sprints_needing_reflection'`, or the line reads `FAIL wording 11, ... needing 7`. Sections 6
and later may say `meh` with no API running; that is fine.

- [ ] **Step 3: Implement it**

In `web/src/screens/gig-timing.ts`, directly after the `by_ordinal` function, add:

```ts
/**
 * The sprints a student could have written for and has not (CAP-53): the
 * diary hub frame's "2 sprints need your reflection" (Figma 66:34).
 *
 * "Could have" is sprint_timing's: anything but not_open, so a sprint that
 * opens today counts and one with no dates counts, as chippable_sprints
 * treats them. due_on is never consulted. Past its window is named the
 * same as open, because the product makes no judgement about lateness
 * (see this file's header).
 *
 * Who wrote what is the caller's: it passes the sprint ids of the
 * student's own reflections, already filtered by diary-scope.ts.
 */
export function sprints_needing_reflection<
  S extends DatedSprint & { id: string; ordinal: number },
>(
  sprints: readonly S[],
  written_sprint_ids: ReadonlySet<string>,
  today: Date,
): S[] {
  return by_ordinal(sprints).filter(
    (sprint) =>
      !written_sprint_ids.has(sprint.id) &&
      sprint_timing(sprint, today).state !== "not_open",
  );
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `./run verify-gig 2>&1 | sed -n '/^==> 5/,/^==> 6/p'`
Expected: `ok wording 11, states 9, duration 6, shape 6, needing 7  (east and west of UTC)`.

- [ ] **Step 5: Lint and commit**

```bash
cd web && npx prettier --write src/screens/gig-timing.ts && npx oxlint src/screens/gig-timing.ts && cd ..
git add scripts/verify-gig-detail.sh web/src/screens/gig-timing.ts
git commit -m "feat(web): which sprints need a reflection, as a pure function (CAP-53)"
```

---

### Task 2: StartReflection in its own file

A move, under the existing tests. `web/e2e/start-reflection.spec.ts` is the safety net: it must
pass before and after, unchanged.

**Files:**

- Create: `web/src/screens/StartReflection.tsx`
- Create: `web/src/screens/StartReflection.module.css`
- Modify: `web/src/screens/GigDetail.tsx` (remove `NO_RUBRIC` and `StartReflection`, about lines 512-580; import the new file; wrap the call at about line 504)
- Modify: `web/src/screens/GigDetail.module.css` (`.row_start` keeps only its padding; `.row_error` moves)

**Interfaces:**

- Produces: `export function StartReflection(props: { sprint_id: string; on_refresh: () => void; label?: string }): JSX.Element`.
  `label` defaults to `'Start reflection'`. While starting it reads `'Starting…'`.

- [ ] **Step 1: Run the safety net green first**

Run: `cd web && npx playwright test e2e/start-reflection.spec.ts --project=chromium`
Expected: every test passes. (If the project name differs, run `npx playwright test e2e/start-reflection.spec.ts` and use the Chromium result.)

- [ ] **Step 2: Create the component**

`web/src/screens/StartReflection.tsx`:

```tsx
/**
 * Starts a reflection on one sprint and opens it in the stepper (CAP-39).
 *
 * Its own file since CAP-53, so the gig page's sprint rows and the diary
 * home's nudge are the one button. Which sprints may be started is not
 * decided here: the server allows any, and GigPolicy::createReflection
 * decides who. The ref, not just the disabled state, stops a double press
 * sending twice, because two clicks can land before React re-renders the
 * button disabled.
 */
import { useRef, useState } from "react";
import { useNavigate } from "react-router";

import { api, ApiError } from "../api/client.ts";
import { Button } from "../components/index.ts";
import styles from "./StartReflection.module.css";

const NO_RUBRIC =
  "This gig has no rubric yet. Ask your supervisor to assign one.";

export function StartReflection({
  sprint_id,
  on_refresh,
  label = "Start reflection",
}: {
  sprint_id: string;
  on_refresh: () => void;
  /** What the button says. The nudge names the sprint when it offers one of several. */
  label?: string;
}) {
  const navigate = useNavigate();
  const in_flight = useRef(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    if (in_flight.current) return;
    in_flight.current = true;
    setStarting(true);
    setError(null);
    try {
      const reflection = await api.post("/reflections", {
        body: { sprint_id },
      });
      navigate(`/reflections/${reflection.id}`);
    } catch (caught) {
      if (!(caught instanceof ApiError)) throw caught;
      switch (caught.code) {
        case "DUPLICATE_REFLECTION":
          // Started somewhere else since this page loaded. Re-reading turns
          // the row (or the nudge) into what is true now.
          on_refresh();
          break;
        case "FRAMEWORK_NOT_ASSIGNED":
          setError(NO_RUBRIC);
          break;
        default:
          setError(caught.message);
      }
    } finally {
      in_flight.current = false;
      setStarting(false);
    }
  }

  return (
    <div className={styles.start}>
      {/* Small (round 2c): a row action, sized like the diary's Gig
          details beside its picker, not a page's main button. */}
      <Button
        variant="secondary"
        size="sm"
        full_width={false}
        disabled={starting}
        on_click={start}
      >
        {starting ? "Starting…" : label}
      </Button>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
```

`web/src/screens/StartReflection.module.css`:

```css
.start {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-12);
}

.error {
  margin: 0;
  font-size: var(--font-size-sm);
  color: var(--color-danger);
}
```

- [ ] **Step 3: Use it from GigDetail**

In `web/src/screens/GigDetail.tsx`:

- Delete the `const NO_RUBRIC = ...` line and the whole `StartReflection` function with its
  doc comment (from `/**\n * Starts a reflection on one sprint` to the function's closing `}`).
- Add `import { StartReflection } from './StartReflection.tsx';` after the
  `import { HistorySheet } from './HistorySheet.tsx';` line.
- Replace `<StartReflection sprint_id={sprint.id} on_refresh={on_refresh} />` with:

```tsx
<div className={styles.row_start}>
  <StartReflection sprint_id={sprint.id} on_refresh={on_refresh} />
</div>
```

- Remove `useRef` from the `react` import and `useNavigate` from the `react-router` import
  only if nothing else in the file uses them (`grep -n "useRef\|useNavigate" src/screens/GigDetail.tsx`).
  Remove `Button` from the components import only if nothing else uses it.

In `web/src/screens/GigDetail.module.css`, replace the `.row_start` and `.row_error` rules with:

```css
.row_start {
  padding: 0 var(--space-16);
}
```

- [ ] **Step 4: Run the safety net again**

Run: `cd web && npx tsc -b && npx playwright test e2e/start-reflection.spec.ts e2e/gig-detail-header.spec.ts e2e/gig-detail-diary-card.spec.ts`
Expected: tsc silent; every test passes, unchanged.

- [ ] **Step 5: Lint and commit**

```bash
cd web && npx prettier --write src/screens/StartReflection.tsx src/screens/StartReflection.module.css src/screens/GigDetail.tsx src/screens/GigDetail.module.css && npm run lint && cd ..
git add web/src/screens/StartReflection.tsx web/src/screens/StartReflection.module.css web/src/screens/GigDetail.tsx web/src/screens/GigDetail.module.css
git commit -m "refactor(web): Start reflection is its own component, for the gig page and the diary (CAP-53)"
```

---

### Task 3: The nudge on the diary home

**Files:**

- Create: `web/e2e/diary-nudge.spec.ts`
- Modify: `web/src/screens/DiaryHome.tsx` (imports; render after `<ScopeChips .../>`; a new `ReflectionNudge` function)
- Modify: `web/src/screens/DiaryHome.module.css` (`.nudge`, `.nudge_text`)

**Interfaces:**

- Consumes: `sprints_needing_reflection` (Task 1), `StartReflection` with `label` (Task 2),
  `reflections_in_scope`, `student_gigs` from `diary-scope.ts`.

- [ ] **Step 1: Write the failing spec**

`web/e2e/diary-nudge.spec.ts`:

```ts
/**
 * CAP-53: the diary home names the sprints that need a reflection (Figma
 * 66:34, "2 sprints need your reflection").
 *
 * Which sprints is gig-timing.ts's sprints_needing_reflection, checked in
 * scripts/verify-gig-detail.sh. This drives the screen: the sentence per
 * scope, the button that starts the earliest, and that a reviewer's
 * reflections on another gig never count as the student's.
 *
 * Self-contained, ids prefixed '5353' (CAP-53).
 */
import { test as base, expect } from "@playwright/test";

import type { components } from "../src/api/schema.ts";
import {
  FakeApi,
  type FrameworkDetail,
  type GigDetail,
  type ReflectionSummary,
} from "./fake-api.ts";

type Me = components["schemas"]["Me"];

const id = (n: string) => `5353${n}-0000-4353-8353-535353535353`;
const FRAMEWORK = id("0001");
const GIG_A = id("0a00");
const GIG_B = id("0b00");
const GIG_C = id("0c00");
const REVIEWED_GIG = id("0d00");
const A = (n: number) => id(`0a0${n}`);
const B = (n: number) => id(`0b0${n}`);
const C1 = id("0c01");
const D1 = id("0d01");

const RUBRIC: FrameworkDetail = {
  id: FRAMEWORK,
  fw_key: "latrobe6",
  version: "v1",
  name: "La Trobe six-competency",
  created_by: null,
  in_use: true,
  assigned: true,
  comment_required: true,
  evidence_required: false,
  accepted_file_types: ["pdf"],
  max_file_bytes: 10485760,
  scale: { min: 1, max: 4 },
  competencies: [1, 2].map((n) => ({
    id: id(`00c${n}`),
    code: `c${n}`,
    name: n === 1 ? "Collaboration" : "Communication",
    short_label: null,
    category: null,
    position: n,
    levels: [1, 2, 3, 4].map((value) => ({
      id: id(`0d${n}${value}`),
      level_value: value,
      descriptor: `Level ${value}.`,
    })),
  })),
};

const PAST = { opens_on: "2026-08-01", due_on: "2026-08-14" };
const LATER = { opens_on: "2099-01-01", due_on: "2099-01-14" };

function gig(
  gig_id: string,
  title: string,
  role: "student" | "assessor",
  sprints: { id: string; dates: typeof PAST }[],
): GigDetail {
  return {
    id: gig_id,
    title,
    org_name: "Alumable",
    starts_on: "2026-08-01",
    ends_on: "2026-11-01",
    my_role: role,
    sprints: sprints.map((sprint, i) => ({
      id: sprint.id,
      ordinal: i + 1,
      ...sprint.dates,
    })),
    framework: {
      id: FRAMEWORK,
      fw_key: "latrobe6",
      name: RUBRIC.name,
      version: "v1",
    },
    reflection_summary: { draft: 0, submitted: 1, assessed: 0 },
    participants: [{ id: id("0e01"), display_name: "Ash", role }],
  };
}

// A: sprint 1 written, sprint 2 needs one, sprint 3 not open yet.
// B: both sprints need one. C: only a sprint that has not opened.
// D: Ash reviews it; someone else's reflection there must not count.
const GIGS: GigDetail[] = [
  gig(GIG_A, "Develop AI use cases", "student", [
    { id: A(1), dates: PAST },
    { id: A(2), dates: PAST },
    { id: A(3), dates: LATER },
  ]),
  gig(GIG_B, "Data migration audit", "student", [
    { id: B(1), dates: PAST },
    { id: B(2), dates: PAST },
  ]),
  gig(GIG_C, "Policy chatbot", "student", [{ id: C1, dates: LATER }]),
  gig(REVIEWED_GIG, "Cohort review", "assessor", [{ id: D1, dates: PAST }]),
];

function reflection(
  reflection_id: string,
  gig_id: string,
  sprint_id: string,
): ReflectionSummary {
  return {
    id: reflection_id,
    status: "submitted",
    gig_id,
    sprint_id,
    sprint_ordinal: 1,
    framework_id: FRAMEWORK,
    framework_version: "v1",
    submitted_at: "2026-08-14T10:00:00.000000Z",
    created_at: "2026-08-10T10:00:00.000000Z",
    updated_at: "2026-08-14T10:00:00.000000Z",
  };
}

const WRITTEN = [
  reflection(id("f001"), GIG_A, A(1)),
  // Returned to Ash as a reviewer, not written by Ash.
  reflection(id("f002"), REVIEWED_GIG, D1),
];

const ME: Me = {
  id: id("0e01"),
  display_name: "Ash",
  participations: GIGS.map((g) => ({
    gig_id: g.id,
    gig_title: g.title,
    role: g.my_role,
  })),
};

const test = base.extend<{ reflections: ReflectionSummary[]; api: FakeApi }>({
  reflections: [WRITTEN, { option: true }],
  api: [
    async ({ page, reflections }, provide) => {
      const api = new FakeApi([RUBRIC], ME, GIGS, reflections);
      await api.install(page);
      // Nothing scored in any scope: the radar's own empty state.
      await page.route("**/api/v1/me/radar**", (route) =>
        route.fulfill({
          status: 404,
          contentType: "application/json",
          body: JSON.stringify({
            error: { code: "NOT_FOUND", message: "Nothing yet.", details: {} },
          }),
        }),
      );
      await provide(api);
      expect(api.unexpected, "requests the fake does not serve").toEqual([]);
    },
    { auto: true },
  ],
});

const nudge = (page: import("@playwright/test").Page) =>
  page.getByTestId("reflection-nudge");

test("one gig with one sprint to write: names it and offers Start reflection", async ({
  page,
}) => {
  await page.goto(`/?gig_id=${GIG_A}`);

  await expect(nudge(page)).toContainText("Sprint 2 needs your reflection.");
  await expect(
    nudge(page).getByRole("button", { name: "Start reflection" }),
  ).toBeVisible();
  // Sprint 3 has not opened, so it is not counted.
  await expect(nudge(page)).not.toContainText("Sprint 3");
});

test("one gig with two: counts them and offers the earliest by name", async ({
  page,
}) => {
  await page.goto(`/?gig_id=${GIG_B}`);

  await expect(nudge(page)).toContainText("2 sprints need your reflection.");
  await expect(
    nudge(page).getByRole("button", { name: "Start Sprint 1" }),
  ).toBeVisible();
});

test("pressing it starts the earliest and opens it in the stepper", async ({
  page,
  api,
}) => {
  await page.goto(`/?gig_id=${GIG_B}`);
  await nudge(page).getByRole("button", { name: "Start Sprint 1" }).click();

  await expect(page).toHaveURL(/\/reflections\/e2e00000-/);
  const posts = api
    .writes()
    .filter((call) => call.route === "POST /reflections");
  expect(posts.map((call) => call.body)).toEqual([{ sprint_id: B(1) }]);
});

test("a gig with nothing to write shows no nudge", async ({ page }) => {
  await page.goto(`/?gig_id=${GIG_C}`);

  await expect(
    page.getByRole("button", { name: "Gig details ›" }),
  ).toBeEnabled();
  await expect(nudge(page)).toHaveCount(0);
});

test("all gigs: counts across the student gigs only, with no button", async ({
  page,
}) => {
  await page.goto("/");

  // A2 + B1 + B2. Not D1: Ash only reviews that gig.
  await expect(nudge(page)).toContainText(
    "3 sprints need your reflection. Pick a gig to start.",
  );
  await expect(nudge(page).getByRole("button")).toHaveCount(0);
});

test.describe("a student who has written nothing", () => {
  test.use({ reflections: [] });

  test("the nudge sits above the empty diary", async ({ page }) => {
    await page.goto(`/?gig_id=${GIG_A}`);

    await expect(nudge(page)).toContainText("2 sprints need your reflection.");
    await expect(page.getByText("Nothing in your diary yet.")).toBeVisible();
  });
});

test("the gig page keeps its own Start reflection", async ({ page }) => {
  await page.goto(`/gigs/${GIG_A}`);

  await expect(
    page
      .getByRole("listitem")
      .filter({ hasText: "Sprint 2" })
      .getByRole("button", { name: "Start reflection" }),
  ).toBeVisible();
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd web && npx playwright test e2e/diary-nudge.spec.ts`
Expected: the five tests that assert the nudge's text or button fail, each on
`getByTestId('reflection-nudge')` not being found. "A gig with nothing to write shows no
nudge" and "the gig page keeps its own Start reflection" pass already: they are guards, not
the feature.

- [ ] **Step 3: Implement the nudge**

In `web/src/screens/DiaryHome.tsx`:

Add to the imports:

```tsx
import { sprints_needing_reflection } from "./gig-timing.ts";
import { StartReflection } from "./StartReflection.tsx";
```

In `DiaryHome`'s return, directly after `<ScopeChips gigs={mine} scope={scope} on_select={go_to} />`, add:

```tsx
<ReflectionNudge
  gigs={mine}
  gig={mine.find((candidate) => candidate.id === scope.gig_id) ?? null}
  reflections={whole_record}
  on_refresh={retry}
/>
```

Add this function after `ScopeChips`:

```tsx
/**
 * "2 sprints need your reflection" (CAP-53, Figma 66:34): the sprints that
 * have opened with nothing written, from gig-timing.ts. In one gig it
 * offers to start the earliest; under All gigs there is no single gig to
 * start in, so it only counts and says to pick one.
 *
 * `reflections` is the student's own whole record (reflections_in_scope),
 * so a reflection returned to them as a reviewer on another gig never
 * counts as written. It never says late: see gig-timing.ts's header.
 */
function ReflectionNudge({
  gigs,
  gig,
  reflections,
  on_refresh,
}: {
  gigs: Gig[];
  gig: Gig | null;
  reflections: ReflectionSummary[];
  on_refresh: () => void;
}) {
  const today = new Date();
  const written = new Set(
    reflections.flatMap((reflection) =>
      reflection.sprint_id ? [reflection.sprint_id] : [],
    ),
  );
  const needing = gig
    ? sprints_needing_reflection(gig.sprints, written, today)
    : gigs.flatMap((one) =>
        sprints_needing_reflection(one.sprints, written, today),
      );

  if (needing.length === 0) return null;

  const first = needing[0];
  const counted =
    needing.length === 1
      ? "1 sprint needs your reflection."
      : `${needing.length} sprints need your reflection.`;
  const sentence = !gig
    ? `${counted} Pick a gig to start.`
    : needing.length === 1
      ? `Sprint ${first.ordinal} needs your reflection.`
      : counted;

  return (
    <div className={styles.nudge} data-testid="reflection-nudge">
      <p className={styles.nudge_text}>{sentence}</p>
      {gig && (
        <StartReflection
          key={first.id}
          sprint_id={first.id}
          on_refresh={on_refresh}
          label={
            needing.length === 1
              ? "Start reflection"
              : `Start Sprint ${first.ordinal}`
          }
        />
      )}
    </div>
  );
}
```

In `web/src/screens/DiaryHome.module.css`, add at the end:

```css
/* CAP-53: the hub frame's purple line (Figma 66:34), on a surface card so
   --color-primary passes AA at this size (check-contrast.mjs pairs it with
   --color-surface; on --color-bg it is large-text only). */
.nudge {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-12);
  margin: 0 0 var(--space-16);
  padding: var(--space-12) var(--space-16);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  box-shadow: var(--shadow-card);
}

.nudge_text {
  margin: 0;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--color-primary);
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `cd web && npx playwright test e2e/diary-nudge.spec.ts e2e/diary-home.spec.ts e2e/diary-home-one-gig.spec.ts e2e/diary-home-layout.spec.ts e2e/start-reflection.spec.ts`
Expected: all pass. If a diary-home spec now fails because its fixture has an opened,
unwritten sprint and a layout assertion moved, read the failure: a nudge appearing there is
correct behaviour, so adjust that spec's expectation only if it asserts an exact position the
nudge legitimately shifts, and record the ruling in the ledger.

- [ ] **Step 5: Lint and commit**

```bash
cd web && npx prettier --write e2e/diary-nudge.spec.ts src/screens/DiaryHome.tsx src/screens/DiaryHome.module.css && npm run lint && cd ..
git add web/e2e/diary-nudge.spec.ts web/src/screens/DiaryHome.tsx web/src/screens/DiaryHome.module.css
git commit -m "feat(web): the diary names the sprints that need a reflection, and starts the earliest (CAP-53)"
```

---

### Task 4: Your learning record, `/record`

**Files:**

- Create: `web/e2e/learning-record.spec.ts`
- Create: `web/src/screens/LearningRecord.tsx`
- Create: `web/src/screens/LearningRecord.module.css`
- Modify: `web/src/app/routes.tsx` (import; a `record` route beside `gigs/:gig_id`)
- Modify: `web/src/screens/DiaryHome.tsx` (the link in, after the content block)
- Modify: `web/src/screens/DiaryHome.module.css` (`.record_link`)

**Interfaces:**

- Consumes: `api.get('/gigs')`, `api.get('/reflections')`,
  `api.get('/me/progress', { query: { gig_id } })`,
  `api.get('/frameworks/{framework_id}', { path: { framework_id } })`;
  `student_gigs`, `reflections_in_scope`, types `Gig`, `ReflectionSummary` from
  `diary-scope.ts`; `by_ordinal`, `format_full_date` from `gig-timing.ts`; `ExportSheet`.
- Produces: `export function LearningRecord(): JSX.Element`, routed at `/record`.

- [ ] **Step 1: Write the failing spec**

`web/e2e/learning-record.spec.ts`:

```ts
/**
 * CAP-53: "Your learning record" (Figma 86:936), at /record.
 *
 * One section per gig the student has written on, each a competency by
 * sprint table of self/assessor. Every number comes from GET /me/progress,
 * served here per gig with page.route as the radar specs serve /me/radar:
 * the fake serves shapes, never the view that decides which score counts.
 *
 * Self-contained, ids prefixed '5354'.
 */
import { test as base, expect, type Page } from "@playwright/test";

import type { components, paths } from "../src/api/schema.ts";
import {
  FakeApi,
  type FrameworkDetail,
  type GigDetail,
  type ReflectionSummary,
} from "./fake-api.ts";

type Me = components["schemas"]["Me"];
type Progress =
  paths["/me/progress"]["get"]["responses"]["200"]["content"]["application/json"];

const id = (n: string) => `5354${n}-0000-4354-8354-535453545354`;
const LATROBE = id("0f01");
const SFIA = id("0f02");
const GIG_A = id("0a00");
const GIG_B = id("0b00");
const GIG_UNWRITTEN = id("0c00");
const GIG_NO_RUBRIC = id("0e00");
const GIG_REVIEWED = id("0d00");

function rubric(
  framework_id: string,
  name: string,
  max: number,
  competencies: [string, string, string | null][],
): FrameworkDetail {
  return {
    id: framework_id,
    fw_key: name.toLowerCase().replace(/\W+/g, "-"),
    version: "v1",
    name,
    created_by: null,
    in_use: true,
    assigned: true,
    comment_required: true,
    evidence_required: false,
    accepted_file_types: ["pdf"],
    max_file_bytes: 10485760,
    scale: { min: 1, max },
    competencies: competencies.map(
      ([code, competency_name, short_label], i) => ({
        id: id(`${framework_id.slice(6, 8)}c${i}`),
        code,
        name: competency_name,
        short_label,
        category: null,
        position: i + 1,
        levels: [],
      }),
    ),
  };
}

const LATROBE_RUBRIC = rubric(LATROBE, "Alumable sprint 1 template", 4, [
  ["contrib", "Contribution to the team", "Contribution"],
  ["comms", "Communication", null],
  ["lead", "Leadership", "Leadership"],
]);
const SFIA_RUBRIC = rubric(SFIA, "SFIA 9", 7, [
  ["datm", "Data management", "DATM"],
]);

function gig(
  gig_id: string,
  title: string,
  role: "student" | "assessor",
  framework: FrameworkDetail | null,
  sprint_count: number,
  starts_on: string,
): GigDetail {
  return {
    id: gig_id,
    title,
    org_name: "Alumable",
    starts_on,
    ends_on: "2026-11-01",
    my_role: role,
    sprints: Array.from({ length: sprint_count }, (_, i) => ({
      id: id(`${gig_id.slice(4, 6)}5${i + 1}`),
      ordinal: i + 1,
      opens_on: "2026-08-01",
      due_on: "2026-08-14",
    })),
    framework: framework
      ? {
          id: framework.id,
          fw_key: framework.fw_key,
          name: framework.name,
          version: "v1",
        }
      : null,
    reflection_summary: { draft: 0, submitted: 1, assessed: 1 },
    participants: [{ id: id("0e01"), display_name: "Ash", role }],
  };
}

const GIGS: GigDetail[] = [
  gig(
    GIG_A,
    "Develop AI use cases",
    "student",
    LATROBE_RUBRIC,
    3,
    "2026-08-03",
  ),
  gig(GIG_B, "Data migration audit", "student", SFIA_RUBRIC, 2, "2026-08-17"),
  gig(
    GIG_UNWRITTEN,
    "Policy chatbot",
    "student",
    LATROBE_RUBRIC,
    4,
    "2026-08-01",
  ),
  gig(GIG_NO_RUBRIC, "Unassigned gig", "student", null, 1, "2026-07-01"),
  gig(
    GIG_REVIEWED,
    "Cohort review",
    "assessor",
    LATROBE_RUBRIC,
    1,
    "2026-06-01",
  ),
];

function reflection(
  reflection_id: string,
  gig_id: string,
  ordinal: number,
  status: ReflectionSummary["status"],
): ReflectionSummary {
  return {
    id: reflection_id,
    status,
    gig_id,
    sprint_id: id(`${gig_id.slice(4, 6)}5${ordinal}`),
    sprint_ordinal: ordinal,
    framework_id: gig_id === GIG_B ? SFIA : LATROBE,
    framework_version: "v1",
    submitted_at: "2026-08-14T10:00:00.000000Z",
    created_at: "2026-08-10T10:00:00.000000Z",
    updated_at: "2026-08-14T10:00:00.000000Z",
  };
}

const REFLECTIONS = [
  reflection(id("f001"), GIG_A, 1, "assessed"),
  reflection(id("f002"), GIG_A, 2, "submitted"),
  reflection(id("f003"), GIG_B, 1, "assessed"),
  // Ash only reviews this gig: someone else's reflection, never in Ash's record.
  reflection(id("f004"), GIG_REVIEWED, 1, "submitted"),
];

const PROGRESS: Record<string, Progress> = {
  [GIG_A]: {
    competencies: [
      {
        code: "contrib",
        short_label: "Contribution",
        series: [
          { sprint_ordinal: 1, self: 3, counter: 4 },
          { sprint_ordinal: 2, self: 4, counter: null },
        ],
      },
      {
        code: "comms",
        short_label: null,
        series: [{ sprint_ordinal: 1, self: 2, counter: 3 }],
      },
    ],
  },
  [GIG_B]: {
    competencies: [
      {
        code: "datm",
        short_label: "DATM",
        series: [{ sprint_ordinal: 1, self: 5, counter: 6 }],
      },
    ],
  },
};

const STUDENT: Me = {
  id: id("0e01"),
  display_name: "Ash",
  participations: GIGS.map((g) => ({
    gig_id: g.id,
    gig_title: g.title,
    role: g.my_role,
  })),
};

const REVIEWER: Me = {
  id: id("0e02"),
  display_name: "Sam",
  participations: [
    { gig_id: GIG_REVIEWED, gig_title: "Cohort review", role: "assessor" },
  ],
};

const test = base.extend<{
  me: Me;
  reflections: ReflectionSummary[];
  api: FakeApi;
  progress_calls: string[];
}>({
  me: [STUDENT, { option: true }],
  reflections: [REFLECTIONS, { option: true }],
  api: [
    async ({ page, me, reflections }, provide) => {
      const api = new FakeApi(
        [LATROBE_RUBRIC, SFIA_RUBRIC],
        me,
        me === REVIEWER ? GIGS.filter((g) => g.id === GIG_REVIEWED) : GIGS,
        reflections,
      );
      await api.install(page);
      // The diary home draws a radar when the student lands there.
      await page.route("**/api/v1/me/radar**", (route) =>
        route.fulfill({
          status: 404,
          contentType: "application/json",
          body: JSON.stringify({
            error: { code: "NOT_FOUND", message: "Nothing yet.", details: {} },
          }),
        }),
      );
      await provide(api);
      expect(api.unexpected, "requests the fake does not serve").toEqual([]);
    },
    { auto: true },
  ],
  // Depends on api so this route is registered after the fake's catch-all,
  // and so wins (Playwright tries the newest route first).
  progress_calls: [
    async ({ page, api: _api }, provide) => {
      const calls: string[] = [];
      await page.route("**/api/v1/me/progress**", (route) => {
        const gig_id =
          new URL(route.request().url()).searchParams.get("gig_id") ?? "";
        calls.push(gig_id);
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(PROGRESS[gig_id] ?? { competencies: [] }),
        });
      });
      await provide(calls);
    },
    { auto: true },
  ],
});

const section = (page: Page, title: string) =>
  page.getByRole("table", { name: title });

/** The cells of one competency's row, after its header cell. */
const cells = (page: Page, gig_title: string, competency: string) =>
  section(page, gig_title)
    .getByRole("row")
    .filter({ hasText: competency })
    .getByRole("cell");

test("the summary, one section per written gig, and the grid of self/assessor", async ({
  page,
  progress_calls,
}) => {
  await page.goto("/record");

  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Your learning record",
  );
  await expect(page.getByText("3 reflections · 2 gigs")).toBeVisible();
  await expect(page.getByText(/^2 rubrics · since .*2026$/)).toBeVisible();
  await expect(
    page.getByText("Yours to keep. Export it whenever you like."),
  ).toBeVisible();

  // Two tables: the unwritten gig, the gig with no rubric and the reviewed
  // gig have no section.
  await expect(page.getByRole("table")).toHaveCount(2);
  await expect(page.getByText("Policy chatbot")).toHaveCount(0);
  await expect(page.getByText("Unassigned gig")).toHaveCount(0);
  await expect(page.getByText("Cohort review")).toHaveCount(0);
  // A set: in development StrictMode mounts the effect twice.
  expect([...new Set(progress_calls)].sort()).toEqual([GIG_A, GIG_B].sort());

  // Develop AI use cases: three sprints, three competencies in rubric order.
  const a = section(page, "Develop AI use cases");
  await expect(a.getByRole("columnheader")).toHaveText([
    "Competency",
    "S1",
    "S2",
    "S3",
  ]);
  await expect(a.getByRole("rowheader")).toHaveText([
    "Contribution",
    "Communication",
    "Leadership",
  ]);
  await expect(cells(page, "Develop AI use cases", "Contribution")).toHaveText([
    /^3\/4/,
    /^4\/–/,
    /^–not yet$/,
  ]);
  // No short label falls back to the name; a sprint with no reflection is "–".
  await expect(cells(page, "Develop AI use cases", "Communication")).toHaveText(
    [/^2\/3/, /^–not yet$/, /^–not yet$/],
  );
  // Nothing scored on this competency at all: still a row.
  await expect(cells(page, "Develop AI use cases", "Leadership")).toHaveText([
    /^–not yet$/,
    /^–not yet$/,
    /^–not yet$/,
  ]);

  await expect(
    page.getByText("Alumable sprint 1 template", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("3 sprints")).toBeVisible();
  await expect(page.getByText("levels 1–4 · – not yet")).toBeVisible();

  // Data migration audit: its own rubric and its own scale.
  await expect(cells(page, "Data migration audit", "DATM")).toHaveText([
    /^5\/6/,
    /^–not yet$/,
  ]);
  await expect(page.getByText("levels 1–7 · – not yet")).toBeVisible();

  await expect(
    page.getByText(
      "Scores from different rubrics aren't compared. Each section uses its own scale.",
    ),
  ).toBeVisible();
});

test("each section opens the diary scoped to its gig", async ({ page }) => {
  await page.goto("/record");

  await expect(
    page.getByRole("link", { name: "Open the 2 reflections ›" }),
  ).toHaveAttribute("href", `/?gig_id=${GIG_A}`);
  await expect(
    page.getByRole("link", { name: "Open the reflection ›" }),
  ).toHaveAttribute("href", `/?gig_id=${GIG_B}`);
});

test("the diary links in, and back returns to the diary", async ({ page }) => {
  await page.goto(`/?gig_id=${GIG_A}`);
  await page.getByRole("link", { name: "Your learning record ›" }).click();

  await expect(page).toHaveURL("/record");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Your learning record",
  );

  await page.getByRole("link", { name: "Back to Reflection Diary" }).click();
  await expect(page).toHaveURL(/\/(\?.*)?$/);
});

test("Export record opens the export sheet", async ({ page }) => {
  await page.goto("/record");
  await page.getByRole("button", { name: "Export record" }).click();

  await expect(
    page.getByRole("dialog", { name: "Export record" }),
  ).toBeVisible();
});

test("loading shows skeletons, not a spinner", async ({ page, api }) => {
  const release = api.hold("GET /gigs");
  await page.goto("/record");

  await expect(page.getByText("Loading your learning record")).toBeAttached();
  release();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Your learning record",
  );
});

test("a failed read shows the error, and Try again recovers", async ({
  page,
  api,
}) => {
  // Twice: in development StrictMode mounts the effect twice.
  api.fail("GET /reflections", { kind: "network" }, 2);
  await page.goto("/record");

  await expect(page.getByText("Cannot reach the server")).toBeVisible();
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("table")).toHaveCount(2);
});

test.describe("a student who has written nothing", () => {
  test.use({ reflections: [] });

  test("says the record starts with the first reflection", async ({ page }) => {
    await page.goto("/record");

    await expect(
      page.getByText("Your record starts with your first reflection."),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Back to your diary" }),
    ).toHaveAttribute("href", "/");
    await expect(page.getByRole("table")).toHaveCount(0);
  });
});

test.describe("someone who is not a student anywhere", () => {
  test.use({ me: REVIEWER });

  test("is told the diary is the student’s own record", async ({ page }) => {
    await page.goto("/record");

    await expect(
      page.getByText("The diary is the student’s own record."),
    ).toBeVisible();
    await expect(page.getByRole("table")).toHaveCount(0);
  });
});

test("on a phone the table scrolls inside its card, not the page", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/record");
  await expect(page.getByRole("table")).toHaveCount(2);

  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd web && npx playwright test e2e/learning-record.spec.ts`
Expected: every test fails. `/record` renders NotFound, so the heading is "Page not found" or
similar, and the diary has no "Your learning record ›" link.

- [ ] **Step 3: Write the screen**

`web/src/screens/LearningRecord.tsx`:

```tsx
/**
 * Your learning record (CAP-53, Figma 86:936): the student's whole record
 * as one competency by sprint table per gig, self/assessor in each cell.
 *
 * Every number is GET /me/progress's, which reads v_radar and so
 * v_entry_score, where "the latest counter-score counts" lives. Nothing
 * here chooses among scores. Rows come from the gig's framework rather
 * than from progress, so a competency nothing has scored yet still has its
 * row; the framework also carries the scale the section's legend names.
 *
 * Reads only: GET /gigs and /reflections, then per gig in the record
 * /me/progress and /frameworks/{id}. Two requests per gig is the cost of
 * adding no endpoint (see the ADR CAP-53 added).
 */
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";

import { api, ApiError } from "../api/client.ts";
import type { components, paths } from "../api/schema.ts";
import {
  BottomSheet,
  Button,
  ErrorNotice,
  Skeleton,
  SkeletonGroup,
} from "../components/index.ts";
import {
  reflections_in_scope,
  student_gigs,
  type Gig,
  type ReflectionSummary,
} from "./diary-scope.ts";
import { ExportSheet } from "./ExportSheet.tsx";
import { by_ordinal, format_full_date } from "./gig-timing.ts";
import styles from "./LearningRecord.module.css";

type Progress =
  paths["/me/progress"]["get"]["responses"]["200"]["content"]["application/json"];
type FrameworkDetail = components["schemas"]["FrameworkDetail"];

interface RecordSection {
  gig: Gig;
  framework: FrameworkDetail;
  progress: Progress;
  reflections: ReflectionSummary[];
}

type Load =
  | { status: "loading" }
  | { status: "error"; error: ApiError }
  | { status: "not_student" }
  | {
      status: "loaded";
      sections: RecordSection[];
      record: ReflectionSummary[];
    };

export function LearningRecord() {
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [reload_key, setReloadKey] = useState(0);
  const [export_open, setExportOpen] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const signal = controller.signal;

    async function read(): Promise<Load> {
      const [gigs, reflections] = await Promise.all([
        api.get("/gigs", { signal }),
        api.get("/reflections", { signal }),
      ]);
      const mine = student_gigs(gigs);
      if (mine.length === 0) return { status: "not_student" };

      // The student's own, as the diary home decides it: a reflection
      // returned to them as a reviewer on another gig is not theirs.
      const record = reflections_in_scope(reflections, gigs, {
        gig_id: null,
        sprint_id: null,
      });
      const written = mine.filter(
        (gig) =>
          gig.framework !== null && record.some((row) => row.gig_id === gig.id),
      );

      const sections = await Promise.all(
        written.map(async (gig): Promise<RecordSection> => {
          const [progress, framework] = await Promise.all([
            api.get("/me/progress", { query: { gig_id: gig.id }, signal }),
            api.get("/frameworks/{framework_id}", {
              path: { framework_id: gig.framework!.id },
              signal,
            }),
          ]);
          return {
            gig,
            framework,
            progress,
            reflections: record.filter((row) => row.gig_id === gig.id),
          };
        }),
      );

      return { status: "loaded", sections, record };
    }

    read()
      .then(setLoad)
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError")
          return;
        setLoad({
          status: "error",
          error:
            error instanceof ApiError
              ? error
              : new ApiError(
                  0,
                  null,
                  "Something went wrong loading your record.",
                ),
        });
      });

    return () => controller.abort();
  }, [reload_key]);

  const retry = useCallback(() => {
    setLoad({ status: "loading" });
    setReloadKey((key) => key + 1);
  }, []);

  if (load.status === "loading") return <LoadingState />;

  if (load.status === "error") {
    return (
      <section className={styles.page}>
        <h1 className={styles.heading}>Your learning record</h1>
        <ErrorNotice error={load.error} on_retry={retry} />
      </section>
    );
  }

  if (load.status === "not_student") {
    return (
      <section className={styles.page}>
        <h1 className={styles.heading}>Your learning record</h1>
        <div className={styles.empty}>
          <p className={styles.empty_title}>
            The diary is the student&rsquo;s own record.
          </p>
          <p className={styles.empty_body}>
            You are not a student on any gig, so there is no record to show
            here.
          </p>
        </div>
      </section>
    );
  }

  if (load.sections.length === 0) {
    return (
      <section className={styles.page}>
        <h1 className={styles.heading}>Your learning record</h1>
        <div className={styles.empty}>
          <p className={styles.empty_title}>
            Your record starts with your first reflection.
          </p>
          <p className={styles.empty_body}>
            Each sprint you reflect on adds a column of self and assessor scores
            here.
          </p>
          <Link className={styles.empty_link} to="/">
            Back to your diary
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.page}>
      <h1 className={styles.heading}>Your learning record</h1>

      <Summary sections={load.sections} record={load.record} />

      {load.sections.map((section) => (
        <RecordTable key={section.gig.id} section={section} />
      ))}

      <p className={styles.note}>
        Scores from different rubrics aren&rsquo;t compared. Each section uses
        its own scale.
      </p>

      <Button on_click={() => setExportOpen(true)}>Export record</Button>

      <BottomSheet
        open={export_open}
        title="Export record"
        onClose={() => setExportOpen(false)}
      >
        <ExportSheet reflections={load.record} />
      </BottomSheet>
    </section>
  );
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** "3 reflections · 2 gigs", "2 rubrics · since 3 August 2026". */
function Summary({
  sections,
  record,
}: {
  sections: RecordSection[];
  record: ReflectionSummary[];
}) {
  const rubrics = new Set(sections.map((section) => section.framework.id)).size;
  const starts = sections
    .map((section) => section.gig.starts_on)
    .filter((date): date is string => date !== null)
    .sort();

  return (
    <div className={styles.summary}>
      <p className={styles.summary_title}>
        {plural(record.length, "reflection", "reflections")} ·{" "}
        {plural(sections.length, "gig", "gigs")}
      </p>
      <p className={styles.summary_meta}>
        {plural(rubrics, "rubric", "rubrics")}
        {starts.length > 0 && ` · since ${format_full_date(starts[0])}`}
      </p>
      <p className={styles.summary_note}>
        Yours to keep. Export it whenever you like.
      </p>
    </div>
  );
}

/**
 * One gig: its rubric's name, then the table. A cell is "self/assessor"
 * from progress, "–" for a missing half, and "–" alone for a sprint with
 * no reflection. A real table, so a screen reader can move by row and
 * column; the visible "3/4" is hidden from it in favour of words.
 */
function RecordTable({ section }: { section: RecordSection }) {
  const { gig, framework, progress, reflections } = section;
  const sprints = by_ordinal(gig.sprints);
  const competencies = [...framework.competencies].sort(
    (a, b) => a.position - b.position,
  );
  const series = new Map(
    progress.competencies.map((row) => [row.code, row.series]),
  );
  const opens =
    reflections.length === 1
      ? "Open the reflection ›"
      : `Open the ${reflections.length} reflections ›`;

  return (
    <div className={styles.section}>
      <p className={styles.rubric}>{framework.name}</p>
      <div className={styles.card}>
        <div className={styles.card_head}>
          <span className={styles.gig_title} aria-hidden="true">
            {gig.title}
          </span>
          <span className={styles.sprint_count}>
            {plural(sprints.length, "sprint", "sprints")}
          </span>
        </div>

        <div className={styles.scroller}>
          <table className={styles.table}>
            <caption className={styles.sr_only}>{gig.title}</caption>
            <thead>
              <tr>
                <th scope="col" className={styles.col_competency}>
                  Competency
                </th>
                {sprints.map((sprint) => (
                  <th key={sprint.id} scope="col">
                    S{sprint.ordinal}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {competencies.map((competency) => {
                const points = series.get(competency.code) ?? [];
                return (
                  <tr key={competency.id}>
                    <th scope="row" className={styles.row_label}>
                      {competency.short_label ?? competency.name}
                    </th>
                    {sprints.map((sprint) => {
                      const point = points.find(
                        (p) => p.sprint_ordinal === sprint.ordinal,
                      );
                      return (
                        <td key={sprint.id} className={styles.cell}>
                          <Cell
                            self={point?.self ?? null}
                            counter={point?.counter ?? null}
                            found={point !== undefined}
                          />
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className={styles.legend}>
          <span>
            <span className={styles.self}>self</span> /{" "}
            <span className={styles.counter}>assessor</span>
          </span>
          <span className={styles.scale}>
            levels {framework.scale.min}–{framework.scale.max} · – not yet
          </span>
        </div>

        <Link className={styles.open_link} to={`/?gig_id=${gig.id}`}>
          {opens}
        </Link>
      </div>
    </div>
  );
}

function Cell({
  self,
  counter,
  found,
}: {
  self: number | null;
  counter: number | null;
  found: boolean;
}) {
  if (!found || (self === null && counter === null)) {
    return (
      <>
        <span aria-hidden="true">–</span>
        <span className={styles.sr_only}>not yet</span>
      </>
    );
  }
  return (
    <>
      <span aria-hidden="true">
        <span className={styles.self}>{self ?? "–"}</span>/
        <span className={styles.counter}>{counter ?? "–"}</span>
      </span>
      <span className={styles.sr_only}>
        {`self ${self ?? "not yet"}, assessor ${counter ?? "not yet"}`}
      </span>
    </>
  );
}

/** Shaped like the loaded screen: the summary and two sections. */
function LoadingState() {
  return (
    <section className={styles.page}>
      <SkeletonGroup label="Loading your learning record">
        <Skeleton variant="text" width="60%" />
        <div className={styles.summary}>
          <Skeleton variant="text" lines={3} />
        </div>
        {[0, 1].map((n) => (
          <div key={n} className={styles.card}>
            <Skeleton variant="block" height="var(--space-64)" />
            <Skeleton variant="text" lines={4} />
          </div>
        ))}
      </SkeletonGroup>
    </section>
  );
}
```

The spec's cell expectations include the screen-reader text: an empty cell's text is
`–not yet` and a scored one starts `3/4` then `self 3, assessor 4`. Keep both spans.

`web/src/screens/LearningRecord.module.css`:

```css
.page {
  display: flex;
  flex-direction: column;
  gap: var(--space-16);
  max-width: var(--content-width-read);
  margin: 0 auto;
  padding-bottom: var(--space-32);
}

.heading {
  margin: 0;
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-bold);
  color: var(--color-text);
}

.summary,
.card {
  display: flex;
  flex-direction: column;
  gap: var(--space-8);
  padding: var(--space-16);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  box-shadow: var(--shadow-card);
}

.summary_title,
.summary_meta,
.summary_note {
  margin: 0;
}

.summary_title {
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-bold);
  color: var(--color-text);
}

.summary_meta {
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
}

.summary_note {
  padding: var(--space-8) var(--space-12);
  border: var(--border-width-sm) solid var(--color-border);
  border-radius: var(--radius-md);
  font-size: var(--font-size-sm);
  color: var(--color-text-muted);
}

.section {
  display: flex;
  flex-direction: column;
  gap: var(--space-8);
}

.rubric {
  margin: 0;
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
  letter-spacing: var(--letter-spacing-label);
  text-transform: uppercase;
  color: var(--color-text-muted);
}

.card_head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-12);
}

.gig_title {
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-bold);
  color: var(--color-text);
}

.sprint_count {
  flex-shrink: 0;
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
}

/* A gig with more sprints than fit scrolls here, never the page. */
.scroller {
  overflow-x: auto;
}

.table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--font-size-sm);
}

.table th,
.table td {
  padding: var(--space-8) var(--space-4);
  border-bottom: var(--border-width-sm) solid var(--color-border);
  text-align: center;
  white-space: nowrap;
}

.table thead th {
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-muted);
}

.table .col_competency,
.table .row_label {
  text-align: left;
  white-space: normal;
}

.row_label {
  font-weight: var(--font-weight-medium);
  color: var(--color-text);
}

.cell {
  color: var(--color-text-muted);
}

.self {
  color: var(--color-primary);
}

.counter {
  color: var(--color-success);
}

.legend {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: var(--space-8);
  font-size: var(--font-size-xs);
}

.scale {
  color: var(--color-text-muted);
}

.open_link,
.empty_link {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--color-primary);
  text-decoration: none;
}

.note {
  margin: 0;
  padding: var(--space-8) var(--space-12);
  border: var(--border-width-sm) solid var(--color-border);
  border-radius: var(--radius-md);
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
}

.empty {
  display: flex;
  flex-direction: column;
  gap: var(--space-8);
  padding: var(--space-24);
  border-radius: var(--radius-lg);
  background: var(--color-surface-alt);
}

.empty_title {
  margin: 0;
  font-weight: var(--font-weight-bold);
  color: var(--color-text);
}

.empty_body {
  margin: 0;
  color: var(--color-text-muted);
}

.sr_only {
  position: absolute;
  width: 0.0625rem;
  height: 0.0625rem;
  padding: 0;
  margin: -0.0625rem;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}
```

`.empty_link` is `--color-primary` on `--color-surface-alt`, already a checked pair
(`DiaryHome .empty_link`). `.open_link`, `.self` and `.counter` sit on `--color-surface`,
also checked. `.note` and `.summary_note` sit on `--color-bg` in muted text, as
`DiaryHome .caption` does.

- [ ] **Step 4: Route it and link to it**

In `web/src/app/routes.tsx`, add `import { LearningRecord } from '../screens/LearningRecord.tsx';`
with the other screen imports, and directly after the `gigs/:gig_id` route:

```tsx
{
  /* CAP-53: the learning record (Figma 86:936). A deeper diary screen
            to sections.ts, so back goes to the diary home. */
}
<Route path="record" element={<LearningRecord />} />;
```

In `web/src/screens/DiaryHome.tsx`, directly after the `{rows.length > 0 && ( ... )}` block
and before `<FloatingAction`, add:

```tsx
{
  whole_record.length > 0 && (
    <div className={styles.record_link}>
      <LinkButton to="/record" variant="secondary" size="sm">
        Your learning record ›
      </LinkButton>
    </div>
  );
}
```

In `web/src/screens/DiaryHome.module.css`, add:

```css
/* CAP-53: the way into the learning record, under the list. */
.record_link {
  display: flex;
  justify-content: center;
  margin-top: var(--space-16);
}
```

- [ ] **Step 5: Run it and watch it pass**

Run: `cd web && npx tsc -b && npx playwright test e2e/learning-record.spec.ts e2e/diary-home.spec.ts e2e/diary-home-one-gig.spec.ts e2e/diary-home-layout.spec.ts e2e/not-found.spec.ts`
Expected: all pass. Read any failure against the spec before touching the code.

- [ ] **Step 6: Check the colours and the guards**

Run: `cd .. && node scripts/check-contrast.mjs && bash scripts/check-tokens.sh`
Expected: both pass with no new failures.

- [ ] **Step 7: Lint and commit**

```bash
cd web && npx prettier --write e2e/learning-record.spec.ts src/screens/LearningRecord.tsx src/screens/LearningRecord.module.css src/app/routes.tsx src/screens/DiaryHome.tsx src/screens/DiaryHome.module.css && npm run lint && cd ..
git add web/e2e/learning-record.spec.ts web/src/screens/LearningRecord.tsx web/src/screens/LearningRecord.module.css web/src/app/routes.tsx web/src/screens/DiaryHome.tsx web/src/screens/DiaryHome.module.css
git commit -m "feat(web): your learning record, a competency by sprint table per gig (CAP-53)"
```

---

### Task 5: The ADR and the documents

**Files:**

- Modify: `docs/adr/architecture-decision-records.md` (index line and a new record at the end)
- Modify: `docs/Design-Inventory.md` (rows `66:34` and `86:936`; Counts)
- Modify: `docs/Stack-and-Build-Scope.md` (§4.3 screens)
- Modify: `docs/Demo-Script.md` (sections 1 and 2)
- Modify: `docs/CHANGELOG.md` (Sprint 5, `### Added`)

Load `/write-adr` before writing the record and follow its voice: plain, no em dashes, honest
negatives.

- [ ] **Step 1: Find the next free ADR number**

Run: `git fetch -q origin && git show origin/dev:docs/adr/architecture-decision-records.md | grep -E "^ADR #[0-9]+:" | tail -1`
Expected: `ADR #62: The live demo runs ...` or a later number. Use the next one (call it N).
If HO-9's records have landed, N is after them.

- [ ] **Step 2: Write ADR #N**

Append, after a `=====` separator matching the file's existing separators:

```
ADR #N: The learning record reads the analytics endpoints and adds none
Status: Proposed
Date: 2026-10-09

Context:
The Figma prototype's "Your learning record" frame (86:936) draws a competency by sprint grid of self and assessor scores, one section per gig. The build left it out with no recorded reason (Design-Inventory.md). GET /me/progress already returns exactly that grid for one gig, read from v_radar and so from v_entry_score, which holds the rule that the latest counter-score counts. GET /frameworks/{id} carries the rows and the scale. The Assessment 3 report counts what has merged by 12 October, and the live demo deploys dev, so a contract change now would ripple through the API, the generated types and the deploy five days before v1.0.0.

Decision:
/record is built from GET /gigs, GET /reflections, and per gig GET /me/progress and GET /frameworks/{id}. No endpoint is added and docs/openapi.yaml does not change. The screen never reads entries[].scores to decide a number.

Consequences:
Positive:
No contract, schema or backend change, and nothing to migrate on the live demo. The rule about which score counts stays in one place. The grid matches the radar because both read v_radar.

Negative:
Two requests per gig on top of two for the page. Five for Jane, more for a student on many gigs. The framework read is only for the row list and the scale, which a purpose-built endpoint would return alongside the grid.

Alternatives:
A GET /me/record endpoint returning every gig's grid, rows and scale in one response. It is the better shape if the request count ever matters, and the obvious follow-up. It loses now because it needs a contract change, a controller reading the views, a feature test and regenerated types before 12 October.

Reading the JSON export. It already carries the whole record, but it is an asynchronous job meant to be downloaded as a file, and the browser would have to choose among scores itself, which duplicates the rule.
```

Add `- ADR #N: The learning record reads the analytics endpoints and adds none` to the index at
the top, in the same format as the neighbouring lines (check the line for #62 and copy its
shape exactly).

- [ ] **Step 3: Update the design inventory**

In `docs/Design-Inventory.md`:

- Row `86:936`: "Built as" becomes `Your learning record, /record, web/src/screens/LearningRecord.tsx`;
  status stays `changed`; "What changed and why" becomes: "One table per gig rather than per
  framework, headed by the rubric's name. The summary drops the frame's promise that the
  record outlives graduation, which is the host app's to make. Export record opens the same
  sheet as the diary home." Evidence: `CAP-53; ADR #N`.
- Row `66:34`: in "What changed and why", replace the clause about the nudge with: "The
  "sprints need your reflection" line is built (CAP-53), on a card above the radar, without
  "this week"." Keep the rest of the row, including its TODO.
- Counts: unchanged statuses means unchanged counts. Check the Counts table still adds up.

- [ ] **Step 4: Update the scope and the demo script**

`docs/Stack-and-Build-Scope.md` §4.3: change "**Screens.** Ten," to "**Screens.** Eleven," and
under _Student_, after the Diary home item, add:

```
- [x] Your learning record (`/record`): one competency by sprint table of self and assessor
      scores per gig, from `GET /me/progress`, with Export record (CAP-53, ADR #N)
```

And to the Diary home item's text, append: "A card names the sprints that need a reflection
and starts the earliest (CAP-53)."

`docs/Demo-Script.md`:

- Section 1, after step 3 (the SFIA gig), insert a step and renumber:
  "4. **Your learning record ›**, under the list. Every gig Jane has written on, as a table of
  competency against sprint, her score and her assessor's in each cell. Each gig keeps its own
  scale. This is the record she keeps."
- Section 2, step 1: replace "Pick **Develop AI use cases** (the La Trobe gig) and press **Gig
  details ›**. The sprints are listed with their due dates. Sprint 1 holds her draft." with
  "Pick **Develop AI use cases** (the La Trobe gig). The card above the radar says which sprint
  needs her reflection. Sprint 1 holds her draft." and step 2 with "Press **Start reflection**
  on that card: the draft is created and opens in the stepper, which goes one competency at a
  time. (The same button is on each empty sprint under **Gig details ›**.)"

`docs/CHANGELOG.md`, under `## Sprint 5` → `### Added`, add:

```
- Your learning record at `/record`: a competency by sprint table of self and assessor scores
  per gig, from the prototype's frame `86:936` (CAP-53).
- The diary home names the sprints that need a reflection and starts the earliest, from the
  prototype's hub frame `66:34` (CAP-53).
```

- [ ] **Step 5: Check and commit**

Run: `python3 scripts/check-docs.py && npx prettier --check docs/Design-Inventory.md docs/Demo-Script.md docs/CHANGELOG.md docs/Stack-and-Build-Scope.md`
Expected: `N passed, 0 failed` and prettier clean (run `--write` on any it flags, then re-check).

```bash
git add docs/adr/architecture-decision-records.md docs/Design-Inventory.md docs/Stack-and-Build-Scope.md docs/Demo-Script.md docs/CHANGELOG.md
git commit -m "docs: ADR #N, the learning record reads existing endpoints; inventory, scope, demo script (CAP-53)"
```

---

### Task 6: Whole-branch verification and the pull request

**Files:** none new.

- [ ] **Step 1: Run every gate and read each output**

```bash
cd web && npm run build && npm run lint && npx playwright test 2>&1 | tail -5 && cd ..
./run verify-gig 2>&1 | sed -n '/^==> 5/,/^==> 6/p'
python3 scripts/check-docs.py
node scripts/check-contrast.mjs
bash scripts/check-bundle-secrets.sh
```

Expected: build succeeds; lint clean; Playwright `N passed` with no failures (a known flaky
CAP-38 layout test may fail once: re-run it alone and quote both results); section 5 `ok ...
needing 7`; docs `0 failed`; contrast and bundle checks pass.

- [ ] **Step 2: Look at both screens**

With `./run demo` (shared database reachable) or `./run dev` against the fake, open `/` and
`/record` as Jane at 360 px and at 1280 px wide. Check: the nudge card reads well beside the
picker; the record's tables line up; nothing scrolls the page sideways; dark mode (⋮ → Dark
mode) keeps every colour legible. Save screenshots to the session scratchpad, not the repo.

- [ ] **Step 3: Push and open the pull request**

Only when the person asks. Then:

```bash
git push -u origin feat/CAP-53-portfolio-and-journey
gh pr create --base dev --title "feat(web): your learning record and the reflection nudge (CAP-53)" --body-file <scratchpad>/pr-cap53.md --reviewer <Patrick's GitHub login>
```

The body says what was built, which Figma frames, that no endpoint or schema changed, the ADR,
the tests that failed first, and that merging deploys it to the live demo.

- [ ] **Step 4: Jira**

When the branch has its first commit: move CAP-53 (COA4-123) to In Progress (transition 21),
then comment that the scope narrowed to the learning record and the nudge, linking this plan
and the revised spec, and that Portfolio and "Sent for review" were dropped because the design
inventory marks the profile `host app` and the prototype's wording is "Submit entry". When CI
is green on the PR: In Review (31). Done only after merge and each criterion checked.
