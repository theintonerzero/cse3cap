# CAP-5 App Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps
> use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `web/` the frame every screen mounts into -- a React Router route table with
a placeholder per screen, a token context that holds one bearer token and calls
`GET /auth/me` once on boot, navigation derived entirely from what that call returns, a
switcher between the three seeded tokens, and a 401 anywhere returning the user to token
entry.

**Architecture:** Three layers, each with one responsibility. `session/tokens.ts` is a
pure module over `sessionStorage` that knows nothing about React -- it holds up to three
pasted tokens and which one is active. `session/SessionProvider.tsx` is the only thing in
the codebase that calls `setAuthToken`; it resolves the active token to a user via
`GET /auth/me` and exposes `{ state, me, ... }` through context. `app/AppShell.tsx` renders
the header, the role-aware nav and an `<Outlet/>`, and `app/routes.tsx` declares the route
table. The 401 rule is a single callback registered on the API client, fired from the one
place in `send()` that throws for a non-2xx, so no screen ever handles it.

**Tech Stack:** React 19.2.8, TypeScript 6.x (pinned, ADR #18), Vite 8, **react-router
8.3.1** (not yet a dependency). CSS Modules + `tokens.css` custom properties only, per
ADR #28.

**Spec:** Jira CAP-5, "App shell: router, token context, role-aware navigation", epic
Frontend Foundation, exported to `docs/jira/cap-sprint-3.csv`. The five acceptance criteria
are reproduced verbatim below and were confirmed against live Jira on 2026-09-13; the
export and Jira agree exactly. There is no separate written spec file for this ticket.
Ownership moved from Andrew Johansson to Patrick Anley on 2026-09-13; the CSV export still
records the original assignee.

### The acceptance criteria, verbatim

1. React Router with a route per screen, each rendering a placeholder for now.
2. Token context holds a bearer token, calls GET /auth/me once on boot, exposes the user.
3. Navigation is built from what /auth/me returns. The client never decides a role itself.
   A hidden nav item is a convenience; the 403 is the rule.
4. A switcher for the three seeded tokens. There is no login screen in the MVP (ADR #15).
5. A 401 anywhere clears the token and returns to the token entry state.

Depends on CAP-2 (the typed API client), which is merged.

---

## Global Constraints

- **CAP-5 only.** Nothing else goes on this branch. Anything found along the way is
  recorded in "Follow-ups, not in this plan" at the foot of this document and left alone.
- **Do not touch `web/src/api/client.ts:141`.** That line seeds the token from
  `import.meta.env.VITE_API_TOKEN` and is finding **F1** in `docs/Security-Review.md`, a
  live High. It is Tony's to fix and is deliberately out of scope here. See "What this
  ticket arms" below -- this is the one thing that must be said out loud at standup rather
  than left in a document.
- **Do not delete `web/review-queue.html`, `web/src/review-queue-dev.tsx`, or the third
  `vite.config.ts` entry.** They are CAP-10's, and removing them is Tony's follow-up on the
  day this lands. Task 7 makes that follow-up a one-line change and says so in a comment.
- **Roles are never decided by the client.** Nav visibility is a display concern derived
  from `/auth/me` participations. Every route stays reachable by URL. A hidden nav item is
  a convenience; the 403 is the rule. (`docs/Frontend-and-Backend.md`, "Roles never cross".)
- **snake_case prop and function names**, matching every existing component
  (`on_click`, `full_width`, `on_retry`). Established by CAP-3/CAP-4 and followed by CAP-6.
- **No raw hex and no `px` value anywhere in `web/src/` outside `tokens.css`.**
  `scripts/check-tokens.sh` reads `.tsx` as well as `.css` and fails CI on either.
  Available tokens: `--color-bg --color-surface --color-surface-alt --color-border
  --color-text --color-text-muted --color-text-inverse --color-primary --color-primary-hover
  --color-success --color-success-bg --color-danger --color-danger-bg --color-focus-ring
  --space-4 --space-8 --space-12 --space-16 --space-20 --space-24 --space-32 --space-48
  --space-64 --radius-sm --radius-md --radius-lg --radius-full --font-size-xs --font-size-sm
  --font-size-base --font-size-lg --font-size-xl --font-size-2xl --font-weight-regular
  --font-weight-medium --font-weight-bold --line-height-tight --line-height-normal
  --line-height-relaxed --font-family-base --border-width-sm`.
- **Every API call goes through `web/src/api/client.ts`.** No component calls `fetch`,
  parses a response body, or declares its own response interface.
- **Types are generated, never written.** `web/src/api/schema.ts` comes from
  `docs/openapi.yaml` via `npm run gen:types` and is not edited.
- **TypeScript stays pinned to 6.x.** Do not bump toward 7 (ADR #18, ADR #36).
- **`web/` has no test runner** (CLAUDE.md). Verification is a script in `scripts/` wired
  into `./run`, plus the gallery ritual CAP-3 established: load the app at 390px and
  1280px, in both themes, and look.
- **`web/tsconfig.app.json` is strict in four ways that bite.** `verbatimModuleSyntax: true`
  -- a type-only import MUST be written `import type { X }` or `import { type X }`, or it
  is an error. `noUnusedLocals` and `noUnusedParameters` -- an unused import fails the
  build. `erasableSyntaxOnly: true` -- no `enum`, no `namespace`, no parameter properties.
  `allowImportingTsExtensions` -- imports carry their `.ts`/`.tsx` extension, as every
  existing file does. `strict: true` throughout.
- **`React.FormEvent` may be written without importing React.** Verified against
  `web/src/review-queue-dev.tsx:29`, which does exactly that and compiles.
- **Reusable components first.** `Card`, `Button`, `Chip`, `Badge`, `TextArea`,
  `ProgressBar`, `BottomSheet`, `RadarPanel`, `Skeleton`, `SkeletonGroup`, `ErrorNotice`
  already exist in `web/src/components/`. Build nothing this ticket can borrow.

## Decisions recorded here

Three calls this plan makes that the ticket leaves open. Each is written into the code with
its reasoning attached, so reversing one is a small edit rather than archaeology.

**Tokens live in `sessionStorage`, not `localStorage`.** Each browser tab holds its own
identity, so a student and an assessor can be open side by side -- which is how a
counter-score landing on the radar actually gets demonstrated. It also bounds the lifetime
of a credential that findings **F2** and **F3** in `docs/Security-Review.md` record as
never expiring and unscoped. `theme.ts` uses `localStorage` and is the right structural
model to copy, including its `try`/`catch` around blocked storage -- but not its choice of
store.

**The switcher is three `Chip`s inside a `BottomSheet`, opened from the header.** The
ticket says "a switcher" and does not say what shape. Three chips loose in a header crowd
at phone width; a dropdown would be right if the list could grow, and ADR #15 fixes it at
three permanently. Both components already exist and are currently used only in the
gallery.

**Token entry and the switcher are one component with a `mode` prop**, not two builds --
the pattern `/add-screen` prescribes for the student and assessor steppers. With no usable
token it renders full-screen as the token entry state; with one it renders inside the
sheet. Criterion 5 then has one obvious implementation: clear the token, and the same
component reappears in its other mode.

**A slot label is not a role.** The three slots are labelled Student / Assessor /
Supervisor because that is what the seeded tokens are called in
`~/reflection-diary-tokens.txt`, and pasting three tokens into three unlabelled boxes is
miserable. The label is a hint about which token to paste. It is never read to decide what
the user may do -- that comes from `/auth/me` participations, per gig, and criterion 3.
Task 2 carries this as a comment because it is the one part of this design a reviewer is
right to be suspicious of.

## What this ticket arms

Stated once, here, because it is the consequence of merging this plan and it belongs in a
standup rather than a document.

`web/src/api/client.ts:141` reads `import.meta.env.VITE_API_TOKEN`, which Vite replaces
with a **string literal at build time**. It is harmless today only by accident: no screen
calls the API client, so Rollup tree-shakes the entire request path out of the bundle.
`docs/Security-Review.md` F1 demonstrated this with a canary rather than assuming it.

**This ticket is the change that removes that accident.** From the day it merges, anyone
who builds `web/` with a token in `web/.env` ships a working bearer token in public
JavaScript, silently, with nothing about the running site looking wrong.

The fix is one line and is Tony's, tracked on CAP-24. This plan does not apply it. It does
require that the person merging says so out loud first.

---

## File structure

**Created**

| File | Responsibility |
| --- | --- |
| `web/src/session/tokens.ts` | The three slots and the active one, over `sessionStorage`. No React, no network |
| `web/src/session/SessionProvider.tsx` | The context. Owns `setAuthToken`, calls `/auth/me` once, exposes the user and the four states |
| `web/src/session/useSession.ts` | The hook, split out so Provider and consumers do not import each other |
| `web/src/session/TokenGate.tsx` | Token entry (full screen) and the switcher (in a sheet). One component, `mode` prop |
| `web/src/session/TokenGate.module.css` | Its styles |
| `web/src/app/AppShell.tsx` | Header, role-aware nav, `<Outlet/>`. The frame itself |
| `web/src/app/AppShell.module.css` | Its styles |
| `web/src/app/Placeholder.tsx` | One component every unbuilt route renders, naming its ticket |
| `web/src/app/Placeholder.module.css` | Its styles |
| `web/src/app/routes.tsx` | The route table, and nothing else |
| `scripts/verify-app-shell.sh` | The check, since `web/` has no test runner |

**Modified**

| File | Change |
| --- | --- |
| `web/src/api/client.ts` | Add `setOnUnauthorized`, fire it from the single non-2xx throw at line 356 |
| `web/src/App.tsx` | Replaced. Becomes the router and the providers |
| `web/package.json`, `web/package-lock.json` | `react-router` |
| `run` | A `verify-shell` command |
| `web/README.md` | The shell exists; how to get a token in |
| `docs/Stack-and-Build-Scope.md` | Tick §4.3 line 152 |

`web/src/main.tsx` is not modified: it already calls `initTheme()` and renders `<App/>`.
`web/src/theme.ts` is not modified; the shell imports it.

## The route table

Ten of the twelve screens in `docs/Stack-and-Build-Scope.md` §4.3 are routes. The other two
are sheets, which is a decision this plan makes and flags:

| Path | Screen | Ticket |
| --- | --- | --- |
| `/` | Diary home | CAP-7 |
| `/gigs/:gig_id` | Gig detail | CAP-8 |
| `/entries/:entry_id` | Entry stepper, student mode | CAP-11 |
| `/reflections/:reflection_id/submitted` | Submitted confirmation | CAP-12 |
| `/review-queue` | Review queue | CAP-10, **already built** |
| `/review-queue/entries/:entry_id` | Assessor stepper | CAP-13 |
| `/frameworks` | Select framework | CAP-15 |
| `/frameworks/:framework_id/edit` | Edit framework | CAP-16 |
| `*` | Not found | -- |

**History sheet (CAP-14) and Export sheet (CAP-18) get no route.** Both are described in
§4.3 as sheets, and `BottomSheet` exists for exactly this; they open over the diary rather
than navigating away from it. If CAP-14 or CAP-18 decides it wants a linkable URL, adding
one is a line in `routes.tsx` -- which is why this is recorded rather than argued.

Nested per ADR #27 so gig-then-sprint-then-entry stays linkable and back-button-correct.
**Data loaders are deliberately not used** (ADR #27): fetching lives in the typed API
client, and each screen owns its own.

---

## Task 1: Add react-router

**Files:**
- Modify: `web/package.json`, `web/package-lock.json`

**Interfaces:**
- Consumes: nothing.
- Produces: `react-router` importable from `web/src/`.

- [ ] **Step 1: Install**

Run from `web/`:

```bash
npm install react-router@8.3.1
```

Pinned exactly rather than `^8`. ADR #27 records that this library's API has changed shape
enough across majors that examples found online are often for a version we are not on; an
exact pin means the version in the lockfile is the version the plan was written against.

- [ ] **Step 2: Confirm no peer-dependency conflict with React 19**

Run: `npm ls react-router react`

Expected: no `UNMET PEER DEPENDENCY`. react-router 8.3.1 declares
`peerDependencies: { react: ">=19.2.7", react-dom: ">=19.2.7" }` and `web/package.json`
carries `react: ^19.2.8`, so this should be clean. If npm warns or silently applies
`--legacy-peer-deps` behaviour, **stop and report back** rather than proceeding: that is
the same class of problem the TypeScript-6 pin and recharts v3 already worked around, and
it is worth a second opinion before anything is built on top.

- [ ] **Step 3: Confirm there is no separate `react-router-dom` to install**

Run: `npm ls react-router-dom`

Expected: empty. From v7 onward `react-router-dom` is merged into `react-router`, and
`BrowserRouter`, `Routes`, `Route`, `Outlet`, `NavLink`, `Navigate`, `useParams` and
`useNavigate` are all exported from the `react-router` root. Verified against the package's
own `dist/development/index.d.ts` at 8.3.1. If a tutorial tells you to install
`react-router-dom`, it is for v6.

- [ ] **Step 4: Verify the build still passes**

Run from `web/`: `npm run build`
Expected: builds clean.

- [ ] **Step 5: Commit**

```bash
git add web/package.json web/package-lock.json
git commit -m "chore(web): add react-router 8.3.1 for the app shell (CAP-5)"
```

---

## Task 2: `tokens.ts` -- the three slots

**Files:**
- Create: `web/src/session/tokens.ts`

**Interfaces:**
- Consumes: nothing. Deliberately no React and no network, so it can be reasoned about and
  checked on its own.
- Produces:
  - `type SlotId = 'student' | 'assessor' | 'supervisor'`
  - `const SLOT_IDS: readonly SlotId[]`
  - `const SLOT_LABEL: Record<SlotId, string>`
  - `type TokenSlots = Record<SlotId, string | null>`
  - `function get_slots(): TokenSlots`
  - `function set_slot_token(slot: SlotId, token: string | null): void`
  - `function get_active_slot(): SlotId | null`
  - `function set_active_slot(slot: SlotId | null): void`
  - `function get_active_token(): string | null`
  - `function clear_active_token(): void`

- [ ] **Step 1: Write the module**

```ts
/**
 * The seeded tokens, and which one is in use.
 *
 * There is no login screen in this MVP (ADR #15): three Sanctum tokens are
 * seeded server-side, one per role, and the app is told which one to act as
 * by having it pasted in. This module is where they are kept.
 *
 * `sessionStorage`, not `localStorage`, for two reasons. Each browser tab
 * gets its own identity, so the student and the assessor can be open side by
 * side, which is how a counter-score arriving on the radar is actually
 * demonstrated. And a credential that docs/Security-Review.md records as
 * never expiring and unscoped (findings F2 and F3) should not outlive the
 * tab that used it. `theme.ts` is the structural model here, including its
 * try/catch around storage being unavailable; it just makes the other
 * choice about which store to use, because a theme is not a credential.
 *
 * NOTHING HERE DECIDES WHAT A USER MAY DO. The slot labels below exist
 * because pasting three tokens into three unlabelled boxes is miserable, and
 * because they match what the tokens are called in the file the seeder
 * writes. A label is a hint about which token to paste, never a role. Roles
 * are resolved server-side from gig_participants and reach the frontend only
 * through GET /auth/me, per gig, and that is the only thing navigation or
 * any screen may read. See CLAUDE.md and docs/Frontend-and-Backend.md.
 *
 * No React in this file on purpose: the storage rules are easier to trust
 * when they are not tangled up with a render cycle.
 */

const TOKENS_KEY = 'reflection-diary-tokens';
const ACTIVE_KEY = 'reflection-diary-active-slot';

/** Which seeded token a slot holds. A label, not a permission. */
export type SlotId = 'student' | 'assessor' | 'supervisor';

export const SLOT_IDS: readonly SlotId[] = ['student', 'assessor', 'supervisor'];

/** Matches the names in ~/reflection-diary-tokens.txt, so the paste is obvious. */
export const SLOT_LABEL: Record<SlotId, string> = {
  student: 'Student',
  assessor: 'Assessor',
  supervisor: 'Supervisor',
};

export type TokenSlots = Record<SlotId, string | null>;

const EMPTY: TokenSlots = { student: null, assessor: null, supervisor: null };

function is_slot(value: unknown): value is SlotId {
  return typeof value === 'string' && (SLOT_IDS as readonly string[]).includes(value);
}

/** Every slot, with `null` for the ones nothing has been pasted into. */
export function get_slots(): TokenSlots {
  try {
    const raw = sessionStorage.getItem(TOKENS_KEY);
    if (!raw) return { ...EMPTY };

    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return { ...EMPTY };

    const slots: TokenSlots = { ...EMPTY };
    for (const slot of SLOT_IDS) {
      const value = (parsed as Record<string, unknown>)[slot];
      slots[slot] = typeof value === 'string' && value !== '' ? value : null;
    }
    return slots;
  } catch {
    // Storage blocked, or a value someone else wrote that is not ours.
    // Starting empty is correct: it lands on the token entry state, which
    // is a state this app has and can recover from.
    return { ...EMPTY };
  }
}

export function set_slot_token(slot: SlotId, token: string | null): void {
  const slots = get_slots();
  slots[slot] = token && token.trim() !== '' ? token.trim() : null;

  try {
    sessionStorage.setItem(TOKENS_KEY, JSON.stringify(slots));
  } catch {
    // Private browsing, or quota. The token still applies for this page
    // load, because the caller holds it in React state; it just will not
    // survive a reload.
  }
}

export function get_active_slot(): SlotId | null {
  try {
    const value = sessionStorage.getItem(ACTIVE_KEY);
    return is_slot(value) ? value : null;
  } catch {
    return null;
  }
}

export function set_active_slot(slot: SlotId | null): void {
  try {
    if (slot) {
      sessionStorage.setItem(ACTIVE_KEY, slot);
    } else {
      sessionStorage.removeItem(ACTIVE_KEY);
    }
  } catch {
    // As above.
  }
}

/** The token the app should be sending, or null when there is not one. */
export function get_active_token(): string | null {
  const slot = get_active_slot();
  if (!slot) return null;
  return get_slots()[slot];
}

/**
 * Forget the active token entirely: the slot is emptied and deselected.
 *
 * This is what a 401 does (acceptance criterion 5). The token is emptied
 * rather than merely deselected because a 401 means the API has told us this
 * specific token is not valid, so keeping it in the slot only invites it to
 * be picked again. The other slots are untouched.
 */
export function clear_active_token(): void {
  const slot = get_active_slot();
  if (slot) set_slot_token(slot, null);
  set_active_slot(null);
}
```

- [ ] **Step 2: Type-check**

Run from `web/`: `npx tsc -b`
Expected: no errors.

- [ ] **Step 3: Confirm no pixel or hex value slipped in**

Run from the repository root: `bash scripts/check-tokens.sh`
Expected: passes. **Invoked via `bash` on purpose**: the file is committed mode `100644`,
not `100755`, so running it directly fails with "Permission denied". That is a pre-existing
bug in the repository, not something this ticket introduces and not something it fixes --
it is recorded as a follow-up below. There is no styling in this file, so this is cheap insurance rather than
a real risk -- but the script reads `.tsx` and `.ts` as well as `.css`, and running it per
task is how a violation gets attributed to the task that introduced it.

- [ ] **Step 4: Commit**

```bash
git add web/src/session/tokens.ts
git commit -m "feat(web): the three seeded token slots, in sessionStorage (CAP-5)"
```

---

## Task 3: The 401 hook in the API client

**Files:**
- Modify: `web/src/api/client.ts` (the Configuration block around line 141, and the
  non-2xx throw at line 356)

**Interfaces:**
- Consumes: nothing.
- Produces: `function setOnUnauthorized(handler: (() => void) | null): void`

Note the camelCase: this file's existing public surface is `setAuthToken`, `getAuthToken`,
`api`, `ApiError`. A snake_case export here would be the odd one out in the file it lives
in. The snake_case convention this repo follows is for API and DB field parity and for
component props; `client.ts` predates it and is internally consistent, so match the file.

- [ ] **Step 1: Add the hook beside the token**

In `web/src/api/client.ts`, directly after `getAuthToken` (currently ending line 149), add:

```ts
/**
 * What to do when the API says a token is no longer good.
 *
 * Acceptance criterion 5 of CAP-5: "a 401 anywhere clears the token and
 * returns to the token entry state". Anywhere is the point. Every request in
 * this app funnels through `send()` below, so this is the one place that can
 * honour it -- the alternative is every screen remembering to, which is the
 * same as it not happening.
 *
 * The shell's session provider registers this once. Nothing else should.
 */
let onUnauthorized: (() => void) | null = null;

export function setOnUnauthorized(handler: (() => void) | null): void {
  onUnauthorized = handler;
}
```

- [ ] **Step 2: Fire it from the single non-2xx throw**

`web/src/api/client.ts` currently ends `send()` with:

```ts
  if (!response.ok) {
    throw await toApiError(response, url);
  }

  return response;
}
```

Replace that `if` block with:

```ts
  if (!response.ok) {
    const error = await toApiError(response, url);

    // The session is gone. Told before the error is thrown, so the shell has
    // already cleared the token by the time a screen's catch block runs and
    // nothing gets a chance to render half a page as a stranger. The error
    // is still thrown: the caller decides what to show, this only decides
    // who we are.
    if (error.status === 401) onUnauthorized?.();

    throw error;
  }

  return response;
}
```

The contract returns `{ error: { code: 'UNAUTHENTICATED', ... } }` with status 401 for a
missing or invalid bearer token (`components/responses/Unauthenticated` in
`docs/openapi.yaml`). This switches on `status`, not `code`, because a proxy or a gateway
can produce a 401 that is not the envelope at all -- in which case `code` is `null` and the
session is just as gone.

- [ ] **Step 3: Type-check**

Run from `web/`: `npx tsc -b`
Expected: no errors.

- [ ] **Step 4: Verify the client still does what it claims**

Run from the repository root: `./run verify`

Expected: all checks pass. Part 3 needs the backend up (`./run api`) and will skip itself
loudly if it is not; that is acceptable here, but **read the output rather than assuming
it** -- this task changed the file that every screen in the project is built on, and
`web/` has no test runner to catch a regression any other way.

Note `./run verify` creates rows on the shared database (one export per run), the same as
`scripts/smoke.sh`. That is expected and is not a reason to skip it.

- [ ] **Step 5: Commit**

```bash
git add web/src/api/client.ts
git commit -m "feat(web): a 401 anywhere can tell the shell the session is gone (CAP-5)"
```

---

## Task 4: `SessionProvider` and `useSession`

**Files:**
- Create: `web/src/session/useSession.ts`
- Create: `web/src/session/SessionProvider.tsx`

**Interfaces:**
- Consumes: `get_active_token`, `get_active_slot`, `set_active_slot`, `set_slot_token`,
  `clear_active_token`, `get_slots`, `SlotId`, `TokenSlots` from `./tokens.ts`;
  `setAuthToken`, `setOnUnauthorized`, `api`, `ApiError` from `../api/client.ts`.
- Produces:
  - `type Me = components['schemas']['Me']` re-exported as `SessionUser`
  - `type SessionState = 'no_token' | 'loading' | 'error' | 'ready'`
  - `interface Session { state; me; error; slots; active_slot; sign_in_with; switch_to;
    sign_out; retry }`
  - `const SessionContext: React.Context<Session | null>`
  - `function SessionProvider({ children }: { children: ReactNode })`
  - `function useSession(): Session`

- [ ] **Step 1: Write the context and hook**

`web/src/session/useSession.ts`:

```ts
/**
 * The session, as every screen sees it.
 *
 * Split from SessionProvider.tsx so a consumer importing the hook does not
 * pull the provider's module graph in with it, and so the two do not have to
 * import each other.
 */
import { createContext, useContext } from 'react';

import type { ApiError } from '../api/client.ts';
import type { components } from '../api/schema.ts';
import type { SlotId, TokenSlots } from './tokens.ts';

/** Straight from the contract. Never hand-written. */
export type SessionUser = components['schemas']['Me'];

/**
 * The shell's four states, which are the same four every screen ships.
 *
 *   no_token  nothing usable is stored. The token entry state
 *   loading   a token is stored and GET /auth/me has not answered yet
 *   error     it answered with something other than a 401
 *   ready     `me` is populated
 *
 * A 401 is not one of these: it resolves to `no_token`, because that is
 * exactly what a 401 means here and criterion 5 says so.
 */
export type SessionState = 'no_token' | 'loading' | 'error' | 'ready';

export interface Session {
  state: SessionState;
  /** Populated only when `state` is `ready`. */
  me: SessionUser | null;
  /** Populated only when `state` is `error`. */
  error: ApiError | null;
  /** Which slots have a token pasted in, for the switcher to render. */
  slots: TokenSlots;
  active_slot: SlotId | null;
  /** Store a token in a slot, make it active, and resolve it. */
  sign_in_with: (slot: SlotId, token: string) => void;
  /** Make an already-filled slot active and resolve it. */
  switch_to: (slot: SlotId) => void;
  /** Forget the active token. What a 401 does, and what the header offers. */
  sign_out: () => void;
  /** Try GET /auth/me again after an error that was not a 401. */
  retry: () => void;
}

export const SessionContext = createContext<Session | null>(null);

export function useSession(): Session {
  const session = useContext(SessionContext);

  if (!session) {
    throw new Error('useSession was called outside <SessionProvider>. Wrap the app in it.');
  }

  return session;
}
```

- [ ] **Step 2: Write the provider**

`web/src/session/SessionProvider.tsx`:

```tsx
/**
 * The only thing in this codebase that calls setAuthToken.
 *
 * It holds the bearer token, calls GET /auth/me exactly once per token on
 * boot, and exposes the user (acceptance criterion 2). Screens read the
 * result through useSession and never touch the token themselves -- see
 * /add-screen, "The app shell owns it and calls setAuthToken(token) once. A
 * screen never touches it."
 *
 * What comes back is the caller's participations: which gigs they are on and
 * what role they hold on each. That is the only role information the client
 * has, it arrives per gig rather than globally, and it is resolved
 * server-side from gig_participants. The client never decides a role itself
 * (criterion 3).
 *
 * "Once on boot" means once per token, not once per render: the effect below
 * depends on the token and on an explicit retry, and on nothing else. In
 * development you will see two requests on first load, because StrictMode
 * mounts every component twice on purpose to surface exactly this kind of
 * bug. The AbortController means the first is cancelled rather than racing
 * the second, and a production build mounts once. If you see two requests in
 * a production build, that is a real defect; two in `npm run dev` is not.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

import { api, ApiError, setAuthToken, setOnUnauthorized } from '../api/client.ts';
import {
  clear_active_token,
  get_active_slot,
  get_active_token,
  get_slots,
  set_active_slot,
  set_slot_token,
  type SlotId,
  type TokenSlots,
} from './tokens.ts';
import {
  SessionContext,
  type Session,
  type SessionState,
  type SessionUser,
} from './useSession.ts';

export function SessionProvider({ children }: { children: ReactNode }) {
  // Read once on mount rather than on every render: sessionStorage is
  // synchronous and cheap, but a render-time read makes the first paint
  // depend on storage being available, and it can refuse.
  const [slots, setSlots] = useState<TokenSlots>(() => get_slots());
  const [active_slot, setActiveSlotState] = useState<SlotId | null>(() => get_active_slot());
  const [token, setToken] = useState<string | null>(() => get_active_token());

  const [state, setState] = useState<SessionState>(() =>
    get_active_token() ? 'loading' : 'no_token',
  );
  const [me, setMe] = useState<SessionUser | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [retry_key, setRetryKey] = useState(0);

  const forget = useCallback(() => {
    clear_active_token();
    setAuthToken(null);
    setSlots(get_slots());
    setActiveSlotState(null);
    setToken(null);
    setMe(null);
    setError(null);
    setState('no_token');
  }, []);

  // A 401 from any request in the app, not just this one. `forget` is
  // useCallback(..., []) over module-level imports and state setters, so its
  // identity never changes and it can be registered directly — an earlier
  // draft of this plan wrapped it in a ref, which bought nothing and wrote to
  // .current during render. Clearing on unmount stops a dead provider from
  // being called.
  useEffect(() => {
    setOnUnauthorized(forget);
    return () => setOnUnauthorized(null);
  }, [forget]);

  // One call per token. `token` and `retry_key` are the only things that
  // should cause another: not a re-render, not a route change.
  useEffect(() => {
    setAuthToken(token);

    if (!token) {
      setState('no_token');
      setMe(null);
      setError(null);
      return;
    }

    const controller = new AbortController();

    setState('loading');
    setError(null);

    api
      .get('/auth/me', { signal: controller.signal })
      .then((user) => {
        setMe(user);
        setState('ready');
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === 'AbortError') return;

        // A 401 has already been handled: the client fired onUnauthorized
        // before throwing, so `forget` has run and the state is no_token.
        // Rendering an error over the top of that would be wrong -- the
        // token entry state IS the answer to a 401.
        if (cause instanceof ApiError && cause.status === 401) return;

        setError(
          cause instanceof ApiError
            ? cause
            : new ApiError(0, null, 'Something went wrong signing you in.'),
        );
        setState('error');
      });

    return () => controller.abort();
  }, [token, retry_key]);

  const sign_in_with = useCallback((slot: SlotId, value: string) => {
    set_slot_token(slot, value);
    set_active_slot(slot);
    setSlots(get_slots());
    setActiveSlotState(slot);
    setToken(get_active_token());
  }, []);

  const switch_to = useCallback((slot: SlotId) => {
    set_active_slot(slot);
    setActiveSlotState(slot);
    setToken(get_active_token());
  }, []);

  const retry = useCallback(() => setRetryKey((key) => key + 1), []);

  const value = useMemo<Session>(
    () => ({
      state,
      me,
      error,
      slots,
      active_slot,
      sign_in_with,
      switch_to,
      sign_out: forget,
      retry,
    }),
    [state, me, error, slots, active_slot, sign_in_with, switch_to, forget, retry],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
```

- [ ] **Step 3: Type-check**

Run from `web/`: `npx tsc -b`
Expected: no errors. If `api.get('/auth/me')` does not type, the contract or `schema.ts` is
the problem, not this file -- regenerate with `npm run gen:types` and look again.

- [ ] **Step 4: Commit**

```bash
git add web/src/session/useSession.ts web/src/session/SessionProvider.tsx
git commit -m "feat(web): token context, resolving one token through GET /auth/me (CAP-5)"
```

---

## Task 5: `TokenGate` -- token entry, and the switcher

**Files:**
- Create: `web/src/session/TokenGate.tsx`
- Create: `web/src/session/TokenGate.module.css`

**Interfaces:**
- Consumes: `useSession` from `./useSession.ts`; `SLOT_IDS`, `SLOT_LABEL`, `SlotId` from
  `./tokens.ts`; `Button`, `Chip`, `Card`, `ErrorNotice` from `../components/index.ts`.
- Produces: `function TokenGate({ mode, on_done }: TokenGateProps)`, where
  `type TokenGateMode = 'screen' | 'sheet'`.

- [ ] **Step 1: Write the component**

```tsx
/**
 * Getting a seeded token into the app, and swapping which one is in use.
 *
 * There is no login screen in this MVP (ADR #15). Three Sanctum tokens are
 * seeded server-side, one per role, and the seeder writes them to
 * ~/reflection-diary-tokens.txt. This is where they get pasted.
 *
 * One component, two modes, which is the pattern /add-screen prescribes for
 * the student and assessor steppers rather than two builds:
 *
 *   screen   nothing usable is stored. Full page, the token entry state.
 *            This is where a 401 lands (criterion 5)
 *   sheet    inside the header's BottomSheet. The switcher (criterion 4)
 *
 * The slot labels are hints about which token to paste, matching the names
 * in the tokens file. They are NOT roles and nothing reads them as roles;
 * see the comment at the top of tokens.ts. What a user may do comes from
 * GET /auth/me, per gig.
 */
import { useState } from 'react';

import { Button, Card, Chip, ErrorNotice } from '../components/index.ts';
import { SLOT_IDS, SLOT_LABEL, type SlotId } from './tokens.ts';
import { useSession } from './useSession.ts';
import styles from './TokenGate.module.css';

export type TokenGateMode = 'screen' | 'sheet';

export interface TokenGateProps {
  mode: TokenGateMode;
  /** Called after a slot is chosen, so the sheet can close itself. */
  on_done?: () => void;
}

export function TokenGate({ mode, on_done }: TokenGateProps) {
  const { slots, active_slot, state, error, sign_in_with, switch_to, retry } = useSession();
  const [pasting_into, setPastingInto] = useState<SlotId | null>(null);
  const [draft, setDraft] = useState('');

  function choose(slot: SlotId) {
    if (slots[slot]) {
      switch_to(slot);
      on_done?.();
      return;
    }
    setPastingInto(slot);
    setDraft('');
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!pasting_into || draft.trim() === '') return;

    sign_in_with(pasting_into, draft);
    setPastingInto(null);
    setDraft('');
    on_done?.();
  }

  const body = (
    <div className={styles.gate}>
      <p className={styles.intro}>
        {mode === 'screen'
          ? 'This demo has no login screen. Paste one of the three seeded tokens to begin.'
          : 'Act as a different seeded user.'}
      </p>

      <div className={styles.slots}>
        {SLOT_IDS.map((slot) => (
          <Chip key={slot} selected={slot === active_slot} on_click={() => choose(slot)}>
            {SLOT_LABEL[slot]}
            {slots[slot] ? '' : ' +'}
          </Chip>
        ))}
      </div>

      {pasting_into && (
        <form className={styles.form} onSubmit={submit}>
          <label className={styles.label} htmlFor="token-input">
            Paste the {SLOT_LABEL[pasting_into].toLowerCase()} token
          </label>
          <input
            id="token-input"
            className={styles.input}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            autoComplete="off"
            spellCheck={false}
            placeholder="1|xxxxxxxx..."
          />
          <Button type="submit" disabled={draft.trim() === ''}>
            Use this token
          </Button>
        </form>
      )}

      {state === 'error' && error && <ErrorNotice error={error} on_retry={retry} />}

      <p className={styles.hint}>
        The seeder writes these to <code>~/reflection-diary-tokens.txt</code>. They are kept
        for this browser tab only.
      </p>
    </div>
  );

  // In sheet mode the BottomSheet is already a surface; a Card inside it
  // would be a box in a box.
  return mode === 'screen' ? (
    <main className={styles.screen}>
      <h1 className={styles.heading}>Reflection Diary</h1>
      <Card>{body}</Card>
    </main>
  ) : (
    body
  );
}
```

- [ ] **Step 2: Write the styles**

`web/src/session/TokenGate.module.css`. Every value is a token; there is no raw hex and no
pixel value, and `scripts/check-tokens.sh` fails the build on either.

```css
.screen {
  max-width: 32rem;
  margin: 0 auto;
  padding: var(--space-24) var(--space-16);
}

.heading {
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-bold);
  line-height: var(--line-height-tight);
  margin: 0 0 var(--space-16);
  color: var(--color-text);
}

.gate {
  display: flex;
  flex-direction: column;
  gap: var(--space-16);
}

.intro {
  margin: 0;
  font-size: var(--font-size-base);
  line-height: var(--line-height-normal);
  color: var(--color-text);
}

.slots {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-8);
}

.form {
  display: flex;
  flex-direction: column;
  gap: var(--space-8);
}

.label {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--color-text);
}

.input {
  width: 100%;
  box-sizing: border-box;
  padding: var(--space-12);
  font-family: var(--font-family-base);
  font-size: var(--font-size-base);
  color: var(--color-text);
  background: var(--color-surface);
  border: var(--border-width-sm) solid var(--color-border);
  border-radius: var(--radius-md);
}

.input:focus-visible {
  outline: var(--border-width-sm) solid var(--color-focus-ring);
  outline-offset: var(--space-4);
}

.hint {
  margin: 0;
  font-size: var(--font-size-xs);
  line-height: var(--line-height-normal);
  color: var(--color-text-muted);
}
```

- [ ] **Step 3: Type-check and lint**

Run from `web/`: `npx tsc -b && npm run lint`
Expected: no errors.

- [ ] **Step 4: Confirm tokens**

Run from the repository root: `bash scripts/check-tokens.sh`
Expected: passes. **Invoked via `bash` on purpose**: the file is committed mode `100644`,
not `100755`, so running it directly fails with "Permission denied". That is a pre-existing
bug in the repository, not something this ticket introduces and not something it fixes --
it is recorded as a follow-up below.

- [ ] **Step 5: Commit**

```bash
git add web/src/session/TokenGate.tsx web/src/session/TokenGate.module.css
git commit -m "feat(web): token entry and the seeded-token switcher (CAP-5)"
```

---

## Task 6: `AppShell` -- header, role-aware nav, outlet

**Files:**
- Create: `web/src/app/AppShell.tsx`
- Create: `web/src/app/AppShell.module.css`

**Interfaces:**
- Consumes: `useSession`; `TokenGate`; `BottomSheet`, `Button`, `Skeleton`, `SkeletonGroup`,
  `ErrorNotice` from `../components/index.ts`; `getStoredTheme`, `setTheme`, `type Theme`
  from `../theme.ts`; `NavLink`, `Outlet` from `react-router`.
- Produces: `function AppShell()`, and `function nav_items_for(me: SessionUser): NavItem[]`
  exported for the verification script and for CAP-7 onward to reuse rather than re-derive.

- [ ] **Step 1: Write the component**

```tsx
/**
 * The frame every screen mounts into.
 *
 * Header, navigation, and an <Outlet/> the router fills. The shell has the
 * same four states every screen in this project ships, because GET /auth/me
 * can be any of them:
 *
 *   no_token  TokenGate full screen. Also where a 401 lands
 *   loading   skeletons shaped like the header, not a spinner
 *   error     ErrorNotice with a retry
 *   ready     the app
 *
 * Navigation is derived from participations and nothing else (criterion 3).
 * The same person can be a student on one gig and an assessor on another, so
 * role is per gig and never global. Hiding a nav item is a convenience for
 * the person using it; the 403 from the API is the rule, and every route
 * below stays reachable by typing its URL. That is deliberate: a client-side
 * role check is not a security boundary and must never be mistaken for one.
 * See docs/Frontend-and-Backend.md, "Roles never cross".
 *
 * The theme toggle here came from App.tsx, which said to move it into the
 * real shell when this ticket landed. This is that.
 */
import { useState } from 'react';
import { NavLink, Outlet } from 'react-router';

import {
  BottomSheet,
  Button,
  ErrorNotice,
  Skeleton,
  SkeletonGroup,
} from '../components/index.ts';
import { getStoredTheme, setTheme, type Theme } from '../theme.ts';
import { TokenGate } from '../session/TokenGate.tsx';
import { useSession, type SessionUser } from '../session/useSession.ts';
import styles from './AppShell.module.css';

export interface NavItem {
  to: string;
  label: string;
}

/**
 * What this user can see, from what the server said they are.
 *
 * Exported rather than kept private so CAP-7 onward reuse this one
 * derivation instead of each re-deriving it slightly differently, and so it
 * can be read on its own. ADR #17 maps the educator to the supervisor role,
 * which is why frameworks sit there.
 */
export function nav_items_for(me: SessionUser): NavItem[] {
  const roles = new Set(me.participations.map((participation) => participation.role));

  const items: NavItem[] = [];

  if (roles.has('student')) {
    items.push({ to: '/', label: 'Diary' });
  }

  if (roles.has('assessor') || roles.has('supervisor') || roles.has('employer')) {
    items.push({ to: '/review-queue', label: 'Review queue' });
  }

  if (roles.has('supervisor')) {
    items.push({ to: '/frameworks', label: 'Frameworks' });
  }

  return items;
}

function initial_theme(): Theme {
  const stored = getStoredTheme();
  if (stored) return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function AppShell() {
  const { state, me, error, retry, sign_out } = useSession();
  const [theme, setThemeState] = useState<Theme>(initial_theme);
  const [switcher_open, setSwitcherOpen] = useState(false);

  function toggle_theme() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    setThemeState(next);
  }

  if (state === 'no_token') {
    return <TokenGate mode="screen" />;
  }

  if (state === 'loading') {
    return (
      <div className={styles.shell}>
        <header className={styles.header}>
          <SkeletonGroup label="Signing you in">
            <Skeleton variant="text" width="40%" />
            <Skeleton variant="text" lines={1} width="70%" />
          </SkeletonGroup>
        </header>
      </div>
    );
  }

  if (state === 'error' && error) {
    return (
      <main className={styles.centred}>
        <ErrorNotice error={error} on_retry={retry} />
        <Button variant="secondary" full_width={false} on_click={sign_out}>
          Use a different token
        </Button>
      </main>
    );
  }

  if (!me) return null;

  const items = nav_items_for(me);
  const role_summary = [...new Set(me.participations.map((p) => p.role))].join(', ');

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.identity}>
          <button
            type="button"
            className={styles.who}
            onClick={() => setSwitcherOpen(true)}
            aria-haspopup="dialog"
          >
            <span className={styles.name}>{me.display_name}</span>
            <span className={styles.roles}>{role_summary || 'no gigs'}</span>
          </button>

          <button
            type="button"
            className={styles.theme}
            onClick={toggle_theme}
            aria-pressed={theme === 'dark'}
          >
            {theme === 'dark' ? 'Light' : 'Dark'}
          </button>
        </div>

        <nav className={styles.nav} aria-label="Main">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                isActive ? `${styles.link} ${styles.active}` : styles.link
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className={styles.main}>
        <Outlet />
      </main>

      <BottomSheet
        open={switcher_open}
        title="Switch user"
        onClose={() => setSwitcherOpen(false)}
      >
        <TokenGate mode="sheet" on_done={() => setSwitcherOpen(false)} />
      </BottomSheet>
    </div>
  );
}
```

**Note the `onClose` above, in camelCase.** Every other component in this repository takes
snake_case props (`on_click`, `on_retry`, `full_width`), and `BottomSheet` is the one
exception: it shipped in PR #16 as `{ open, onClose, title, children }` and that is what its
interface declares today. Verified against
`web/src/components/BottomSheet/BottomSheet.tsx:5-10` rather than assumed. Match the
component; `on_close` will not compile, and renaming the component's prop is CAP-4's
business, not this ticket's.

- [ ] **Step 2: Write the styles**

```css
.shell {
  min-height: 100vh;
  background: var(--color-bg);
}

.header {
  display: flex;
  flex-direction: column;
  gap: var(--space-12);
  padding: var(--space-16);
  background: var(--color-surface);
  border-bottom: var(--border-width-sm) solid var(--color-border);
}

.identity {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-8);
}

.who {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-4);
  padding: var(--space-8);
  background: none;
  border: none;
  border-radius: var(--radius-md);
  cursor: pointer;
  font-family: var(--font-family-base);
  text-align: left;
}

.who:hover {
  background: var(--color-surface-alt);
}

.who:focus-visible,
.theme:focus-visible,
.link:focus-visible {
  outline: var(--border-width-sm) solid var(--color-focus-ring);
  outline-offset: var(--space-4);
}

.name {
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-medium);
  color: var(--color-text);
}

.roles {
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
}

.theme {
  padding: var(--space-8) var(--space-12);
  font-family: var(--font-family-base);
  font-size: var(--font-size-sm);
  color: var(--color-text);
  background: var(--color-surface-alt);
  border: var(--border-width-sm) solid var(--color-border);
  border-radius: var(--radius-full);
  cursor: pointer;
}

.nav {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-8);
}

.link {
  padding: var(--space-8) var(--space-12);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-muted);
  text-decoration: none;
  border-radius: var(--radius-full);
}

.link:hover {
  background: var(--color-surface-alt);
  color: var(--color-text);
}

.active {
  background: var(--color-primary);
  color: var(--color-text-inverse);
}

.main {
  padding: var(--space-16);
}

.centred {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-16);
  max-width: 32rem;
  margin: 0 auto;
  padding: var(--space-24) var(--space-16);
}
```

- [ ] **Step 3: Type-check, lint and tokens**

Run from `web/`: `npx tsc -b && npm run lint`
Run from the repository root: `bash scripts/check-tokens.sh`
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add web/src/app/AppShell.tsx web/src/app/AppShell.module.css
git commit -m "feat(web): app shell with nav derived from /auth/me participations (CAP-5)"
```

---

## Task 7: The route table and its placeholders

**Files:**
- Create: `web/src/app/Placeholder.tsx`
- Create: `web/src/app/Placeholder.module.css`
- Create: `web/src/app/routes.tsx`
- Modify: `web/src/App.tsx` (replaced wholesale)

**Interfaces:**
- Consumes: `AppShell` from `./AppShell.tsx`; `SessionProvider` from
  `../session/SessionProvider.tsx`; `BrowserRouter`, `Routes`, `Route` from `react-router`.
- Produces: `function Placeholder({ screen, ticket }: PlaceholderProps)`;
  `function AppRoutes()`; default export `App`.

- [ ] **Step 1: Write the placeholder**

```tsx
/**
 * What a route renders until its ticket is built.
 *
 * Names the screen and the ticket that will replace it, so an unbuilt route
 * is obviously unbuilt rather than looking like a broken one. Every one of
 * these is deleted by the ticket named on it.
 */
import styles from './Placeholder.module.css';

export interface PlaceholderProps {
  screen: string;
  ticket: string;
}

export function Placeholder({ screen, ticket }: PlaceholderProps) {
  return (
    <section className={styles.placeholder}>
      <h1 className={styles.heading}>{screen}</h1>
      <p className={styles.note}>Not built yet. {ticket} replaces this.</p>
    </section>
  );
}
```

```css
.placeholder {
  padding: var(--space-24) 0;
}

.heading {
  margin: 0 0 var(--space-8);
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-bold);
  line-height: var(--line-height-tight);
  color: var(--color-text);
}

.note {
  margin: 0;
  font-size: var(--font-size-sm);
  color: var(--color-text-muted);
}
```

- [ ] **Step 2: Write the route table**

```tsx
/**
 * Every screen in docs/Stack-and-Build-Scope.md 4.3 has a route here, each
 * rendering a placeholder until its own ticket lands (criterion 1).
 *
 * Nested per ADR #27 so gig-then-sprint-then-entry stays linkable and
 * back-button-correct: an assessor working a queue moves in and out of
 * entries constantly and shares "look at this one" with a supervisor.
 * Data loaders are deliberately NOT used (ADR #27) -- fetching lives in the
 * typed API client and each screen owns its own.
 *
 * Two of the twelve screens are not here. The history sheet (CAP-14) and the
 * export sheet (CAP-18) are described in 4.3 as sheets, and BottomSheet
 * exists for exactly that: they open over the diary rather than navigating
 * away from it. If either decides it wants a linkable URL, it is one line in
 * this file.
 *
 * Every route is reachable by URL regardless of what the nav shows. That is
 * on purpose. Hiding a nav item is a convenience; the 403 is the rule.
 */
import { Route, Routes } from 'react-router';

import { AppShell } from './AppShell.tsx';
import { Placeholder } from './Placeholder.tsx';

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Placeholder screen="Diary" ticket="CAP-7" />} />

        <Route
          path="gigs/:gig_id"
          element={<Placeholder screen="Gig detail" ticket="CAP-8" />}
        />

        <Route
          path="entries/:entry_id"
          element={<Placeholder screen="Entry stepper" ticket="CAP-11" />}
        />

        <Route
          path="reflections/:reflection_id/submitted"
          element={<Placeholder screen="Submitted" ticket="CAP-12" />}
        />

        {/*
         * CAP-10 is BUILT. web/src/screens/ReviewQueue.tsx takes no props,
         * fetches through the typed client and never touches the token, so
         * mounting it for real is exactly this:
         *
         *   import { ReviewQueue } from '../screens/ReviewQueue.tsx';
         *   <Route path="review-queue" element={<ReviewQueue />} />
         *
         * That swap, plus deleting web/review-queue.html and
         * web/src/review-queue-dev.tsx and dropping the reviewQueueDev entry
         * from web/vite.config.ts, is the whole of CAP-10's follow-up. It is
         * deliberately left undone here: CAP-5 is CAP-5, and those files are
         * Tony's to remove.
         */}
        <Route
          path="review-queue"
          element={<Placeholder screen="Review queue" ticket="CAP-10 follow-up" />}
        />

        <Route
          path="review-queue/entries/:entry_id"
          element={<Placeholder screen="Assessor stepper" ticket="CAP-13" />}
        />

        <Route
          path="frameworks"
          element={<Placeholder screen="Select framework" ticket="CAP-15" />}
        />

        <Route
          path="frameworks/:framework_id/edit"
          element={<Placeholder screen="Edit framework" ticket="CAP-16" />}
        />

        <Route path="*" element={<Placeholder screen="Not found" ticket="No ticket" />} />
      </Route>
    </Routes>
  );
}
```

- [ ] **Step 3: Replace `App.tsx`**

The existing file renders the word `test` and a temporary theme toggle, and its own header
says to move that toggle into the real shell when this ticket lands. Task 6 did. Replace
the whole file:

```tsx
/**
 * The app: a router, wrapped in the session that decides who is using it.
 *
 * SessionProvider sits outside BrowserRouter because the session is not
 * route-dependent -- a 401 on any route resolves the same way, and the token
 * entry state is not a route, it is what the shell renders instead of one.
 */
