# CAP-3 Core Components, Part One — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Card, Button, Chip, Badge, Skeleton and ErrorNotice in `web/src/components/`, plus a gallery page that renders every one of them in every state.

**Architecture:** Each component is a folder — `components/<Name>/<Name>.tsx` beside a colocated `<Name>.module.css` — re-exported from `components/index.ts`. That pattern is set by PR #16 (CAP-4) and this plan follows it rather than inventing a second one. The gallery is a **second Vite entry point** (`web/gallery.html`), not a route: there is no router until CAP-5, and a second HTML file cannot collide with the app shell when it arrives.

**Tech Stack:** React 19, TypeScript 6 (pinned, see ADR #36), Vite 8, CSS Modules. No new dependencies.

**Spec:** `docs/jira/cap-sprint-3.csv`, the CAP-3 row. The visual decisions are recorded in "Design decisions" below, since the appearance was sourced from an earlier prototype rather than designed here.

## Global Constraints

- **Props are snake_case** — `on_click`, `full_width`, `on_retry`. Matches CAP-3's acceptance criteria, `CLAUDE.md` and `web/README.md`. PR #16 shipped camelCase and is the outlier; see "Follow-ups".
- **No raw hex, no `px` anywhere under `web/src/`.** `scripts/check-tokens.sh` greps for `#[0-9A-Fa-f]{3,8}` and `[0-9]+px` in every `.css`/`.ts`/`.tsx` outside `tokens.css` and fails the build. Use `rem`, `em`, `%`, `ch` or a token. **This plan must finish with zero documented exceptions.**
- **Do not edit `web/src/tokens.css`.** CAP-1 is merged and the styling is settled. Every value below already exists in it.
- **Do not touch `api/`.** Frontend only. The one non-`web/` file is `scripts/check-contrast.mjs`, which reads `web/src/tokens.css` and is where frontend colour is verified.
- **A tinted background takes a `--color-text` foreground.** `--color-danger` and `--color-success` are for icons, bars and large-size titles only — as text on their own tinted background they measure 3.97:1 and 4.32:1 in light mode, below the 4.5:1 AA needs. Measured 2026-08-26 with the maths in `scripts/check-contrast.mjs`.
- **Interactive components clear a 44px tap target**, written `2.75rem`. Carried from the prototype's `--tap`, which states it as a hard rule: nothing may require a pointer.
- **Focus ring:** `outline: 0.125rem solid var(--color-focus-ring); outline-offset: 0.0625rem;` on `:focus-visible`. Nothing in the repo has a focus style yet, so this is the precedent — `--color-focus-ring` is defined in CAP-1 and unused until now.
- **`components/index.ts` is an add/add conflict with PR #16.** Keep it to one `export` + `export type` pair per component, in the order the components were built, so whoever merges second resolves by concatenating the two blocks. No logic to reconcile.
- Prettier: `singleQuote: true`, `printWidth: 92`. Run `npm run format` before committing.

## Design decisions

The appearance is not invented. `/home/paddy/projects/alumable-diary` is an earlier Blade prototype of this same product whose stylesheet was hand-matched to the Figma frames, and CAP-1's tokens were sampled from those same frames — three accent tints are byte-identical (`#ffe8d6`, `#efebfa`, `#e9f4ee`). So the mapping below is a rename, not a redesign.

| Decision | Where it comes from |
| --- | --- |
| Badge: draft grey, submitted amber, assessed green | The prototype's `.pill-not-open`, `.pill-awaiting-assessor`, `.pill-scored` |
| Badge uses semantic tokens, never the `--color-accent-*` tints | The prototype is explicit that the tints are decorative and "must never reach a screen that shows a score" |
| Button is full-width by default | The prototype's `.btn { width: 100% }` — full width is the default, not an opt-in |
| Two button variants only, primary and secondary | The prototype has exactly these two; build only what the screens need |
| Chip: surface-alt fill unselected, primary fill selected | The prototype's `.chip` / `.chip-on`, with its hairline border replaced by a fill so CAP-3 needs no border token from PR #16 |
| Focus ring is the primary colour | The prototype's `.field:focus` reached the same conclusion CAP-1 did |
| ErrorNotice follows the `.banner` pattern | The prototype's amber banner |
| Skeleton is new work | The prototype is server-rendered and has no loading state at all. There is no prior art, which is why its API gets the most care here |

One naming wart, worth a comment in the CSS: CAP-1 calls the amber pair `--color-danger*`; the prototype calls the same colour `--warn` / "needs attention". A **submitted** badge styled with a token named `danger` looks like a mistake in review. It is not.

## File structure

**Create**

| File | Responsibility |
| --- | --- |
| `web/gallery.html` | Second Vite entry point |
| `web/src/gallery.tsx` | Mounts `<Gallery />`, same shape as `main.tsx` |
| `web/src/gallery/Gallery.tsx` | The page: theme toggle, one `<Section>` per component |
| `web/src/gallery/Gallery.module.css` | Gallery chrome only — never product styling |
| `web/src/components/Badge/Badge.tsx` + `.module.css` | Reflection status, non-interactive |
| `web/src/components/Card/Card.tsx` + `.module.css` | Surface container, optional decorative accent |
| `web/src/components/Chip/Chip.tsx` + `.module.css` | Toggle filter, selected/unselected |
| `web/src/components/Button/Button.tsx` + `.module.css` | Primary/secondary action |
| `web/src/components/Skeleton/Skeleton.tsx` + `.module.css` | `Skeleton` + `SkeletonGroup` loading primitives |
| `web/src/components/ErrorNotice/ErrorNotice.tsx` + `.module.css` | Renders an `ApiError`, optional retry |
| `web/src/components/index.ts` | Barrel |

**Modify**

| File | Change |
| --- | --- |
| `web/vite.config.ts` | Two rollup inputs so `npm run build` covers the gallery |
| `scripts/check-contrast.mjs` | Four rows added to `PAIRS`, in the task that introduces each |
| `web/README.md` | A Components section pointing at the gallery |

## How to verify, given `web/` has no test runner

`web/` has no unit test runner and adding one is an ADR, not a passing change (`CLAUDE.md`). So the red-green loop cannot run here, and the checks below stand in for it. **Do not run `./run check`** — it runs Pint and PHPUnit, and this ticket does not touch `api/`. Run the frontend subset:

```bash
cd web && npm run build          # tsc -b, then vite build. The type check.
cd web && npm run lint           # oxlint
cd web && npx prettier --check .
scripts/check-tokens.sh          # from the repo root. Must print the clean line.
node scripts/check-contrast.mjs  # from the repo root
```

And look at it, which is the point of the gallery:

```bash
cd web && npm run dev            # http://localhost:5173/gallery.html
```

Every task ends by loading that page at a phone width (390) and a desktop width (1280), in both themes, via the toggle in the gallery header.

---

### Task 1: The gallery harness

Nothing else in this plan can be looked at until this exists, so it comes first. Deliberately built empty: each later task adds its own section.

**Files:**
- Create: `web/gallery.html`, `web/src/gallery.tsx`, `web/src/gallery/Gallery.tsx`, `web/src/gallery/Gallery.module.css`
- Modify: `web/vite.config.ts`

**Interfaces:**
- Consumes: `getStoredTheme`, `setTheme`, `Theme` from `web/src/theme.ts` (already merged in CAP-1)
- Produces: `Section({ title, children })`, imported by every later task to add its own block

- [ ] **Step 1: Create `web/gallery.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Core components</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/gallery.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: Create `web/src/gallery.tsx`**

```tsx
/**
 * Entry point for the component gallery, mirroring main.tsx.
 *
 * A second Vite entry rather than a route: there is no router until CAP-5,
 * and a second .html file cannot collide with the app shell when it lands.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import Gallery from './gallery/Gallery.tsx';
import './index.css';
import { initTheme } from './theme.ts';

initTheme();

const root = document.getElementById('root');

if (!root) {
  throw new Error('gallery.html is missing #root');
}

createRoot(root).render(
  <StrictMode>
    <Gallery />
  </StrictMode>,
);
```

- [ ] **Step 3: Create `web/src/gallery/Gallery.module.css`**

```css
/*
 * The gallery's own chrome. Nothing here is a product style: a component
 * that needs a rule to look right needs it in its own module, not here.
 */

.page {
  max-width: 60rem;
  margin: 0 auto;
  padding: var(--space-24) var(--space-20) var(--space-64);
  display: flex;
  flex-direction: column;
  gap: var(--space-32);
}

.header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-16);
}

