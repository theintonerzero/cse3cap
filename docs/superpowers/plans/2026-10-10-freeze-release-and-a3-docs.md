# Code freeze, v1.0.0, and the Assessment 3 documentation: plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Phase 1 changes the repository; Phase 2 produces documentation outside it.

**Goal:** Stop development on 10 October 2026. Land the finished work, make the repository's
own documents describe what was built, release `v1.0.0`, and give every Assessment 3 section
owner an exact list of what in the handover report no longer matches the code.

**Architecture:** Phase 1 is four pull requests into `dev` and one release pull request into
`main`, then the tag. No new feature code: the only code is finishing CAP-52 (already written,
PR #119) and the screenshot manifest entry that `./run shots` now refuses to run without.
Phase 2 turns the comparison of the handover report against `dev` into one brief per section
owner, plus a facts sheet of numbers taken from the tagged commit.

**Tech Stack:** git and `gh`, the repository's `./run` targets, Playwright, the Jira MCP, the
Google Drive reader (read-only).

**Spec:** the person's decisions of 10 October 2026: no development after today; merge PR #119
in the cleanup; tag `v1.0.0` today after the cleanup; the report is fixed by its section owners
working from briefs, not edited by an agent. Background: CAP-30 (COA4-88) criteria, HO-10
(COA4-106) criteria, the comparison of the handover report v0.5 (the team's working document in Drive, last
edited 9 Oct) against `dev` at `a3194a2`.

## Global Constraints

- **Freeze:** after this plan's PRs, nothing merges to `dev` or `main` until Assessment 3 is
  submitted, except a fix to a factual error in a repository document the report cites.
- **No new feature code.** If merging #119 needs more than resolving its conflict, it is parked
  (Task 2 says how), not reworked.
- **A pull request for every change, a reviewer requested, CI green before merge.** Never push
  to `dev` or `main`. Never force-push.
- **The handover report is never edited by an agent.** Read it with the Drive reader only.
- **Public repository:** no tokens, no client emails, no assessment rubric text, no link to or
  ID of the team's private documents, and no student numbers in any committed file or PR body.
- **Never draft a team member's reflective compendium.** The briefs correct facts in the shared
  report; they never write anyone's personal reflection.
- **ADRs and plans are history.** Only an ADR's Status line may change, and only with a
  superseding record.
- **Do not run prettier on documents that were never prettier-formatted** (the ADR register,
  `Stack-and-Build-Scope.md`, `CHANGELOG.md`, `README.md`). CI's prettier check covers `web/`
  only. `docs/Design-Inventory.md` is prettier-aligned: keep each edited cell within its
  column's current width so the table is not realigned.
- **Every number in the briefs comes from a command run against the tagged commit**, quoted with
  the command. No number is carried over from memory or from an older CI run.

## Review Focus

1. **#119's conflict in `EntryStepper.tsx`.** Since #119 was written, CAP-61 (progress spacing),
   CAP-66 (LevelScale) and HO-9 (the AI coach and calibration panels) all changed that file. A
   resolution that drops any of their markup passes the CAP-52 specs and breaks theirs. The full
   suite, not the CAP-52 specs, is the gate.
2. **The tag goes on the merge commit on `main`**, not on a `dev` commit, and `main` must equal
   `dev` at that point (`git diff origin/dev origin/main` empty).
3. **CHANGELOG "Known limitations" after the AI sidecar.** It must say the sidecar is off by
   default and what turning it on sends to Anthropic (ADR #64, `docs/Retention-and-Erasure.md`),
   not just that it exists.
4. **Briefs must not contradict each other.** One fact (an endpoint count, an ADR number, a test
   count) has one value across all five briefs, taken from the facts sheet.
5. **`./run shots` on the tag.** The manifest guard passes and `/record` is covered, so the
   Manual's screenshots can be taken from the release.

---

## Phase 1: clean up and release (10 October)

### Task 1: Announce the freeze

**Files:** none.

- [ ] **Step 1: Post to the team chat** (the person posts it; an agent does not message the team)

```
Code freeze from today (Sat 10 Oct). Last merges: #119 (CAP-52 editor keeps every edit),
#105 (CAP-27 ERD source), a docs PR that brings README/CHANGELOG/scope/design inventory up
to date, and a small fix so ./run shots covers /record. Then dev → main and v1.0.0 today.
After that nothing merges until A3 is in, except a fix to a repo doc the report cites.
From here we write: each section owner gets a brief listing what in v0.5 no longer matches
the code, with the correct fact and its evidence.
```

---

### Task 2: Merge PR #119 (CAP-52), or park it

**Files:** `web/src/screens/EntryStepper.tsx` (conflict resolution only), on branch
`fix/CAP-52-editor-keeps-every-edit`.

- [ ] **Step 1: Rebase and see the conflict**

```bash
cd .claude/worktrees/fix+CAP-52-editor-keeps-every-edit
git fetch -q origin && git rebase origin/dev
```

Expected: a conflict in `web/src/screens/EntryStepper.tsx` only.

- [ ] **Step 2: Resolve by keeping both sides**

For each hunk: keep `dev`'s markup and behaviour (LevelScale, the AI coach and calibration
panels, the progress-bar spacing) and add #119's save tracking (`track_save`, `pending_saves`,
`failed_saves`, `latest_save`, the `TextAreaHandle.flush()` calls, the submit-waits-for-saves
logic). Do not rewrite either side. `git add` and `git rebase --continue` for each commit that
stops.