import { BrowserRouter } from 'react-router';

import { AppRoutes } from './app/routes.tsx';
import { SessionProvider } from './session/SessionProvider.tsx';

export default function App() {
  return (
    <SessionProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </SessionProvider>
  );
}
```

`web/src/main.tsx` needs no change: it already calls `initTheme()` before render and mounts
`<App/>` inside `<StrictMode>`.

- [ ] **Step 4: Build**

Run from `web/`: `npm run build`
Expected: clean. `tsc -b` runs first, so a bad route element fails here.

- [ ] **Step 5: Look at it**

Run from the repository root, in two terminals: `./run api` then `./run web`.

Open http://localhost:5173 and check, in this order:

1. The token entry screen appears, since nothing is stored yet.
2. Paste Jane's token from `~/reflection-diary-tokens.txt` into the Student slot.
   Jane is the student to develop against: she is on both gigs, so she is the only user who
   exercises both rubrics (`/add-screen`).
3. The header shows `Jane N` and the nav shows **Diary** only.
4. Paste Sam's token into the Assessor slot and switch to it. The nav shows
   **Review queue** and not Diary. Sam is an assessor on the La Trobe gig only.
5. Paste Dr Lee's token into the Supervisor slot and switch. **Review queue** and
   **Frameworks** both appear.
6. Type `/frameworks` in the address bar while acting as Jane. **The route still renders.**
   That is correct and is the point of criterion 3 -- the nav is a convenience, the API's
   403 is the rule.
7. Reload the page. The session survives, because the token is in `sessionStorage`.
8. Open a second tab at the same URL. **It asks for a token**, independently of the first.
   That is the `sessionStorage` decision working as intended.
9. Back and forward buttons move between routes correctly.
10. At 390px and at 1280px, in both themes.

- [ ] **Step 6: Commit**

```bash
git add web/src/app web/src/App.tsx
git commit -m "feat(web): route per screen, each rendering a placeholder (CAP-5)"
```

---

## Task 8: The check, since `web/` has no test runner

**Files:**
- Create: `scripts/verify-app-shell.sh`
- Modify: `run`

CLAUDE.md: "Anything needing a running server, or checking something a unit test cannot
reach, is a script in `scripts/` wired into `./run`. Never leave a check in a scratchpad, a
home directory or a chat message." `web/` has no test runner and choosing one is an ADR and
a team decision, not something to add in passing.

Three things worth checking, none of which `tsc` can catch:

- [ ] **Step 1: Write the script**

```bash
#!/usr/bin/env bash
#
# Proves the app shell's three invariants still hold.
#
#   ./run verify-shell               from the repository root
#   ./scripts/verify-app-shell.sh    the same thing
#
# web/ has no test runner (CLAUDE.md), so this is where a frontend check
# lives. Its sibling scripts/verify-client.sh covers the API client itself;
# this covers the shell built on top of it, and they do not overlap.
#
# 1. One owner for the token. If anything other than the session provider
#    calls setAuthToken, the rule that "the app shell owns it and calls
#    setAuthToken once" has quietly stopped being true, and no compiler will
#    say so.
# 2. Every screen has a route. A screen in the scope document with no route
#    is a screen nobody can reach.
# 3. GET /auth/me really returns what the nav is built from. Needs a server;
#    skips itself loudly rather than failing when there is not one.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

