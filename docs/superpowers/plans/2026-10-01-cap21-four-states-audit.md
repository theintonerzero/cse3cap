# CAP-21: Four-States Audit Across Every Screen — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce the PR checklist CAP-21 requires — a screenshot per state per screen, for every screen in the product — and state plainly, with evidence, that the audit behind it found zero missing states.

**Architecture:** A read-only audit (already done, see below) found every screen already has all four states, with no spinners anywhere. The only real work left is evidence: extending HO-6's `web/e2e/shots/manifest.ts` (which already covers every screen's `loaded` state and full four-state coverage for two screens, Diary Home and Entry Stepper) to add `loading`/`empty`/`error` entries for the seven screens that don't have them yet, running `./run shots`, and assembling the checklist from the output. This branches off `feat/HO-6-screenshot-capture` rather than `dev`, because the tool this ticket needs to produce its own deliverable does not exist on `dev` yet.

**Tech Stack:** The exact mechanism Task 1-3 of HO-6 already built: `FakeApi`, `hold()`, `fail()`, the generic `capture.spec.ts` runner, `manifest.ts`'s `Shot` type. No new tooling.

**Spec:** COA4-79 (CAP-21 · Four-states audit across every screen). Acceptance criteria, verbatim:
1. Every screen demonstrates loaded/loading/empty/error (loading = skeleton, never spinner).
2. Error state surfaces the envelope's message and switches on code where it matters (particularly the submit gate reporting which entries failed).
3. A checklist in the PR with a screenshot per state per screen.
4. Nothing deferred out of this ticket.
"Depends on every screen ticket" — true now; all nine screens exist.

**Audit result (already performed, read-only, against all 9 screens in `web/src/screens/` plus `ErrorNotice.tsx`):** Criteria 1 and 2 are **already met everywhere**. No screen uses a spinner. Every screen has a loading skeleton, a designed empty state, and an error state via the shared `ErrorNotice` component, which itself switches on `UNAUTHENTICATED`, `ROLE_FORBIDDEN`, `NOT_FOUND` and transport-vs-4xx retryability; Entry Stepper additionally switches on the submit gate's `details.entry_ids` to highlight offending competencies (criterion 2's own named example), and Edit Framework switches on `FRAMEWORK_IN_USE` for a distinct frozen-state view. Three things looked like possible gaps on first pass and were each checked against their actual code and found to be correct, deliberate decisions, not defects:

- `SelectFramework.tsx`'s empty state (`LoadedState`, around line 110) tells a user to run `php artisan db:seed`. Its own comment explains why this is correct: "a database that has been seeded always has templates, so nothing at all means nothing has been seeded" — this state is only reachable with an unseeded database, which a real deployment never is. Dev-facing copy is the right copy for a dev-only state.
- `HistorySheet.tsx` (around line 110) and `GigDetail.tsx` (around line 352) have explanatory empty states with no action link. Checked and confirmed there is nothing actionable to offer in either case — history is a passive timeline, and sprints are not created from this frontend.
- `ExportSheet.tsx`'s in-progress state uses a pulsing dot, not a `Skeleton`. This is `docs/Stack-and-Build-Scope.md`'s own documented decision ("the in-progress one its own block and not the skeleton") for a background-job-progress indicator shown after the page has already loaded, not a page-load state.

**This plan makes no production code changes.** Its only output is test-tooling (the manifest extension) and documentation (the PR checklist). This is the honest result of a clean audit, not a shortcut — padding it with unneeded changes would violate CLAUDE.md's "don't add features... beyond what the task requires."

## Global Constraints

