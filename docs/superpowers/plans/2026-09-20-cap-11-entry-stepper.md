# CAP-11 Entry Stepper (Student Mode) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the entry stepper screen (`/reflections/:reflection_id`) that lets a student
write a narrative, attach evidence and self-score each competency in their reflection, then
submit it -- the screen Jira ticket COA4-69 (CAP-11) calls "the heart of the product."

**Architecture:** One screen component, `EntryStepper.tsx`, following the same shape as the
already-merged `DiaryHome.tsx`: a pure, React-free logic module for the parts worth reading
twice, a screen file that fetches and renders, and a CSS module using only tokens. It fetches
`GET /reflections/{reflection_id}` for the entries (narrative, evidence, scores, and each
entry's own competency name) and `GET /frameworks/{framework_id}` for the level descriptors
and the evidence policy. `draft` is the only editable status; every other status renders the
same markup read-only, so there is one screen for "writing it" and "looking at it after,"
not two.

**Tech Stack:** React 19, TypeScript, the generated API client (`web/src/api/client.ts`),
existing components (`TextArea`, `ProgressBar`, `Chip`, `Card`, `Badge`, `Button`,
`ErrorNotice`, `Skeleton`/`SkeletonGroup`), CSS Modules against `web/src/tokens.css`.

**Spec:** Jira COA4-69 (CAP-11 -- confirmed with the user 2026-09-20) and
`.claude/skills/add-screen/SKILL.md`. No separate spec doc: the ticket's acceptance criteria
are the spec, reproduced under Global Constraints below so this plan travels with them.

## Global Constraints

- All eight acceptance criteria on COA4-69 must hold; see the numbered list below, copied
  verbatim from the ticket.
- Competency name and level descriptors read from the payload -- no competency name, scale
  bound or descriptor hardcoded in TypeScript.
- Narrative autosave via `PATCH /entries/{id}`, debounced, with a visible saved / saving /
  failed indicator. `TextArea` already implements this; do not re-implement it.
- Evidence: attach via `POST /entries/{id}/evidence` (JSON for a link, multipart for a file),
  remove via `DELETE /evidence/{id}`, respecting the framework's own type/size limits.
- Self-score via `PUT /entries/{id}/scores/self` -- an upsert, not a create.
- "Competency N of M" progress with Back/Next, Submit on the last step. `ProgressBar` already
  renders the label; do not re-implement it.
- A submit failure (`NARRATIVE_REQUIRED`, `SELF_SCORE_MISSING`, `EVIDENCE_REQUIRED`) carries
  `details.entry_ids`; the screen must jump to the first offending entry in rubric order, not
  show a generic banner.
- `draft` is the only editable status. Every other status renders read-only.
- All four states: loaded, loading (skeletons), empty, error.
- **Security condition from the ticket's own comment (Tony To, 2026-09-19), carried into this
  plan rather than deferred:** a `link` evidence item renders with
  `rel="noopener noreferrer"`. A `file` or `image` evidence item is never given a clickable
  URL -- the contract has no endpoint that serves an evidence file back
  (`/evidence/{evidence_id}` only deletes) -- so this screen shows a file's label as plain
  text, never as a link, and never adds a download. If a future ticket adds one, it needs
  `Content-Disposition: attachment`, `X-Content-Type-Options: nosniff`, and a
  server-decided `Content-Type`, per the same comment.
- No raw hex or pixel values anywhere; every colour, spacing and radius value is a
  `var(--...)` token from `web/src/tokens.css`.
- No second API client, no hand-written response type. Everything comes from
  `web/src/api/client.ts` and `web/src/api/schema.ts`.
- `web/` has no test runner (CLAUDE.md). Each task's gate is `npm run build` (`tsc -b && vite
  build`) inside `web/`, which catches a contract mismatch or a type error the same way a
  failing unit test would. The final task adds the project's usual scripted check
  (`scripts/verify-entry-stepper.sh`, wired into `./run`) and a manual walkthrough against
  seeded data, matching `verify-diary-home.sh`'s existing pattern.
- `mode` is intentionally not a prop on this component yet. CAP-13 (COA4-71, "Assessor
  stepper") is described on its own ticket as "the same component as CAP-11 in a second
  mode... sequence this after CAP-11 merges rather than running them in parallel" -- i.e.
  CAP-13 adds the mode when it lands. Building an unused `mode: 'assessor'` branch now with
  nothing to exercise it would be exactly the speculative generality YAGNI warns against.
  Keep `EntryCard`'s read-only rendering and `update_entry`'s state-merge pattern easy for
  CAP-13 to extend (documented inline), but do not pre-build assessor behaviour.

---

## File structure

| File | Responsibility |
| --- | --- |
| `web/src/screens/entry-stepper-logic.ts` | Pure functions: levels for a competency, self/counter score lookup, which entry is "first offending," byte and file-type formatting. No React. |
| `web/src/screens/EntryStepper.tsx` | The screen: fetch, four states, step navigation, submit. Contains `EntryCard`, `EvidenceList` and `StepIndicator` as screen-local subcomponents, same pattern as `DiaryHome.tsx`'s `ScopedRadar` and `ReflectionList`. |
| `web/src/screens/EntryStepper.module.css` | Tokens only. |
| `web/src/app/routes.tsx` | One `Route` swapped from the CAP-11 placeholder to `<EntryStepper />`. |
| `scripts/verify-entry-stepper.sh` | The project's usual frontend check: mounted, no second client, all four states, evidence link security condition present in the source. |
| `run` | One new case, `verify-entry-stepper`, mirroring `verify-diary`. |

---

## Task 1: Pure stepper logic

**Files:**
- Create: `web/src/screens/entry-stepper-logic.ts`

**Interfaces:**
- Produces: `levels_for(framework, competency_id): Level[]`,
  `self_score_of(entry): Score | null`, `counter_scores_of(entry): Score[]`,
  `first_offending_index(entries, entry_ids): number | null`,
  `is_offending(entry, entry_ids): boolean`, `format_bytes(bytes): string`,
  `accepted_types_hint(accepted_file_types): string | null`, and the re-exported types
  `ReflectionDetail`, `ReflectionEntry`, `FrameworkDetail`, `Level`, `Evidence`, `Score`.
  Task 2 imports all of these.

- [ ] **Step 1: Write the file**

```ts
/**
 * Everything the entry stepper decides about steps, levels and submit
 * failures, with no React in it. Same split as diary-scope.ts: the parts
 * worth reading twice are pure functions of the payloads, so a scope bug
 * and a rendering bug are never the same bug.
 */
import type { components } from '../api/schema.ts';

export type ReflectionDetail = components['schemas']['ReflectionDetail'];
export type ReflectionEntry = components['schemas']['ReflectionEntry'];
export type FrameworkDetail = components['schemas']['FrameworkDetail'];
export type Level = components['schemas']['Level'];
export type Evidence = components['schemas']['Evidence'];
export type Score = components['schemas']['Score'];

/**
 * The levels for one competency, in level_value order -- what the stepper
 * taps through. ReflectionEntry carries its own competency_name and
 * competency_code (criterion 1's first half); this is the second half, and
 * it lives only on the framework because a level descriptor is scored
 * against a specific snapshotted version, never the framework "as it is now."
 */
export function levels_for(framework: FrameworkDetail, competency_id: string): Level[] {
  const competency = framework.competencies.find((candidate) => candidate.id === competency_id);
  if (!competency) return [];
  return [...competency.levels].sort((a, b) => a.level_value - b.level_value);
}

/** This entry's own score, if the student has set one yet. */
export function self_score_of(entry: ReflectionEntry): Score | null {
  return entry.scores.find((score) => score.scorer_class === 'self') ?? null;
}

/** Every counter-score on this entry. Already oldest-first per the contract. */
export function counter_scores_of(entry: ReflectionEntry): Score[] {
  return entry.scores.filter((score) => score.scorer_class === 'counter');
}

/**
 * The gate names the failing entries in details.entry_ids, but not an order
 * to visit them in. "First" is this screen's own rubric order
 * (ReflectionDetail.entries, already position-sorted by the API), matching
 * the ticket's "walk the user to the first one" wording. Returns null when
 * details carried no entry_ids at all, or none of them matched -- a
 * generic error, not a stepper jump.
 */
export function first_offending_index(
  entries: readonly ReflectionEntry[],
  entry_ids: unknown,
): number | null {
  if (!Array.isArray(entry_ids)) return null;
  const offending = new Set(entry_ids.filter((id): id is string => typeof id === 'string'));
  const index = entries.findIndex((entry) => offending.has(entry.id));
  return index === -1 ? null : index;
}

/** Whether this one entry is named in a submit failure's entry_ids. */
export function is_offending(entry: ReflectionEntry, entry_ids: readonly string[] | null): boolean {
  return entry_ids !== null && entry_ids.includes(entry.id);
}

/** "512 B", "48 KB", "2.4 MB" -- for the evidence hint under the framework's own max_file_bytes. */
export function format_bytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** ".pdf, .png, .jpg" for the file input's accept attribute and the hint text. Null means no file restriction stated. */
export function accepted_types_hint(accepted_file_types: readonly string[] | null): string | null {
  if (!accepted_file_types || accepted_file_types.length === 0) return null;
  return accepted_file_types.map((type) => `.${type}`).join(', ');
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd web && npm run build`
Expected: builds clean. This file has no consumer yet, so the only way it can fail is a
type error against `schema.ts` -- e.g. a schema field renamed since this plan was written.
If `components['schemas']['ReflectionDetail']` or any sibling type is missing, run
`npm run gen:types` first and re-check `docs/openapi.yaml` matches what this plan assumed.

- [ ] **Step 3: Commit**

```bash
git add web/src/screens/entry-stepper-logic.ts
git commit -m "feat(web): entry stepper logic -- levels, offending entries, evidence formatting (CAP-11)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 2: The screen shell -- four states, no editing yet

**Files:**
- Create: `web/src/screens/EntryStepper.tsx`
- Create: `web/src/screens/EntryStepper.module.css`

**Interfaces:**
- Consumes: everything from Task 1 (`entry-stepper-logic.ts`), plus `api`, `ApiError` from
  `../api/client.ts`, and `Badge`, `Button`, `ErrorNotice`, `ProgressBar`, `Skeleton`,
  `SkeletonGroup` from `../components/index.ts`.
- Produces: `EntryStepper` (the exported screen component), and the internal `Load` union
  (`loading | error | loaded`) that Task 3 and Task 4 extend by adding to the JSX inside the
  `loaded` branch, not by adding a new `Load` variant -- matching how `DiaryHome.tsx` nests
  its three empty cases inside one `loaded` branch rather than making them top-level states.

- [ ] **Step 1: Write the screen shell**

```tsx
/**
 * The entry stepper: one reflection, one competency at a time.
 *
 * "The heart of the product" (CAP-11, COA4-69). A student steps through
 * their reflection's entries -- one per competency, in rubric order --
 * writing a narrative, attaching evidence, and scoring themselves, then
 * submits.
 *
 * Two fetches, not one: GET /reflections/{id} for the entries (narrative,
 * evidence, scores, and each entry's own competency name) and GET
 * /frameworks/{framework_id} for the level descriptors and the evidence
 * policy. The framework fetch uses the id the reflection carries, which is
 * the framework as it was snapshotted at framework_version, not necessarily
 * the gig's current rubric.
 *
 * draft is the only editable status (criterion 7): every other status
 * renders every entry read-only, including any counter-score already on
 * it, through this same markup rather than a second screen.
 *
 * Evidence files are never given a link here. The contract's
 * /evidence/{evidence_id} only deletes -- there is no endpoint that serves
 * a file back -- and this ticket's own comment (Tony To, 2026-09-19) flags
 * that serving one inline would let an uploaded .html or .svg run script on
 * the API's origin. A file's label is plain text; only a `link` evidence
 * item gets an <a>, and it carries rel="noopener noreferrer" per the same
 * comment.
 */
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';

import { api, ApiError } from '../api/client.ts';
import {
  Badge,
  Button,
  ErrorNotice,
  ProgressBar,
  Skeleton,
  SkeletonGroup,
} from '../components/index.ts';
import type { FrameworkDetail, ReflectionDetail } from './entry-stepper-logic.ts';
import styles from './EntryStepper.module.css';

type Load =
  | { status: 'loading' }
  | { status: 'error'; error: ApiError }
  | { status: 'loaded'; reflection: ReflectionDetail; framework: FrameworkDetail };

function as_api_error(error: unknown, fallback: string): ApiError {
  return error instanceof ApiError ? error : new ApiError(0, null, fallback);
}

export function EntryStepper() {
  const { reflection_id } = useParams<{ reflection_id: string }>();
  const navigate = useNavigate();
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [reload_key, setReloadKey] = useState(0);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!reflection_id) return;
    const controller = new AbortController();

    api
      .get('/reflections/{reflection_id}', {
        path: { reflection_id },
        signal: controller.signal,
      })
      .then((reflection) =>
        api
          .get('/frameworks/{framework_id}', {
            path: { framework_id: reflection.framework_id },
            signal: controller.signal,
          })
          .then((framework) => setLoad({ status: 'loaded', reflection, framework })),
      )
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setLoad({
          status: 'error',
          error: as_api_error(error, 'Something went wrong loading this reflection.'),
        });
      });

    return () => controller.abort();
  }, [reflection_id, reload_key]);

  const retry = useCallback(() => {
    setLoad({ status: 'loading' });
    setReloadKey((key) => key + 1);
  }, []);

  if (load.status === 'loading') {
    return (
      <section>
        <h1 className={styles.heading}>Reflection</h1>
        <LoadingState />
      </section>
    );
  }

  if (load.status === 'error') {
    return (
      <section>
        <h1 className={styles.heading}>Reflection</h1>
        <ErrorNotice error={load.error} on_retry={retry} />
      </section>
    );
  }

  const { reflection } = load;
  const entries = reflection.entries;

  if (entries.length === 0) {
    // Defensive, not expected: ReflectionCreator makes one entry per
    // competency eagerly, so zero entries means the snapshotted framework
    // itself has none -- a broken rubric, not a normal path. Still one of
    // this screen's four states rather than a blank crash.
    return (
      <section>
        <h1 className={styles.heading}>Reflection</h1>
        <div className={styles.empty}>
          <p className={styles.empty_title}>Nothing to reflect on.</p>
          <p className={styles.empty_body}>
            This reflection&rsquo;s rubric has no competencies. That is a problem with the
            rubric, not with you -- tell your supervisor.
          </p>
        </div>
      </section>
    );
  }

  const read_only = reflection.status !== 'draft';
  const current_index = Math.min(step, entries.length - 1);
  const current = entries[current_index];

  return (
    <section>
      <h1 className={styles.heading}>Reflection</h1>
      <div className={styles.status_row}>
        <Badge status={reflection.status} />
      </div>

      <ProgressBar current={current_index + 1} total={entries.length} label="Competency" />

      <p className={styles.competency_name}>{current.competency_name}</p>

      {/* Task 3 replaces this placeholder with the narrative, evidence and
          self-score UI for `current`. Left as visible text rather than
          nothing so this task's own build is checkable end to end. */}
      <p className={styles.todo}>{read_only ? 'Read-only view: Task 4.' : 'Editing: Task 3.'}</p>

      <div className={styles.nav}>
        <Button
          variant="secondary"
          full_width={false}
          disabled={current_index === 0}
          on_click={() => setStep((s) => Math.max(0, s - 1))}
        >
          Back
        </Button>

        {current_index < entries.length - 1 && (
          <Button full_width={false} on_click={() => setStep((s) => s + 1)}>
            Next
          </Button>
        )}
      </div>
    </section>
  );
}

/** Shaped like the loaded screen: a progress bar and one card, not a spinner. */
function LoadingState() {
  return (
    <SkeletonGroup label="Loading this reflection">
      <Skeleton variant="block" width="100%" height="var(--space-32)" />
      <Skeleton variant="block" width="100%" height="12rem" />
    </SkeletonGroup>
  );
}
```

```css
/* web/src/screens/EntryStepper.module.css */
.heading {
  margin: 0 0 var(--space-16);
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-bold);
  color: var(--color-text);
}

.status_row {
  margin-bottom: var(--space-16);
}

.competency_name {
  margin: 0 0 var(--space-12);
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-medium);
  color: var(--color-text);
}

.todo {
  margin: 0 0 var(--space-16);
  color: var(--color-text-muted);
  font-style: italic;
}

.nav {
  display: flex;
  justify-content: space-between;
  gap: var(--space-16);
  margin-top: var(--space-24);
}

.empty {
  display: flex;
  flex-direction: column;
  gap: var(--space-8);
  padding: var(--space-32) var(--space-16);
  border-radius: var(--radius-md);
  background: var(--color-surface-alt);
  text-align: center;
}

.empty_title {
  margin: 0;
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-medium);
  color: var(--color-text);
}

.empty_body {
  margin: 0;
  font-size: var(--font-size-sm);
  color: var(--color-text-muted);
}
```

Before writing the CSS file, confirm `--font-size-lg` exists in `web/src/tokens.css`
(`--font-size-xl`, `--font-size-base` and `--font-size-sm` are already confirmed in use by
`DiaryHome.module.css` and `ReviewQueue.module.css`). If `--font-size-lg` is not there, use
`--font-size-base` instead and drop the `lg` reference -- do not invent a token.

- [ ] **Step 2: Verify it compiles and renders**

Run: `cd web && npm run build`
Expected: builds clean.

Then, with `./run mock` running in one terminal (prism mock on :4010) and `VITE_API_BASE_URL`
in `web/.env` pointed at it, run `./run web` and visit `http://localhost:5173/reflections/<any-uuid-the-mock-accepts>`.
Expected: the loading skeleton appears briefly, then either the "Nothing to reflect on" empty
state or the shell with a competency name and Back/Next -- not a blank page or an uncaught
exception in the console.

- [ ] **Step 3: Commit**

```bash
git add web/src/screens/EntryStepper.tsx web/src/screens/EntryStepper.module.css
git commit -m "feat(web): entry stepper screen shell, all four states (CAP-11)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 3: Draft editing -- narrative, self-score, evidence

**Files:**
- Modify: `web/src/screens/EntryStepper.tsx` (replace the Task 2 placeholder paragraph with
  `<EntryCard>`; add the `update_entry` callback and the `EntryCard`, `LevelPicker` and
  `EvidenceList` subcomponents)
- Modify: `web/src/screens/EntryStepper.module.css` (append the classes the new markup uses)

**Interfaces:**
- Consumes: `levels_for`, `self_score_of`, `accepted_types_hint`, `format_bytes` from
  `entry-stepper-logic.ts` (Task 1); `TextArea`, `Chip`, `Card` from `../components/index.ts`.
- Produces: `EntryCard({ entry, framework, read_only, on_change })`, called from the main
  component with `on_change={update_entry}`. Task 4 reuses this exact signature for the
  read-only branch -- `read_only` is already a parameter, not something Task 4 has to add.

- [ ] **Step 1: Add `update_entry` and swap in `EntryCard`**

In `EntryStepper.tsx`, add this callback beside `retry` (after the `useEffect`, before the
`if (load.status === 'loading')` block):

```tsx
  const update_entry = useCallback((next: ReflectionEntry) => {
    setLoad((current) => {
      if (current.status !== 'loaded') return current;
      return {
        ...current,
        reflection: {
          ...current.reflection,
          entries: current.reflection.entries.map((entry) =>
            entry.id === next.id ? next : entry,
          ),
        },
      };
    });
  }, []);
```

Add `ReflectionEntry` to the type-only import from `./entry-stepper-logic.ts`, replace the
whole "Task 3 replaces this placeholder..." paragraph and the `competency_name` paragraph
above it with:

```tsx
      <EntryCard
        entry={current}
        framework={load.framework}
        read_only={read_only}
        on_change={update_entry}
      />
```

- [ ] **Step 2: Write `EntryCard` and its two children**

Append to the bottom of `EntryStepper.tsx`, after `LoadingState`:

```tsx
/**
 * One competency: its name, narrative, self-score and evidence. `read_only`
 * is already a parameter here so CAP-13 (the assessor stepper) can pass
 * `true` and reuse this exact card for a submitted reflection's counter-
 * scoring view, rather than this ticket guessing at a `mode` prop nothing
 * exercises yet.
 */
function EntryCard({
  entry,
  framework,
  read_only,
  on_change,
}: {
  entry: ReflectionEntry;
  framework: FrameworkDetail;
  read_only: boolean;
  on_change: (next: ReflectionEntry) => void;
}) {
  const [narrative_error, setNarrativeError] = useState<string | null>(null);
  const [score_error, setScoreError] = useState<string | null>(null);
  const levels = levels_for(framework, entry.competency_id);
  const self_score = self_score_of(entry);

  const save_narrative = useCallback(
    async (value: string) => {
      setNarrativeError(null);
      try {
        const updated = await api.patch('/entries/{entry_id}', {
          path: { entry_id: entry.id },
          body: { narrative: value },
        });
        on_change({ ...entry, narrative: updated.narrative });
      } catch (error) {
        const api_error = as_api_error(error, 'Could not save that.');
        setNarrativeError(api_error.message);
        throw api_error; // TextArea's own status turns "failed" on a rejection.
      }
    },
    [entry, on_change],
  );

  const choose_level = useCallback(
    async (level_id: string) => {
      setScoreError(null);
      try {
        const score = await api.put('/entries/{entry_id}/scores/self', {
          path: { entry_id: entry.id },
          body: { level_id },
        });
        const others = entry.scores.filter((existing) => existing.scorer_class !== 'self');
        on_change({ ...entry, scores: [...others, score] });
      } catch (error) {
        setScoreError(as_api_error(error, 'Could not save that score.').message);
      }
    },
    [entry, on_change],
  );

  return (
    <div className={styles.card}>
      <p className={styles.competency_name}>{entry.competency_name}</p>

      <TextArea
        label="Your reflection"
        value={entry.narrative ?? ''}
        onChange={(value) => on_change({ ...entry, narrative: value })}
        onSave={save_narrative}
        disabled={read_only}
        placeholder="What did you do, and what did you learn from it?"
      />
      {narrative_error && (
        <p className={styles.field_error} role="alert">
          {narrative_error}
        </p>
      )}

      <div className={styles.levels}>
        <p className={styles.field_label}>Self-score</p>
        <div className={styles.level_row} role="group" aria-label="Self-score">
          {levels.map((level) => (
            <Chip
              key={level.id}
              selected={self_score?.level_id === level.id}
              disabled={read_only}
              on_click={() => choose_level(level.id)}
            >
              {level.level_value} &middot; {level.descriptor}
            </Chip>
          ))}
        </div>
        {score_error && (
          <p className={styles.field_error} role="alert">
            {score_error}
          </p>
        )}
      </div>

      <EvidenceList entry={entry} framework={framework} read_only={read_only} on_change={on_change} />
    </div>
  );
}

/**
 * Attach and remove evidence. A `link` item is the only kind that ever gets
 * a clickable URL (rel="noopener noreferrer", per the ticket's security
 * comment) -- a `file` or `image` item's label is plain text, because the
 * contract has nothing that serves a file back and this screen does not
 * invent one.
 */
function EvidenceList({
  entry,
  framework,
  read_only,
  on_change,
}: {
  entry: ReflectionEntry;
  framework: FrameworkDetail;
  read_only: boolean;
  on_change: (next: ReflectionEntry) => void;
}) {
  const [adding_link, setAddingLink] = useState(false);
  const [label, setLabel] = useState('');
  const [uri, setUri] = useState('');
  const [error, setError] = useState<string | null>(null);
  const hint = accepted_types_hint(framework.accepted_file_types);

  const remove = useCallback(
    async (evidence_id: string) => {
      setError(null);
      try {
        await api.delete('/evidence/{evidence_id}', { path: { evidence_id } });
        on_change({ ...entry, evidence: entry.evidence.filter((e) => e.id !== evidence_id) });
      } catch (deleteError) {
        setError(as_api_error(deleteError, 'Could not remove that.').message);
      }
    },
    [entry, on_change],
  );

  const add_link = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      setError(null);
      try {
        const evidence = await api.post('/entries/{entry_id}/evidence', {
          path: { entry_id: entry.id },
          body: { kind: 'link', label, uri },
        });
        on_change({ ...entry, evidence: [...entry.evidence, evidence] });
        setLabel('');
        setUri('');
        setAddingLink(false);
      } catch (addError) {
        setError(as_api_error(addError, 'Could not attach that link.').message);
      }
    },
    [entry, label, uri, on_change],
  );

  const add_file = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file) return;
      setError(null);
      try {
        const form = new FormData();
        form.append('label', file.name);
        form.append('file', file);
        const evidence = await api.post('/entries/{entry_id}/evidence', {
          path: { entry_id: entry.id },
          body: form,
        });
        on_change({ ...entry, evidence: [...entry.evidence, evidence] });
      } catch (addError) {
        setError(as_api_error(addError, 'Could not attach that file.').message);
      }
    },
    [entry, on_change],
  );

  return (
    <div className={styles.evidence}>
      <p className={styles.field_label}>Evidence</p>

      {entry.evidence.length > 0 && (
        <ul className={styles.evidence_list}>
          {entry.evidence.map((item) => (
            <li key={item.id} className={styles.evidence_row}>
              {item.kind === 'link' ? (
                <a href={item.uri} target="_blank" rel="noopener noreferrer">
                  {item.label}
                </a>
              ) : (
                <span>{item.label}</span>
              )}
              {item.size_bytes !== null && (
                <span className={styles.evidence_size}>{format_bytes(item.size_bytes)}</span>
              )}
              {!read_only && (
                <Button variant="secondary" full_width={false} on_click={() => remove(item.id)}>
                  Remove
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {!read_only && (
        <div className={styles.evidence_add}>
          {adding_link ? (
            <form className={styles.evidence_form} onSubmit={add_link}>
              <input
                className={styles.evidence_input}
                placeholder="Label"
                value={label}
                onChange={(event) => setLabel(event.target.value)}
              />
              <input
                className={styles.evidence_input}
                placeholder="https://..."
                value={uri}
                onChange={(event) => setUri(event.target.value)}
              />
              <Button type="submit" full_width={false} disabled={!label || !uri}>
                Add link
              </Button>
            </form>
          ) : (
            <div className={styles.evidence_actions}>
              <Button variant="secondary" full_width={false} on_click={() => setAddingLink(true)}>
                Add a link
              </Button>
              <label className={styles.file_button}>
                Attach a file
                <input
                  type="file"
                  className={styles.file_input}
                  accept={framework.accepted_file_types?.map((t) => `.${t}`).join(',')}
                  onChange={add_file}
                />
              </label>
            </div>
          )}
          {hint && (
            <p className={styles.evidence_hint}>
              Accepted: {hint}, up to {format_bytes(framework.max_file_bytes)}.
            </p>
          )}
        </div>
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

`useState` is already imported in this file. Add one more import line for the two event
types the code above uses (`FormEvent`, `ChangeEvent`) -- this codebase never imports the
`React` namespace; `TextArea.tsx` imports `ChangeEvent` directly, and this file matches
that. Change the top of `EntryStepper.tsx` from:

```tsx
import { useCallback, useEffect, useState } from 'react';
```

to:

```tsx
import { useCallback, useEffect, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
```

- [ ] **Step 2: Add the CSS this step's markup uses**

Append to `EntryStepper.module.css`:

```css
.card {
  display: flex;
  flex-direction: column;
  gap: var(--space-16);
  padding: var(--space-16);
  border: var(--border-width-sm) solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
}

.field_label {
  margin: 0 0 var(--space-8);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--color-text);
}

.field_error {
  margin: var(--space-4) 0 0;
  font-size: var(--font-size-sm);
  color: var(--color-danger);
}

.level_row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-8);
}

.evidence_list {
  display: flex;
  flex-direction: column;
  gap: var(--space-8);
  margin: 0 0 var(--space-8);
  padding: 0;
  list-style: none;
}

.evidence_row {
  display: flex;
  align-items: center;
  gap: var(--space-8);
  font-size: var(--font-size-sm);
}

.evidence_size {
  color: var(--color-text-muted);
}

.evidence_actions {
  display: flex;
  gap: var(--space-8);
}

.evidence_form {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-8);
}

.evidence_input {
  flex: 1 1 12rem;
  padding: var(--space-8);
  border: var(--border-width-sm) solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  color: var(--color-text);
}

.file_button {
  display: inline-flex;
  align-items: center;
  padding: var(--space-8) var(--space-16);
  border: var(--border-width-sm) solid var(--color-border);
  border-radius: var(--radius-sm);
  cursor: pointer;
}

.file_input {
  /* Visually hidden, not display:none -- a screen reader still needs it. */
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}

.evidence_hint {
  margin: var(--space-4) 0 0;
  font-size: var(--font-size-sm);
  color: var(--color-text-muted);
}
```

Before using them, confirm `--border-width-sm` and `--color-danger` exist in
`web/src/tokens.css` (both are already used by `ReviewQueue.module.css` and
`DiaryHome`-adjacent components respectively) -- if either name differs, match the token
that is actually there rather than inventing one.

- [ ] **Step 3: Verify it compiles and behaves**

Run: `cd web && npm run build`
Expected: builds clean.

Manual check against the mock (`./run mock`, `./run web`): open a reflection, type in the
narrative and confirm "Saving…" then "Saved" appears; tap a level chip and confirm it
highlights; add a link and confirm it appears with `rel="noopener noreferrer"` in the
rendered HTML (check via the browser's element inspector); remove it and confirm it
disappears.

- [ ] **Step 4: Commit**

```bash
git add web/src/screens/EntryStepper.tsx web/src/screens/EntryStepper.module.css
git commit -m "feat(web): entry stepper draft editing -- narrative, self-score, evidence (CAP-11)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 4: Submit, offending-entry jump, and read-only rendering

**Files:**
- Modify: `web/src/screens/EntryStepper.tsx`

**Interfaces:**
- Consumes: `first_offending_index`, `is_offending`, `counter_scores_of` from
  `entry-stepper-logic.ts` (Task 1); `EntryCard` from Task 3 (already takes `read_only`, so
  this task only has to pass the right value and does not touch `EntryCard` itself).
- Produces: nothing further downstream -- this is the last piece CAP-13 does not depend on
  directly (CAP-13 depends on `EntryCard`'s shape from Task 3).

- [ ] **Step 1: Add submit state and the `submit` callback**

Add to the state declarations near the top of `EntryStepper`:

```tsx
  const [offending, setOffending] = useState<readonly string[] | null>(null);
  const [submit_error, setSubmitError] = useState<ApiError | null>(null);
  const [submitting, setSubmitting] = useState(false);
```

Add the callback after `update_entry`:

```tsx
  const submit = useCallback(async () => {
    if (!reflection_id || load.status !== 'loaded') return;
    setSubmitting(true);
    setSubmitError(null);

    try {
      await api.post('/reflections/{reflection_id}/submit', { path: { reflection_id } });
      navigate(`/reflections/${reflection_id}/submitted`);
    } catch (error) {
      const api_error = as_api_error(error, 'Could not submit this reflection.');
      setSubmitError(api_error);

      const raw_ids = api_error.details.entry_ids;
      if (Array.isArray(raw_ids)) {
        const ids = raw_ids.filter((id): id is string => typeof id === 'string');
        setOffending(ids);
        const index = first_offending_index(load.reflection.entries, ids);
        if (index !== null) setStep(index);
      }
    } finally {
      setSubmitting(false);
    }
  }, [reflection_id, navigate, load]);
```

Note `load.status !== 'loaded'` is checked before using `load.reflection` inside the
catch branch -- TypeScript narrows `load` to the `loaded` variant for the rest of the
callback body once that guard passes at the top, so `load.reflection.entries` inside the
`catch` is valid without a second check.

- [ ] **Step 2: Wire `read_only`, the offending highlight, and the Submit button**

Replace the `<EntryCard .../>` call with:

```tsx
      <EntryCard
        entry={current}
        framework={load.framework}
        read_only={read_only}
        offending={is_offending(current, offending)}
        on_change={update_entry}
      />

      {submit_error && (
        <p className={styles.submit_error} role="alert">
          {submit_error.message}
        </p>
      )}
```

Add `offending?: boolean` to `EntryCard`'s props (default `false`) and use it to add a class
to `.card` when true:

```tsx
function EntryCard({
  entry,
  framework,
  read_only,
  offending = false,
  on_change,
}: {
  entry: ReflectionEntry;
  framework: FrameworkDetail;
  read_only: boolean;
  offending?: boolean;
  on_change: (next: ReflectionEntry) => void;
}) {
```

```tsx
  return (
    <div className={offending ? `${styles.card} ${styles.card_offending}` : styles.card}>
```

Append to `EntryStepper.module.css`:

```css
.card_offending {
  border-color: var(--color-danger);
  background: var(--color-danger-bg);
}

.submit_error {
  margin: var(--space-16) 0 0;
  font-size: var(--font-size-sm);
  color: var(--color-danger);
  text-align: right;
}
```

Replace the `nav` block's second button so the last step shows Submit instead of Next, and
so a read-only reflection shows neither Next-as-submit nor Submit:

```tsx
      <div className={styles.nav}>
        <Button
          variant="secondary"
          full_width={false}
          disabled={current_index === 0}
          on_click={() => setStep((s) => Math.max(0, s - 1))}
        >
          Back
        </Button>

        {current_index < entries.length - 1 ? (
          <Button full_width={false} on_click={() => setStep((s) => s + 1)}>
            Next
          </Button>
        ) : (
          !read_only && (
            <Button full_width={false} disabled={submitting} on_click={submit}>
              {submitting ? 'Submitting…' : 'Submit'}
            </Button>
          )
        )}
      </div>
```

- [ ] **Step 3: Show counter-scores in the read-only view**

In `EntryCard`, after the self-score `level_row`, add (still inside the `.levels` div):

```tsx
        {read_only &&
          counter_scores_of(entry).map((score) => (
            <p key={score.id} className={styles.counter_score}>
              {score.scorer?.display_name ?? 'Counter-score'}: level {score.level_value}
              {score.comment && <> &mdash; &ldquo;{score.comment}&rdquo;</>}
            </p>
          ))}
```

Append to `EntryStepper.module.css`:

```css
.counter_score {
  margin: var(--space-8) 0 0;
  font-size: var(--font-size-sm);
  color: var(--color-text-muted);
}
```

- [ ] **Step 4: Verify it compiles and behaves**

Run: `cd web && npm run build`
Expected: builds clean.

Manual check against the mock: force the mock to answer `POST
/reflections/{reflection_id}/submit` with the `NARRATIVE_REQUIRED` example from
`docs/openapi.yaml` (prism serves an operation's example by default when no matching
request body is supplied, or override it with prism's `-d` flag) and confirm the screen
jumps to the first entry named in `details.entry_ids` and highlights its card. Then check a
reflection whose `status` is not `draft` (see Task 6's seeded-data table) renders every field
read-only with no Back/Next-into-Submit control past the last step, and any counter-score
present is visible.

- [ ] **Step 5: Commit**

```bash
git add web/src/screens/EntryStepper.tsx web/src/screens/EntryStepper.module.css
git commit -m "feat(web): entry stepper submit gate, offending-entry jump, read-only view (CAP-11)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 5: Wire into the router

**Files:**
- Modify: `web/src/app/routes.tsx:23,52-55`

**Interfaces:**
- Consumes: `EntryStepper` from `../screens/EntryStepper.tsx`.

- [ ] **Step 1: Import it**

```tsx
import { DiaryHome } from '../screens/DiaryHome.tsx';
import { EntryStepper } from '../screens/EntryStepper.tsx';
import { AppShell } from './AppShell.tsx';
```

(Insert the new line where it sorts alphabetically among the existing screen imports.)

- [ ] **Step 2: Replace the placeholder route**

Change:

```tsx
        <Route
          path="reflections/:reflection_id"
          element={<Placeholder screen="Entry stepper" ticket="CAP-11" />}
        />
```

to:

```tsx
        <Route path="reflections/:reflection_id" element={<EntryStepper />} />
```

Leave the `entries/:entry_id` placeholder route untouched -- nothing in the app links to it
(`DiaryHome` links to `/reflections/${row.id}`, per the existing comment on that route), and
the same comment already says CAP-11 is free to keep one, the other, or both. This plan
keeps only the one something actually reaches.

- [ ] **Step 3: Verify it compiles and mounts**

Run: `cd web && npm run build`
Expected: builds clean.

Run: `grep -n '<EntryStepper />' web/src/app/routes.tsx`
Expected: one match, on the `reflections/:reflection_id` route.

Run: `grep -n 'screen="Entry stepper" ticket="CAP-11"' web/src/app/routes.tsx`
Expected: still one match (the `entries/:entry_id` placeholder, deliberately kept).

- [ ] **Step 4: Commit**

```bash
git add web/src/app/routes.tsx
git commit -m "feat(web): mount the entry stepper on the router (CAP-11)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 6: The scripted check, and manual verification against seeded data

**Files:**
- Create: `scripts/verify-entry-stepper.sh`
- Modify: `run:161` (insert a new case right after the existing `verify-diary` case; exact
  line number may have shifted -- search for `verify-diary)` and add the sibling case
  immediately after its closing `;;`)

**Interfaces:**
- None -- this is the terminal task. Nothing else in this plan depends on it.

- [ ] **Step 1: Write the check script**

Model it on `scripts/verify-diary-home.sh`'s structure (same helpers, same section numbering
style, same "skip loudly rather than fail when there is no server or token" behaviour):

```bash
#!/usr/bin/env bash
#
# Proves the entry stepper's invariants still hold.
#
#   ./run verify-entry-stepper           from the repository root
#   ./scripts/verify-entry-stepper.sh    the same thing
#
# web/ has no test runner (CLAUDE.md), so this is where a frontend check
# lives, same as verify-diary-home.sh and verify-app-shell.sh.
#
# 1. The screen is actually mounted, and the placeholder it replaced is gone
#    from that one route (entries/:entry_id keeps its placeholder on
#    purpose -- see routes.tsx's own comment).
# 2. No second API client, no hand-written response type.
# 3. All four states, including skeletons rather than a spinner.
# 4. The security condition from the ticket's own comment: a link evidence
#    item carries rel="noopener noreferrer", and no evidence item of any
#    other kind is ever given a clickable href.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

SCREEN="web/src/screens/EntryStepper.tsx"
LOGIC="web/src/screens/entry-stepper-logic.ts"
ROUTES="web/src/app/routes.tsx"

if [ -t 1 ]; then
    blu=$'\033[1;34m'; grn=$'\033[1;32m'; red=$'\033[1;31m'; off=$'\033[0m'
else
    blu=''; grn=''; red=''; off=''
fi

pass=0; fail=0
say() { printf '\n%s==>%s %s\n' "$blu" "$off" "$1"; }
ok()  { pass=$((pass+1)); printf '  %sok%s   %-54s %s\n' "$grn" "$off" "$1" "${2:-}"; }
bad() { fail=$((fail+1)); printf '  %sFAIL%s %-54s %s\n' "$red" "$off" "$1" "${2:-}"; }

# --------------------------------------------------------------------------
say "1. The screen is mounted"

if grep -q '<EntryStepper />' "$ROUTES"; then
    ok "routes.tsx renders EntryStepper"
else
    bad "routes.tsx renders EntryStepper" "reflections/:reflection_id still a placeholder?"
fi

if grep -q 'path="reflections/:reflection_id"' "$ROUTES" && \
   ! grep -A1 'path="reflections/:reflection_id"' "$ROUTES" | grep -q 'Placeholder'; then
    ok "the CAP-11 placeholder is gone from reflections/:reflection_id"
else
    bad "the CAP-11 placeholder is gone from reflections/:reflection_id"
fi

# --------------------------------------------------------------------------
say "2. One API client, no hand-written response type"

if grep -q "from '../api/client.ts'" "$SCREEN"; then
    ok "imports the shared client"
else
    bad "imports the shared client"
fi

if grep -qE '\bfetch\(' "$SCREEN"; then
    bad "no direct fetch() in the screen" "found one -- route it through api/client.ts"
else
    ok "no direct fetch() in the screen"
fi

# --------------------------------------------------------------------------
say "3. Four states"

for state in loading error loaded; do
    if grep -q "status: '$state'" "$SCREEN"; then
        ok "state present: $state"
    else
        bad "state present: $state"
    fi
done

if grep -q 'SkeletonGroup' "$SCREEN"; then
    ok "loading uses skeletons, not a spinner"
else
    bad "loading uses skeletons, not a spinner"
fi

if grep -q 'Nothing to reflect on' "$SCREEN"; then
    ok "empty state present"
else
    bad "empty state present"
fi

# --------------------------------------------------------------------------
say "4. Evidence link security condition (ticket comment, 2026-09-19)"

if grep -q 'rel="noopener noreferrer"' "$SCREEN"; then
    ok "link evidence carries rel=noopener noreferrer"
else
    bad "link evidence carries rel=noopener noreferrer"
fi

# A second <a ...href={item.uri}...> outside the kind === 'link' branch would
# mean a file or image item got a clickable URL too, which is exactly what
# the ticket comment warns against. One href in the whole evidence render is
# correct; more than one means a second, un-gated link crept in.
href_count=$(grep -c 'href={item.uri}' "$SCREEN" || true)
if [ "$href_count" = "1" ]; then
    ok "exactly one evidence href, gated on kind === 'link'"
else
    bad "exactly one evidence href, gated on kind === 'link'" "found $href_count"
fi

if grep -q "kind === 'link'" "$SCREEN"; then
    ok "the one href is behind a kind === 'link' check"
else
    bad "the one href is behind a kind === 'link' check"
fi

# --------------------------------------------------------------------------
say "5. Pure logic stays free of React"

if grep -q "from 'react'" "$LOGIC"; then
    bad "entry-stepper-logic.ts has no React import" "found one"
else
    ok "entry-stepper-logic.ts has no React import"
fi

# --------------------------------------------------------------------------
printf '\n%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
```

```bash
chmod +x scripts/verify-entry-stepper.sh
```

- [ ] **Step 2: Wire it into `run`**

Find the existing case (search for `jira) step ./scripts/check-jira.sh ;;` or
`verify-diary)`), and add immediately after the `verify-diary` case:

```bash
    verify-entry-stepper) step ./scripts/verify-entry-stepper.sh ;;
```

Add one line to the help text block (find `${GREEN}./run verify-diary${RESET}` in the
`help|-h|--help)` case and add directly beneath it):

```bash
  ${GREEN}./run verify-entry-stepper${RESET}  the entry stepper: mounted, four states, evidence-link security
```

`run.ps1` already lacks `verify-diary`, `verify-shell`, `swap`, `check-host` and `jira` --
this plan does not attempt to close that gap; it is pre-existing drift between the two
launchers, not something CAP-11 introduces or is responsible for fixing.

- [ ] **Step 3: Run it**

Run: `./run verify-entry-stepper`
Expected: `13 passed, 0 failed` -- the script above has 13 `ok`/`bad` calls (4 in section 1,
2 in section 2, 5 in section 3, 3 in section 4, 1 in section 5). Every line must say `ok`,
none `FAIL`.

- [ ] **Step 4: Manual walkthrough against real seeded data**

Requires `php artisan db:seed` already run in `api/` (CLAUDE.md; do not re-run it if the
shared database already has demo data -- ask first, per the shared-database rule) and Jane's
seeded token in `~/reflection-diary-tokens.txt`, per this repository's usual seeded-token
workflow (`web/src/session/TokenGate.tsx`).

None of Jane's four seeded reflections is a `draft` -- `api/database/seeders/ReflectionSeeder.php`
leaves her third sprint on "Develop AI use cases" (the La Trobe rubric gig) deliberately free
for exactly this kind of manual check (the same free sprint `scripts/smoke.sh` uses). Create
one:

1. Start both servers: `./run dev`.
2. Sign in as Jane in the browser (paste her token into the Student slot).
3. In the browser devtools console (same origin, so the app's own token applies), find her
   La Trobe gig's id and its free sprint's id from `GET /gigs`, then:
   ```js
   fetch('http://localhost:8000/api/v1/reflections', {
     method: 'POST',
     headers: {
       'Content-Type': 'application/json',
       Authorization: 'Bearer ' + /* Jane's token */,
     },
     body: JSON.stringify({ sprint_id: /* the free sprint's id */ }),
   }).then((r) => r.json()).then(console.log);
   ```
4. Navigate to `/reflections/<the new id>`. Confirm:
   - The progress bar reads "Competency 1 of 6."
   - Typing in the narrative shows "Saving…" then "Saved."
   - Tapping a level chip highlights it and persists across a page reload.
   - Adding a link shows it with a working `target="_blank"` open; adding a file (any small
     PDF/PNG within the framework's `max_file_bytes`) shows it as plain, non-clickable text.
   - Clicking Submit with at least one competency left blank jumps to and highlights it,
     with a message naming what is missing.
   - Once every competency has a narrative and a self-score, Submit succeeds and the browser
     navigates to `/reflections/<id>/submitted` (the CAP-12 placeholder -- expected, that
     ticket is not built yet).
5. Then check a reflection that is already not a draft: Jane's SFIA sprint 2
   (`status: submitted`) or either of her `assessed` La Trobe sprints, reached from her diary
   home. Confirm every field renders read-only, no Back-then-Submit control exists past the
   last step, and (for the `assessed` ones) the counter-score and comment from Sam or Dr Lee
   are visible.

- [ ] **Step 5: Full project check**

Run: `./run check`
Expected: every section passes, ending in `All checks passed.` -- this is the same command
CI runs, so a green result here is a green PR.

- [ ] **Step 6: Commit**

```bash
git add scripts/verify-entry-stepper.sh run
git commit -m "test(web): scripted check for the entry stepper (CAP-11)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Self-review

**Spec coverage** (COA4-69's eight criteria):

1. Competency name/levels from the payload, nothing hardcoded -- Task 1 (`levels_for`) +
   Task 3 (`entry.competency_name` rendered directly, never a literal).
2. Debounced autosave with saved/saving/failed -- Task 3, via the existing `TextArea`.
3. Evidence attach/remove respecting the framework's policy -- Task 3 (`EvidenceList`),
   `accepted_types_hint`/`format_bytes` from Task 1.
4. Self-score via `PUT`, upsert -- Task 3 (`choose_level`).
5. "Competency N of M," Back/Next, Submit on the last -- Task 2 (shell + `ProgressBar`) and
   Task 4 (Submit swapped in on the last step).
6. Submit failures map to the first offending entry -- Task 4
   (`first_offending_index`/`is_offending`, both from Task 1).
7. `draft` is the only editable state -- `read_only` threaded through `EntryCard` from
   Task 2 onward, exercised read-only in Task 4's manual check.
8. All four states -- Task 2 (loading/error/loaded/empty), verified in Task 6's script.

Tony's security comment (carried as a Global Constraint, not deferred): Task 3 gates the only
`href` behind `kind === 'link'` with `rel="noopener noreferrer"`; Task 6's script asserts
both the attribute and that there is exactly one such `href` in the file, so a later change
that quietly adds a second, un-gated link fails the check rather than shipping.

**Placeholder scan:** none of the code blocks above contain TBD/TODO-style placeholders;
every step's code is what would actually be written. The one intentional stub is Task 2's
`.todo` paragraph, which is real, working, visible text that Task 3 explicitly replaces --
not a gap left unfilled.

**Type consistency:** `EntryCard`'s signature is introduced once in Task 3
(`{ entry, framework, read_only, on_change }`) and extended once in Task 4 (adding
`offending?: boolean`), not redefined differently in each place. `update_entry`,
`ReflectionEntry`, `FrameworkDetail` and the six functions from `entry-stepper-logic.ts` are
named identically everywhere they are used across Tasks 2 through 4.