.title {
  margin: 0;
  font-size: var(--font-size-2xl);
}

.toggle {
  min-height: 2.75rem;
  padding: var(--space-8) var(--space-16);
  border: none;
  border-radius: var(--radius-md);
  background: var(--color-surface-alt);
  color: var(--color-text);
  font: inherit;
  font-weight: var(--font-weight-medium);
  cursor: pointer;
}

.toggle:focus-visible {
  outline: 0.125rem solid var(--color-focus-ring);
  outline-offset: 0.0625rem;
}

.section {
  display: flex;
  flex-direction: column;
  gap: var(--space-12);
}

.heading {
  margin: 0;
  font-size: var(--font-size-xl);
}

.row {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: var(--space-16);
}

/* A column for components that are full width by default, so they do not
   fight the flex row. */
.column {
  display: flex;
  flex-direction: column;
  gap: var(--space-16);
  max-width: 24rem;
  width: 100%;
}
```

- [ ] **Step 4: Create `web/src/gallery/Gallery.tsx`**

```tsx
/**
 * The scratch route CAP-3 asks for: every core component, in every state,
 * on one page, so a reviewer sees them at once instead of reading CSS.
 *
 * Open it with `npm run dev` at http://localhost:5173/gallery.html. It is
 * built rather than excluded, so a component that stops compiling fails CI,
 * but nothing in the product links to it.
 */
import { useState, type ReactNode } from 'react';

import { getStoredTheme, setTheme, type Theme } from '../theme.ts';
import styles from './Gallery.module.css';

function initial_theme(): Theme {
  const stored = getStoredTheme();
  if (stored) return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={styles.section}>
      <h2 className={styles.heading}>{title}</h2>
      <div className={styles.row}>{children}</div>
    </section>
  );
}

export default function Gallery() {
  const [theme, set_theme_state] = useState<Theme>(initial_theme);

  function toggle_theme() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    set_theme_state(next);
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Core components</h1>
        <button
          className={styles.toggle}
          onClick={toggle_theme}
          aria-pressed={theme === 'dark'}
        >
          {theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
        </button>
      </header>
    </main>
  );
}
```

- [ ] **Step 5: Modify `web/vite.config.ts` for two entry points**

Replace the whole file. `import.meta.url` rather than `__dirname`, which does not exist in an ES module.

```ts
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const entry = (file: string) => fileURLToPath(new URL(file, import.meta.url));

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // Two pages: the app, and the CAP-3 component gallery. Without this the
    // production build silently drops gallery.html and a broken component
    // stops being a build failure.
    rollupOptions: {
      input: {
        main: entry('index.html'),
        gallery: entry('gallery.html'),
      },
    },
  },
});
```

- [ ] **Step 6: Verify it builds and renders**

```bash
cd web && npm run build && npm run lint && npx prettier --check .
```
Expected: build succeeds and `dist/gallery.html` exists.

```bash
cd web && npm run dev
```
Open `http://localhost:5173/gallery.html`. Expected: the heading "Core components" and a working theme toggle. Check both themes.

- [ ] **Step 7: Commit**

