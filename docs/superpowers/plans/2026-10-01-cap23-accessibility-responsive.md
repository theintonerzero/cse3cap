# CAP-23: Accessibility and Responsive Pass — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the two real, confirmed accessibility gaps (the radar has no non-visual equivalent; the contrast check's pair list has never been verified exhaustive against actual CSS usage), and replace three "looks correct on a code read" claims (BottomSheet's keyboard focus trap, 360px rendering) with real Playwright regression tests, so they stop being assumptions.

**Architecture:** This branches directly off `dev` (both HO-6 and CAP-21 are now merged into `dev`, so there is no stacking concern — this ruling from the plan's first draft is now moot and left here only as a historical note). Three independent tasks: a new accessible `<table>` inside `RadarPanel.tsx`, a completeness pass over `scripts/check-contrast.mjs`'s hand-maintained `PAIRS` list, and a new Playwright spec (`web/e2e/accessibility.spec.ts`, per ADR #42 — a real CI-covered regression test, not a screenshot a human eyeballs) proving BottomSheet's focus trap and every screen's 360px rendering, both of which the audit found could only be confirmed by actually driving a browser.

**Tech Stack:** `recharts` (already in use), the existing `FakeApi`/fixtures pattern from `web/e2e/fixtures.ts`, Playwright's keyboard (`page.keyboard.press`) and viewport (`page.setViewportSize`) APIs.

**Spec:** COA4-81 (CAP-23 · Accessibility and responsive pass). Acceptance criteria, verbatim:
1. Every interactive element reachable by keyboard with a visible focus ring.
2. Correct roles/labels on the stepper and sheets (where this usually breaks).
3. Contrast AA in both themes, re-checked rather than assumed from CAP-1.
4. Usable at 360px and at desktop width.
5. The radar has a non-visual equivalent — a table of the same numbers — since colour alone cannot carry self versus assessor.
"Depends on CAP-21" per the ticket's own text (now merged, see Architecture).

**Audit result (already performed, read-only, against the whole frontend):**

| Criterion | Found | Verdict |
|---|---|---|
| 1. Keyboard + focus rings | No fake interactive elements (`<div onClick>`); every `outline: none` is paired with a restoring `:focus-visible` rule (the correct modern pattern, not suppression); `BottomSheet.tsx` already has a full focus trap, Escape-to-close, and return-focus-on-close implementation | Compliant on a code read — **but focus-trap/return-focus timing is exactly the kind of thing that can look right on a read and misbehave at runtime** (Task 3) |
| 2. Roles/labels, stepper + sheets | Already the richest a11y coverage in the app: `role="group"`+`aria-label` on level pickers, `role="alert"` on errors, real `<label htmlFor>` pairing throughout, full ARIA on `ProgressBar`, `role="dialog"`+`aria-modal` on `BottomSheet` | Compliant |
| 3. Contrast AA, both themes | `scripts/check-contrast.mjs` currently passes all 42 listed pairs in both themes (lowest margins ~4.5:1, just over the 4.5:1 AA threshold for normal text) | Compliant **for the pairs it checks** — but `PAIRS` is hand-maintained, not derived from actual CSS, so completeness has never been verified (Task 2) |
| 4. 360px usability | No raw pixel widths anywhere (`check-tokens.sh` already enforces this); every `max-width` found is well above 360px; one fixed `20rem` (320px) loading-skeleton circle in `RadarPanel.tsx:155` fits with little margin | Likely compliant, but **this is a static CSS read, not a rendered viewport** — real overflow (text wrap, the radar SVG's own internal layout, the stepper's level-picker row) can only be confirmed by actually loading each screen at 360px (Task 3) |
| 5. Radar non-visual equivalent | **Confirmed missing.** `RadarPanel.tsx`'s `LoadedRadar` is a `recharts` SVG only; its `<Legend>` labels which line is which by colour/dash-pattern but exposes no actual number to a non-visual reader | **Real gap — new work** (Task 1) |

## Global Constraints

- New Playwright spec goes in `web/e2e/` (CI-covered, per ADR #42), never `web/e2e/shots/` (HO-6's separate, non-CI documentation tool) — this ticket's regression tests must actually run in CI, not be a manual screenshot someone eyeballs.
- No raw pixel values, no raw hex colours (CLAUDE.md, enforced by `scripts/check-tokens.sh`). The radar table's styling (Task 1) uses the same `--space-*`/token conventions as the rest of the codebase.
- If Task 2 or Task 3's verification finds something actually broken (not just unverified), fix it in this branch — this ticket's whole premise is "re-checked rather than assumed," so a verification task that finds a real defect and doesn't fix it has failed its own purpose.
- Before starting, confirm `dev` is current (`git log --oneline -1 dev` should show CAP-21's merge commit) and that `web/e2e/shots/` already exists from HO-6/CAP-21 — this plan's Task 3 does not touch that directory, but an implementer should not be confused by its presence into thinking screenshots satisfy this ticket's regression-test requirement. They don't; a screenshot is not a Playwright assertion.

---

## Task 1: A non-visual table equivalent for the radar

**Files:**
- Modify: `web/src/components/RadarPanel/RadarPanel.tsx`
- Modify: `web/src/components/RadarPanel/RadarPanel.module.css`

**Interfaces:**
- Consumes: `RadarAxis[]` (already defined, unchanged) — `{ code, short_label, position, self, counter }`.
- No new props; the table is built from the same `sorted`/`self_has_data`/`counter_has_data` values `LoadedRadar` already computes.

- [x] **Step 1: Add the table to `LoadedRadar`**

In `web/src/components/RadarPanel/RadarPanel.tsx`, inside `LoadedRadar` (around line 97), add a visually-hidden-but-screen-reader-available table alongside the chart. This is a *non-visual* equivalent specifically — the existing dasharray-plus-hollow-dot encoding on the counter series already gives sighted colour-weak users a second visual channel; what's missing is anything for a screen reader, which gets nothing at all from an SVG chart.

```tsx
      <ResponsiveContainer width="100%" height={320}>
        {/* ... existing RadarChart, unchanged ... */}
      </ResponsiveContainer>
      <table className={styles.sr_only}>
        <caption>The radar above, as numbers: self-score and counter-score per competency.</caption>
        <thead>
          <tr>
            <th scope="col">Competency</th>
            <th scope="col">Self</th>
            <th scope="col">Counter-score</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((axis) => (
            <tr key={axis.code}>
              <th scope="row">{axis.short_label ?? axis.code}</th>
              <td>{axis.self ?? 'Not yet scored'}</td>
              <td>{axis.counter ?? 'Not yet scored'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

Place the closing `</div>` correctly — the table goes inside `.panel`, as a sibling after `ResponsiveContainer`, before the existing function's closing brace.

- [x] **Step 2: Add the `sr_only` class**

In `web/src/components/RadarPanel/RadarPanel.module.css`, add a class matching the exact visually-hidden pattern already used in `web/src/components/Skeleton/Skeleton.module.css`'s `.sr_only` (read that file first to copy its real declaration verbatim — do not approximate it, the exact properties matter for correct behaviour across screen readers):

```css
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

- [x] **Step 3: Write a test proving the table exists and carries real data**

This is a pure-rendering check, not a browser E2E test — `RadarPanel` has no API calls of its own (ownership split, per its own file comment: the screen that embeds it owns the fetch). Check whether this codebase has any component-level render-testing convention already (grep for an existing `.test.tsx` or similar next to a component) before deciding how to test this. If none exists, the fastest honest check is a Playwright assertion added to Task 3's new spec instead (query the table's `<td>` text content against known fixture values on whichever screen embeds `RadarPanel` with real data — Diary Home is the natural one). Do not invent a new test runner or a new testing convention for one component (CLAUDE.md: "choosing a unit runner is still an ADR") — fold the assertion into Task 3's spec and note here that you did so, rather than skip verification.

- [x] **Step 4: Visual check — this table must not appear visually**

Run `./run web` (or `./run dev`) and load any screen with a loaded radar (Diary Home, with Jane's seeded token). Confirm the chart looks completely unchanged — no visible table, no layout shift. This is the whole point of `sr_only`; a visible regression here is the most likely way this task goes wrong.

- [x] **Step 5: Commit**

```bash
git add web/src/components/RadarPanel
git commit -m "feat(web): non-visual table equivalent for the radar (CAP-23)"
```

---

## Task 2: Verify the contrast check's pair list is actually exhaustive

**Files:**
- Modify: `scripts/check-contrast.mjs` (add any missing pairs found)
- Possibly modify: `web/src/tokens.css` (only if a newly-added pair actually fails AA — a real finding, not expected, but this ticket's premise is "re-checked rather than assumed," so do not skip fixing one if it turns up)

**Interfaces:**
- Consumes: nothing new. Produces: an updated `PAIRS` array other code doesn't reference.

- [x] **Step 1: Find every foreground/background colour pair actually rendered**

`PAIRS` (lines 26-51) is hand-maintained — a comment next to it says "add a row here whenever a screen puts one token's text on another token's background." Verify this has actually kept up. Search every `web/src/**/*.module.css` file for a `color: var(--color-*)` declaration, and for each one found, identify what background it is actually rendered against — usually a `background`/`background-color: var(--color-*)` in the same rule, but sometimes inherited from a parent (check the component's JSX structure when it's not in the same CSS rule). Build a complete list of every (foreground, background) pair this product actually puts text on.

- [x] **Step 2: Diff against `PAIRS`**

Compare the list Step 1 produced against the existing `PAIRS` array. For every pair found in real CSS that is NOT already in `PAIRS`, add it (matching the existing array's format: `[fg, bg, 'normal' | 'large']` — use `'large'` only for text that is genuinely large-scale per WCAG's definition, 18pt+/14pt+bold, matching the one existing `'large'` entry's own reasoning).

- [x] **Step 3: Run it**

Run: `node scripts/check-contrast.mjs`
Expected: every pair, including any newly added, prints `ok`. If anything prints `FAIL`, that is a real, previously-unverified AA violation — fix it by adjusting the failing token's value in `web/src/tokens.css` (not by deleting the pair from `PAIRS` to make the check pass, which would defeat the entire point of this task), re-run, and confirm it now passes in both themes. Note in your completion report exactly which pairs were added and whether any required a token value change.

- [x] **Step 4: Re-run the full check suite**

Run: `./run check`
Expected: passes (this step already includes `node scripts/check-contrast.mjs` per the existing `run` script) — confirms this change integrates cleanly with everything else, not just in isolation.

- [x] **Step 5: Commit**

```bash
git add scripts/check-contrast.mjs
# also: git add web/src/tokens.css   -- only if Step 3 required a token fix
git commit -m "test(a11y): verify the contrast pair list is exhaustive against actual CSS (CAP-23)"
```

---

## Task 3: Playwright verification — BottomSheet focus trap and 360px rendering

**Files:**
- Create: `web/e2e/accessibility.spec.ts`

**Interfaces:**
- Consumes: `FakeApi` and fixture-building patterns from `web/e2e/fake-api.ts` and `web/e2e/fixtures.ts`. The shared `test`/`api` fixture in `fixtures.ts` signs in as `DR_LEE`, a supervisor with no student participation — `Home()` (`web/src/app/routes.tsx`) redirects a non-student to `/review-queue`, so the shared fixture cannot reach Diary Home, Gig Detail, or either BottomSheet-opening screen (History Sheet, Export Sheet). `submitted.spec.ts`'s own comment already documents hitting this exact wall. Do not fight it — follow the precedent HO-6 already set (`web/e2e/shots/fixtures.ts`) and build a small, self-contained `FakeApi` scenario with a student identity directly in this new spec file, rather than trying to extend the shared CI fixture to cover a role it was never scoped for.

- [x] **Step 1: Write the BottomSheet focus-trap test**

Build a minimal student-identity `FakeApi` scenario (a `Me` with a `student` participation, one gig, one reflection) sufficient to reach a screen that opens a `BottomSheet` — read `web/src/screens/HistorySheet.tsx` and `web/src/screens/GigDetail.tsx` to confirm exactly how the sheet is triggered (what button, what route) and what minimum fixture data it needs to render without erroring.

Write a test that:
1. Navigates to the screen, opens the sheet (click the trigger).
2. Asserts focus moved into the sheet (`page.locator(...).evaluate(el => document.activeElement === el)` or Playwright's `toBeFocused()` on whatever the sheet focuses first per `BottomSheet.tsx:28-65`).
3. Presses Tab repeatedly past the last focusable element inside the sheet and asserts focus wraps back to the first one (not out into the page behind it) — this is the actual trap; test it round-trips, not just that focus started inside.
4. Presses `Escape` and asserts the sheet closes (its dialog role element is no longer visible/attached).
5. Asserts focus returned to the original trigger button.

- [x] **Step 2: Write the 360px no-overflow test**

For every screen reachable via a fake-API scenario (reuse the existing shared `DR_LEE` fixture for the screens it *can* reach — Select Framework, Edit Framework, Review Queue — and the new student scenario from Step 1 for the ones it can't), set the viewport to 360×800 (`page.setViewportSize({ width: 360, height: 800 })`) before navigating, then assert no horizontal overflow:

```typescript
const overflow = await page.evaluate(
  () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
);
expect(overflow).toBe(0);
```

Run this against the `loaded` state of every screen this spec can reach. Also include Diary Home with a radar present, and assert the table added in Task 1 Step 1 contains the expected cell text for at least one competency (folding Task 1 Step 3's deferred verification in here, as that task noted) — e.g. `expect(page.locator('table caption')).toHaveText(/radar above, as numbers/)` plus one `<td>` value check against the fixture's known self/counter scores.

- [x] **Step 3: Run it**

Run: `./run e2e -g "accessibility"`
Expected: every new test passes. If the 360px check fails on a specific screen, that is a real, previously-unverified layout defect (per this ticket's whole premise) — fix the overflowing element's CSS (using existing tokens, no raw pixels) rather than loosening the assertion, re-run, and confirm it now passes.

- [x] **Step 4: Run the full existing suite**

Run: `./run e2e`
Expected: the pre-existing suite is unaffected — this task only adds a new file.

- [x] **Step 5: Commit**

```bash
git add web/e2e/accessibility.spec.ts
git commit -m "test(a11y): BottomSheet focus trap and 360px rendering, with real assertions (CAP-23)"
```

---

## Self-Review Notes

**Spec coverage:** criterion 1 (keyboard+focus) — already compliant per the audit, Task 3 converts the "looks right" claim for BottomSheet specifically into a real regression test. Criterion 2 (roles/labels) — already compliant, no task needed (the audit found this is the app's strongest area already). Criterion 3 (contrast) — Task 2. Criterion 4 (360px) — Task 3. Criterion 5 (radar table) — Task 1.

**Known limitation stated plainly:** Task 3's 360px check only covers screens reachable via a fake-API scenario this plan builds (not literally every screen — Entry Stepper and Submitted are not included, since building their fixture scenarios is more involved and this plan's audit found no specific reason to suspect a problem there beyond the general "static CSS read isn't proof" caveat that applies everywhere equally). If the implementer has capacity to extend coverage to those two screens using the same pattern, that is a welcome addition within this task, not a requirement — note in the completion report which screens were actually covered.
