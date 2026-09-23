# CAP-13 Assessor Stepper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give CAP-11's entry stepper a second mode, `assessor`, in which a supervisor or
assessor reads a submitted reflection one competency at a time, sees the student's
narrative, evidence and self-score read-only, and counter-scores each entry through
`POST /entries/{entry_id}/scores`.

**Architecture:** Same component, new prop. `EntryStepper` takes
`mode?: 'student' | 'assessor'` (default `'student'`, so CAP-11's route is untouched). In
assessor mode every `EntryCard` renders read-only with the student's name on the labels, and
a new screen-local `CounterScorePanel` sits under the card with the level picker, the comment
box and the Save button. The pure decisions (which entry is mine, where to land, whether the
comment looks required, what an error code means) go into the existing
`entry-stepper-logic.ts`. The review queue's disabled "Score this" becomes a real link. No
backend change: every rule already lives in `api/app/Services/Scoring.php`.

**Tech Stack:** React 19, TypeScript, React Router, the generated client
(`web/src/api/client.ts`), existing components (`Badge`, `Button`, `Chip`, `ErrorNotice`,
`ProgressBar`, `Skeleton`, `SkeletonGroup`, `TextArea`), CSS Modules on `web/src/tokens.css`.

**Spec:** Jira COA4 ticket CAP-13, acceptance criteria as pasted by Patrick on 2026-09-23
(reproduced verbatim below, because the Jira MCP server was not connected in the planning
session: `./run jira` reported `JIRA_EMAIL` / `JIRA_API_TOKEN` unset). Also
`.claude/skills/add-screen/SKILL.md`, ADR #34, and the prototype's §11.14/§11.19 and
`api/resources/views/assessing/score.blade.php` in `~/projects/alumable-diary` for copy and
content order only.

### The ticket's acceptance criteria (verbatim)

> The same component as CAP-11 in a second mode, not a second component. Sequence this after
> CAP-11 merges rather than running them in parallel.
>
> 1. Student narrative and evidence read-only. Their self-score visible.
> 2. Level picker posting to POST /entries/{id}/scores. POST rather than PUT because a second
>    attempt is an error, not an update.
> 3. Comment box becomes required when the counter-score is below the self-score, and
>    whenever the framework's comment_required flag is set. The disabled button is a
>    convenience; the 400 COMMENT_REQUIRED is the rule and the UI must handle it arriving
>    anyway.
> 4. A 409 on a repeat counter-score is surfaced clearly, not swallowed. Re-scoring is out of
>    scope by decision (ADR #34). Do not build a way around it.
> 5. The reflection flips to assessed on its own once every entry has a counter-score. The UI
>    reflects that; it does not trigger it.
> 6. All four states.
>
> Depends on CAP-10, CAP-11

CAP-10 merged (the review queue, `web/src/screens/ReviewQueue.tsx`) and CAP-11 merged as
#54 (`c11ac3c` on `dev`), so the dependency is satisfied in git. Whether Jira agrees was not
checked; see Follow-ups.

## Global Constraints

- One component. No `AssessorStepper.tsx`; the mode is a prop on `EntryStepper`
  (add-screen skill: "one component with a mode prop, not two builds").
- `POST /entries/{entry_id}/scores` only. No PUT, no retry-as-update, no "edit my score"
  affordance anywhere. A given score stands (ADR #34, CLAUDE.md "Out of scope: Re-scoring").
- The comment rule lives in `api/app/Services/Scoring.php::assertCommentPresent`. The
  client's `comment_expected` is a convenience for the disabled button, documented as
  such, and the screen handles `400 COMMENT_REQUIRED` whatever it returns.
- The client never sets `status` to `assessed` and never calls anything to make it so. It
  copies `reflection_status` and `completed_the_reflection` out of the 201 body.
- Handle each error by `ApiError.code`, never by `message`: `COMMENT_REQUIRED`,
  `ALREADY_SCORED`, `NOT_SUBMITTED`, and a default that shows `error.message`
  (covers `LEVEL_NOT_IN_COMPETENCY`, `ROLE_FORBIDDEN`, network failures).
- Role checks in the client are UX only. The route does not hide itself from students; the
  server's 404/403 is the rule and the screen renders it.
- No competency name, scale bound or level count hardcoded. Levels come from
  `levels_for(framework, competency_id)`, the same as CAP-11. SFIA's 1-7 must render with
  no code change.
- Tokens only. No raw hex, no pixel values. Add CSS rules; do not change an existing rule
  in `EntryStepper.module.css` or `ReviewQueue.module.css` (see memory: no unilateral
  changes to shared design). Tinted backgrounds take `--color-text` foregrounds.
- Props snake_case on anything new.
- Student mode must behave exactly as it does on `dev` today. `./run verify-entry-stepper`
  must still report `13 passed, 0 failed` after every task.
- Shared database: the manual walkthrough's **write** half consumes Jane's last free sprint
  and is irreversible. It is gated on Patrick's go-ahead (Task 4, Step 5).
- `web/` has no test runner. Each task's gate is `cd web && npm run build` plus
  `npm run lint`; the final task adds `scripts/verify-assessor-stepper.sh` wired into `./run`.

## Decisions made in this plan (reversible, stated so they can be overruled)

1. **Route: `review-queue/reflections/:reflection_id`, replacing the
   `review-queue/entries/:entry_id` placeholder.** The queue carries only `reflection_id`
   (`GET /review-queue`), and the stepper is one reflection with N steps, exactly the reason
   CAP-11 mounted `reflections/:reflection_id` rather than `entries/:entry_id`. Nesting under
   `review-queue/` keeps the queue as the back target. The step is not in the URL, same as
   CAP-11; ADR #27's "share this entry" deep-link is a follow-up for both modes at once.
2. **The comment box is a plain `<textarea>`, not `TextArea`.** `TextArea` requires `onSave`
   and autosaves on a debounce. A counter-score comment must not be saved on its own: it is
   sent once, with the level, in the POST. Making `onSave` optional would change a shared
   component for one caller; a screen-local, token-styled `<textarea>` does not.
3. **Land on the first entry I have not scored.** Sam's seeded `/review-queue` has Tom's
   sprint 2 at 2 of 6. Opening it on step 1, already scored, would make him click past his
   own work. The prototype does the same ("the first card that still owes something opens").
4. **After a successful save the step stays put.** The panel turns into "You scored this
   competency" and Next is right there. Auto-advancing moves the screen under someone who is
   still reading the confirmation.
5. **My own score is shown through the existing counter-score lines, not twice.** `EntryCard`
   already renders every counter-score (name, level, comment) when read-only. The panel only
   adds the note that it is mine and cannot be changed.
6. **On `ALREADY_SCORED` or `NOT_SUBMITTED` the screen refetches the reflection silently**
   (no skeleton) so the stored score or the closed status appears, and keeps the server's
   message on screen. This is how "surfaced clearly, not swallowed" and "the UI reflects the
   flip" both hold for a stale tab.
7. **A forced-required comment is sticky for that entry.** After a `400 COMMENT_REQUIRED` the
   box stays required even if the client-side hint disagrees, because the server has said so.

## Amendments at execution (Patrick, 2026-09-23)

These override the task text below wherever the two disagree.

1. **No CSS is added or changed, in any file.** "Don't change any of the design
   templates/css stuff - everything has to be consistent." Every "Append the CSS" step is
   dropped. New markup reuses classes `EntryStepper.module.css` already has: `.empty`,
   `.empty_title` and `.empty_body` for the assessor notices (the screen's existing designed
   notice), `.counter_score` for the owner line and the "you scored this" note, `.card` for
   the score form, `.levels`/`.level_row`/`.field_label`/`.field_error` as CAP-11 uses them,
   and `.evidence_actions` for the Save row. `scripts/check-contrast.mjs` is untouched
   because no new colour pair exists.
2. **The comment box is a plain `<textarea>` wearing `TextArea.module.css`'s own `.field`,
   `.label` and `.textarea` classes.** Decision 2 stands (no autosave), but a bare
   `<textarea>` renders in the browser's monospace font and no CSS may be added to fix it.
   Borrowing the design system's own textarea classes makes it identical to every other text
   box without touching the component.
3. **Testing uses local mock data; the shared database is never written.** Task 4 Steps 4
   and 5 are replaced by a stateful fixture API run from the session scratchpad (Jane's
   submitted reflection, a part-scored one, an assessed one, a SFIA one, and the scoring
   rules copied from `Scoring.php` for the mock's behaviour only), with the app pointed at it
   through `VITE_API_BASE_URL` and driven by headless Chromium at 390px and 1280px. The real
   server's rules stay covered by `api/tests` and `./run smoke`.
4. **The check script is written first.** Task 4 Steps 1-2 run before Task 1 and are watched
   failing, which is the red step `web/` can have without a test runner.

## Review Focus

The five inputs most likely to bite someone that no task's build gate exercises. Each has a
walkthrough line in Task 4.

1. **A part-scored reflection.** Sam opens Tom's sprint 2 (2 of 6 his). Expect: it opens on
   the first entry he has not scored; his two scored entries show his level and comment,
   read-only, with no picker.
2. **A stale tab.** Another scorer, or another tab, completes the reflection. The next Save
   gets `409 NOT_SUBMITTED` (status is checked before the duplicate). Expect: the server's
   message stays visible, the page refreshes to read-only with the assessed notice, and
   nothing retries.
3. **Whitespace-only comment on a lower score.** The server trims (`trim((string) $comment)`).
   Expect: the Save button stays disabled for `"   "`, and if forced, the 400 is shown and the
   box is marked required.
4. **Double-tap on Save.** Expect: the button disables while the POST is in flight, so an
   assessor cannot cause their own `ALREADY_SCORED`.
5. **The wrong person on the URL.** Sam opening an SFIA reflection gets a 404, which is the
   error state. Jane opening her own submitted reflection in assessor mode can read it (she
   owns it) but Save returns 403, which must be shown, not swallowed.

---

## File structure

| File | Change |
| --- | --- |
| `web/src/screens/entry-stepper-logic.ts` | Add `ReflectionStatus`, `CounterScoreResult`, `my_counter_score_of`, `first_unscored_index`, `scored_by_count`, `comment_expected`, `counter_score_failure`. Nothing existing changes. |
| `web/src/screens/EntryStepper.tsx` | `mode` prop, session user, assessor headings/labels/notices, silent `refresh`, `record_counter_score`, new `CounterScorePanel`. Student branch unchanged. |
| `web/src/screens/EntryStepper.module.css` | Append new classes only. |
| `web/src/app/routes.tsx` | Replace the CAP-13 placeholder route with `<EntryStepper mode="assessor" />`. |
| `web/src/screens/ReviewQueue.tsx` | The disabled `span` becomes a `Link` to the new route; its now-false comment is corrected. |
| `scripts/verify-assessor-stepper.sh` | New scripted check. |
| `run` | `verify-assessor-stepper` case and help line. |

Branch: `feat/CAP-13-assessor-stepper` off `dev`, via `superpowers:using-git-worktrees`.

---

## Task 1: Pure assessor logic

**Files:**
- Modify: `web/src/screens/entry-stepper-logic.ts`

**Interfaces:**
- Consumes: the existing `levels_for`, `self_score_of`, `counter_scores_of`,
  `ReflectionEntry`, `ReflectionScore`, `FrameworkDetail` in the same file.
- Produces (Tasks 2 and 3 import these):
  - `type ReflectionStatus = components['schemas']['ReflectionStatus']`
  - `type CounterScoreResult` (the 201 body of `POST /entries/{entry_id}/scores`)
  - `my_counter_score_of(entry: ReflectionEntry, user_id: string): ReflectionScore | null`
  - `first_unscored_index(entries: readonly ReflectionEntry[], user_id: string): number`
  - `scored_by_count(entries: readonly ReflectionEntry[], user_id: string): number`
  - `comment_expected(framework: FrameworkDetail, self_level_value: number | null, chosen_level_value: number | null): boolean`
  - `type CounterScoreFailure = 'comment' | 'closed' | 'already_scored' | 'other'`
  - `counter_score_failure(code: string | null): CounterScoreFailure`

- [ ] **Step 1: Widen the schema import**

Change the top import from:

```ts
import type { components } from '../api/schema.ts';
```

to:

```ts
import type { components, paths } from '../api/schema.ts';
```

and add beneath the existing `export type Score = ...` line:

```ts
export type ReflectionStatus = components['schemas']['ReflectionStatus'];

/** The 201 body of a counter-score: the Score, plus what it did to the reflection. */
export type CounterScoreResult =
  paths['/entries/{entry_id}/scores']['post']['responses']['201']['content']['application/json'];
```

- [ ] **Step 2: Append the assessor functions to the end of the file**

```ts
/**
 * The caller's own counter-score on this entry, if they have given one.
 * Matched on the scorer's id, never on role: the same person can be a
 * supervisor on one gig and a student on another.
 */
export function my_counter_score_of(
  entry: ReflectionEntry,
  user_id: string,
): ReflectionScore | null {
  return counter_scores_of(entry).find((score) => score.scorer?.id === user_id) ?? null;
}

/**
 * Where an assessor lands: the first entry, in rubric order, they have not
 * scored yet. Everything scored (or nothing to score) lands on the first.
 */
export function first_unscored_index(
  entries: readonly ReflectionEntry[],
  user_id: string,
): number {
  const index = entries.findIndex((entry) => my_counter_score_of(entry, user_id) === null);
  return index === -1 ? 0 : index;
}

/** How many of these entries the caller has counter-scored. Same count as the queue's scored_by_me. */
export function scored_by_count(entries: readonly ReflectionEntry[], user_id: string): number {
  return entries.filter((entry) => my_counter_score_of(entry, user_id) !== null).length;
}

/**
 * Whether the comment box should read as required before Save is pressed.
 *
 * A convenience, not the rule. The rule is
 * api/app/Services/Scoring.php (assertCommentPresent): a comment is
 * required when the counter-score is below the student's own, and whenever
 * the rubric's comment_required flag is set. This mirrors it only so the
 * Save button can be disabled early. The screen handles a 400
 * COMMENT_REQUIRED whatever this returns (CAP-13 criterion 3).
 */
export function comment_expected(
  framework: FrameworkDetail,
  self_level_value: number | null,
  chosen_level_value: number | null,
): boolean {
  if (framework.comment_required) return true;
  if (self_level_value === null || chosen_level_value === null) return false;
  return chosen_level_value < self_level_value;
}

/**
 * What a failed counter-score means for the screen, by code and never by
 * message.
 *
 *   comment         400 COMMENT_REQUIRED: mark the box required, keep what was typed
 *   closed          409 NOT_SUBMITTED: a draft, or already assessed (ADR #34)
 *   already_scored  409 ALREADY_SCORED: this scorer has scored this entry; it stands
 *   other           anything else: show the message and change nothing
 */
export type CounterScoreFailure = 'comment' | 'closed' | 'already_scored' | 'other';

export function counter_score_failure(code: string | null): CounterScoreFailure {
  switch (code) {
    case 'COMMENT_REQUIRED':
      return 'comment';
    case 'NOT_SUBMITTED':
      return 'closed';
    case 'ALREADY_SCORED':
      return 'already_scored';
    default:
      return 'other';
  }
}
```

- [ ] **Step 3: Build and lint**

Run: `cd web && npm run build && npm run lint`
Expected: both clean. A failure on `CounterScoreResult` means the contract's 201 shape moved
since 2026-09-23: run `npm run gen:types` and re-read `docs/openapi.yaml` lines ~735-793
before changing anything here.

- [ ] **Step 4: Student mode untouched**

Run: `./run verify-entry-stepper`
Expected: `13 passed, 0 failed`.

- [ ] **Step 5: Commit**

```bash
git add web/src/screens/entry-stepper-logic.ts
git commit -m "feat(web): assessor stepper logic -- own score, landing step, comment hint, failure codes (CAP-13)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 2: Assessor mode, read-only, mounted and linked

After this task an assessor can open any queued reflection and read it in assessor mode. No
scoring yet; that is Task 3. It is split here because a reviewer could approve the route,
labels and notices while rejecting the scoring panel.

**Files:**
- Modify: `web/src/screens/EntryStepper.tsx`
- Modify: `web/src/screens/EntryStepper.module.css` (append only)
- Modify: `web/src/app/routes.tsx`
- Modify: `web/src/screens/ReviewQueue.tsx`

**Interfaces:**
- Consumes: `first_unscored_index`, `scored_by_count` (Task 1); `useSession` from
  `../session/useSession.ts`.
- Produces: `EntryStepper({ mode }: { mode?: StepperMode })` where
  `type StepperMode = 'student' | 'assessor'`; `EntryCard` gains
  `mode: StepperMode` and `owner_name: string`. Task 3 relies on `mode`, `me`, and the
  `read_only` value being `true` whenever `mode === 'assessor'`.

- [ ] **Step 1: Imports and the prop**

In `EntryStepper.tsx`, add to the imports:

```tsx
import { useSession } from '../session/useSession.ts';
```

add `first_unscored_index` and `scored_by_count` to the value import from
`./entry-stepper-logic.ts`, and change the component signature:

```tsx
/**
 * student  the owner writing a draft (CAP-11). The default, so CAP-11's
 *          route passes nothing.
 * assessor a supervisor or assessor reading a submitted reflection and
 *          counter-scoring it (CAP-13). Everything the student wrote is
 *          read-only; the level picker is the scorer's own.
 */
type StepperMode = 'student' | 'assessor';

export function EntryStepper({ mode = 'student' }: { mode?: StepperMode }) {
  const { reflection_id } = useParams<{ reflection_id: string }>();
  const navigate = useNavigate();
  const { me } = useSession();
  const me_id = me?.id ?? null;
```

Add a docblock paragraph at the top of the file, after the "draft is the only editable
status" paragraph:

```tsx
 * Assessor mode (CAP-13) is this same screen with mode="assessor", mounted
 * at /review-queue/reflections/:reflection_id. Every entry renders
 * read-only; CounterScorePanel adds the scorer's own level and comment.
 * Every rule behind it lives in api/app/Services/Scoring.php. The screen
 * reflects what the POST returns, including the flip to assessed, and
 * never triggers anything itself.
```

- [ ] **Step 2: Land on the first unscored entry**

Replace the inner `.then((framework) => setLoad(...))` in the fetch effect with:

```tsx
          .then((framework) => {
            setLoad({ status: 'loaded', reflection, framework });
            if (mode === 'assessor' && me_id) {
              setStep(first_unscored_index(reflection.entries, me_id));
            }
          }),
```

and change the effect's dependency array to `[reflection_id, reload_key, mode, me_id]`.

- [ ] **Step 3: Headings and read-only**

Add after the `useState` declarations:

```tsx
  const heading = mode === 'assessor' ? 'Score reflection' : 'Reflection';
```

Replace each of the four `<h1 className={styles.heading}>Reflection</h1>` with
`<h1 className={styles.heading}>{heading}</h1>`. Leave the empty state's copy ("Nothing to
reflect on.") as it is: `verify-entry-stepper.sh` asserts it, and it reads correctly for
both modes.

Replace:

```tsx
  const read_only = reflection.status !== 'draft';
```

with:

```tsx
  // An assessor never edits what the student wrote, whatever the status.
  const read_only = mode === 'assessor' || reflection.status !== 'draft';
```

- [ ] **Step 4: The assessor header and notices**

Directly after the `status_row` div, insert:

```tsx
      {mode === 'assessor' && (
        <>
          <p className={styles.owner_line}>
            {reflection.owner.display_name}
            {me_id && (
              <>
                {' '}
                &middot; you have scored {scored_by_count(entries, me_id)} of {entries.length}
              </>
            )}
          </p>

          {reflection.status === 'draft' && (
            <p className={styles.notice} role="status">
              This reflection has not been submitted yet, so there is nothing to score.
            </p>
          )}
          {reflection.status === 'assessed' && (
            <p className={styles.notice} role="status">
              This reflection has been assessed. Counter-scores close with it, so this is a
              read-only record of what was scored.
            </p>
          )}
        </>
      )}
```

(Task 3 adds the "you just completed it" variant of the assessed notice.)

- [ ] **Step 5: Pass mode and owner name to EntryCard, relabel it**

Change the `<EntryCard ... />` call to add two props:

```tsx
        mode={mode}
        owner_name={reflection.owner.display_name}
```

In `EntryCard`'s props, add `mode: StepperMode;` and `owner_name: string;` (and destructure
them). Replace the `TextArea`'s `label="Your reflection"` with:

```tsx
        label={mode === 'assessor' ? `${owner_name} wrote` : 'Your reflection'}
```

and replace the self-score label and group:

```tsx
        <p className={styles.field_label}>Self-score</p>
        <div className={styles.level_row} role="group" aria-label="Self-score">
```

with:

```tsx
        <p className={styles.field_label}>
          {mode === 'assessor' ? `${owner_name}'s self-score` : 'Self-score'}
        </p>
        <div
          className={styles.level_row}
          role="group"
          aria-label={mode === 'assessor' ? `${owner_name}'s self-score` : 'Self-score'}
        >
```

The self-score chips are already `disabled={read_only}` and `selected` on the student's
level, so criterion 1's "self-score visible" needs nothing more. The counter-score lines
under them already render when `read_only`, so any existing counter-score (another scorer's,
or the caller's own) shows as well.

- [ ] **Step 6: The last step in assessor mode**

In the nav, the last-step branch currently renders Submit when not read-only and nothing
otherwise. Replace:

```tsx
        ) : (
          !read_only && (
            <Button full_width={false} disabled={submitting} on_click={submit}>
              {submitting ? 'Submitting…' : 'Submit'}
            </Button>
          )
        )}
```

with:

```tsx
        ) : mode === 'assessor' ? (
          <Button full_width={false} on_click={() => navigate('/review-queue')}>
            Back to the queue
          </Button>
        ) : (
          !read_only && (
            <Button full_width={false} disabled={submitting} on_click={submit}>
              {submitting ? 'Submitting…' : 'Submit'}
            </Button>
          )
        )}
```

- [ ] **Step 7: Append the CSS**

Append to `EntryStepper.module.css` (confirm each token exists in `web/src/tokens.css`
first; use the one that is there rather than inventing one):

```css
.owner_line {
  margin: 0 0 var(--space-16);
  font-size: var(--font-size-sm);
  color: var(--color-text-muted);
}

/* A tinted fill takes --color-text, never a coloured foreground (AA). */
.notice {
  margin: 0 0 var(--space-16);
  padding: var(--space-12) var(--space-16);
  border-radius: var(--radius-md);
  background: var(--color-surface-alt);
  color: var(--color-text);
  font-size: var(--font-size-sm);
}
```

- [ ] **Step 8: Mount the route**

In `web/src/app/routes.tsx`, replace:

```tsx
        <Route
          path="review-queue/entries/:entry_id"
          element={<Placeholder screen="Assessor stepper" ticket="CAP-13" />}
        />
```

with:

```tsx
        {/*
         * CAP-13: the entry stepper in its second mode. By reflection, not
         * by entry, for the same reason as reflections/:reflection_id above:
         * GET /review-queue carries reflection_id and nothing finer.
         */}
        <Route
          path="review-queue/reflections/:reflection_id"
          element={<EntryStepper mode="assessor" />}
        />
```

Update the file's opening docblock sentence "Two are no longer placeholders: the diary home
(CAP-7) and the gig detail screen (CAP-8)." only if it is still literally in the file; if it
has already gone stale for other screens, leave it (not this ticket's to fix, record it as a
follow-up).

- [ ] **Step 9: Link the review queue to it**

In `web/src/screens/ReviewQueue.tsx`, add `import { Link } from 'react-router';` with the
other imports and replace the comment and the disabled span:

```tsx
      {/*
       * Becomes a real <Link> once CAP-5's router exists and CAP-13 builds
       * ...
       */}
      <span className={styles.scoreLink} aria-disabled="true">
        Score this →
      </span>
```

with:

```tsx
      {/* The assessor stepper (CAP-13), by reflection: the queue has nothing finer. */}
      <Link className={styles.scoreLink} to={`/review-queue/reflections/${entry.reflection_id}`}>
        Score this →
      </Link>
```

Also change the file's opening docblock sentence "The link into the assessor stepper stays a
disabled placeholder until CAP-13 exists." to "Each row links into the assessor stepper
(CAP-13)." `.scoreLink` is unchanged; it already styles text as a link.

- [ ] **Step 10: Build, lint, look**

Run: `cd web && npm run build && npm run lint && npx prettier --check .`
Expected: all clean.

Run: `./run verify-entry-stepper`
Expected: `13 passed, 0 failed`.

With `./run dev` running and Sam's token active, open `/review-queue`, click Tom H's sprint 2
row, and confirm: heading "Score reflection", "Tom H · you have scored 2 of 6", the step is
the first one Sam has not scored, narrative and evidence read-only, labels read "Tom H wrote"
and "Tom H's self-score", the last step shows "Back to the queue". **Press nothing that
writes**; this is seeded reference data.

- [ ] **Step 11: Commit**

```bash
git add web/src/screens/EntryStepper.tsx web/src/screens/EntryStepper.module.css \
        web/src/app/routes.tsx web/src/screens/ReviewQueue.tsx
git commit -m "feat(web): entry stepper assessor mode, read-only, mounted from the review queue (CAP-13)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 3: Counter-scoring -- picker, comment, the errors, the flip

**Files:**
- Modify: `web/src/screens/EntryStepper.tsx`
- Modify: `web/src/screens/EntryStepper.module.css` (append only)

**Interfaces:**
- Consumes: `levels_for`, `self_score_of`, `my_counter_score_of`, `comment_expected`,
  `counter_score_failure`, `ReflectionStatus`, `CounterScoreResult` (Task 1); `mode`, `me`,
  `read_only` from Task 2; `SessionUser` from `../session/useSession.ts`.
- Produces: `CounterScorePanel({ entry, framework, me, open, on_scored, on_stale })`,
  screen-local. Nothing downstream imports it.

- [ ] **Step 1: Stepper-level state and callbacks**

Add to the value imports from `./entry-stepper-logic.ts`: `comment_expected`,
`counter_score_failure`, `my_counter_score_of`. Add to the type imports:
`ReflectionStatus`. Add `import type { SessionUser } from '../session/useSession.ts';`.

Add to the state declarations:

```tsx
  // Set only when this session's own POST reported completed_the_reflection.
  // The flip itself is the server's (Scoring::flipIfComplete); this only
  // decides which notice to show.
  const [completed_here, setCompletedHere] = useState(false);
```

Add after `update_entry`:

```tsx
  // A 201 from POST /entries/{id}/scores: the entry gains the score, and the
  // reflection takes whatever status the server says it now has.
  const record_counter_score = useCallback(
    (next: ReflectionEntry, status: ReflectionStatus, completed: boolean) => {
      setLoad((current) => {
        if (current.status !== 'loaded') return current;
        return {
          ...current,
          reflection: {
            ...current.reflection,
            status,
            entries: current.reflection.entries.map((entry) =>
              entry.id === next.id ? next : entry,
            ),
          },
        };
      });
      if (completed) setCompletedHere(true);
    },
    [],
  );

  // After a 409 the page is stale: someone else closed the reflection, or
  // this entry already carries our score from another tab. Refetch without
  // a skeleton so the panel's message stays on screen while the stored
  // state replaces the stale one. A failure here is not reported a second
  // time: the panel is already showing why the save did not happen.
  const refresh = useCallback(() => {
    if (!reflection_id) return;
    api
      .get('/reflections/{reflection_id}', { path: { reflection_id } })
      .then((reflection) =>
        setLoad((current) =>
          current.status === 'loaded' ? { ...current, reflection } : current,
        ),
      )
      .catch(() => undefined);
  }, [reflection_id]);
```

- [ ] **Step 2: The completed notice**

In Task 2's assessor block, replace the `reflection.status === 'assessed'` notice with:

```tsx
          {reflection.status === 'assessed' &&
            (completed_here ? (
              <p className={styles.notice} role="status">
                That was the last one. Every competency now has a counter-score, so this
                reflection is assessed and has left the review queue.
              </p>
            ) : (
              <p className={styles.notice} role="status">
                This reflection has been assessed. Counter-scores close with it, so this is a
                read-only record of what was scored.
              </p>
            ))}
```

- [ ] **Step 3: Render the panel under the card**

Directly after the `<EntryCard ... />` call, insert:

```tsx
      {mode === 'assessor' && me && (
        <CounterScorePanel
          key={current.id}
          entry={current}
          framework={load.framework}
          me={me}
          open={reflection.status === 'submitted'}
          on_scored={record_counter_score}
          on_stale={refresh}
        />
      )}
```

`key={current.id}` resets the picker and comment when the step changes, matching how
`EntryCard` is keyed.

- [ ] **Step 4: Write `CounterScorePanel`**

Append to the end of `EntryStepper.tsx`:

```tsx
/**
 * The scorer's own counter-score for one entry (CAP-13).
 *
 * POST, not PUT: a second attempt is an error, not an update, and there is
 * no way to change a score once given (ADR #34). So this renders one of
 * three things: the form, a note that the caller has already scored this
 * entry, or nothing when the reflection is not open for scoring. Any error
 * message shows under all three, because a 409 changes which of them is
 * showing and the reason must not disappear with the form.
 *
 * The comment hint (comment_expected) only disables the button early. The
 * rule is Scoring.php's, and a 400 COMMENT_REQUIRED marks the box required
 * whatever the hint said.
 */
function CounterScorePanel({
  entry,
  framework,
  me,
  open,
  on_scored,
  on_stale,
}: {
  entry: ReflectionEntry;
  framework: FrameworkDetail;
  me: SessionUser;
  open: boolean;
  on_scored: (next: ReflectionEntry, status: ReflectionStatus, completed: boolean) => void;
  on_stale: () => void;
}) {
  const [level_id, setLevelId] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const [comment_forced, setCommentForced] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const levels = levels_for(framework, entry.competency_id);
  const self_score = self_score_of(entry);
  const mine = my_counter_score_of(entry, me.id);
  const chosen = levels.find((level) => level.id === level_id) ?? null;

  const comment_required =
    comment_forced ||
    comment_expected(framework, self_score?.level_value ?? null, chosen?.level_value ?? null);
  const has_comment = comment.trim() !== '';
  const can_save = chosen !== null && !saving && (!comment_required || has_comment);

  const save = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      if (!chosen) return;
      setSaving(true);
      setError(null);

      try {
        const { reflection_status, completed_the_reflection, ...score } = await api.post(
          '/entries/{entry_id}/scores',
          {
            path: { entry_id: entry.id },
            body: { level_id: chosen.id, comment: has_comment ? comment : null },
          },
        );
        // The 201 is a bare Score; the entry's embedded scores also carry
        // the scorer. It is the caller, so the session already knows who.
        on_scored(
          {
            ...entry,
            scores: [
              ...entry.scores,
              { ...score, scorer: { id: me.id, display_name: me.display_name } },
            ],
          },
          reflection_status,
          completed_the_reflection,
        );
      } catch (caught) {
        const api_error = as_api_error(caught, 'Could not save that score.');
        setError(api_error.message);

        switch (counter_score_failure(api_error.code)) {
          case 'comment':
            setCommentForced(true);
            break;
          case 'closed':
          case 'already_scored':
            on_stale();
            break;
          case 'other':
            break;
        }
      } finally {
        setSaving(false);
      }
    },
    [chosen, comment, has_comment, entry, me, on_scored, on_stale],
  );

  return (
    <div className={styles.counter_panel}>
      {mine ? (
        <p className={styles.scored_note}>
          You scored this competency. A score, once given, stands.
        </p>
      ) : (
        open && (
          <form className={styles.counter_form} onSubmit={save}>
            <p className={styles.field_label}>Your score</p>
            <div className={styles.level_row} role="group" aria-label="Your score">
              {levels.map((level) => (
                <Chip
                  key={level.id}
                  selected={level_id === level.id}
                  disabled={saving}
                  on_click={() => setLevelId(level.id)}
                >
                  {level.level_value} &middot; {level.descriptor}
                </Chip>
              ))}
            </div>

            <label className={styles.field_label} htmlFor={`comment-${entry.id}`}>
              Why this score{comment_required ? ' (required)' : ' (optional)'}
            </label>
            <textarea
              id={`comment-${entry.id}`}
              className={styles.comment_input}
              rows={4}
              maxLength={4000}
              value={comment}
              aria-required={comment_required}
              disabled={saving}
              onChange={(event) => setComment(event.target.value)}
            />

            <div className={styles.counter_actions}>
              <Button type="submit" full_width={false} disabled={!can_save}>
                {saving ? 'Saving…' : 'Save score'}
              </Button>
            </div>
          </form>
        )
      )}

      {error && (
        <p className={styles.field_error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
```

Check `Chip`'s and `Button`'s props in `web/src/components/` before relying on `disabled`,
`selected`, `on_click` and `type="submit"`: CAP-11 uses all four the same way, so they
should exist, but read them rather than assume.

- [ ] **Step 5: Append the CSS**

```css
.counter_panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-8);
  margin-top: var(--space-16);
}

.counter_form {
  display: flex;
  flex-direction: column;
  gap: var(--space-12);
  padding: var(--space-16);
  border: var(--border-width-sm) solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
}

.comment_input {
  width: 100%;
  padding: var(--space-8);
  border: var(--border-width-sm) solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  color: var(--color-text);
  font: inherit;
  resize: vertical;
}

.counter_actions {
  display: flex;
  justify-content: flex-end;
}

.scored_note {
  margin: 0;
  font-size: var(--font-size-sm);
  color: var(--color-text-muted);
}
```

If `scripts/check-contrast.mjs`'s `PAIRS` does not already cover `--color-text-muted` on
`--color-bg` (the `.scored_note` pair) and `--color-text` on `--color-surface-alt` (the
`.notice` pair), add both; the file's own comment invites exactly that.

- [ ] **Step 6: Build, lint, format**

Run: `cd web && npm run build && npm run lint && npx prettier --check .`
Expected: all clean.

Run: `./run verify-entry-stepper`
Expected: `13 passed, 0 failed`.

- [ ] **Step 7: Safe checks against seeded data (writes nothing)**

With `./run dev` and Sam's token, open Tom H's sprint 2 from `/review-queue` and on an entry
Sam has not scored:

- Choose a level **below** Tom's self-score. The label reads "Why this score (required)" and
  Save stays disabled. Type three spaces: still disabled.
- In devtools, remove `disabled` from the Save button and click it. Expect the server's
  `COMMENT_REQUIRED` message under the form and the label still "(required)". A 400 writes
  nothing, so this is safe on seeded data.
- Choose a level **at or above** his self-score: "(optional)", Save enabled. **Do not click
  it.** Navigate away.

- [ ] **Step 8: Commit**

```bash
git add web/src/screens/EntryStepper.tsx web/src/screens/EntryStepper.module.css
# and scripts/check-contrast.mjs, if Step 5 changed it
git commit -m "feat(web): assessor counter-scoring -- picker, required comment, 409s, the flip (CAP-13)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 4: The scripted check, the walkthrough, the full check

**Files:**
- Create: `scripts/verify-assessor-stepper.sh`
- Modify: `run` (one case after `verify-entry-stepper)`, one help line after its help line)

- [ ] **Step 1: Write the check**

```bash
#!/usr/bin/env bash
#
# Proves the assessor stepper's invariants still hold.
#
#   ./run verify-assessor-stepper           from the repository root
#   ./scripts/verify-assessor-stepper.sh    the same thing
#
# web/ has no test runner (CLAUDE.md), so this is where a frontend check
# lives, next to verify-entry-stepper.sh, which covers the student mode of
# the same component.
#
# 1. One component: assessor mode is a prop on EntryStepper, not a second
#    screen, and the queue links to it.
# 2. POST, never PUT: there is no re-scoring (ADR #34).
# 3. The errors are handled by code, including COMMENT_REQUIRED arriving
#    despite the disabled button (CAP-13 criteria 3 and 4).
# 4. The client reflects the flip to assessed and never makes it.
# 5. The comment hint names the rule it mirrors, so nobody mistakes it for
#    the rule.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