```bash
git add web/gallery.html web/src/gallery.tsx web/src/gallery/ web/vite.config.ts
git commit -m "$(cat <<'MSG'
feat(web): component gallery as a second Vite entry point (CAP-3)

CAP-3 asks for a scratch route showing every component in every state, but
there is no router until CAP-5. A second .html entry gives the same thing
without touching App.tsx, so it cannot collide with the shell when it lands.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01BBYMKL61UqyqqaRKf6fsUb
MSG
)"
```

---

### Task 2: Badge

First component, so it sets the file pattern, creates the barrel, and adds the first contrast rows.

**Files:**
- Create: `web/src/components/Badge/Badge.tsx`, `web/src/components/Badge/Badge.module.css`, `web/src/components/index.ts`
- Modify: `web/src/gallery/Gallery.tsx`, `scripts/check-contrast.mjs`

**Interfaces:**
- Consumes: `components['schemas']['ReflectionStatus']` from `../../api/schema.ts`. `Section` is defined in `Gallery.tsx` itself — no import to add.
- Produces: `Badge({ status })`, `BadgeProps`, `BadgeStatus`

- [ ] **Step 1: Create `web/src/components/Badge/Badge.module.css`**

Note the comment on `.submitted`. It stops the next reader thinking it is a bug.

```css
.badge {
  display: inline-block;
  padding: var(--space-4) var(--space-12);
  border-radius: var(--radius-full);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
  white-space: nowrap;
  /* Every status is a tinted fill with a --color-text label. The obvious
     alternative -- --color-success on --color-success-bg -- measures 4.32:1
     in light mode, under the 4.5:1 AA needs. CAP-1 has no darker "ink"
     variant to reach for, so the label stays neutral and the fill carries
     the meaning. */
  color: var(--color-text);
}

.draft {
  background: var(--color-surface-alt);
}

/* Amber, not red. CAP-1 named this pair --color-danger*; the design it was
   sampled from calls the same colour "needs attention", which is what a
   reflection waiting on an assessor is. Not a mistake. */
.submitted {
  background: var(--color-danger-bg);
}

.assessed {
  background: var(--color-success-bg);
}
```

- [ ] **Step 2: Create `web/src/components/Badge/Badge.tsx`**

The status type is imported from the generated schema, never re-declared. If the contract's enum changes, this stops compiling — which is the point.

```tsx
import type { components } from '../../api/schema.ts';
import styles from './Badge.module.css';

/** The contract's ReflectionStatus, generated. Never hand-write this union. */
export type BadgeStatus = components['schemas']['ReflectionStatus'];

export interface BadgeProps {
  status: BadgeStatus;
}

const LABEL: Record<BadgeStatus, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  assessed: 'Assessed',
};

export function Badge({ status }: BadgeProps) {
  return <span className={`${styles.badge} ${styles[status]}`}>{LABEL[status]}</span>;
}
```

- [ ] **Step 3: Create `web/src/components/index.ts`**

One pair per component. PR #16 creates this same file with its own three pairs; whoever merges second concatenates the two blocks.

```ts
export { Badge } from './Badge/Badge.tsx';
export type { BadgeProps, BadgeStatus } from './Badge/Badge.tsx';
```

- [ ] **Step 4: Add the three contrast rows to `scripts/check-contrast.mjs`**

Insert into the `PAIRS` array, after the `--color-text-inverse` row:

```js
  // CAP-3 Badge: every status is a tinted fill with a --color-text label.
  ['--color-text', '--color-surface-alt', 'normal'],
  ['--color-text', '--color-danger-bg', 'normal'],
  ['--color-text', '--color-success-bg', 'normal'],
```

- [ ] **Step 5: Add the Badge section to `web/src/gallery/Gallery.tsx`**

Add the import beneath the existing ones:

```tsx
import { Badge } from '../components/index.ts';
```

And the section inside `<main>`, after `</header>`:

```tsx
      <Section title="Badge">
        <Badge status="draft" />
        <Badge status="submitted" />
        <Badge status="assessed" />
      </Section>
```

- [ ] **Step 6: Verify**

```bash
cd web && npm run build && npm run lint && npx prettier --check .
cd /home/paddy/cse3cap && scripts/check-tokens.sh && node scripts/check-contrast.mjs
```
Expected: `No raw hex or magic pixel values outside tokens.css.` and every contrast row passing, including the three new ones (they measure 14.43, 13.39 and 14.46 in light).

Then load `http://localhost:5173/gallery.html` and confirm three pills, in both themes, at 390 and 1280 wide.

- [ ] **Step 7: Commit**

```bash
git add web/src/components/ web/src/gallery/Gallery.tsx scripts/check-contrast.mjs
git commit -m "$(cat <<'MSG'
feat(web): Badge for the three reflection statuses (CAP-3)

Status type is imported from the generated schema rather than re-declared,
so a contract change breaks the build instead of drifting.

Every status is a tinted fill with a --color-text label: the obvious
--color-success on --color-success-bg measures 4.32:1 in light mode, under
AA. The three pairs are now checked by scripts/check-contrast.mjs.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01BBYMKL61UqyqqaRKf6fsUb
MSG
)"
```

---

### Task 3: Card

**Files:**
- Create: `web/src/components/Card/Card.tsx`, `web/src/components/Card/Card.module.css`
- Modify: `web/src/components/index.ts`, `web/src/gallery/Gallery.tsx`, `scripts/check-contrast.mjs`

**Interfaces:**
- Consumes: nothing from earlier tasks. `Section` is defined in `Gallery.tsx` itself — no import to add.
- Produces: `Card({ children, accent })`, `CardProps`, `CardAccent`

- [ ] **Step 1: Create `web/src/components/Card/Card.module.css`**

No `box-shadow`: the design it came from has one, CAP-1 has no shadow token, and CAP-1 is not being reopened. White on `--color-bg` still reads as a raised surface.