- No production code in `web/src/` changes. If a *later* task in this plan finds an actual gap while extending the manifest (a screen that turns out not to reach an `empty` or `error` state the way the audit assumed), that is a real finding — stop and say so rather than silently writing a manifest entry for a state the screen cannot actually produce.
- This branches from `feat/HO-6-screenshot-capture`, not `dev`. Both branches are unmerged; say this plainly in the final PR description so whoever merges does HO-6 first.
- Same database-safety rule as HO-6: nothing here touches the real backend. Every new manifest entry in this plan uses the fake API (loading/empty/error states always do, per HO-6's own Global Constraints, which this plan inherits).
- The checklist/screenshots are evidence for the PR, not repository content — they go in `web/e2e/shots/output/` (already gitignored test output, per HO-6), not committed, and the checklist markdown is assembled in the scratchpad for the person opening the PR to paste from and attach images to, not written into `docs/` (CLAUDE.md's docs-location rule is about documents the project keeps; a one-time PR-opening aid is neither that nor a repository check, so it does not belong in `docs/` or at the repository root).

---

## Task 1: Extend the manifest — loading, empty, error for the remaining seven screens

**Files:**
- Modify: `web/e2e/shots/fixtures.ts` (add whatever empty/error-shaped fixtures are missing — an empty gigs/reflections list is already a pattern from HO-6 Task 2's Diary Home empty entry; reuse it rather than inventing a new one)
- Modify: `web/e2e/shots/manifest.ts` (append entries)

**Interfaces:**
- Consumes: `Shot`, `FakeScenario` types and `JANE`/`SAM`/`DR_LEE`/`GIG`/`LA_TROBE_FRAMEWORK` fixtures, all already defined on this branch by HO-6 Tasks 1-3.

- [ ] **Step 1: Read each screen's loading/empty/error conditions**

For each of Gig Detail, Submitted, Export Sheet, History Sheet, Review Queue, Select Framework and Edit Framework, open the screen file and find:
- the exact `api.get(...)` route(s) it calls (the `hold()`/`fail()` key),
- the exact condition that renders empty (already known from the audit above for Gig Detail, History Sheet and Select Framework — confirm the file:line references still match, since this plan was written from a separate read-only pass and code may have moved),
- a literal string visible only in each state, for `ready`.

This is the same exercise HO-6's Task 2 Step 1 and Task 3 Step 1 already walked through for the other two screens — follow the identical method.

- [ ] **Step 2: Append manifest entries**

For each screen, add `<screen>-loading`, `<screen>-empty` and `<screen>-error` entries (desktop viewport only — HO-6's manifest already has every screen's `loaded` shot in both viewports; this task is filling in the other three states, not re-litigating viewport coverage), following the exact shape HO-6's Task 2 Step 3 established for Diary Home's loading/empty/error entries. Do not duplicate an existing `<screen>-loaded` entry — this task only adds the three states that are missing.

For Select Framework's empty state specifically: use `gigs: []` or whatever combination of fixtures actually produces `templates.length === 0 && copies.length === 0` per Step 1's reading of `group_frameworks` — this is the one state in this task that is reachable only with an unseeded-shaped fixture, matching the audit's own finding about when it occurs.

For Export Sheet: there is no `loading` state to add (confirmed by the audit: it receives `reflections` as a prop already loaded by its parent, so it never fetches on mount). Add only `export-sheet-empty` and `export-sheet-error`; note this explicitly in the task's completion report rather than silently shipping two entries where the pattern implies three.

- [ ] **Step 3: Run it**

Run: `./run shots`
Expected: every new entry's PNG appears in `web/e2e/shots/output/`. Spot-check at least two of the new `error` screenshots by opening the PNG directly (not just trusting the test passed) and confirming the rendered text actually matches the error copy expected for that code — HO-6's final review caught a real defect (half-resolution screenshots) that every automated check had missed by not doing exactly this.

- [ ] **Step 4: Re-run the completeness check and the existing suite**

Run: `cd web && node --experimental-strip-types e2e/shots/manifest.test.ts`
Expected: still passes — this task only adds entries, it does not remove the `loaded` ones the check already verified.

Run: `./run e2e`
Expected: unaffected — this task touches only `web/e2e/shots/`, which `playwright.config.ts`'s `testIgnore` already excludes.

- [ ] **Step 5: Commit**

```bash
git add web/e2e/shots
git commit -m "test(web): loading/empty/error shots for the remaining screens (CAP-21)"
```

---

## Task 2: Assemble the PR checklist

**Files:**
- Create: a scratch markdown file in the session's scratchpad directory (not the repository) listing every screen/state/screenshot — this is a one-time aid for opening the PR, not project documentation.

**Interfaces:**
- Consumes: the full `SHOTS` array (now covering all four states for all nine screens) and the PNGs in `web/e2e/shots/output/`.

- [ ] **Step 1: List what the manifest now covers**

Run: `cd web && node --experimental-strip-types e2e/shots/manifest.test.ts`
Read its printed shot/screen counts, and separately list the ids in `SHOTS` grouped by screen. Confirm every one of the nine screens has at least a `loaded`, `empty` and `error` entry (Export Sheet excepted for `loading`, per Task 1 Step 2's finding) before writing the checklist — the checklist must describe what is actually true, not what was planned.

- [ ] **Step 2: Write the checklist**

Write a markdown file to the scratchpad (not `docs/`, not the repository root — see Global Constraints) shaped like:

```markdown
# CAP-21 PR checklist

Audited all 9 screens against every stated criterion. No missing states found —
see the PR description's "Deliberate, checked decisions" section for the three
things that looked like gaps on first pass and were not.

## Screenshots (web/e2e/shots/output/, attach each to the matching row below)

| Screen | Loaded | Loading | Empty | Error |
|---|---|---|---|---|
| Diary home | diary-home-loaded.png | diary-home-loading.png | diary-home-empty.png | diary-home-error.png |
| Gig detail | gig-detail-loaded.png | gig-detail-loading.png | gig-detail-empty.png | gig-detail-error.png |
| Entry stepper (student) | entry-stepper-student-loaded.png | entry-stepper-loading.png | entry-stepper-empty.png | entry-stepper-error.png |
| Entry stepper (assessor) | entry-stepper-assessor-loaded.png | — (shares the student mode's loading shot, same skeleton) | — | — |
| Submitted confirmation | submitted-loaded.png | submitted-loading.png | submitted-empty.png | submitted-error.png |
| Export sheet | export-sheet-loaded.png | — (no fetch on mount, see PR notes) | export-sheet-empty.png | export-sheet-error.png |
| History sheet | history-sheet-loaded.png | history-sheet-loading.png | history-sheet-empty.png | history-sheet-error.png |
| Review queue | review-queue-loaded.png | review-queue-loading.png | review-queue-empty.png | review-queue-error.png |
| Select framework | select-framework-loaded.png | select-framework-loading.png | select-framework-empty.png | select-framework-error.png |
| Edit framework | edit-framework-loaded.png | edit-framework-loading.png | edit-framework-empty.png | edit-framework-error.png |
```

Correct the filename column against the actual ids Step 1 printed — this plan's table is a template of the expected shape, not a guarantee every id landed exactly as named; a mismatch here is a real error for the implementer to fix in this step, not something to paper over by renaming the PR checklist to match a wrong screenshot.

- [ ] **Step 3: Report the scratchpad file's path back as part of this task's completion**

The implementer's report must include the absolute path to the written checklist file, since it lives outside the repository and the controller needs it to hand to the user.

---

## Self-Review Notes

**Spec coverage:** criterion 1 and 2 — already met, verified by audit, no task changes anything. Criterion 3 (checklist with a screenshot per state per screen) — Tasks 1-2. Criterion 4 (nothing deferred) — the three "looked like a gap" items are each individually checked and resolved in this plan's own audit section and repeated in the PR description, rather than silently dropped.

**Known, stated scope decision:** Export Sheet gets no `loading` entry (it cannot reach that state, confirmed by reading the code) and Assessor-mode Entry Stepper reuses the student mode's loading/empty/error shots rather than duplicating three more entries for a mode that shares the same skeleton and the same "nothing to reflect on" / error-handling code paths — only its `loaded` view differs visually (read-only narrative, self-score shown). This is a deliberate reduction of redundant screenshots, not a coverage gap: the state *exists* and *was checked* in the audit; only the screenshot is shared rather than duplicated.