BASE="${BASE:-http://127.0.0.1:8000/api/v1}"
TOKENS="${TOKENS:-$HOME/reflection-diary-tokens.txt}"

if [ -t 1 ]; then
    blu=$'\033[1;34m'; grn=$'\033[1;32m'; red=$'\033[1;31m'
    ylw=$'\033[1;33m'; dim=$'\033[2m';    off=$'\033[0m'
else
    blu=''; grn=''; red=''; ylw=''; dim=''; off=''
fi

pass=0; fail=0; skip=0
say()  { printf '\n%s==>%s %s\n' "$blu" "$off" "$1"; }
ok()   { pass=$((pass+1)); printf '  %sok%s   %-54s %s\n' "$grn" "$off" "$1" "${2:-}"; }
bad()  { fail=$((fail+1)); printf '  %sFAIL%s %-54s %s\n' "$red" "$off" "$1" "${2:-}"; }
meh()  { skip=$((skip+1)); printf '  %sskip%s %-54s %s\n' "$ylw" "$off" "$1" "${2:-}"; }

# --------------------------------------------------------------------------
say "1. One owner for the bearer token"

callers="$(grep -rln 'setAuthToken' web/src --include='*.ts' --include='*.tsx' \
    | grep -v 'web/src/api/client.ts' \
    | grep -v 'web/src/review-queue-dev.tsx' \
    | sort)"