SCREEN="web/src/screens/EntryStepper.tsx"
LOGIC="web/src/screens/entry-stepper-logic.ts"
ROUTES="web/src/app/routes.tsx"
QUEUE="web/src/screens/ReviewQueue.tsx"

if [ -t 1 ]; then
    blu=$'\033[1;34m'; grn=$'\033[1;32m'; red=$'\033[1;31m'; off=$'\033[0m'
else
    blu=''; grn=''; red=''; off=''
fi

pass=0; fail=0
say() { printf '\n%s==>%s %s\n' "$blu" "$off" "$1"; }
ok()  { pass=$((pass+1)); printf '  %sok%s   %-54s %s\n' "$grn" "$off" "$1" "${2:-}"; }
bad() { fail=$((fail+1)); printf '  %sFAIL%s %-54s %s\n' "$red" "$off" "$1" "${2:-}"; }

# has <description> <file> <fixed-string>
has() { if grep -qF -- "$3" "$2"; then ok "$1"; else bad "$1" "not found in $2"; fi; }
# lacks <description> <file> <extended-regex>
lacks() { if grep -qE -- "$3" "$2"; then bad "$1" "found in $2"; else ok "$1"; fi; }

# --------------------------------------------------------------------------
say "1. One component, mounted, and reachable from the queue"