```css
.card {
  background: var(--color-surface);
  color: var(--color-text);
  border-radius: var(--radius-lg);
  padding: var(--space-20);
}

/* Decorative tints only. A card being mint says nothing about an assessor
   and a card being apricot is not a warning -- status is the Badge's job. */
.peach {
  background: var(--color-accent-peach);
}

.mint {
  background: var(--color-accent-mint);
}

.cream {
  background: var(--color-accent-cream);
}

.coral {
  background: var(--color-accent-coral);
}

.pink {
  background: var(--color-accent-pink);
}

.lavender {
  background: var(--color-accent-lavender);
}

.evidence {
  background: var(--color-accent-evidence);
}
```

- [ ] **Step 2: Create `web/src/components/Card/Card.tsx`**

```tsx
import type { ReactNode } from 'react';
import styles from './Card.module.css';

/**
 * One of CAP-1's decorative --color-accent-* tints.
 *
 * Decorative is the operative word: never encode status in an accent. A
 * reflection's state is a Badge, which uses semantic tokens.
 */
export type CardAccent =
  | 'peach'
  | 'mint'
  | 'cream'
  | 'coral'
  | 'pink'
  | 'lavender'
  | 'evidence';

export interface CardProps {
  children: ReactNode;
  accent?: CardAccent;
}

export function Card({ children, accent }: CardProps) {
  const class_name = accent ? `${styles.card} ${styles[accent]}` : styles.card;
  return <div className={class_name}>{children}</div>;
}
```

- [ ] **Step 3: Add to `web/src/components/index.ts`**

```ts
export { Card } from './Card/Card.tsx';
export type { CardProps, CardAccent } from './Card/Card.tsx';
```

- [ ] **Step 4: Add the missing accent row to `scripts/check-contrast.mjs`**

Six of the seven accents are already covered. `--color-accent-evidence` is not:

```js
  ['--color-text', '--color-accent-evidence', 'normal'],
```

- [ ] **Step 5: Add the Card section to `web/src/gallery/Gallery.tsx`**

Extend the existing components import to `import { Badge, Card } from '../components/index.ts';`, then add after the Badge section:

```tsx
      <Section title="Card">
        <Card>Plain surface</Card>
        <Card accent="peach">Peach</Card>
        <Card accent="mint">Mint</Card>
        <Card accent="cream">Cream</Card>
        <Card accent="coral">Coral</Card>
        <Card accent="pink">Pink</Card>
        <Card accent="lavender">Lavender</Card>
        <Card accent="evidence">Evidence</Card>
      </Section>
```

- [ ] **Step 6: Verify**

```bash
cd web && npm run build && npm run lint && npx prettier --check .
cd /home/paddy/cse3cap && scripts/check-tokens.sh && node scripts/check-contrast.mjs
```
Expected: clean, and the new evidence row passing (14.51 light, 11.20 dark).

Load the gallery: eight cards, readable text on every tint, in both themes.

- [ ] **Step 7: Commit**

```bash
git add web/src/components/ web/src/gallery/Gallery.tsx scripts/check-contrast.mjs
git commit -m "$(cat <<'MSG'
feat(web): Card with the seven decorative accents (CAP-3)

No box-shadow: the design has one, CAP-1 has no shadow token, and CAP-1 is
settled. Accents are decorative and never encode status -- that is Badge's
job with semantic tokens.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01BBYMKL61UqyqqaRKf6fsUb
MSG
)"
```

---

### Task 4: Chip

**Files:**
- Create: `web/src/components/Chip/Chip.tsx`, `web/src/components/Chip/Chip.module.css`
- Modify: `web/src/components/index.ts`, `web/src/gallery/Gallery.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks. `Section` is defined in `Gallery.tsx` itself — no import to add.
- Produces: `Chip({ children, selected, disabled, on_click })`, `ChipProps`

No new contrast rows: selected reuses `--color-text-inverse` on `--color-primary` (already checked), unselected reuses `--color-text` on `--color-surface-alt` (added in Task 2).

- [ ] **Step 1: Create `web/src/components/Chip/Chip.module.css`**

```css
.chip {
  display: inline-flex;
  align-items: center;
  /* 44px. The design this came from states a hard floor: nothing may
     require a pointer, and every tappable thing clears 44px on its
     shortest side. CAP-1 has no tap-size token. */
  min-height: 2.75rem;
  padding: var(--space-8) var(--space-16);
  border: none;
  border-radius: var(--radius-full);
  /* A fill rather than the source design's hairline border, so CAP-3 needs
     no border-width token -- that one lands with PR #16 (CAP-4). */
  background: var(--color-surface-alt);
  color: var(--color-text);
  font: inherit;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  cursor: pointer;
}

.selected {
  background: var(--color-primary);
  color: var(--color-text-inverse);
}

.chip:disabled {
  opacity: 0.6;
  cursor: default;
}

.chip:focus-visible {
  outline: 0.125rem solid var(--color-focus-ring);
  outline-offset: 0.0625rem;
}
```

- [ ] **Step 2: Create `web/src/components/Chip/Chip.tsx`**

`aria-pressed` rather than `role="tab"`: the diary home's scope and sprint chips are filters, not a tablist.

```tsx
import type { ReactNode } from 'react';
import styles from './Chip.module.css';

export interface ChipProps {
  children: ReactNode;
  selected?: boolean;
  disabled?: boolean;
  on_click?: () => void;
}