expected='web/src/session/SessionProvider.tsx'

if [ "$callers" = "$expected" ]; then
    ok "only SessionProvider calls setAuthToken"
else
    bad "only SessionProvider calls setAuthToken" "found: ${callers:-nothing}"
fi

# review-queue-dev.tsx is excluded above on purpose: it is CAP-10's
# throwaway dev mount, it predates this shell, and deleting it is CAP-10's
# follow-up rather than CAP-5's business. When that follow-up lands, delete
# the exclusion with the file.

# --------------------------------------------------------------------------
say "2. Every screen has a route"

for route in \
    'index' \
    'gigs/:gig_id' \
    'entries/:entry_id' \
    'reflections/:reflection_id/submitted' \
    'review-queue' \
    'review-queue/entries/:entry_id' \
    'frameworks' \
    'frameworks/:framework_id/edit'
do
    if grep -q "$route" web/src/app/routes.tsx; then
        ok "route $route"
    else
        bad "route $route" "missing from web/src/app/routes.tsx"
    fi
done

# --------------------------------------------------------------------------
say "3. GET /auth/me returns what the nav is built from"

token=''
if [ -f "$TOKENS" ]; then
    token="$(grep -oE '[0-9]+\|[A-Za-z0-9]+' "$TOKENS" | head -1)"