has "routes.tsx mounts EntryStepper in assessor mode" "$ROUTES" '<EntryStepper mode="assessor" />'
has "on review-queue/reflections/:reflection_id"       "$ROUTES" 'path="review-queue/reflections/:reflection_id"'
lacks  "the CAP-13 placeholder is gone"                   "$ROUTES" 'ticket="CAP-13"'

if ls web/src/screens/ | grep -qi 'assessor'; then
    bad "no second assessor screen file" "$(ls web/src/screens/ | grep -i assessor | tr '\n' ' ')"
else
    ok "no second assessor screen file"
fi

has "the queue links into it"                 "$QUEUE" '/review-queue/reflections/${entry.reflection_id}'
lacks  "the queue's link is no longer disabled"  "$QUEUE" 'aria-disabled="true"'

# --------------------------------------------------------------------------
say "2. POST, never PUT (ADR #34)"

has "counter-scores are POSTed" "$SCREEN" "'/entries/{entry_id}/scores',"
lacks  "no PUT or PATCH to the counter-score path" "$SCREEN" "api\.(put|patch)\('/entries/\{entry_id\}/scores'"

# --------------------------------------------------------------------------
say "3. Errors handled by code"

for code in COMMENT_REQUIRED NOT_SUBMITTED ALREADY_SCORED; do
    has "handles $code" "$LOGIC" "case '$code':"