export function Chip({ children, selected = false, disabled = false, on_click }: ChipProps) {
  const class_name = selected ? `${styles.chip} ${styles.selected}` : styles.chip;

  return (
    <button
      type="button"
      className={class_name}
      aria-pressed={selected}
      disabled={disabled}
      onClick={on_click}
    >
      {children}
    </button>
  );
}
```

- [ ] **Step 3: Add to `web/src/components/index.ts`**

```ts
export { Chip } from './Chip/Chip.tsx';
export type { ChipProps } from './Chip/Chip.tsx';
```

- [ ] **Step 4: Add the Chip section to `web/src/gallery/Gallery.tsx`**

Extend the import to include `Chip`. Add after the Card section — the selected chip is stateful so a reviewer can click it:

```tsx
      <Section title="Chip">
        <Chip selected={scope === 'all'} on_click={() => set_scope('all')}>
          All gigs
        </Chip>
        <Chip selected={scope === 'latrobe'} on_click={() => set_scope('latrobe')}>
          La Trobe
        </Chip>
        <Chip selected={scope === 'audit'} on_click={() => set_scope('audit')}>
          Data migration audit
        </Chip>
        <Chip disabled>Sprint 3 (disabled)</Chip>
      </Section>
```

And the state, beside the existing `theme` state in `Gallery()`:

```tsx
  const [scope, set_scope] = useState('all');
```

- [ ] **Step 5: Verify**

```bash
cd web && npm run build && npm run lint && npx prettier --check .
cd /home/paddy/cse3cap && scripts/check-tokens.sh && node scripts/check-contrast.mjs
```

In the gallery: clicking a chip moves the selection; tabbing to one shows the focus ring; the disabled one does not respond. Both themes, both widths.

- [ ] **Step 6: Commit**

```bash
git add web/src/components/ web/src/gallery/Gallery.tsx
git commit -m "$(cat <<'MSG'
feat(web): Chip with selected and unselected states (CAP-3)

A real button with aria-pressed -- the diary home's scope and sprint chips
are filters, not a tablist. Fill rather than a hairline border, so CAP-3
needs no border-width token from the unmerged CAP-4.

First focus-visible style in the repo: --color-focus-ring was defined in
CAP-1 and unused until now.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01BBYMKL61UqyqqaRKf6fsUb
MSG
)"
```

---

### Task 5: Button

**Files:**
- Create: `web/src/components/Button/Button.tsx`, `web/src/components/Button/Button.module.css`
- Modify: `web/src/components/index.ts`, `web/src/gallery/Gallery.tsx`, `scripts/check-contrast.mjs`

**Interfaces:**
- Consumes: nothing from earlier tasks. `Section` is defined in `Gallery.tsx` itself — no import to add.
- Produces: `Button({ children, variant, type, disabled, full_width, on_click })`, `ButtonProps`, `ButtonVariant`. Task 7 (ErrorNotice) renders `<Button variant="secondary" full_width={false}>`.

- [ ] **Step 1: Create `web/src/components/Button/Button.module.css`**

```css
.button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  /* 44px tap floor, as on Chip. */
  min-height: 2.75rem;
  padding: var(--space-12) var(--space-20);
  border: none;
  border-radius: var(--radius-md);
  font: inherit;
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-medium);
  cursor: pointer;
}

/* Full width is the default in the source design, not an opt-in. */
.full_width {
  width: 100%;
}

.primary {
  background: var(--color-primary);
  color: var(--color-text-inverse);
}

.primary:hover:not(:disabled) {
  background: var(--color-primary-hover);
}

/* A surface-alt fill with a --color-text label, not a primary-coloured
   outline: --color-primary as normal-size text on --color-bg measures
   4.29:1 in light mode, under AA. */
.secondary {
  background: var(--color-surface-alt);
  color: var(--color-text);
}

.button:disabled {
  opacity: 0.6;
  cursor: default;
}

.button:focus-visible {
  outline: 0.125rem solid var(--color-focus-ring);
  outline-offset: 0.0625rem;
}
```

- [ ] **Step 2: Create `web/src/components/Button/Button.tsx`**

No loading variant. CAP-3 forbids spinners; a caller waiting on a request swaps the label and sets `disabled`.

```tsx
import type { ReactNode } from 'react';
import styles from './Button.module.css';

export type ButtonVariant = 'primary' | 'secondary';

export interface ButtonProps {
  children: ReactNode;
  variant?: ButtonVariant;
  type?: 'button' | 'submit';
  disabled?: boolean;
  /** Full width is the default, matching the design. Opt out for a button
   *  sitting inline beside other content, e.g. ErrorNotice's retry. */
  full_width?: boolean;
  on_click?: () => void;
}

export function Button({
  children,
  variant = 'primary',
  type = 'button',
  disabled = false,
  full_width = true,
  on_click,
}: ButtonProps) {
  const class_name = [styles.button, styles[variant], full_width ? styles.full_width : null]
    .filter(Boolean)
    .join(' ');

  return (
    <button type={type} className={class_name} disabled={disabled} onClick={on_click}>
      {children}
    </button>
  );
}
```

- [ ] **Step 3: Add to `web/src/components/index.ts`**

```ts
export { Button } from './Button/Button.tsx';
export type { ButtonProps, ButtonVariant } from './Button/Button.tsx';
```

- [ ] **Step 4: Add the hover contrast row to `scripts/check-contrast.mjs`**

```js
  ['--color-text-inverse', '--color-primary-hover', 'normal'],
```

- [ ] **Step 5: Add the Button section to `web/src/gallery/Gallery.tsx`**

Extend the import to include `Button`. Uses `styles.column`, since these are full width by default:

```tsx
      <Section title="Button">
        <div className={styles.column}>
          <Button>Submit reflection</Button>
          <Button variant="secondary">Back</Button>
          <Button disabled>Submitting…</Button>
          <Button variant="secondary" disabled>
            Back (disabled)
          </Button>
          <Button full_width={false}>Inline width</Button>
        </div>
      </Section>
```

- [ ] **Step 6: Verify**

```bash
cd web && npm run build && npm run lint && npx prettier --check .
cd /home/paddy/cse3cap && scripts/check-tokens.sh && node scripts/check-contrast.mjs
```
Expected: the hover row passes (6.60 light, 10.50 dark).

In the gallery: hovering the primary button darkens it in light mode and lightens it in dark; both disabled buttons ignore hover and clicks; tabbing shows the ring.

- [ ] **Step 7: Commit**

```bash
git add web/src/components/ web/src/gallery/Gallery.tsx scripts/check-contrast.mjs
git commit -m "$(cat <<'MSG'
feat(web): Button, primary and secondary (CAP-3)