- [ ] **Step 3: The whole suite is the gate**

```bash
cd web && npx tsc -b && npm run lint && npx prettier --check . && npx playwright test 2>&1 | tail -4
```

Expected: every test passes, including `stepper-edits.spec.ts`, `demo/stepper-switch.spec.ts`,
`level-scale.spec.ts`, `coach.spec.ts`, `calibration.spec.ts`, `stepper-nav.spec.ts`. A known
Firefox timing flake ("dragging a sheet by its handle closes it") may fail under load: rerun
`e2e/firefox.spec.ts` alone and quote both results.

- [ ] **Step 4: Decide**

If Step 3 is green within about an hour of starting Step 1: `git push --force-with-lease` is a
force push and is not allowed, so push the rebased branch under a new name instead:

```bash
git push -u origin HEAD:fix/CAP-52-editor-keeps-every-edit-rebased
gh pr create --base dev --head fix/CAP-52-editor-keeps-every-edit-rebased \
  --title "fix(web): the reflection editor keeps every edit (CAP-52, rebased onto dev)" \
  --body "Supersedes #119: the same commits rebased onto dev at $(git rev-parse --short origin/dev), with the EntryStepper.tsx conflict against CAP-61, CAP-66 and HO-9 resolved by keeping both sides. Full suite: <paste the tail>." \
  --reviewer RickLTCS
```

Close #119 with a comment linking the new PR. Merge the new PR once CI is green.

If Step 3 is not green within the hour: **park it.** Close nothing, comment on #119 that it is
parked past v1.0.0 because the conflict needs more than a merge, and record "the editor can
lose a student's last edit" as a known issue in Task 4's CHANGELOG and in the briefs. Record
the decision in the ledger as a ruling.

- [ ] **Step 5: Jira**

If merged: read CAP-52's (COA4-122) criteria and comments, check each against `dev`, move it
to Done (transition 41), then comment with the evidence. If parked: leave it In Review and
comment why.

---

### Task 3: Merge PR #105 (CAP-27, the ERD drawn from a source file); close PR #121

**Files:** none beyond the PRs.

- [ ] **Step 1: #105.** It merges cleanly into `dev`. It edits the README and CHANGELOG tag date
  ("11 October"), so it must merge **before** Task 4, which rewrites those lines.

```bash
gh pr view 105 --json reviewRequests,latestReviews,mergeable
gh pr update-branch 105   # brings it up to date with dev through GitHub, no force push
```

Wait for CI. If green, merge it (`gh pr merge 105 --merge`). Then check CAP-27's criteria and
comments on `dev` and move it to Done with an evidence comment, or comment on what is left.
This puts `docs/erd.mmd` and `./run erd` on `dev`, which the report's 10.3 already cites.

