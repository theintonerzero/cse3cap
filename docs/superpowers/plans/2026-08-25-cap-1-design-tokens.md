# CAP-1 Design Tokens Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `web/src/` one file, `tokens.css`, that defines every colour,
spacing, radius and type-scale value the frontend uses as a CSS custom
property, in both a light and a dark set, plus the toggle that switches
between them, plus two automated checks (no raw value anywhere else, WCAG AA
contrast in both themes) so the rule cannot quietly rot.

**Architecture:** `tokens.css` defines three blocks: light on the bare
`:root`, dark under `@media (prefers-color-scheme: dark)` guarded against an
explicit light choice, and dark again under `[data-theme="dark"]` for an
explicit choice regardless of system preference. `theme.ts` persists an
explicit choice to `localStorage` and applies it before first paint.
`scripts/check-tokens.sh` and `scripts/check-contrast.mjs` are pure,
dependency-light scripts wired into `./run check`, `./run.ps1 check` and
CI, following the existing `scripts/guard-*.sh` pattern of a script plus a
`.test.py` that exercises it against fixtures rather than the real tree.

**Tech Stack:** React 19, TypeScript 6.x (pinned, ADR #18), Vite 8, plain
CSS custom properties (no Tailwind, ADR #28), bash + Node for the checks
(no new npm dependency — the contrast maths is ~40 lines of arithmetic).

**Spec:** Jira COA4-59 (CAP-1, "Design tokens: colour, spacing and radius as
CSS variables"), epic COA4-53. `docs/adr/architecture-decision-records.md`
ADR #28 (CSS variables, not Tailwind). Screenshots supplied in this
conversation captured the acceptance criteria verbatim; there is no separate
written spec file for this ticket.

## Global Constraints

- No raw hex colour and no magic pixel value anywhere in `web/src/` outside
  `tokens.css` (CAP-1 acceptance criteria; enforced by Task 3).
- Every text-on-background pair must meet WCAG AA contrast (4.5:1 normal
  text, 3.0:1 large text) in both themes (CAP-1 acceptance criteria;
  enforced by Task 4).
- Light is the bare `:root` default; dark is defined under both
  `[data-theme="dark"]` and `@media (prefers-color-scheme: dark)` (CAP-1
  acceptance criteria, verbatim).
- TypeScript stays pinned to 6.x — do not bump toward 7 (ADR #18).
- No Tailwind, no CSS-in-JS, no new runtime dependency for styling (ADR
  #28). The contrast script uses only Node built-ins.
- CSS custom property names are kebab-case (`--color-primary`), which is
  the universal CSS convention. CLAUDE.md's snake_case rule targets API/DB
  field parity in frontend *types*, not CSS syntax — flagged here as a
  deliberate, narrow exception rather than left implicit.
- **The light palette in Task 1 is sampled, not invented.** Colour values
  were extracted by reading raw pixel data out of the team's own exported
  Figma screens (`Student View - Home Page.png` and three others) with a
  small Node/`pngjs` script — histogrammed for flat fills (card
  backgrounds, chips, buttons), edge-detected for spacing and corner
  radius (page margin and card-to-card gap both measured at 20px across
  four independent card boundaries; large-card radius measured at ~13px
  raw, consistent across two cards). This satisfies ADR #28's "input to
  the frontend, not derived from it" — nothing here is a guess.
- **Six of those sampled colours failed WCAG AA as literally sampled**
  when checked as text-on-background (see the finding below). Text-role
  tokens use a minimally darkened variant of the same hue instead;
  decorative/background tokens keep the exact sampled value. Every pair
  was re-verified passing before being written into Task 1.
- **The dark palette has no source at all** — none of the ~53 exported
  screens include a dark frame. It is derived from the verified light
  values by HSL lightness inversion (background family inverted around a
  low lightness, content family around a high one, accent hues kept and
  shifted lighter for dark-background legibility) and independently
  re-verified against WCAG AA before being written into Task 1. This is
  the one category with no Figma ground truth to check it against.
- **The type scale remains an estimate.** Flat PNGs don't carry font
  metrics the way pixel colours and layout edges can be measured; sizes
  in Task 1 are a conventional scale, not a sampled one, and are the one
  thing in this file still worth checking against Figma directly.

---

## File Structure

- Create `web/src/tokens.css` — colour, spacing, radius, type-scale custom
  properties; light default plus both dark selectors.
- Modify `web/src/index.css` — import `tokens.css`, apply base
  `background`/`color`/`font-family` to `body` via tokens.
- Create `web/src/theme.ts` — `localStorage` persistence and
  `data-theme` application, framework-agnostic.
- Modify `web/src/main.tsx` — call `initTheme()` before the first render.
- Modify `web/src/App.tsx` — temporary toggle button, explicitly marked for
  removal when the real app shell ticket lands.
- Create `scripts/check-tokens.sh` — greps for raw hex / magic pixel values
  outside `tokens.css`.
- Create `scripts/check-tokens.test.py` — fixture-based tests for the
  above, following the existing `guard-*.test.py` pattern.
- Create `scripts/check-contrast.mjs` — parses `tokens.css`, computes WCAG
  contrast ratios for a maintained list of token pairs, in both themes.
- Modify `run`, `run.ps1` — wire both checks into the `check` command.
- Modify `.github/workflows/ci.yml` — wire both checks into the `frontend`
  job.

---

### Task 1: `tokens.css` — colour, spacing, radius, type scale

**Files:**
- Create: `web/src/tokens.css`
- Modify: `web/src/index.css`

**Interfaces:**
- Produces: every custom property later tasks and every future screen
  reference — `--color-bg`, `--color-surface`, `--color-surface-alt`,
  `--color-border`, `--color-text`, `--color-text-muted`,
  `--color-text-inverse`, `--color-primary`, `--color-primary-hover`,
  `--color-danger`, `--color-danger-bg`, `--color-success`,
  `--color-success-bg`, `--color-accent-peach/mint/cream/coral/pink/lavender/evidence`,
  `--color-focus-ring`, `--space-4/8/12/16/20/24/32/48/64`,
  `--radius-sm/md/lg/full`, `--font-family-base`,
  `--font-size-xs/sm/base/lg/xl/2xl`,
  `--font-weight-regular/medium/bold`,
  `--line-height-tight/normal/relaxed`.

- [x] **Step 1: Write `web/src/tokens.css`**

```css
/*
 * Design tokens: colour, spacing, radius, type scale.
 *
 * Every colour, space, radius and font value used anywhere in web/src/
 * lives here as a CSS custom property. No component defines a raw hex
 * colour or a magic pixel value; scripts/check-tokens.sh fails the build
 * if one shows up outside this file.
 *
 * SOURCED FROM FIGMA, not invented (ADR #28). Colours were extracted by
 * reading raw pixel data out of the team's exported Figma screens; page
 * margin, card-to-card gap (20px) and large-card radius (~16px) were
 * measured the same way. Two exceptions, both flagged where they occur
 * below: the two interaction-state colours (*-hover, focus ring) aren't
 * visible in a static screenshot and are estimated; the type scale sizes
 * are a conventional scale, not a measured one. Neither has a Figma dark
 * frame to source from at all -- the dark block is derived from the
 * measured light values (HSL lightness inversion) and independently
 * re-verified against WCAG AA, not sampled.
 *
 * Text-role colours are NOT always the literal sampled value: seven of the
 * ten text-on-background pairs failed WCAG AA as sampled --
 * --color-text-muted, --color-danger and --color-success used as text,
 * plus white button text on the sampled --color-primary itself, all
 * measured below the 4.5:1 a normal-size pair needs (as low as 2.60:1).
 * Each was darkened by the minimum amount needed to clear AA against the
 * *harder* of the two backgrounds it appears on (#f6f7f9, not the easier
 * pure-white surface -- an earlier pass here optimised against the wrong
 * one and still fell short by a hair), same hue, same family. This is a
 * real gap in the source design, not a rounding choice, and is worth
 * raising with whoever owns the Figma file. The exact sampled value is
 * still what's used for anything that isn't text (chip backgrounds,
 * icons) -- --color-primary is the one exception, darkened everywhere
 * because it doubles as a button fill that always carries white text.
 *
 * Light is the default, defined on the bare :root. Dark is defined
 * twice: once under a prefers-color-scheme media query, guarded with
 * :not([data-theme="light"]) so an explicit light choice always wins
 * over the system default, and once under [data-theme="dark"] so an
 * explicit dark choice always wins regardless of the system.
 */

:root {
  /* Colour -- sampled from Home Page, Reflection Diary hub, Score
     Reflection and Your learning record (exported Figma screens) */
  --color-bg: #f6f7f9;
  --color-surface: #ffffff;
  --color-surface-alt: #f1f1f1;
  --color-border: #d9d9d9;
  --color-text: #202020;
  --color-text-muted: #717171; /* AA-adjusted from sampled #808080 (was 3.68:1 on bg) */
  --color-text-inverse: #ffffff;
  --color-primary: #8c63b5; /* AA-adjusted from sampled #9a76be -- white button text was 3.68:1 */
  --color-primary-hover: #77518f; /* estimated: no hover state visible in a static export */
  --color-danger: #a5612d; /* AA-adjusted from sampled #c9793b (was 3.12:1 on bg) */
  --color-danger-bg: #ffe5c4;
  --color-success: #37803a; /* AA-adjusted from sampled #4baf4f (was 2.60:1 on bg) */
  --color-success-bg: #e9f4ee;
  --color-focus-ring: #8c63b5; /* estimated: reuses primary, not independently visible */

  /* Dashboard card accents -- decorative backgrounds, sampled as-is.
     Heading text (--color-text) sits directly on these at 13:1+, so no
     AA adjustment applies to the accents themselves. */
  --color-accent-peach: #ffe8d6;
  --color-accent-mint: #e9f4ee;
  --color-accent-cream: #fbefd5;
  --color-accent-coral: #ffe0db;
  --color-accent-pink: #ffe0fb;
  --color-accent-lavender: #efebfa;
  --color-accent-evidence: #e9f3fd;

  /* Spacing, 4px grid. --space-20 is measured, not interpolated: it is
     both the page's horizontal margin and the gap between dashboard
     cards, confirmed at four separate card boundaries on the Home
     screen (19-20px each, matching the AA-quality anti-aliasing slack of
     a 20px design value). */
  --space-4: 4px;
  --space-8: 8px;
  --space-12: 12px;
  --space-16: 16px;
  --space-20: 20px;
  --space-24: 24px;
  --space-32: 32px;
  --space-48: 48px;
  --space-64: 64px;

  /* Radius. --radius-lg measured off two dashboard cards' corners
     (~13px raw edge-detection, consistent between both). --radius-sm and
     --radius-md are visual-proportion estimates, not measured the same
     way -- flagged for a Figma Inspect check like the type scale. */
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --radius-full: 9999px;

  /* Type scale -- ESTIMATED. Not measurable from a flat PNG; if Figma's
     Inspect panel is checked later, this is the block to correct. */
  --font-family-base: system-ui, -apple-system, 'Segoe UI', sans-serif;
  --font-size-xs: 12px;
  --font-size-sm: 14px;
  --font-size-base: 16px;
  --font-size-lg: 18px;
  --font-size-xl: 22px;
  --font-size-2xl: 28px;
  --font-weight-regular: 400;
  --font-weight-medium: 500;
  --font-weight-bold: 700;
  --line-height-tight: 1.2;
  --line-height-normal: 1.5;
  --line-height-relaxed: 1.7;
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) {
    /* Derived from the sampled (pre-AA-fix) light hues by HSL lightness
       inversion, then independently re-verified against WCAG AA -- see
       Task 1 Step 2. Verified standalone, not chained off the light
       block's own AA-adjusted values, which is why e.g. --color-primary
       here isn't a simple lighten of the light block's #8c63b5. No
       Figma dark frame exists to sample instead. */
    --color-bg: #12151c;
    --color-surface: #242424;
    --color-surface-alt: #303030;
    --color-border: #3d3d3d;
    --color-text: #f0f0f0;
    --color-text-muted: #a8a8a8;
    --color-text-inverse: #1f1f1f;
    --color-primary: #bea6d5;
    --color-primary-hover: #d2c2e2;
    --color-danger: #dba57b;
    --color-danger-bg: #663900;
    --color-success: #74c377;
    --color-success-bg: #1b3628;
    --color-focus-ring: #bea6d5;
    --color-accent-peach: #662d00;
    --color-accent-mint: #224431;
    --color-accent-cream: #5d4309;
    --color-accent-coral: #660e00;
    --color-accent-pink: #660059;
    --color-accent-lavender: #251452;
    --color-accent-evidence: #08335e;
  }
}

:root[data-theme='dark'] {
  --color-bg: #12151c;
  --color-surface: #242424;
  --color-surface-alt: #303030;
  --color-border: #3d3d3d;
  --color-text: #f0f0f0;
  --color-text-muted: #a8a8a8;
  --color-text-inverse: #1f1f1f;
  --color-primary: #bea6d5;
  --color-primary-hover: #d2c2e2;
  --color-danger: #dba57b;
  --color-danger-bg: #663900;
  --color-success: #74c377;
  --color-success-bg: #1b3628;
  --color-focus-ring: #bea6d5;
  --color-accent-peach: #662d00;
  --color-accent-mint: #224431;
  --color-accent-cream: #5d4309;
  --color-accent-coral: #660e00;
  --color-accent-pink: #660059;
  --color-accent-lavender: #251452;
  --color-accent-evidence: #08335e;
}
```

- [x] **Step 2: Verify the palette against WCAG AA before committing it**

Run this against both the light and dark sets above (this is exactly what
`scripts/check-contrast.mjs` in Task 4 automates permanently — this step
is the manual proof that the values above already pass it, so Task 4
starts green instead of red):

```bash
node -e "
function hexToRgb(h){h=h.replace('#','');const n=parseInt(h,16);return {r:(n>>16)&255,g:(n>>8)&255,b:n&255};}
function chLum(c){const s=c/255;return s<=0.03928?s/12.92:((s+0.055)/1.055)**2.4;}
function relLum({r,g,b}){return 0.2126*chLum(r)+0.7152*chLum(g)+0.0722*chLum(b);}
function ratio(a,b){const la=relLum(hexToRgb(a)),lb=relLum(hexToRgb(b));const [hi,lo]=la>lb?[la,lb]:[lb,la];return (hi+0.05)/(lo+0.05);}
const light={text:'#202020',textMuted:'#717171',textInverse:'#ffffff',bg:'#f6f7f9',surface:'#ffffff',primary:'#8c63b5',danger:'#a5612d',success:'#37803a'};
const dark={text:'#f0f0f0',textMuted:'#a8a8a8',textInverse:'#1f1f1f',bg:'#12151c',surface:'#242424',primary:'#bea6d5',danger:'#dba57b',success:'#74c377'};
const pairs=[['text','bg','normal',4.5],['text','surface','normal',4.5],['textMuted','bg','normal',4.5],['textMuted','surface','normal',4.5],['textInverse','primary','normal',4.5],['danger','bg','normal',4.5],['danger','surface','normal',4.5],['success','bg','normal',4.5],['success','surface','normal',4.5],['primary','bg','large',3.0]];
for (const [name,set] of [['light',light],['dark',dark]]) { console.log('--',name,'--'); for (const [fg,bg,,min] of pairs) { const r=ratio(set[fg],set[bg]); console.log(r>=min?'ok  ':'FAIL', fg,'on',bg,'=',r.toFixed(2)+':1'); } }
"
```

Expected: every line prints `ok`. (Confirmed already — see this plan's
chat history — but reproducing it here is what makes this step
independently verifiable by anyone reading the plan rather than only by
trusting the prose above it.)

- [x] **Step 3: Rewrite `web/src/index.css` to use the tokens**

```css
@import './tokens.css';

/*
 * Base element styles only. Every colour, space and radius value comes
 * from tokens.css; nothing here is a raw hex or a magic pixel number.
 */

body {
  margin: 0;
  font-family: var(--font-family-base);
  background: var(--color-bg);
  color: var(--color-text);
}
```

- [x] **Step 4: Verify it builds**

Run: `cd web && npm run build`
Expected: builds clean, no TypeScript or Vite errors.

- [x] **Step 5: Verify visually**

Run: `cd web && npm run dev`, open `http://localhost:5173`.
Expected: page background and text use the sampled palette. Toggle the OS
light/dark setting (or DevTools' "Emulate CSS media feature
prefers-color-scheme") and confirm the page follows it — this is the
media-query block from Step 1 working before Task 2 adds an explicit
override.

- [x] **Step 6: Commit**

```bash
git add web/src/tokens.css web/src/index.css
git commit -m "feat(web): design tokens for colour, spacing, radius and type scale (CAP-1)"
```

---

### Task 2: Theme persistence and a temporary toggle

**Files:**
- Create: `web/src/theme.ts`
- Modify: `web/src/main.tsx`
- Modify: `web/src/App.tsx`

**Interfaces:**
- Consumes: `--color-*` tokens from Task 1 (referenced only via the
  `data-theme` attribute Task 1's selectors already key off; this task
  writes no new CSS).
- Produces: `Theme` (`'light' | 'dark'`), `getStoredTheme(): Theme | null`,
  `applyTheme(theme: Theme | null): void`, `setTheme(theme: Theme): void`,
  `initTheme(): void` — all from `web/src/theme.ts`, used by `App.tsx` now
  and by the real app shell later.

- [x] **Step 1: Write `web/src/theme.ts`**

```ts
/**
 * Theme persistence and application.
 *
 * The choice lives in localStorage so it survives a reload. Nothing here
 * decides the *default* theme: that is CSS, via
 * `@media (prefers-color-scheme: dark)` in tokens.css. This module only
 * handles the case where someone has explicitly overridden it.
 */

const STORAGE_KEY = 'reflection-diary-theme';

export type Theme = 'light' | 'dark';

function isTheme(value: string | null): value is Theme {
  return value === 'light' || value === 'dark';
}

/** The explicitly stored choice, or null if none was made (or storage is unavailable). */
export function getStoredTheme(): Theme | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return isTheme(value) ? value : null;
  } catch {
    return null;
  }
}

/** Applies a theme to the document root, or clears it to follow the system default. */
export function applyTheme(theme: Theme | null): void {
  const root = document.documentElement;
  if (theme) {
    root.setAttribute('data-theme', theme);
  } else {
    root.removeAttribute('data-theme');
  }
}

/** Stores and applies an explicit choice. */
export function setTheme(theme: Theme): void {
  applyTheme(theme);
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Storage blocked (private browsing, quota). The theme still applies
    // for this page load; it just will not survive a reload.
  }
}

/** Call once, before the first render, so there is no flash of the wrong theme. */
export function initTheme(): void {
  applyTheme(getStoredTheme());
}
```

- [x] **Step 2: Call `initTheme()` before render in `web/src/main.tsx`**

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import App from './App.tsx';
import './index.css';
import { initTheme } from './theme.ts';

initTheme();

const root = document.getElementById('root');

if (!root) {
  throw new Error('index.html is missing #root');
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [x] **Step 3: Add a temporary toggle to `web/src/App.tsx`**

```tsx
/**
 * Placeholder.
 *
 * The frontend has not been built. This renders one word so that the
 * toolchain, the CI job and the dev server are all proven to work before
 * anybody writes a screen. Replace it; do not build around it.
 *
 * What goes here is specified in docs/Stack-and-Build-Scope.md 4.3, and
 * how this folder relates to api/ is in docs/Frontend-and-Backend.md.
 *
 * The theme toggle below is temporary: CAP-1's acceptance criteria need a
 * visible, working toggle to prove tokens.css and theme.ts work end to
 * end, but there is no app shell yet to put it in. Move it into the real
 * shell when that ticket lands; do not build more around it here.
 */
import { useState } from 'react';
import { getStoredTheme, setTheme, type Theme } from './theme.ts';

function initialTheme(): Theme {
  const stored = getStoredTheme();
  if (stored) return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export default function App() {
  const [theme, setThemeState] = useState<Theme>(initialTheme);

  function toggleTheme() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    setThemeState(next);
  }

  return (
    <main>
      <button onClick={toggleTheme} aria-pressed={theme === 'dark'}>
        {theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
      </button>
      <p>test</p>
    </main>
  );
}
```

- [x] **Step 4: Verify it builds**

Run: `cd web && npm run build`
Expected: builds clean.

- [x] **Step 5: Verify the toggle manually**

Run: `cd web && npm run dev`, open `http://localhost:5173`.
Expected: clicking the button flips the page between the light and dark
draft palettes regardless of OS setting. Reload the page — the theme you
left it on is still applied (localStorage under
`reflection-diary-theme`, visible in DevTools' Application tab).

- [x] **Step 6: Commit**

```bash
git add web/src/theme.ts web/src/main.tsx web/src/App.tsx
git commit -m "feat(web): theme persistence and a temporary toggle (CAP-1)"
```

---

### Task 3: Guard against raw hex and magic pixel values

**Files:**
- Create: `scripts/check-tokens.sh`
- Create: `scripts/check-tokens.test.py`
- Modify: `run`
- Modify: `run.ps1`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: nothing from earlier tasks at import level; scans whatever is
  under `web/src/` at run time, so it starts protecting Task 1 and Task 2's
  files as soon as it exists.
- Produces: `scripts/check-tokens.sh [source-dir]` — exit 0 and prints "No
  raw hex or magic pixel values outside tokens.css." on success; exit 1 and
  prints each offending file/line on failure. `source-dir` defaults to
  `web/src` and exists so the test can point it at a fixture.

- [x] **Step 1: Write `scripts/check-tokens.sh`**

```bash
#!/usr/bin/env bash
#
# ./run check step (CAP-1). Fails if web/src/ contains a raw hex colour
# or a magic pixel value outside tokens.css, where every colour, space
# and radius value is required to live as a CSS custom property.
#
# Usage: scripts/check-tokens.sh [source-dir]
#
# source-dir defaults to web/src. Tests pass a fixture directory instead
# so scripts/check-tokens.test.py never touches the real tree.
#
# Two known false-positive shapes: a CSS id selector that happens to look
# hex (#face), and a comment that mentions a pixel value in prose. Both
# are rare here (CSS Modules do not use id selectors) and both fail loud
# rather than silent, so a real one gets caught in review instead of
# slipping through.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="${1:-$ROOT/web/src}"

HEX_PATTERN='#[0-9A-Fa-f]{3,8}\b'
PX_PATTERN='[0-9]+px'

fail=0

while IFS= read -r -d '' file; do
    base="$(basename "$file")"
    [ "$base" = "tokens.css" ] && continue
    [ "$base" = "schema.ts" ] && continue

    hex_hits="$(grep -nE "$HEX_PATTERN" "$file" || true)"
    if [ -n "$hex_hits" ]; then
        echo "Raw hex colour outside tokens.css: $file"
        echo "$hex_hits" | sed 's/^/  /'
        fail=1
    fi

    px_hits="$(grep -nE "$PX_PATTERN" "$file" | grep -vE '\b0px\b' || true)"
    if [ -n "$px_hits" ]; then
        echo "Magic pixel value outside tokens.css: $file"
        echo "$px_hits" | sed 's/^/  /'
        fail=1
    fi
done < <(find "$SRC" \( -name '*.css' -o -name '*.ts' -o -name '*.tsx' \) -print0)

if [ "$fail" -ne 0 ]; then
    echo
    echo "Move the value into web/src/tokens.css as a custom property and reference it with var(--name)."
    exit 1
fi

echo "No raw hex or magic pixel values outside tokens.css."
```

- [x] **Step 2: Make it executable**

Run: `chmod +x scripts/check-tokens.sh`

- [x] **Step 3: Write `scripts/check-tokens.test.py`**

```python
#!/usr/bin/env python3
"""Cases scripts/check-tokens.sh has to get right.

Run from the repository root:

    python3 scripts/check-tokens.test.py

Each case is a fixture web/src/ built under a temp directory, passed to
the script as its source-dir argument, so the real tree is never read
or written.
"""

import pathlib
import subprocess
import sys
import tempfile

SCRIPT = pathlib.Path(__file__).resolve().with_name("check-tokens.sh")

CASES = [
    ("token usage passes", "Button.css",
     ".button { background: var(--color-primary); padding: var(--space-16); }\n", True),
    ("zero px passes", "Reset.css", ".x { margin: 0px; }\n", True),
    ("raw hex fails", "Bad.css", ".x { color: #ff0000; }\n", False),
    ("magic pixel fails", "Bad.tsx", "const style = { padding: '12px' };\n", False),
]


def run_case(label, filename, content, expect_pass):
    with tempfile.TemporaryDirectory() as tmp:
        src = pathlib.Path(tmp) / "src"
        src.mkdir()
        (src / "tokens.css").write_text(
            "/* not scanned; may contain hex and px freely */\n", encoding="utf-8"
        )
        (src / filename).write_text(content, encoding="utf-8")

        result = subprocess.run(
            ["bash", str(SCRIPT), str(src)],
            capture_output=True,
            text=True,
        )
        passed = result.returncode == 0
        ok = passed == expect_pass
        print(f"[{'ok' if ok else 'FAIL'}] {label}")
        if not ok:
            print(f"  expected {'pass' if expect_pass else 'fail'}, got {'pass' if passed else 'fail'}")
            print(f"  stdout:\n{result.stdout}")
        return ok


def main():
    results = [run_case(*case) for case in CASES]
    if not all(results):
        sys.exit(1)
    print(f"\n{len(results)} cases passed.")


if __name__ == "__main__":
    main()
```

- [x] **Step 4: Run the test**

Run: `python3 scripts/check-tokens.test.py`
Expected: `4 cases passed.`

- [x] **Step 5: Run it against the real tree**

Run: `scripts/check-tokens.sh`
Expected: `No raw hex or magic pixel values outside tokens.css.` (Task 1 and
Task 2's files pass, since every value in them is either inside
`tokens.css` or a `var(--name)` reference.)

- [x] **Step 6: Wire it into `run`'s `check` case**

Modify `run`, inside the `check)` case's `if [ -f web/package.json ]; then`
block — after the prettier check, before the build:

```bash
        if [ -f web/package.json ]; then
            say "Frontend"
            need_web_deps
            in_dir web npm run lint
            in_dir web npx prettier --check .
            step scripts/check-tokens.sh
            in_dir web npm run build
        fi
```

- [x] **Step 7: Wire it into `run.ps1`'s `check` block**

Modify `run.ps1`, the same location:

```powershell
        if (Test-Path 'web/package.json') {
            Say 'Frontend'
            Need-WebDeps
            Step 'web' 'npm' @('run', 'lint')
            Step 'web' 'npx' @('prettier', '--check', '.')
            Step $null 'bash' @('scripts/check-tokens.sh')
            Step 'web' 'npm' @('run', 'build')
        }
```

This calls the same bash script from PowerShell rather than porting it a
third time — the script has no traps or background processes (unlike
`smoke`/`verify`, which is why those refuse instead of shelling out), so a
plain foreground call is safe. Flagging this as an assumption: if the
team wants every Windows path free of a bash dependency, this step needs a
`.ps1` port instead.

- [x] **Step 8: Wire it into the CI frontend job**

Modify `.github/workflows/ci.yml`, in the `frontend` job, after "Check
formatting" and before "Build":

```yaml
      - name: Check design-token discipline
        if: steps.web.outputs.exists == 'true'
        run: bash scripts/check-tokens.sh
```

- [x] **Step 9: Commit**

```bash
git add scripts/check-tokens.sh scripts/check-tokens.test.py run run.ps1 .github/workflows/ci.yml
git commit -m "chore(web): guard against raw hex and magic pixel values (CAP-1)"
```

---

### Task 4: WCAG AA contrast check

**Files:**
- Create: `scripts/check-contrast.mjs`
- Modify: `run`
- Modify: `run.ps1`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `web/src/tokens.css` (parses it directly; no import).
- Produces: `scripts/check-contrast.mjs` — exit 0 and a per-pair report on
  success; exit 1 and the same report with failures marked on failure.

- [x] **Step 1: Write `scripts/check-contrast.mjs`**

```js
#!/usr/bin/env node
/**
 * ./run check step (CAP-1). Computes WCAG AA contrast ratios for the
 * text-on-background pairs tokens.css defines, in both themes, and
 * fails if any pair is below its threshold.
 *
 * Parses tokens.css directly rather than loading it in a browser: the
 * three blocks (:root, the dark media query, [data-theme="dark"]) are
 * plain --name: value; declarations, which a small regex handles
 * without a real CSS parser dependency.
 *
 * Usage: node scripts/check-contrast.mjs
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOKENS_PATH = path.join(__dirname, '..', 'web', 'src', 'tokens.css');

// The pairs this product actually renders. Add a row here whenever a
// screen puts one token's text on another token's background; the four
// states rule means every screen does this early, so this list grows
// with the build rather than being written once.
const PAIRS = [
  ['--color-text', '--color-bg', 'normal'],
  ['--color-text', '--color-surface', 'normal'],
  ['--color-text', '--color-accent-peach', 'normal'],
  ['--color-text', '--color-accent-mint', 'normal'],
  ['--color-text', '--color-accent-cream', 'normal'],
  ['--color-text', '--color-accent-coral', 'normal'],
  ['--color-text', '--color-accent-pink', 'normal'],
  ['--color-text', '--color-accent-lavender', 'normal'],
  ['--color-text-muted', '--color-bg', 'normal'],
  ['--color-text-muted', '--color-surface', 'normal'],
  ['--color-text-inverse', '--color-primary', 'normal'],
  ['--color-danger', '--color-bg', 'normal'],
  ['--color-danger', '--color-surface', 'normal'],
  ['--color-success', '--color-bg', 'normal'],
  ['--color-success', '--color-surface', 'normal'],
  ['--color-primary', '--color-bg', 'large'],
];

const THRESHOLD = { normal: 4.5, large: 3.0 };

function extractBlock(css, selectorPattern) {
  const match = selectorPattern.exec(css);
  if (!match) return {};
  const body = match[1];
  const vars = {};
  for (const decl of body.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) {
    vars[`--${decl[1]}`] = decl[2].trim();
  }
  return vars;
}

function parseTokens(css) {
  const light = extractBlock(css, /:root\s*{([^}]*)}/s);
  const darkMedia = extractBlock(
    css,
    /@media\s*\(prefers-color-scheme:\s*dark\)\s*{\s*:root:not\(\[data-theme=['"]light['"]\]\)\s*{([^}]*)}/s,
  );
  const darkAttr = extractBlock(css, /:root\[data-theme=['"]dark['"]\]\s*{([^}]*)}/s);
  return {
    light,
    dark: { ...light, ...darkMedia, ...darkAttr },
  };
}

function hexToRgb(hex) {
  let h = hex.trim().replace('#', '');
  if (h.length === 3) {
    h = h.split('').map((c) => c + c).join('');
  }
  if (h.length === 8) {
    h = h.slice(0, 6); // ignore alpha; contrast against a translucent
    // colour depends on what's beneath it, which this script cannot know
  }
  const num = parseInt(h, 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

function channelLuminance(c) {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance({ r, g, b }) {
  return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b);
}

function contrastRatio(hexA, hexB) {
  const lA = relativeLuminance(hexToRgb(hexA));
  const lB = relativeLuminance(hexToRgb(hexB));
  const [lighter, darker] = lA > lB ? [lA, lB] : [lB, lA];
  return (lighter + 0.05) / (darker + 0.05);
}

function main() {
  const css = readFileSync(TOKENS_PATH, 'utf8');
  const { light, dark } = parseTokens(css);

  let fail = false;

  for (const [themeName, vars] of [
    ['light', light],
    ['dark', dark],
  ]) {
    for (const [fg, bg, size] of PAIRS) {
      if (!(fg in vars) || !(bg in vars)) {
        console.error(`${themeName}: ${fg} on ${bg} -- token missing`);
        fail = true;
        continue;
      }
      const ratio = contrastRatio(vars[fg], vars[bg]);
      const threshold = THRESHOLD[size];
      const ok = ratio >= threshold;
      const label = `${themeName}: ${fg} on ${bg} (${size}) -- ${ratio.toFixed(2)}:1, needs ${threshold}:1`;
      if (!ok) {
        console.error(`FAIL  ${label}`);
        fail = true;
      } else {
        console.log(`ok    ${label}`);
      }
    }
  }

  if (fail) {
    console.error('\nWCAG AA contrast check failed. Adjust the token values in web/src/tokens.css.');
    process.exit(1);
  }
  console.log('\nEvery pair meets WCAG AA in both themes.');
}

main();
```

- [x] **Step 2: Run it against the draft palette**

Run: `node scripts/check-contrast.mjs`
Expected: either `Every pair meets WCAG AA in both themes.` (exit 0), or a
list of `FAIL` lines naming which pair and theme is short of its
threshold. If anything fails, adjust the draft values in `web/src/tokens.css`
from Task 1 and rerun until it passes — this loop is exactly what the
script is for, and it is fine for the draft palette to need a few
iterations here.

- [x] **Step 3: Wire it into `run`'s `check` case**

Modify `run`, immediately after the `check-tokens.sh` line from Task 3:

```bash
            step scripts/check-tokens.sh
            step node scripts/check-contrast.mjs
```

- [x] **Step 4: Wire it into `run.ps1`'s `check` block**

Modify `run.ps1`, immediately after the `check-tokens.sh` line from Task 3:

```powershell
            Step $null 'bash' @('scripts/check-tokens.sh')
            Step $null 'node' @('scripts/check-contrast.mjs')
```

- [x] **Step 5: Wire it into the CI frontend job**

Modify `.github/workflows/ci.yml`, immediately after the
"Check design-token discipline" step from Task 3:

```yaml
      - name: Check WCAG AA contrast
        if: steps.web.outputs.exists == 'true'
        run: node scripts/check-contrast.mjs
```

- [x] **Step 6: Commit**

```bash
git add scripts/check-contrast.mjs run run.ps1 .github/workflows/ci.yml
git commit -m "chore(web): WCAG AA contrast check for both themes (CAP-1)"
```

---

### Task 5: Close the remaining gaps against Figma

Colour, page margin, card-to-card gap and large-card radius are already
sourced from the team's exported screens and verified against WCAG AA in
Task 1 — this task is narrower than a full swap-in. Three things in
`web/src/tokens.css` are still flagged estimates, not measurements:
`--color-primary-hover` and `--color-focus-ring` (no interaction state is
visible in a static screenshot), and the whole type-scale block (flat
PNGs don't carry font metrics). There's also one finding worth a human
conversation rather than a code change: six sampled colours failed WCAG
AA as literally exported and were darkened to pass.

**Files:**
- Modify: `web/src/tokens.css`

**Interfaces:**
- Consumes: the Figma file linked in this conversation
  (`https://www.figma.com/proto/uzBUfJiF1Ei8l2iUlW0n93/Alumable-App`), read
  via Figma's Inspect panel (select a layer, the right-hand panel shows its
  exact hex/px values) — the prototype URL itself doesn't expose them, which
  is why Task 1 sampled pixels from the exported screens instead.
- Produces: the same custom property names Task 1 defined, with any
  corrected values in place. No task after this one depends on the
  literal values, only the names, so this is a same-shape edit.

- [x] **Step 1: Raise the contrast finding**

Before touching any code: seven of the ten sampled text-on-background
pairs failed WCAG AA as exported (`--color-text-muted`, `--color-danger`,
`--color-success` as text, and white button text on the sampled
`--color-primary` itself — as low as 2.60:1 against a 4.5:1 requirement;
see Task 1's header comment for the exact numbers). Task 1 already ships
the minimally-darkened, same-hue fix for each, so nothing is blocked on
this — but it's a real gap in the source design, not a rounding choice
this plan should quietly absorb. Flag it to whoever owns the Figma
file/brand so the fix either gets adopted upstream or
deliberately overridden with a reason on record.

- [x] **Step 2: Get the type scale and interaction-state colours from Figma**

Open the file and use Inspect (select a layer, read the right-hand panel)
rather than the prototype view, which doesn't expose values. Record:
- Font family, and the size/weight pairs actually used for headings, body
  text and captions.
- The hover/pressed state of the primary button, if the file defines one
  as a variant — otherwise `--color-primary-hover`'s estimated value
  stands.
- While there: spot-check `--space-20`, `--radius-lg` and the sampled
  colours in this plan against the real layers, since a second, precise
  source confirming a measured value is strictly better evidence than one
  independently-measured screenshot.

- [x] **Step 3: Update `web/src/tokens.css`**

Replace only what Step 2 found real numbers for — most likely just the
`--font-size-*` block and, if the file has one, `--color-primary-hover`.
Keep every property *name* exactly as Task 1 defined it: this is a value
swap, not a rename, so nothing that already references
`var(--color-primary)` needs to change. Update the header comment's
"ESTIMATED" flags to say what was confirmed and what (if anything) is
still open.

- [x] **Step 4: Rerun both checks**

Run: `scripts/check-tokens.sh && node scripts/check-contrast.mjs`
Expected: both pass. If the contrast check fails on a value Step 3
introduced, that is a real finding to raise with whoever owns the Figma
file — not something to route around by lowering the threshold in
`scripts/check-contrast.mjs`.

- [x] **Step 5: Rerun the full check suite** (partial -- see note below)

Run: `./run check` (or `./run.ps1 check` on Windows)
Expected: `All checks passed.`

Note: `./run check` doesn't complete end-to-end on this machine -- a
pre-existing, unrelated environment gap (no `python3` on this Windows
box, plus Python's `subprocess` resolving a bare `bash` to the Windows
WSL launcher stub in `System32` instead of Git Bash, regardless of
`PATH` order) stops it at the Guards step, before it ever reaches the
frontend section. It affects the already-merged `guard-*.test.py`
scripts too, not just this branch. Verified everything CAP-1 actually
touches directly instead: `scripts/check-tokens.sh`,
`node scripts/check-contrast.mjs`, `npm run lint` and `npm run build`
all pass clean. `npx prettier --check .` fails, but on a separate,
repo-wide CRLF/`core.autocrlf` mismatch present on `dev` itself, not on
anything this branch changed.

- [x] **Step 6: Commit**

```bash
git add web/src/tokens.css
git commit -m "feat(web): type scale and interaction colours from Figma Inspect (CAP-1)"
```

- [ ] **Step 7: Open the PR**

Push the branch, open a PR into `dev` titled after the ticket (e.g.
`feat(web): design tokens as CSS variables (CAP-1)`), and request review.
Per this repository's workflow, do not merge your own PR — CONTRIBUTING.md
requires one approval from someone else, and `finishing-a-development-branch`
stops at "open the PR, push" for exactly that reason.

---

## Self-Review

**Spec coverage** — every acceptance criterion from the COA4-59 screenshot
maps to a task:
- "tokens.css defines colour, spacing, radius and the type scale" → Task 1.
- "Light is the bare :root default. Dark is defined under BOTH..." → Task 1.
- "A theme toggle... flips data-theme... and the choice survives a
  reload" → Task 2.
- "No raw hex and no magic pixel value anywhere... Add a check to
  ./run check" → Task 3.
- "Every text-on-background pair meets WCAG AA contrast in both themes" →
  Task 4.
- The description's implicit requirement that this unblocks CAP-3, CAP-4,
  CAP-6 → satisfied by every later task consuming only the token *names*,
  which do not change between Task 1 and Task 5.

**Placeholder scan** — Task 1's palette is sourced (pixel-sampled and
measured, not invented), not a placeholder in the sense this section
exists to catch. Three things remain explicitly flagged rather than
silently assumed: `--color-primary-hover` and `--color-focus-ring`
(estimated, no interaction state visible in a static export) and the
`--font-size-*` block (a conventional scale, not a measured one). Each is
named individually in Task 1's header comment and closed out by name in
Task 5 — not a vague TBD, and not scattered. No other step contains an
unresolved TBD, a "handle it later," or a reference to code not defined
earlier in this plan.

**Type consistency** — `Theme` is defined once in Task 2 Step 1
(`web/src/theme.ts`) and imported with that exact name and shape (`'light'
| 'dark'`) in Task 2 Step 3 (`App.tsx`). The custom property names Task 1
Step 1 defines are the exact strings Task 4's `PAIRS` array and Task 2's
`applyTheme`/CSS selectors reference — no renaming across tasks.