Full width by default, matching the design, with an opt-out for inline use.
Secondary is a surface-alt fill rather than a primary-coloured outline:
--color-primary as normal-size text on --color-bg is 4.29:1, under AA.

No loading variant -- CAP-3 forbids spinners, so a caller waiting on a
request swaps the label and disables.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01BBYMKL61UqyqqaRKf6fsUb
MSG
)"
```

---

### Task 6: Skeleton and SkeletonGroup

The API that outlives the ticket — every screen's loading state hangs off it, and there is no prior art to copy. Two exports: the shape, and the wrapper that carries the accessibility once so twelve screens do not each get it wrong.

**Files:**
- Create: `web/src/components/Skeleton/Skeleton.tsx`, `web/src/components/Skeleton/Skeleton.module.css`
- Modify: `web/src/components/index.ts`, `web/src/gallery/Gallery.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks. `Section` is defined in `Gallery.tsx` itself — no import to add.
- Produces: `Skeleton({ variant, lines, width, height })`, `SkeletonGroup({ children, label })`, `SkeletonProps`, `SkeletonGroupProps`, `SkeletonVariant`

No contrast rows: nothing here carries text.

- [ ] **Step 1: Create `web/src/components/Skeleton/Skeleton.module.css`**

```css
.skeleton {
  display: block;
  background: var(--color-surface-alt);
  border-radius: var(--radius-sm);
  animation: pulse 1.4s ease-in-out infinite;
}

/*
 * 1.4s is a bare value: CAP-1 defines no duration scale, and inventing one
 * in passing is a tokens.css change this ticket does not make. Same
 * treatment PR #16 gave its transition. check-tokens.sh polices colour and
 * pixel values, not time.
 */
@keyframes pulse {
  0%,
  100% {
    background-color: var(--color-surface-alt);
  }
  50% {
    background-color: var(--color-border);
  }
}

@media (prefers-reduced-motion: reduce) {
  .skeleton {
    animation: none;
  }
}

/* Height comes from the type scale, so a text skeleton is the height of the
   text it stands in for without anyone passing a number. */
.text {
  height: 1em;
}

.block {
  height: var(--space-64);
}

.circle {
  width: var(--space-48);
  height: var(--space-48);
  border-radius: var(--radius-full);
}

.lines {
  display: flex;
  flex-direction: column;
  gap: var(--space-8);
}

/* Visually hidden, not display:none -- a screen reader still announces it.
   Written in rem because check-tokens.sh rejects the conventional 1px. */
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

- [ ] **Step 2: Create `web/src/components/Skeleton/Skeleton.tsx`**

```tsx
/**
 * The loading primitive for every screen in the product. No spinners: a
 * skeleton matching the shape of what is coming tells the user something,
 * and a spinner tells them nothing.
 *
 * Two pieces, and screens want both:
 *
 *   <SkeletonGroup>            the accessibility, once
 *     <Skeleton variant="text" lines={3} />
 *     <Skeleton variant="block" />
 *   </SkeletonGroup>
 *
 * Every Skeleton is aria-hidden, because a screen reader should hear
 * "Loading" once from the group rather than a description of each bar.
 */
import type { CSSProperties, ReactNode } from 'react';
import styles from './Skeleton.module.css';

export type SkeletonVariant = 'text' | 'block' | 'circle';

export interface SkeletonProps {
  variant?: SkeletonVariant;
  /** Number of bars, for `text` only. The last is drawn short, the way a
   *  real paragraph ends. */
  lines?: number;
  /**
   * A CSS length: a percentage, `ch`, `em`, `rem`, or a `var(--space-*)`.
   *
   * NEVER `px`. scripts/check-tokens.sh fails the build on any pixel value
   * outside tokens.css, and it reads .tsx as well as .css, so `width="200px"`
   * here breaks CI rather than merely breaking the convention.
   */
  width?: string;
  /** As `width`. Defaults come from the variant, so most callers pass none. */
  height?: string;
}

export interface SkeletonGroupProps {
  children: ReactNode;
  /** Announced while the region is busy. */
  label?: string;
}

export function Skeleton({ variant = 'text', lines = 1, width, height }: SkeletonProps) {
  const style: CSSProperties = {};
  if (width) style.width = width;
  if (height) style.height = height;

  if (variant === 'text' && lines > 1) {
    return (
      <div className={styles.lines} aria-hidden="true">
        {Array.from({ length: lines }, (_, index) => (
          <span
            key={index}
            className={`${styles.skeleton} ${styles.text}`}
            style={{ ...style, width: index === lines - 1 ? '60%' : style.width }}
          />
        ))}
      </div>
    );
  }

  return (
    <span
      className={`${styles.skeleton} ${styles[variant]}`}
      style={style}
      aria-hidden="true"
    />
  );
}

export function SkeletonGroup({ children, label = 'Loading' }: SkeletonGroupProps) {
  return (
    <div role="status" aria-busy="true">
      <span className={styles.sr_only}>{label}</span>
      {children}
    </div>
  );
}
```

- [ ] **Step 3: Add to `web/src/components/index.ts`**

```ts
export { Skeleton, SkeletonGroup } from './Skeleton/Skeleton.tsx';
export type {
  SkeletonProps,
  SkeletonGroupProps,
  SkeletonVariant,
} from './Skeleton/Skeleton.tsx';
```

- [ ] **Step 4: Add the Skeleton section to `web/src/gallery/Gallery.tsx`**

Extend the import to include `Skeleton` and `SkeletonGroup`. The last block shows the shape a real diary row loads into, which is the thing worth reviewing:

```tsx
      <Section title="Skeleton">
        <div className={styles.column}>
          <Skeleton />
          <Skeleton variant="text" lines={3} />
          <Skeleton variant="block" />
          <Skeleton variant="circle" />
          <Skeleton variant="text" width="40%" />
          <SkeletonGroup label="Loading your diary">
            <Card>
              <Skeleton variant="text" width="60%" />
              <Skeleton variant="text" lines={2} />
            </Card>
          </SkeletonGroup>
        </div>
      </Section>
