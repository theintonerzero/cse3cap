# CAP-6 RadarPanel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps
> use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `web/src/` a `RadarPanel` component -- a recharts `RadarChart` wrapped so it
takes axes and scale entirely from props, is never hardcoded to six axes or a four-point
scale, draws self and counter-score as two series distinguishable in both themes without
relying on colour alone, owns all four of its states (loading, error, empty, and "not
enough scores yet" -- which is not the same as empty), and is verified against both seeded
frameworks' real shapes in the existing component gallery.

**Architecture:** `RadarPanel` is a discriminated union on a `state` prop --
`loading | error | empty | loaded`. Loading/error/empty are supplied by whatever screen
calls it (that screen owns the actual `GET /me/radar` fetch, through `api.ts`, same as
every other API call in this app). `loaded` carries real `scale` and `axes` data, and
`RadarPanel` itself decides internally whether that means a fully-drawable chart or "not
enough scores yet" -- an entire series (every `self` or every `counter` value across all
axes) being `null` means there is nothing to draw for that series, so the component treats
it as insufficient rather than rendering two overlapping near-empty shapes. This keeps the
one tricky judgement call in one place instead of every future screen re-deriving it.
Fetching stays outside the component; interpreting what the data means stays inside it.

There is no router yet (CAP-5), so this ticket does not build a screen. It gets verified
the same way CAP-3 verified Card/Button/Chip/Badge/Skeleton/ErrorNotice: a `<Section>` in
the existing `web/src/gallery/Gallery.tsx`, with fixture data for every state, checked at a
phone width and a desktop width, in both themes.

**Scope boundary, deliberately:** CAP-7 (Diary home screen, blocked by this ticket) adds a
caption that changes with scope ("all gigs" vs one sprint) and a richer empty state with a
call to action ("write your first reflection"). Neither belongs here. `RadarPanel`'s own
empty/insufficient states are minimal and generic; CAP-7 wraps it with screen-specific
copy, not the other way around.

**Tech Stack:** React 19, TypeScript 6.x (pinned, ADR #18), Vite 8, recharts **v3.x**
(not yet a dependency -- v3 is the major that supports React 19; v2's peer deps do not,
which is the same class of problem the TypeScript-6 pin in CAP-1/CAP-2 already worked
around). CSS Modules + `tokens.css` custom properties only, per ADR #28 -- no raw hex,
`scripts/check-tokens.sh` (CAP-1) fails the build on one.

**Spec:** Jira COA4-65 (CAP-6, "RadarPanel: axes and scale from props, never hardcoded"),
epic COA4-54. Screenshot captured the acceptance criteria verbatim; no separate written
spec file for this ticket. Confirmed against `docs/openapi.yaml`'s `GET /me/radar` and
`db/01-schema.sql`'s `v_framework_scale` (see Task 2's header comment for the reasoning
this unlocks) rather than assumed from the ticket text alone.

## Global Constraints

- Axes count and scale are **never** hardcoded. No literal `6`, no literal `4` anywhere
  that means "number of competencies" or "the top of the scale" -- both always come from
  props (CAP-6 acceptance criteria, verbatim).
- Self and counter series must be distinguishable in both themes and **not by colour
  alone** (acceptance criteria, verbatim). This plan uses a second differentiator (dashed
  vs solid stroke) on top of colour, not instead of it -- belt and braces, since colour
  still helps most viewers even when it is not the only signal.
- No raw hex, no magic pixel value anywhere in `web/src/` outside `tokens.css` (CAP-1,
  enforced by `scripts/check-tokens.sh`, which now also scans this new component).
- snake_case prop and function names, matching every sibling component
  (`on_retry`, `full_width`, `on_click` -- see `ErrorNotice.tsx`, `Button.tsx`). CLAUDE.md's
  snake_case rule is written for API/DB field parity; this repo's own components already
  extend it to all prop/function names, and this plan follows that established practice
  rather than CLAUDE.md's letter.