- [ ] **Step 2: #121** (the AI sidecar proposal, superseded): close it with

```bash
gh pr close 121 --comment "Superseded by ADR #64 (#132) and the sidecar as built (#134-#140). The design took a different shape: a separate Python service in ai/ with its own database, rather than inside Laravel. This proposal is cited there as the main alternative."
```

---

### Task 4: The repository describes v1.0.0 as built (docs PR)

**Files:**
- Modify: `docs/CHANGELOG.md`
- Modify: `README.md`
- Modify: `docs/Stack-and-Build-Scope.md` (lines 36-39 and 253-254)
- Modify: `docs/Design-Inventory.md` (row `97:1416`)
- Modify: `docs/Demo-Script.md` (step 2.4, only if Task 2 merged #119)
- Create: this plan file, committed with them

Branch: `docs/CAP-30-release-1.0.0` (this worktree), rebased onto `dev` after Tasks 2 and 3.

- [ ] **Step 1: Gather the numbers from `dev`**

```bash
git fetch -q origin && git rebase origin/dev
RUN=$(gh run list --branch dev --workflow ci.yml --limit 1 --json databaseId --jq '.[0].databaseId')
gh run view $RUN --log | grep -E "Tests:|passed|tests? passed" | tail -20
python3 -c "import yaml;print(sum(len([m for m in v if m in ('get','post','put','patch','delete')]) for v in yaml.safe_load(open('docs/openapi.yaml'))['paths'].values()))"
python3 -c "import yaml;print(sum(len([m for m in v if m in ('get','post','put','patch','delete')]) for v in yaml.safe_load(open('docs/ai-openapi.yaml'))['paths'].values()))"
grep -cE "^ADR #[0-9]+:" docs/adr/architecture-decision-records.md
ls web/e2e/*.spec.ts web/e2e/demo/*.spec.ts web/e2e/demo-live/*.spec.ts | wc -l
```

Expected: the backend, smoke, verify, Playwright and AI-sidecar counts from the latest `dev`
CI run; 31 product endpoints; the sidecar endpoint count; 65 ADRs; the spec-file count. Write
them into the ledger. They feed Steps 2-3 and the Task 8 facts sheet.

- [ ] **Step 2: `docs/CHANGELOG.md`**

(a) Under `## Sprint 5` add one line per PR merged since #111 that has none. Group under the
existing `### Added`, `### Fixed`, `### Changed`. Use these, adding #119's and #105's if Tasks
2 and 3 merged them:

```
### Added
- A demo sign-in for the client demo: with VITE_DEMO_SHELL on, a one-click profile picker
  replaces the token prompt in the dev server only, and `./run demo` checks the shared database
  is reachable and fills it from the tokens file (#114, #115, #120, CAP-51, ADR #61).
- The live demo on the VPS, in containers behind a password gate, on its own resettable
  database, deploying `dev` automatically with health checks and rollback (#122, CAP-54,
  ADR #62), and `/phone`, which shows it in a phone frame for presenting (#123, #127, CAP-55).
- The AI sidecar, off unless `AI_ENABLED` is set: a reflection coach and similar past
  reflections for students, a calibration coach on an assessed reflection, and cohort search
  with recurring themes for reviewers. It asks and finds; it never writes a score or a
  reflection (#132, #134, #135, #136, #138, HO-9, CAP-67, ADR #64). Deployed on the live demo,
  ready to switch on, with an evaluation script (#140, CAP-69).
- The PDF export looks like the Reflection Diary (#133, CAP-65).

### Fixed
- No production build can carry the demo sign-in or its tokens (#117, CAP-51, F15).
- The export downloads in every browser; Download is a real link to the file (#124, #125,
  CAP-56).
- On a phone the app bar shows who is signed in, and the 404 page has a way back (#126,
  CAP-57).
- The stepper's progress bar leaves room above the card, and a focused text box stays above the
  phone's sticky bar (#129, CAP-61).

### Changed
- A polish pass over every screen (#131, CAP-63).
- A rubric's levels are one row of numbers instead of a stack of pills, with a legend of names
  and numbers (#137, #139, CAP-66, CAP-68, ADR #65).
```

Also append ` (#128, #130)` to the existing CAP-53 lines.

(b) Replace `## [Unreleased]` and its first line with:

```
## [1.0.0] - 2026-10-10

`dev` merged to `main` and tagged `v1.0.0` (CAP-30).
```

(c) In `### What 1.0.0 contains`: "thirty-one endpoints" stays; add the learning record to the
frontend list ("…the review queue, your learning record, framework selection…"); replace the
last bullet's "three seeded tokens in place of a login (ADR #15)" with "three seeded tokens in
place of a login (ADR #15), with a one-click demo sign-in for presenting (ADR #61)"; add:

```
- A live demo on the VPS behind a password gate, on its own database (ADR #62).
- An optional AI sidecar in `ai/` (Python, its own contract `docs/ai-openapi.yaml` and database
  `diary_ai`), off unless `AI_ENABLED` is set (ADR #64).
```

(d) In `### Known limitations at 1.0.0`:
- Replace the "No deployed instance…" bullet with: "The live demo runs on the same VPS as the
  team's shared database, with no backups and no monitoring (`docs/Runbook.md`). The host-install
  procedure in ADR #45 was never run; the containers in ADR #62 replaced it."
- Replace "`GET /me/progress`, `/me/calibration` and `/me/coverage` are built and tested, but no
  screen shows them yet." with "`GET /me/calibration` and `/me/coverage` are built and tested,
  but no screen shows them. `/me/progress` is shown by your learning record (ADR #63)."
- Replace "Whether the radar should show each skill's own range is ADR #41, still open" with
  "The radar keeps one scale per framework (ADR #41)".
- Add: "With `AI_ENABLED` on, a student's narrative and a reviewer's search text are sent to
  Anthropic's API, and the sidecar keeps embeddings in `diary_ai`
  (`docs/Retention-and-Erasure.md`). It is off by default and the demo runs on seeded fiction."
- Only if Task 2 parked #119, add: "The reflection editor can lose a student's last edit if
  they leave a competency or submit while a save is in flight (CAP-52, PR #119)."

- [ ] **Step 3: `README.md`**

- Line 22: replace "167 feature tests and 6 unit tests" with the Step 1 backend count, worded
  as the runner prints it.
- Line 24: replace "with 53 Playwright browser checks" with "with <N> Playwright browser checks
  in <M> spec files, Chromium and a Firefox check". Keep "the ten core components" (the component
  count, still true).
- Line 25: replace "v1.0.0 planned for 12 October 2026." with "v1.0.0, tagged 10 October 2026."
- Line 132: replace "- AI features of any kind. Cut at the scope review, see [ADR #10](docs/adr/)."
  with "- AI inside the product. Cut by ADR #10; an optional sidecar that asks and never writes
  was added beside it (ADR #64)."
- Line 228: replace "# The demo's Caddy site block and PHP-FPM pool (CAP-26)" with
  "# The live demo's containers and gate (CAP-54, ADR #62)" after checking `ls deploy/` on
  `dev` (if `deploy/caddy` and `deploy/php-fpm` are still there beside `deploy/demo`, say both).
- Lines 473 and 476: update the two counts to the Step 1 numbers.

- [ ] **Step 4: `docs/Stack-and-Build-Scope.md`**

- Lines 36-39: "any vector database or AI service\n(cut from scope)." → "any vector database
  (the AI sidecar ranks in its own process, ADR #64)."
- Lines 253-254: "- **AI features.** Cut. No suggestion tables, no embeddings, nothing writes
  scores but a\n  human." → "- **AI that writes.** Cut. No AI drafts a narrative, suggests a
  score or writes a reviewer's comment, and nothing writes scores but a human. The optional
  sidecar only asks and finds (ADR #64)."

- [ ] **Step 5: `docs/Design-Inventory.md`, row `97:1416`**

In the "What changed and why" cell replace "a comment required when scoring lower, a "Save
score" per competency and "Save all scores" on the last step. Not built: the "Scoring closes"
date. [TODO: Patrick] no recorded reason for saving scores directly in place of draft and
submit" with "a comment when the rubric asks for one, picks kept on the device until one
"Submit scores" on the last step (ADR #57). Not built: the "Scoring closes" date". Append
`; ADR #57` to the row's evidence cell. Check the cell width stays within the column and
`npx --prefix web prettier --check docs/Design-Inventory.md` is clean; `git diff --stat` on the
file is 1 line.

- [ ] **Step 6: `docs/Demo-Script.md`** (only if Task 2 merged #119)

Delete from step 2.4: "Until CAP-52 is merged, let each narrative show **Saved** before pressing
**Next** or **Submit**, and don't type while a score is saving. Both can lose words in the
current build. Delete this sentence once CAP-52 is on `dev`."

- [ ] **Step 7: Check, commit, PR, merge**

```bash
python3 scripts/check-docs.py | tail -1
git grep -n -iE "planned for 12 October|No deployed instance|Cut at the scope review|53 (Playwright|browser)" -- README.md docs/CHANGELOG.md
git add docs/CHANGELOG.md README.md docs/Stack-and-Build-Scope.md docs/Design-Inventory.md docs/Demo-Script.md docs/superpowers/plans/2026-10-10-freeze-release-and-a3-docs.md
git commit -m "docs: the repository describes v1.0.0 as built (CAP-30)"
git push -u origin docs/CAP-30-release-1.0.0
gh pr create --base dev --title "docs: the repository describes v1.0.0 as built (CAP-30)" --body-file <scratchpad>/pr-release-docs.md --reviewer RickLTCS
```

Expected: check-docs `0 failed`; the grep prints nothing. Merge when CI is green.

---

### Task 5: `./run shots` covers `/record` (test tooling PR)

`./run shots` stops at its first check on `dev`:
`routes.tsx has "record" with no entry in SCREEN_FOR_ROUTE -- add one`. CAP-53 added the route
without a shot. The Manual's screenshots cannot be taken until this is fixed.

**Files:**
- Modify: `web/e2e/shots/manifest.test.ts` (`SCREEN_FOR_ROUTE`)
- Modify: `web/e2e/shots/manifest.ts` (four entries, after the Diary home block)
- Modify: `web/e2e/shots/README.md` (`## Coverage today`: "nine screens" or equivalent count)

Branch `fix/CAP-53-shots-cover-record` off `dev`.

- [ ] **Step 1: See it fail**

Run: `cd web && node --experimental-strip-types e2e/shots/manifest.test.ts`
Expected: `AssertionError … routes.tsx has "record" with no entry in SCREEN_FOR_ROUTE`.

- [ ] **Step 2: Add the route and the shots**

In `manifest.test.ts`, add to `SCREEN_FOR_ROUTE`: `record: 'Learning record',`.

In `manifest.ts`, after the last Diary home entry, add:

```ts
  // -- Learning record (CAP-53) -----------------------------------------
  // LearningRecord.tsx reads GET /gigs and GET /reflections, then per gig
  // GET /me/progress and GET /frameworks/{id}. "Yours to keep" renders only
  // in the loaded state, so it is the ready marker. Empty, loading and error
  // never reach /me/progress, which the fake does not serve.
  {
    id: 'learning-record-loaded',
    screen: 'Learning record',
    route: '/record',
    viewport: 'desktop',
    state: 'loaded',
    ready: 'Yours to keep. Export it whenever you like.',
    scenario: { source: 'real', slot: 'student' },
  },
  {
    id: 'learning-record-loaded-mobile',
    screen: 'Learning record',
    route: '/record',
    viewport: 'mobile',
    state: 'loaded',
    ready: 'Yours to keep. Export it whenever you like.',
    scenario: { source: 'real', slot: 'student' },
  },
  {
    id: 'learning-record-empty',
    screen: 'Learning record',
    route: '/record',
    viewport: 'desktop',
    state: 'empty',
    ready: 'Your record starts with your first reflection.',
    scenario: {
      source: 'fake',
      me: JANE,
      frameworks: [LA_TROBE_FRAMEWORK],
      gigs: [GIG],
      reflections: [],
    },
  },
  {
    id: 'learning-record-error',
    screen: 'Learning record',
    route: '/record',
    viewport: 'desktop',
    state: 'error',
    ready: 'Cannot reach the server',
    scenario: {
      source: 'fake',
      me: JANE,
      frameworks: [LA_TROBE_FRAMEWORK],
      gigs: [GIG],
      fault: { route: 'GET /reflections', fault: { kind: 'network' }, times: 2 },
    },
  },
```

Check `GIG` in `fixtures.ts` has `my_role: 'student'` and a non-null `framework`; if not, use
the fixture that does and note it.

- [ ] **Step 3: See it pass, and capture the fake shots**

```bash
cd web && node --experimental-strip-types e2e/shots/manifest.test.ts
npx playwright test --config=playwright.shots.config.ts -g "learning-record-(empty|error)"
```

Expected: the guard prints "… screens covered." and the two fake shots pass, writing
`e2e/shots/output/learning-record-empty.png` and `-error.png`. Look at both PNGs.

- [ ] **Step 4: Commit, PR, merge**

```bash
npx prettier --write e2e/shots/manifest.ts e2e/shots/manifest.test.ts && npm run lint
git commit -am "fix(shots): ./run shots covers the learning record again (CAP-53)"
```

PR into `dev` with Patrick as reviewer; merge when CI is green.

---

### Task 6: Release v1.0.0

**Files:** none; GitHub only.

- [ ] **Step 1: `dev` is final**

```bash
git fetch -q origin
gh pr list --state open --base dev --json number,title   # expect none from this plan
gh run list --branch dev --limit 1 --json conclusion,headSha --jq '.[0]'
```

Expected: no open PR from this plan; the latest `dev` run `success` on `origin/dev`'s head.

- [ ] **Step 2: The release PR**

```bash
gh pr create --base main --head dev --title "release: v1.0.0" \
  --body "Merges dev into main for v1.0.0 (CAP-30). The release notes are docs/CHANGELOG.md's [1.0.0] section. CI on dev: <run URL>." \
  --reviewer RickLTCS
```

Wait for CI on the PR, then `gh pr merge <N> --merge`.

- [ ] **Step 3: Tag the merge commit and publish the release**

```bash
git fetch -q origin
test -z "$(git diff origin/dev origin/main)" && echo "main == dev"
MERGE=$(git rev-parse origin/main)
git tag -a v1.0.0 -m "Reflection Diary v1.0.0" $MERGE
git push origin v1.0.0
awk '/^## \[1.0.0\]/{f=1;next} /^## /{if(f)exit} f' docs/CHANGELOG.md > <scratchpad>/release-notes.md
gh release create v1.0.0 --verify-tag --title "v1.0.0" --notes-file <scratchpad>/release-notes.md
```

Expected: "main == dev"; the tag and release exist. Record `$MERGE` (short and full) in the
ledger: the report cites it.

- [ ] **Step 4: Jira.** CAP-30 (COA4-88): comment that criterion 1 is met (the PR, the merge
  commit, the tag and release URLs). It stays In Progress: criterion 3, credentials handed over
  out of band, is the person's.

---

### Task 7: Tidy the board and the working tree

**Files:** none.

- [ ] **Step 1: Jira, ticket by ticket** (comment first, move only with evidence or the
  person's say-so):
  - CAP-53 (COA4-123): the person rewrites its criteria to the narrowed scope or splits it;
    then Done.
  - CAP-26 (COA4-84): comment that CAP-54 / ADR #62 delivered a demo instance by a different
    route and ADR #45's procedure was never run. The person decides Done or closed.
  - CAP-35 (COA4-93): read its criteria against `dev` (ADR #41, merged as #57) and report.
  - HO-9 (COA4-105): report its criteria against `dev` for Jesse; do not move it.

- [ ] **Step 2: Worktrees and branches.** List them, and give the person the commands (earlier
  deletions in this session were blocked, so the person runs them):

```bash
git worktree list
git worktree remove .claude/worktrees/<name>      # for each merged or closed one
git push origin --delete <branch>                 # for each merged or closed remote branch
```

Keep `docs/CAP-30-release-1.0.0` until its PR merges.

---

## Phase 2: the Assessment 3 documentation (10 to 13 October)

### Task 8: The facts sheet, from the tag

**Files:** `<scratchpad>/a3/facts-v1.0.0.md` (not committed).

- [ ] **Step 1: Collect every number the report quotes, from `v1.0.0`**

One table: fact, value, command or source, date. At least: release tag, commit (short and
full), date; product endpoints (31) and sidecar endpoints; screens (eleven) and routes; ADR
count and the newest number; backend tests, smoke checks, verify checks, Playwright tests and
spec files, AI sidecar tests, CI jobs (from the CI run on the tag's commit); security findings
F1 to F16 with severity and status (`docs/Security-Review.md`); dependency register date
(`git log -1 --format=%ad -- docs/Dependency-Register.md`); the live demo's URL; seeded people
and gigs; `main` vs `dev` (equal).

Expected: no value without a command or a file path beside it.

### Task 9: One brief per section owner

**Files:** `<scratchpad>/a3/brief-<owner>.md` × 5, then one private page.

Owners, from the report's cover table: Tony (front matter, 1, 2, 12, 13, appendices, Part D),
Patrick (3, 7, 8, 9), Jesse (4, 5, 10), Andrew (6, 8.6, 11), Amenah (User Manual).

- [ ] **Step 1: Re-read the report.** Read the v0.5 handover report (the person supplies its
  link) with the Drive reader. If it has been edited since 9 Oct, redo the comparison for the changed sections
  before writing briefs (the earlier comparison is `<scratchpad>/doc-impact-v05.md`).

- [ ] **Step 2: Write each brief** in this shape, one row per stale or missing item, ordered by
  section:

```
# <Owner>: what to change in the handover report (v1.0.0)

Facts to use are in the facts sheet; every number below matches it.

| Section | It says now (short quote) | Change it to | Evidence |
| --- | --- | --- | --- |
```

Then a short "Missing entirely" list (for example, for Patrick: the live demo's deploy,
rollback and logs in 7.5, 8.1, 8.4 and 9.1; for Amenah: how-tos for the learning record and the
nudge). End with the screenshots that section needs and their manifest ids.

- [ ] **Step 3: Cross-check.** Every number in all five briefs appears in the facts sheet with
  the same value: `grep -ohE "[0-9]{2,4}" brief-*.md` against the sheet, by eye for each.

- [ ] **Step 4: Publish** the five briefs and the facts sheet as one private page (Artifact,
  `artifact-design` loaded first), one tab or section per owner, and give the person the link
  to share. Nothing is sent to the team by an agent.

### Task 10: Screenshots for the Manual and the SMD

**Files:** PNGs in `web/e2e/shots/output/` (git-ignored), then the team's Drive folder (the
person uploads).

- [ ] **Step 1: On a network that reaches the shared database** (a phone hotspot), from a
  checkout of `v1.0.0`:

```bash
git checkout v1.0.0
export SHOTS_STUDENT_TOKEN=… SHOTS_ASSESSOR_TOKEN=… SHOTS_SUPERVISOR_TOKEN=… SHOTS_GIG_ID=… SHOTS_FRAMEWORK_ID=…
./run shots
```

Tokens come from the person's tokens file and are never pasted into a chat or a commit. Expected:
every shot written, none skipped for a missing token.

- [ ] **Step 2: Check** each PNG shows the current build (the level row in the steppers, the
  nudge on the diary home, the learning record), then the person uploads them for the owners.

### Task 11: Track to submission (HO-10)

- [ ] Each owner edits their sections from their brief; reviewers sign off in Suggesting mode.
- [ ] When an owner reports a section done, re-read that section against the facts sheet and
  report any number that disagrees.
- [ ] Before export: search the report for `[PENDING`, `[TODO`, "no deployed", "no AI",
  "thirty endpoints", "ten screens", "Save score" and every ADR number above 49, and report
  each hit to its owner.
- [ ] HO-10's criteria are the person's to tick; submission by midday Tuesday 13 October.