done
has "the screen switches on the mapped failure" "$SCREEN" 'counter_score_failure(api_error.code)'
lacks  "never switches on a message"               "$SCREEN" 'switch \(.*\.message'

# --------------------------------------------------------------------------
say "4. Reflects the flip, never makes it"

has "status comes from the 201 body"  "$SCREEN" 'reflection_status, completed_the_reflection'
lacks  "never sets status: 'assessed'"   "$SCREEN" "status: 'assessed'"

# --------------------------------------------------------------------------
say "5. The comment hint is labelled as a hint"

has "reads the rubric's own flag"        "$LOGIC" 'framework.comment_required'
has "names the rule it mirrors"          "$LOGIC" 'api/app/Services/Scoring.php'

# --------------------------------------------------------------------------
printf '\n%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
```

```bash
chmod +x scripts/verify-assessor-stepper.sh
git update-index --chmod=+x scripts/verify-assessor-stepper.sh   # CAP-11 lost this bit once (e278be7)
```

- [ ] **Step 2: Wire it into `run`**

After the line `    verify-entry-stepper) step ./scripts/verify-entry-stepper.sh ;;` add:

```bash
    verify-assessor-stepper) step ./scripts/verify-assessor-stepper.sh ;;
```

After the help line for `./run verify-entry-stepper` add:

```bash
  ${GREEN}./run verify-assessor-stepper${RESET}  the assessor stepper: one component, POST only, errors by code
