# CAP-66 Level Scale Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the entry stepper's stacked level pills with a one-row numbered level scale that has the chosen level's words beneath it. This is option A from the level-picker comparison, approved by Jesse on 2026-10-09 (Jira COA4-136).

**Architecture:**
- One `LevelScale` component in `web/src/components/`. It is a radio group of numbered segments, followed by a line of words and an "All levels" disclosure.
- It covers three uses: choosing (interactive), showing one score (static), and comparing several people's scores on one track (static, with a colour per person).
- The stepper's four pill lists become `LevelScale`s.
- On an assessed reflection, the student's self-score and the counter-scores merge into one shared scale. The comments follow it as they do today.
- The rubric's data, the API and the radar don't change.

**Tech Stack:** React 19, TypeScript, CSS modules on `web/src/tokens.css`, Playwright against `web/e2e/fake-api.ts`.

**Spec:** The approved artifact <https://claude.ai/artifact/3nZy1sUqtjxWZZSkRMk7ga>, option A, with the decision recorded in the conversation of 2026-10-09: A everywhere, with "All levels" open until a level is chosen on that competency. Acceptance criteria are on COA4-136.

## Global Constraints

- Tokens only, no raw hex or px (`scripts/check-tokens.sh`). Purple (`--color-primary`) is the student's own choice and green (`--color-success`) the assessor's, as now.
- Each level is a `role="radio"` named `"N of M, <descriptor>"` inside a `role="radiogroup"` named as the old group was ("Self-score", "Your score", "<Name>'s self-score").
- Arrow keys move the choice, with a roving tabindex. A pointer choice saves at once. A keyboard choice saves 500 ms after the arrows stop, so stepping from 1 to 4 sends one save.
- Every segment is at least 2.75rem wide and tall (the tap floor Button and Chip keep). Seven levels fit a 390px phone.
- "All levels" is open while nothing is chosen on an interactive scale, and folds once a level is chosen. It can be reopened. On a static scale it starts folded.
- The fake API serves shapes, never rules. `PUT /entries/:id/scores/self` gets a shape-only handler.

## Review Focus

- A keyboard user stepping through levels sends one self-score save, not one per step, and the saved level is the one they stopped on.
- A failed self-score save still says so (`score_error`), and the scale shows the level that was actually saved.
- Seven levels at 390px: no segment under the tap floor, and no horizontal scroll.
- A read-only reflection exposes no interactive radio: nothing in it can be changed by keyboard.
- An assessed reflection with two counter-scores (assessor and supervisor) shows both on the shared scale and both comments.

### Task 1: `LevelScale`, used for the student's self-score

**Files:** create `web/src/components/LevelScale/LevelScale.tsx` and `.module.css`, export them from `components/index.ts`. Modify `web/src/screens/EntryStepper.tsx` (`self_score_row`, `choose_level`) and `web/e2e/fake-api.ts` (`PUT /entries/:id/scores/self`). Test: `web/e2e/level-scale.spec.ts`.

**Produces:** `LevelScale({ label, levels, value, on_change?, tone?, marks?, describe_value? })`, where:
- `levels` is `{ id, level_value, descriptor }[]`;
- `value` is the chosen level id or null;
- `on_change(level_id, how: 'pointer' | 'key')` is given only when the scale can be changed;
- `marks` is `{ level_id, who, tone }[]`, the static people on a shared track.

- [ ] **Step 1:** Write `level-scale.spec.ts` against `ai-fixtures`' draft, adding a seven-level rubric fixture. Cases:
  - the radios carry "N of M" names with the descriptor;
  - nothing chosen means "All levels" is open and the words line says no level yet;
  - clicking 2 sends one save, shows "2 · <descriptor>" and folds the list;
  - "All levels" reopens it;
  - ArrowRight twice from 2 sends exactly one save, for 4;
  - an injected save failure shows the error and the scale shows the saved level;
  - at 390px with seven levels, every radio is at least 44px wide and the page has no horizontal scroll.
- [ ] **Step 2:** Run it and watch it fail.
- [ ] **Step 3:** Implement `LevelScale` and the fake's handler. Replace `self_score_row`'s chips; `choose_level` takes `how` and debounces `'key'`.
- [ ] **Step 4:** The spec, then the full e2e suite. Fix the specs that read the self-score group's buttons, moving them to radios.
- [ ] **Step 5:** Commit `feat(web): a one-row level scale for the self-score (CAP-66)`.

### Task 2: Read-only and assessed views share one scale

**Files:** modify `EntryStepper.tsx` (`counter_scores`, the read-only self row). Test: extend `level-scale.spec.ts`. Update `stepper-counter-scores.spec.ts`, `injection.spec.ts`, `stepper-ownership.spec.ts` and `calibration.spec.ts`.

- [ ] **Step 1:** Add the failing cases:
  - a submitted reflection shows a static scale with no enabled radio;
  - an assessed reflection shows one group, "Your score and Dr Lee's", with self and counter marked, a words line for each, then each comment;
  - with two counter-scores, both are marked and both comments show.
- [ ] **Step 2:** Run it and watch it fail.
- [ ] **Step 3:** Implement. In student mode, a read-only card with counter-scores renders one shared `LevelScale` (`marks` = self in primary, each counter in counter). Without counter-scores, it renders the static self scale. Comments render below in the same order and markup as today.
- [ ] **Step 4:** Run the specs and the full suite.
- [ ] **Step 5:** Commit `feat(web): an assessed reflection shows both scores on one scale (CAP-66)`.

### Task 3: The assessor's scale

**Files:** modify `EntryStepper.tsx` (assessor mode's self row, `CounterScorePanel`'s "Your score"). Update `scoring-submit.spec.ts` and `scoring-leave-mid-submit.spec.ts`. Test: extend `level-scale.spec.ts`.

- [ ] **Step 1:** Add the failing cases:
  - the assessor's "Your score" is a green interactive scale with a mark on the student's level;
  - picking a level updates the draft and sends nothing (ADR #57);
  - a given score shows as a static green scale.
- [ ] **Step 2:** Run it and watch it fail.
- [ ] **Step 3:** Implement. Assessor mode keeps the student's self row as a static scale named "<Name>'s self-score", merged with any other reviewers' counter-scores. Drafts change through `on_draft`, with no debounce.
- [ ] **Step 4:** The scoring specs, then the full suite.
- [ ] **Step 5:** Commit `feat(web): the assessor scores on the same scale (CAP-66)`.

### Task 4: ADR, checks, look, PR

- [ ] ADR #65 in `docs/adr/architecture-decision-records.md`, via `/write-adr`: the stacked pills give way to a one-row scale, why, and what it costs.
- [ ] Remove `Chip`'s and the stepper's dead level-row styles if nothing else uses them.
- [ ] Run lint, prettier, tsc, build, the full e2e suite, `./run verify-entry-stepper`, `./run verify-assessor-stepper`, tokens, contrast and `check-docs`.
- [ ] Look at the stepper at 390 and 1280, light and dark: draft, assessed, and the assessor.
- [ ] PR into `dev` with a reviewer, and comment on COA4-136.