```

- [ ] **Step 5: Verify**

```bash
cd web && npm run build && npm run lint && npx prettier --check .
cd /home/paddy/cse3cap && scripts/check-tokens.sh && node scripts/check-contrast.mjs
```

In the gallery: bars pulse; the three-line block ends short; the circle is round. Then turn on reduced motion and confirm the pulse stops rather than the skeleton vanishing:

```bash
# Chrome DevTools: Rendering panel > Emulate CSS prefers-reduced-motion: reduce
```

- [ ] **Step 6: Commit**

```bash
git add web/src/components/ web/src/gallery/Gallery.tsx
git commit -m "$(cat <<'MSG'
feat(web): Skeleton and SkeletonGroup, the loading primitive (CAP-3)

Shape rather than size: heights come from the type scale and the variant, so
most callers pass nothing. The width prop documents that px is a CI failure,
not just a convention -- check-tokens.sh reads .tsx too.

SkeletonGroup carries role=status, aria-busy and one hidden label so twelve
screens get the accessibility right once instead of twelve times. Pulse
flattens under prefers-reduced-motion.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01BBYMKL61UqyqqaRKf6fsUb
MSG
)"
```

---

### Task 7: ErrorNotice

**Files:**
- Create: `web/src/components/ErrorNotice/ErrorNotice.tsx`, `web/src/components/ErrorNotice/ErrorNotice.module.css`
- Modify: `web/src/components/index.ts`, `web/src/gallery/Gallery.tsx`

**Interfaces:**
- Consumes: `ApiError` from `../../api/client.ts`; `Button` from Task 5, rendered as `<Button variant="secondary" full_width={false}>`
- Produces: `ErrorNotice({ error, on_retry })`, `ErrorNoticeProps`

No contrast rows: `--color-text` on `--color-danger-bg` was added in Task 2.

- [ ] **Step 1: Create `web/src/components/ErrorNotice/ErrorNotice.module.css`**

```css
.notice {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-12);
  padding: var(--space-16);
  border-radius: var(--radius-md);
  background: var(--color-danger-bg);
  /* Not --color-danger: on --color-danger-bg it measures 3.97:1 in light
     mode, under AA. The fill carries the alarm, the text stays readable. */
  color: var(--color-text);
}

.title {
  margin: 0;
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-bold);
}

.message {
  margin: 0;
  font-size: var(--font-size-sm);
}
```

- [ ] **Step 2: Create `web/src/components/ErrorNotice/ErrorNotice.tsx`**

Note what it deliberately does not handle. The submit gate's codes carry `details.entry_ids`, and `/add-screen` is explicit that the stepper highlights the offending competencies inline — a generic notice swallowing them would be the wrong shape.

```tsx
/**
 * The error state every screen ships, rendering an ApiError the client has
 * already unwrapped. Switches on `code` for the four cases that carry
 * distinct meaning and falls back to the envelope's own message otherwise.
 *
 * It deliberately does NOT handle EVIDENCE_REQUIRED or NARRATIVE_REQUIRED.
 * Those carry details.entry_ids, and the entry stepper highlights the
 * offending competencies inline rather than showing a banner.
 */
import { ApiError } from '../../api/client.ts';
import { Button } from '../Button/Button.tsx';
import styles from './ErrorNotice.module.css';

export interface ErrorNoticeProps {
  error: ApiError;
  /** Rendered only when retrying could plausibly help. */
  on_retry?: () => void;
}

interface Copy {
  title: string;
  message: string;
  can_retry: boolean;
}

function copy_for(error: ApiError): Copy {
  // status 0 means the request never reached the API at all, which is the
  // one case where retrying is always worth offering.
  if (error.status === 0) {
    return {
      title: 'Cannot reach the server',
      message: 'Check your connection and try again.',
      can_retry: true,
    };
  }

  switch (error.code) {
    case 'UNAUTHENTICATED':
      return {
        title: 'Your session has ended',
        message: 'Your token is no longer valid. Enter it again to continue.',
        can_retry: false,
      };
    case 'ROLE_FORBIDDEN':
      return {
        title: 'You do not have access to this',
        message: error.message,
        can_retry: false,
      };
    case 'NOT_FOUND':
      return {
        title: 'Not found',
        message: error.message,
        can_retry: false,
      };
    default:
      return {
        title: 'Something went wrong',
        message: error.message,
        can_retry: true,
      };
  }
}