```

- [ ] **Step 3: Run both checks**

Run: `./run verify-assessor-stepper`
Expected: `17 passed, 0 failed` (section 1: 6, section 2: 2, section 3: 5, section 4: 2,
section 5: 2). Every line `ok`, none `FAIL`.

Run: `./run verify-entry-stepper`
Expected: `13 passed, 0 failed`.

- [ ] **Step 4: Read-only walkthrough against seeded data (writes nothing)**

`./run dev`, tokens from `~/reflection-diary-tokens.txt`. Use playwright at 390px and 1280px
wide for the loaded state.

| As | Open | Expect |
| --- | --- | --- |
| Sam | `/review-queue` → Tom H, sprint 2 | Lands on Sam's first unscored entry; "you have scored 2 of 6"; his scored entries show his level and comment with "You scored this competency", no picker (Review Focus 1) |
| Dr Lee | Jane's Data migration audit sprint 2 (`submitted`) | SFIA's seven levels on the picker with no code change; Jane's self-score chip selected and disabled |
| Sam | Jane's La Trobe sprint 1 by URL (`assessed`) | The "has been assessed" notice, no picker on any step, both scores visible |
| Sam | Jane's SFIA sprint 2 by URL | 404 error state (Sam is not on that gig) (Review Focus 5) |
| Jane | her own SFIA sprint 2 at `/review-queue/reflections/<id>` | Readable (she owns it). Choose a level at or above her self-score and Save: the 403 message shows under the form, nothing retries (Review Focus 5; a 403 writes nothing) |
| any | throttle the network in devtools, reload | Skeletons, not a spinner |
| any | `/review-queue/reflections/not-a-uuid` | Error state with Retry |

**Do not press Save with a valid level on any seeded reflection.** A 201 is permanent and
there is no re-scoring.

- [ ] **Step 5: Write walkthrough -- ask Patrick first**

This is the only way to see the 201, the two 409s and the flip against the real server, and
it **permanently consumes shared data**: Jane's only unused sprint is Data migration audit
sprint 3 (checked 2026-09-23; every La Trobe sprint of hers is used, which is also why
`./run smoke`'s write path currently skips). Using it also removes the add-screen skill's
"any sprint 3" empty example. Ask Patrick whether to (a) use that sprint, or (b) announce and
run a reseed to the team first. Do not proceed without an answer.

Once agreed:

1. As Jane, create a reflection on Data migration audit sprint 3 through the diary, fill all
   six entries in the CAP-11 stepper, submit.
2. As Dr Lee, open it from `/review-queue` in **two tabs**, A and B.
3. Tab A, entry 1: score below Jane's self-score with a comment → 201, "You scored this
   competency", counter-score line shows the comment.
4. Tab B, entry 1 (stale): Save → `ALREADY_SCORED` message stays visible, the panel turns to
   "You scored this competency" after the silent refresh (criterion 4).
5. Tab A: score entries 2-5. Leave entry 6 open in tab B.
6. Tab A, entry 6 → 201 with `completed_the_reflection: true`: badge reads assessed, "That
   was the last one" notice (criterion 5).
7. Tab B, entry 6 (stale): Save → `NOT_SUBMITTED` "already been assessed" message stays,
   the refresh shows the assessed notice (Review Focus 2).
8. Double-tapping Save in step 3 or 5 sends one request (network tab) (Review Focus 4).
9. `/review-queue` no longer lists it. Jane's diary shows it assessed with two polygons.

- [ ] **Step 6: Full check**

Run: `./run check`
Expected: ends with `All checks passed.` Quote the tail of the output in the PR.

- [ ] **Step 7: Commit**

```bash
git add scripts/verify-assessor-stepper.sh run
git commit -m "test(web): scripted check for the assessor stepper (CAP-13)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 8: Finish**