- TypeScript stays pinned to 6.x -- do not bump toward 7 (ADR #18).
- `web/` has no test runner yet (CLAUDE.md). Verification is the gallery ritual CAP-3
  already established: load `gallery.html` at 390px and 1280px, in both themes, and look.
- **The self/counter colour choice is not invented.** The Student View - Home Page Figma
  export (already sampled for CAP-1's tokens) shows "Your average" in the primary purple
  and "Assessor average" in green, in the existing product design. `--color-primary` for
  self and `--color-success` for counter matches that precedent and reuses two colours
  already sourced from Figma and already AA-verified (CAP-1) -- no new token needed.

## Task 1: Install recharts v3

**Files:**
- Modify: `web/package.json`, `web/package-lock.json`

**Interfaces:**
- Consumes: nothing.
- Produces: `recharts` importable from `web/src/`.

- [ ] **Step 1: Install**

Run from `web/`:

```bash
npm install recharts@^3
```

- [ ] **Step 2: Confirm no peer-dependency conflict with React 19**

Run: `npm ls recharts react`
Expected: no `UNMET PEER DEPENDENCY` warnings. If npm silently used
`--legacy-peer-deps` behaviour or warns, stop and report back rather than proceeding --
that would mean v3's React 19 support is not what ADR #26 assumed, and is worth a second
opinion before building anything on top of it.

- [ ] **Step 3: Verify the build still passes**

Run: `npm run build`
Expected: builds clean. recharts is large (ADR #26 already accepts this -- "the largest
dependency in the frontend by a wide margin") so a bigger `dist/` output is expected and
not itself a problem.

- [ ] **Step 4: Commit**

```bash
git add web/package.json web/package-lock.json
git commit -m "chore(web): add recharts v3 for the radar (CAP-6)"
```

---

## Task 2: `RadarPanel` component -- the loaded state

**Files:**
- Create: `web/src/components/RadarPanel/RadarPanel.tsx`
- Create: `web/src/components/RadarPanel/RadarPanel.module.css`
- Modify: `web/src/components/index.ts`

**Interfaces:**
- Consumes: `recharts` (Task 1). Reads colour/spacing/font tokens from `tokens.css` by
  `var(--name)` reference only -- never a literal hex or px value, per the global
  constraint above.
- Produces: `RadarPanel`, `RadarPanelProps`, `RadarAxis`, `RadarScale`, exported from
  `components/index.ts` alongside every other core component.

- [ ] **Step 1: Write the types and the loaded-state branching**

```tsx
/**
 * The product's headline visual: self-score vs counter-score per
 * competency, as a recharts radar. Axes and scale are read entirely from
 * props -- never hardcoded to six axes or a four-point scale, because
 * La Trobe's six-competency rubric and SFIA 9 do not share either
 * number. See db/01-schema.sql's v_framework_scale: the scale is one
 * shared min/max across the whole framework, not per competency, so
 * there is exactly one PolarRadiusAxis domain to set here, not one per
 * axis, even though SFIA's own per-skill ranges are uneven underneath.
 *
 * Ownership split: whatever screen renders this owns the actual
 * GET /me/radar fetch (through api.ts, like every other call in this
 * app) and passes loading/error/empty in directly. What counts as
 * "loaded but not enough to draw" is decided in here, once, rather than
 * by every future screen that embeds this component -- an entire
 * series (every self value, or every counter value, null across all
 * axes) means there is nothing to plot for that series, so it renders
 * as insufficient rather than two overlapping near-empty shapes.
 */
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Legend,
  ResponsiveContainer,
} from 'recharts';

import { ApiError } from '../../api/client.ts';
import { ErrorNotice } from '../ErrorNotice/ErrorNotice.tsx';
import { Skeleton } from '../Skeleton/Skeleton.tsx';
import styles from './RadarPanel.module.css';

export interface RadarAxis {
  code: string;
  short_label: string | null;
  position: number;
  self: number | null;
  counter: number | null;
}

export interface RadarScale {
  min: number;
  max: number;
}

export type RadarPanelProps =
  | { state: 'loading' }
  | { state: 'error'; error: ApiError; on_retry?: () => void }
  | { state: 'empty' }
  | { state: 'loaded'; scale: RadarScale; axes: RadarAxis[] };

function is_insufficient(axes: RadarAxis[]): boolean {
  if (axes.length === 0) return true;
  const self_has_data = axes.some((a) => a.self !== null);
  const counter_has_data = axes.some((a) => a.counter !== null);
  return !self_has_data || !counter_has_data;
}

export function RadarPanel(props: RadarPanelProps) {
  if (props.state === 'loading') return <LoadingRadar />;
  if (props.state === 'error') {
    return <ErrorNotice error={props.error} on_retry={props.on_retry} />;
  }
  if (props.state === 'empty') return <EmptyRadar />;
  if (is_insufficient(props.axes)) return <InsufficientRadar />;
  return <LoadedRadar scale={props.scale} axes={props.axes} />;
}
```

- [ ] **Step 2: Write `LoadedRadar`, the actual chart**

Append to the same file:

```tsx
function LoadedRadar({ scale, axes }: { scale: RadarScale; axes: RadarAxis[] }) {
  const sorted = [...axes].sort((a, b) => a.position - b.position);
  const data = sorted.map((a) => ({
    label: a.short_label ?? a.code,
    self: a.self,
    counter: a.counter,
  }));

  return (
    <div className={styles.panel}>
      <ResponsiveContainer width="100%" height={320}>
        <RadarChart data={data} outerRadius="70%">
          <PolarGrid stroke="var(--color-border)" />
          <PolarAngleAxis
            dataKey="label"
            tick={{ fill: 'var(--color-text)', fontSize: 12 }}
          />
          <PolarRadiusAxis
            domain={[scale.min, scale.max]}
            tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }}
          />
          <Radar
            name="Self"
            dataKey="self"
            stroke="var(--color-primary)"
            fill="var(--color-primary)"
            fillOpacity={0.25}
            dot={{ r: 4, fill: 'var(--color-primary)', stroke: 'var(--color-primary)' }}
            connectNulls
          />
          <Radar
            name="Counter-score"
            dataKey="counter"
            stroke="var(--color-success)"
            strokeDasharray="6 4"
            fill="var(--color-success)"
            fillOpacity={0.15}
            dot={{
              r: 4,
              fill: 'var(--color-bg)',
              stroke: 'var(--color-success)',
              strokeWidth: 2,
            }}
            connectNulls
          />
          <Legend />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
```

**Flag before moving on:** `var(--name)` as a literal string passed to recharts' `stroke`/
`fill` props needs an eyeball check, not an assumption -- confirm in Task 4's gallery pass
that toggling the theme actually recolours the chart. If it does not (some SVG
presentation-attribute paths in some browsers do not resolve CSS custom properties the way
an inline `style` object does), the fix is wrapping the affected props in a `style={{...}}`
object instead of a bare string, not reaching for a raw hex value -- that would fail
`check-tokens.sh` and defeat the point.

- [ ] **Step 3: Write the three non-loaded renderers**

Append:

```tsx
function LoadingRadar() {
  return (
    <div className={styles.panel} aria-busy="true">
      <Skeleton variant="circle" />
    </div>
  );
}

function EmptyRadar() {
  return (
    <div className={styles.placeholder}>
      <p>No scores yet.</p>
    </div>
  );
}

function InsufficientRadar() {
  return (
    <div className={styles.placeholder}>
      <p>Not enough scores yet to draw a comparison.</p>
    </div>
  );
}
```

Check `Skeleton`'s actual prop shape in `web/src/components/Skeleton/Skeleton.tsx` before
this step -- if `variant="circle"` does not size the way a chart-shaped placeholder needs,
wrap it in a fixed-height div in `RadarPanel.module.css` instead of guessing at Skeleton
props it may not have.

- [ ] **Step 4: Write `RadarPanel.module.css`**

Chrome only -- panel sizing, the placeholder text's spacing -- every value a `var(--name)`
reference. `.panel` needs a fixed or min height so loading/loaded/empty/insufficient do not
visibly jump size against each other; base it on the `320` used for `ResponsiveContainer`
height above, expressed as `var(--space-*)` composition or a plain px value that matches
(a chart's pixel height is not really a design-token spacing decision, so a literal here is
defensible -- but confirm this reasoning holds before shipping it, since `check-tokens.sh`
will reject a bare px value regardless of the justification).

- [ ] **Step 5: Export from `components/index.ts`**

```ts
export { RadarPanel } from './RadarPanel/RadarPanel.tsx';
export type { RadarPanelProps, RadarAxis, RadarScale } from './RadarPanel/RadarPanel.tsx';
```

- [ ] **Step 6: Verify it builds**

Run: `npm run lint && npm run build`
Expected: both clean.

- [ ] **Step 7: Commit**

```bash
git add web/src/components/RadarPanel web/src/components/index.ts
git commit -m "feat(web): RadarPanel component, all four states (CAP-6)"
```

---

## Task 3: Gallery fixtures -- both seeded frameworks, every state

**Files:**
- Modify: `web/src/gallery/Gallery.tsx`

**Interfaces:**
- Consumes: `RadarPanel` (Task 2).
- Produces: a `<Section title="RadarPanel">` alongside the existing ones, with fixture
  data for every state.

- [ ] **Step 1: Write the two real fixture datasets**

Sourced from `db/01-schema.sql`'s actual seeded rows, not invented:

```tsx
const latrobe_axes: RadarAxis[] = [
  { code: 'contribution', short_label: 'Contrib.', position: 1, self: 3, counter: 2 },
  { code: 'communication', short_label: 'Comms', position: 2, self: 4, counter: 3 },
  { code: 'collaboration', short_label: 'Collab.', position: 3, self: 3, counter: 3 },
  { code: 'agile', short_label: 'Agile', position: 4, self: 2, counter: 2 },
  { code: 'continuous', short_label: 'Cont. imp.', position: 5, self: 3, counter: 4 },
  { code: 'leadership', short_label: 'Leadership', position: 6, self: 2, counter: 1 },
];

// Real seed currently spans all 6 SFIA competencies 1-7 uniformly (see
// db/01-schema.sql's comment: per-skill narrowing is not in yet). The
// point of this fixture is proving axis count and scale both come from
// props -- six axes at 1-4 above, six DIFFERENT axes at 1-7 here -- not
// simulating unevenness the real seed does not have yet.
const sfia_axes: RadarAxis[] = [
  { code: 'PROG', short_label: 'PROG', position: 1, self: 5, counter: 4 },
  { code: 'DESN', short_label: 'DESN', position: 2, self: 4, counter: 5 },
  { code: 'TEST', short_label: 'TEST', position: 3, self: 6, counter: 5 },
  { code: 'DATM', short_label: 'DATM', position: 4, self: 3, counter: 3 },
  { code: 'RLMT', short_label: 'RLMT', position: 5, self: 5, counter: 6 },
  { code: 'METL', short_label: 'METL', position: 6, self: 4, counter: 4 },
];

const insufficient_axes: RadarAxis[] = latrobe_axes.map((a) => ({ ...a, counter: null }));
```

- [ ] **Step 2: Add the Section**

```tsx
<Section title="RadarPanel">
  <div className={styles.stack}>
    <RadarPanel state="loading" />
    <RadarPanel
      state="error"
      error={new ApiError(500, null, 'The API answered outside the error envelope.')}
    />
    <RadarPanel state="empty" />
    <RadarPanel state="loaded" scale={{ min: 1, max: 4 }} axes={insufficient_axes} />
    <RadarPanel state="loaded" scale={{ min: 1, max: 4 }} axes={latrobe_axes} />
    <RadarPanel state="loaded" scale={{ min: 1, max: 7 }} axes={sfia_axes} />
  </div>
</Section>
```

Import `RadarPanel` and its types from `../components/index.ts` alongside the existing
imports at the top of the file.

- [ ] **Step 3: Verify it builds**

Run: `npm run lint && npm run build`

- [ ] **Step 4: Look at it -- the actual verification**

Run: `npm run dev`, open `http://localhost:5173/gallery.html`.

Check, per CAP-3's established ritual:
- At 390px and at 1280px.
- In both themes (the gallery's own toggle).
- The La Trobe and SFIA panels genuinely show a different axis count and different scale
  labels -- this is the one thing the whole ticket is actually about.
- Self and counter are tellable apart with the page in grayscale (a quick way to fake
  colour-blindness without a real simulator: browser DevTools has a vision-deficiency
  emulator under Rendering).
- Toggling the theme actually recolours the chart (see Task 2 Step 2's flag).
- Loading/empty/insufficient read as three distinct, understandable states, not
  interchangeable blank boxes.

- [ ] **Step 5: Commit**

```bash
git add web/src/gallery/Gallery.tsx
git commit -m "feat(web): RadarPanel gallery fixtures for both frameworks (CAP-6)"
```

---

## Task 4: Close out

- [ ] **Step 1: Full check pass**

Run: `./run check` (or `./run.ps1 check`). Note from CAP-1: this may not complete
end-to-end on a Windows machine missing `python3`/hitting the bash-resolution gap
(pre-existing, documented, not this ticket's problem) -- if so, verify the frontend
pieces directly: `npm run lint`, `npm run build`, `scripts/check-tokens.sh` (now also
scanning `RadarPanel.tsx`), `node scripts/check-contrast.mjs`.

- [ ] **Step 2: Open the PR**

Push the branch, open a PR into `dev` titled `feat(web): RadarPanel component (CAP-6)`,
request review. Do not merge it yourself -- CONTRIBUTING.md requires one approval from
someone else.
