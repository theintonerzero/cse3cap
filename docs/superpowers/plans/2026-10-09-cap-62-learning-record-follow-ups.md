# CAP-62 · Learning record and nudge follow-ups: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the four Minor findings the whole-branch review of CAP-53 (PR #128) deferred:
the nudge on a gig with no rubric, keyboard and screen-reader access to the record's tables,
the summary's reflection count, and the stale "ten screens" count.

**Architecture:** Small changes to the two CAP-53 screens and four documents. No endpoint,
contract, schema or business-rule change. Each behaviour change is pinned by a Playwright spec
that fails first.

**Tech Stack:** React 19, TypeScript, CSS modules over `web/src/tokens.css`, Playwright against
`web/e2e/fake-api.ts` (ADR #42).

**Spec:** Jira CAP-62 (COA4-132), whose five acceptance criteria are the requirements. Background:
`docs/superpowers/specs/2026-10-09-cap-53-learning-record-and-nudge-design.md` and the CAP-53
review findings 3 to 6 quoted in PR #128.

## Global Constraints

- Starts after PR #128 has merged. Branch `fix/CAP-62-learning-record-follow-ups` off `dev`.
- No change to `docs/openapi.yaml`, `db/`, `api/` or `web/src/api/schema.ts`.
- No raw hex or pixel values: tokens only. The focus ring follows `ReviewQueue.module.css`:
  `outline: 0.125rem solid var(--color-focus-ring); outline-offset: 0.0625rem;`.
- snake_case names, as the surrounding code does.
- ADRs and plans are history: never edit one to change a count.
- Markdown tables in `docs/Design-Inventory.md` are prettier-aligned. Keep every new cell no
  wider than its column's current widest cell (column 4: 102 characters, column 7: 116), so
  prettier does not realign the whole table. Do not run prettier on the ADR register, the
  scope document or the changelog: they are not prettier-formatted and CI checks `web/` only.
- `npx prettier --write` and `npm run lint` on every `web/` file before its commit.
- Every spec asserts `api.unexpected` stays empty (the existing fixtures already do).

## Review Focus

1. **A student whose only open sprints are on a rubric-less gig.** With the fix, All gigs shows
   no nudge at all rather than "0 sprints". Task 1 tests the count excludes them; check the zero
   case renders nothing (it does: `needing.length === 0` returns null).
2. **A table that does not overflow.** The scroll box is focusable anyway. One extra tab stop per
   gig is the accepted cost, and axe's `scrollable-region-focusable` is satisfied either way.
3. **Screen readers reading a cell.** A cell's column header is now "Sprint 1". Check the cell
   still reads "self 3, assessor 4" after the header, not "S1".
4. **The Export sheet still gets the whole record**, not the sectioned subset. Task 3 changes the
   summary only.
5. **Design inventory alignment.** A cell one character too wide realigns 45 rows. Check
   `git diff --stat docs/Design-Inventory.md` is a handful of lines.

---

### Task 1: No nudge for a gig with no rubric

**Files:**
- Modify: `web/e2e/diary-nudge.spec.ts` (the `gig()` helper, `GIGS`, the All gigs test, a new test)
- Modify: `web/src/screens/DiaryHome.tsx` (`ReflectionNudge`, the `needing` computation)

**Interfaces:** none new.

- [ ] **Step 1: Write the failing test**

In `web/e2e/diary-nudge.spec.ts`, give `gig()` an optional rubric flag. Change its signature and
its `framework` line:

```ts
function gig(
  gig_id: string,
  title: string,
  role: 'student' | 'assessor',
  sprints: { id: string; dates: typeof PAST }[],
  has_rubric = true,
): GigDetail {
```

```ts
    framework: has_rubric
      ? { id: FRAMEWORK, fw_key: 'latrobe6', name: RUBRIC.name, version: 'v1' }
      : null,
```

Add ids beside the others:

```ts
const NO_RUBRIC_GIG = id('0e00');
const E1 = id('0e11');
```

Add to the end of `GIGS`, with a comment:

```ts
  // No rubric yet: starting a reflection here can only answer "This gig has
  // no rubric yet", so its open sprint is never offered (CAP-62).
  gig(NO_RUBRIC_GIG, 'Unassigned gig', 'student', [{ id: E1, dates: PAST }], false),
```

The All gigs test's expectation stays `'3 sprints need your reflection. Pick a gig to start.'`
(it fails now, reading 4). Add a test after it:

```ts
test('a gig with no rubric shows no nudge, though its sprint is open', async ({ page }) => {
  await page.goto(`/?gig_id=${NO_RUBRIC_GIG}`);

  await expect(page.getByRole('button', { name: 'Gig details ›' })).toBeEnabled();
  await expect(nudge(page)).toHaveCount(0);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd web && npx playwright test e2e/diary-nudge.spec.ts`
Expected: two failures. "all gigs" reads `4 sprints need your reflection.`; "a gig with no
rubric" finds the nudge (count 1, expected 0). The other tests pass.

- [ ] **Step 3: Implement**

In `web/src/screens/DiaryHome.tsx`, `ReflectionNudge`, replace:

```tsx
  const needing = gig
    ? sprints_needing_reflection(gig.sprints, written, today)
    : gigs.flatMap((one) => sprints_needing_reflection(one.sprints, written, today));
```

with:

```tsx
  // A gig with no rubric yet cannot take a reflection (POST /reflections
  // answers FRAMEWORK_NOT_ASSIGNED), so its sprints are not offered or
  // counted. A display decision: the server still decides (CAP-62).
  const startable = (one: Gig) => one.framework !== null;
  const needing = gig
    ? startable(gig)
      ? sprints_needing_reflection(gig.sprints, written, today)
      : []
    : gigs
        .filter(startable)
        .flatMap((one) => sprints_needing_reflection(one.sprints, written, today));
```

- [ ] **Step 4: Run it and watch it pass**

Run: `cd web && npx playwright test e2e/diary-nudge.spec.ts e2e/diary-home.spec.ts e2e/diary-home-one-gig.spec.ts`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
cd web && npx prettier --write e2e/diary-nudge.spec.ts src/screens/DiaryHome.tsx && npm run lint && cd ..
git add web/e2e/diary-nudge.spec.ts web/src/screens/DiaryHome.tsx
git commit -m "fix(web): the nudge never offers a sprint on a gig with no rubric (CAP-62)"
```

---

### Task 2: The record's tables are keyboard-reachable and read "Sprint N"

**Files:**
- Modify: `web/e2e/learning-record.spec.ts` (a new test after "the summary, one section per written gig…")
- Modify: `web/src/screens/LearningRecord.tsx` (the `.scroller` div, about line 261; the sprint `<th>`, about line 270)
- Modify: `web/src/screens/LearningRecord.module.css` (`.scroller:focus-visible`)

**Interfaces:** none new.

- [ ] **Step 1: Write the failing test**

Add to `web/e2e/learning-record.spec.ts`, after the first test:

```ts
test('each table can be reached from the keyboard and names its sprints in full', async ({
  page,
}) => {
  await page.goto('/record');

  // Safari does not focus a scroll box on its own, so a wide table could
  // not be scrolled without a mouse. The box is a named, focusable region.
  const region = page.getByRole('region', { name: 'Develop AI use cases, scores by sprint' });
  await expect(region).toHaveAttribute('tabindex', '0');
  await region.focus();
  await expect(region).toBeFocused();

  // "S1" is read aloud as "S one"; the header's name is the word.
  const headers = section(page, 'Develop AI use cases').getByRole('columnheader');
  await expect(headers.nth(1)).toHaveAccessibleName('Sprint 1');
  await expect(headers.nth(3)).toHaveAccessibleName('Sprint 3');
  // The visible text stays short, as the frame draws it.
  await expect(headers.nth(1)).toHaveText('S1');
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd web && npx playwright test e2e/learning-record.spec.ts -g "keyboard"`
Expected: FAIL at `getByRole('region', …)`: no element found.

- [ ] **Step 3: Implement**

In `web/src/screens/LearningRecord.tsx`, replace `<div className={styles.scroller}>` with:

```tsx
        {/* Focusable and named (CAP-62): Safari does not focus a scroll box
            on its own, so without this a wide table cannot be scrolled from
            the keyboard. */}
        <div
          className={styles.scroller}
          tabIndex={0}
          role="region"
          aria-label={`${gig.title}, scores by sprint`}
        >
```

and the sprint header:

```tsx
                  <th key={sprint.id} scope="col" aria-label={`Sprint ${sprint.ordinal}`}>
                    S{sprint.ordinal}
                  </th>
```

In `web/src/screens/LearningRecord.module.css`, after the `.scroller` rule, add:

```css
.scroller:focus-visible {
  outline: 0.125rem solid var(--color-focus-ring);
  outline-offset: 0.0625rem;
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `cd web && npx playwright test e2e/learning-record.spec.ts && cd .. && bash scripts/check-tokens.sh`
Expected: all pass (10 tests), and "No raw hex or magic pixel values outside tokens.css."

- [ ] **Step 5: Commit**

```bash
cd web && npx prettier --write e2e/learning-record.spec.ts src/screens/LearningRecord.tsx src/screens/LearningRecord.module.css && npm run lint && cd ..
git add web/e2e/learning-record.spec.ts web/src/screens/LearningRecord.tsx web/src/screens/LearningRecord.module.css
git commit -m "fix(web): the record's tables take keyboard focus and name their sprints in full (CAP-62)"
```

---

### Task 3: The summary counts what the sections show

**Files:**
- Modify: `web/e2e/learning-record.spec.ts` (`REFLECTIONS`)
- Modify: `web/src/screens/LearningRecord.tsx` (`Summary`, about lines 204-235; its call, about line 175)

**Interfaces:**
- Changes: `Summary({ sections })`. The `record` prop is removed. `ExportSheet` keeps
  `reflections={load.record}`.

- [ ] **Step 1: Write the failing test**

In `web/e2e/learning-record.spec.ts`, add to `REFLECTIONS`, after the `f003` line:

```ts
  // On the gig with no rubric: Ash's, but that gig has no section, so the
  // summary must not count it (CAP-62). Unreachable through the API today,
  // which refuses a reflection on a gig with no rubric; held by construction.
  reflection(id('f005'), GIG_NO_RUBRIC, 1, 'draft'),
```

The first test's `'3 reflections · 2 gigs'` expectation stays as it is.

- [ ] **Step 2: Run it and watch it fail**

Run: `cd web && npx playwright test e2e/learning-record.spec.ts -g "the summary"`
Expected: FAIL: `getByText('3 reflections · 2 gigs')` not found (the page reads "4 reflections ·
2 gigs").

- [ ] **Step 3: Implement**

In `web/src/screens/LearningRecord.tsx`, change the call to `<Summary sections={load.sections} />`
and the component to:

```tsx
/**
 * "3 reflections · 2 gigs", "2 rubrics · since 3 August 2026". Counted from
 * the sections, so the numbers describe what is on the page (CAP-62).
 */
function Summary({ sections }: { sections: RecordSection[] }) {
  const reflections = sections.reduce((count, section) => count + section.reflections.length, 0);
```

and in its body replace `plural(record.length, 'reflection', 'reflections')` with
`plural(reflections, 'reflection', 'reflections')`. Leave the rest of `Summary` and the
`ExportSheet` call unchanged.

- [ ] **Step 4: Run it and watch it pass**

Run: `cd web && npx tsc -b && npx playwright test e2e/learning-record.spec.ts`
Expected: tsc silent; all pass.

- [ ] **Step 5: Commit**

```bash
cd web && npx prettier --write e2e/learning-record.spec.ts src/screens/LearningRecord.tsx && npm run lint && cd ..
git add web/e2e/learning-record.spec.ts web/src/screens/LearningRecord.tsx
git commit -m "fix(web): the record's summary counts the reflections its sections show (CAP-62)"
```

---

### Task 4: No stale screen count

**Files:**
- Modify: `docs/Stack-and-Build-Scope.md:12`
- Modify: `docs/Design-Inventory.md` (line 30, and rows `81:701` and `81:851`)
- Modify: `.claude/agents/frontend-screen.md:3`
- Modify: `.claude/skills/design-inventory/SKILL.md:89`

Not changed, on purpose: `README.md` lines 24 and 30 say "the ten core components", which is
the component count and still true; ADRs and plans are history.

- [ ] **Step 1: Confirm the list**

Run: `git grep -n -iE "(^|[^a-z])ten (diary )?screens" -- docs README.md .claude ':!docs/superpowers' ':!docs/adr'`
Expected: exactly the four files above (Design-Inventory three times).

- [ ] **Step 2: Edit**

- `docs/Stack-and-Build-Scope.md:12`: "Ten screens across three roles" → "Eleven screens across
  three roles".
- `docs/Design-Inventory.md:30`: "The team scoped ten diary screens" → "The team scoped eleven
  diary screens".
- `docs/Design-Inventory.md`, rows `81:701` and `81:851`, evidence column:
  "`docs/Stack-and-Build-Scope.md` §4.3, ten diary screens and no profile" →
  "`docs/Stack-and-Build-Scope.md` §4.3, eleven diary screens and no profile". One character
  longer than before: check it stays within the column's 116.
- `docs/Design-Inventory.md`, row `81:851`, "Built as" column: "None. The diary is reached at
  `/`" → "None. Its learning record card would open `/record` (CAP-53)". Within 102.
- `.claude/agents/frontend-screen.md:3`: "Covers the ten screens" → "Covers the eleven screens".
- `.claude/skills/design-inventory/SKILL.md:89`: "§4.3: the ten screens" → "§4.3: the eleven
  screens".

Edit the inventory cells in place. Do not run prettier on `Stack-and-Build-Scope.md`.

- [ ] **Step 3: Check**

Run: `git grep -n -iE "(^|[^a-z])ten (diary )?screens" -- docs README.md .claude ':!docs/superpowers' ':!docs/adr'; git diff --stat; python3 scripts/check-docs.py | tail -1; npx --prefix web prettier --check docs/Design-Inventory.md`
Expected: the grep prints nothing; `Design-Inventory.md` changes 4 lines at most; check-docs
`0 failed`; prettier clean on the inventory.

- [ ] **Step 4: Commit**

```bash
git add docs/Stack-and-Build-Scope.md docs/Design-Inventory.md .claude/agents/frontend-screen.md .claude/skills/design-inventory/SKILL.md
git commit -m "docs: eleven screens since the learning record (CAP-62)"
```

---

### Task 5: Verify and hand over

- [ ] **Step 1: Every gate**

```bash
cd web && npx tsc -b && npm run lint && npx prettier --check . && npm run build && npx playwright test 2>&1 | tail -4 && cd ..
python3 scripts/check-docs.py | tail -1 && node scripts/check-contrast.mjs | tail -1 && bash scripts/check-tokens.sh
```

Expected: all green. `firefox.spec.ts` "dragging a sheet by its handle closes it" has timed out
under full-suite load before (CAP-53); if it fails, run that file alone three times and quote
both results.

- [ ] **Step 2: Look**

`/record` at 360px: Tab moves focus onto each table's box and the ring is visible; arrow keys
scroll a wide one. Light and dark.

- [ ] **Step 3: Pull request and Jira**

When the person asks: push, open the PR into `dev` with Patrick (`RickLTCS`) as reviewer, and
move CAP-62 (COA4-132) to In Progress at the first commit and In Review when CI is green. Done
only after merge, with each of the five criteria checked against `dev`.
