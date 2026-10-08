# CAP-52 The reflection editor keeps every edit — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A student's last words are always saved before they leave a competency or submit, and nothing they type is wiped by a score or evidence save coming back. Sam's view of an entry with no evidence also says so.

**Architecture:** `TextArea` gets an imperative `flush()` handle and flushes a pending edit when it unmounts, instead of dropping it. `EntryStepper`'s Submit awaits that flush before posting. `update_entry` changes from "replace the whole entry with this copy" to "apply this change to the current entry with this id", so a slow save patches only the field it owns. The fake API learns the shapes of the editor's five writes, so Playwright can drive them.

**Tech Stack:** React 19, TypeScript, Playwright against `web/e2e/fake-api.ts` (ADR #42).

**Spec:** The 8 Oct tester pass of the demo's golden path, findings 1, 2 and 6. They became the acceptance criteria of CAP-52, written in Task 0. There is no separate design doc: this is a bounded fix to code that already exists.

## Global Constraints

- Branch `fix/CAP-52-editor-keeps-every-edit` off `dev`, in its own worktree. Not on PR #118.
- No raw hex and no `NNpx` outside `web/src/tokens.css` (`scripts/check-tokens.sh`).
- Every API call goes through `web/src/api/client.ts`. Never hand-write API types.
- The fake serves shapes, never rules (CLAUDE.md, `/add-screen`). No submit gate and no score rule in `fake-api.ts`.
- Every Playwright spec fails before the code changes, and the PR says how it failed.
- `./run lint` (prettier and oxlint), `tsc -b`, `check-tokens`, `check-contrast`, `check-docs` and full `./run e2e` must be green before the PR.
- Never write to the shared database: everything here runs against the fake.
- Commit messages and the PR carry no attribution lines.

## Review Focus

1. **A save that fails on unmount.** The student moved on, so nobody sees "Could not save". Expected: Submit still refuses, because the server's narrative is empty or old and the gate names the entry. This plan doesn't add a toast.
2. **StrictMode double-mount in dev.** The unmount flush must not fire a PATCH on React's fake unmount when nothing was typed. `timeoutRef` is undefined then.
3. **Typing after a failed save, then Submit.** `flush()` must return the newest save's promise, not a stale rejected one.
4. **Assessor mode.** The narrative TextArea is read-only there, so `flush()` is a no-op and Submit scores is untouched.
5. **Rapid Next, Next.** Each card's unmount flushes its own entry id. No PATCH may carry another entry's id.

---

### Task 0: Create the CAP-52 ticket (needs Tony's go-ahead)

An agent creating a ticket is a visible write. Do this only when Tony says so.

- [ ] **Step 1:** Create it in COA4 with `jira_create_issue`: type Task, summary `CAP-52 · Reflection editor keeps every edit`, assignee Tony To. Leave story points blank: they are the team's number, never an agent's. Description:

```
Found in the 8 Oct tester pass of the client demo's golden path (Demo-Script §2).

Acceptance criteria
1. Leaving a competency (Next, Back, back-arrow, Switch user) within the autosave delay still saves the narrative as typed.
2. Submit saves any pending narrative first, and posts only after that save succeeds. If it fails, nothing is submitted and the screen says why.
3. Text typed while a self-score or evidence save is in flight is still on screen, and is what gets saved, after that save returns.
4. A read-only entry with no evidence says "No evidence attached." instead of an empty heading.
5. Each is pinned by a Playwright spec that failed first.
```

- [ ] **Step 2:** Transition it to In Progress once the branch has a commit (transition 21). Transition bare, then add the comment, then re-read to confirm.

### Task 1: The fake serves the editor's writes

**Files:**
- Modify: `web/e2e/fake-api.ts` (add routes beside `PATCH /levels/:id`, before `this.unexpected.push`)

**Interfaces:**
- Produces: the routes `PATCH /entries/:id`, `PUT /entries/:id/scores/self`, `POST /entries/:id/evidence` (JSON link only), `DELETE /evidence/:id` and `POST /reflections/:id/submit`, served with contract shapes. `hold()` and `fail()` work on them as on every route.

- [ ] **Step 1: Add the routes**

```ts
    if (key === 'PATCH /entries/:id') {
      const owner = this.reflections.find(
        (r): r is ReflectionDetail => 'entries' in r && r.entries.some((e) => e.id === id),
      );
      const entry = owner?.entries.find((e) => e.id === id);
      if (!owner || !entry) return reply(route, 404, envelope('NOT_FOUND', 'No such entry.'));
      const { narrative = entry.narrative } = (body ?? {}) as { narrative?: string | null };
      entry.narrative = narrative;
      return reply(route, 200, {
        id,
        reflection_id: owner.id,
        competency_id: entry.competency_id,
        narrative,
        updated_at: '2026-08-17T10:00:00.000000Z',
      });
    }

    if (key === 'PUT /entries/:id/scores/self') {
      const { level_id } = body as { level_id: string };
      const level = this.frameworks
        .flatMap((f) => f.competencies.flatMap((c) => c.levels))
        .find((l) => l.id === level_id);
      if (!level) return reply(route, 404, envelope('NOT_FOUND', 'No such level.'));
      return reply(route, 200, {
        id: this.mint(),
        reflection_entry_id: id,
        scorer_role: 'student',
        scorer_class: 'self',
        level_id,
        level_value: level.level_value,
        comment: null,
        scored_at: '2026-08-17T10:00:00.000000Z',
      });
    }

    if (key === 'POST /entries/:id/evidence') {
      // JSON links only: handle() parses every body as JSON, so a multipart
      // file upload would need its own parsing before it could be served.
      const { kind, label, uri } = body as { kind: 'link'; label: string; uri: string };
      return reply(route, 201, {
        id: this.mint(),
        reflection_entry_id: id,
        kind,
        label,
        uri,
        size_bytes: null,
        uploaded_at: '2026-08-17T10:00:00.000000Z',
      });
    }

    if (key === 'DELETE /evidence/:id') return route.fulfill({ status: 204 });

    if (key === 'POST /reflections/:id/submit') {
      // The response's shape only. The gate is SubmitGate.php's and is tested
      // in api/tests; a refusal here is injected with fail().
      const reflection = this.reflections.find((r) => r.id === id);
      if (!reflection) return reply(route, 404, envelope('NOT_FOUND', 'No such reflection.'));
      reflection.status = 'submitted';
      reflection.submitted_at = '2026-08-17T10:00:00.000000Z';
      return reply(route, 200, reflection);
    }
```

- [ ] **Step 2: Type-check, and prove nothing else moved**

Run: `cd web && npx tsc -b --noEmit && npx playwright test --project=chromium`
Expected: tsc clean, and the same count passing as on `dev` (280). Adding routes changes no existing behaviour, because before this they were unexpected and no spec called them.

- [ ] **Step 3: Commit**

```bash
git add web/e2e/fake-api.ts
git commit -m "test(e2e): the fake serves the reflection editor's writes, as shapes (CAP-52)"
```

### Task 2: Typing is not wiped by a score or evidence save (RED)

**Files:**
- Create: `web/e2e/stepper-edits.spec.ts`

**Interfaces:**
- Consumes: Task 1's routes, plus `api.hold(route)`, which returns a release function.

- [ ] **Step 1: Write the spec, with fixtures beside it** (ids prefixed `5252`)

```ts
/**
 * CAP-52: the reflection editor keeps every edit (8 Oct tester pass).
 *
 * A self-score or evidence save used to replace the whole entry with the copy
 * taken before its request, wiping anything typed while it travelled to the
 * VPS. And leaving a competency, or pressing Submit, within the 600 ms
 * autosave delay dropped the last edit. Self-contained, ids prefixed '5252'.
 */
import { test as base, expect } from '@playwright/test';

import type { components } from '../src/api/schema.ts';
import {
  FakeApi,
  type FrameworkDetail,
  type GigDetail,
  type ReflectionDetail,
} from './fake-api.ts';

type Me = components['schemas']['Me'];

const id = (n: string) => `5252${n}-0000-4525-8525-525252525252`;
const GIG = id('0001');
const FRAMEWORK = id('0002');
const SPRINT = id('0003');
const DRAFT = id('0005');
const SUBMITTED = id('0006');
const NAMES = ['Contribution', 'Communication'];

const NOOR: Me = {
  id: id('0007'),
  display_name: 'Noor A',
  participations: [{ gig_id: GIG, gig_title: 'Develop AI use cases', role: 'student' }],
};

const RUBRIC: FrameworkDetail = {
  id: FRAMEWORK,
  fw_key: 'e2e-edits',
  version: 'v1',
  name: 'E2E rubric',
  created_by: null,
  in_use: true,
  assigned: true,
  comment_required: false,
  evidence_required: false,
  accepted_file_types: ['pdf'],
  max_file_bytes: 10485760,
  scale: { min: 1, max: 4 },
  competencies: NAMES.map((name, n) => ({
    id: id(`00c${n}`),
    code: name.toLowerCase(),
    name,
    short_label: null,
    category: null,
    position: n + 1,
    levels: [1, 2, 3, 4].map((value) => ({
      id: id(`0${n}l${value}`),
      level_value: value,
      descriptor: `${name} at level ${value}.`,
    })),
  })),
};

const GIG_DETAIL: GigDetail = {
  id: GIG,
  title: 'Develop AI use cases',
  org_name: 'Alumable',
  starts_on: '2026-08-01',
  ends_on: '2026-11-01',
  my_role: 'student',
  sprints: [{ id: SPRINT, ordinal: 3, opens_on: '2026-08-29', due_on: '2026-09-11' }],
  framework: { id: FRAMEWORK, fw_key: 'e2e-edits', name: RUBRIC.name, version: 'v1' },
  reflection_summary: { draft: 1, submitted: 1, assessed: 0 },
  participants: [{ id: NOOR.id, display_name: NOOR.display_name, role: 'student' }],
};

function reflection(reflection_id: string, status: 'draft' | 'submitted'): ReflectionDetail {
  return {
    id: reflection_id,
    status,
    gig_id: GIG,
    sprint_id: SPRINT,
    sprint_ordinal: 3,
    framework_id: FRAMEWORK,
    framework_version: 'v1',
    submitted_at: status === 'submitted' ? '2026-09-10T10:00:00.000000Z' : null,
    created_at: '2026-09-01T10:00:00.000000Z',
    updated_at: '2026-09-01T10:00:00.000000Z',
    owner: { id: NOOR.id, display_name: NOOR.display_name },
    entries: NAMES.map((name, n) => ({
      // 'a' for the draft's entries, 'b' for the submitted one's: hex, so the
      // fake's UUID pattern matches them, and distinct across the two.
      id: id(`${status === 'draft' ? 'a' : 'b'}0e${n}`),
      competency_id: id(`00c${n}`),
      competency_code: name.toLowerCase(),
      competency_name: name,
      short_label: null,
      position: n + 1,
      narrative: null,
      evidence: [],
      scores: [],
    })),
  };
}

const test = base.extend<{ api: FakeApi }>({
  api: [
    async ({ page }, provide) => {
      const api = new FakeApi([RUBRIC], NOOR, [GIG_DETAIL], [
        reflection(DRAFT, 'draft'),
        reflection(SUBMITTED, 'submitted'),
      ]);
      await api.install(page);
      await provide(api);
      expect(api.unexpected, 'requests the fake does not serve').toEqual([]);
    },
    { auto: true },
  ],
});

const narrative = (page: import('@playwright/test').Page) =>
  page.getByRole('textbox', { name: 'Your reflection' });

const narratives_sent = (api: FakeApi) =>
  api
    .writes()
    .filter((call) => call.route === 'PATCH /entries/:id')
    .map((call) => (call.body as { narrative: string }).narrative);

test('typing while a self-score saves is not wiped when it returns', async ({ page, api }) => {
  const release = api.hold('PUT /entries/:id/scores/self');
  await page.goto(`/reflections/${DRAFT}`);

  const level = page.getByRole('button', { name: /^2 · Contribution at level 2/ });
  await level.click();
  await narrative(page).fill('Typed while the score was on its way.');

  const returned = page.waitForResponse((r) => r.url().endsWith('/scores/self'));
  release();
  await returned;

  await expect(level).toHaveAttribute('aria-pressed', 'true');
  await expect(narrative(page)).toHaveValue('Typed while the score was on its way.');
});

test('typing while a link saves is not wiped when it returns', async ({ page, api }) => {
  const release = api.hold('POST /entries/:id/evidence');
  await page.goto(`/reflections/${DRAFT}`);

  await page.getByRole('button', { name: 'Add a link' }).click();
  await page.getByRole('textbox', { name: 'Evidence label' }).fill('Stand-up notes');
  await page.getByRole('textbox', { name: 'Link URL' }).fill('https://example.com/notes');
  await page.getByRole('button', { name: 'Add link' }).click();
  await narrative(page).fill('Typed while the link was on its way.');

  release();

  await expect(page.getByText('Stand-up notes')).toBeVisible();
  await expect(narrative(page)).toHaveValue('Typed while the link was on its way.');
});
```

- [ ] **Step 2: Watch it fail**

Run: `cd web && npx playwright test e2e/stepper-edits.spec.ts --project=chromium`
Expected: both FAIL on `toHaveValue`, with the received value `""`, because the entry was rebuilt from the copy taken before typing. If they fail on anything else (a selector, or `unexpected` not empty), fix the spec first. That isn't the RED we want.

- [ ] **Step 3: Commit the failing spec**

```bash
git add web/e2e/stepper-edits.spec.ts
git commit -m "test(e2e): typing during a score or link save survives it returning (CAP-52, red)"
```

### Task 3: Updates patch the current entry, not a stale copy (GREEN)

**Files:**
- Modify: `web/src/screens/EntryStepper.tsx`. Change `update_entry` (around line 234), the `EntryCard` prop at line 565, and in `EntryCard` and `EvidenceList` the prop types (lines 702 and 901) and the call sites (lines 746, 759, 914, 934 and 959).

**Interfaces:**
- Produces: `type EntryUpdate = (entry_id: string, change: (entry: ReflectionEntry) => ReflectionEntry) => void`. `EntryCard` and `EvidenceList` take `on_update: EntryUpdate` in place of `on_change`.

- [ ] **Step 1: Make `update_entry` take a change, by id**

```ts
/** Applies `change` to the entry as it is now, not as a caller last saw it:
 * a save that comes back late patches only the field it owns, so text typed
 * while it was in flight survives (CAP-52). */
type EntryUpdate = (entry_id: string, change: (entry: ReflectionEntry) => ReflectionEntry) => void;

  const update_entry = useCallback<EntryUpdate>((entry_id, change) => {
    setLoad((current) => {
      if (current.status !== 'loaded') return current;
      return {
        ...current,
        reflection: {
          ...current.reflection,
          entries: current.reflection.entries.map((entry) =>
            entry.id === entry_id ? change(entry) : entry,
          ),
        },
      };
    });
  }, []);
```

Pass it as `on_update={update_entry}` (was `on_change={update_entry}`). Put `type EntryUpdate` at module scope, beside the other types.

- [ ] **Step 2: Each call site changes only its own field**

```ts
// choose_level, after the PUT
on_update(entry.id, (current) => ({
  ...current,
  scores: [...current.scores.filter((s) => s.scorer_class !== 'self'), score],
}));
// deps: [entry.id, on_update]

// the narrative TextArea
onChange={(value) => on_update(entry.id, (current) => ({ ...current, narrative: value }))}

// EvidenceList.remove
on_update(entry.id, (current) => ({
  ...current,
  evidence: current.evidence.filter((e) => e.id !== evidence_id),
}));

// EvidenceList.add_link and add_file
on_update(entry.id, (current) => ({ ...current, evidence: [...current.evidence, evidence] }));
```

Rename the props `on_change` to `on_update: EntryUpdate` in `EntryCard` and `EvidenceList`, including where `EntryCard` passes it down at line 868. Keep each `useCallback`'s deps in step: `entry.id` replaces `entry` wherever `entry` is now only used for its id.

- [ ] **Step 3: Watch it pass, and nothing else move**

Run: `cd web && npx tsc -b --noEmit && npx playwright test e2e/stepper-edits.spec.ts e2e/stepper-*.spec.ts e2e/start-reflection.spec.ts --project=chromium`
Expected: tsc clean, the two new tests PASS, and every existing stepper spec still passes.

- [ ] **Step 4: Commit**

```bash
git add web/src/screens/EntryStepper.tsx
git commit -m "fix(web): a late score or evidence save no longer wipes what was typed meanwhile (CAP-52)"
```

### Task 4: The last edit is saved on leaving, and before Submit (RED)

**Files:**
- Modify: `web/e2e/stepper-edits.spec.ts` (append)

- [ ] **Step 1: Append the tests**

```ts
test('Next straight after typing still saves the last words', async ({ page, api }) => {
  await page.goto(`/reflections/${DRAFT}`);
  await narrative(page).fill('Last words before Next.');
  await page.getByRole('button', { name: 'Next', exact: true }).click();

  await expect(page.getByText('Competency 2 of 2')).toBeVisible();
  await expect.poll(() => narratives_sent(api)).toContain('Last words before Next.');
});

test('Submit straight after typing saves first, then submits', async ({ page, api }) => {
  await page.goto(`/reflections/${DRAFT}`);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await narrative(page).fill('Last words before Submit.');
  await page.getByRole('button', { name: 'Submit', exact: true }).click();

  await expect(page).toHaveURL(new RegExp(`/reflections/${DRAFT}/submitted$`));
  const routes = api.writes().map((call) => call.route);
  const saved = api
    .writes()
    .findIndex(
      (call) =>
        call.route === 'PATCH /entries/:id' &&
        (call.body as { narrative: string }).narrative === 'Last words before Submit.',
    );
  expect(saved, `writes were ${routes.join(', ')}`).toBeGreaterThanOrEqual(0);
  expect(saved).toBeLessThan(routes.indexOf('POST /reflections/:id/submit'));
});

test('if the last save fails, Submit sends nothing and says why', async ({ page, api }) => {
  api.fail('PATCH /entries/:id', { kind: 'network' });
  await page.goto(`/reflections/${DRAFT}`);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await narrative(page).fill('This one will not save.');
  await page.getByRole('button', { name: 'Submit', exact: true }).click();

  await expect(page.getByText(/last edit did not save/)).toBeVisible();
  expect(api.writes().map((call) => call.route)).not.toContain('POST /reflections/:id/submit');
});

test('a read-only entry with no evidence says so', async ({ page }) => {
  await page.goto(`/reflections/${SUBMITTED}`);
  await expect(page.getByText('No evidence attached.')).toBeVisible();
});
```

- [ ] **Step 2: Watch them fail**

Run: `cd web && npx playwright test e2e/stepper-edits.spec.ts --project=chromium`
Expected:
- "Next straight after typing" FAILS: the poll times out with `[]`, because the timer was cleared on unmount.
- "Submit straight after typing" FAILS: `saved` is -1, or later than the submit.
- "if the last save fails" FAILS: the submit is posted.
- "no evidence" FAILS: the text isn't found.
- The two Task 2 tests still PASS.

If the fixture's `unexpected` check names a route the Submitted page reads after the redirect, serve that route's shape in `fake-api.ts`, in the Task 1 style. Never loosen the check.

- [ ] **Step 3: Commit**

```bash
git add web/e2e/stepper-edits.spec.ts
git commit -m "test(e2e): the last edit is saved on leaving and before Submit; empty evidence says so (CAP-52, red)"
```

### Task 5: TextArea flushes; Submit waits for it (GREEN)

**Files:**
- Modify: `web/src/components/TextArea/TextArea.tsx`
- Modify: `web/src/screens/EntryStepper.tsx`: `submit` (line 419), the `EntryCard` props, the narrative `<TextArea>` (line 756), and `EvidenceList`'s read-only branch (around line 1010)
- Modify: `web/src/screens/EntryStepper.module.css`: a new `.evidence_empty`

**Interfaces:**
- Produces: `export interface TextAreaHandle { flush: () => Promise<void> }`, and `TextArea` accepts `ref?: Ref<TextAreaHandle>` (React 19 ref-as-prop).

- [ ] **Step 1: TextArea saves through one function, flushes on demand and on unmount**

```tsx
import { useEffect, useId, useImperativeHandle, useRef, useState } from 'react';
import type { ChangeEvent, Ref } from 'react';

/** For a parent that must not lose the last edit (CAP-52): flush() sends a
 * pending edit now rather than waiting out the debounce, and resolves when
 * the newest save settles, rejecting if it failed. */
export interface TextAreaHandle {
  flush: () => Promise<void>;
}
// in TextAreaProps:
  ref?: Ref<TextAreaHandle>;

  // inside the component, beside the other refs:
  const inflightRef = useRef<Promise<void> | null>(null);

  // One way to save, used by the debounce, flush() and unmount alike.
  const start_save = (): Promise<void> => {
    timeoutRef.current = undefined;
    const toSave = pendingValueRef.current;
    const saving = saveRef.current(toSave);
    inflightRef.current = saving;
    saving
      .then(() => {
        // A later keystroke may have started a newer save already; only
        // this save's own result should be allowed to set the status.
        if (pendingValueRef.current === toSave) updateStatus('saved');
      })
      .catch(() => {
        if (pendingValueRef.current === toSave) updateStatus('failed');
      });
    return saving;
  };

  useImperativeHandle(ref, () => ({
    flush: () => {
      if (timeoutRef.current !== undefined) {
        clearTimeout(timeoutRef.current);
        return start_save();
      }
      return inflightRef.current ?? Promise.resolve();
    },
  }));

  // Leaving with an edit still waiting sends it rather than dropping it
  // (CAP-52). Nothing typed means no timer, so React's dev double-mount
  // sends nothing.
  useEffect(
    () => () => {
      if (timeoutRef.current === undefined) return;
      clearTimeout(timeoutRef.current);
      start_save().catch(() => {});
    },
    // start_save reads refs only, so the first render's copy is current.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
```

Delete the old `useEffect(() => () => clearTimeout(timeoutRef.current), [])`. In `handleChange`, the timeout body becomes `timeoutRef.current = setTimeout(start_save, debounceMs);`, after the existing `clearTimeout` and `updateStatus('saving')`. Destructure `ref` in the props list.

- [ ] **Step 2: The stepper holds the handle and Submit awaits it**

```tsx
// EntryStepper, beside the other refs
const narrative_ref = useRef<TextAreaHandle>(null);

// on <EntryCard …/>
narrative_ref={narrative_ref}

// EntryCard props: narrative_ref: Ref<TextAreaHandle>; and on the <TextArea>:
ref={narrative_ref}

// submit, after setSubmitError(null), before the existing try
try {
  await narrative_ref.current?.flush();
} catch {
  setSubmitError(
    new ApiError(0, null, 'Your last edit did not save, so nothing was submitted. Check the connection and try again.'),
  );
  setSubmitting(false);
  return;
}
```

Import `TextAreaHandle` from `../components/TextArea/TextArea.tsx` (or the components index, if it re-exports TextArea's types), and `Ref` from `react`.

- [ ] **Step 3: Say when there is no evidence**

```tsx
      {read_only && entry.evidence.length === 0 && (
        <p className={styles.evidence_empty}>No evidence attached.</p>
      )}
```

```css
.evidence_empty {
  margin: 0;
  font-size: var(--font-size-sm);
  color: var(--color-text-muted);
}
```

- [ ] **Step 4: Watch it pass**

Run: `cd web && npx tsc -b --noEmit && npx playwright test e2e/stepper-edits.spec.ts --project=chromium`
Expected: all 6 PASS.

- [ ] **Step 5: Full suite, guards, look at it**

Run: `./run lint && cd web && npx playwright test && cd .. && bash scripts/check-tokens.sh && node scripts/check-contrast.mjs && python3 scripts/check-docs.py && bash scripts/verify-entry-stepper.sh`
Expected: all green; e2e passes the full count.

Then look at the stepper, student and assessor, at 390 and 1280 in both themes. Use the `entry-stepper-*` shots from `./run shots`, with the env unset so they use the fake.

- [ ] **Step 6: Commit**

```bash
git add web/src/components/TextArea/TextArea.tsx web/src/screens/EntryStepper.tsx web/src/screens/EntryStepper.module.css
git commit -m "fix(web): the last edit is saved on leaving a competency and before Submit; empty evidence says so (CAP-52)"
```

### Task 6: Review, PR, ticket

- [ ] **Step 1:** Run a fresh code reviewer, on the most capable model, against `git diff origin/dev...HEAD`, with the Review Focus above. Fix any Critical or Important finding with a test that fails first.
- [ ] **Step 2:** Push and open a PR into `dev`, titled `fix(web): the reflection editor keeps every edit (CAP-52)`. In the body, give each test's RED reason and the full e2e count. Request Patrick (RickLTCS), who owns the stepper's UI rounds.
- [ ] **Step 3:** With the PR open and CI green, move CAP-52 to In Review. After the merge, check each acceptance criterion against `dev` and move it to Done, with the evidence in a comment.

## Not in this plan (deferred, from the same tester pass)
- After a gate refusal, `setStep` should be `go_to_step`, so a phone scrolls to the highlighted card (finding 8).
- A double Enter on Add link adds the link twice (finding 11).
- A fetch timeout, and plainer network-error copy (finding 10).
- "Sam O has been notified" (finding 8 in the summary). It's COA4-70's acceptance-criterion wording, so it's Tony's call before anyone changes it.