fi

if [ -z "$token" ]; then
    meh "live check" "$dim""no token in $TOKENS$off"
elif ! curl -fsS -o /dev/null "$BASE/auth/me" 2>/dev/null && [ "$?" != "22" ]; then
    meh "live check" "$dim""nothing serving on $BASE. Start it with ./run api$off"
else
    body="$(curl -fsS -H "Authorization: Bearer $token" -H 'Accept: application/json' \
        "$BASE/auth/me" 2>/dev/null)"

    if [ -z "$body" ]; then
        bad "GET /auth/me" "no body"
    else
        for field in '"id"' '"display_name"' '"participations"'; do
            case "$body" in
                *"$field"*) ok "/auth/me carries $field" ;;
                *)          bad "/auth/me carries $field" "nav cannot be built without it" ;;
            esac
        done

        # A participation is what nav_items_for reads. Without gig_id and
        # role on each one, criterion 3 has nothing to derive from.
        for field in '"gig_id"' '"gig_title"' '"role"'; do
            case "$body" in
                *"$field"*) ok "a participation carries $field" ;;
                *)          bad "a participation carries $field" "the nav reads this" ;;
            esac
        done
    fi
fi

# --------------------------------------------------------------------------
printf '\n%s%s passed%s' "$grn" "$pass" "$off"
[ "$skip" -gt 0 ] && printf ', %s%s skipped%s' "$ylw" "$skip" "$off"
[ "$fail" -gt 0 ] && printf ', %s%s FAILED%s' "$red" "$fail" "$off"
printf '\n\n'