export function ErrorNotice({ error, on_retry }: ErrorNoticeProps) {
  const { title, message, can_retry } = copy_for(error);

  return (
    <div className={styles.notice} role="alert">
      <p className={styles.title}>{title}</p>
      <p className={styles.message}>{message}</p>
      {on_retry && can_retry && (
        <Button variant="secondary" full_width={false} on_click={on_retry}>
          Try again
        </Button>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Add to `web/src/components/index.ts`**

```ts
export { ErrorNotice } from './ErrorNotice/ErrorNotice.tsx';
export type { ErrorNoticeProps } from './ErrorNotice/ErrorNotice.tsx';
```

- [ ] **Step 4: Add the ErrorNotice section to `web/src/gallery/Gallery.tsx`**

Extend the components import to include `ErrorNotice`, and add the client import beneath it:

```tsx
import { ApiError } from '../api/client.ts';
```

The constructor is `(status, code, message, details?)`:

```tsx
      <Section title="ErrorNotice">
        <div className={styles.column}>
          <ErrorNotice
            error={new ApiError(0, null, 'The request never reached the API.')}
            on_retry={() => undefined}
          />
          <ErrorNotice
            error={new ApiError(401, 'UNAUTHENTICATED', 'Bearer token missing or invalid.')}
            on_retry={() => undefined}
          />
          <ErrorNotice
            error={
              new ApiError(403, 'ROLE_FORBIDDEN', 'You are not an assessor on this gig.')
            }
          />
          <ErrorNotice
            error={new ApiError(404, 'NOT_FOUND', 'That reflection does not exist.')}
          />
          <ErrorNotice
            error={new ApiError(409, 'NOT_DRAFT', 'This reflection has already been submitted.')}
            on_retry={() => undefined}
          />
          <ErrorNotice
            error={new ApiError(500, null, 'The API answered outside the error envelope.')}
          />
        </div>
      </Section>
```

- [ ] **Step 5: Verify**

```bash
cd web && npm run build && npm run lint && npx prettier --check .
cd /home/paddy/cse3cap && scripts/check-tokens.sh && node scripts/check-contrast.mjs
```

In the gallery, confirm each notice reads correctly and that **Try again appears only on the first, second-to-last and none of the 401/403/404 cases** — the 401 passes `on_retry` but `can_retry` is false, which is the case worth checking by eye.

- [ ] **Step 6: Commit**

```bash
git add web/src/components/ web/src/gallery/Gallery.tsx
git commit -m "$(cat <<'MSG'
feat(web): ErrorNotice rendering the unwrapped error envelope (CAP-3)

Switches on code for the four cases that carry distinct meaning -- status 0,
UNAUTHENTICATED, ROLE_FORBIDDEN, NOT_FOUND -- and falls back to the
envelope's message. Retry is offered only where it could plausibly help.

Does not handle EVIDENCE_REQUIRED or NARRATIVE_REQUIRED on purpose: those
carry details.entry_ids and the stepper highlights the offending
competencies inline.

Body text is --color-text, not --color-danger, which measures 3.97:1 on
--color-danger-bg in light mode.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01BBYMKL61UqyqqaRKf6fsUb
MSG
)"
```

---

### Task 8: Documentation and the whole-gallery pass

**Files:**
- Modify: `web/README.md`

- [ ] **Step 1: Add a Components section to `web/README.md`**

Insert after the "The API client" section:

````markdown
## The components

`src/components/<Name>/<Name>.tsx` beside a colocated `<Name>.module.css`,
re-exported from `src/components/index.ts`. Import from the barrel:

```ts
import { Badge, Button, Card, Chip, ErrorNotice, Skeleton, SkeletonGroup } from './components/index.ts';
```

**See them all at once.** `npm run dev`, then
[localhost:5173/gallery.html](http://localhost:5173/gallery.html): every
component in every state, with a theme toggle. It is a second Vite entry
point rather than a route, because there is no router until CAP-5. Add a
section to `src/gallery/Gallery.tsx` whenever you add a component.

Two rules that are not obvious:

- **Props are snake_case**, like everything else that crosses the seam.
- **Never a `px` value, in CSS or in a `.tsx`.** `scripts/check-tokens.sh`
  reads both. Use `rem`, `em`, `%` or a token. This catches
  `<Skeleton width="200px" />` as well as a stylesheet.
````

- [ ] **Step 2: Run every check, from a clean tree**

```bash
cd /home/paddy/cse3cap
cd web && npm run build && npm run lint && npx prettier --check .
cd /home/paddy/cse3cap && scripts/check-tokens.sh && node scripts/check-contrast.mjs
```

Read the output. Expected: a successful build, no lint or format complaints, `No raw hex or magic pixel values outside tokens.css.`, and every contrast row passing in both themes.

- [ ] **Step 3: Look at the whole gallery, four ways**

`npm run dev`, then `http://localhost:5173/gallery.html` in each combination:

| | 390 wide | 1280 wide |
| --- | --- | --- |
| **light** | every section | every section |
| **dark** | every section | every section |

What to actually check, rather than glance at:
- No component has an invisible border or a washed-out label in dark mode. A single missed token shows up here and nowhere else.
- Nothing overflows horizontally at 390.
- Tab through the page: every Chip and Button takes a visible focus ring.

- [ ] **Step 4: Commit**

```bash
git add web/README.md
git commit -m "$(cat <<'MSG'
docs(web): how the component folder and the gallery work (CAP-3)

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01BBYMKL61UqyqqaRKf6fsUb
MSG
)"
```

---

## Follow-ups, not in this plan

- **PR #16 (CAP-4) uses camelCase props.** `onChange`, `onSave`, `onStatusChange`, `debounceMs` — against CAP-3's acceptance criteria, `CLAUDE.md`, `web/README.md`, and CAP-4's own ticket text, which says "debounces `on_change`". It needs a review comment before it merges, or the library ships split-brained. Not this branch's change to make.
- **`components/index.ts` and PR #16 are an add/add conflict.** Whoever merges second concatenates the two blocks.
- **CAP-1 has no "ink" tier.** The design this was sourced from carries three tiers per semantic colour (`--self` / `--self-ink` / `--self-soft`) and puts the ink variant on the soft background. CAP-1 kept two, which is why `--color-success` on `--color-success-bg` fails AA. Adding the missing tier is a `tokens.css` change and an ADR, and would let badges use their own colour for text.
- **No shadow, duration or tap-size tokens.** Card drops its shadow, Skeleton hardcodes `1.4s`, Button and Chip hardcode `2.75rem`. Each is a token CAP-1 does not have. Worth one pass over `tokens.css` when someone reopens it, rather than three separate ad-hoc additions.
- **`scripts/guard-docs-location.sh` misfires on shell variables.** `cat > "$SOMEWHERE/x.md"` is judged repo-relative because the hook cannot expand the variable, so a write outside the repo is refused. Harmless once known; a one-line fix.