`superpowers:requesting-code-review`, then `superpowers:finishing-a-development-branch`: a
PR into `dev` with **no reviewers**; ask Patrick who should review, if anyone. Jira: move
CAP-13 only per `/jira-tickets`' table (In Progress once a commit exists, In Review once the
PR is green), and only once the Jira MCP server is connected. Check each of the six criteria
against the branch before Done.

---

## Self-review

**Spec coverage:**

1. Narrative and evidence read-only, self-score visible: Task 2 Steps 3 and 5 (`read_only`
   forced in assessor mode; relabelled, disabled self-score chips).
2. POST level picker: Task 3 Step 4 (`api.post('/entries/{entry_id}/scores'`); Task 4's
   check forbids PUT/PATCH on that path.
3. Required comment, disabled button a convenience, 400 handled: Task 1 `comment_expected`
   documented as a hint; Task 3 `can_save` and the `'comment'` branch; Task 3 Step 7 forces
   the 400 on seeded data safely.
4. 409 surfaced, no re-scoring: Task 3's `already_scored`/`closed` branches keep the message
   and refresh; no edit path exists; Task 4 Step 5.4.
5. Flip reflected, not triggered: Task 3 `record_counter_score` copies `reflection_status`;
   Task 4's check forbids `status: 'assessed'`.