exit $([ "$fail" -eq 0 ] && echo 0 || echo 1)
```

- [ ] **Step 2: Make it executable**

```bash
chmod +x scripts/verify-app-shell.sh
```

- [ ] **Step 3: Wire it into `./run`**

In `run`, directly after the existing `verify)` case (which ends
`step ./scripts/verify-client.sh "${2:-}" ;;`), add:

```bash
    # The app shell's own invariants: one owner for the token, a route per
    # screen, and /auth/me really carrying what the nav is built from. The
    # live third needs a server; it skips itself rather than failing.
    verify-shell) step ./scripts/verify-app-shell.sh ;;
```

And in the `help` heredoc, after the `./run verify` line:

```
  ${GREEN}./run verify-shell${RESET}  the app shell: token ownership, routes, /auth/me
```

- [ ] **Step 4: Run it and read the output**

Run from the repository root: `./run verify-shell`

Expected: section 1 and section 2 pass. Section 3 passes with the backend up and skips
loudly without it. **Read what it prints.** A script that was never run is not a check, and
"should pass" is not a result.

- [ ] **Step 5: Prove it can fail**

Temporarily rename a route in `web/src/app/routes.tsx` -- change `frameworks` to
`frameworkz` -- and run `./run verify-shell` again. Expect a FAIL on that route. Undo the
change. A check that has never been seen to fail proves nothing about a clean run.

- [ ] **Step 6: Commit**

```bash
git add scripts/verify-app-shell.sh run
git commit -m "test(web): verify the shell's token ownership and route table (CAP-5)"
```

---

## Task 9: Bring the documentation up to date

**Files:**
- Modify: `docs/Stack-and-Build-Scope.md` (§4.3, line 152)
- Modify: `web/README.md`

Only the two lines this ticket makes false. `README.md`'s status table is also stale --
it still says the frontend is "Scaffold only, renders the word `test`" -- but that is
Tony's item 3.1 in `docs/superpowers/plans/2026-09-08-tony-sequencing.md`, along with three
other unticked lines in the scope document that CAP-1, CAP-3 and CAP-10 made false. Fixing
his rows here would collide with his branch. Recorded as a follow-up below instead.

- [ ] **Step 1: Tick the scope document**

`docs/Stack-and-Build-Scope.md` line 152, change:

```
- [ ] App shell: router, token context, role-aware nav from `/auth/me`
```

to:

```
- [x] App shell: router, token context, role-aware nav from `/auth/me`. React Router 8
      (ADR #27), a route per screen with placeholders until each ticket lands, and the
      three seeded tokens held per browser tab. `./run verify-shell` checks it
```

- [ ] **Step 2: Update `web/README.md`**

In "What to build, in order", change item 4 from:

```
4. App shell: router, token context, role-aware nav from `GET /auth/me`.
```

to:

```
4. ~~App shell: router, token context, role-aware nav from `GET /auth/me`.~~ Done.
   See "Getting a token in" below.
```

Then, in "The API client", replace the paragraph beginning "The bearer token lives in the
module" with:

```markdown
The bearer token lives in the module, and **the app shell is the only thing that sets it**.
`web/src/session/SessionProvider.tsx` calls `setAuthToken` once per token and nothing else
should; `./run verify-shell` checks that.

## Getting a token in

There is no login screen (ADR #15). On first load the app asks for one of the three seeded
tokens, which `php artisan db:seed` writes to `~/reflection-diary-tokens.txt`. Paste one
into the matching slot and you are that user; the header switches between whichever slots
you have filled.

Tokens are held in `sessionStorage`, so each browser tab is its own identity and a reload
keeps you signed in. Two tabs can be two different people at once, which is how you look at
a student's reflection and an assessor's queue side by side.

A 401 from any request clears the token and returns to that screen.

`VITE_API_TOKEN` in `web/.env` still seeds the client directly and is a development
convenience with no production meaning. It predates the shell and is not how the running
app gets its token.
```

- [ ] **Step 3: Check the docs guard is satisfied**

Run from the repository root: `python3 scripts/guard-docs-location.test.py`
Expected: passes. Both files edited here already exist in permitted locations; this
confirms nothing new landed somewhere it should not.

- [ ] **Step 4: Commit**

```bash
git add docs/Stack-and-Build-Scope.md web/README.md
git commit -m "docs: the app shell exists, and how a token gets in (CAP-5)"
```

---

## Finishing

- [ ] **Run everything CI runs, and read it**

```bash
./run check
```

Expected: contract lint, both guards, Pint, 110 backend feature tests, oxlint, Prettier,
`check-tokens.sh`, `check-contrast.mjs` and the frontend build all pass.

- [ ] **Run the two frontend checks**

```bash
./run verify          # needs ./run api for its live third
./run verify-shell
```

- [ ] **Look at it one more time**, at 390px and 1280px, in both themes, as all three
  seeded users, per Task 7 Step 5.

- [ ] **Open the pull request**

```bash
git push -u origin feat/CAP-5-app-shell
gh pr create --base dev --title "feat(web): app shell — router, token context, role-aware navigation (CAP-5)"
```

Request a reviewer. CONTRIBUTING sets `required_approving_review_count` to 0, so no
approval is required to merge and self-merging is allowed since 2026-08-19 -- but request
one anyway: "a PR with no reviewer requested notifies no one, which is how four of them
once sat for two weeks looking ignored when they had simply never been announced."

**Say the F1 thing out loud.** Not in the PR description alone. This branch is what makes
`VITE_API_TOKEN` reachable in a production bundle, and Tony's one-line fix should land
close behind it.

## Follow-ups, not in this plan

Recorded here rather than fixed on this branch, per the working agreement that a ticket's
branch carries that ticket.

- **F1, `web/src/api/client.ts:141`.** A seeded bearer token compiled into a production
  bundle. High, and armed by this branch. Tony, CAP-24. `docs/Security-Review.md`.
- **CAP-10's follow-up.** Delete `web/review-queue.html` and `web/src/review-queue-dev.tsx`,
  drop the `reviewQueueDev` entry from `web/vite.config.ts`, and swap the `/review-queue`
  placeholder for `<ReviewQueue />`. Tony, about an hour. Task 7 leaves a comment naming
  exactly this, and Task 8's script has an exclusion to delete alongside it.
- **`README.md`'s status table** still reads "Frontend: Scaffold only. `web/` renders the
  word `test`. No screens built." Also `docs/Stack-and-Build-Scope.md` §4.3 lines 143 and
  145 (CAP-1 and CAP-3) and 169 (CAP-10), and §4.4's policies row after CAP-19. Tony's
  item 3.1.
- **Whether the token-storage choice deserves an ADR.** ADR #15 decided there is no login
  screen; it did not decide where a token is kept or for how long. This plan makes that
  call and writes the reasoning into `tokens.ts`, which is enough to reverse it cheaply.
  If the team wants it recorded properly, that is `/write-adr` and about fifteen minutes.
- **A test runner for `web/`.** Every check in this plan is a shell script or a person
  looking at a screen, because there is nothing else to write one in. CLAUDE.md is explicit
  that choosing one is an ADR and a team decision, not something to add in passing.