6. Four states: inherited from the same component (loading skeleton, error with Retry,
   empty, loaded), plus assessor notices for draft/assessed; Task 4 Step 4's last two rows.

**Placeholder scan:** none. Task 4 Step 3's total (17) was recounted section by section.

**Type consistency:** `StepperMode`, `SessionUser`, `ReflectionStatus`,
`record_counter_score(next, status, completed)` and `CounterScorePanel`'s six props are the
same in every task that names them.

---

## Review round 1 (Patrick, 2026-09-23/24, on PR #56)

What Patrick asked for after using the screen, and how each is built. The acceptance criteria
above are unchanged, and every item below keeps them true: still one POST per competency,
still no re-scoring, the comment rule still enforced by the server.

1. **A saved score reads like the self-score.** The chip row stays, greyed, with the chosen
   level selected, and the comment stays in its box, read-only. Done in `2563358`.
2. **Skipping a competency loses what was typed on it.** Root cause: the unsaved level and
   comment lived inside `CounterScorePanel`, which unmounts on every step change. Fix: the
   stepper holds a draft per entry id (level, comment, forced-required flag, last error), and
   the panel reads and writes it. Leaving a step keeps its draft, and an error survives the
   panel unmounting.
3. **"Save all scores" on the last step, keeping the per-competency Save.** Before sending
   anything it checks every competency the assessor has not scored yet. A missing level, or
   a missing comment where `comment_expected` says one is needed, is listed in plain words
   ("Agile improvement (4 of 6) still needs a score") with a button that jumps there, and
   nothing is sent. Once everything is ready it POSTs each draft in rubric order, one at a
   time. The first failure stops the run, jumps to that competency and shows the server's
   message there. Scores already sent stay sent, because a score cannot be taken back (ADR #34).
   The check that decides what is missing is a pure function in `entry-stepper-logic.ts`.
4. **Assessor chips are green.** The radar's counter-score colour (`--color-success`) marks
   the assessor's own chip row, while the student's stays purple. `Chip` gains
   `tone?: 'primary' | 'counter'`, and one rule, `.selected_counter`, is added to
   `Chip.module.css`. No existing rule changes. This is the one CSS addition Patrick
   approved, and the new pair is added to `scripts/check-contrast.mjs`.
5. **Assessors land on the diary home.** Root cause: the index route `/` renders
   `DiaryHome` for everyone. Fix: someone with no `student` participation is redirected
   from `/` to `/review-queue`. Anyone who is also a student still lands on the diary.
   Patrick chose to fix it in this PR.
6. **Tom H's sprint 2 in the shared database** was scored 3–6 during manual testing on
   2026-09-23 (03:10–03:12 UTC) and flipped to assessed. It is restored by removing exactly
   those four `scores` rows and their five `events` rows (four `entry_counter_scored` and one
   `reflection_assessed`), then setting `status` back to `submitted`, through the app's models.
   This runs only after Patrick confirms the team has had a heads-up. It is data, not code, so
   nothing about it goes in the branch.

7. **Same reading order for both halves (round 2, 2026-09-24).** In assessor mode the
   student's half now leads with their score chips and then their text box, then evidence,
   then the assessor's own chips and text box. The student's own writing screen keeps
   CAP-11's order (narrative first), because there the narrative is written before the score.
8. **An obvious way out (round 2).** A secondary "← Back to the review queue" button sits
   above the heading on every step of the assessor screen, and on its error and empty states.
   It is disabled only while a save is in flight, so that save's error is not lost.

---

## Follow-ups, not in this plan

- **Jira was unreachable when this was planned.** `JIRA_EMAIL`/`JIRA_API_TOKEN` are not in
  the shell profile, so the criteria above are Patrick's paste and COA4's state for CAP-10,
  CAP-11 and CAP-13 was not read.
- **`./run smoke`'s write path is exhausted.** Every La Trobe sprint of Jane's has a
  reflection, so the smoke test skips creating and counter-scoring until someone reseeds.
- **The step is not in the URL** in either mode. ADR #27 argues for "look at this entry" links
  an assessor can share; `?entry=<id>` would do it for both modes at once.
- **`entries/:entry_id` is still a CAP-11 placeholder route** that nothing links to.
- **ADR #34's open question stands:** on a gig with both an assessor and a supervisor, the
  first to finish closes the reflection for the other. This screen now shows the second one
  a clear refusal; whether the client wants that is a product question.
